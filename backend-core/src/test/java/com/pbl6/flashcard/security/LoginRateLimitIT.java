package com.pbl6.flashcard.security;

import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class LoginRateLimitIT extends IntegrationTest {

    @Test
    void too_many_wrong_passwords_block_even_the_correct_one() throws Exception {
        String email = "rl-" + UUID.randomUUID() + "@test.com";
        call(post("/api/auth/register"), null, Map.of("email", email, "password", "secret123", "fullName", "R"))
                .andExpect(status().isOk());
        for (int i = 0; i < LoginAttemptLimiter.MAX_FAILURES; i++) {
            call(post("/api/auth/login"), null, Map.of("email", email, "password", "wrong-" + i))
                    .andExpect(status().isUnauthorized());
        }
        call(post("/api/auth/login"), null, Map.of("email", email, "password", "secret123"))
                .andExpect(status().isTooManyRequests());
    }

    @Test
    void a_successful_login_resets_the_counter() throws Exception {
        String email = "rl-" + UUID.randomUUID() + "@test.com";
        call(post("/api/auth/register"), null, Map.of("email", email, "password", "secret123", "fullName", "R"));
        markEmailVerified(email); // chưa xác thực thì mật khẩu đúng vẫn 403 EMAIL_NOT_VERIFIED (EmailVerificationIT)
        for (int round = 0; round < 3; round++) {
            for (int i = 0; i < LoginAttemptLimiter.MAX_FAILURES - 1; i++) {
                call(post("/api/auth/login"), null, Map.of("email", email, "password", "wrong"));
            }
            call(post("/api/auth/login"), null, Map.of("email", email, "password", "secret123"))
                    .andExpect(status().isOk());
        }
    }
}
