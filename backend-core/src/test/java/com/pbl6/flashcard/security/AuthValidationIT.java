package com.pbl6.flashcard.security;

import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Validate đầu vào của /api/auth: lỗi là 400 rõ nghĩa, cùng định dạng JSON, không bao giờ 409/500 do tràn cột. */
class AuthValidationIT extends IntegrationTest {

    @Test
    void too_long_full_name_is_a_400_not_a_fake_duplicate_email() throws Exception {
        call(post("/api/auth/register"), null, Map.of("email", newEmail(), "password", "secret123",
                "fullName", "x".repeat(300)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("fullName: Họ tên tối đa 100 ký tự"));
    }

    @Test
    void duplicate_email_and_wrong_login_use_the_json_error_shape() throws Exception {
        String email = newEmail();
        Map<String, String> body = Map.of("email", email, "password", "secret123", "fullName", "D");
        call(post("/api/auth/register"), null, body).andExpect(status().isOk());
        call(post("/api/auth/register"), null, body).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Email đã được sử dụng!"));
        call(post("/api/auth/login"), null, Map.of("email", email, "password", "wrong-pass"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Email hoặc mật khẩu không đúng!"));
    }

    @Test
    void profile_password_and_level_bodies_are_validated() throws Exception {
        String token = newUser();
        call(put("/api/auth/profile"), token, Map.of("fullName", "y".repeat(101))).andExpect(status().isBadRequest());
        call(put("/api/auth/profile"), token, Map.of()).andExpect(status().isBadRequest());
        call(put("/api/auth/profile"), token, Map.of("fullName", "  Tên mới  ")).andExpect(status().isOk())
                .andExpect(jsonPath("$.fullName").value("Tên mới"));

        call(put("/api/auth/password"), token, Map.of("currentPassword", "secret123", "newPassword", "123"))
                .andExpect(status().isBadRequest());
        call(put("/api/auth/password"), token, Map.of("currentPassword", "secret123", "newPassword", "z".repeat(73)))
                .andExpect(status().isBadRequest());
        call(put("/api/auth/password"), token, Map.of("currentPassword", "WRONG", "newPassword", "secret456"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Mật khẩu hiện tại không đúng!"));

        call(put("/api/auth/jlpt-level"), token, Map.of("jlptLevel", "N9")).andExpect(status().isBadRequest());
        call(put("/api/auth/jlpt-level"), token, Map.of()).andExpect(status().isBadRequest());
    }

    @Test
    void review_body_is_validated() throws Exception {
        String token = newUser();
        call(post("/api/reviews"), token, Map.of("cardId", "n5-1")).andExpect(status().isBadRequest());
        call(post("/api/reviews"), token, Map.of("cardId", "n5-1", "grade", "perfect")).andExpect(status().isBadRequest());
    }
}
