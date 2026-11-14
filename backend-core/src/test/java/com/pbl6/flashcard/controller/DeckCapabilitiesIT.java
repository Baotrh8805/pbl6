package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.model.Flashcard;
import com.pbl6.flashcard.repository.FlashcardRepository;
import com.pbl6.flashcard.service.AiServiceClient;
import com.pbl6.flashcard.service.QuizAiClient;
import com.pbl6.flashcard.service.QuizAiClient.DistractorInput;
import com.pbl6.flashcard.service.QuizAiClient.Distractors;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyList;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Hợp đồng đợt 2 §1.2: GET /api/decks/{id}/quiz-capabilities (người xem) và POST /api/decks/{id}/distractors (EDITOR+) với
 * ai-service giả lập qua {@link QuizAiClient}; thẻ từ bóc tách mang pos, thẻ tay không có pos trong JSON.
 */
class DeckCapabilitiesIT extends IntegrationTest {

    @MockitoBean
    QuizAiClient quizAi;

    @Autowired
    FlashcardRepository flashcards;

    @BeforeEach
    void resetAi() {
        Mockito.reset(quizAi);
    }

    private static Map<String, Object> card(String term, String reading, String meaning, String pos) {
        Map<String, Object> m = new HashMap<>();
        m.put("term", term);
        if (reading != null) m.put("reading", reading);
        m.put("meaning", meaning);
        if (pos != null) m.put("pos", pos);
        return m;
    }

    private JsonNode createDeck(String token, List<Map<String, Object>> cards) throws Exception {
        return read(call(post("/api/decks"), token, Map.of("title", "Quiz types", "level", "N5", "cards", cards))
                .andExpect(status().isCreated()));
    }

    private static String cardId(JsonNode deck, String term) {
        for (JsonNode c : deck.get("cards")) if (term.equals(c.get("term").asText())) return c.get("id").asText();
        throw new AssertionError("không có thẻ " + term);
    }

