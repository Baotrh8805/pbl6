package com.pbl6.flashcard.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.dto.extraction.ExtractionItemResponse;
import com.pbl6.flashcard.dto.extraction.IPlusOneDtos.Response;
import com.pbl6.flashcard.dto.extraction.IPlusOneDtos.Sentence;
import com.pbl6.flashcard.model.ExtractionItem;
import com.pbl6.flashcard.model.ExtractionJob;
import com.pbl6.flashcard.model.LearningPath;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.repository.ExtractionItemRepository;
import com.pbl6.flashcard.repository.ExtractionJobRepository;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Câu ví dụ i+1 (C6, hợp đồng đợt 2 §9): trong văn bản của một lượt bóc tách, tìm câu chỉ có đúng một từ người học chưa biết
 * (ai-service /mining/i-plus-one) để làm câu ví dụ cho thẻ — người học suy nghĩa từ mới từ ngữ cảnh toàn từ đã biết. "Đã biết" =
 * term các thẻ người học đã ôn chắc (reps ≥ 2 hoặc khoảng ôn ≥ 7 ngày), cộng (tuỳ chọn) mọi từ không khó hơn trình độ của lượt.
 * Chỉ chủ lượt bóc tách. Job của lộ trình: tìm câu thì luôn được (chỉ đọc văn bản); áp câu là sửa item nên theo đúng luật sửa lộ trình
 * (chỉ khi bản nháp, xem {@link #apply}).
 */
@Service
public class IPlusOneService {

    /** Trần của ai-service (MAX_KNOWN_LEMMAS / MAX_TEXT_CHARS của mining_router): quá thì 422 / 413 thay vì kết quả. */
    static final int MAX_KNOWN = 20_000;
    static final int MAX_TEXT_CHARS = 50_000;
    /** Thẻ "đã biết": đã ôn ít nhất 2 lần, hoặc SRS đã giãn khoảng ôn ≥ 7 ngày (một lần "Dễ" với thẻ mới). */
    static final int KNOWN_REPS = 2;
    static final int KNOWN_INTERVAL_DAYS = 7;
    private static final String JOB_NOT_FOUND = "Không tìm thấy lượt bóc tách.";
    private static final String NO_TEXT = "Lượt này không còn văn bản tài liệu để tìm câu ví dụ.";

    private final ExtractionJobRepository jobs;
    private final ExtractionItemRepository items;
    private final ContentAiClient ai;
    private final JdbcTemplate jdbc;

    public IPlusOneService(ExtractionJobRepository jobs, ExtractionItemRepository items, ContentAiClient ai, JdbcTemplate jdbc) {
        this.jobs = jobs;
        this.items = items;
        this.ai = ai;
        this.jdbc = jdbc;
    }

    /**
     * Không @Transactional: không giữ kết nối DB trong lúc ai-service tách câu + Sudachi cả tài liệu. Văn bản bị dọn (job lộ trình cũ,
     * HousekeepingJob) -> 409. Văn bản dài hơn trần của ai-service chỉ gửi phần đầu (như phân tích: ai-service cũng cắt ở mốc này).
     */
    public Response find(User user, UUID id, boolean assumeLevelKnown, int limit) {
        ExtractionJob job = owned(user.getId(), id);
        String text = job.getExtractedText();
        if (text == null || text.isBlank()) throw new ResponseStatusException(HttpStatus.CONFLICT, NO_TEXT);
        String sent = text.length() > MAX_TEXT_CHARS ? text.substring(0, MAX_TEXT_CHARS) : text;
        List<String> known = knownLemmas(user.getId());
        String level = userLevel(job, user);
        JsonNode res = NlpService.upstream(() -> ai.iPlusOne(sent, known, level, assumeLevelKnown, limit));

        // Từ đích -> item từ vựng của job (vị trí nhỏ nhất thắng): lemma khớp term trước, rồi tới dạng gặp trong câu
        Map<String, UUID> byTerm = new HashMap<>();
        Map<String, UUID> bySurface = new HashMap<>();
        for (ExtractionItem i : items.findByJobIdOrderByPositionAsc(id)) {
            if (!ExtractionItem.VOCAB.equals(i.getKind())) continue;
            byTerm.putIfAbsent(i.getTerm(), i.getId());
            if (i.getSurface() != null) bySurface.putIfAbsent(i.getSurface(), i.getId());
        }
        List<Sentence> out = new ArrayList<>();
        for (JsonNode n : res.path("items")) {
            String sentence = n.path("sentence").asText("");
            if (sentence.isBlank()) continue;
            JsonNode target = n.path("target");
            String lemma = target.path("lemma").asText(null);
            String surface = target.path("surface").asText(null);
            UUID itemId = lemma != null && byTerm.containsKey(lemma) ? byTerm.get(lemma)
                    : surface != null && byTerm.containsKey(surface) ? byTerm.get(surface)
                    : surface != null ? bySurface.get(surface) : null;
            out.add(new Sentence(sentence, target.isObject() ? target : null, n.path("unknownCount").asInt(),
                    n.path("knownCount").asInt(), n.path("length").asInt(sentence.length()), n.path("score").asDouble(),
                    itemId));
        }
        return new Response(out, known.size());
    }

    /**
     * Dùng câu làm ví dụ của item: câu phải nằm nguyên văn trong văn bản của lượt (ai-service chỉ trả câu cắt từ văn bản), để endpoint
     * không thành đường ghi chữ tuỳ ý vào thẻ. exampleVi bị xoá vì là bản dịch của câu cũ. Job đang chạy -> 409 (worker sắp thay item).
     * <p>
     * Job của lộ trình theo đúng luật sửa item của lộ trình (LearningPathService.patchItems): khoá dòng lộ trình (LP-13) TRƯỚC khi nạp
     * job, chỉ khi lộ trình còn DRAFT. Lộ trình ACTIVE đã dựng bộ thẻ chương từ item lúc kích hoạt và không bao giờ dựng lại, nên sửa
     * item lúc đó là báo "đã áp" mà thẻ không đổi -> 409; không khoá thì áp câu song song với "Kích hoạt" có thể lọt / ghi đè nhau.
     */
    @Transactional
    public ExtractionItemResponse apply(Long uid, UUID id, UUID itemId, String sentence) {
        // SELECT ... FOR UPDATE bằng JDBC (cùng transaction) để đọc trạng thái MỚI sau khi chờ khoá — nạp entity LearningPath trước rồi
        // mới khoá thì persistence context trả lại bản cũ (DRAFT) dù lượt kích hoạt vừa commit
        List<String> pathStatus = jdbc.queryForList(
                "SELECT status FROM learning_paths WHERE job_id = ? AND user_id = ? FOR UPDATE", String.class, id, uid);
        ExtractionJob job = owned(uid, id);
        if (ExtractionJob.PURPOSE_LEARNING_PATH.equals(job.getPurpose())) {
            if (pathStatus.isEmpty()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Lượt này thuộc một lộ trình học, hãy thao tác từ trang lộ trình.");
            }
            if (!LearningPath.DRAFT.equals(pathStatus.get(0))) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Chỉ sửa được khi lộ trình đang ở bước xem trước.");
            }
        }
        if (!job.isTerminal()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Lượt bóc tách đang được xử lý, hãy đợi xong.");
        }
        String text = job.getExtractedText();
        if (text == null || text.isBlank()) throw new ResponseStatusException(HttpStatus.CONFLICT, NO_TEXT);
        String s = sentence.strip();
        if (s.isEmpty() || !text.contains(s)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Câu này không có trong tài liệu của lượt bóc tách.");
        }
        ExtractionItem item = items.findById(itemId).filter(i -> id.equals(i.getJobId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Mục " + itemId + " không thuộc lượt bóc tách này."));
        item.setExample(s);
        item.setExampleVi(null);
        return ExtractionItemResponse.of(item);
    }

    /**
     * Term các thẻ người học đã ôn chắc (bản ghi reviews của chính họ, ở bộ của mình hay bộ thư viện đang học), mỗi term một lần, tối đa
     * {@value #MAX_KNOWN}. Thứ tự cố định để cùng dữ liệu cho cùng kết quả khi bị cắt.
     */
    List<String> knownLemmas(Long uid) {
        return jdbc.queryForList("""
                SELECT DISTINCT f.term FROM reviews r JOIN flashcards f ON f.id = r.card_id
                WHERE r.user_id = ? AND (r.reps >= ? OR r.interval_days >= ?) AND trim(f.term) <> ''
                ORDER BY f.term LIMIT ?
                """, String.class, uid, KNOWN_REPS, KNOWN_INTERVAL_DAYS, MAX_KNOWN);
    }

    /** Trình độ đã chọn cho lượt bóc tách (options.userLevel), không có thì theo hồ sơ; null = để ai-service dùng N5. */
    static String userLevel(ExtractionJob job, User user) {
        Object fromJob = job.getOptions() != null ? job.getOptions().get("userLevel") : null;
        if (fromJob instanceof String s && s.matches("N[1-5]")) return s;
        String profile = user.getJlptLevel();
        return profile != null && profile.matches("N[1-5]") ? profile : null;
    }

    private ExtractionJob owned(Long uid, UUID id) {
        return jobs.findByIdAndUserId(id, uid)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, JOB_NOT_FOUND));
    }
}
