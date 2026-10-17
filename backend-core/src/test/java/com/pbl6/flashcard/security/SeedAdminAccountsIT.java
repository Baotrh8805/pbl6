package com.pbl6.flashcard.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** V15 seed: hai tài khoản quản trị đăng nhập được bằng mật khẩu mặc định và vào được /api/admin. */
class SeedAdminAccountsIT extends IntegrationTest {

    private JsonNode login(String email, String password) throws Exception {
        return read(call(post("/api/auth/login"), null, Map.of("email", email, "password", password))
                .andExpect(status().isOk()));
    }

    @Test
    void superadmin_seed_logs_in_as_super_admin() throws Exception {
        JsonNode t = login("superadmin@nihongen.local", "superadmin");
        assertEquals("SUPER_ADMIN", t.get("role").asText());
        call(get("/api/admin/settings"), t.get("accessToken").asText(), null).andExpect(status().isOk());
        call(get("/api/decks"), t.get("accessToken").asText(), null).andExpect(status().isForbidden());
    }

    @Test
    void admin1_seed_logs_in_as_admin() throws Exception {
        JsonNode t = login("admin1@nihongen.local", "admin1");
        assertEquals("ADMIN", t.get("role").asText());
        call(get("/api/admin/stats"), t.get("accessToken").asText(), null).andExpect(status().isOk());
        Map<String, Object> body = Map.of("extraction_daily_limit_free", 5, "extraction_daily_limit_premium", 50,
                "announcement", "", "registration_open", true);
        call(put("/api/admin/settings"), t.get("accessToken").asText(), body).andExpect(status().isForbidden());
    }
}
