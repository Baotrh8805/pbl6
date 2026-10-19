package com.pbl6.flashcard.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.dto.practice.PracticeDtos.ContourPoint;
import com.pbl6.flashcard.dto.practice.PracticeDtos.StrokePoint;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

/**
 * Client mỏng của nhóm luyện tập (§2) sang ai-service: nét mẫu / chấm nét (ai-service/app/api/kanji_dtw_router.py) và trọng âm
 * (audio_praat_router.py). Đi qua getJson / postJson dùng chung của {@link AiServiceClient} (timeout 30 s, có người đang chờ) để
 * các nhóm tính năng không cùng sửa một tệp. Trả nguyên JSON của ai-service; lỗi đổi thành mã HTTP của ta ngay tại đây để
 * service chỉ còn nghiệp vụ (ghi nhật ký).
 */
@Service
public class PracticeAiClient {

    private final AiServiceClient ai;

    public PracticeAiClient(AiServiceClient ai) {
        this.ai = ai;
    }

    /** GET /api/kanji/{ch}/strokes → {kanji, strokeCount, strokes:[[[x,y]…]…]}; 404 khi chưa có nét mẫu KanjiVG. */
    public JsonNode strokes(String ch) {
        return upstream(() -> ai.getJson("tra nét mẫu chữ Hán", "/api/kanji/{ch}/strokes", Map.of("ch", ch), null));
    }

    /** POST /api/kanji/score {kanji, strokes:[[{x,y,t?}]]} → {kanji, totalScore, isCorrectOrder, feedback, perStroke, missing, extra, strokeCount}. */
    public JsonNode score(String kanji, List<List<StrokePoint>> strokes) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("kanji", kanji);
        body.put("strokes", strokes);
        return upstream(() -> ai.postJson("chấm nét chữ Hán", "/api/kanji/score", body));
    }

    /** GET /api/audio/pitch-reference?word=&reading= → {word, reading, accentType, moras:[{mora, level}]}; reading null = không gửi. */
    public JsonNode pitchReference(String word, String reading) {
        Map<String, Object> query = new LinkedHashMap<>();
        query.put("word", word);
        query.put("reading", reading); // getJson bỏ qua giá trị null
        return upstream(() -> ai.getJson("tra trọng âm chuẩn", "/api/audio/pitch-reference", null, query));
    }

    /** POST /api/audio/pitch-score {word, reading?, accentType?, contour} → {word, reading, accentType, pct, userHL, refHL, wrongMora, voicedRatio, feedback}. */
    public JsonNode pitchScore(String word, String reading, Integer accentType, List<ContourPoint> contour) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("word", word);
        if (reading != null) body.put("reading", reading);
        if (accentType != null) body.put("accentType", accentType);
        body.put("contour", contour);
        return upstream(() -> ai.postJson("chấm trọng âm", "/api/audio/pitch-score", body));
    }

    /**
     * 404 (chưa có nét mẫu / dữ liệu trọng âm) → 404 kèm câu tiếng Việt của ai-service; 400 / 413 / 422 (tham số — backend đã kiểm
     * trước nên hiếm) → 400; còn lại (không kết nối được, timeout, 5xx, sai X-Internal-Key) → 503. Không bao giờ chuyển 401 / 403
     * của ai-service ra ngoài: frontend coi 401 là hết phiên đăng nhập.
     */
    static JsonNode upstream(Supplier<JsonNode> call) {
        try {
            return call.get();
        } catch (AiServiceClient.AiServiceException e) {
            int status = e.status();
            if (status == 404) throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage());
            if (status == 400) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
            if (status == 413 || status == 422) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Dữ liệu luyện tập gửi dịch vụ AI không hợp lệ.");
            }
            if (status == 401 || status == 403) {
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                        "Dịch vụ AI tạm thời không khả dụng, vui lòng thử lại sau.");
            }
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, e.getMessage());
        }
    }
}
