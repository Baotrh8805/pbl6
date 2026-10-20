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
        // §8 health.engines: ai-service tắt -> object rỗng (không null, không lỗi)
        assertTrue(h.get("engines").isObject(), h.toString());
        assertEquals(0, h.get("engines").size());
        // Model AI chính: không kiểm tra được -> không có danh sách (trang cấu hình ghi "chưa kiểm tra được"), không lỗi
        assertTrue(h.path("aiModels").isMissingNode() || h.get("aiModels").isNull(), h.toString());
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

    // ---------- hợp đồng đợt 2: hàng đợi kiểm duyệt (§1.3, §4, §6) và thống kê AI (§8) ----------

    @Test
    void moderation_queues_count_open_flags_pending_mnemonics_and_open_appeals() throws Exception {
        String viewer = newStaff(Role.ADMIN);
        String email = newEmail();
        String token = newUser(email);
        Long uid = userId(email);
        JsonNode before = stats(viewer, null);
        for (String k : new String[]{"openQuestionFlags", "pendingMnemonics", "openAppeals"}) {
            assertTrue(before.get(k).isNumber() && before.get(k).asLong() >= 0, k + ": " + before);
        }

        JsonNode deck = read(call(post("/api/decks"), token, Map.of("title", "Q", "level", "N5",
                "cards", List.of(Map.of("term", "猫", "meaning", "mèo")))).andExpect(status().isCreated()));
        UUID q = UUID.randomUUID();
        jdbc.update("INSERT INTO quiz_questions (id, card_id, deck_id, kind, prompt, options, correct, generator) "
                        + "VALUES (?, ?, ?, 'MEANING', '猫', CAST(? AS jsonb), 'mèo', 'RULE')",
                q, deck.get("cards").get(0).get("id").asText(), deck.get("id").asText(), "[\"mèo\",\"chó\"]");
        jdbc.update("INSERT INTO question_flags (question_id, user_id, reason) VALUES (?, ?, 'TYPO')", q, uid);
        jdbc.update("INSERT INTO question_flags (question_id, user_id, reason, status, resolved_at) "
                + "VALUES (?, ?, 'OTHER', 'RESOLVED', now())", q, uid); // đã đóng: không đếm
        jdbc.update("INSERT INTO kanji_mnemonics (id, kanji, mnemonic_vi, source, created_by) VALUES (?, '休', 'Người tựa cây', 'USER', ?)",
                UUID.randomUUID(), uid);
        jdbc.update("INSERT INTO kanji_mnemonics (id, kanji, mnemonic_vi, source, status, reviewed_at, review_note) "
                + "VALUES (?, '休', 'Bị từ chối', 'USER', 'REJECTED', now(), 'x')", UUID.randomUUID());
        jdbc.update("INSERT INTO account_appeals (email, user_id, message) VALUES (?, ?, 'Xin mở khoá tài khoản')", email, uid);

        JsonNode after = stats(viewer, null);
        assertEquals(before.get("openQuestionFlags").asLong() + 1, after.get("openQuestionFlags").asLong());
        assertEquals(before.get("pendingMnemonics").asLong() + 1, after.get("pendingMnemonics").asLong());
        assertEquals(before.get("openAppeals").asLong() + 1, after.get("openAppeals").asLong());
    }

    /** Job chèn thẳng (không cần ai-service): started_at = createdAt, finished_at = createdAt + seconds (null = chưa kết thúc). */
    private void job(Long uid, String sourceType, String status, String textMeta, String stats, Instant createdAt, Integer seconds) {
        String stage = "DONE".equals(status) ? "DONE" : "FAILED".equals(status) ? "TEXT" : "QUEUED";
        jdbc.update("INSERT INTO extraction_jobs (id, user_id, source_type, source_name, status, stage, options, text_meta, stats, "
                        + "created_at, started_at, finished_at) VALUES (?, ?, ?, 'it', ?, ?, CAST('{}' AS jsonb), CAST(? AS jsonb), "
                        + "CAST(? AS jsonb), ?, ?, ?)",
                UUID.randomUUID(), uid, sourceType, status, stage, textMeta, stats, Timestamp.from(createdAt),
                Timestamp.from(createdAt), seconds == null ? null : Timestamp.from(createdAt.plusSeconds(seconds)));
    }

    private static JsonNode engine(JsonNode stats, String name) {
        for (JsonNode e : stats.get("ai").get("engines")) if (name.equals(e.get("engine").asText())) return e;
        return null;
    }

    private static JsonNode lastOcr(JsonNode stats, int fromEnd) {
        JsonNode s = stats.get("ocrSeries");
        return s.get(s.size() - 1 - fromEnd);
    }

    private static String meta(String engine, String meanConfidence, boolean low) {
        return "{\"engine\":\"" + engine + "\",\"meanConfidence\":" + meanConfidence + ",\"lowConfidence\":" + low + "}";
    }

    @Test
    void ai_engines_enrich_and_ocr_series_come_from_job_text_meta_and_stats() throws Exception { // G6
        String viewer = newStaff(Role.ADMIN);
        String email = newEmail();
        newUser(email);
        Long uid = userId(email);
        // engine riêng của test: nhóm của nó chỉ chứa các job dưới đây nên so được số tuyệt đối dù DB dùng chung
        String eng = "it-" + UUID.randomUUID().toString().substring(0, 8);
        Instant now = Instant.now();
        Instant yesterday = LocalDate.now(VN).minusDays(1).atTime(23, 30).atZone(VN).toInstant();

        JsonNode before = stats(viewer, null);
        JsonNode before90 = stats(viewer, "90");
        assertNull(engine(before, eng));

        job(uid, "image", "DONE", meta(eng, "0.8", false), "{\"enriched\":true}", now, 10);
        job(uid, "image", "DONE", meta(eng, "0.4", true), "{\"enriched\":false,\"enrichReason\":\"quota\"}", now, 20);
        job(uid, "image", "FAILED", "{\"engine\":\"" + eng + "\"}", null, now, 1);
        job(uid, "image", "CANCELLED", meta(eng, "0.1", true), null, now, null);   // huỷ: không đếm ở đâu cả
        job(uid, "image", "DONE", meta(eng, "0.6", false), null, now.minus(java.time.Duration.ofDays(40)), 5); // ngoài 30 ngày
        job(uid, "pdf", "DONE", "{\"engine\":\"gemini\",\"lowConfidence\":false}", "{\"enriched\":false}", now, 30); // Gemini dự phòng
        job(uid, "pdf", "DONE", "{\"engine\":\"pdf-text\"}", "{\"enriched\":false,\"enrichReason\":\"error\"}", now, 3); // không OCR
        job(uid, "image", "FAILED", null, null, now, 1);       // hỏng trước khi có text_meta -> engine suy ra tesseract
        job(uid, "image", "DONE", meta(eng, "0.9", false), null, yesterday, 4); // 23:30 hôm qua giờ VN

        JsonNode after = stats(viewer, null);
        JsonNode e = engine(after, eng);
        assertNotNull(e, after.get("ai").toString());
        assertEquals(4, e.get("total").asLong(), "DONE/FAILED trong 30 ngày, bỏ CANCELLED");
        assertEquals(1, e.get("failed").asLong());
        assertEquals(1, e.get("lowConfidence").asLong());
        assertEquals((0.8 + 0.4 + 0.9) / 3, e.get("avgConfidence").asDouble(), 0.001);
        assertEquals((10 + 20 + 4) / 3.0, e.get("avgSeconds").asDouble(), 0.1, "chỉ job DONE");
        assertEquals(5, engine(stats(viewer, "90"), eng).get("total").asLong(), "cửa sổ 90 ngày gồm cả job 40 ngày trước");
        assertTrue(engine(after, "tesseract").get("failed").asLong() >= 1, "job không text_meta vào nhóm tesseract");

        JsonNode be = before.get("ai").get("enrich");
        JsonNode ae = after.get("ai").get("enrich");
        assertEquals(be.get("total").asLong() + 3, ae.get("total").asLong(), "job không gọi dịch (enriched=false, không lý do) không đếm");
        assertEquals(be.get("enriched").asLong() + 1, ae.get("enriched").asLong());
        assertEquals(be.get("quota").asLong() + 1, ae.get("quota").asLong());
        assertEquals(be.get("error").asLong() + 1, ae.get("error").asLong());

        assertEquals(30, after.get("ocrSeries").size());
        assertEquals(90, before90.get("ocrSeries").size());
        assertEquals(after.get("series").get(29).get("date").asText(), lastOcr(after, 0).get("date").asText());
        JsonNode t0 = lastOcr(before, 0), t1 = lastOcr(after, 0);
        assertEquals(t0.get("ocrJobs").asLong() + 5, t1.get("ocrJobs").asLong(), "ảnh + PDF scan, bỏ pdf-text và CANCELLED");
        assertEquals(t0.get("failed").asLong() + 2, t1.get("failed").asLong());
        assertEquals(t0.get("lowConfidence").asLong() + 1, t1.get("lowConfidence").asLong());
        assertEquals(t0.get("geminiFallback").asLong() + 1, t1.get("geminiFallback").asLong());
        assertEquals((double) t1.get("failed").asLong() / t1.get("ocrJobs").asLong(), t1.get("errorRate").asDouble(), 0.0001);
        assertEquals(lastOcr(before, 1).get("ocrJobs").asLong() + 1, lastOcr(after, 1).get("ocrJobs").asLong(),
                "23:30 hôm qua giờ VN thuộc cột hôm qua");
    }
}
