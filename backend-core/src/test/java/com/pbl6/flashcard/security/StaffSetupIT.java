package com.pbl6.flashcard.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** G1: staff phải đổi mật khẩu seed trước khi vào Admin Panel; khoá kèm lý do. */
class StaffSetupIT extends IntegrationTest {

    private Map<String, Object> login(String email, String password) {
        return Map.of("email", email, "password", password);
    }

    @Test
    void must_change_password_blocks_admin_until_changed() throws Exception {
        String email = newEmail();
        newUser(email);
        User u = userRepository.findByEmail(email).orElseThrow();
        u.setRole(Role.ADMIN);
        u.setMustChangePassword(true);
        userRepository.save(u);

        JsonNode r = read(call(post("/api/auth/login"), null, login(email, "Secret123!")).andExpect(status().isOk()));
        assertTrue(r.get("mustChangePassword").asBoolean());
        String token = r.get("accessToken").asText();
        call(get("/api/admin/stats"), token, null).andExpect(status().isForbidden());
        call(get("/api/decks"), token, null).andExpect(status().isForbidden());
        call(get("/api/auth/me"), token, null).andExpect(status().isOk());

        JsonNode fresh = read(call(put("/api/auth/password"), token,
                Map.of("currentPassword", "Secret123!", "newPassword", "New-Secret456!")).andExpect(status().isOk()));
        assertFalse(fresh.get("mustChangePassword").asBoolean());
        call(get("/api/admin/stats"), fresh.get("accessToken").asText(), null).andExpect(status().isOk());
        assertFalse(read(call(get("/api/auth/me"), fresh.get("accessToken").asText(), null)).get("mustChangePassword").asBoolean());
    }

    @Test
    void dashboard_counts_staff_pending_setup() throws Exception {
        String admin = newStaff(Role.ADMIN);
        long before = read(call(get("/api/admin/stats"), admin, null)).get("users").get("staffPendingSetup").asLong();
        String email = newEmail();
        newUser(email);
        User u = userRepository.findByEmail(email).orElseThrow();
        u.setRole(Role.ADMIN);
        u.setMustChangePassword(true);
        userRepository.save(u);
        long after = read(call(get("/api/admin/stats"), admin, null)).get("users").get("staffPendingSetup").asLong();
        assertEquals(before + 1, after);
    }

    @Test
    void lock_with_reason_is_shown_at_login_and_cleared_on_unlock() throws Exception {
        String admin = newStaff(Role.ADMIN);
        String email = newEmail();
        newUser(email);
        Long id = userId(email);
        JsonNode d = read(call(patch("/api/admin/users/" + id), admin, Map.of("locked", true, "lockedReason", "Spam bình luận"))
                .andExpect(status().isOk()));
        assertEquals("Spam bình luận", d.get("lockedReason").asText());
        String body = call(post("/api/auth/login"), null, login(email, "Secret123!"))
                .andExpect(status().isForbidden()).andReturn().getResponse().getContentAsString();
        assertTrue(body.contains("Spam bình luận"), body);
        d = read(call(patch("/api/admin/users/" + id), admin, Map.of("locked", false)).andExpect(status().isOk()));
        assertTrue(d.get("lockedReason").isNull());
        call(post("/api/auth/login"), null, login(email, "Secret123!")).andExpect(status().isOk());
    }
}
