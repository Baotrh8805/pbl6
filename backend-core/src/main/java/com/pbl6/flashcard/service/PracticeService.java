package com.pbl6.flashcard.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.dto.practice.PracticeDtos.KanjiScoreRequest;
import com.pbl6.flashcard.dto.practice.PracticeDtos.KindStats;
import com.pbl6.flashcard.dto.practice.PracticeDtos.LogEntry;
import com.pbl6.flashcard.dto.practice.PracticeDtos.PitchScoreRequest;
import com.pbl6.flashcard.dto.practice.PracticeDtos.PronunciationRequest;
import com.pbl6.flashcard.dto.practice.PracticeDtos.StatsResponse;
import com.pbl6.flashcard.model.Flashcard;
import com.pbl6.flashcard.model.PracticeLog;
import com.pbl6.flashcard.repository.FlashcardRepository;
import com.pbl6.flashcard.repository.PracticeLogRepository;
import com.pbl6.flashcard.repository.PracticeLogRepository.KindStat;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static com.pbl6.flashcard.dto.practice.PracticeDtos.MAX_WORD_LEN;

/**
 * Luyện tập viết Kanji (E2), phát âm (E3), trọng âm (E4) — hợp đồng đợt 2 §2. Chấm điểm do ai-service làm ({@link PracticeAiClient}),
 * phát âm do trình duyệt tự chấm; việc của backend là kiểm đầu vào, chuyển tiếp và ghi MỘT dòng practice_logs cho mỗi lần chấm
 * thành công để có thống kê. Lời gọi ai-service (tới 30 s) nằm NGOÀI transaction để không giữ kết nối DB trong lúc chờ; chỉ bước
 * ghi nhật ký mới mở transaction ngắn.
 */
@Service
public class PracticeService {

    public static final int DEFAULT_STATS_DAYS = 30;
    static final int RECENT_LIMIT = 20;
    /** Trần số phần tử mảng (missing / extra / wrongMora) chép vào detail: ai-service trả ≤ 40, chặn thêm nếu nó trả rác. */
    static final int DETAIL_LIST_MAX = 64;

    private final PracticeAiClient ai;
    private final PracticeLogRepository logs;
    private final FlashcardRepository flashcards;
    private final DeckService deckService;
    private final TransactionTemplate tx;

    public PracticeService(PracticeAiClient ai, PracticeLogRepository logs, FlashcardRepository flashcards,
                           DeckService deckService, PlatformTransactionManager txManager) {
        this.ai = ai;
        this.logs = logs;
        this.flashcards = flashcards;
        this.deckService = deckService;
        this.tx = new TransactionTemplate(txManager);
    }

    // ---------- viết Kanji ----------

    /** Nét mẫu KanjiVG để vẽ hướng dẫn; 404 khi chưa có dữ liệu cho chữ. Không ghi nhật ký (chỉ là xem mẫu). */
    public JsonNode strokes(String ch) {
        return ai.strokes(singleChar(ch));
    }

    /** Chấm nét người dùng; ghi log write {isCorrectOrder, missing, extra}. ai-service 404 (chưa có nét mẫu) → 404, không ghi log. */
    public JsonNode scoreKanji(Long uid, KanjiScoreRequest req) {
        String kanji = singleChar(req.kanji());
        JsonNode result = ai.score(kanji, req.strokes());
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("isCorrectOrder", result.path("isCorrectOrder").asBoolean(false));
        detail.put("missing", ints(result.path("missing")));
        detail.put("extra", ints(result.path("extra")));
        record(uid, req.cardId(), PracticeLog.WRITE, kanji, score(result, "totalScore"), detail);
        return result;
    }

    // ---------- trọng âm ----------

    /** Mẫu H/L chuẩn của từ; reading rỗng = không gửi (ai-service dùng chính word khi word toàn kana). */
    public JsonNode pitchReference(String word, String reading) {
        return ai.pitchReference(required(word, "word"), optional(reading, "reading"));
    }

    /** Chấm đường F0 trình duyệt ước lượng; ghi log pitch {wrongMora, accentType}. */
    public JsonNode scorePitch(Long uid, PitchScoreRequest req) {
        String word = required(req.word(), "word");
        JsonNode result = ai.pitchScore(word, optional(req.reading(), "reading"), req.accentType(), req.contour());
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("wrongMora", ints(result.path("wrongMora")));
        if (result.path("accentType").isInt()) detail.put("accentType", result.get("accentType").asInt());
        record(uid, req.cardId(), PracticeLog.PITCH, word, score(result, "pct"), detail);
        return result;
    }

