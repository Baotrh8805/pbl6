package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class DeckCardsIT extends IntegrationTest {

    @Test
    void batch_appends_trimmed_cards_after_existing_positions() throws Exception {
        String token = newUser();
        JsonNode deck = read(call(post("/api/decks"), token, Map.of(
                "title", "IT deck", "level", "N3",
                "cards", List.of(Map.of("term", "既存", "meaning", "có sẵn"))))
                .andExpect(status().isCreated()));

        call(post("/api/decks/" + deck.get("id").asText() + "/cards/batch"), token, List.of(
                Map.of("term", " 開発 ", "reading", " かいはつ ", "meaning", " phát triển\n\nVí dụ 1\nGhi chú "),
                Map.of("term", " 設計 ", "meaning", " thiết kế ")))
                .andExpect(status().isCreated());

        JsonNode cards = read(call(get("/api/decks/" + deck.get("id").asText()), token, null)).get("cards");
        assertEquals(3, cards.size());
        assertEquals(2, cards.get(1).get("position").asInt());
        assertEquals("開発", cards.get(1).get("term").asText());
        assertEquals("かいはつ", cards.get(1).get("reading").asText());
        // Xuống dòng bên trong được giữ nguyên, chỉ trim hai đầu
        assertEquals("phát triển\n\nVí dụ 1\nGhi chú",cards.get(1).get("meaning").asText());
        assertFalse(cards.get(1).has("example"));
        assertEquals(3, cards.get(2).get("position").asInt());
        assertTrue(cards.get(2).get("reading").isNull());
    }

    /**
     * B5.1 (LC-04): thuật ngữ so trùng sau NFKC + trim (ｶﾀｶﾅ = カタカナ, " 学校 " = "学校"); trùng -> 409 DUPLICATE_TERM ở tạo bộ, thêm
     * lô và PUT (chỉ thẻ mới); allowDuplicate = true thì cho qua; thuật ngữ lưu ở dạng đã chuẩn hoá.
     */
    @Test
    void duplicate_terms_are_rejected_unless_allowed_and_terms_are_nfkc_normalized() throws Exception {
        String token = newUser();
        List<Map<String, String>> twice = List.of(Map.of("term", "学校", "meaning", "trường"), Map.of("term", " 学校 ", "meaning", "trường (2)"));
        call(post("/api/decks"), token, Map.of("title", "Trùng", "level", "N5", "cards", twice))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DUPLICATE_TERM"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("学校")));
        JsonNode allowed = read(call(post("/api/decks"), token, Map.of("title", "Trùng", "level", "N5", "allowDuplicate", true, "cards", twice))
                .andExpect(status().isCreated()));
        assertEquals(2, allowed.get("cards").size(), "allowDuplicate: giữ cả hai thẻ");

        JsonNode deck = read(call(post("/api/decks"), token, Map.of("title", "Kana", "level", "N5",
                "cards", List.of(Map.of("term", "カタカナ", "reading", "かたかな", "meaning", "katakana")))).andExpect(status().isCreated()));
        String id = deck.get("id").asText();
        String cardId = deck.get("cards").get(0).get("id").asText();
        // half-width ｶﾀｶﾅ trùng カタカナ sau NFKC
        call(post("/api/decks/" + id + "/cards/batch"), token, List.of(Map.of("term", "ｶﾀｶﾅ", "meaning", "x")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DUPLICATE_TERM"));
        JsonNode added = read(call(post("/api/decks/" + id + "/cards/batch").param("allowDuplicate", "true"), token,
                List.of(Map.of("term", "ｶﾀｶﾅ", "reading", "ｶﾀｶﾅ", "meaning", "x"))).andExpect(status().isCreated()));
        assertEquals("カタカナ", added.get(0).get("term").asText(), "thuật ngữ lưu ở dạng NFKC");
        assertEquals("カタカナ", added.get(0).get("reading").asText(), "cách đọc cũng NFKC");
        JsonNode tilde = read(call(post("/api/decks/" + id + "/cards/batch"), token, List.of(Map.of("term", "～ている", "meaning", "đang"))).andExpect(status().isCreated()));
        assertEquals("～ている", tilde.get(0).get("term").asText(), "dấu ngã toàn chiều rộng của mẫu ngữ pháp không bị NFKC đổi thành ~");
        // trong cùng một lô
        call(post("/api/decks/" + id + "/cards/batch"), token, List.of(Map.of("term", "新しい", "meaning", "a"), Map.of("term", "新しい", "meaning", "b")))
                .andExpect(status().isConflict());
        // PUT: thẻ cũ giữ id không tự trùng với mình; thẻ mới trùng thẻ cũ -> 409; allowDuplicate -> 200
        List<Map<String, String>> putCards = List.of(Map.of("id", cardId, "term", "カタカナ", "meaning", "katakana"), Map.of("term", "カタカナ", "meaning", "mới"));
        call(put("/api/decks/" + id), token, Map.of("title", "Kana", "level", "N5", "cards", putCards))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DUPLICATE_TERM"));
        call(put("/api/decks/" + id), token, Map.of("title", "Kana", "level", "N5", "cards", List.of(Map.of("id", cardId, "term", "カタカナ", "meaning", "katakana sửa"))))
                .andExpect(status().isOk());
        call(put("/api/decks/" + id), token, Map.of("title", "Kana", "level", "N5", "allowDuplicate", true, "cards", putCards))
                .andExpect(status().isOk());
    }
}
