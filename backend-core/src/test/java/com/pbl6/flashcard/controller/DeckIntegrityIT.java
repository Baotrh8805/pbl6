package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class DeckIntegrityIT extends IntegrationTest {

    private JsonNode deckABC(String token) throws Exception {
        return read(call(post("/api/decks"), token, Map.of("title", "ABC", "level", "N5", "cards", List.of(
                Map.of("term", "A", "meaning", "a"), Map.of("term", "B", "meaning", "b"), Map.of("term", "C", "meaning", "c"))))
                .andExpect(status().isCreated()));
    }

    @Test
    void lengths_allowed_by_dto_are_stored_and_longer_ones_are_400() throws Exception {
        String token = newUser();
        call(post("/api/decks"), token, Map.of("title", "L", "level", "N5", "description", "d".repeat(1000),
                "cards", List.of(Map.of("term", "t".repeat(200), "meaning", "m".repeat(500), "example", "e".repeat(1000)))))
                .andExpect(status().isCreated());

        call(post("/api/decks"), token, Map.of("title", "L", "level", "N5",
                "cards", List.of(Map.of("term", "t".repeat(201), "meaning", "m")))).andExpect(status().isBadRequest());
        call(post("/api/decks"), token, Map.of("title", "L", "level", "N5", "description", "d".repeat(1001)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void removing_a_middle_card_keeps_other_ids_and_drops_only_its_reviews() throws Exception {
        String token = newUser();
        JsonNode deck = deckABC(token);
        String a = deck.get("cards").get(0).get("id").asText();
        String b = deck.get("cards").get(1).get("id").asText();
        String c = deck.get("cards").get(2).get("id").asText();
        call(post("/api/reviews"), token, Map.of("cardId", b, "grade", "easy")).andExpect(status().isOk());
        call(post("/api/reviews"), token, Map.of("cardId", c, "grade", "good")).andExpect(status().isOk());

        JsonNode updated = read(call(put("/api/decks/" + deck.get("id").asText()), token, Map.of("title", "ABC", "level", "N5",
                "cards", List.of(Map.of("id", c, "term", "C", "meaning", "c"), Map.of("id", a, "term", "A2", "meaning", "a"),
                        Map.of("term", "D", "meaning", "d"))))
                .andExpect(status().isOk()));

        JsonNode cards = updated.get("cards");
        assertEquals(List.of(c, a), List.of(cards.get(0).get("id").asText(), cards.get(1).get("id").asText()), "đổi chỗ giữ id");
        assertEquals("A2", cards.get(1).get("term").asText());
        assertEquals("D", cards.get(2).get("term").asText());
        JsonNode reviews = read(call(get("/api/reviews"), token, null));
        assertEquals(1, reviews.size());
        assertEquals(c, reviews.get(0).get("cardId").asText(), "review của C vẫn gắn với C, của B bị xoá");
    }

    @Test
    void card_id_from_another_deck_is_rejected() throws Exception {
        String token = newUser();
        JsonNode one = deckABC(token);
        JsonNode other = deckABC(token);
        call(put("/api/decks/" + one.get("id").asText()), token, Map.of("title", "x", "level", "N5", "cards",
                List.of(Map.of("id", other.get("cards").get(0).get("id").asText(), "term", "t", "meaning", "m"))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void reviewing_a_card_in_someone_elses_private_deck_is_404() throws Exception {
        String alice = newUser(), bob = newUser();
        String cardId = deckABC(alice).get("cards").get(0).get("id").asText();
        call(post("/api/reviews"), bob, Map.of("cardId", cardId, "grade", "good")).andExpect(status().isNotFound());
        // Thẻ hệ thống (seed) thì ai cũng ôn được
        call(post("/api/reviews"), bob, Map.of("cardId", "n5-1", "grade", "good")).andExpect(status().isOk());
    }
}
