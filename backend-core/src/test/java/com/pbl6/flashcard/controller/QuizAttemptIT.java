package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.model.QuizAttempt;
import com.pbl6.flashcard.repository.QuizAttemptRepository;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Điểm quiz đáng tin: chấm trên đề server đã phát, nộp 1 lần, bỏ dở = 0 điểm. */
class QuizAttemptIT extends IntegrationTest {

    private static final String QUIZ = "/api/quizzes/n5-core";

    @Autowired
    QuizAttemptRepository attempts;

    @Test
    void answering_only_known_cards_does_not_give_full_marks_and_attempt_is_single_use() throws Exception {
        String token = newUser();
        JsonNode paper = read(call(get(QUIZ).param("size", "5"), token, null).andExpect(status().isOk()));
        assertEquals(5, paper.get("questions").size());
        assertEquals(5 * 30, paper.get("timeLimitSeconds").asInt());
        String attemptId = paper.get("attemptId").asText();

        // Trả lời đúng 1 câu (nghĩa đúng của n5-1 là "nước"), bỏ trống phần còn lại + chèn cardId ngoài đề
        String firstCard = paper.get("questions").get(0).get("cardId").asText();
        JsonNode deck = read(call(get("/api/decks/n5-core"), token, null));
        String meaning = null;
        for (JsonNode c : deck.get("cards")) if (c.get("id").asText().equals(firstCard)) meaning = c.get("meaning").asText();

        JsonNode outcome = read(call(post(QUIZ), token, Map.of("attemptId", attemptId,
                "answers", Map.of(firstCard, meaning, "n5-20-khong-co", "x"))).andExpect(status().isOk()));
        assertEquals(1, outcome.get("score").asInt());
        assertEquals(5, outcome.get("total").asInt(), "câu bỏ trống vẫn tính vào tổng");
        assertEquals(4, outcome.get("wrong").size());
        assertFalse(outcome.get("expired").asBoolean());

        call(post(QUIZ), token, Map.of("attemptId", attemptId, "answers", Map.of())).andExpect(status().isConflict());
    }

    @Test
    void attempts_are_bound_to_their_owner_and_deck_and_validated() throws Exception {
        String alice = newUser();
        String attemptId = read(call(get(QUIZ), alice, null)).get("attemptId").asText();

        call(post(QUIZ), newUser(), Map.of("attemptId", attemptId, "answers", Map.of())).andExpect(status().isNotFound());
        call(post("/api/quizzes/n4-society"), alice, Map.of("attemptId", attemptId, "answers", Map.of()))
                .andExpect(status().isNotFound());
        call(post(QUIZ), alice, Map.of("attemptId", UUID.randomUUID().toString(), "answers", Map.of()))
                .andExpect(status().isNotFound());
        call(post(QUIZ), alice, Map.of("answers", Map.of())).andExpect(status().isBadRequest());
        call(get(QUIZ).param("size", "0"), alice, null).andExpect(status().isBadRequest());
        call(get(QUIZ).param("size", "51"), alice, null).andExpect(status().isBadRequest());
    }

    @Test
    void preview_does_not_open_an_attempt() throws Exception {
        String token = newUser();
        JsonNode sample = read(call(get(QUIZ + "/preview"), token, null).andExpect(status().isOk()));
        assertEquals(2, sample.size());
        long uid = read(call(get("/api/auth/me"), token, null)).get("id").asLong();
        assertTrue(attempts.findAll().stream().noneMatch(a -> a.getUserId().equals(uid)));
    }

    @Test
    void abandoned_expired_attempt_is_recorded_as_zero_and_late_submission_is_not_graded() throws Exception {
        String token = newUser();
        long uid = read(call(get("/api/auth/me"), token, null)).get("id").asLong();

        // Lượt đã quá hạn, chưa nộp (đóng tab giữa chừng)
        QuizAttempt abandoned = attempts.save(new QuizAttempt(uid, "n5-core", List.of("n5-1", "n5-2"),
                Instant.now().minusSeconds(3600), Instant.now().minusSeconds(60)));
        JsonNode results = read(call(get("/api/quiz-results"), token, null));
        assertEquals(1, results.size());
        assertEquals(0, results.get(0).get("score").asInt());
        assertEquals(2, results.get(0).get("total").asInt());
        // Bộ thẻ Thư viện chưa lưu không có trong "Bộ thẻ của tôi": server trả kèm tên
        assertEquals("Từ vựng N5 cơ bản", results.get(0).get("deckTitle").asText());
        call(post(QUIZ), token, Map.of("attemptId", abandoned.getId().toString(), "answers", Map.of("n5-1", "nước")))
                .andExpect(status().isConflict());

        // Nộp sau hạn: không chấm đáp án, ghi 0 điểm
        QuizAttempt late = attempts.save(new QuizAttempt(uid, "n5-core", List.of("n5-1"),
                Instant.now().minusSeconds(3600), Instant.now().plusSeconds(3600)));
        attempts.save(expire(late));
        JsonNode outcome = read(call(post(QUIZ), token, Map.of("attemptId", late.getId().toString(),
                "answers", Map.of("n5-1", "nước"))).andExpect(status().isOk()));
        assertTrue(outcome.get("expired").asBoolean());
        assertEquals(0, outcome.get("score").asInt());
    }

    private static QuizAttempt expire(QuizAttempt a) throws Exception {
        var field = QuizAttempt.class.getDeclaredField("expiresAt");
        field.setAccessible(true);
        field.set(a, Instant.now().minusSeconds(1));
        return a;
    }
}
