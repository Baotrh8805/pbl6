package com.pbl6.flashcard.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * V15 seed hai tài khoản quản trị với mật khẩu mặc định; V16 bắt đổi mật khẩu (G1) trước khi vào /api/admin.
 * Test đổi mật khẩu của seed trong DB nhúng (mỗi lớp test một DB mới).
 */
class SeedAdminAccountsIT extends IntegrationTest {

    private JsonNode login(String email, String password) throws Exception {
        return read(call(post("/api/auth/login"), null, Map.of("email", email, "password", password))
                .andExpect(status().isOk()));
    }

    @Test
    void superadmin_seed_must_change_password_then_reaches_super_admin_endpoints() throws Exception {
        JsonNode t = login("superadmin@nihongen.local", "superadmin");
        assertEquals("SUPER_ADMIN", t.get("role").asText());
        assertTrue(t.get("mustChangePassword").asBoolean());
        String token = t.get("accessToken").asText();
        call(get("/api/admin/settings"), token, null).andExpect(status().isForbidden());
        call(get("/api/decks"), token, null).andExpect(status().isForbidden());

        token = read(call(put("/api/auth/password"), token,
                Map.of("currentPassword", "superadmin", "newPassword", "Sup3r-Secret-Pass")).andExpect(status().isOk()))
                .get("accessToken").asText();
        call(get("/api/admin/settings"), token, null).andExpect(status().isOk());
        call(get("/api/decks"), token, null).andExpect(status().isForbidden());
    }

    @Test
    void admin1_seed_logs_in_as_admin_pending_password_change() throws Exception {
        JsonNode t = login("admin1@nihongen.local", "admin1");
        assertEquals("ADMIN", t.get("role").asText());
        assertTrue(t.get("mustChangePassword").asBoolean());
        call(get("/api/admin/stats"), t.get("accessToken").asText(), null).andExpect(status().isForbidden());
        Map<String, Object> body = Map.of("extraction_daily_limit_free", 5, "extraction_daily_limit_premium", 50,
                "announcement", "", "registration_open", true);
        call(put("/api/admin/settings"), t.get("accessToken").asText(), body).andExpect(status().isForbidden());
    }
}
