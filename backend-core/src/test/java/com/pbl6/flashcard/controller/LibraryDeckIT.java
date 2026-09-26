package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Thư viện cộng đồng: dữ liệu seed, tìm/lọc/phân trang, lưu bản sao, chia sẻ quyền, chấm sao. */
class LibraryDeckIT extends IntegrationTest {

    private static final String LIBRARY = "/api/library/decks";

    /**
     * Self-check chuyển dữ liệu: library-decks-legacy.json là bản xuất nguyên văn CURATED_DECKS
     * (frontend/src/data/libraryDecks.ts, đã xoá). Mọi trường và thẻ đọc ra từ DB phải khớp.
     */
    @Test
    void seeded_library_matches_the_old_hardcoded_decks() throws Exception {
        String token = newUser();
        JsonNode legacy;
        try (InputStream in = new ClassPathResource("library-decks-legacy.json").getInputStream()) {
            legacy = json.readTree(in);
        }
        assertEquals(8, legacy.size());

        JsonNode page = read(call(get(LIBRARY).param("size", "50"), token, null).andExpect(status().isOk()));
        Map<String, JsonNode> byId = new HashMap<>();
        page.get("items").forEach(item -> byId.put(item.get("id").asText(), item));
        assertTrue(page.get("allCount").asLong() >= 10, "8 bộ thẻ cũ + 2 bộ thẻ hệ thống đã gộp");

        for (JsonNode old : legacy) {
            String id = old.get("id").asText();
            JsonNode item = byId.get(id);
            assertNotNull(item, "thiếu bộ thẻ " + id);
            for (String field : List.of("title", "level", "category", "description", "official", "featured")) {
                assertEquals(old.get(field), item.get(field), id + "." + field);
            }
            assertEquals(old.get("cards").size(), item.get("cardsCount").asInt(), id + ": số thẻ tính từ dữ liệu thật");
            assertFalse(item.get("authorName").asText().isBlank());

            JsonNode deck = read(call(get("/api/decks/" + id), token, null).andExpect(status().isOk()));
            assertEquals("viewer", deck.get("access").asText());
            assertEquals("public", deck.get("visibility").asText());
            JsonNode cards = deck.get("cards");
            for (int i = 0; i < old.get("cards").size(); i++) {
                JsonNode o = old.get("cards").get(i), c = cards.get(i);
                assertEquals(id + "-" + (i + 1), c.get("id").asText());
                for (String field : List.of("term", "reading", "meaning", "example")) {
                    assertEquals(o.get(field), c.get(field), id + " thẻ " + (i + 1) + "." + field);
                }
            }
        }
        // Chỉ 1 bộ nổi bật, banner trả kèm thẻ mẫu = thẻ đầu tiên
        assertEquals("lib-n2-grammar-100", page.get("featured").get("deck").get("id").asText());
        assertEquals("lib-n2-grammar-100-1", page.get("featured").get("sampleCard").get("id").asText());
        // Bộ thẻ hệ thống cũ gộp vào Thư viện, giữ id thẻ (tiến độ SRS cũ vẫn gắn đúng)
        assertTrue(byId.containsKey("n5-core") && byId.containsKey("n4-society"));
    }

    @Test
    void search_filter_sort_and_paginate_on_the_server() throws Exception {
        String token = newUser();
        JsonNode minna = read(call(get(LIBRARY).param("q", "  MINNA "), token, null).andExpect(status().isOk()));
        assertEquals(List.of("lib-minna-n5-core"), ids(minna));

        JsonNode it = read(call(get(LIBRARY).param("level", "N2").param("category", "it"), token, null));
        assertEquals(List.of("lib-it-brse-words"), ids(it));

        JsonNode official = read(call(get(LIBRARY).param("tab", "official").param("size", "50"), token, null));
        official.get("items").forEach(i -> assertTrue(i.get("official").asBoolean()));

        JsonNode byCards = read(call(get(LIBRARY).param("sort", "cards").param("size", "50"), token, null));
        List<Integer> counts = new ArrayList<>();
        byCards.get("items").forEach(i -> counts.add(i.get("cardsCount").asInt()));
        List<Integer> sorted = new ArrayList<>(counts);
        sorted.sort((a, b) -> b - a);
        assertEquals(sorted, counts, "sắp theo số thẻ giảm dần");

        JsonNode p0 = read(call(get(LIBRARY).param("size", "3"), token, null));
        JsonNode p1 = read(call(get(LIBRARY).param("size", "3").param("page", "1"), token, null));
        assertEquals(3, p0.get("items").size());
        assertTrue(p0.get("total").asLong() >= 10);
        assertTrue(ids(p1).stream().noneMatch(ids(p0)::contains), "2 trang không trùng bộ thẻ");

        call(get(LIBRARY).param("size", "51"), token, null).andExpect(status().isBadRequest());
        call(get(LIBRARY).param("sort", "title; DROP TABLE decks"), token, null).andExpect(status().isBadRequest());
        call(get(LIBRARY).param("level", "N6"), token, null).andExpect(status().isBadRequest());
        call(get(LIBRARY), null, null).andExpect(status().isUnauthorized());
    }

