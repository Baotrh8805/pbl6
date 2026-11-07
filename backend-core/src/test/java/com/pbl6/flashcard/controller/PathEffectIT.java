package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Hiệu quả lộ trình (kế hoạch 2026-10-26 B3): số liệu theo chương, tổng, tỷ lệ nhớ sau 7 ngày, chia trước / sau lộ trình bổ khuyết,
 * loại lượt học nhanh, quyền (404), khối pathEffect ở thống kê admin. Bộ thẻ tạo qua API; lộ trình, chương và log chèn bằng JDBC
 * để đặt đúng mốc thời gian (lịch lộ trình thật cần ai-service).
 */
class PathEffectIT extends IntegrationTest {

    @Autowired
    JdbcTemplate jdbc;

    private final OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);

    private UUID path(Long uid, String title, String sourceType, OffsetDateTime createdAt) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO learning_paths (id, user_id, title, source_type, status, total_days, start_date, created_at, activated_at)
                VALUES (?, ?, ?, ?, 'ACTIVE', 10, ?, ?, ?)
                """, id, uid, title, sourceType, LocalDate.now(), createdAt, createdAt);
        return id;
    }

    private UUID chapter(UUID pathId, int position, String title, String... cardIds) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO learning_path_chapters (id, path_id, position, title) VALUES (?, ?, ?, ?)", id, pathId, position, title);
        int seq = position * 10;
        for (String card : cardIds) {
            jdbc.update("INSERT INTO learning_path_cards (path_id, chapter_id, card_id, seq, scheduled_day) VALUES (?, ?, ?, ?, 1)",
                    pathId, id, card, seq++);
        }
        return id;
    }

    private void log(Long uid, String card, String grade, String source, int daysAgo, Integer reactionMs, UUID pathId) {
        jdbc.update("INSERT INTO review_logs (user_id, card_id, grade, source, reviewed_at, reaction_ms, path_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
                uid, card, grade, source, now.minusDays(daysAgo), reactionMs, pathId);
    }

    private List<String> cards(String token) throws Exception {
        List<Map<String, Object>> cards = new ArrayList<>();
        for (String t : List.of("一", "二", "三", "四")) cards.add(Map.of("term", t, "reading", "よみ", "meaning", "số " + t));
        JsonNode d = read(call(post("/api/decks"), token, Map.of("title", "Lộ trình thử", "level", "N5", "cards", cards))
                .andExpect(status().isCreated()));
        List<String> ids = new ArrayList<>();
        for (JsonNode c : d.get("cards")) ids.add(c.get("id").asText());
        return ids;
    }

    @Test
    void chapters_totals_retention_and_remedial_split_from_path_logs() throws Exception {
        String email = newEmail();
        String token = newUser(email);
        Long uid = userId(email);
        List<String> ids = cards(token);
        String a = ids.get(0), b = ids.get(1), c = ids.get(2), d = ids.get(3);

        UUID p = path(uid, "Lộ trình chính", "text", now.minusDays(30));
        chapter(p, 1, "Chương 1", a, b);
        chapter(p, 2, "Chương 2", c, d);
        // A: lượt đầu trong lộ trình, 8 ngày sau ôn ngoài lộ trình "good" → nhớ
        log(uid, a, "good", "flip", 20, 1000, p);
        log(uid, a, "good", "flip", 12, 3000, null);
        // B: again rồi good trong lộ trình; lượt đầu tiên sau mốc 7 ngày là "again" → đủ điều kiện nhưng không nhớ
        log(uid, b, "again", "flip", 20, 5000, p);
        log(uid, b, "good", "flip", 19, 2000, p);
        log(uid, b, "again", "flip", 10, 2500, null);
        // C: mới học 5 ngày trước, chưa đủ 7 ngày; lượt học nhanh không tính
        log(uid, c, "good", "flip", 5, 4000, p);
        log(uid, c, "again", "cram", 4, 100, p);
        UUID r = path(uid, "Bổ khuyết", "remedial", now.minusDays(15));

        JsonNode res = read(call(get("/api/insights/path-effect/{id}", p), token, null).andExpect(status().isOk()));
        assertEquals("Lộ trình chính", res.get("title").asText());
        assertFalse(res.get("remedial").asBoolean());

        JsonNode ch1 = res.get("chapters").get(0).get("stats");
        assertEquals(2, ch1.get("cards").asInt());
        assertEquals(2, ch1.get("studiedCards").asInt());
        assertEquals(3, ch1.get("reviews").asLong());
        assertEquals(1, ch1.get("again").asLong());
        assertEquals(0.333, ch1.get("againRate").asDouble(), 1e-9);
        assertEquals(2000, ch1.get("medianReactionMs").asInt());
        assertEquals(2, ch1.get("retentionEligible").asInt());
        assertEquals(1, ch1.get("retained").asInt());
        assertEquals(0.5, ch1.get("retention7d").asDouble(), 1e-9);

        JsonNode ch2 = res.get("chapters").get(1).get("stats");
        assertEquals("Chương 2", res.get("chapters").get(1).get("title").asText());
        assertEquals(2, ch2.get("cards").asInt());
        assertEquals(1, ch2.get("studiedCards").asInt());
        assertEquals(1, ch2.get("reviews").asLong(), "lượt học nhanh không tính");
        assertEquals(0.0, ch2.get("againRate").asDouble(), 1e-9);
        assertEquals(4000, ch2.get("medianReactionMs").asInt());
        assertEquals(0, ch2.get("retentionEligible").asInt());
        assertTrue(ch2.get("retention7d").isNull());

        JsonNode total = res.get("total");
        assertEquals(4, total.get("cards").asInt());
        assertEquals(3, total.get("studiedCards").asInt());
        assertEquals(4, total.get("reviews").asLong());
        assertEquals(0.25, total.get("againRate").asDouble(), 1e-9);
        assertEquals(3000, total.get("medianReactionMs").asInt(), "trung vị tính lại trên mọi lượt, không lấy trung bình chương");
        assertEquals(0.5, total.get("retention7d").asDouble(), 1e-9);

        JsonNode split = res.get("remedialSplit");
        assertEquals(r.toString(), split.get("remedialPathId").asText());
        assertEquals(3, split.get("before").get("reviews").asLong());
        assertEquals(1, split.get("before").get("again").asLong());
        assertEquals(2000, split.get("before").get("medianReactionMs").asInt());
        assertEquals(1, split.get("after").get("reviews").asLong());
        assertEquals(0.0, split.get("after").get("againRate").asDouble(), 1e-9);

        // lộ trình bổ khuyết: không so với chính nó, chưa có chương → số 0, tỷ lệ null
        JsonNode rem = read(call(get("/api/insights/path-effect/{id}", r), token, null).andExpect(status().isOk()));
        assertTrue(rem.get("remedial").asBoolean());
        assertTrue(rem.get("remedialSplit").isNull());
        assertEquals(0, rem.get("chapters").size());
        assertEquals(0, rem.get("total").get("reviews").asLong());
        assertTrue(rem.get("total").get("againRate").isNull());

        // người khác, id không tồn tại → 404; staff không có quyền người học
        call(get("/api/insights/path-effect/{id}", p), newUser(), null).andExpect(status().isNotFound());
        call(get("/api/insights/path-effect/{id}", UUID.randomUUID()), token, null).andExpect(status().isNotFound());
        call(get("/api/insights/path-effect/{id}", p), newStaff(Role.ADMIN), null).andExpect(status().isForbidden());

        // admin: lượt trong / ngoài lộ trình trong cửa sổ (DB dùng chung giữa các test nên chỉ chặn dưới)
        JsonNode stats = read(call(get("/api/admin/stats").param("days", "30"), newStaff(Role.ADMIN), null).andExpect(status().isOk()));
        assertTrue(stats.get("pathEffect").get("inPath").get("reviews").asLong() >= 4);
        assertTrue(stats.get("pathEffect").get("outside").get("reviews").asLong() >= 2);
    }

    @Test
    void path_without_remedial_or_logs_has_no_split_and_null_rates() throws Exception {
        String email = newEmail();
        String token = newUser(email);
        Long uid = userId(email);
        List<String> ids = cards(token);
        UUID p = path(uid, "Chưa học", "text", now.minusDays(2));
        chapter(p, 1, "Chương 1", ids.get(0), ids.get(1));
        // bổ khuyết tạo TRƯỚC khi lộ trình bắt đầu: không phải "sau bổ khuyết"
        path(uid, "Bổ khuyết cũ", "remedial", now.minusDays(5));

        JsonNode res = read(call(get("/api/insights/path-effect/{id}", p), token, null).andExpect(status().isOk()));
        assertTrue(res.get("remedialSplit").isNull());
        JsonNode s = res.get("chapters").get(0).get("stats");
        assertEquals(2, s.get("cards").asInt());
        assertEquals(0, s.get("reviews").asLong());
        assertTrue(s.get("againRate").isNull());
        assertTrue(s.get("medianReactionMs").isNull());
        assertTrue(res.get("total").get("medianReactionMs").isNull());
    }
}