    // ---------- phát âm ----------

    /**
     * Trình duyệt đã tự nhận dạng và chấm (Web Speech API) — server chỉ ghi lại; âm thanh không bao giờ gửi lên. Log speak:
     * target = cụm cần nói (target của body), detail {term, transcript}.
     */
    public LogEntry pronunciation(Long uid, PronunciationRequest req) {
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("term", req.term().trim());
        detail.put("transcript", req.transcript());
        PracticeLog saved = record(uid, req.cardId(), PracticeLog.SPEAK, req.target().trim(), req.score(), detail);
        return entry(saved);
    }

    // ---------- thống kê ----------

    /** Số lượt + điểm trung bình theo loại trong days ngày gần nhất, cùng tối đa 20 lượt mới nhất của cửa sổ đó. */
    @Transactional(readOnly = true)
    public StatsResponse stats(Long uid, int days) {
        Instant since = Instant.now().minus(Math.max(1, days), ChronoUnit.DAYS);
        Map<String, KindStats> byKind = new HashMap<>();
        for (KindStat s : logs.statsByKind(uid, since)) {
            Double avg = s.getAvg() == null ? null : Math.round(s.getAvg() * 10) / 10.0;
            byKind.put(s.getKind(), new KindStats(s.getN(), avg));
        }
        KindStats none = new KindStats(0, null);
        List<LogEntry> recent = logs.findRecent(uid, since, PageRequest.of(0, RECENT_LIMIT)).stream()
                .map(PracticeService::entry).toList();
        return new StatsResponse(byKind.getOrDefault(PracticeLog.WRITE, none), byKind.getOrDefault(PracticeLog.SPEAK, none),
                byKind.getOrDefault(PracticeLog.PITCH, none), recent);
    }

    // ---------- nội bộ ----------

    /**
     * cardId không tồn tại / thuộc bộ người dùng không xem được → ghi NULL chứ không chặn lượt luyện (như pathId của
     * ReviewService): nhật ký là tín hiệu phụ, và FK card_id sẽ vỡ 409 nếu để id lạ lọt xuống DB.
     */
    private PracticeLog record(Long uid, String cardId, String kind, String target, int score, Map<String, Object> detail) {
        return tx.execute(status -> {
            String card = cardId == null || cardId.isBlank() ? null : flashcards.findById(cardId)
                    .filter(c -> deckService.canView(uid, c.getDeck())).map(Flashcard::getId).orElse(null);
            return logs.save(new PracticeLog(uid, card, kind, target, score, detail));
        });
    }

    private static LogEntry entry(PracticeLog l) {
        return new LogEntry(l.getKind(), l.getTarget(), l.getScore(), l.getCreatedAt());
    }

    /** Đúng một ký tự theo code point (chữ ngoài BMP như 𠮟 dài 2 đơn vị UTF-16); có phải chữ Hán hay không do ai-service xét (404). */
    static String singleChar(String value) {
        String v = value == null ? "" : value.trim();
        if (v.codePointCount(0, v.length()) != 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cần đúng một chữ Hán.");
        }
        return v;
    }

    private static String required(String value, String name) {
        String v = optional(value, name);
        if (v == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Thiếu tham số " + name + ".");
        return v;
    }

    /** Cùng trần MAX_WORD_LEN với ai-service; rỗng / toàn khoảng trắng = không có. */
    private static String optional(String value, String name) {
        if (value == null || value.isBlank()) return null;
        String v = value.trim();
        if (v.length() > MAX_WORD_LEN) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, name + " tối đa " + MAX_WORD_LEN + " ký tự.");
        }
        return v;
    }

    /** Điểm 0..100 (ai-service trả số thực) → số nguyên cho cột smallint; thiếu trường = ai-service trả sai hợp đồng → 503. */
    static int score(JsonNode result, String field) {
        JsonNode v = result.get(field);
        if (v == null || !v.isNumber()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Dịch vụ AI trả về kết quả chấm không hợp lệ.");
        }
        return (int) Math.round(Math.max(0, Math.min(100, v.asDouble())));
    }

    private static List<Integer> ints(JsonNode array) {
        List<Integer> out = new ArrayList<>();
        if (!array.isArray()) return out;
        for (JsonNode n : array) {
            if (out.size() >= DETAIL_LIST_MAX) break;
            if (n.isInt()) out.add(n.asInt());
        }
        return out;
    }
}
