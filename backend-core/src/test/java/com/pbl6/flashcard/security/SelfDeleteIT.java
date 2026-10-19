package com.pbl6.flashcard.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** G4/B5: người dùng tự xoá -> ẩn danh hoá, xoá dữ liệu riêng, giữ bộ thẻ public; staff không tự xoá được. */
class SelfDeleteIT extends IntegrationTest {

    @Autowired JdbcTemplate jdbc;

    private int count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    @Test
    void deleting_own_account_anonymises_and_removes_private_data() throws Exception {
        String email = newEmail();
        String token = newUser(email);
        Long uid = userId(email);
        String friend = newUser();

        String pub = read(call(post("/api/decks"), token, Map.of("title", "Public giữ lại", "level", "N5", "visibility", "public",
                "cards", List.of(Map.of("term", "犬", "meaning", "chó"))))).get("id").asText();
        JsonNode priv = read(call(post("/api/decks"), token, Map.of("title", "Riêng tư xoá", "level", "N5",
                "cards", List.of(Map.of("term", "猫", "meaning", "mèo")))));
        String privId = priv.get("id").asText();
        String cardId = priv.get("cards").get(0).get("id").asText();
        call(post("/api/reviews"), token, Map.of("cardId", cardId, "grade", "good")).andExpect(status().isOk());
        call(post("/api/folders"), token, Map.of("name", "Thư mục của tôi"));
        call(put("/api/library/decks/" + pub + "/rating"), friend, Map.of("stars", 5, "comment", "hay")).andExpect(status().isOk());

        call(delete("/api/auth/me"), token, Map.of("password", "sai-mat-khau")).andExpect(status().isBadRequest());
        call(delete("/api/auth/me"), token, Map.of("password", "secret123")).andExpect(status().isNoContent());

        // Token cũ vô hiệu, đăng nhập cũ 401 (email đã đổi), email cũ đăng ký lại được
        call(get("/api/auth/me"), token, null).andExpect(status().isUnauthorized());
        call(post("/api/auth/login"), null, Map.of("email", email, "password", "secret123")).andExpect(status().isUnauthorized());
        call(post("/api/auth/register"), null, Map.of("email", email, "password", "secret123", "fullName", "Lại")).andExpect(status().isOk());

        User u = userRepository.findById(uid).orElseThrow();
        assertEquals("deleted+" + uid + "@deleted.local", u.getEmail());
        assertEquals("Người dùng đã xoá", u.getFullName());
        assertNotNull(u.getLockedAt());

        assertEquals(0, count("SELECT count(*) FROM decks WHERE id = ?", privId), "bộ riêng tư bị xoá");
        assertEquals(1, count("SELECT count(*) FROM decks WHERE id = ?", pub), "bộ public còn");
        assertEquals(1, count("SELECT count(*) FROM deck_ratings WHERE deck_id = ?", pub), "đánh giá của người khác còn");
        assertEquals(0, count("SELECT count(*) FROM reviews WHERE user_id = ?", uid));
        assertEquals(0, count("SELECT count(*) FROM folders WHERE user_id = ?", uid));
        assertEquals(0, count("SELECT count(*) FROM refresh_tokens WHERE user_id = ?", uid));
        assertEquals(1, count("SELECT count(*) FROM admin_audit_logs WHERE action = 'USER_SELF_DELETE' AND actor_id = ?", uid));

        // Người khác vẫn mở được bộ public trong Thư viện với tên ẩn danh
        JsonNode lib = read(call(get("/api/library/decks").param("q", "Public giữ lại"), friend, null).andExpect(status().isOk()));
        assertTrue(lib.toString().contains("Người dùng đã xoá"), () -> lib.toString().substring(0, Math.min(400, lib.toString().length())));
    }

    @Test
    void staff_cannot_delete_own_account() throws Exception {
        String admin = newStaff(Role.ADMIN);
        call(delete("/api/auth/me"), admin, Map.of("password", "secret123")).andExpect(status().isForbidden());
    }
}
