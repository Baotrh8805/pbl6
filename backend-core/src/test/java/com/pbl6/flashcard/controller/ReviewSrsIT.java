package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Lật thẻ đổi lịch SRS + ghi log; Học nhanh (cram) chỉ ghi log, không đổi lịch / không tạo tiến độ. */
class ReviewSrsIT extends IntegrationTest {

    @Autowired
    JdbcTemplate jdbc;

    private String firstCard(String token) throws Exception {
        return read(call(get("/api/decks/n5-core"), token, null)).get("cards").get(0).get("id").asText();
    }

    private JsonNode review(String token, String card, String grade, boolean cram) throws Exception {
        return read(call(post("/api/reviews"), token, Map.of("cardId", card, "grade", grade, "cram", cram))
                .andExpect(status().isOk()));
    }

    private int logs(String card, String source) {
        return jdbc.queryForObject("SELECT count(*) FROM review_logs WHERE card_id = ? AND source = ?",
                Integer.class, card, source);
    }

    @Test
    void normal_review_moves_schedule_and_lapse_keeps_part_of_the_interval() throws Exception {
        String token = newUser();
        String card = firstCard(token);

        assertEquals(1, review(token, card, "good", false).get("intervalDays").asInt());
        assertEquals(3, review(token, card, "good", false).get("intervalDays").asInt());
        JsonNode lapsed = review(token, card, "again", false);
        assertEquals(1, lapsed.get("intervalDays").asInt(), "quên: giữ 30% khoảng ôn, không về 0");
        assertEquals(2, lapsed.get("reps").asInt(), "quên không xoá chuỗi ôn");
        assertEquals(1, read(call(get("/api/reviews"), token, null)).size());
    }

    @Test
    void cram_writes_only_a_log_and_never_touches_or_creates_progress() throws Exception {
        String token = newUser();
        String card = firstCard(token);
        int before = logs(card, "cram");

        // Thẻ chưa từng học: cram không tạo dòng reviews
        review(token, card, "good", true);
        assertEquals(0, read(call(get("/api/reviews"), token, null)).size());

        // Thẻ đã có lịch: cram nhiều lần không đổi interval / ease / reps / dueAt
        review(token, card, "good", false);
        JsonNode normal = read(call(get("/api/reviews"), token, null)).get(0); // đọc từ DB: dueAt đã làm tròn micro giây
        review(token, card, "easy", true);
        review(token, card, "again", true);
        JsonNode after = read(call(get("/api/reviews"), token, null)).get(0);
        for (String f : new String[]{"intervalDays", "ease", "reps", "dueAt"}) {
            assertEquals(normal.get(f), after.get(f), "cram không được đổi " + f);
        }
        assertEquals(before + 3, logs(card, "cram"),"mỗi lần cram ghi một dòng log");
    }

    @Test
    void cram_cannot_probe_a_card_the_user_cannot_see() throws Exception {
        String token = newUser();
        call(post("/api/reviews"), token, Map.of("cardId", "khong-ton-tai", "grade", "good", "cram", true))
                .andExpect(status().isNotFound());
    }
}
