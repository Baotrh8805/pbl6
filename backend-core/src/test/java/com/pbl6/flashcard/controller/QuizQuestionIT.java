package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.repository.AdminAuditLogRepository;
import com.pbl6.flashcard.service.QuestionBankService;
import com.pbl6.flashcard.service.QuizAiClient;
import com.pbl6.flashcard.service.QuizService;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Ngân hàng câu hỏi (hợp đồng đợt 2 §1.2–1.3, G3): người học báo lỗi câu hỏi (201 / 409 / 429), admin xem / sửa / ẩn / hiện lại
 * câu và đóng báo lỗi — mỗi thao tác ghi đúng một dòng audit (target QUESTION); người học gọi API admin = 403. Mỗi test dùng
 * bộ thẻ riêng: sửa / ẩn câu của bộ Thư viện dùng chung sẽ làm lệch các test quiz khác.
 */
class QuizQuestionIT extends IntegrationTest {

    private static final String ATTEMPTS = "/api/quiz-attempts";
    private static final String ADMIN_QUESTIONS = "/api/admin/questions";

    /** Không gọi tới; khai báo để dùng chung ngữ cảnh Spring với QuizAttemptIT / DeckCapabilitiesIT. */
    @MockitoBean
    QuizAiClient quizAi;

    @Autowired
    AdminAuditLogRepository auditLogs;

    @Autowired
    QuestionBankService bank;

    @Autowired
    PlatformTransactionManager txManager;

    @Autowired
    JdbcTemplate jdbc;

    private record Account(String email, String token) {}

    private Account user() throws Exception {
        String email = newEmail();
        return new Account(email, newUser(email));
    }

    /** 山 / 川 / 海: nghĩa khác nhau, có cách đọc -> ra được câu nghĩa và câu gõ. */
    private String deck3(String token) throws Exception {
        List<Map<String, String>> cards = List.of(
                Map.of("term", "山", "reading", "やま", "meaning", "núi"),
                Map.of("term", "川", "reading", "かわ", "meaning", "sông"),
                Map.of("term", "海", "reading", "うみ", "meaning", "biển"));
        return read(call(post("/api/decks"), token, Map.of("title", "Ngân hàng", "level", "N5", "cards", cards))
                .andExpect(status().isCreated())).get("id").asText();
    }

    private JsonNode start(String token, String deckId, int size, List<String> types) throws Exception {
        Map<String, Object> body = new HashMap<>(Map.of("deckId", deckId, "size", size, "mode", "practice"));
        if (types != null) body.put("questionTypes", types);
        return read(call(post(ATTEMPTS), token, body).andExpect(status().isOk()));
    }

    private void finish(String token, JsonNode paper) throws Exception {
        call(post(ATTEMPTS + "/" + paper.get("attemptId").asText() + "/submit"), token, Map.of()).andExpect(status().isOk());
    }

    private static JsonNode byTerm(JsonNode paper, String term) {
        for (JsonNode q : paper.get("questions")) if (term.equals(q.get("term").asText())) return q;
        throw new AssertionError("đề không có câu của " + term + ": " + paper.get("questions"));
    }

    /** Câu chọn đúng chữ / đồng âm giấu thuật ngữ tới khi lộ đáp án: tìm theo cardId. */
    private static JsonNode byCard(JsonNode paper, String cardId) {
        for (JsonNode q : paper.get("questions")) if (cardId.equals(q.get("cardId").asText())) return q;
        throw new AssertionError("đề không có câu của thẻ " + cardId + ": " + paper.get("questions"));
    }

    private String cardId(String token, String deckId, String term) throws Exception {
        for (JsonNode c : read(call(get("/api/decks/" + deckId), token, null)).get("cards")) {
            if (term.equals(c.get("term").asText())) return c.get("id").asText();
        }
        throw new AssertionError("không có thẻ " + term);
    }

    private static Set<String> options(JsonNode question) {
        Set<String> out = new HashSet<>();
        question.get("options").forEach(o -> out.add(o.asText()));
        return out;
    }

