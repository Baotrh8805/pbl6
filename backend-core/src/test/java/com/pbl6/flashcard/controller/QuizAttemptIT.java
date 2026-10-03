package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.model.QuizAttempt;
import com.pbl6.flashcard.repository.QuizAttemptRepository;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Điểm quiz đáng tin: chấm trên bản chụp đề server đã phát; 2 chế độ (practice / exam); khôi phục tiến độ;
 * nộp idempotent; hết giờ chấm các đáp án đã lưu.
 */
class QuizAttemptIT extends IntegrationTest {

    private static final String DECK = "n5-core";
    private static final String ATTEMPTS = "/api/quiz-attempts";

    @Autowired
    QuizAttemptRepository attempts;

    private JsonNode create(String token, String mode, int size) throws Exception {
        return read(call(post(ATTEMPTS), token, Map.of("deckId", DECK, "size", size, "mode", mode))
                .andExpect(status().isOk()));
    }

    /** Đáp án đúng của thẻ = dòng đầu của nội dung (lấy qua API bộ thẻ, như người dùng có quyền đọc bộ thẻ). */
    private String correct(String token, String cardId) throws Exception {
        for (JsonNode c : read(call(get("/api/decks/" + DECK), token, null)).get("cards")) {
            if (c.get("id").asText().equals(cardId)) return c.get("meaning").asText().lines().findFirst().orElse("");
        }
        throw new AssertionError("không có thẻ " + cardId);
    }

    private String wrongOption(JsonNode question, String correct) {
        for (JsonNode o : question.get("options")) if (!o.asText().equals(correct)) return o.asText();
        throw new AssertionError("đề không có lựa chọn sai");
    }

