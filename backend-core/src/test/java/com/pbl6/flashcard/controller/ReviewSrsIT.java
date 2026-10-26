package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.model.LearningPath;
import com.pbl6.flashcard.repository.LearningPathRepository;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Lật thẻ đổi lịch SRS + ghi log; Học nhanh (cram) chỉ ghi log, không đổi lịch / không tạo tiến độ. */
class ReviewSrsIT extends IntegrationTest {

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    LearningPathRepository paths;

    /** Lộ trình chèn thẳng qua repository (không cần ai-service) để kiểm việc gắn lượt ôn với lộ trình. */
    private LearningPath path(Long uid) {
        LearningPath p = new LearningPath();
        p.setId(UUID.randomUUID());
        p.setUserId(uid);
        p.setTitle("LP");
        p.setSourceType("text");
        p.setStatus(LearningPath.ACTIVE);
        p.setTotalDays(7);
        p.setStartDate(LocalDate.of(2026, 11, 1));
        p.setCreatedAt(Instant.now());
        return paths.save(p);
    }

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
        JsonNode stored = read(call(get("/api/reviews"), token, null));
        assertEquals(1, stored.size());
        // Response lúc chấm mang dueAt trong RAM, GET đọc từ DB (timestamptz, micro giây): server làm tròn xuống micro giây
        assertEquals(lapsed.get("dueAt").asText(), stored.get(0).get("dueAt").asText());
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
        JsonNode normal = review(token, card, "good", false); // dueAt đã làm tròn micro giây như bản lưu trong DB
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
    /**
     * E1 (V20): reactionMs / pathId đi vào review_logs — cả phiên cram — chỉ là nhật ký (lịch SRS không đổi); client cũ không gửi
     * thì NULL; pathId không phải lộ trình của mình bị bỏ qua chứ không chặn; reactionMs ngoài 0–600000 → 400 và không ghi gì.
     */
    @Test
    void review_logs_keep_reaction_time_and_path_attribution() throws Exception {
        String email = newEmail();
        String token = newUser(email);
        Long uid = userId(email);
        String card = firstCard(token);

        JsonNode r = read(call(post("/api/reviews"), token, Map.of("cardId", card, "grade", "good", "reactionMs", 1234))
                .andExpect(status().isOk()));
        assertEquals(1, r.get("intervalDays").asInt(), "reactionMs không đổi thuật toán SRS");
        assertEquals(Integer.valueOf(1234), jdbc.queryForObject(
                "SELECT reaction_ms FROM review_logs WHERE user_id = ? AND card_id = ? AND source = 'flip'", Integer.class, uid, card));
        assertNull(jdbc.queryForObject(
                "SELECT path_id FROM review_logs WHERE user_id = ? AND card_id = ? AND source = 'flip'", Object.class, uid, card));

        // cram cũng ghi; pathId lạ (không tồn tại) hay lộ trình CỦA NGƯỜI KHÁC -> NULL (existsByIdAndUserId lọc theo người gọi, không
        // chỉ theo id), lượt chấm vẫn 200; lộ trình của chính mình -> ghi path_id
        String otherEmail = newEmail();
        newUser(otherEmail);
        LearningPath foreign = path(userId(otherEmail));
        LearningPath mine = path(uid);
        call(post("/api/reviews"), token, Map.of("cardId", card, "grade", "easy", "cram", true, "reactionMs", 777,
                "pathId", UUID.randomUUID().toString())).andExpect(status().isOk());
        call(post("/api/reviews"), token, Map.of("cardId", card, "grade", "easy", "cram", true, "reactionMs", 777,
                "pathId", foreign.getId().toString())).andExpect(status().isOk());
        assertEquals(Integer.valueOf(2), jdbc.queryForObject("SELECT count(*) FROM review_logs WHERE user_id = ? AND card_id = ? "
                + "AND source = 'cram' AND reaction_ms = 777 AND path_id IS NULL", Integer.class, uid, card));
        assertEquals(Integer.valueOf(0), jdbc.queryForObject(
                "SELECT count(*) FROM review_logs WHERE user_id = ? AND path_id IS NOT NULL", Integer.class, uid));
        call(post("/api/reviews"), token, Map.of("cardId", card, "grade", "easy", "cram", true, "reactionMs", 10,
                "pathId", mine.getId().toString())).andExpect(status().isOk());
        assertEquals(Integer.valueOf(1), jdbc.queryForObject(
                "SELECT count(*) FROM review_logs WHERE user_id = ? AND path_id = ?", Integer.class, uid, mine.getId()));

        // client 1.0 không gửi gì thêm
        call(post("/api/reviews"), token, Map.of("cardId", card, "grade", "good")).andExpect(status().isOk());
        assertEquals(Integer.valueOf(1), jdbc.queryForObject(
                "SELECT count(*) FROM review_logs WHERE user_id = ? AND reaction_ms IS NULL", Integer.class, uid));

        call(post("/api/reviews"), token, Map.of("cardId", card, "grade", "good", "reactionMs", -1)).andExpect(status().isBadRequest());
        call(post("/api/reviews"), token, Map.of("cardId", card, "grade", "good", "reactionMs", 600001)).andExpect(status().isBadRequest());
        call(post("/api/reviews"), token, Map.of("cardId", card, "grade", "good", "pathId", "không-phải-uuid")).andExpect(status().isBadRequest());
        assertEquals(Integer.valueOf(5), jdbc.queryForObject(
                "SELECT count(*) FROM review_logs WHERE user_id = ?", Integer.class, uid), "request bị từ chối không ghi log");
    }