    private ResultActions flag(String token, String questionId, String reason, String detail) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("reason", reason);
        if (detail != null) body.put("detail", detail);
        return call(post("/api/quiz-questions/" + questionId + "/flags"), token, body);
    }

    private long audits(String action, String targetId) {
        return auditLogs.findAll().stream()
                .filter(l -> "QUESTION".equals(l.getTargetType()) && action.equals(l.getAction()) && targetId.equals(l.getTargetId()))
                .count();
    }

    private static Set<String> ids(JsonNode page) {
        Set<String> out = new HashSet<>();
        page.get("items").forEach(r -> out.add(r.get("id").asText()));
        return out;
    }

    @Test
    void learner_flags_a_question_once_and_admin_sees_the_open_flag() throws Exception {
        Account learner = user();
        String admin = newStaff(Role.ADMIN);
        String deckId = deck3(learner.token);
        JsonNode q0 = start(learner.token, deckId, 3, null).get("questions").get(0);
        String qid = q0.get("questionId").asText();
        long openBefore = bank.countOpenFlags();

        JsonNode created = read(flag(learner.token, qid, "WRONG_ANSWER", "  Đáp án sai  ").andExpect(status().isCreated()));
        assertEquals("OPEN", created.get("status").asText());
        assertTrue(created.get("id").asLong() > 0);
        flag(learner.token, qid, "TYPO", null).andExpect(status().isConflict());
        flag(learner.token, qid, "OTHER", " ").andExpect(status().isBadRequest());
        flag(learner.token, qid, "KHONG_CO", null).andExpect(status().isBadRequest());
        flag(learner.token, qid, "TYPO", "x".repeat(501)).andExpect(status().isBadRequest());
        flag(learner.token, UUID.randomUUID().toString(), "TYPO", null).andExpect(status().isNotFound());
        flag(learner.token, "khong-phai-uuid", "TYPO", null).andExpect(status().isBadRequest());
        flag(user().token, qid, "TYPO", null).andExpect(status().isNotFound()); // bộ thẻ riêng của người khác
        flag(admin, qid, "TYPO", null).andExpect(status().isForbidden()); // staff không dùng API học tập
        assertEquals(openBefore + 1, bank.countOpenFlags());

        JsonNode flagged = read(call(get(ADMIN_QUESTIONS).param("deckId", deckId).param("flagged", "true"), admin, null)
                .andExpect(status().isOk()));
        assertEquals(1, flagged.get("total").asInt());
        JsonNode row = flagged.get("items").get(0);
        assertEquals(qid, row.get("id").asText());
        assertEquals(deckId, row.get("deckId").asText());
        assertEquals("Ngân hàng", row.get("deckTitle").asText());
        assertEquals(q0.get("cardId").asText(), row.get("cardId").asText());
        assertEquals(q0.get("term").asText(), row.get("term").asText());
        assertEquals("MEANING", row.get("kind").asText());
        assertEquals(q0.get("term").asText(), row.get("prompt").asText(), "câu nghĩa lưu thuật ngữ làm prompt");
        assertEquals(3, row.get("options").size());
        assertEquals("ACTIVE", row.get("status").asText());
        assertEquals(1, row.get("flagCount").asInt());
        assertEquals(1, row.get("openFlags").asInt());
        assertEquals("RULE", row.get("generator").asText());
        assertTrue(row.hasNonNull("updatedAt"));
        assertEquals(3, read(call(get(ADMIN_QUESTIONS).param("deckId", deckId), admin, null)).get("total").asInt());

        JsonNode detail = read(call(get(ADMIN_QUESTIONS + "/" + qid), admin, null).andExpect(status().isOk()));
        assertEquals(qid, detail.get("id").asText(), "chi tiết = các trường của dòng + flags, cùng cấp");
        assertEquals(1, detail.get("openFlags").asInt());
        JsonNode f = detail.get("flags").get(0);
        assertEquals(learner.email, f.get("userEmail").asText());
        assertEquals("WRONG_ANSWER", f.get("reason").asText());
        assertEquals("Đáp án sai", f.get("detail").asText());
        assertEquals("OPEN", f.get("status").asText());
        call(get(ADMIN_QUESTIONS + "/" + UUID.randomUUID()), admin, null).andExpect(status().isNotFound());
    }

    @Test
    void more_than_20_flags_an_hour_is_429() throws Exception {
        Account learner = user();
        List<Map<String, String>> cards = new ArrayList<>();
        for (int i = 0; i < 21; i++) cards.add(Map.of("term", "語" + i, "meaning", "nghĩa " + i));
        String deckId = read(call(post("/api/decks"), learner.token, Map.of("title", "21", "level", "N5", "cards", cards))
                .andExpect(status().isCreated())).get("id").asText();
        JsonNode questions = start(learner.token, deckId, 21, null).get("questions");
        assertEquals(21, questions.size());
        for (int i = 0; i < 20; i++) {
            flag(learner.token, questions.get(i).get("questionId").asText(), "TYPO", null).andExpect(status().isCreated());
        }
        flag(learner.token, questions.get(20).get("questionId").asText(), "TYPO", null).andExpect(status().isTooManyRequests());
    }

    @Test
    void admin_edits_hides_unhides_and_resolves_with_one_audit_row_each() throws Exception {
        Account learner = user();
        String admin = newStaff(Role.ADMIN);
        String deckId = deck3(learner.token);
        JsonNode reading = start(learner.token, deckId, 3, List.of("reading"));
        String mountainQ = byTerm(reading, "山").get("questionId").asText();
        String riverQ = byTerm(reading, "川").get("questionId").asText();
        long flagId = read(flag(learner.token, mountainQ, "WRONG_ANSWER", null).andExpect(status().isCreated())).get("id").asLong();
        finish(learner.token, reading);

        // Người học không vào được API admin
        call(get(ADMIN_QUESTIONS), learner.token, null).andExpect(status().isForbidden());
        call(get(ADMIN_QUESTIONS + "/" + mountainQ), learner.token, null).andExpect(status().isForbidden());
        call(patch(ADMIN_QUESTIONS + "/" + mountainQ), learner.token, Map.of("correct", "x")).andExpect(status().isForbidden());
        call(post(ADMIN_QUESTIONS + "/" + riverQ + "/hide"), learner.token, null).andExpect(status().isForbidden());
        call(post(ADMIN_QUESTIONS + "/" + riverQ + "/unhide"), learner.token, null).andExpect(status().isForbidden());
        call(post("/api/admin/question-flags/" + flagId + "/resolve"), learner.token, Map.of()).andExpect(status().isForbidden());

        // Validate câu gõ
        call(patch(ADMIN_QUESTIONS + "/" + mountainQ), admin, Map.of("options", List.of("a", "b"), "correct", "a"))
                .andExpect(status().isBadRequest());
        call(patch(ADMIN_QUESTIONS + "/" + mountainQ), admin, Map.of("correct", "。")).andExpect(status().isBadRequest());
        call(patch(ADMIN_QUESTIONS + "/" + mountainQ), admin, Map.of("prompt", "  ")).andExpect(status().isBadRequest());
        call(patch(ADMIN_QUESTIONS + "/" + UUID.randomUUID()), admin, Map.of("correct", "x")).andExpect(status().isNotFound());
        assertEquals(0, audits("QUESTION_EDIT", mountainQ), "sửa hỏng không ghi audit");

        // Sửa đáp án câu gõ: thêm cách đọc thứ hai
        JsonNode edited = read(call(patch(ADMIN_QUESTIONS + "/" + mountainQ), admin, Map.of("correct", "やま、さん"))
                .andExpect(status().isOk()));
        assertEquals("やま、さん", edited.get("correct").asText());
        assertEquals(0, edited.get("options").size());
        assertEquals(1, audits("QUESTION_EDIT", mountainQ));
        call(patch(ADMIN_QUESTIONS + "/" + mountainQ), admin, Map.of("correct", "やま、さん")).andExpect(status().isOk());
        assertEquals(1, audits("QUESTION_EDIT", mountainQ), "không đổi gì: không ghi, không audit");

        // Ẩn câu của 川 (gọi lại không ghi thêm)
        assertEquals("HIDDEN", read(call(post(ADMIN_QUESTIONS + "/" + riverQ + "/hide"), admin, null)
                .andExpect(status().isOk())).get("status").asText());
        call(post(ADMIN_QUESTIONS + "/" + riverQ + "/hide"), admin, null).andExpect(status().isOk());
        assertEquals(1, audits("QUESTION_HIDE", riverQ));
        JsonNode hiddenList = read(call(get(ADMIN_QUESTIONS).param("deckId", deckId).param("status", "HIDDEN"), admin, null));
        assertEquals(Set.of(riverQ), ids(hiddenList));

        // Lượt mới: câu đã ẩn không ra lại (thẻ đó ra câu nghĩa); câu đã sửa được dùng lại và chấm theo bản sửa
        JsonNode again = start(learner.token, deckId, 3, List.of("reading"));
        JsonNode river = byTerm(again, "川");
        assertEquals("meaning", river.get("type").asText());
        again.get("questions").forEach(q -> assertNotEquals(riverQ, q.get("questionId").asText()));
        JsonNode mountain = byTerm(again, "山");
        assertEquals(mountainQ, mountain.get("questionId").asText());
        JsonNode fb = read(call(put(ATTEMPTS + "/" + again.get("attemptId").asText() + "/answers/" + mountain.get("cardId").asText()),
                learner.token, Map.of("option", "サン")).andExpect(status().isOk())).get("feedback");
        assertTrue(fb.get("correct").asBoolean(), "cách đọc admin thêm được chấp nhận");
        assertEquals("やま、さん", fb.get("correctAnswer").asText());

        // Sửa câu nghĩa: đáp án phải nằm trong phương án, 2..8 phương án, không trùng
        String riverMeaningQ = river.get("questionId").asText();
        call(patch(ADMIN_QUESTIONS + "/" + riverMeaningQ), admin, Map.of("options", List.of("biển", "núi"), "correct", "sông"))
                .andExpect(status().isBadRequest());
        call(patch(ADMIN_QUESTIONS + "/" + riverMeaningQ), admin, Map.of("options", List.of("sông"), "correct", "sông"))
                .andExpect(status().isBadRequest());
        call(patch(ADMIN_QUESTIONS + "/" + riverMeaningQ), admin, Map.of("options", List.of("sông", "sông "), "correct", "sông"))
                .andExpect(status().isBadRequest());
        JsonNode meaningEdit = read(call(patch(ADMIN_QUESTIONS + "/" + riverMeaningQ), admin,
                Map.of("options", List.of("sông", "rừng", "biển"), "correct", "sông")).andExpect(status().isOk()));
        assertEquals(List.of("biển", "rừng", "sông"), json.convertValue(meaningEdit.get("options"), List.class),
                "phương án lưu đã sắp xếp như câu máy sinh");
        assertEquals(1, audits("QUESTION_EDIT", riverMeaningQ));

        // Hiện lại
        assertEquals("ACTIVE", read(call(post(ADMIN_QUESTIONS + "/" + riverQ + "/unhide"), admin, null)
                .andExpect(status().isOk())).get("status").asText());
        assertEquals(1, audits("QUESTION_UNHIDE", riverQ));

        // Lọc theo loại / trạng thái / từ khoá
        JsonNode readingRows = read(call(get(ADMIN_QUESTIONS).param("deckId", deckId).param("kind", "READING")
                .param("status", "ACTIVE"), admin, null).andExpect(status().isOk()));
        assertTrue(ids(readingRows).containsAll(Set.of(mountainQ, riverQ)));
        readingRows.get("items").forEach(r -> assertEquals("READING", r.get("kind").asText()));
        assertTrue(ids(read(call(get(ADMIN_QUESTIONS).param("deckId", deckId).param("q", "川"), admin, null))).contains(riverQ));
        call(get(ADMIN_QUESTIONS).param("kind", "KHONG_CO"), admin, null).andExpect(status().isBadRequest());

        // Đóng báo lỗi: 409 khi đã đóng; audit gom theo câu hỏi
        JsonNode resolved = read(call(post("/api/admin/question-flags/" + flagId + "/resolve"), admin,
                Map.of("note", "Đã thêm cách đọc")).andExpect(status().isOk()));
        assertEquals("RESOLVED", resolved.get("status").asText());
        assertEquals("Đã thêm cách đọc", resolved.get("resolutionNote").asText());
        assertEquals(learner.email, resolved.get("userEmail").asText());
        call(post("/api/admin/question-flags/" + flagId + "/resolve"), admin, Map.of()).andExpect(status().isConflict());
        call(post("/api/admin/question-flags/999999999/resolve"), admin, null).andExpect(status().isNotFound());
        assertEquals(1, audits("QUESTION_FLAG_RESOLVE", mountainQ));

        // Báo lỗi đã đóng thì báo lại được; flagCount cộng dồn, openFlags chỉ đếm báo lỗi đang mở
        flag(learner.token, mountainQ, "TYPO", null).andExpect(status().isCreated());
        JsonNode detail = read(call(get(ADMIN_QUESTIONS + "/" + mountainQ), admin, null));
        assertEquals(2, detail.get("flagCount").asInt());
        assertEquals(1, detail.get("openFlags").asInt());
        assertEquals(2, detail.get("flags").size());
        assertEquals("OPEN", detail.get("flags").get(0).get("status").asText(), "mới nhất trước");
    }

    /**
     * Admin bỏ phương án nhiễu bị báo lỗi của câu chọn đúng chữ (PATCH options). Thẻ chỉ có 3 ứng viên nên lần phát đề sau sinh lại
     * đúng nội dung gốc: phải phát lại chính câu đã sửa (cùng questionId, phương án mới) chứ không ghi nội dung gốc thành dòng mới
     * (md5 khác bản sửa nên không va chạm unique) rồi phát lại phương án bị báo lỗi.
     */
    @Test
    void admin_option_edit_is_issued_again_instead_of_the_regenerated_original() throws Exception {
        Account learner = user();
        String admin = newStaff(Role.ADMIN);
        String deckId = deck3(learner.token);
        String mountain = cardId(learner.token, deckId, "山");
        jdbc.update("UPDATE flashcards SET distractors = CAST(? AS jsonb) WHERE id = ?",
                "{\"kanjiLookalike\":[{\"term\":\"岩\"},{\"term\":\"出\"},{\"term\":\"仙\"}],\"homophones\":[]}", mountain);

        JsonNode first = start(learner.token, deckId, 3, List.of("kanji_lookalike"));
        JsonNode original = byCard(first, mountain);
        assertEquals("kanji_lookalike", original.get("type").asText());
        assertEquals(Set.of("山", "岩", "出", "仙"), options(original));
        String qid = original.get("questionId").asText();
        flag(learner.token, qid, "BAD_DISTRACTOR", null).andExpect(status().isCreated());
        finish(learner.token, first);

        call(patch(ADMIN_QUESTIONS + "/" + qid), admin, Map.of("options", List.of("山", "岩", "出", "屮"), "correct", "山"))
                .andExpect(status().isOk());
        for (int i = 0; i < 3; i++) {
            JsonNode again = start(learner.token, deckId, 3, List.of("kanji_lookalike"));
            JsonNode edited = byCard(again, mountain);
            assertEquals(qid, edited.get("questionId").asText(), "lượt " + i + ": phát lại chính câu đã sửa");
            assertEquals(Set.of("山", "岩", "出", "屮"), options(edited), "phương án bị báo lỗi không quay lại");
            finish(learner.token, again);
        }
        JsonNode rows = read(call(get(ADMIN_QUESTIONS).param("deckId", deckId).param("kind", "KANJI_LOOKALIKE"), admin, null)
                .andExpect(status().isOk()));
        assertEquals(Set.of(qid), ids(rows), "nội dung gốc không được ghi thành dòng mới");

        // Ẩn câu đã sửa: nội dung gốc cũng không ra lại -> thẻ ra câu nghĩa, ngân hàng không thêm dòng
        call(post(ADMIN_QUESTIONS + "/" + qid + "/hide"), admin, null).andExpect(status().isOk());
        JsonNode afterHide = start(learner.token, deckId, 3, List.of("kanji_lookalike"));
        assertEquals("meaning", byCard(afterHide, mountain).get("type").asText());
        assertEquals(Set.of(qid), ids(read(call(get(ADMIN_QUESTIONS).param("deckId", deckId).param("kind", "KANJI_LOOKALIKE"),
                admin, null))));
    }

    /**
     * Nhánh va chạm của QuestionBankService.persist (thực tế chỉ gặp khi hai lượt làm song song sinh cùng một câu, hoặc admin ẩn
     * câu ngay sau lúc nạp ngân hàng): INSERT ... ON CONFLICT DO NOTHING rồi tìm lại dòng theo đúng biểu thức md5 của index.
     */
    @Test
    void persist_reuses_the_row_with_identical_content_and_never_issues_a_hidden_one() throws Exception {
        Account learner = user();
        String admin = newStaff(Role.ADMIN);
        String deckId = deck3(learner.token);
        String cardId = read(call(get("/api/decks/" + deckId), learner.token, null)).get("cards").get(0).get("id").asText();
        TransactionTemplate tx = new TransactionTemplate(txManager);
        Map<String, Object> extra = Map.of("cardHash", "test");

        QuizService.Item choice = new QuizService.Item(cardId, "山", "やま", List.of("sông", "núi"), "núi", null,
                "meaning", null, "choice", null, null);
        QuizService.Draft choiceDraft = new QuizService.Draft(cardId, "MEANING", "山", List.of("núi", "sông"), "núi", extra,
                "RULE", null);
        String first = tx.execute(s -> bank.persist(deckId, List.of(new QuizService.Built(choice, choiceDraft)))).get(0).questionId();
        String second = tx.execute(s -> bank.persist(deckId, List.of(new QuizService.Built(choice, choiceDraft)))).get(0).questionId();
        assertNotNull(first);
        assertEquals(first, second, "cùng nội dung -> cùng một dòng, không nhân bản");

        QuizService.Item typing = new QuizService.Item(cardId, "山", "やま", List.of(), "やま", null, "reading",
                "Cách đọc?", "typing", null, null);
        QuizService.Draft typingDraft = new QuizService.Draft(cardId, "READING", "Cách đọc?", null, "やま", extra, "RULE", null);
        String typed = tx.execute(s -> bank.persist(deckId, List.of(new QuizService.Built(typing, typingDraft)))).get(0).questionId();
        assertEquals(typed, tx.execute(s -> bank.persist(deckId, List.of(new QuizService.Built(typing, typingDraft))))
                .get(0).questionId(), "câu gõ (options NULL) cũng khớp lại đúng dòng");

        call(post(ADMIN_QUESTIONS + "/" + first + "/hide"), admin, null).andExpect(status().isOk());
        assertEquals(List.of(), tx.execute(s -> bank.persist(deckId, List.of(new QuizService.Built(choice, choiceDraft)))),
                "dòng cùng nội dung đã bị ẩn -> câu bị bỏ khỏi lượt làm");

        QuizService.Draft tooLong = new QuizService.Draft(cardId, "MEANING", "山", List.of("núi", "x".repeat(600)),
                "x".repeat(600), extra, "RULE", null);
        List<QuizService.Item> unstored = tx.execute(s -> bank.persist(deckId, List.of(new QuizService.Built(choice, tooLong))));
        assertEquals(1, unstored.size(), "đáp án dài hơn cột vẫn được phát");
        assertNull(unstored.get(0).questionId(), "... nhưng không vào ngân hàng nên không báo lỗi được");
    }
}
