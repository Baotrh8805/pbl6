package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.repository.QuizAttemptRepository;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Thăm dò hồi quy Quiz: ca biên, race, phân quyền, vòng đời dữ liệu. */
class QuizRegressionProbeIT extends IntegrationTest {

    private static final String ATTEMPTS = "/api/quiz-attempts";

    @Autowired
    QuizAttemptRepository attempts;

    private String deck(String token, String... termMeaning) throws Exception {
        List<Map<String, String>> cards = new ArrayList<>();
        for (int i = 0; i < termMeaning.length; i += 2) cards.add(Map.of("term", termMeaning[i], "meaning", termMeaning[i + 1]));
        return read(call(post("/api/decks"), token, Map.of("title", "P", "level", "N5", "cards", cards))
                .andExpect(status().isCreated())).get("id").asText();
    }

    private int createStatus(String token, String deckId, String mode, int size) throws Exception {
        return call(post(ATTEMPTS), token, Map.of("deckId", deckId, "size", size, "mode", mode))
                .andReturn().getResponse().getStatus();
    }

    private JsonNode create(String token, String deckId, String mode, int size) throws Exception {
        return read(call(post(ATTEMPTS), token, Map.of("deckId", deckId, "size", size, "mode", mode)).andExpect(status().isOk()));
    }

    // ---- P1/P2: bộ thẻ quá nhỏ để ra câu trắc nghiệm ----
    @Test
    void deck_with_one_card_or_identical_meanings_gives_a_usable_quiz_or_a_clear_refusal() throws Exception {
        String t = newUser();
        String one = deck(t, "水", "nước");
        JsonNode s1 = create(t, one, "exam", 10);
        System.out.println("PROBE P1 one-card deck -> attemptId=" + s1.get("attemptId") + " questions=" + s1.get("questions"));
        // Mong đợi: câu hỏi có >= 2 lựa chọn, hoặc không mở lượt nào (attemptId null) kèm lý do
        boolean unusable = !s1.get("attemptId").isNull() && s1.get("questions").size() > 0
                && s1.get("questions").get(0).get("options").size() < 2;
        assertTrue(s1.get("attemptId").isNull(), "bộ 1 thẻ không được mở lượt");
        assertFalse(unusable, "bộ 1 thẻ: mở lượt với câu hỏi chỉ có 1 lựa chọn -> client lọc mất câu, lượt mở treo 24h");

        String same = deck(t, "a", "x", "b", "x", "c", "x");
        JsonNode s2 = create(t, same, "practice", 10);
        System.out.println("PROBE P2 identical meanings -> " + s2.get("questions"));
        boolean unusable2 = !s2.get("attemptId").isNull() && s2.get("questions").size() > 0
                && s2.get("questions").get(0).get("options").size() < 2;
        assertFalse(unusable2, "3 thẻ cùng nghĩa: câu hỏi chỉ có 1 lựa chọn");
    }

    // ---- P3: hai yêu cầu Bắt đầu song song ----
    @Test
    void parallel_create_never_500_and_leaves_exactly_one_open_attempt() throws Exception {
        String t = newUser();
        String d = deck(t, "a", "1", "b", "2", "c", "3", "d", "4", "e", "5");
        ExecutorService pool = Executors.newFixedThreadPool(6);
        List<Future<Integer>> fs = new ArrayList<>();
        for (int i = 0; i < 6; i++) fs.add(pool.submit((Callable<Integer>) () -> createStatus(t, d, "exam", 5)));
        List<Integer> codes = new ArrayList<>();
        for (Future<Integer> f : fs) codes.add(f.get());
        pool.shutdown();
        System.out.println("PROBE P3 parallel create statuses=" + codes);
        assertTrue(codes.stream().allMatch(c -> c == 200), "mọi yêu cầu song song đều nhận lượt đang mở, thực tế " + codes);
        long uid = read(call(get("/api/auth/me"), t, null)).get("id").asLong();
        assertEquals(1, attempts.findAll().stream().filter(a -> a.getUserId().equals(uid) && a.getSubmittedAt() == null).count());
    }