    @Test
    void saving_a_library_deck_copies_it_and_counts_a_download_but_viewers_cannot_edit() throws Exception {
        String token = newUser();
        long before = downloads(token, "lib-kanji-214-radicals");

        JsonNode copy = read(call(post("/api/decks/lib-kanji-214-radicals/clone"), token, Map.of())
                .andExpect(status().isCreated()));
        assertEquals("owner", copy.get("access").asText());
        assertEquals("private", copy.get("visibility").asText());
        assertEquals(6, copy.get("cards").size());
        assertNotEquals("lib-kanji-214-radicals-1", copy.get("cards").get(0).get("id").asText());
        assertEquals(before + 1, downloads(token, "lib-kanji-214-radicals"));

        call(put("/api/decks/lib-kanji-214-radicals"), token, Map.of("title", "x", "level", "N5"))
                .andExpect(status().isForbidden());
        call(delete("/api/decks/lib-kanji-214-radicals"), token, null).andExpect(status().isForbidden());
        call(post("/api/decks/lib-kanji-214-radicals/cards"), token, Map.of("term", "t", "meaning", "m"))
                .andExpect(status().isForbidden());
    }

    @Test
    void owner_shares_with_viewer_or_editor_and_can_revoke() throws Exception {
        String alice = newUser();
        String bobEmail = newEmail();
        String bob = newUser(bobEmail);
        JsonNode deck = read(call(post("/api/decks"), alice, Map.of("title", "Riêng", "level", "N3",
                "cards", List.of(Map.of("term", "A", "meaning", "a")))).andExpect(status().isCreated()));
        String url = "/api/decks/" + deck.get("id").asText();

        call(get(url), bob, null).andExpect(status().isNotFound());

        JsonNode members = read(call(put(url + "/shares"), alice, Map.of("email", bobEmail.toUpperCase(), "permission", "VIEWER"))
                .andExpect(status().isOk()));
        assertEquals(1, members.size());
        long bobId = members.get(0).get("userId").asLong();
        assertEquals("viewer", read(call(get(url), bob, null).andExpect(status().isOk())).get("access").asText());
        call(put(url), bob, Map.of("title", "Sửa", "level", "N3")).andExpect(status().isForbidden());

        call(put(url + "/shares"), alice, Map.of("email", bobEmail, "permission", "EDITOR")).andExpect(status().isOk());
        JsonNode edited = read(call(put(url), bob, Map.of("title", "Sửa", "level", "N3", "visibility", "public"))
                .andExpect(status().isOk()));
        assertEquals("Sửa", edited.get("title").asText());
        assertEquals("private", edited.get("visibility").asText(), "người sửa không đổi được chế độ hiển thị");
        call(post(url + "/cards"), bob, Map.of("term", "B", "meaning", "b")).andExpect(status().isCreated());
        call(delete(url), bob, null).andExpect(status().isForbidden());
        call(get(url + "/shares"), bob, null).andExpect(status().isForbidden());

        // Validate đầu vào ghi
        call(put(url + "/shares"), alice, Map.of("email", bobEmail, "permission", "OWNER")).andExpect(status().isBadRequest());
        call(put(url + "/shares"), alice, Map.of("email", "not-an-email", "permission", "VIEWER")).andExpect(status().isBadRequest());
        call(put(url + "/shares"), alice, Map.of("email", newEmail(), "permission", "VIEWER")).andExpect(status().isNotFound());

        call(delete(url + "/shares/" + bobId), alice, null).andExpect(status().isNoContent());
        call(get(url), bob, null).andExpect(status().isNotFound());
    }

    @Test
    void rating_is_one_per_user_and_validated() throws Exception {
        String token = newUser();
        String rate = LIBRARY + "/lib-nhk-easy-news/rating";
        long before = libraryItem(token, "lib-nhk-easy-news").get("ratingsCount").asLong();

        call(put(rate), token, Map.of("stars", 5)).andExpect(status().isOk());
        JsonNode again = read(call(put(rate), token, Map.of("stars", 3)).andExpect(status().isOk()));
        assertEquals(before + 1, again.get("ratingsCount").asLong(), "chấm lại không tạo lượt mới");
        assertEquals(3, libraryItem(token, "lib-nhk-easy-news").get("myRating").asInt());

        call(put(rate), token, Map.of("stars", 6)).andExpect(status().isBadRequest());
        call(put(rate), token, Map.of()).andExpect(status().isBadRequest());

        JsonNode mine = read(call(post("/api/decks"), token, Map.of("title", "Của tôi", "level", "N5",
                "visibility", "public", "category", "goi")).andExpect(status().isCreated()));
        call(put(LIBRARY + "/" + mine.get("id").asText() + "/rating"), token, Map.of("stars", 5))
                .andExpect(status().isBadRequest());
        JsonNode hidden = read(call(post("/api/decks"), newUser(), Map.of("title", "Ẩn", "level", "N5")));
        call(put(LIBRARY + "/" + hidden.get("id").asText() + "/rating"), token, Map.of("stars", 5))
                .andExpect(status().isNotFound());
    }

    private List<String> ids(JsonNode page) {
        List<String> ids = new ArrayList<>();
        page.get("items").forEach(i -> ids.add(i.get("id").asText()));
        return ids;
    }

    private JsonNode libraryItem(String token, String id) throws Exception {
        JsonNode page = read(call(get(LIBRARY).param("size", "50"), token, null));
        for (JsonNode item : page.get("items")) {
            if (item.get("id").asText().equals(id)) return item;
        }
        throw new AssertionError("không thấy " + id);
    }

    private long downloads(String token, String id) throws Exception {
        return libraryItem(token, id).get("downloadsCount").asLong();
    }
}
