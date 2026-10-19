package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.service.PracticeAiClient;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Luyện tập (hợp đồng đợt 2 §2) với ai-service giả lập: chuyển tiếp nguyên JSON, kiểm giới hạn trước khi gọi (400, không gọi
 * ai-service), ghi đúng một dòng practice_logs cho mỗi lần chấm thành công (không ghi khi ai-service 404 / lỗi), cardId lạ ghi NULL,
 * thống kê theo cửa sổ ngày, staff 403.
 */
class PracticeIT extends IntegrationTest {

    @MockitoBean
    PracticeAiClient ai;

    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void resetAi() {
        Mockito.reset(ai);
    }

    private JsonNode node(String raw) throws Exception {
        return json.readTree(raw);
    }

    private static Map<String, Object> point(double x, double y) {
        return Map.of("x", x, "y", y, "t", 16);
    }

    private static List<List<Map<String, Object>>> strokes(int count, int points) {
        List<List<Map<String, Object>>> out = new ArrayList<>();
        for (int s = 0; s < count; s++) {
            List<Map<String, Object>> stroke = new ArrayList<>();
            for (int p = 0; p < points; p++) stroke.add(point(p / (double) Math.max(1, points), s / 10.0));
            out.add(stroke);
        }
        return out;
    }

    private String cardOf(String token, String title, String term) throws Exception {
        JsonNode deck = read(call(post("/api/decks"), token, Map.of("title", title, "level", "N5",
                "cards", List.of(Map.of("term", term, "meaning", "nghĩa")))).andExpect(status().isCreated()));
        return deck.get("cards").get(0).get("id").asText();
    }

    private List<Map<String, Object>> logs(Long uid) {
        return jdbc.queryForList("SELECT kind, target, score, card_id, detail::text AS detail FROM practice_logs "
                + "WHERE user_id = ? ORDER BY id", uid);
    }

    private static final String SCORE_JSON = """
            {"kanji":"水","totalScore":87.6,"isCorrectOrder":false,"feedback":"Nét 2 viết ngược chiều.",
             "perStroke":[{"index":0,"score":90.0,"wrongDirection":false,"expectedIndex":0},
                          {"index":1,"score":70.5,"wrongDirection":true,"expectedIndex":2}],
             "missing":[1,3],"extra":[],"strokeCount":4}""";

    @Test
    void kanji_strokes_and_scoring_pass_ai_json_through_and_log_write() throws Exception {
        String email = newEmail();
        String token = newUser(email);
        Long uid = userId(email);
        String cardId = cardOf(token, "Luyện viết", "水");

        JsonNode ref = node("{\"kanji\":\"水\",\"strokeCount\":1,\"strokes\":[[[0.1,0.2],[0.5,0.9]]]}");
        Mockito.when(ai.strokes("水")).thenReturn(ref);
        assertEquals(ref, read(call(get("/api/practice/kanji/水/strokes"), token, null).andExpect(status().isOk())));
        assertTrue(logs(uid).isEmpty(), "xem nét mẫu không ghi nhật ký");

        JsonNode scored = node(SCORE_JSON);
        Mockito.when(ai.score(eq("水"), anyList())).thenReturn(scored);
        Map<String, Object> body = Map.of("kanji", " 水 ", "cardId", cardId, "strokes", strokes(2, 3));
        assertEquals(scored, read(call(post("/api/practice/kanji/score"), token, body).andExpect(status().isOk())),
                "nguyên văn JSON của ai-service");

        // Nét vẽ chuyển tiếp đủ, đúng thứ tự, kèm t
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<List<com.pbl6.flashcard.dto.practice.PracticeDtos.StrokePoint>>> sent = ArgumentCaptor.forClass(List.class);
        Mockito.verify(ai).score(eq("水"), sent.capture());
        assertEquals(2, sent.getValue().size());
        assertEquals(3, sent.getValue().get(0).size());
        assertEquals(16.0, sent.getValue().get(1).get(2).t());

        List<Map<String, Object>> rows = logs(uid);
        assertEquals(1, rows.size());
        assertEquals("write", rows.get(0).get("kind"));
        assertEquals("水", rows.get(0).get("target"));
        assertEquals(88, ((Number) rows.get(0).get("score")).intValue(), "87.6 làm tròn");
        assertEquals(cardId, rows.get(0).get("card_id"));
        JsonNode detail = node((String) rows.get(0).get("detail"));
        assertFalse(detail.get("isCorrectOrder").asBoolean());
        assertEquals(node("[1,3]"), detail.get("missing"));
        assertEquals(node("[]"), detail.get("extra"));
        assertEquals(3, detail.size(), "detail nhỏ: không chép perStroke / feedback");
    }