    // ---------- Hoàn tác lượt chấm (spec 25/10 §3.8): POST /api/reviews/undo ----------

    private void undo(String token, String card, int expected) throws Exception {
        call(post("/api/reviews/undo"), token, Map.of("cardId", card)).andExpect(status().is(expected));
    }

    private JsonNode stored(String token) throws Exception {
        return read(call(get("/api/reviews"), token, null));
    }

    @Test
    void undo_restores_the_exact_previous_schedule_step_by_step() throws Exception {
        String email = newEmail();
        String token = newUser(email);
        Long uid = userId(email);
        String card = firstCard(token);

        review(token, card, "good", false);
        JsonNode afterGood = stored(token).get(0);
        review(token, card, "again", false);
        review(token, card, "good", false);
        assertEquals(3, jdbc.queryForObject("SELECT count(*) FROM review_logs WHERE user_id = ?", Integer.class, uid));

        undo(token, card, 204); // bỏ "good" thứ hai
        undo(token, card, 204); // bỏ "again" -> về đúng trạng thái sau lượt "good" đầu
        JsonNode now = stored(token).get(0);
        for (String f : new String[]{"intervalDays", "ease", "reps", "dueAt"}) {
            assertEquals(afterGood.get(f), now.get(f), "hoàn tác phải trả lại đúng " + f);
        }
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM review_logs WHERE user_id = ?", Integer.class, uid),
                "lượt đã hoàn tác bị xoá khỏi nhật ký (heatmap / chuỗi ngày không đếm)");

        undo(token, card, 204); // lượt đầu tiên: trước đó chưa có dòng reviews -> xoá dòng
        assertEquals(0, stored(token).size());
        undo(token, card, 409); // hết lượt để hoàn tác
    }

    @Test
    void undo_of_a_cram_review_only_drops_the_log() throws Exception {
        String email = newEmail();
        String token = newUser(email);
        Long uid = userId(email);
        String card = firstCard(token);

        JsonNode normal = review(token, card, "good", false);
        review(token, card, "again", true);
        undo(token, card, 204);
        JsonNode after = stored(token).get(0);
        for (String f : new String[]{"intervalDays", "ease", "reps", "dueAt"}) {
            assertEquals(normal.get(f), after.get(f), "hoàn tác cram không đổi " + f);
        }
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM review_logs WHERE user_id = ? AND source = 'cram'",
                Integer.class, uid));
    }

    @Test
    void undo_is_refused_when_too_old_from_quiz_legacy_or_someone_else() throws Exception {
        String email = newEmail();
        String token = newUser(email);
        Long uid = userId(email);
        String card = firstCard(token);
        String other = newUser();

        review(token, card, "good", false);
        undo(other, card, 409); // không phải lượt của mình
        jdbc.update("UPDATE review_logs SET reviewed_at = now() - interval '31 minutes' WHERE user_id = ?", uid);
        undo(token, card, 409); // quá 30 phút
        assertEquals(1, stored(token).size(), "bị từ chối thì không đổi gì");

        review(token, card, "good", false);
        jdbc.update("UPDATE review_logs SET prev_exists = NULL WHERE user_id = ?", uid); // log ghi trước V31
        undo(token, card, 409);

        jdbc.update("INSERT INTO review_logs (user_id, card_id, grade, source) VALUES (?, ?, 'again', 'quiz')", uid, card);
        undo(token, card, 409); // quiz không hoàn tác được
        assertEquals(3, jdbc.queryForObject("SELECT count(*) FROM review_logs WHERE user_id = ?", Integer.class, uid));

        call(post("/api/reviews/undo"), token, Map.of()).andExpect(status().isBadRequest());
    }
}
