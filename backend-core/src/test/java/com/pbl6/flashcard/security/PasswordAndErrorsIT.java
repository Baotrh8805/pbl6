package com.pbl6.flashcard.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.service.RefreshTokenService;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class PasswordAndErrorsIT extends IntegrationTest {

    @Autowired
    RefreshTokenService refreshTokens;

    @Test
    void changing_password_revokes_old_tokens_and_returns_a_working_new_one() throws Exception {
        String old = newUser();
        Thread.sleep(1100); // iat của JWT tính theo giây: tách token cũ sang giây trước
        JsonNode res = read(call(put("/api/auth/password"), old,
                Map.of("currentPassword", "Secret123!", "newPassword", "Secret456!")).andExpect(status().isOk()));
        String fresh = res.get("accessToken").asText();

        call(get("/api/auth/me"), old, null).andExpect(status().isUnauthorized());
        call(get("/api/auth/me"), fresh, null).andExpect(status().isOk());
    }

    /**
     * Như AuthService.changePassword: đặt mốc trên user trong bộ nhớ, lưu, rồi cấp token ngay từ chính user đó.
     * Postgres chỉ giữ micro giây và làm tròn (…345999600Z thành …346000Z), nên nếu không làm tròn trước khi cấp
     * thì pcv của token (…345 ms) lệch mốc đọc lại ở request sau (…346 ms) và token mới bị coi là đã thu hồi.
     */
    @Test
    void token_issued_right_after_a_password_change_survives_microsecond_rounding_in_the_database() throws Exception {
        String email = newEmail();
        newUser(email);
        User user = userRepository.findByEmail(email).orElseThrow();
        user.setPasswordChangedAt(Instant.parse("2026-10-20T08:00:12.345999600Z"));
        userRepository.save(user);
        String token = refreshTokens.issueTokens(user).getAccessToken();

        call(get("/api/auth/me"), token, null).andExpect(status().isOk());
    }

    @Test
    void missing_current_password_is_a_clear_400() throws Exception {
        call(put("/api/auth/password"), newUser(), Map.of("newPassword", "Secret456!"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("currentPassword: Mật khẩu hiện tại không được để trống"));
    }

    @Test
    void is_pinned_uses_isPinned_json_name_and_is_kept_when_omitted() throws Exception {
        String token = newUser();
        JsonNode f = read(call(post("/api/folders"), token, Map.of("title", "Pin", "isPinned", true))
                .andExpect(status().isCreated()));
        assertTrue(f.get("isPinned").asBoolean());
        assertFalse(f.has("pinned"));
        String id = f.get("id").asText();

        assertTrue(read(call(put("/api/folders/" + id), token, Map.of("title", "Pin 2"))).get("isPinned").asBoolean());
        assertFalse(read(call(put("/api/folders/" + id), token, Map.of("title", "Pin 2", "isPinned", false)))
                .get("isPinned").asBoolean());
    }

    @Test
    void errors_share_one_json_shape_with_a_readable_message() throws Exception {
        String token = newUser();
        JsonNode notFound = read(call(delete("/api/folders/" + UUID.randomUUID()), token, null)
                .andExpect(status().isNotFound()));
        assertEquals("Không tìm thấy thư mục.", notFound.get("message").asText());

        call(delete("/api/folders/not-a-uuid"), token, null).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Tham số 'id' không hợp lệ."));
        mvc.perform(post("/api/folders").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content("{bad json"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Dữ liệu gửi lên không đúng định dạng JSON."));
        call(post("/api/folders"), token, Map.of("title", " ")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("title: Tên thư mục không được để trống"));
        call(get("/api/khong-ton-tai"), token, null).andExpect(status().isNotFound());
    }
}