    // ---- P4: đua giữa tự lưu và nộp ----
    @Test
    void autosave_racing_with_submit_ends_consistent_without_500() throws Exception {
        String t = newUser();
        String d = deck(t, "a", "1", "b", "2", "c", "3", "d", "4", "e", "5");
        JsonNode st = create(t, d, "exam", 5);
        String id = st.get("attemptId").asText();
        List<String> cards = new ArrayList<>();
        st.get("questions").forEach(q -> cards.add(q.get("cardId").asText()));
        ExecutorService pool = Executors.newFixedThreadPool(8);
        List<Future<Integer>> fs = new ArrayList<>();
        for (String c : cards) {
            String opt = st.get("questions").get(cards.indexOf(c)).get("options").get(0).asText();
            fs.add(pool.submit((Callable<Integer>) () -> call(put(ATTEMPTS + "/" + id + "/answers/" + c), t, Map.of("option", opt))
                    .andReturn().getResponse().getStatus()));
        }
        fs.add(pool.submit((Callable<Integer>) () -> call(post(ATTEMPTS + "/" + id + "/submit"), t, Map.of())
                .andReturn().getResponse().getStatus()));
        fs.add(pool.submit((Callable<Integer>) () -> call(post(ATTEMPTS + "/" + id + "/submit"), t, Map.of())
                .andReturn().getResponse().getStatus()));
        List<Integer> codes = new ArrayList<>();
        for (Future<Integer> f : fs) codes.add(f.get());
        pool.shutdown();
        System.out.println("PROBE P4 race statuses=" + codes);
        assertTrue(codes.stream().allMatch(c -> c == 200 || c == 409), "chỉ được 200/409, thực tế " + codes);
        assertEquals(1, read(call(get("/api/quiz-results"), t, null)).size(), "đúng 1 kết quả dù nộp 2 lần song song");
    }

    // ---- P5: xoá bộ thẻ giữa chừng ----
    @Test
    void deleting_the_deck_mid_attempt_removes_the_attempt_cleanly() throws Exception {
        String t = newUser();
        String d = deck(t, "a", "1", "b", "2", "c", "3");
        JsonNode st = create(t, d, "practice", 3);
        String id = st.get("attemptId").asText();
        call(delete("/api/decks/" + d), t, null).andExpect(status().isNoContent());
        call(get(ATTEMPTS + "/" + id), t, null).andExpect(status().isNotFound());
        call(put(ATTEMPTS + "/" + id + "/answers/" + st.get("questions").get(0).get("cardId").asText()), t, Map.of("option", "1"))
                .andExpect(status().isNotFound());
        call(get(ATTEMPTS + "/open").param("deckId", d), t, null).andExpect(status().isNoContent());
    }

    // ---- P6: sửa bộ thẻ giữa chừng: chấm theo bản chụp ----
    @Test
    void editing_cards_mid_attempt_does_not_change_grading() throws Exception {
        String t = newUser();
        String d = deck(t, "a", "một", "b", "hai", "c", "ba", "d", "bốn");
        JsonNode st = create(t, d, "exam", 4);
        String id = st.get("attemptId").asText();
        JsonNode deckJson = read(call(get("/api/decks/" + d), t, null));
        // Đổi nghĩa mọi thẻ sau khi phát đề
        List<Map<String, Object>> cards = new ArrayList<>();
        deckJson.get("cards").forEach(c -> cards.add(Map.of("id", c.get("id").asText(), "term", c.get("term").asText(), "meaning", "ĐÃ ĐỔI " + c.get("meaning").asText())));
        call(put("/api/decks/" + d), t, Map.of("title", "P", "level", "N5", "cards", cards)).andExpect(status().isOk());

        Map<String, String> answers = new HashMap<>();
        for (JsonNode q : st.get("questions")) {
            String card = q.get("cardId").asText();
            for (JsonNode c : deckJson.get("cards")) if (c.get("id").asText().equals(card)) answers.put(card, c.get("meaning").asText());
        }
        JsonNode out = read(call(post(ATTEMPTS + "/" + id + "/submit"), t, Map.of("answers", answers)).andExpect(status().isOk()));
        assertEquals(4, out.get("score").asInt(), "chấm theo đề đã phát, không theo dữ liệu đã sửa");
    }

