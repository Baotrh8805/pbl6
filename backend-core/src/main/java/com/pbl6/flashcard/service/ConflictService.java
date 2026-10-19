package com.pbl6.flashcard.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pbl6.flashcard.dto.extraction.ExtractionJobResponse;
import com.pbl6.flashcard.dto.learningpath.LearningPathResponse;
import com.pbl6.flashcard.model.ExtractionItem;
import com.pbl6.flashcard.model.ExtractionJob;
import com.pbl6.flashcard.model.LearningPath;
import com.pbl6.flashcard.repository.ExtractionItemRepository;
import com.pbl6.flashcard.repository.ExtractionJobRepository;
import com.pbl6.flashcard.repository.LearningPathRepository;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.sql.Statement;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Kiểm tra lại mâu thuẫn tài liệu ↔ tham chiếu (F2, hợp đồng đợt 2 §5) cho job đã xong: quản trị vừa thêm / sửa nguồn tri thức chuẩn,
 * hoặc job tạo trước khi có cảnh báo. Gửi item sang ai-service /extract/conflicts cùng mục tham chiếu của nguồn chuẩn ACTIVE (lọc theo
 * term của item) và ngưỡng contradiction_alert_threshold đọc lúc bấm, rồi cập nhật item.conflicts + stats.conflicts / conflictsByField.
 * <p>
 * Kiểm tra lại phải theo đúng luật của lượt phân tích nó thay thế — chỉ so cái TÀI LIỆU khai báo — nên mỗi item chỉ được đánh giá lại
 * những trường backend còn giữ khai báo của tài liệu, trường khác giữ nguyên cảnh báo đã lưu ({@link ConflictSupport#merge}):
 * <ul>
 *   <li>Job phân tích bởi pipeline có F2 (options có {@value ConflictSupport#OPTION_MIN_CONFIDENCE}): reading / furigana chỉ khi đã lưu
 *       docReading, meaning chỉ khi đã lưu docMeaningEn; gửi docReading / docMeaningEn = null tường minh để ai-service không coi cách
 *       đọc Sudachi / nghĩa từ điển của thẻ là của tài liệu, và không gửi meaningVi (có thể do Gemini / người dùng viết, lúc phân tích
 *       ai-service chưa thấy nó). Item của /extract/analyze luôn mang docReading / docMeaningEn / docLevel (null = tài liệu không
 *       ghi) và worker lưu hai khoá đầu vào doc_reading / doc_meaning_en, nên với job mới kiểm tra lại đánh giá lại reading / meaning
 *       từ đúng khai báo đó. Item chưa lưu khai báo (phân tích bởi ai-service F2 cũ, lúc nó còn bỏ khai báo khỏi item) thì trường đó
 *       không được đánh giá lại: giữ nguyên cảnh báo lúc phân tích thay vì bịa thêm hay xoá oan.</li>
 *   <li>Job cũ (trước F2, không có khoá trên): reading / furigana / meaning của thẻ được coi là của tài liệu như ai-service quy ước
 *       cho ConflictItem thiếu khoá doc* — đó là mục đích kiểm tra lại job cũ.</li>
 *   <li>level / grammar không bao giờ được đánh giá lại (cần docLevel mà backend không lưu): cảnh báo lúc phân tích được giữ.</li>
 * </ul>
 * Item không có trường nào đánh giá lại được thì không gửi; không còn item nào thì không gọi ai-service.
 * <p>
 * Không giữ kết nối DB trong lúc chờ ai-service (tới 1000 mục mỗi lô). Lúc ghi: khoá dòng job, đòi job vẫn DONE và MỌI item đã gửi
 * vẫn còn — job bị chạy lại giữa chừng thì item mang id mới, kết quả cũ không được dán vào (409, rollback). Ghi bằng UPDATE đúng cột
 * (conflicts của item, phép nối jsonb trên stats) để không ghi đè sửa đổi đồng thời của người dùng / worker như flush cả entity.
 */
@Service
public class ConflictService {

    /** Cùng trần MAX_CONFLICT_ITEMS của ai-service; job thường ≤ 600 + 100 mục, lộ trình ≤ 900 + 100 nên thường một lô. */
    static final int BATCH = 1000;
    /** Job cũ: reading / meaning của thẻ coi là của tài liệu nên ba luật này đánh giá lại được (level / grammar thì không). */
    static final Set<String> LEGACY_FIELDS = Set.of("reading", "furigana", "meaning");
    private static final String JOB_NOT_FOUND = "Không tìm thấy lượt bóc tách.";
    private static final String PATH_NOT_FOUND = "Không tìm thấy lộ trình học.";

    private final ExtractionJobRepository jobs;
    private final ExtractionItemRepository items;
    private final LearningPathRepository paths;
    private final ExtractionService extraction;
    private final LearningPathService learningPaths;
    private final KnowledgeSourceService knowledge;
    private final ContentAiClient ai;
    private final SettingsService settings;
    private final ObjectMapper json;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;

    public ConflictService(ExtractionJobRepository jobs, ExtractionItemRepository items, LearningPathRepository paths,
                           ExtractionService extraction, LearningPathService learningPaths, KnowledgeSourceService knowledge,
                           ContentAiClient ai, SettingsService settings, ObjectMapper json, JdbcTemplate jdbc,
                           PlatformTransactionManager txManager) {
        this.jobs = jobs;
        this.items = items;
        this.paths = paths;
        this.extraction = extraction;
        this.learningPaths = learningPaths;
        this.knowledge = knowledge;
        this.ai = ai;
        this.settings = settings;
        this.json = json;
        this.jdbc = jdbc;
        this.tx = new TransactionTemplate(txManager);
    }

    /** POST /api/extractions/{id}/recheck-conflicts: chủ job; job của lộ trình đi qua {@link #recheckPath} (409 như mọi thao tác sửa). */
    public ExtractionJobResponse recheckExtraction(Long uid, UUID id) {
        ExtractionJob job = jobs.findByIdAndUserId(id, uid)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, JOB_NOT_FOUND));
        if (ExtractionJob.PURPOSE_LEARNING_PATH.equals(job.getPurpose())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Lượt này thuộc một lộ trình học, hãy thao tác từ trang lộ trình.");
        }
        recheck(job);
        return extraction.get(uid, id, false);
    }

    /** POST /api/learning-paths/{id}/recheck-conflicts: chủ lộ trình, lộ trình có job (bổ khuyết thì không) và đã ra bản nháp. */
    public LearningPathResponse recheckPath(Long uid, UUID id, LocalDate date) {
        LearningPath path = paths.findByIdAndUserId(id, uid)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, PATH_NOT_FOUND));
        if (path.getJobId() == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Lộ trình này không dựng từ tài liệu nên không có gì để kiểm tra.");
        }
        if (LearningPath.PROCESSING.equals(path.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Lộ trình đang được xử lý, hãy đợi xong.");
        }
        ExtractionJob job = jobs.findById(path.getJobId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Dữ liệu bóc tách của lộ trình không còn."));
        recheck(job);
        return learningPaths.get(uid, id, learningPaths.today(date));
    }

    private void recheck(ExtractionJob job) {
        if (!job.isTerminal()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Lượt bóc tách đang được xử lý, hãy đợi xong.");
        }
        if (!ExtractionJob.DONE.equals(job.getStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Lượt bóc tách chưa hoàn tất.");
        }
        boolean declaredOnly = analysedWithF2(job);
        List<ExtractionItem> all = items.findByJobIdOrderByPositionAsc(job.getId());
        Map<UUID, Set<String>> evaluated = new HashMap<>();
        List<ExtractionItem> toSend = new ArrayList<>();
        for (ExtractionItem i : all) {
            Set<String> fields = evaluatedFields(i, declaredOnly);
            evaluated.put(i.getId(), fields);
            if (!fields.isEmpty()) toSend.add(i);
        }
        // item đã gửi mà ai-service không trả lại = không còn cảnh báo ở các trường được đánh giá
        Map<UUID, List<Map<String, Object>>> fresh = new HashMap<>();
        if (!toSend.isEmpty()) {
            List<Map<String, Object>> references = knowledge.referencesFor(toSend.stream().map(ExtractionItem::getTerm).toList());
            double minConfidence = ConflictSupport.minConfidence(settings);
            for (int from = 0; from < toSend.size(); from += BATCH) {
                List<Map<String, Object>> batch = toSend.subList(from, Math.min(toSend.size(), from + BATCH)).stream()
                        .map(i -> conflictItem(i, declaredOnly)).toList();
                JsonNode res = NlpService.upstream(() -> ai.conflicts(batch, references, minConfidence));
                for (JsonNode r : res.path("items")) {
                    UUID ref = uuidOrNull(r.path("ref").asText(null));
                    if (ref == null || evaluated.getOrDefault(ref, Set.of()).isEmpty()) continue;
                    JsonNode conflicts = r.path("conflicts");
                    fresh.put(ref, conflicts.isArray()
                            ? ConflictSupport.normalize(json.convertValue(conflicts, List.class)) : List.of());
                }
            }
        }
        // Ghi lại MỌI item (kể cả item không gửi, giữ nguyên cảnh báo): save đòi mọi dòng còn đó để phát hiện job bị chạy lại
        Map<UUID, List<Map<String, Object>>> merged = new LinkedHashMap<>();
        for (ExtractionItem i : all) {
            merged.put(i.getId(), ConflictSupport.merge(i.getConflicts(), fresh.get(i.getId()), evaluated.get(i.getId())));
        }
        Map<String, Object> patch = new LinkedHashMap<>(ConflictSupport.summarize(merged.values()));
        patch.put("conflictsCheckedAt", Instant.now().toString());
        save(job.getId(), merged, patch);
    }

    /** Job phân tích bởi pipeline có F2: ngưỡng cảnh báo đã được ghi vào options lúc tạo / lúc phân tích lại. */
    static boolean analysedWithF2(ExtractionJob job) {
        return job.getOptions() != null && job.getOptions().get(ConflictSupport.OPTION_MIN_CONFIDENCE) != null;
    }

    /**
     * Trường kiểm tra lại đánh giá được cho item (xem Javadoc lớp). Mẫu ngữ pháp chỉ có luật grammar (cần docLevel) nên luôn rỗng.
     */
    static Set<String> evaluatedFields(ExtractionItem i, boolean declaredOnly) {
        if (!ExtractionItem.VOCAB.equals(i.getKind())) return Set.of();
        if (!declaredOnly) return LEGACY_FIELDS;
        Set<String> fields = new LinkedHashSet<>();
        if (i.getDocReading() != null) {
            fields.add("reading");
            fields.add("furigana");
        }
        if (i.getDocMeaningEn() != null) fields.add("meaning");
        return fields;
    }

    private void save(UUID jobId, Map<UUID, List<Map<String, Object>>> found, Map<String, Object> statsPatch) {
        List<Object[]> args = new ArrayList<>();
        for (Map.Entry<UUID, List<Map<String, Object>>> e : found.entrySet()) {
            args.add(new Object[]{write(e.getValue()), e.getKey(), jobId});
        }
        String patchJson = write(statsPatch);
        tx.executeWithoutResult(s -> {
            List<String> status = jdbc.queryForList("SELECT status FROM extraction_jobs WHERE id = ? FOR UPDATE", String.class, jobId);
            if (status.isEmpty() || !ExtractionJob.DONE.equals(status.get(0))) throw changed();
            if (!args.isEmpty()) {
                int[] counts = jdbc.batchUpdate(
                        "UPDATE extraction_items SET conflicts = CAST(? AS jsonb) WHERE id = ? AND job_id = ?", args);
                long updated = java.util.Arrays.stream(counts).filter(c -> c > 0 || c == Statement.SUCCESS_NO_INFO).count();
                if (updated != args.size()) throw changed();
            }
            jdbc.update("UPDATE extraction_jobs SET stats = COALESCE(stats, '{}'::jsonb) || CAST(? AS jsonb) WHERE id = ?",
                    patchJson, jobId);
        });
    }

    /**
     * Item cho ConflictItem của ai-service (ba trạng thái của docReading / docMeaningEn như ai-service quy ước):
     * <ul>
     *   <li>job F2 ({@code declaredOnly}): luôn gửi hai khoá, null khi tài liệu không khai báo -> ai-service không so trường đó; không
     *       gửi meaningVi vì không biết nó là nghĩa in sẵn của tài liệu hay do Gemini / người dùng viết sau;</li>
     *   <li>job cũ: KHÔNG gửi khoá khi chưa lưu -> ai-service coi reading / meaningEn của thẻ (kể cả bản người dùng đã sửa) là của tài
     *       liệu, và gửi meaningVi — đúng mục đích kiểm tra lại job cũ.</li>
     * </ul>
     */
    static Map<String, Object> conflictItem(ExtractionItem i, boolean declaredOnly) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ref", i.getId().toString());
        m.put("term", i.getTerm());
        m.put("kind", i.getKind());
        m.put("reading", i.getReading());
        m.put("meaningEn", i.getMeaningEn());
        if (!declaredOnly) m.put("meaningVi", i.getMeaningVi());
        m.put("level", i.getLevel());
        if (i.getReadingSegments() != null) m.put("readingSegments", i.getReadingSegments());
        if (declaredOnly) {
            m.put("docReading", i.getDocReading());
            m.put("docMeaningEn", i.getDocMeaningEn());
        } else {
            if (i.getDocReading() != null) m.put("docReading", i.getDocReading());
            if (i.getDocMeaningEn() != null) m.put("docMeaningEn", i.getDocMeaningEn());
        }
        return m;
    }

    private static ResponseStatusException changed() {
        return new ResponseStatusException(HttpStatus.CONFLICT,
                "Lượt bóc tách vừa được chạy lại, hãy kiểm tra lại mâu thuẫn sau khi xong.");
    }

    private String write(Object value) {
        try {
            return json.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Không ghi được JSON cảnh báo mâu thuẫn", e);
        }
    }

    private static UUID uuidOrNull(String s) {
        if (s == null) return null;
        try {
            return UUID.fromString(s);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
