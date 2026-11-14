package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.service.hlr.HlrClient;
import com.pbl6.flashcard.service.hlr.HlrClient.Item;
import com.pbl6.flashcard.service.hlr.HlrClient.Prediction;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HLR trong lịch ôn (D32, spec 2026-10-27 đêm §8): số liệu seen / correct / last_reviewed_at, p nhớ trước lượt chấm, "phanh" SM-2,
 * dự phòng khi ai-service lỗi, hoàn tác tính lại, độ nhớ của bộ thẻ, tín hiệu "sắp quên". ai-service giả bằng {@link HlrClient}.
 */
class ReviewHlrIT extends IntegrationTest {

    @MockitoBean
    HlrClient hlr;

    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void setUp() {
        Mockito.reset(hlr);
        Mockito.when(hlr.enabled()).thenReturn(true);
    }

    /** Dự đoán theo ref: f(item) → Prediction; null = bỏ qua item. */
    private void predict(Function<Item, Prediction> f) {
        Mockito.when(hlr.tryPredict(Mockito.anyList())).thenAnswer(inv -> {
            List<Item> items = inv.getArgument(0);
            Map<String, Prediction> out = new LinkedHashMap<>();
            for (Item it : items) {
                Prediction p = f.apply(it);
                if (p != null) out.put(it.ref(), p);
            }
            return Optional.of(out);
        });
    }

    private static Prediction p(double recall, boolean forget) {
        return new Prediction(recall, recall, 274, 10, forget);
    }

    private JsonNode deck(String token) throws Exception {
        return read(call(get("/api/decks/n5-core"), token, null));
    }

    private JsonNode review(String token, String card, String grade) throws Exception {
        return read(call(post("/api/reviews"), token, Map.of("cardId", card, "grade", grade)).andExpect(status().isOk()));
    }

    /** Dòng reviews của một người cho một thẻ (bộ n5-core dùng chung giữa các test nên phải lọc theo user). */
    private Map<String, Object> row(String card, Long uid) {
        return jdbc.queryForMap("SELECT seen, correct, last_reviewed_at, recall_p, hlr_brake, interval_days FROM reviews "
                + "WHERE card_id = ? AND user_id = ?", card, uid);
    }

    @Test
    void counts_follow_grades_cram_is_ignored_and_undo_recounts() throws Exception {
        predict(it -> p(0.9, false));
        String email = newEmail();
        String token = newUser(email);
        Long uid = userId(email);
        String card = deck(token).get("cards").get(0).get("id").asText();
        review(token, card, "good");
        Map<String, Object> r = row(card, uid);
        assertEquals(1, r.get("seen"));
        assertEquals(1, r.get("correct"));
        assertTrue(r.get("last_reviewed_at") != null);
        call(post("/api/reviews"), token, Map.of("cardId", card, "grade", "again", "cram", true)).andExpect(status().isOk());
        assertEquals(1, row(card, uid).get("seen"), "học nhanh không đếm");
        review(token, card, "again");
        r = row(card, uid);
        assertEquals(2, r.get("seen"));
        assertEquals(1, r.get("correct"));
        review(token, card, "good");
        assertEquals(3, row(card, uid).get("seen"));
        call(post("/api/reviews/undo"), token, Map.of("cardId", card)).andExpect(status().isNoContent());
        r = row(card, uid);
        assertEquals(2, r.get("seen"), "hoàn tác tính lại từ nhật ký");
        assertEquals(1, r.get("correct"));
        assertEquals(false, r.get("hlr_brake"));
    }

    @Test
    void hlr_brake_keeps_interval_and_reports_recall_before() throws Exception {
        // trước: p 0,55; sau: dự đoán quên → phanh
        predict(it -> "before".equals(it.ref()) ? p(0.55, true) : p(0.6, true));
        String email = newEmail();
        String token = newUser(email);
        Long uid = userId(email);
        String card = deck(token).get("cards").get(1).get("id").asText();
        JsonNode first = review(token, card, "good");
        assertEquals(1, first.get("intervalDays").asInt());
        assertEquals("sm2", first.get("scheduler").asText(), "thẻ mới (seen < 2): chưa gọi HLR");
        assertTrue(first.path("recallBefore").isMissingNode() || first.get("recallBefore").isNull());

        JsonNode second = review(token, card, "good");
        assertEquals("sm2+hlr", second.get("scheduler").asText());
        assertEquals(0.55, second.get("recallBefore").asDouble(), 1e-9);
        assertTrue(second.get("hlrBrake").asBoolean());
        assertEquals(1, second.get("intervalDays").asInt(), "SM-2 muốn 3 ngày, HLR phanh giữ 1");
        assertEquals(2, second.get("reps").asInt(), "reps / ease vẫn theo SM-2");
        Map<String, Object> r = row(card, uid);
        assertEquals(true, r.get("hlr_brake"));
        assertEquals(0.55f, ((Number) r.get("recall_p")).floatValue(), 1e-6f);
        // GET /api/reviews cũng mang recallBefore + hlrBrake
        JsonNode stored = read(call(get("/api/reviews"), token, null)).get(0);
        assertEquals(0.55, stored.get("recallBefore").asDouble(), 1e-9);
        assertTrue(stored.get("hlrBrake").asBoolean());

        // model nói nhớ → không phanh, SM-2 tăng bình thường
        predict(it -> p(0.9, false));
        JsonNode third = review(token, card, "good");
        assertFalse(third.get("hlrBrake").asBoolean());
        assertTrue(third.get("intervalDays").asInt() > 1);
        // "Lại" không phanh (SM-2 đã giảm)
        predict(it -> p(0.3, true));
        JsonNode lapse = review(token, card, "again");
        assertFalse(lapse.get("hlrBrake").asBoolean());
        assertEquals(1, lapse.get("intervalDays").asInt());
    }

