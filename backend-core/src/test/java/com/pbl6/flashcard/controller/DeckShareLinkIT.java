package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Link chia sẻ bộ thẻ (D9) và xuất bộ thẻ (UC-29), kế hoạch 2026-10-26 B1 / B2: chủ tạo / đổi / thu hồi link, người khác mở link
 * được quyền xem bộ riêng tư (học, sao chép), token cũ / sai 404, thu hồi không gỡ người đã nhận, không hạ quyền EDITOR; xuất CSV /
 * Anki theo quyền xem.
 */
class DeckShareLinkIT extends IntegrationTest {

    private String privateDeck(String token) throws Exception {
        return read(call(post("/api/decks"), token, Map.of("title", "Bài 1: chào hỏi", "level", "N5", "cards", List.of(
                Map.of("term", "食べる", "reading", "たべる", "meaning", "ăn, dùng bữa"),
                Map.of("term", "=SUM(A1)", "meaning", "dòng 1\ndòng \"2\""))))
                .andExpect(status().isCreated())).get("id").asText();
    }

    @Test
    void owner_manages_link_and_others_gain_view_access() throws Exception {
        String owner = newUser();
        String other = newUser();
        String deckId = privateDeck(owner);

        assertTrue(read(call(get("/api/decks/{id}/share-link", deckId), owner, null).andExpect(status().isOk())).get("token").isNull());
        call(post("/api/decks/{id}/share-link", deckId), other, null).andExpect(status().isForbidden());
        call(get("/api/decks/{id}", deckId), other, null).andExpect(status().isNotFound());

        String token = read(call(post("/api/decks/{id}/share-link", deckId), owner, null).andExpect(status().isOk())).get("token").asText();
        assertEquals(43, token.length());
        JsonNode acc = read(call(post("/api/decks/share-link/{t}/accept", token), other, null).andExpect(status().isOk()));
        assertEquals(deckId, acc.get("deckId").asText());
        assertEquals("viewer", acc.get("access").asText());
        call(get("/api/decks/{id}", deckId), other, null).andExpect(status().isOk()).andExpect(jsonPath("$.access").value("viewer"));
        // mở lại: không nhân đôi, chủ mở link của mình: không đổi gì
        call(post("/api/decks/share-link/{t}/accept", token), other, null).andExpect(jsonPath("$.access").value("viewer"));
        call(post("/api/decks/share-link/{t}/accept", token), owner, null).andExpect(jsonPath("$.access").value("owner"));
        assertEquals(1, read(call(get("/api/decks/{id}/shares", deckId), owner, null)).size());
        // người xem sao chép được bộ riêng tư
        call(post("/api/decks/{id}/clone", deckId), other, null).andExpect(status().isCreated());

        // đổi token: link cũ hết hiệu lực; thu hồi: link mới cũng hết, người đã nhận vẫn xem được
        String rotated = read(call(post("/api/decks/{id}/share-link", deckId), owner, null)).get("token").asText();
        assertNotEquals(token, rotated);
        String third = newUser();
        call(post("/api/decks/share-link/{t}/accept", token), third, null).andExpect(status().isNotFound());
        call(delete("/api/decks/{id}/share-link", deckId), owner, null).andExpect(status().isNoContent());
        call(post("/api/decks/share-link/{t}/accept", rotated), third, null).andExpect(status().isNotFound());
        call(post("/api/decks/share-link/{t}/accept", "không-hợp-lệ"), third, null).andExpect(status().isNotFound());
        call(get("/api/decks/{id}", deckId), other, null).andExpect(status().isOk());

        // xoá bộ thẻ (xoá cứng): link đang bật cũng mất theo
        String last = read(call(post("/api/decks/{id}/share-link", deckId), owner, null)).get("token").asText();
        call(delete("/api/decks/{id}", deckId), owner, null).andExpect(status().is2xxSuccessful());
        call(post("/api/decks/share-link/{t}/accept", last), third, null).andExpect(status().isNotFound());
    }

    @Test
    void accepting_keeps_editor_permission_and_staff_is_forbidden() throws Exception {
        String ownerEmail = newEmail();
        String owner = newUser(ownerEmail);
        String editorEmail = newEmail();
        String editor = newUser(editorEmail);
        String deckId = privateDeck(owner);
        call(put("/api/decks/{id}/shares", deckId), owner, Map.of("email", editorEmail, "permission", "EDITOR")).andExpect(status().isOk());
        String token = read(call(post("/api/decks/{id}/share-link", deckId), owner, null)).get("token").asText();
        call(post("/api/decks/share-link/{t}/accept", token), editor, null).andExpect(jsonPath("$.access").value("editor"));
        call(post("/api/decks/share-link/{t}/accept", token), newStaff(Role.ADMIN), null).andExpect(status().isForbidden());
    }