    private JsonNode capabilities(String token, String deckId) throws Exception {
        return read(call(get("/api/decks/" + deckId + "/quiz-capabilities"), token, null).andExpect(status().isOk()));
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

    /** ai-service giả: 書く có chữ giống hình + từ đồng âm, 書類 chỉ có chữ giống hình, các thẻ khác không có ứng viên. */
    private void stubDistractors() {
        Mockito.when(quizAi.distractors(anyList())).thenAnswer(inv -> {
            List<DistractorInput> in = inv.getArgument(0);
            List<Distractors> out = new ArrayList<>();
            for (DistractorInput i : in) {
                List<Map<String, Object>> look = switch (i.term()) {
                    case "書く", "書類" -> List.of(candidate("昼", "ひる"));
                    default -> List.of();
                };
                List<Map<String, Object>> homo = "書く".equals(i.term())
                        ? List.of(candidate("掻く", "かく"), candidate("欠く", "かく")) : List.of();
                out.add(new Distractors(i.ref(), look, homo));
            }
            return out;
        });
    }

    @Test
    void capabilities_count_cards_per_question_type_and_pos_round_trips() throws Exception {
        String token = newUser();
        JsonNode deck = createDeck(token, List.of(
                card("書く", "かく", "viết\nVí dụ: 手紙を書く", "動詞"),   // meaning, reading, conjugation
                card("学校", "がっこう", "trường học", "名詞"),             // meaning, reading
                card("コーヒー", null, "cà phê", null),                      // meaning, reading (toàn kana)
                card("待つ", null, "chờ đợi", null)));                      // meaning; thiếu pos, đuôi hàng う -> conjugation
        String id = deck.get("id").asText();

        JsonNode caps = capabilities(token, id);
        assertEquals(4, caps.get("meaning").asInt());
        assertEquals(0, caps.get("kanjiLookalike").asInt(), "chưa sinh phương án nhiễu");
        assertEquals(0, caps.get("homophone").asInt());
        assertEquals(3, caps.get("reading").asInt());
        assertEquals(2, caps.get("conjugation").asInt(), "書く theo pos + 待つ (thẻ tay) theo đuôi, như danh sách gửi ai-service");

        JsonNode cards = read(call(get("/api/decks/" + id), token, null).andExpect(status().isOk())).get("cards");
        assertEquals("動詞", cards.get(0).get("pos").asText());
        assertFalse(cards.get(2).has("pos"), "thẻ không có từ loại: bỏ hẳn pos khỏi JSON");
        assertTrue(cards.get(2).get("reading").isNull(), "trường cũ vẫn giữ null như trước");

        // PUT thẻ không gửi pos -> giữ nguyên; gửi pos khác động từ -> tin pos, không đoán theo đuôi; gửi chuỗi rỗng -> xoá
        String kaku = cardId(deck, "書く");
        call(put("/api/decks/" + id + "/cards/" + kaku), token, card("書く", "かく", "viết", null))
                .andExpect(status().isOk()).andExpect(jsonPath("$.pos").value("動詞"));
        call(put("/api/decks/" + id + "/cards/" + kaku), token, card("書く", "かく", "viết", "名詞"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.pos").value("名詞"));
        assertEquals(1, capabilities(token, id).get("conjugation").asInt());
        call(put("/api/decks/" + id + "/cards/" + kaku), token, card("書く", "かく", "viết", " "))
                .andExpect(status().isOk()).andExpect(jsonPath("$.pos").doesNotExist());
        assertEquals(2, capabilities(token, id).get("conjugation").asInt(), "thiếu pos: lại đoán theo đuôi hàng う");

        Mockito.verifyNoInteractions(quizAi); // GET không gọi ai-service
    }

    @Test
    void meaning_needs_at_least_two_distinct_headlines() throws Exception {
        String token = newUser();
        String id = createDeck(token, List.of(
                card("犬", "いぬ", "con chó\nghi chú 1", null),
                card("狗", "いぬ", "con chó\nghi chú 2", null))).get("id").asText();
        JsonNode caps = capabilities(token, id);
        assertEquals(0, caps.get("meaning").asInt(), "mọi thẻ cùng nghĩa chính: không có phương án sai");
        assertEquals(2, caps.get("reading").asInt());
    }

    @Test
    void distractors_are_generated_stored_and_cleared_when_term_changes() throws Exception {
        stubDistractors();
        String token = newUser();
        List<Map<String, Object>> cards = new ArrayList<>(List.of(
                card("書く", "かく", "viết\nVí dụ: 手紙を書く", "動詞"),
                card("書類", "しょるい", "giấy tờ", "名詞"),
                card("学校", "がっこう", "trường học", "名詞")));
        Map<String, Object> grammar = card("～ている", null, "đang (tiếp diễn)", null);
        grammar.put("kind", "grammar");
        cards.add(grammar);
        JsonNode deck = createDeck(token, cards);
        String id = deck.get("id").asText();

        call(post("/api/decks/" + id + "/distractors"), token, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.updated").value(3))
                .andExpect(jsonPath("$.withLookalike").value(2))
                .andExpect(jsonPath("$.withHomophone").value(1));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<DistractorInput>> sent = ArgumentCaptor.forClass(List.class);
        Mockito.verify(quizAi).distractors(sent.capture());
        assertEquals(List.of("書く", "書類", "学校"), sent.getValue().stream().map(DistractorInput::term).toList(),
                "chỉ thẻ từ vựng, đúng thứ tự");
        DistractorInput first = sent.getValue().get(0);
        assertEquals(cardId(deck, "書く"), first.ref());
        assertEquals("かく", first.reading());
        assertEquals("viết", first.meaning(), "chỉ dòng nghĩa chính");

        String kaku = cardId(deck, "書く");
        Map<String, Object> stored = flashcards.findById(kaku).map(Flashcard::getDistractors).orElseThrow();
        assertEquals(Set.of("kanjiLookalike", "homophones"), stored.keySet(), "jsonb tự sắp khoá: chỉ so tập khoá");
        List<?> homophones = (List<?>) stored.get("homophones");
        assertEquals(2, homophones.size());
        assertEquals("掻く", ((Map<?, ?>) homophones.get(0)).get("term"));
        Map<String, Object> none = flashcards.findById(cardId(deck, "学校")).map(Flashcard::getDistractors).orElseThrow();
        assertEquals(List.of(), none.get("kanjiLookalike"), "đã sinh nhưng không có ứng viên: danh sách rỗng, không phải null");
        assertNull(flashcards.findById(cardId(deck, "～ている")).orElseThrow().getDistractors(), "thẻ ngữ pháp không gửi");

        JsonNode caps = capabilities(token, id);
        assertEquals(2, caps.get("kanjiLookalike").asInt());
        assertEquals(1, caps.get("homophone").asInt());

        // Bản sao giữ phương án nhiễu (cùng term / reading) và từ loại
        JsonNode copy = read(call(post("/api/decks/" + id + "/clone"), token, null).andExpect(status().isCreated()));
        JsonNode copyCaps = capabilities(token, copy.get("id").asText());
        assertEquals(2, copyCaps.get("kanjiLookalike").asInt());
        assertEquals(1, copyCaps.get("conjugation").asInt());

        // Đổi nghĩa: giữ phương án nhiễu; đổi cách đọc / thuật ngữ: bỏ (sinh theo từ cũ)
        call(put("/api/decks/" + id + "/cards/" + kaku), token, card("書く", "かく", "viết (chữ)", null))
                .andExpect(status().isOk());
        assertNotNull(flashcards.findById(kaku).orElseThrow().getDistractors());
        call(put("/api/decks/" + id + "/cards/" + kaku), token, card("描く", "かく", "vẽ", null))
                .andExpect(status().isOk());
        assertNull(flashcards.findById(kaku).orElseThrow().getDistractors());
        caps = capabilities(token, id);
        assertEquals(1, caps.get("kanjiLookalike").asInt());
        assertEquals(0, caps.get("homophone").asInt());
    }

    @Test
    void viewer_reads_capabilities_but_only_editor_generates_distractors() throws Exception {
        stubDistractors();
        String owner = newUser();
        String viewerEmail = newEmail();
        String viewer = newUser(viewerEmail);
        String editorEmail = newEmail();
        String editor = newUser(editorEmail);
        String stranger = newUser();
        String id = createDeck(owner, List.of(card("書く", "かく", "viết", "動詞"), card("学校", "がっこう", "trường học", null)))
                .get("id").asText();
        call(put("/api/decks/" + id + "/shares"), owner, Map.of("email", viewerEmail, "permission", "VIEWER"))
                .andExpect(status().isOk());
        call(put("/api/decks/" + id + "/shares"), owner, Map.of("email", editorEmail, "permission", "EDITOR"))
                .andExpect(status().isOk());

        assertEquals(2, capabilities(viewer, id).get("meaning").asInt());
        call(get("/api/decks/" + id + "/quiz-capabilities"), stranger, null).andExpect(status().isNotFound());
        call(get("/api/decks/missing-deck/quiz-capabilities"), owner, null).andExpect(status().isNotFound());

        call(post("/api/decks/" + id + "/distractors"), viewer, null).andExpect(status().isForbidden());
        call(post("/api/decks/" + id + "/distractors"), stranger, null).andExpect(status().isNotFound());
        Mockito.verifyNoInteractions(quizAi);

        call(post("/api/decks/" + id + "/distractors"), editor, null)
                .andExpect(status().isOk()).andExpect(jsonPath("$.updated").value(2));
        assertEquals(1, capabilities(viewer, id).get("homophone").asInt());

        call(get("/api/decks/" + id + "/quiz-capabilities"), null, null).andExpect(status().isUnauthorized());
    }

    @Test
    void ai_service_down_is_503_and_leaves_cards_untouched() throws Exception {
        String token = newUser();
        JsonNode deck = createDeck(token, List.of(card("書く", "かく", "viết", "動詞")));
        String id = deck.get("id").asText();

        Mockito.when(quizAi.distractors(anyList())).thenThrow(new AiServiceClient.AiServiceException(
                "Không kết nối được dịch vụ AI (sinh phương án gây nhiễu). Hãy chắc ai-service đang chạy."));
        call(post("/api/decks/" + id + "/distractors"), token, null)
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.message", containsString("Không kết nối được dịch vụ AI")));

        // Sai X-Internal-Key (401 từ ai-service) không được lộ thành 401 (frontend coi là hết phiên)
        Mockito.reset(quizAi);
        Mockito.when(quizAi.distractors(anyList()))
                .thenThrow(new AiServiceClient.AiServiceException("Unauthorized", 401, null));
        call(post("/api/decks/" + id + "/distractors"), token, null)
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.message", containsString("tạm thời không khả dụng")));

        assertNull(flashcards.findById(cardId(deck, "書く")).orElseThrow().getDistractors());
    }

    @Test
    void deck_without_vocab_cards_skips_ai_service() throws Exception {
        String token = newUser();
        Map<String, Object> grammar = card("～ている", null, "đang", null);
        grammar.put("kind", "grammar");
        String id = createDeck(token, List.of(grammar)).get("id").asText();

        call(post("/api/decks/" + id + "/distractors"), token, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.updated").value(0))
                .andExpect(jsonPath("$.withLookalike").value(0))
                .andExpect(jsonPath("$.withHomophone").value(0));
        Mockito.verifyNoInteractions(quizAi);
    }
}
