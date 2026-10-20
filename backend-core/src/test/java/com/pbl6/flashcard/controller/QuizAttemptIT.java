package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.model.QuizAttempt;
import com.pbl6.flashcard.repository.QuizAttemptRepository;
import com.pbl6.flashcard.repository.QuizQuestionRepository;
import com.pbl6.flashcard.service.AiServiceClient;
import com.pbl6.flashcard.service.QuizAiClient;
import com.pbl6.flashcard.service.QuizAiClient.ConjugationItem;
import com.pbl6.flashcard.service.QuizAiClient.ConjugationQuiz;
import com.pbl6.flashcard.service.QuizAiClient.DistractorInput;
import com.pbl6.flashcard.service.QuizAiClient.Distractors;
import com.pbl6.flashcard.service.QuizAiClient.Verb;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Điểm quiz đáng tin: chấm trên bản chụp đề server đã phát; 2 chế độ (practice / exam); khôi phục tiến độ;
 * nộp idempotent; hết giờ chấm các đáp án đã lưu. Đợt 2 (hợp đồng §1.2): loại câu hỏi xoay vòng, câu gõ chấm sau chuẩn hoá
 * kana, câu chia động từ / chữ giống hình / đồng âm với ai-service giả lập qua {@link QuizAiClient}.
 */
class QuizAttemptIT extends IntegrationTest {

    private static final String DECK = "n5-core";
    private static final String ATTEMPTS = "/api/quiz-attempts";

    @Autowired
    QuizAttemptRepository attempts;

    @Autowired
    QuizQuestionRepository questionBank;

    @MockitoBean
    QuizAiClient quizAi;

    @BeforeEach
    void resetAi() {
        Mockito.reset(quizAi);
    }

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
    void only_practice_answers_move_the_srs_schedule_exam_does_not() throws Exception {
        String token = newUser();
        JsonNode practice = create(token, "practice", 5);
        JsonNode q = practice.get("questions").get(0);
        String card = q.get("cardId").asText();
        answerOk(token, practice.get("attemptId").asText(), card, correct(token, card));
        JsonNode reviews = read(call(get("/api/reviews"), token, null).andExpect(status().isOk()));
        assertEquals(1, reviews.size(), "practice trả lời đúng -> thẻ có lịch ôn");
        assertEquals(1, reviews.get(0).get("intervalDays").asInt(), "đúng = 'Tốt' lần đầu = 1 ngày");

        String other = newUser();
        JsonNode exam = create(other, "exam", 5);
        String examCard = exam.get("questions").get(0).get("cardId").asText();
        answerOk(other, exam.get("attemptId").asText(), examCard, correct(other, examCard));
        assertEquals(0, read(call(get("/api/reviews"), other, null)).size(), "exam không đụng lịch ôn");
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
        // Lần mở trả hạn tính trong RAM, lần nối lại đọc từ DB (timestamptz, micro giây): server làm tròn xuống micro giây khi mở
        assertEquals(first.get("expiresAt").asText(), second.get("expiresAt").asText(), "hạn nộp không đổi");

        JsonNode open = read(call(get(ATTEMPTS + "/open").param("deckId", DECK), token, null).andExpect(status().isOk()));
        assertEquals(first.get("attemptId"), open.get("attemptId"));
        assertEquals(first.get("expiresAt").asText(), open.get("expiresAt").asText());
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

    // ---------- quiz đa loại (hợp đồng đợt 2 §1.2) ----------

    private static Map<String, Object> card(String term, String reading, String meaning, String pos) {
        Map<String, Object> m = new HashMap<>();
        m.put("term", term);
        if (reading != null) m.put("reading", reading);
        m.put("meaning", meaning);
        if (pos != null) m.put("pos", pos);
        return m;
    }

    /** 書く (động từ), 待つ (thẻ tay thiếu pos, đuôi hàng う), 学校 và 山 (danh từ); thẻ nào cũng có cách đọc. */
    private String typedDeck(String token) throws Exception {
        return read(call(post("/api/decks"), token, Map.of("title", "Đa loại", "level", "N5", "cards", List.of(
                card("書く", "かく", "viết\nVí dụ: 手紙を書く", "動詞"),
                card("待つ", "まつ", "chờ đợi", null),
                card("学校", "がっこう", "trường học", "名詞"),
                card("山", "やま", "núi", "名詞")))).andExpect(status().isCreated())).get("id").asText();
    }

    private JsonNode createTyped(String token, String deckId, String mode, int size, List<String> types) throws Exception {
        return read(call(post(ATTEMPTS), token, Map.of("deckId", deckId, "size", size, "mode", mode, "questionTypes", types))
                .andExpect(status().isOk()));
    }

    private static List<JsonNode> questions(JsonNode paper, String type) {
        List<JsonNode> out = new ArrayList<>();
        for (JsonNode q : paper.get("questions")) if (type.equals(q.get("type").asText())) out.add(q);
        return out;
    }

    private static JsonNode byTerm(JsonNode paper, String term) {
        for (JsonNode q : paper.get("questions")) if (term.equals(q.get("term").asText())) return q;
        throw new AssertionError("đề không có câu của " + term + ": " + paper.get("questions"));
    }

    private void finish(String token, JsonNode paper) throws Exception {
        call(post(ATTEMPTS + "/" + paper.get("attemptId").asText() + "/submit"), token, Map.of()).andExpect(status().isOk());
    }

    private static Map<String, Object> candidate(String term, String reading) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("term", term);
        m.put("reading", reading);
        m.put("meaning", null);
        m.put("level", "N5");
        m.put("confidence", 0.9);
        return m;
    }