    @Test
    void share_link_password_gates_new_viewers_only() throws Exception {
        String owner = newUser();
        String friend = newUser();
        String deckId = privateDeck(owner);
        call(post("/api/decks/{id}/share-link", deckId), owner, Map.of("password", "ab")).andExpect(status().isBadRequest());
        JsonNode link = read(call(post("/api/decks/{id}/share-link", deckId), owner, Map.of("password", "mo-cua-1"))
                .andExpect(status().isOk()));
        String token = link.get("token").asText();
        assertTrue(link.get("hasPassword").asBoolean());
        assertTrue(read(call(get("/api/decks/{id}/share-link", deckId), owner, null)).get("hasPassword").asBoolean());

        call(post("/api/decks/share-link/{t}/accept", token), friend, null).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("SHARE_PASSWORD_REQUIRED"));
        call(post("/api/decks/share-link/{t}/accept", token), friend, Map.of("password", "sai")).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("SHARE_PASSWORD_WRONG"));
        call(get("/api/decks/{id}", deckId), friend, null).andExpect(status().isNotFound());
        call(post("/api/decks/share-link/{t}/accept", token), friend, Map.of("password", " mo-cua-1 ")).andExpect(status().isOk())
                .andExpect(jsonPath("$.access").value("viewer"));
        // đã có quyền: mở lại không cần mật khẩu; chủ cũng không
        call(post("/api/decks/share-link/{t}/accept", token), friend, null).andExpect(status().isOk());
        call(post("/api/decks/share-link/{t}/accept", token), owner, null).andExpect(jsonPath("$.access").value("owner"));
        // đổi link không mật khẩu -> hasPassword false, người mới vào thẳng
        JsonNode plain = read(call(post("/api/decks/{id}/share-link", deckId), owner, null));
        assertFalse(plain.get("hasPassword").asBoolean());
        call(post("/api/decks/share-link/{t}/accept", plain.get("token").asText()), newUser(), null).andExpect(status().isOk());
    }

    @Test
    void deck_and_cards_carry_timestamps_and_progress_can_be_reset() throws Exception {
        String owner = newUser();
        String stranger = newUser();
        String deckId = privateDeck(owner);
        JsonNode deck = read(call(get("/api/decks/{id}", deckId), owner, null).andExpect(status().isOk()));
        assertTrue(deck.hasNonNull("createdAt") && deck.hasNonNull("updatedAt"), deck.toString());
        assertTrue(deck.get("cards").get(0).hasNonNull("createdAt"));
        String before = deck.get("updatedAt").asText();
        Thread.sleep(5);
        call(post("/api/decks/{id}/cards", deckId), owner, Map.of("term", "水", "meaning", "nước")).andExpect(status().is2xxSuccessful());
        String after = read(call(get("/api/decks/{id}", deckId), owner, null)).get("updatedAt").asText();
        assertTrue(after.compareTo(before) > 0, "thêm thẻ làm updatedAt tiến lên: " + before + " -> " + after);

        String cardId = deck.get("cards").get(0).get("id").asText();
        call(post("/api/reviews"), owner, Map.of("cardId", cardId, "grade", "good")).andExpect(status().isOk());
        assertEquals(1, read(call(get("/api/reviews"), owner, null)).size());
        call(delete("/api/decks/{id}/progress", deckId), stranger, null).andExpect(status().isNotFound());
        call(delete("/api/decks/{id}/progress", deckId), owner, null).andExpect(status().isOk())
                .andExpect(jsonPath("$.reset").value(1));
        assertEquals(0, read(call(get("/api/reviews"), owner, null)).size(), "lịch ôn của bộ đã xoá, học lại từ đầu");
    }

    @Test
    void export_csv_and_anki_follow_view_access() throws Exception {
        String owner = newUser();
        String stranger = newUser();
        String deckId = privateDeck(owner);
        MvcResult csv = call(get("/api/decks/{id}/export", deckId), owner, null).andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.containsString("bai-1-chao-hoi-")))
                .andReturn();
        String body = new String(csv.getResponse().getContentAsByteArray(), StandardCharsets.UTF_8);
        assertTrue(body.startsWith("﻿食べる,"), "mặc định không có dòng tiêu đề (27/10): " + body);
        String withHeader = new String(call(get("/api/decks/{id}/export", deckId).param("header", "true"), owner, null)
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray(), StandardCharsets.UTF_8);
        assertTrue(withHeader.startsWith("﻿term,reading,meaning,level,han_viet,pos\r\n"), withHeader);
        assertTrue(body.contains("食べる,たべる,\"ăn, dùng bữa\""), body);
        assertTrue(body.contains("'=SUM(A1)"), "chặn công thức khi mở bằng bảng tính");
        String anki = new String(call(get("/api/decks/{id}/export", deckId).param("format", "anki"), owner, null)
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray(), StandardCharsets.UTF_8);
        assertTrue(anki.startsWith("#separator:tab\n#html:true\n"), anki);
        assertTrue(anki.contains("食べる\tたべる<br>ăn, dùng bữa\n"), anki);
        assertTrue(anki.contains("dòng 1<br>dòng \"2\""), anki);
        call(get("/api/decks/{id}/export", deckId).param("format", "pdf"), owner, null).andExpect(status().isBadRequest());
        call(get("/api/decks/{id}/export", deckId), stranger, null).andExpect(status().isNotFound());
    }
}
