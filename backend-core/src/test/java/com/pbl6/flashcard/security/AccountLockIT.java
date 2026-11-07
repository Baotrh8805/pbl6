package com.pbl6.flashcard.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Map;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Khoá tài khoản (users.locked_at) chặn ở 3 điểm: đăng nhập, access token đang có, refresh token. */
class AccountLockIT extends IntegrationTest {

    private JsonNode login(String email) throws Exception {
        return read(call(post("/api/auth/login"), null, Map.of("email", email, "password", "Secret123!")));
    }

    private void setLocked(String email, boolean locked) {
        User u = userRepository.findByEmail(email).orElseThrow();
        u.setLockedAt(locked ? Instant.now() : null);
        userRepository.save(u);
    }

    @Test
    void locked_user_cannot_login() throws Exception {
        String email = newEmail();
        newUser(email);
        setLocked(email, true);
        call(post("/api/auth/login"), null, Map.of("email", email, "password", "Secret123!"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message", containsString("khoá")));
    }

    @Test
    void locked_user_access_token_is_rejected() throws Exception {
        String email = newEmail();
        String token = newUser(email);
        call(get("/api/decks"), token, null).andExpect(status().isOk());
        setLocked(email, true);
        call(get("/api/decks"), token, null).andExpect(status().isUnauthorized());
    }

    @Test
    void locked_user_refresh_is_rejected() throws Exception {
        String email = newEmail();
        newUser(email);
        String refresh = login(email).get("refreshToken").asText();
        setLocked(email, true);
        call(post("/api/auth/refresh"), null, Map.of("refreshToken", refresh)).andExpect(status().isUnauthorized());
    }

    @Test
    void unlocked_user_can_login_again() throws Exception {
        String email = newEmail();
        newUser(email);
        setLocked(email, true);
        setLocked(email, false);
        call(post("/api/auth/login"), null, Map.of("email", email, "password", "Secret123!")).andExpect(status().isOk());
    }
}
