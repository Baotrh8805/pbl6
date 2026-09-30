package com.pbl6.flashcard.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class RefreshTokenIT extends IntegrationTest {

    @Autowired
    JdbcTemplate jdbc;

    private JsonNode login(String email) throws Exception {
        return read(call(post("/api/auth/login"), null, Map.of("email", email, "password", "secret123"))
                .andExpect(status().isOk()));
    }

    private String newAccount() throws Exception {
        String email = newEmail();
        newUser(email);
        return email;
    }

    private Instant expiresAt(String email) {
        return jdbc.queryForObject("""
                SELECT t.expires_at FROM refresh_tokens t JOIN users u ON u.id = t.user_id
                WHERE u.email = ? ORDER BY t.id DESC LIMIT 1""", java.sql.Timestamp.class, email).toInstant();
    }

    private void setExpiresAt(String email, Instant when) {
        jdbc.update("""
                UPDATE refresh_tokens SET expires_at = ?
                WHERE user_id = (SELECT id FROM users WHERE email = ?)""", java.sql.Timestamp.from(when), email);
    }

    @Test
    void login_returns_a_refresh_token_and_it_yields_a_working_access_token() throws Exception {
        String email = newAccount();
        JsonNode tokens = login(email);
        String refresh = tokens.get("refreshToken").asText();
        assertFalse(refresh.isBlank());

        JsonNode renewed = read(call(post("/api/auth/refresh"), null, Map.of("refreshToken", refresh))
                .andExpect(status().isOk()));
        call(get("/api/auth/me"), renewed.get("accessToken").asText(), null).andExpect(status().isOk());
        assertEquals(refresh, renewed.get("refreshToken").asText(), "không xoay vòng: nhiều tab dùng chung một phiên");
    }

    @Test
    void session_expires_after_3_days_without_activity_and_slides_forward_on_use() throws Exception {
        String email = newAccount();
        String refresh = login(email).get("refreshToken").asText();

        // Hạn ban đầu ~3 ngày
        long days = Duration.between(Instant.now(), expiresAt(email)).toHours();
        assertTrue(days >= 71 && days <= 72, "hạn phải khoảng 3 ngày, thực tế " + days + " giờ");

        // Sắp hết hạn (còn 1 giờ): vào web -> được gia hạn lại đủ 3 ngày
        setExpiresAt(email, Instant.now().plus(Duration.ofHours(1)));
        call(post("/api/auth/refresh"), null, Map.of("refreshToken", refresh)).andExpect(status().isOk());
        long extended = Duration.between(Instant.now(), expiresAt(email)).toHours();
        assertTrue(extended >= 71, "phải được gia hạn về ~3 ngày, thực tế " + extended + " giờ");

        // Quá 3 ngày không vào: hết hạn -> 401 và phải đăng nhập lại
        setExpiresAt(email, Instant.now().minusSeconds(60));
        call(post("/api/auth/refresh"), null, Map.of("refreshToken", refresh))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."));
    }

    @Test
    void unknown_or_invalid_refresh_token_is_rejected() throws Exception {
        call(post("/api/auth/refresh"), null, Map.of("refreshToken", "khong-ton-tai")).andExpect(status().isUnauthorized());
        call(post("/api/auth/refresh"), null, Map.of("refreshToken", "")).andExpect(status().isBadRequest());
        // Access token (JWT dài hơn giới hạn 100 ký tự của refresh token) không dùng thay được
        String access = login(newAccount()).get("accessToken").asText();
        call(post("/api/auth/refresh"), null, Map.of("refreshToken", access)).andExpect(status().isBadRequest());
    }

    @Test
    void logout_revokes_only_this_session() throws Exception {
        String email = newAccount();
        String phone = login(email).get("refreshToken").asText();
        String laptop = login(email).get("refreshToken").asText();
        assertNotEquals(phone, laptop);

        call(post("/api/auth/logout"), null, Map.of("refreshToken", laptop)).andExpect(status().isNoContent());
        call(post("/api/auth/refresh"), null, Map.of("refreshToken", laptop)).andExpect(status().isUnauthorized());
        call(post("/api/auth/refresh"), null, Map.of("refreshToken", phone)).andExpect(status().isOk());

        // Đăng xuất lần nữa / token lạ: vẫn 204, không lộ token có tồn tại hay không
        call(post("/api/auth/logout"), null, Map.of("refreshToken", laptop)).andExpect(status().isNoContent());
    }

    @Test
    void changing_password_revokes_refresh_tokens_on_every_device() throws Exception {
        String email = newAccount();
        String otherDevice = login(email).get("refreshToken").asText();
        String access = login(email).get("accessToken").asText();
        Thread.sleep(1100); // iat của JWT tính theo giây

        JsonNode fresh = read(call(put("/api/auth/password"), access,
                Map.of("currentPassword", "secret123", "newPassword", "moi-123456")).andExpect(status().isOk()));

        call(post("/api/auth/refresh"), null, Map.of("refreshToken", otherDevice)).andExpect(status().isUnauthorized());
        // Phiên vừa đổi mật khẩu nhận cặp token mới và dùng tiếp được
        call(post("/api/auth/refresh"), null, Map.of("refreshToken", fresh.get("refreshToken").asText()))
                .andExpect(status().isOk());
    }

    @Test
    void deleted_user_cannot_refresh() throws Exception {
        String email = newAccount();
        String refresh = login(email).get("refreshToken").asText();
        jdbc.update("DELETE FROM users WHERE email = ?", email); // ON DELETE CASCADE xoá luôn refresh token
        call(post("/api/auth/refresh"), null, Map.of("refreshToken", refresh)).andExpect(status().isUnauthorized());
    }
}
