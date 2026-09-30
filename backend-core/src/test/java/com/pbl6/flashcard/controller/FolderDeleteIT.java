package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class FolderDeleteIT extends IntegrationTest {

    private String folder(String token, String title, String parentId) throws Exception {
        Map<String, Object> body = parentId == null ? Map.of("title", title) : Map.of("title", title, "parentId", parentId);
        return read(call(post("/api/folders"), token, body).andExpect(status().isCreated())).get("id").asText();
    }

    @Test
    void deleting_parent_moves_children_to_root_and_unfiles_decks() throws Exception {
        String token = newUser();
        String parent = folder(token, "Cha", null);
        String child = folder(token, "Con", parent);
        String deckId = read(call(post("/api/decks"), token, Map.of("title", "D", "level", "N5", "folderId", parent))
                .andExpect(status().isCreated())).get("id").asText();

        call(delete("/api/folders/" + parent), token, null).andExpect(status().isNoContent());

        JsonNode roots = read(call(get("/api/folders"), token, null));
        assertEquals(1, roots.size());
        assertEquals(child, roots.get(0).get("id").asText());
        assertTrue(read(call(get("/api/decks/" + deckId), token, null)).get("folderId").isNull());
    }

    @Test
    void deleting_parent_whose_child_clashes_with_a_root_name_is_409_and_keeps_everything() throws Exception {
        String token = newUser();
        folder(token, "Trung", null);
        String parent = folder(token, "Cha", null);
        folder(token, "trung", parent);

        JsonNode err = read(call(delete("/api/folders/" + parent), token, null).andExpect(status().isConflict()));
        assertTrue(err.get("message").asText().contains("'trung'"), err.toString());
        assertEquals(2, read(call(get("/api/folders"), token, null)).size(), "không folder nào bị xoá");
    }

    @Test
    void deleting_deck_also_removes_its_reviews_and_quiz_results() throws Exception {
        String token = newUser();
        JsonNode deck = read(call(post("/api/decks"), token, Map.of("title", "Q", "level", "N5",
                "cards", List.of(Map.of("term", "水", "meaning", "nước"), Map.of("term", "火", "meaning", "lửa"))))
                .andExpect(status().isCreated()));
        String cardId = deck.get("cards").get(0).get("id").asText();
        call(post("/api/reviews"), token, Map.of("cardId", cardId, "grade", "good")).andExpect(status().isOk());
        String quizUrl = "/api/quizzes/" + deck.get("id").asText();
        String attemptId = read(call(get(quizUrl), token, null)).get("attemptId").asText();
        call(post(quizUrl), token, Map.of("attemptId", attemptId, "answers", Map.of(cardId, "nước")))
                .andExpect(status().isOk());

        call(delete("/api/decks/" + deck.get("id").asText()), token, null).andExpect(status().isNoContent());
        assertEquals(0, read(call(get("/api/reviews"), token, null)).size());
        assertEquals(0, read(call(get("/api/quiz-results"), token, null)).size());
    }
}