    // ---- P7: phân quyền ----
    @Test
    void private_deck_of_someone_else_cannot_be_quizzed_and_unauthenticated_is_401() throws Exception {
        String alice = newUser();
        String d = deck(alice, "a", "1", "b", "2", "c", "3");
        String bob = newUser();
        assertEquals(404, createStatus(bob, d, "exam", 3), "bộ thẻ riêng của người khác phải 404");
        mvc.perform(post(ATTEMPTS).contentType("application/json").content("{\"deckId\":\"" + d + "\",\"size\":3,\"mode\":\"exam\"}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(get(ATTEMPTS + "/" + UUID.randomUUID())).andExpect(status().isUnauthorized());
        mvc.perform(get(ATTEMPTS + "/open").param("deckId", d)).andExpect(status().isUnauthorized());
        // Library công khai thì ai cũng thi được
        assertEquals(200, createStatus(bob, "n5-core", "practice", 3));
    }

    // ---- P8/P16: bỏ qua câu, gửi lại ----
    @Test
    void practice_skip_is_wrong_locked_and_counted_in_the_total() throws Exception {
        String t = newUser();
        String d = deck(t, "a", "1", "b", "2", "c", "3", "d", "4");
        JsonNode st = create(t, d, "practice", 4);
        String id = st.get("attemptId").asText();
        String card = st.get("questions").get(0).get("cardId").asText();
        Map<String, Object> blank = new HashMap<>();
        blank.put("option", null);
        JsonNode fb = read(call(put(ATTEMPTS + "/" + id + "/answers/" + card), t, blank).andExpect(status().isOk())).get("feedback");
        assertFalse(fb.get("correct").asBoolean());
        JsonNode out = read(call(post(ATTEMPTS + "/" + id + "/submit"), t, Map.of()).andExpect(status().isOk()));
        assertEquals(0, out.get("score").asInt());
        assertEquals(4, out.get("total").asInt(), "câu chưa làm vẫn tính vào tổng");
        assertEquals("practice", read(call(get("/api/quiz-results"), t, null)).get(0).get("mode").asText());
        call(get(ATTEMPTS + "/open").param("deckId", d), t, null).andExpect(status().isNoContent());
    }

    // ---- P11/P17: kích thước ----
    @Test
    void size_larger_than_deck_is_capped_and_oversized_option_is_400() throws Exception {
        String t = newUser();
        String d = deck(t, "a", "1", "b", "2", "c", "3", "d", "4");
        JsonNode st = create(t, d, "exam", 50);
        assertEquals(4, st.get("questions").size());
        assertEquals(4 * 30, st.get("timeLimitSeconds").asInt());
        String card = st.get("questions").get(0).get("cardId").asText();
        call(put(ATTEMPTS + "/" + st.get("attemptId").asText() + "/answers/" + card), t, Map.of("option", "x".repeat(2001)))
                .andExpect(status().isBadRequest());
        call(post(ATTEMPTS + "/" + st.get("attemptId").asText() + "/submit"), t, Map.of("answers", Map.of("a", "b")))
                .andExpect(status().isOk());
    }

    // ---- P-clone: nhân bản bộ thẻ giữ nội dung nhiều dòng ----
    @Test
    void clone_keeps_multiline_content_and_quiz_uses_only_the_first_line() throws Exception {
        String alice = newUser();
        String d = deck(alice, "a", "định nghĩa 1\n\nví dụ A\nghi chú", "b", "hai", "c", "ba", "d", "bốn");
        read(call(put("/api/decks/" + d), alice, Map.of("title", "P", "level", "N5", "visibility", "public",
                "cards", read(call(get("/api/decks/" + d), alice, null)).get("cards"))).andExpect(status().isOk()));
        String bob = newUser();
        JsonNode clone = read(call(post("/api/decks/" + d + "/clone"), bob, null).andExpect(status().is2xxSuccessful()));
        boolean kept = false;
        for (JsonNode c : clone.get("cards")) if (c.get("meaning").asText().equals("định nghĩa 1\n\nví dụ A\nghi chú")) kept = true;
        assertTrue(kept, "nhân bản phải giữ nguyên nội dung nhiều dòng");
        JsonNode st = create(bob, clone.get("id").asText(), "practice", 4);
        for (JsonNode q : st.get("questions")) q.get("options").forEach(o -> assertFalse(o.asText().contains("\n"), o.asText()));
    }
}
