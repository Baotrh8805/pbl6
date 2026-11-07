package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Đánh giá bộ thẻ: sao + bình luận, một đánh giá mỗi người, danh sách, xoá. */
class DeckRatingIT extends IntegrationTest {

    private static final String DECK = "/api/library/decks/lib-nhk-easy-news";

    private static Map<String, Object> body(int stars, String comment) {
        Map<String, Object> m = new HashMap<>();
        m.put("stars", stars);
        m.put("comment", comment);
        return m;
    }

    private JsonNode ratings(String token) throws Exception {
        return read(call(get(DECK + "/ratings"), token, null).andExpect(status().isOk()));
    }

    @Test
    void comment_is_saved_trimmed_and_replaced_on_rerate() throws Exception {
        String token = newUser();
        long before = ratings(token).get("ratingsCount").asLong();

        call(put(DECK + "/rating"), token, body(4, "  Rất hữu ích  ")).andExpect(status().isOk());
        JsonNode first = ratings(token);
        assertEquals(before + 1, first.get("ratingsCount").asLong());
        assertEquals(4, first.get("mine").get("stars").asInt());
        assertEquals("Rất hữu ích", first.get("mine").get("comment").asText(), "bình luận được cắt khoảng trắng");
        JsonNode mineItem = first.get("items").get(0);
        assertTrue(mineItem.get("mine").asBoolean(), "đánh giá mới nhất nằm đầu và là của mình");
        assertEquals("Rất hữu ích", mineItem.get("comment").asText());
        assertFalse(mineItem.get("displayName").asText().isBlank());

        call(put(DECK + "/rating"), token, body(2, "   ")).andExpect(status().isOk());
        JsonNode again = ratings(token);
        assertEquals(before + 1, again.get("ratingsCount").asLong(), "chấm lại không tạo lượt mới");
        assertEquals(2, again.get("mine").get("stars").asInt());
        assertTrue(again.get("mine").get("comment").isNull(), "bình luận trống = không có bình luận");
    }

    @Test
    void validation_stars_1_to_5_and_comment_max_500() throws Exception {
        String token = newUser();
        call(put(DECK + "/rating"), token, body(0, null)).andExpect(status().isBadRequest());
        call(put(DECK + "/rating"), token, body(6, null)).andExpect(status().isBadRequest());
        call(put(DECK + "/rating"), token, Map.of()).andExpect(status().isBadRequest());
        call(put(DECK + "/rating"), token, body(5, "a".repeat(501))).andExpect(status().isBadRequest());
        call(put(DECK + "/rating"), token, body(5, "a".repeat(500))).andExpect(status().isOk());
    }

    @Test
    void owner_and_private_decks_are_rejected() throws Exception {
        String token = newUser();
        JsonNode mine = read(call(post("/api/decks"), token, Map.of("title", "Của tôi", "level", "N5",
                "visibility", "public", "category", "goi")).andExpect(status().isCreated()));
        String own = "/api/library/decks/" + mine.get("id").asText();
        call(put(own + "/rating"), token, body(5, "tự khen")).andExpect(status().isBadRequest());
        call(get(own + "/ratings"), token, null).andExpect(status().isOk());

        JsonNode hidden = read(call(post("/api/decks"), newUser(), Map.of("title", "Ẩn", "level", "N5")));
        String priv = "/api/library/decks/" + hidden.get("id").asText();
        call(put(priv + "/rating"), token, body(5, null)).andExpect(status().isNotFound());
        call(get(priv + "/ratings"), token, null).andExpect(status().isNotFound());
    }

    @Test
    void list_is_paginated_and_delete_removes_only_my_rating() throws Exception {
        String a = newUser();
        String b = newUser();
        long before = ratings(a).get("ratingsCount").asLong();
        call(put(DECK + "/rating"), a, body(5, "A")).andExpect(status().isOk());
        call(put(DECK + "/rating"), b, body(3, "B")).andExpect(status().isOk());

        JsonNode page = read(call(get(DECK + "/ratings").param("size", "1"), a, null).andExpect(status().isOk()));
        assertEquals(1, page.get("items").size());
        assertEquals("B", page.get("items").get(0).get("comment").asText(), "mới nhất trước");
        assertFalse(page.get("items").get(0).get("mine").asBoolean(), "góc nhìn của A: đánh giá của B không phải của mình");
        call(get(DECK + "/ratings").param("size", "0"), a, null).andExpect(status().isBadRequest());

        JsonNode after = read(call(delete(DECK + "/rating"), a, null).andExpect(status().isOk()));
        assertEquals(before + 1, after.get("ratingsCount").asLong());
        assertTrue(ratings(a).get("mine").isNull());
        call(delete(DECK + "/rating"), a, null).andExpect(status().isNotFound());
    }
}
