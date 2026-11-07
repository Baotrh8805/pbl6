package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** G3: hành động admin sinh thông báo cho đúng người; chỉ chủ sở hữu đọc / đánh dấu được. */
class NotificationIT extends IntegrationTest {

    private JsonNode feed(String token) throws Exception {
        return read(call(get("/api/notifications"), token, null).andExpect(status().isOk()));
    }

    private static List<String> types(JsonNode feed) {
        return feed.get("items").findValuesAsText("type");
    }

    @Test
    void resolving_a_report_notifies_reporter_and_deck_owner() throws Exception {
        String ownerEmail = newEmail();
        String owner = newUser(ownerEmail);
        String reporter = newUser();
        String admin = newStaff(Role.ADMIN);

        String deckId = read(call(post("/api/decks"), owner, Map.of("title", "Bộ thẻ bị báo cáo", "level", "N5",
                "visibility", "public", "cards", List.of(Map.of("term", "犬", "meaning", "chó")))).andExpect(status().isCreated()))
                .get("id").asText();
        call(post("/api/library/decks/" + deckId + "/reports"), reporter, Map.of("reason", "SPAM")).andExpect(status().isCreated());
        assertEquals(0, feed(reporter).get("unread").asLong());

        long reportId = read(call(get("/api/admin/reports").param("deckId", deckId), admin, null)).get("items").get(0).get("id").asLong();
        call(post("/api/admin/reports/" + reportId + "/resolve"), admin, Map.of("action", "UNPUBLISH_DECK", "note", "đã gỡ"))
                .andExpect(status().isOk());

        JsonNode r = feed(reporter);
        assertEquals(1, r.get("unread").asLong());
        JsonNode item = r.get("items").get(0);
        assertEquals("REPORT_RESOLVED", item.get("type").asText());
        assertEquals("UNPUBLISH_DECK", item.get("payload").get("action").asText());
        assertEquals("Bộ thẻ bị báo cáo", item.get("payload").get("deckTitle").asText());
        assertTrue(item.get("readAt").isNull());

        JsonNode o = feed(owner);
        assertEquals(List.of("DECK_UNPUBLISHED"), types(o));
        assertEquals(deckId, o.get("items").get(0).get("payload").get("deckId").asText());

        // Đánh dấu đã đọc: người khác không đụng được (404), chủ sở hữu được (204), đếm chưa đọc về 0
        long id = item.get("id").asLong();
        call(post("/api/notifications/" + id + "/read"), owner, null).andExpect(status().isNotFound());
        call(post("/api/notifications/" + id + "/read"), reporter, null).andExpect(status().isNoContent());
        assertEquals(0, feed(reporter).get("unread").asLong());
        assertFalse(feed(reporter).get("items").get(0).get("readAt").isNull());
    }

    @Test
    void premium_role_and_deck_delete_notify_the_user() throws Exception {
        String email = newEmail();
        String user = newUser(email);
        Long id = userId(email);
        String root = newStaff(Role.SUPER_ADMIN);
        String deckId = read(call(post("/api/decks"), user, Map.of("title", "Sẽ bị xoá", "level", "N5"))).get("id").asText();

        call(patch("/api/admin/users/" + id), root, Map.of("premium", true)).andExpect(status().isOk());
        call(patch("/api/admin/users/" + id), root, Map.of("premium", true)).andExpect(status().isOk()); // không đổi -> không thông báo
        call(delete("/api/admin/decks/" + deckId), root, null).andExpect(status().isNoContent());
        call(put("/api/admin/users/" + id + "/role"), root, Map.of("role", "ADMIN")).andExpect(status().isOk());

        // Vừa thành staff vẫn đọc được thông báo (matcher authenticated, không cần ROLE_USER)
        JsonNode f = feed(read(call(post("/api/auth/login"), null, Map.of("email", email, "password", "Secret123!"))).get("accessToken").asText());
        assertEquals(List.of("ROLE_CHANGED", "DECK_DELETED", "PREMIUM_CHANGED"), types(f));
        assertEquals(3, f.get("unread").asLong());
        assertEquals("Sẽ bị xoá", f.get("items").get(1).get("payload").get("deckTitle").asText());

        String token = read(call(post("/api/auth/login"), null, Map.of("email", email, "password", "Secret123!"))).get("accessToken").asText();
        assertEquals(3, read(call(post("/api/notifications/read-all"), token, null)).get("updated").asInt());
        assertEquals(0, feed(token).get("unread").asLong());
    }

    @Test
    void anonymous_is_unauthorized() throws Exception {
        call(get("/api/notifications"), null, null).andExpect(status().isUnauthorized());
    }
}