    @Test
    void hlr_down_or_disabled_falls_back_to_plain_sm2() throws Exception {
        Mockito.when(hlr.tryPredict(Mockito.anyList())).thenReturn(Optional.empty());
        String email = newEmail();
        String token = newUser(email);
        Long uid = userId(email);
        String card = deck(token).get("cards").get(2).get("id").asText();
        review(token, card, "good");
        JsonNode second = review(token, card, "good");
        assertEquals("sm2", second.get("scheduler").asText());
        assertEquals(3, second.get("intervalDays").asInt());
        assertNull(row(card, uid).get("recall_p"));
        Mockito.when(hlr.enabled()).thenReturn(false);
        JsonNode third = review(token, card, "good");
        assertEquals("sm2", third.get("scheduler").asText());
        Mockito.verify(hlr, Mockito.times(1)).tryPredict(Mockito.anyList());
    }

    @Test
    void deck_recall_summary_and_503_when_unavailable() throws Exception {
        String token = newUser();
        JsonNode d = deck(token);
        String c0 = d.get("cards").get(0).get("id").asText();
        String c1 = d.get("cards").get(1).get("id").asText();
        predict(it -> p(0.9, false));
        review(token, c0, "good");
        review(token, c1, "good");
        predict(it -> c0.equals(it.ref()) ? p(0.5, true) : c1.equals(it.ref()) ? p(0.9, false) : p(0.9, false));
        JsonNode r = read(call(get("/api/decks/n5-core/recall"), token, null).andExpect(status().isOk()));
        assertEquals(d.get("cards").size(), r.get("cards").asInt());
        assertEquals(2, r.get("studied").asInt());
        assertEquals(0.7, r.get("avgRecall").asDouble(), 1e-9);
        assertEquals(1, r.get("forgettingSoon").asInt());
        assertEquals(c0, r.get("items").get(0).get("cardId").asText(), "p thấp trước");
        assertTrue(r.get("items").get(0).get("forget").asBoolean());

        Mockito.when(hlr.tryPredict(Mockito.anyList())).thenReturn(Optional.empty());
        JsonNode err = read(call(get("/api/decks/n5-core/recall"), token, null).andExpect(status().isServiceUnavailable()));
        assertEquals("HLR_UNAVAILABLE", err.get("code").asText());
        call(get("/api/decks/khong-ton-tai/recall"), token, null).andExpect(status().isNotFound());
        // bộ chưa học: không cần HLR, studied 0
        String fresh = newUser();
        JsonNode r0 = read(call(get("/api/decks/n5-core/recall"), fresh, null).andExpect(status().isOk()));
        assertEquals(0, r0.get("studied").asInt());
        assertTrue(r0.get("avgRecall").isNull());
    }

    @Test
    void weaknesses_include_low_recall_signal() throws Exception {
        String token = newUser();
        JsonNode d = deck(token);
        String c0 = d.get("cards").get(0).get("id").asText();
        String c1 = d.get("cards").get(1).get("id").asText();
        predict(it -> p(0.9, false));
        review(token, c0, "good");
        review(token, c1, "good");
        predict(it -> c0.equals(it.ref()) ? p(0.4, true) : p(0.95, false));
        JsonNode w = read(call(get("/api/insights/weaknesses").param("days", "30"), token, null).andExpect(status().isOk()));
        assertEquals(1, w.get("total").asInt());
        JsonNode card = w.get("cards").get(0);
        assertEquals(c0, card.get("cardId").asText());
        assertEquals("low_recall", card.get("reasons").get(0).asText());
        assertEquals(0.4, card.get("recall").asDouble(), 1e-9);
    }
}
