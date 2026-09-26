package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
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
                Map.of("term", " 開発 ", "reading", " かいはつ ", "meaning", " phát triển ", "example", " Ví dụ 1 "),
                Map.of("term", " 設計 ", "meaning", " thiết kế ")))
                .andExpect(status().isCreated());

        JsonNode cards = read(call(get("/api/decks/" + deck.get("id").asText()), token, null)).get("cards");
        assertEquals(3, cards.size());
        assertEquals(2, cards.get(1).get("position").asInt());
        assertEquals("開発", cards.get(1).get("term").asText());
        assertEquals("かいはつ", cards.get(1).get("reading").asText());
        assertEquals("Ví dụ 1", cards.get(1).get("example").asText());
        assertEquals(3, cards.get(2).get("position").asInt());
        assertTrue(cards.get(2).get("reading").isNull());
    }
}
