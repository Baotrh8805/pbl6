package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.model.LearningPath;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.repository.LearningPathRepository;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockPart;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Dashboard thống kê và health. ai-service trỏ host .invalid (application-test.properties) -> "down". */
class AdminStatsIT extends IntegrationTest {

    private static final ZoneId VN = ZoneId.of("Asia/Ho_Chi_Minh");

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    LearningPathRepository pathRepo;

    private JsonNode stats(String token, String days) throws Exception {
        var req = get("/api/admin/stats");
        if (days != null) req = req.param("days", days);
        return read(call(req, token, null).andExpect(status().isOk()));
    }

    @Test
    void stats_have_full_series_and_non_negative_counts() throws Exception { // SS-01
        String viewer = newStaff(Role.ADMIN);
        JsonNode s = stats(viewer, null);
        assertEquals(30, s.get("series").size());
        assertEquals(LocalDate.now(VN).toString(), s.get("series").get(29).get("date").asText());
        assertTrue(s.get("users").get("total").asLong() >= 1);
        assertTrue(s.get("decks").get("public").asLong() >= 0);
        assertTrue(s.get("extractions").get("failed").asLong() >= 0);
        assertTrue(s.get("openReports").asLong() >= 0);
        assertEquals(7, stats(viewer, "7").get("series").size());
    }

    @Test
    void new_users_and_jobs_today_show_up_in_counts_and_series() throws Exception { // SS-02
        String viewer = newStaff(Role.ADMIN);
        JsonNode before = stats(viewer, null);
        String u1 = newUser();
        newUser();
        call(multipart("/api/extractions").part(new MockPart("text", "猫が好きです。".getBytes(StandardCharsets.UTF_8))), u1, null)
                .andExpect(status().isAccepted());
        JsonNode after = stats(viewer, null);
        assertEquals(before.get("users").get("new7d").asLong() + 2, after.get("users").get("new7d").asLong());
        assertEquals(before.get("series").get(29).get("newUsers").asLong() + 2, after.get("series").get(29).get("newUsers").asLong());
        assertEquals(before.get("series").get(29).get("extractions").asLong() + 1, after.get("series").get(29).get("extractions").asLong());
        assertEquals(before.get("extractions").get("total").asLong() + 1, after.get("extractions").get("total").asLong());
    }

    @Test
    void days_is_bounded() throws Exception { // SS-03
        String viewer = newStaff(Role.ADMIN);
        call(get("/api/admin/stats").param("days", "6"), viewer, null).andExpect(status().isBadRequest());
        call(get("/api/admin/stats").param("days", "91"), viewer, null).andExpect(status().isBadRequest());
    }

    @Test
    void series_uses_vietnam_day_boundaries() throws Exception { // SS-05
        String viewer = newStaff(Role.ADMIN);
        String u = newUser();
        String id = read(call(multipart("/api/extractions").part(new MockPart("text", "猫が好きです。".getBytes(StandardCharsets.UTF_8))), u, null)
                .andExpect(status().isAccepted())).get("id").asText();
        JsonNode before = stats(viewer, null);
        // 06:30 hôm nay giờ VN = 23:30 hôm qua UTC: job phải nằm ở cột hôm nay, không phải hôm qua
        var at = LocalDate.now(VN).atTime(6, 30).atZone(VN).toInstant();
        jdbc.update("UPDATE extraction_jobs SET created_at = ? WHERE id = CAST(? AS uuid)", Timestamp.from(at), id);
        JsonNode after = stats(viewer, null);
        assertEquals(before.get("series").get(29).get("extractions").asLong(), after.get("series").get(29).get("extractions").asLong());
        assertEquals(before.get("series").get(28).get("extractions").asLong(), after.get("series").get(28).get("extractions").asLong());
    }

    @Test
    void active_users_are_counted_distinct() throws Exception { // SS-06
        String viewer = newStaff(Role.ADMIN);
        String u = newUser();
        JsonNode deck = read(call(post("/api/decks"), u, Map.of("title", "A", "level", "N5",
                "cards", List.of(Map.of("term", "猫", "meaning", "mèo")))).andExpect(status().isCreated()));
        String cardId = deck.get("cards").get(0).get("id").asText();
        long before = stats(viewer, null).get("users").get("active7d").asLong();
        for (int i = 0; i < 3; i++) {
            call(post("/api/reviews"), u, Map.of("cardId", cardId, "grade", "good")).andExpect(status().isOk());
        }
        assertEquals(before + 1, stats(viewer, null).get("users").get("active7d").asLong());
    }

    @Test
    void health_reports_ai_service_down_quickly() throws Exception { // SS-07
        String viewer = newStaff(Role.ADMIN);
        long t0 = System.currentTimeMillis();
        JsonNode h = read(call(get("/api/admin/health"), viewer, null).andExpect(status().isOk()));
        assertTrue(System.currentTimeMillis() - t0 < 5000, "không treo chờ ai-service");
        assertEquals("ok", h.get("db").asText());
        assertEquals("down", h.get("aiService").asText());
        assertFalse(h.get("version").asText().isBlank());
    }

    @Test
    void user_is_forbidden() throws Exception { // AZ-01
        String user = newUser();
        call(get("/api/admin/stats"), user, null).andExpect(status().isForbidden());
        call(get("/api/admin/health"), user, null).andExpect(status().isForbidden());
    }
    /** Lộ trình chèn thẳng qua repository (không cần ai-service): đủ trạng thái để kiểm từng ô của breakdown. */
    private void path(Long uid, String status, String sourceType, boolean completed) {
        LearningPath p = new LearningPath();
        p.setId(UUID.randomUUID());
        p.setUserId(uid);
        p.setTitle("LP");
        p.setSourceType(sourceType);
        p.setStatus(status);
        p.setTotalDays(7);
        p.setStartDate(LocalDate.now(VN));
        p.setCreatedAt(Instant.now());
        if (completed) p.setCompletedAt(Instant.now());
        pathRepo.save(p);
    }

    @Test
    void learning_path_breakdown_counts_active_completed_failed_remedial_draft() throws Exception { // 2.0 §4.5
        String viewer = newStaff(Role.ADMIN);
        String email = newEmail();
        newUser(email);
        Long uid = userId(email);
        JsonNode before = stats(viewer, null);
        JsonNode b = before.get("learningPathBreakdown");
        assertNotNull(b, before.toString());
        for (String k : new String[]{"active", "completed", "failed", "remedial", "draft"}) assertTrue(b.get(k).asLong() >= 0, k);

        path(uid, LearningPath.ACTIVE, "text", false);
        path(uid, LearningPath.ACTIVE, "text", true);          // đã chốt hoàn thành: không còn "active"
        path(uid, LearningPath.FAILED, "text", false);
        path(uid, LearningPath.DRAFT, "pdf", false);
        path(uid, LearningPath.ACTIVE, LearningPath.SOURCE_REMEDIAL, false); // bổ khuyết: đếm chéo, vẫn là active

        JsonNode after = stats(viewer, null);
        JsonNode a = after.get("learningPathBreakdown");
        assertEquals(before.get("learningPaths").asLong() + 5, after.get("learningPaths").asLong(), "tổng giữ kiểu long cho client cũ");
        assertEquals(b.get("active").asLong() + 2, a.get("active").asLong());
        assertEquals(b.get("completed").asLong() + 1, a.get("completed").asLong());
        assertEquals(b.get("failed").asLong() + 1, a.get("failed").asLong());
        assertEquals(b.get("draft").asLong() + 1, a.get("draft").asLong());
        assertEquals(b.get("remedial").asLong() + 1, a.get("remedial").asLong());
    }
}