    @Test
    void ai_service_404_and_outage_are_forwarded_without_logging() throws Exception {
        String email = newEmail();
        String token = newUser(email);
        Long uid = userId(email);

        Mockito.when(ai.strokes("鬱")).thenThrow(new ResponseStatusException(HttpStatus.NOT_FOUND, "Chưa có nét mẫu cho chữ 鬱"));
        call(get("/api/practice/kanji/鬱/strokes"), token, null).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Chưa có nét mẫu cho chữ 鬱"));

        Mockito.when(ai.score(eq("鬱"), anyList()))
                .thenThrow(new ResponseStatusException(HttpStatus.NOT_FOUND, "Chưa có nét mẫu cho chữ 鬱"));
        call(post("/api/practice/kanji/score"), token, Map.of("kanji", "鬱", "strokes", strokes(1, 2)))
                .andExpect(status().isNotFound());

        Mockito.when(ai.pitchScore(anyString(), any(), any(), anyList()))
                .thenThrow(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Không kết nối được dịch vụ AI"));
        call(post("/api/practice/pitch/score"), token, Map.of("word", "はし", "contour", List.of(Map.of("t", 0))))
                .andExpect(status().isServiceUnavailable());

        // ai-service trả thiếu điểm: không ghi một dòng điểm bịa
        Mockito.when(ai.score(eq("火"), anyList())).thenReturn(node("{\"kanji\":\"火\"}"));
        call(post("/api/practice/kanji/score"), token, Map.of("kanji", "火", "strokes", strokes(1, 2)))
                .andExpect(status().isServiceUnavailable());

        assertTrue(logs(uid).isEmpty());
    }

    @Test
    void invalid_input_is_rejected_before_calling_ai_service() throws Exception {
        String token = newUser();
        // Không đúng một chữ
        call(get("/api/practice/kanji/水火/strokes"), token, null).andExpect(status().isBadRequest());
        call(post("/api/practice/kanji/score"), token, Map.of("kanji", "水火", "strokes", strokes(1, 2)))
                .andExpect(status().isBadRequest());
        call(post("/api/practice/kanji/score"), token, Map.of("kanji", "", "strokes", strokes(1, 2)))
                .andExpect(status().isBadRequest());
        // Giới hạn nét / điểm
        call(post("/api/practice/kanji/score"), token, Map.of("kanji", "水", "strokes", strokes(41, 1)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("40")));
        call(post("/api/practice/kanji/score"), token, Map.of("kanji", "水", "strokes", strokes(1, 501)))
                .andExpect(status().isBadRequest());
        call(post("/api/practice/kanji/score"), token, Map.of("kanji", "水", "strokes", List.of()))
                .andExpect(status().isBadRequest());
        call(post("/api/practice/kanji/score"), token, Map.of("kanji", "水", "strokes", List.of(List.of())))
                .andExpect(status().isBadRequest());
        call(post("/api/practice/kanji/score"), token, Map.of("kanji", "水", "strokes", List.of(List.of(Map.of("x", 0.5)))))
                .andExpect(status().isBadRequest());
        call(post("/api/practice/kanji/score"), token, Map.of("kanji", "水")).andExpect(status().isBadRequest());
        // Trọng âm: thiếu / quá dài từ, contour rỗng / quá 2000 điểm, điểm thiếu t, accentType ngoài 0..64
        call(get("/api/practice/pitch/reference"), token, null).andExpect(status().isBadRequest());
        call(get("/api/practice/pitch/reference").param("word", "  "), token, null).andExpect(status().isBadRequest());
        call(get("/api/practice/pitch/reference").param("word", "あ".repeat(65)), token, null).andExpect(status().isBadRequest());
        call(get("/api/practice/pitch/reference").param("word", "はし").param("reading", "あ".repeat(65)), token, null)
                .andExpect(status().isBadRequest());
        call(post("/api/practice/pitch/score"), token, Map.of("word", "はし", "contour", List.of()))
                .andExpect(status().isBadRequest());
        call(post("/api/practice/pitch/score"), token, Map.of("word", "はし",
                "contour", Collections.nCopies(2001, Map.of("t", 0.1, "f0", 200)))).andExpect(status().isBadRequest());
        call(post("/api/practice/pitch/score"), token, Map.of("word", "はし", "contour", List.of(Map.of("f0", 200))))
                .andExpect(status().isBadRequest());
        call(post("/api/practice/pitch/score"), token, Map.of("word", "はし", "accentType", 65,
                "contour", List.of(Map.of("t", 0)))).andExpect(status().isBadRequest());
        call(post("/api/practice/pitch/score"), token, Map.of("word", "", "contour", List.of(Map.of("t", 0))))
                .andExpect(status().isBadRequest());
        // Phát âm: điểm ngoài 0..100, thiếu target / transcript
        call(post("/api/practice/pronunciation"), token, Map.of("term", "箸", "target", "はし", "transcript", "はし", "score", 101))
                .andExpect(status().isBadRequest());
        call(post("/api/practice/pronunciation"), token, Map.of("term", "箸", "transcript", "はし", "score", 50))
                .andExpect(status().isBadRequest());
        call(post("/api/practice/pronunciation"), token, Map.of("term", "箸", "target", "はし", "score", 50))
                .andExpect(status().isBadRequest());
        // Thống kê: days 1..365
        call(get("/api/practice/stats").param("days", "0"), token, null).andExpect(status().isBadRequest());
        call(get("/api/practice/stats").param("days", "366"), token, null).andExpect(status().isBadRequest());

        Mockito.verifyNoInteractions(ai);
    }

    @Test
    void pitch_reference_and_score_log_pitch() throws Exception {
        String email = newEmail();
        String token = newUser(email);
        Long uid = userId(email);

        JsonNode ref = node("{\"word\":\"箸\",\"reading\":\"はし\",\"accentType\":1,"
                + "\"moras\":[{\"mora\":\"は\",\"level\":\"H\"},{\"mora\":\"し\",\"level\":\"L\"}]}");
        Mockito.when(ai.pitchReference("箸", "はし")).thenReturn(ref);
        assertEquals(ref, read(call(get("/api/practice/pitch/reference").param("word", " 箸 ").param("reading", "はし"), token, null)
                .andExpect(status().isOk())));
        // reading rỗng = không gửi
        Mockito.when(ai.pitchReference("はし", null)).thenReturn(ref);
        call(get("/api/practice/pitch/reference").param("word", "はし").param("reading", ""), token, null)
                .andExpect(status().isOk());
        Mockito.verify(ai).pitchReference("はし", null);

        JsonNode scored = node("""
                {"word":"箸","reading":"はし","accentType":1,"pct":50,"userHL":["L","L"],"refHL":["H","L"],
                 "wrongMora":[0],"voicedRatio":0.8,"feedback":"Mora は phải cao."}""");
        Mockito.when(ai.pitchScore(eq("箸"), eq("はし"), isNull(), anyList())).thenReturn(scored);
        List<Map<String, Object>> contour = new ArrayList<>();
        contour.add(Map.of("t", 0.0, "f0", 210.5));
        Map<String, Object> unvoiced = new HashMap<>();
        unvoiced.put("t", 0.02);
        unvoiced.put("f0", null);
        contour.add(unvoiced);
        assertEquals(scored, read(call(post("/api/practice/pitch/score"), token,
                Map.of("word", "箸", "reading", "はし", "contour", contour)).andExpect(status().isOk())));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<com.pbl6.flashcard.dto.practice.PracticeDtos.ContourPoint>> sent = ArgumentCaptor.forClass(List.class);
        Mockito.verify(ai).pitchScore(eq("箸"), eq("はし"), isNull(), sent.capture());
        assertEquals(2, sent.getValue().size());
        assertNull(sent.getValue().get(1).f0(), "khung không có thanh giữ null");

        List<Map<String, Object>> rows = logs(uid);
        assertEquals(1, rows.size());
        assertEquals("pitch", rows.get(0).get("kind"));
        assertEquals("箸", rows.get(0).get("target"));
        assertEquals(50, ((Number) rows.get(0).get("score")).intValue());
        assertNull(rows.get(0).get("card_id"));
        assertEquals(node("{\"wrongMora\":[0],\"accentType\":1}"), node((String) rows.get(0).get("detail")));
    }

    @Test
    void pronunciation_is_logged_and_foreign_card_ids_become_null() throws Exception {
        String email = newEmail();
        String token = newUser(email);
        Long uid = userId(email);
        String mine = cardOf(token, "Phát âm", "箸");
        String stranger = newUser();
        String theirs = cardOf(stranger, "Bộ riêng của người khác", "橋");

        call(post("/api/practice/pronunciation"), token, Map.of("cardId", mine, "term", "箸", "target", "はし",
                "transcript", "はし", "score", 92))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.kind").value("speak"))
                .andExpect(jsonPath("$.target").value("はし"))
                .andExpect(jsonPath("$.score").value(92))
                .andExpect(jsonPath("$.createdAt").exists());
        // Thẻ trong bộ riêng của người khác / id không tồn tại: vẫn ghi lượt luyện, không gắn thẻ (không lộ, không vỡ FK)
        call(post("/api/practice/pronunciation"), token, Map.of("cardId", theirs, "term", "橋", "target", "はし",
                "transcript", "", "score", 0)).andExpect(status().isCreated());
        call(post("/api/practice/pronunciation"), token, Map.of("cardId", "khong-ton-tai", "term", "橋", "target", "はし",
                "transcript", "はし", "score", 70)).andExpect(status().isCreated());

        List<Map<String, Object>> rows = logs(uid);
        assertEquals(3, rows.size());
        assertEquals("speak", rows.get(0).get("kind"));
        assertEquals(mine, rows.get(0).get("card_id"));
        assertEquals(node("{\"term\":\"箸\",\"transcript\":\"はし\"}"), node((String) rows.get(0).get("detail")));
        assertNull(rows.get(1).get("card_id"));
        assertNull(rows.get(2).get("card_id"));

        // Xoá bộ thẻ: nhật ký còn, chỉ mất liên kết thẻ (FK SET NULL)
        String deckId = jdbc.queryForObject("SELECT deck_id FROM flashcards WHERE id = ?", String.class, mine);
        call(delete("/api/decks/" + deckId), token, null).andExpect(status().is2xxSuccessful());
        assertEquals(3, logs(uid).size());
        assertNull(logs(uid).get(0).get("card_id"));
    }

    @Test
    void stats_count_and_average_per_kind_within_the_window() throws Exception {
        String email = newEmail();
        String token = newUser(email);
        Long uid = userId(email);

        // Chưa luyện: count 0, không có avg
        JsonNode empty = read(call(get("/api/practice/stats"), token, null).andExpect(status().isOk()));
        assertEquals(0, empty.get("write").get("count").asInt());
        assertFalse(empty.get("write").has("avg"));
        assertEquals(0, empty.get("recent").size());

        Mockito.when(ai.score(eq("水"), anyList())).thenReturn(node(SCORE_JSON));
        Mockito.when(ai.score(eq("火"), anyList())).thenReturn(node(SCORE_JSON.replace("87.6", "60")));
        call(post("/api/practice/kanji/score"), token, Map.of("kanji", "水", "strokes", strokes(1, 2))).andExpect(status().isOk());
        call(post("/api/practice/kanji/score"), token, Map.of("kanji", "火", "strokes", strokes(1, 2))).andExpect(status().isOk());
        for (int score : new int[] {70, 81, 90}) {
            call(post("/api/practice/pronunciation"), token, Map.of("term", "箸", "target", "はし", "transcript", "はし",
                    "score", score)).andExpect(status().isCreated());
        }
        // 22 lượt cũ 40 ngày trước: ngoài cửa sổ 30 ngày mặc định, trong cửa sổ 60
        for (int i = 0; i < 22; i++) {
            jdbc.update("INSERT INTO practice_logs (user_id, kind, target, score, created_at) "
                    + "VALUES (?, 'pitch', 'はし', 10, now() - interval '40 days')", uid);
        }
        // Người khác không lẫn vào
        String other = newUser();
        call(post("/api/practice/pronunciation"), other, Map.of("term", "箸", "target", "はし", "transcript", "", "score", 0))
                .andExpect(status().isCreated());

        JsonNode s = read(call(get("/api/practice/stats"), token, null).andExpect(status().isOk()));
        assertEquals(2, s.get("write").get("count").asInt());
        assertEquals(74.0, s.get("write").get("avg").asDouble(), "(88 + 60) / 2");
        assertEquals(3, s.get("speak").get("count").asInt());
        assertEquals(80.3, s.get("speak").get("avg").asDouble(), "(70 + 81 + 90) / 3 làm tròn 1 chữ số");
        assertEquals(0, s.get("pitch").get("count").asInt());
        assertEquals(5, s.get("recent").size());
        JsonNode newest = s.get("recent").get(0);
        assertEquals("speak", newest.get("kind").asText());
        assertEquals(90, newest.get("score").asInt(), "mới nhất trước");
        assertEquals("水", s.get("recent").get(4).get("target").asText());

        JsonNode wide = read(call(get("/api/practice/stats").param("days", "60"), token, null).andExpect(status().isOk()));
        assertEquals(22, wide.get("pitch").get("count").asInt());
        assertEquals(10.0, wide.get("pitch").get("avg").asDouble());
        assertEquals(20, wide.get("recent").size(), "tối đa 20 lượt");
    }

    @Test
    void practice_is_for_learners_only() throws Exception {
        String admin = newStaff(Role.ADMIN);
        call(get("/api/practice/stats"), admin, null).andExpect(status().isForbidden());
        call(get("/api/practice/kanji/水/strokes"), admin, null).andExpect(status().isForbidden());
        call(post("/api/practice/pronunciation"), admin, Map.of("term", "箸", "target", "はし", "transcript", "", "score", 0))
                .andExpect(status().isForbidden());
        String superAdmin = newStaff(Role.SUPER_ADMIN);
        call(post("/api/practice/kanji/score"), superAdmin, Map.of("kanji", "水", "strokes", strokes(1, 2)))
                .andExpect(status().isForbidden());
        call(get("/api/practice/stats"), null, null).andExpect(status().isUnauthorized());
        Mockito.verifyNoInteractions(ai);
    }

    @Test
    void deleting_own_account_removes_practice_logs() throws Exception {
        String email = newEmail();
        String token = newUser(email);
        Long uid = userId(email);
        call(post("/api/practice/pronunciation"), token, Map.of("term", "箸", "target", "はし", "transcript", "はし", "score", 80))
                .andExpect(status().isCreated());
        assertEquals(1, logs(uid).size());
        call(delete("/api/auth/me"), token, Map.of("password", "secret123")).andExpect(status().isNoContent());
        assertTrue(logs(uid).isEmpty(), "dữ liệu luyện tập là dữ liệu cá nhân: xoá cùng tài khoản");
    }
}
