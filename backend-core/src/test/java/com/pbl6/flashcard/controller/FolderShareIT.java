package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** "Bộ thẻ của tôi" tách khỏi Thư viện; chia sẻ thư mục = quyền xem & học mọi bộ thẻ trong cây con. */
class FolderShareIT extends IntegrationTest {

    @Test
    void personal_deck_list_excludes_other_peoples_public_decks_but_keeps_saved_copies() throws Exception {
        String token = newUser();
        JsonNode copy = read(call(post("/api/decks/n5-core/clone"), token, Map.of()).andExpect(status().isCreated()));

        JsonNode mine = read(call(get("/api/decks"), token, null).andExpect(status().isOk()));
        assertEquals(1, mine.size(), "chỉ có bản đã lưu, không có deck public của Thư viện");
        assertEquals(copy.get("id").asText(), mine.get(0).get("id").asText());

        // Deck public vẫn mở / học được từ Thư viện
        call(get("/api/decks/n5-core"), token, null).andExpect(status().isOk());
        call(post("/api/reviews"), token, Map.of("cardId", "n5-1", "grade", "good")).andExpect(status().isOk());
    }

    @Test
    void sharing_a_folder_gives_read_only_access_to_decks_in_its_subtree() throws Exception {
        String alice = newUser();
        String bobEmail = newEmail();
        String bob = newUser(bobEmail);

        String parent = read(call(post("/api/folders"), alice, Map.of("title", "Chung"))).get("id").asText();
        String child = read(call(post("/api/folders"), alice, Map.of("title", "Con", "parentId", parent))).get("id").asText();
        JsonNode deck = read(call(post("/api/decks"), alice, Map.of("title", "Trong con", "level", "N4", "folderId", child,
                "cards", List.of(Map.of("term", "猫", "meaning", "mèo")))).andExpect(status().isCreated()));
        String deckUrl = "/api/decks/" + deck.get("id").asText();
        String cardId = deck.get("cards").get(0).get("id").asText();

        // Chưa chia sẻ: không thấy gì
        call(get("/api/folders/" + parent), bob, null).andExpect(status().isNotFound());
        call(get("/api/decks").param("folderId", child), bob, null).andExpect(status().isNotFound());
        call(get(deckUrl), bob, null).andExpect(status().isNotFound());

        JsonNode members = read(call(put("/api/folders/" + parent + "/shares"), alice, Map.of("email", bobEmail))
                .andExpect(status().isOk()));
        assertEquals(1, members.size());
        long bobId = members.get(0).get("userId").asLong();

        JsonNode shared = read(call(get("/api/folders/shared"), bob, null).andExpect(status().isOk()));
        assertEquals(1, shared.size());
        assertEquals("viewer", shared.get(0).get("access").asText());
        assertEquals(child, shared.get(0).get("children").get(0).get("id").asText());

        JsonNode inChild = read(call(get("/api/decks").param("folderId", child), bob, null).andExpect(status().isOk()));
        assertEquals("viewer", inChild.get(0).get("access").asText());
        assertTrue(inChild.get(0).get("folderId").isNull(), "người xem không thấy thư mục của chủ");
        call(post("/api/reviews"), bob, Map.of("cardId", cardId, "grade", "good")).andExpect(status().isOk());
        call(post(deckUrl + "/clone"), bob, Map.of()).andExpect(status().isCreated());

        // Chỉ xem: không sửa deck, không sửa / chia sẻ thư mục
        call(put(deckUrl), bob, Map.of("title", "x", "level", "N4")).andExpect(status().isForbidden());
        call(put("/api/folders/" + parent), bob, Map.of("title", "x")).andExpect(status().isForbidden());
        call(get("/api/folders/" + parent + "/shares"), bob, null).andExpect(status().isForbidden());

        // Không nằm trong "Bộ thẻ của tôi" (chỉ có bản sao vừa lưu)
        assertEquals(1, read(call(get("/api/decks"), bob, null)).size());

        assertEquals("shared", read(call(get("/api/folders/" + parent), alice, null)).get("accessType").asText(),
                "mời người xem -> nhãn 'shared'");

        call(delete("/api/folders/" + parent + "/shares/" + bobId), alice, null).andExpect(status().isNoContent());
        assertEquals("private", read(call(get("/api/folders/" + parent), alice, null)).get("accessType").asText());
        call(get(deckUrl), bob, null).andExpect(status().isNotFound());
        assertEquals(0, read(call(get("/api/folders/shared"), bob, null)).size());
    }

    @Test
    void public_folder_is_viewable_by_link_and_share_input_is_validated() throws Exception {
        String alice = newUser();
        String bob = newUser();
        String folder = read(call(post("/api/folders"), alice, Map.of("title", "Công khai", "accessType", "public")))
                .get("id").asText();
        JsonNode view = read(call(get("/api/folders/" + folder), bob, null).andExpect(status().isOk()));
        assertEquals("viewer", view.get("access").asText());
        assertEquals(0, read(call(get("/api/folders/shared"), bob, null)).size(), "public không tự hiện trong danh sách");

        call(put("/api/folders/" + folder + "/shares"), alice, Map.of("email", "not-an-email")).andExpect(status().isBadRequest());
        call(put("/api/folders/" + folder + "/shares"), alice, Map.of("email", newEmail())).andExpect(status().isNotFound());

        // Tắt "ai có link": người ngoài mất quyền, vị trí thư mục (cha) giữ nguyên
        String child = read(call(post("/api/folders"), alice, Map.of("title", "Con", "parentId", folder))).get("id").asText();
        JsonNode closed = read(call(put("/api/folders/" + child + "/link-access"), alice, Map.of("public", false))
                .andExpect(status().isOk()));
        assertEquals(folder, closed.get("parentId").asText());
        call(get("/api/folders/" + child), bob, null).andExpect(status().isOk()); // vẫn thừa hưởng từ cha public
        call(put("/api/folders/" + folder + "/link-access"), alice, Map.of("public", false)).andExpect(status().isOk());
        call(get("/api/folders/" + folder), bob, null).andExpect(status().isNotFound());
        call(put("/api/folders/" + folder + "/link-access"), bob, Map.of("public", true)).andExpect(status().isForbidden());
        call(put("/api/folders/" + folder + "/link-access"), alice, Map.of()).andExpect(status().isBadRequest());

        // Bỏ trình độ thư mục bằng chuỗi rỗng
        call(put("/api/folders/" + folder), alice, Map.of("title", "Công khai", "level", "N3")).andExpect(status().isOk());
        JsonNode cleared = read(call(put("/api/folders/" + folder), alice, Map.of("title", "Công khai", "level", ""))
                .andExpect(status().isOk()));
        assertTrue(cleared.get("level").isNull());
    }
}