    /** ai-service giả: chỉ 書く có chữ giống hình (昼) và từ đồng âm (掻く, 欠く); sinh qua API như người dùng bấm nút. */
    private void generateDistractors(String token, String deckId) throws Exception {
        Mockito.when(quizAi.distractors(anyList())).thenAnswer(inv -> {
            List<DistractorInput> in = inv.getArgument(0);
            List<Distractors> out = new ArrayList<>();
            for (DistractorInput i : in) {
                boolean kaku = "書く".equals(i.term());
                out.add(new Distractors(i.ref(), kaku ? List.of(candidate("昼", "ひる")) : List.of(),
                        kaku ? List.of(candidate("掻く", "かく"), candidate("欠く", "かく")) : List.of()));
            }
            return out;
        });
        call(post("/api/decks/" + deckId + "/distractors"), token, null).andExpect(status().isOk());
    }

    /** ai-service giả cho câu chia động từ: 書く -> thể て, 待つ -> thể ない; từ khác không phải động từ (bị bỏ qua). */
    private void stubConjugation() {
        Mockito.when(quizAi.conjugationQuiz(anyList(), any(), anyInt(), anyLong())).thenAnswer(inv -> {
            List<Verb> in = inv.getArgument(0);
            List<ConjugationItem> items = new ArrayList<>();
            for (Verb v : in) {
                if ("書く".equals(v.term())) {
                    items.add(new ConjugationItem("書く", "書く", "かく", "godan", "te", "thể て",
                            "Chia động từ 「書く（かく）」 sang thể て.", "書いて", List.of("書きて", "書いて", "書って", "書かて"),
                            "手紙を書いてください。"));
                }
                if ("待つ".equals(v.term())) {
                    items.add(new ConjugationItem("待つ", "待つ", "まつ", "godan", "nai", "thể ない",
                            "Chia động từ 「待つ（まつ）」 sang thể ない.", "待たない", List.of("待たない", "待ちない", "待つない", "待てない"),
                            null));
                }
            }
            return new ConjugationQuiz(items, List.of());
        });
    }

