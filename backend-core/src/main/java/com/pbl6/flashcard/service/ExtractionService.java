package com.pbl6.flashcard.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pbl6.flashcard.dto.deck.DeckRequest;
import com.pbl6.flashcard.dto.deck.DeckResponse;
import com.pbl6.flashcard.dto.extraction.ExtractionItemResponse;
import com.pbl6.flashcard.dto.extraction.ExtractionJobResponse;
import com.pbl6.flashcard.dto.extraction.ExtractionOptions;
import com.pbl6.flashcard.dto.extraction.ExtractionRequests.CreateDecks;
import com.pbl6.flashcard.dto.extraction.ExtractionRequests.DeckSpec;
import com.pbl6.flashcard.dto.extraction.ExtractionRequests.ItemPatch;
import com.pbl6.flashcard.model.ExtractionItem;
import com.pbl6.flashcard.model.ExtractionJob;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.repository.ExtractionItemRepository;
import com.pbl6.flashcard.repository.ExtractionJobRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.RejectedExecutionException;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Nghiệp vụ bóc tách tài liệu: tạo job, poll, sửa văn bản, duyệt item, tạo bộ thẻ (qua {@link DeckService#create}).
 * Job chỉ chủ sở hữu thấy; người khác = 404.
 */
@Service
public class ExtractionService {

    private static final Logger log = LoggerFactory.getLogger(ExtractionService.class);
    private static final String JOB_NOT_FOUND = "Không tìm thấy lượt bóc tách.";
    private static final int MAX_TEXT_CHARS = 50_000;
    private static final long MAX_FILE_BYTES = 15L * 1024 * 1024;

    /** Đuôi file -> source_type. Kiểm tra thêm magic bytes ở {@link #sniff}. */
    private static final Map<String, String> EXT_TYPES = Map.of(
            "txt", "txt", "md", "txt", "docx", "docx", "pdf", "pdf",
            "png", "image", "jpg", "image", "jpeg", "image", "webp", "image");

    private final ExtractionJobRepository jobs;
    private final ExtractionItemRepository items;
    private final ExtractionWorker worker;
    private final DeckService deckService;
    private final ObjectMapper json;
    private final SettingsService settings;

    public ExtractionService(ExtractionJobRepository jobs, ExtractionItemRepository items, ExtractionWorker worker,
                             DeckService deckService, ObjectMapper json, SettingsService settings) {
        this.jobs = jobs;
        this.items = items;
        this.worker = worker;
        this.deckService = deckService;
        this.json = json;
        this.settings = settings;
    }

    /** Worker sống trong RAM: sau restart mọi job QUEUED/RUNNING không bao giờ chạy tiếp -> báo FAILED rõ ràng. */
    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void failOrphans() {
        int n = jobs.failUnfinished("Máy chủ đã khởi động lại trong lúc xử lý. Hãy chạy lại.", Instant.now());
        if (n > 0) log.warn("Đánh dấu {} job bóc tách dở dang là FAILED sau khi khởi động", n);
    }

    // ---------- tạo job ----------

    /**
     * Không @Transactional: job phải được commit trước khi worker (thread khác) đọc nó.
     * data/filename cho file; text cho văn bản dán. Đúng một trong hai.
     */
    public ExtractionJobResponse create(User user, byte[] data, String filename, String text, String optionsJson) {
        ExtractionOptions options = parseOptions(optionsJson).withDefaults(user.getJlptLevel());
        ExtractionJob job = prepareJob(user, data, filename, text, options, ExtractionJob.PURPOSE_EXTRACTION);
        startJob(job, data, filename, text);
        return ExtractionJobResponse.of(job, false);
    }

    /** Kiểm đầu vào + giới hạn ngày rồi lưu job (chưa chạy). options đã được điền mặc định. */
    ExtractionJob prepareJob(User user, byte[] data, String filename, String text, ExtractionOptions options,
                             String purpose) {
        boolean hasFile = data != null && data.length > 0;
        boolean hasText = text != null && !text.isBlank();
        if (hasFile == hasText) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Gửi một file hoặc một đoạn văn bản.");
        }
        if (hasFile && data.length > MAX_FILE_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "File vượt quá 15 MB.");
        }
        if (hasText && text.length() > MAX_TEXT_CHARS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Văn bản vượt quá 50.000 ký tự.");
        }
        String sourceType = hasFile ? sniff(data, filename) : "text";
        enforceDailyLimit(user);

        ExtractionJob job = new ExtractionJob();
        job.setId(UUID.randomUUID());
        job.setUserId(user.getId());
        job.setSourceType(sourceType);
        job.setSourceName(hasFile ? ExtractionWorker.cut(filename, 255) : null);
        job.setOptions(json.convertValue(options, new TypeReference<Map<String, Object>>() {}));
        job.setPurpose(purpose);
        job.setCreatedAt(Instant.now());
        jobs.save(job);
        return job;
    }

    /** Đẩy job đã lưu sang worker nền. */
    void startJob(ExtractionJob job, byte[] data, String filename, String text) {
        boolean hasFile = data != null && data.length > 0;
        boolean hasText = text != null && !text.isBlank();
        String ocrMode = job.getOptions() != null ? (String) job.getOptions().get("ocrMode") : null;
        dispatch(job, () -> worker.runFromText(job.getId(), hasFile ? data : null, filename,
                hasText ? text : null, ocrMode != null ? ocrMode : "auto"));
    }

    ExtractionOptions parseOptions(String optionsJson) {
        if (optionsJson == null || optionsJson.isBlank()) return ExtractionOptions.empty();
        ExtractionOptions parsed;
        try {
            parsed = json.readValue(optionsJson, ExtractionOptions.class);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tuỳ chọn bóc tách không đúng định dạng JSON.");
        }
        // Validate thủ công vì options là chuỗi JSON trong multipart, không qua @Valid
        Set<jakarta.validation.ConstraintViolation<ExtractionOptions>> violations =
                jakarta.validation.Validation.buildDefaultValidatorFactory().getValidator().validate(parsed);
        if (!violations.isEmpty()) {
            String msg = violations.stream().map(v -> v.getPropertyPath() + ": " + v.getMessage())
                    .sorted().collect(Collectors.joining("; "));
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, msg);
        }
        return parsed;
    }

    /** Hạn mức riêng của tài khoản (admin đặt) ưu tiên; không có thì theo app_settings (đổi được lúc chạy). */
    private void enforceDailyLimit(User user) {
        Integer own = user.getExtractionDailyLimit();
        int limit = own != null ? own : settings.getInt(Boolean.TRUE.equals(user.getIsPremium())
                ? SettingsService.KEY_LIMIT_PREMIUM : SettingsService.KEY_LIMIT_FREE);
        long used = jobs.countByUserIdAndCreatedAtAfter(user.getId(), Instant.now().minus(Duration.ofHours(24)));
        if (used >= limit) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Bạn đã dùng hết " + limit + " lượt bóc tách trong 24 giờ. Thử lại sau.");
        }
    }

    /** Hàng đợi worker đầy: job đã lưu -> đánh FAILED ngay để client không chờ vô ích. */
    private void dispatch(ExtractionJob job, Runnable task) {
        try {
            task.run();
        } catch (RejectedExecutionException e) {
            job.setStatus(ExtractionJob.FAILED);
            job.setErrorMessage("Hệ thống đang bận, vui lòng thử lại sau ít phút.");
            job.setFinishedAt(Instant.now());
            jobs.save(job);
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, job.getErrorMessage());
        }
    }

    /** Loại file theo đuôi, xác nhận bằng magic bytes để không gửi file giả đuôi sang ai-service. */
    static String sniff(byte[] data, String filename) {
        String ext = "";
        if (filename != null && filename.lastIndexOf('.') >= 0) {
            ext = filename.substring(filename.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        }
        String type = EXT_TYPES.get(ext);
        if (type == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Định dạng không hỗ trợ. Chấp nhận: TXT, MD, DOCX, PDF, PNG, JPG, WEBP.");
        }
        boolean ok = switch (type) {
            case "docx" -> starts(data, 0x50, 0x4B, 0x03, 0x04); // zip
            case "pdf" -> starts(data, 0x25, 0x50, 0x44, 0x46);  // %PDF
            case "image" -> starts(data, 0x89, 0x50, 0x4E, 0x47) // PNG
                    || starts(data, 0xFF, 0xD8, 0xFF)              // JPEG
                    || (starts(data, 0x52, 0x49, 0x46, 0x46) && data.length > 12
                        && new String(data, 8, 4, StandardCharsets.US_ASCII).equals("WEBP"));
            default -> true;
        };
        if (!ok) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nội dung file không khớp với đuôi ." + ext + ".");
        return type;
    }

    private static boolean starts(byte[] data, int... magic) {
        if (data.length < magic.length) return false;
        for (int i = 0; i < magic.length; i++) if ((data[i] & 0xFF) != magic[i]) return false;
        return true;
    }

    // ---------- đọc ----------

    private ExtractionJob owned(Long uid, UUID id) {
        return jobs.findByIdAndUserId(id, uid)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, JOB_NOT_FOUND));
    }

    /** Như owned, nhưng job của lộ trình học chỉ được sửa qua trang lộ trình (rerun xoá item -> rỗng chương). */
    private ExtractionJob ownedEditable(Long uid, UUID id) {
        ExtractionJob job = owned(uid, id);
        if (ExtractionJob.PURPOSE_LEARNING_PATH.equals(job.getPurpose())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Lượt này thuộc một lộ trình học, hãy thao tác từ trang lộ trình.");
        }
        return job;
    }

    @Transactional(readOnly = true)
    public List<ExtractionJobResponse> list(Long uid) {
        return jobs.findTop50ByUserIdAndPurposeOrderByCreatedAtDesc(uid, ExtractionJob.PURPOSE_EXTRACTION).stream().map(j -> ExtractionJobResponse.of(j, false)).toList();
    }

    @Transactional(readOnly = true)
    public ExtractionJobResponse get(Long uid, UUID id, boolean includeText) {
        return ExtractionJobResponse.of(owned(uid, id), includeText);
    }

    @Transactional(readOnly = true)
    public List<ExtractionItemResponse> items(Long uid, UUID id, String kind, String level, Boolean selected) {
        owned(uid, id);
        return items.findByJobIdOrderByPositionAsc(id).stream()
                .filter(i -> kind == null || kind.equals(i.getKind()))
                .filter(i -> level == null || ("unknown".equals(level) ? i.getLevel() == null : level.equals(i.getLevel())))
                .filter(i -> selected == null || selected == i.isSelected())
                .map(ExtractionItemResponse::of).toList();
    }

    // ---------- sửa ----------

    /** Người dùng sửa văn bản OCR -> chạy lại từ ANALYZE. Không chạy khi job đang xử lý. */
    public ExtractionJobResponse updateText(Long uid, UUID id, String text) {
        ExtractionJob job = ownedEditable(uid, id);
        requireIdle(job);
        job.setExtractedText(text);
        job.setStatus(ExtractionJob.QUEUED);
        job.setStage(ExtractionJob.QUEUED);
        job.setErrorMessage(null);
        jobs.save(job);
        dispatch(job, () -> worker.runFromAnalyze(job.getId()));
        return ExtractionJobResponse.of(job, false);
    }

    public ExtractionJobResponse rerun(Long uid, UUID id) {
        ExtractionJob job = ownedEditable(uid, id);
        requireIdle(job);
        if (job.getExtractedText() == null || job.getExtractedText().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Lượt này chưa có văn bản để phân tích lại. Hãy tải tài liệu lên lần nữa.");
        }
        job.setStatus(ExtractionJob.QUEUED);
        job.setStage(ExtractionJob.QUEUED);
        job.setErrorMessage(null);
        jobs.save(job);
        dispatch(job, () -> worker.runFromAnalyze(job.getId()));
        return ExtractionJobResponse.of(job, false);
    }

    /** Khoảng cách tối thiểu giữa hai lần "Dịch lại nghĩa" của cùng một job (chống spam Gemini). */
    static final Duration RE_ENRICH_COOLDOWN = Duration.ofMinutes(5);

    /** Chạy lại riêng bước dịch nghĩa VN (Gemini hết quota / lỗi). Không tính vào hạn mức ngày, không phân tích lại. */
    public ExtractionJobResponse reEnrich(Long uid, UUID id) {
        ExtractionJob job = ownedEditable(uid, id);
        requireIdle(job);
        if (!ExtractionJob.DONE.equals(job.getStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Lượt này chưa hoàn tất, không thể dịch lại.");
        }
        if (job.getOptions() == null || !"vi".equals(job.getOptions().get("meaningLang"))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Lượt này không yêu cầu nghĩa tiếng Việt.");
        }
        Object last = job.getStats() != null ? job.getStats().get("enrichedAt") : null;
        if (last instanceof String s && !s.isBlank()) {
            try {
                if (Instant.parse(s).plus(RE_ENRICH_COOLDOWN).isAfter(Instant.now())) {
                    throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                            "Vừa dịch lại chưa lâu, hãy thử sau vài phút.");
                }
            } catch (java.time.format.DateTimeParseException ignored) {
                // giá trị lạ trong stats -> không chặn
            }
        }
        job.setStatus(ExtractionJob.QUEUED);
        job.setStage(ExtractionJob.QUEUED);
        job.setErrorMessage(null);
        jobs.save(job);
        dispatch(job, () -> worker.runEnrich(job.getId()));
        return ExtractionJobResponse.of(job, false);
    }

    private static void requireIdle(ExtractionJob job) {
        if (!job.isTerminal()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Lượt bóc tách đang được xử lý, hãy đợi xong.");
        }
    }

    @Transactional
    public List<ExtractionItemResponse> patchItems(Long uid, UUID id, List<ItemPatch> patches) {
        ownedEditable(uid, id);
        return applyPatches(id, patches);
    }

    /** Dùng cho LearningPathService (bản nháp lộ trình): cho phép job purpose = learning_path. */
    @Transactional
    public List<ExtractionItemResponse> patchPathItems(Long uid, UUID id, List<ItemPatch> patches) {
        owned(uid, id);
        return applyPatches(id, patches);
    }

    private List<ExtractionItemResponse> applyPatches(UUID id, List<ItemPatch> patches) {
        Map<UUID, ExtractionItem> byId = items.findByJobIdOrderByPositionAsc(id).stream()
                .collect(Collectors.toMap(ExtractionItem::getId, Function.identity()));
        for (ItemPatch p : patches) {
            ExtractionItem it = byId.get(p.id());
            if (it == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mục " + p.id() + " không thuộc lượt bóc tách này.");
            }
            if (p.selected() != null) it.setSelected(p.selected());
            if (p.term() != null && !p.term().isBlank()) it.setTerm(p.term().trim());
            // Chuỗi rỗng = xoá (cut trả null); JSON null = không đổi
            if (p.reading() != null) it.setReading(ExtractionWorker.cut(p.reading(), 200));
            if (p.meaningVi() != null) it.setMeaningVi(ExtractionWorker.cut(p.meaningVi(), 1000));
            if (p.meaningEn() != null) it.setMeaningEn(ExtractionWorker.cut(p.meaningEn(), 1000));
            if (p.level() != null) {
                // "" = người dùng bỏ cấp; sửa tay = chắc chắn
                it.setLevel(p.level().isEmpty() ? null : p.level());
                it.setLevelConfidence(p.level().isEmpty() ? 0.0 : 1.0);
                it.setLevelSources(List.of("user"));
            }
        }
        return byId.values().stream().sorted(Comparator.comparingInt(ExtractionItem::getPosition))
                .map(ExtractionItemResponse::of).toList();
    }

    @Transactional
    public void delete(Long uid, UUID id) {
        deleteJob(owned(uid, id));
    }

    /** Phần xoá không kiểm tra chủ: người dùng (delete) và Admin Panel dùng chung. Gọi trong transaction. */
    public void deleteJob(ExtractionJob job) {
        if (ExtractionJob.PURPOSE_LEARNING_PATH.equals(job.getPurpose())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Lượt này thuộc một lộ trình học, hãy xoá lộ trình.");
        }
        if (ExtractionJob.QUEUED.equals(job.getStatus()) || ExtractionJob.RUNNING.equals(job.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Lượt bóc tách đang chạy, không thể xoá.");
        }
        jobs.delete(job); // extraction_items: FK ON DELETE CASCADE; bộ thẻ đã tạo giữ nguyên
    }

    // ---------- tạo bộ thẻ ----------

    /** Mỗi loại (từ vựng / ngữ pháp) có item được chọn và có spec -> một bộ thẻ qua DeckService (cùng quy tắc, cùng kiểm tra). */
    @Transactional
    public List<DeckResponse> createDecks(Long uid, UUID id, CreateDecks req) {
        ExtractionJob job = ownedEditable(uid, id);
        if (!ExtractionJob.DONE.equals(job.getStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Lượt bóc tách chưa hoàn tất.");
        }
        if (req.vocab() == null && req.grammar() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Chọn ít nhất một loại bộ thẻ để tạo.");
        }
        List<ExtractionItem> all = items.findByJobIdOrderByPositionAsc(id);
        List<DeckResponse> created = new ArrayList<>();
        if (req.vocab() != null) created.add(buildDeck(uid, job, all, ExtractionItem.VOCAB, req.vocab(), "goi"));
        if (req.grammar() != null) created.add(buildDeck(uid, job, all, ExtractionItem.GRAMMAR, req.grammar(), "bunpou"));
        List<String> ids = new ArrayList<>(job.getDeckIds());
        created.forEach(d -> ids.add(d.id()));
        job.setDeckIds(ids);
        return created;
    }

    private DeckResponse buildDeck(Long uid, ExtractionJob job, List<ExtractionItem> all, String kind, DeckSpec spec,
                                   String category) {
        List<ExtractionItem> chosen = all.stream().filter(i -> kind.equals(i.getKind()) && i.isSelected())
                .sorted(Comparator.comparingInt((ExtractionItem i) -> levelRank(i.getLevel()))
                        .thenComparing(Comparator.comparingInt(ExtractionItem::getFrequency).reversed())
                        .thenComparingInt(ExtractionItem::getPosition))
                .toList();
        if (chosen.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    ExtractionItem.VOCAB.equals(kind) ? "Chưa chọn từ vựng nào." : "Chưa chọn mẫu ngữ pháp nào.");
        }
        String level = spec.level() != null ? spec.level() : dominantLevel(chosen, job);
        List<DeckRequest.Card> cards = chosen.stream().map(ExtractionService::toCard).toList();
        DeckRequest req = new DeckRequest(spec.title().trim(), level, "Tạo tự động từ "
                + (job.getSourceName() != null ? job.getSourceName() : "văn bản dán") + ".",
                spec.folderId(), null, category, cards);
        return deckService.create(uid, req);
    }

    /** N5 trước, N1 sau, chưa rõ cấp xếp cuối: thứ tự thẻ = thứ tự học (ReviewService lấy thẻ mới theo position). */
    static int levelRank(String level) {
        return level == null ? 9 : 6 - Integer.parseInt(level.substring(1));
    }

    static String dominantLevel(List<ExtractionItem> chosen, ExtractionJob job) {
        Map<String, Integer> count = new HashMap<>();
        for (ExtractionItem i : chosen) if (i.getLevel() != null) count.merge(i.getLevel(), 1, Integer::sum);
        return count.entrySet().stream().max(Map.Entry.comparingByValue()).map(Map.Entry::getKey)
                .orElseGet(() -> {
                    Object userLevel = job.getOptions() != null ? job.getOptions().get("userLevel") : null;
                    return userLevel instanceof String s && s.matches("N[1-5]") ? s : "N5";
                });
    }

    /** meaning nhiều dòng theo quy ước thẻ: dòng 1 = nghĩa chính (VN, không có thì EN), rồi Hán-Việt, ví dụ. */
    static DeckRequest.Card toCard(ExtractionItem i) {
        List<String> lines = new ArrayList<>();
        String main = i.getMeaningVi() != null ? i.getMeaningVi() : i.getMeaningEn();
        lines.add(main != null ? main : "(chưa có nghĩa)");
        if (i.getHanViet() != null) lines.add("Hán-Việt: " + i.getHanViet());
        if (i.getExample() != null) lines.add(i.getExample());
        if (i.getExampleVi() != null) lines.add(i.getExampleVi());
        String meaning = ExtractionWorker.cut(String.join("\n", lines), 2000);
        return new DeckRequest.Card(null, i.getTerm(), i.getReading(), meaning, i.getLevel(), i.getKind(),
                i.getReadingSegments(), i.getHanViet());
    }
}