    private void answer(String token, String attemptId, String cardId, String option, int expectedStatus) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("option", option);
        call(put(ATTEMPTS + "/" + attemptId + "/answers/" + cardId), token, body)
                .andExpect(status().is(expectedStatus));
    }

    private JsonNode answerOk(String token, String attemptId, String cardId, String option) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("option", option);
        return read(call(put(ATTEMPTS + "/" + attemptId + "/answers/" + cardId), token, body).andExpect(status().isOk()));
    }

    private void expire(String attemptId) throws Exception {
        QuizAttempt a = attempts.findById(UUID.fromString(attemptId)).orElseThrow();
        var field = QuizAttempt.class.getDeclaredField("expiresAt");
        field.setAccessible(true);
        field.set(a, Instant.now().minusSeconds(1));
        attempts.save(a);
    }

    // ---------- practice ----------

    @Test
    void practice_gives_feedback_per_question_locks_the_answer_and_never_leaks_unanswered() throws Exception {
        String token = newUser();
        JsonNode paper = create(token, "practice", 5);
        String id = paper.get("attemptId").asText();
        assertEquals("practice", paper.get("mode").asText());
        assertEquals(5, paper.get("questions").size());
        assertEquals(0, paper.get("timeLimitSeconds").asInt(), "practice không giới hạn giờ");
        paper.get("questions").forEach(q -> assertTrue(q.get("feedback").isNull(), "chưa trả lời thì không có đáp án"));

        JsonNode q0 = paper.get("questions").get(0);
        String card = q0.get("cardId").asText();
        String right = correct(token, card);
        String wrong = wrongOption(q0, right);

        // Trả lời sai: thấy đáp án đúng ngay
        JsonNode fb = answerOk(token, id, card, wrong).get("feedback");
        assertFalse(fb.get("correct").asBoolean());
        assertEquals(right, fb.get("correctAnswer").asText());

        // Khoá: gửi lại đáp án đúng không đổi được kết quả, trả lại đúng phản hồi cũ
        JsonNode again = answerOk(token, id, card, right).get("feedback");
        assertFalse(again.get("correct").asBoolean());

        // Lựa chọn không thuộc câu hỏi
        answer(token, id, paper.get("questions").get(1).get("cardId").asText(), "không có trong đề", 400);

        // Khôi phục: câu đã trả lời có phản hồi, câu chưa trả lời vẫn kín
        JsonNode restored = read(call(get(ATTEMPTS + "/" + id), token, null).andExpect(status().isOk()));
        assertEquals(wrong, restored.get("questions").get(0).get("chosen").asText());
        assertFalse(restored.get("questions").get(0).get("feedback").isNull());
        assertTrue(restored.get("questions").get(1).get("feedback").isNull());
        assertFalse(restored.get("finished").asBoolean());
    }

    @Test
    void starting_again_resumes_the_open_attempt_with_the_same_questions() throws Exception {
        String token = newUser();
        JsonNode first = create(token, "exam", 5);
        JsonNode second = create(token, "practice", 10);
        assertTrue(second.get("resumed").asBoolean());
        assertEquals(first.get("attemptId"), second.get("attemptId"));
        assertEquals("exam", second.get("mode").asText(), "chế độ không đổi giữa chừng");
        assertEquals(first.get("questions"), second.get("questions"), "đúng đề và thứ tự lựa chọn cũ");

        JsonNode open = read(call(get(ATTEMPTS + "/open").param("deckId", DECK), token, null).andExpect(status().isOk()));
        assertEquals(first.get("attemptId"), open.get("attemptId"));
        call(get(ATTEMPTS + "/open").param("deckId", "n4-society"), token, null).andExpect(status().isNoContent());
    }

    @Test
    void practice_with_no_answers_leaves_no_zero_score_result() throws Exception {
        String token = newUser();
        String id = create(token, "practice", 5).get("attemptId").asText();
        call(post(ATTEMPTS + "/" + id + "/submit"), token, Map.of()).andExpect(status().isOk());
        assertEquals(0, read(call(get("/api/quiz-results"), token, null)).size());
    }

    // ---------- exam ----------

    @Test
    void exam_hides_answers_until_submit_allows_changes_and_submit_is_idempotent() throws Exception {
        String token = newUser();
        JsonNode paper = create(token, "exam", 5);
        String id = paper.get("attemptId").asText();
        assertEquals(5 * 30, paper.get("timeLimitSeconds").asInt());

        JsonNode q0 = paper.get("questions").get(0);
        String card = q0.get("cardId").asText();
        String right = correct(token, card);

        // Tự lưu: không có phản hồi; chọn sai rồi đổi sang đúng
        assertTrue(answerOk(token, id, card, wrongOption(q0, right)).get("feedback").isNull());
        answerOk(token, id, card, right);

        // Trước khi nộp, trạng thái không lộ đáp án đúng
        JsonNode mid = read(call(get(ATTEMPTS + "/" + id), token, null));
        assertEquals(right, mid.get("questions").get(0).get("chosen").asText());
        mid.get("questions").forEach(q -> assertTrue(q.get("feedback").isNull()));
        assertTrue(mid.get("score").isNull());

        // Nộp: 1 đúng; 4 câu bỏ trống tính sai
        JsonNode outcome = read(call(post(ATTEMPTS + "/" + id + "/submit"), token, Map.of()).andExpect(status().isOk()));
        assertEquals(1, outcome.get("score").asInt());
        assertEquals(5, outcome.get("total").asInt());
        assertEquals(4, outcome.get("wrong").size());
        assertFalse(outcome.get("expired").asBoolean());

        // Nộp lại (mất response lần đầu): cùng kết quả, không ghi thêm kết quả
        JsonNode retry = read(call(post(ATTEMPTS + "/" + id + "/submit"), token, Map.of()).andExpect(status().isOk()));
        assertEquals(outcome, retry);
        assertEquals(1, read(call(get("/api/quiz-results"), token, null)).size());
        assertEquals("exam", read(call(get("/api/quiz-results"), token, null)).get(0).get("mode").asText());

        // Sau khi nộp: không lưu thêm được, nhưng xem lại có đáp án + lời giải
        answer(token, id, card, right, 409);
        JsonNode review = read(call(get(ATTEMPTS + "/" + id), token, null));
        assertTrue(review.get("finished").asBoolean());
        assertEquals(1, review.get("score").asInt());
        review.get("questions").forEach(q -> assertFalse(q.get("feedback").isNull()));
    }

    @Test
    void exam_submit_merges_client_answers_that_autosave_missed_and_ignores_unknown_ones() throws Exception {
        String token = newUser();
        JsonNode paper = create(token, "exam", 5);
        String id = paper.get("attemptId").asText();
        JsonNode q0 = paper.get("questions").get(0);
        String card = q0.get("cardId").asText();

        JsonNode outcome = read(call(post(ATTEMPTS + "/" + id + "/submit"), token, Map.of("answers",
                Map.of(card, correct(token, card), "n5-20-khong-co", "x", paper.get("questions").get(1).get("cardId").asText(), "không có trong đề")))
                .andExpect(status().isOk()));
        assertEquals(1, outcome.get("score").asInt());
        assertEquals(5, outcome.get("total").asInt(), "câu bỏ trống vẫn tính vào tổng");
    }

    // ---------- hết giờ ----------

    @Test
    void expired_attempt_grades_answers_saved_before_the_deadline_and_rejects_late_ones() throws Exception {
        String token = newUser();
        JsonNode paper = create(token, "exam", 5);
        String id = paper.get("attemptId").asText();
        String card = paper.get("questions").get(0).get("cardId").asText();
        String right = correct(token, card);
        answerOk(token, id, card, right); // lưu trước hạn

        expire(id);
        answer(token, id, paper.get("questions").get(1).get("cardId").asText(), right, 409);

        // Nộp muộn: đáp án gửi kèm bị bỏ, đáp án đã lưu trước hạn vẫn được tính
        JsonNode outcome = read(call(post(ATTEMPTS + "/" + id + "/submit"), token, Map.of("answers",
                Map.of(paper.get("questions").get(1).get("cardId").asText(), correct(token, paper.get("questions").get(1).get("cardId").asText()))))
                .andExpect(status().isOk()));
        assertTrue(outcome.get("expired").asBoolean());
        assertEquals(1, outcome.get("score").asInt());
    }

    @Test
    void abandoned_expired_attempt_is_closed_and_recorded_with_its_saved_answers() throws Exception {
        String token = newUser();
        JsonNode paper = create(token, "exam", 5);
        String id = paper.get("attemptId").asText();
        String card = paper.get("questions").get(0).get("cardId").asText();
        answerOk(token, id, card, correct(token, card));
        expire(id); // đóng tab, không bao giờ nộp

        JsonNode results = read(call(get("/api/quiz-results"), token, null));
        assertEquals(1, results.size());
        assertEquals(1, results.get(0).get("score").asInt());
        assertEquals(5, results.get(0).get("total").asInt());
        // Bộ thẻ Thư viện chưa lưu không có trong "Bộ thẻ của tôi": server trả kèm tên
        assertEquals("Từ vựng N5 cơ bản", results.get(0).get("deckTitle").asText());
        // Mở lượt mới được (lượt cũ đã đóng)
        assertFalse(create(token, "exam", 5).get("resumed").asBoolean());
    }

    // ---------- quyền và validate ----------

    @Test
    void attempts_belong_to_their_owner_and_requests_are_validated() throws Exception {
        String alice = newUser();
        JsonNode paper = create(alice, "exam", 5);
        String id = paper.get("attemptId").asText();
        String card = paper.get("questions").get(0).get("cardId").asText();
        String bob = newUser();

        call(get(ATTEMPTS + "/" + id), bob, null).andExpect(status().isNotFound());
        call(post(ATTEMPTS + "/" + id + "/submit"), bob, Map.of()).andExpect(status().isNotFound());
        answer(bob, id, card, "x", 404);
        call(get(ATTEMPTS + "/" + UUID.randomUUID()), alice, null).andExpect(status().isNotFound());
        answer(alice, id, "n5-20-khong-co", "x", 404);

        call(post(ATTEMPTS), alice, Map.of("deckId", DECK, "size", 0, "mode", "exam")).andExpect(status().isBadRequest());
        call(post(ATTEMPTS), alice, Map.of("deckId", DECK, "size", 51, "mode", "exam")).andExpect(status().isBadRequest());
        call(post(ATTEMPTS), alice, Map.of("deckId", DECK, "size", 5, "mode", "cheat")).andExpect(status().isBadRequest());
        call(post(ATTEMPTS), bob, Map.of("deckId", "khong-co-bo-the", "size", 5, "mode", "exam")).andExpect(status().isNotFound());
    }

    @Test
    void preview_does_not_open_an_attempt() throws Exception {
        String token = newUser();
        JsonNode sample = read(call(get("/api/quizzes/" + DECK + "/preview"), token, null).andExpect(status().isOk()));
        assertEquals(2, sample.size());
        long uid = read(call(get("/api/auth/me"), token, null)).get("id").asLong();
        assertTrue(attempts.findAll().stream().noneMatch(a -> a.getUserId().equals(uid)));
    }
}