    @Test
    void default_attempt_is_meaning_choice_and_every_question_is_stored_in_the_bank() throws Exception {
        String token = newUser();
        JsonNode paper = create(token, "practice", 5);
        for (JsonNode q : paper.get("questions")) {
            assertEquals("meaning", q.get("type").asText());
            assertEquals("choice", q.get("inputMode").asText());
            assertFalse(q.has("prompt"), "câu nghĩa không có prompt: client hiện từ như trước");
            var row = questionBank.findById(UUID.fromString(q.get("questionId").asText())).orElseThrow();
            assertEquals("MEANING", row.getKind());
            assertEquals(q.get("cardId").asText(), row.getCardId());
            assertEquals(DECK, row.getDeckId());
            assertEquals("ACTIVE", row.getStatus());
            Set<String> options = new HashSet<>();
            q.get("options").forEach(o -> options.add(o.asText()));
            assertEquals(options, Set.copyOf(row.getOptions()), "ngân hàng lưu đúng bộ phương án đã phát");
        }
        // Đáp án đúng vẫn chỉ lộ sau khi trả lời; feedback không có example với câu nghĩa
        JsonNode q0 = paper.get("questions").get(0);
        JsonNode fb = answerOk(token, paper.get("attemptId").asText(), q0.get("cardId").asText(),
                correct(token, q0.get("cardId").asText())).get("feedback");
        assertTrue(fb.get("correct").asBoolean());
        assertFalse(fb.has("example"));
        Mockito.verifyNoInteractions(quizAi);

        call(post(ATTEMPTS), token, Map.of("deckId", DECK, "size", 5, "mode", "exam", "questionTypes", List.of("cheat")))
                .andExpect(status().isBadRequest());
        call(post(ATTEMPTS), token, Map.of("deckId", DECK, "size", 5, "mode", "exam",
                "questionTypes", List.of("meaning", "reading", "homophone", "kanji_lookalike", "conjugation", "meaning")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void mixed_types_rotate_in_the_requested_order_and_typing_questions_hide_the_reading() throws Exception {
        String token = newUser();
        String deck = typedDeck(token);
        JsonNode paper = createTyped(token, deck, "exam", 4, List.of("meaning", "reading"));
        assertEquals(4, paper.get("questions").size());
        assertEquals(2, questions(paper, "meaning").size(), "mọi thẻ hỗ trợ cả hai loại -> chia đều theo vòng");
        assertEquals(2, questions(paper, "reading").size());
        for (JsonNode q : questions(paper, "reading")) {
            assertEquals("typing", q.get("inputMode").asText());
            assertEquals(0, q.get("options").size(), "câu gõ: options = []");
            assertTrue(q.get("reading").isNull(), "cách đọc là đáp án: chưa lộ thì không gửi");
            assertEquals("Cách đọc của 「" + q.get("term").asText() + "」 là gì?", q.get("prompt").asText());
            assertTrue(q.hasNonNull("questionId"));
        }
        for (JsonNode q : questions(paper, "meaning")) assertEquals("choice", q.get("inputMode").asText());
        Mockito.verifyNoInteractions(quizAi);
    }

    @Test
    void typing_answers_are_graded_after_kana_normalisation_in_both_modes() throws Exception {
        String token = newUser();
        String deck = typedDeck(token);
        JsonNode paper = createTyped(token, deck, "practice", 4, List.of("reading"));
        String id = paper.get("attemptId").asText();
        assertEquals(4, questions(paper, "reading").size());

        String school = byTerm(paper, "学校").get("cardId").asText();
        JsonNode fb = answerOk(token, id, school, "ガッ コウ。").get("feedback");
        assertTrue(fb.get("correct").asBoolean(), "katakana + khoảng trắng + dấu câu vẫn đúng");
        assertEquals("がっこう", fb.get("correctAnswer").asText());

        String mountain = byTerm(paper, "山").get("cardId").asText();
        JsonNode wrong = answerOk(token, id, mountain, "やめ").get("feedback");
        assertFalse(wrong.get("correct").asBoolean());
        assertEquals("やま", wrong.get("correctAnswer").asText());

        answer(token, id, byTerm(paper, "書く").get("cardId").asText(), "か".repeat(101), 400);

        JsonNode restored = read(call(get(ATTEMPTS + "/" + id), token, null).andExpect(status().isOk()));
        JsonNode schoolState = byTerm(restored, "学校");
        assertEquals("ガッ コウ。", schoolState.get("chosen").asText(), "lưu đúng chuỗi đã gõ để xem lại");
        assertEquals("がっこう", schoolState.get("reading").asText(), "đã lộ đáp án -> có cách đọc");
        assertTrue(byTerm(restored, "待つ").get("reading").isNull(), "câu chưa trả lời vẫn kín");
        finish(token, paper);

        // exam: tự lưu + đáp án gửi kèm khi nộp đều chấm sau chuẩn hoá
        JsonNode exam = createTyped(token, deck, "exam", 4, List.of("reading"));
        String examId = exam.get("attemptId").asText();
        assertTrue(answerOk(token, examId, byTerm(exam, "待つ").get("cardId").asText(), "マツ").get("feedback").isNull(),
                "exam: tự lưu không lộ đáp án");
        Map<String, String> late = new HashMap<>();
        late.put(byTerm(exam, "書く").get("cardId").asText(), " かく ");
        late.put(byTerm(exam, "学校").get("cardId").asText(), "がこう");
        JsonNode outcome = read(call(post(ATTEMPTS + "/" + examId + "/submit"), token, Map.of("answers", late))
                .andExpect(status().isOk()));
        assertEquals(2, outcome.get("score").asInt(), "待つ (マツ) + 書く");
        assertEquals(4, outcome.get("total").asInt());
        assertEquals("がっこう", outcome.get("wrong").get(byTerm(exam, "学校").get("cardId").asText()).asText());
    }

    @Test
    void lookalike_and_homophone_questions_keep_the_term_secret_until_feedback() throws Exception {
        String token = newUser();
        String deck = typedDeck(token);
        generateDistractors(token, deck);

        JsonNode paper = createTyped(token, deck, "practice", 4, List.of("kanji_lookalike"));
        List<JsonNode> look = questions(paper, "kanji_lookalike");
        assertEquals(1, look.size(), "chỉ 書く có chữ giống hình");
        assertEquals(3, questions(paper, "meaning").size(), "thẻ khác -> câu nghĩa");
        JsonNode q = look.get(0);
        assertEquals("", q.get("term").asText(), "thuật ngữ là đáp án: chưa lộ thì không gửi");
        assertTrue(q.get("reading").isNull());
        assertEquals("Chữ nào có nghĩa 'viết' (かく)?", q.get("prompt").asText());
        Set<String> options = new HashSet<>();
        q.get("options").forEach(o -> options.add(o.asText()));
        assertEquals(Set.of("書く", "昼"), options);
        String id = paper.get("attemptId").asText();
        JsonNode fb = answerOk(token, id, q.get("cardId").asText(), "書く").get("feedback");
        assertTrue(fb.get("correct").asBoolean());
        assertEquals("書く", fb.get("correctAnswer").asText());
        assertEquals("Ví dụ: 手紙を書く", fb.get("explanation").asText());
        JsonNode revealed = questions(read(call(get(ATTEMPTS + "/" + id), token, null)), "kanji_lookalike").get(0);
        assertEquals("書く", revealed.get("term").asText(), "đã trả lời -> hiện đủ");
        assertEquals("かく", revealed.get("reading").asText());
        finish(token, paper);

        JsonNode homo = createTyped(token, deck, "practice", 4, List.of("homophone"));
        JsonNode h = questions(homo, "homophone").get(0);
        assertEquals("Từ đồng âm nào có nghĩa 'viết' (かく)?", h.get("prompt").asText());
        Set<String> homoOptions = new HashSet<>();
        h.get("options").forEach(o -> homoOptions.add(o.asText()));
        assertEquals(Set.of("書く", "掻く", "欠く"), homoOptions);
        assertFalse(answerOk(token, homo.get("attemptId").asText(), h.get("cardId").asText(), "掻く")
                .get("feedback").get("correct").asBoolean());
    }

    @Test
    @SuppressWarnings("unchecked")
    void conjugation_comes_from_ai_service_and_failure_silently_falls_back_to_meaning() throws Exception {
        String token = newUser();
        String deck = typedDeck(token);
        stubConjugation();

        JsonNode paper = createTyped(token, deck, "practice", 4, List.of("conjugation"));
        ArgumentCaptor<List<Verb>> sent = ArgumentCaptor.forClass(List.class);
        Mockito.verify(quizAi).conjugationQuiz(sent.capture(), Mockito.isNull(), Mockito.eq(1), anyLong());
        assertEquals(Set.of("書く", "待つ"), sent.getValue().stream().map(Verb::term).collect(java.util.stream.Collectors.toSet()),
                "động từ theo pos + thẻ thiếu pos đuôi hàng う; danh từ không gửi");
        List<JsonNode> conj = questions(paper, "conjugation");
        assertEquals(2, conj.size());
        assertEquals(2, questions(paper, "meaning").size());
        JsonNode kaku = byTerm(paper, "書く");
        assertEquals("conjugation", kaku.get("type").asText());
        assertEquals("Chia động từ 「書く（かく）」 sang thể て.", kaku.get("prompt").asText());
        assertEquals("かく", kaku.get("reading").asText(), "thuật ngữ / cách đọc không phải đáp án của câu chia động từ");
        JsonNode fb = answerOk(token, paper.get("attemptId").asText(), kaku.get("cardId").asText(), "書いて").get("feedback");
        assertTrue(fb.get("correct").asBoolean());
        assertEquals("手紙を書いてください。", fb.get("example").asText());
        String kakuQuestion = kaku.get("questionId").asText();
        assertEquals("AI", questionBank.findById(UUID.fromString(kakuQuestion)).orElseThrow().getGenerator());
        finish(token, paper);

        // ai-service tắt: bộ thẻ mới (ngân hàng trống) -> mọi câu là nghĩa, vẫn 200
        Mockito.reset(quizAi);
        Mockito.when(quizAi.conjugationQuiz(anyList(), any(), anyInt(), anyLong()))
                .thenThrow(new AiServiceClient.AiServiceException("Không kết nối được dịch vụ AI."));
        String fresh = typedDeck(token);
        JsonNode fallback = createTyped(token, fresh, "practice", 4, List.of("conjugation"));
        assertEquals(4, questions(fallback, "meaning").size());

        // ... còn bộ đã có câu chia động từ trong ngân hàng thì bốc từ ngân hàng
        JsonNode fromBank = createTyped(token, deck, "practice", 4, List.of("conjugation"));
        assertEquals(kakuQuestion, byTerm(fromBank, "書く").get("questionId").asText());
        assertEquals("conjugation", byTerm(fromBank, "書く").get("type").asText());
    }
}
