package com.pbl6.flashcard.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.service.HousekeepingJob;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Rà soát bảo mật 27/10: mật khẩu mạnh (đăng ký / đổi / đặt lại), đăng ký lại email chưa xác thực, dọn tài khoản chưa xác thực
 * quá 48 giờ, admin lọc "chưa xác thực", khoá đăng nhập theo email khi dò từ nhiều IP, header bảo mật, cờ SMTP ở health.
 */
class AccountHardeningIT extends IntegrationTest {

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    HousekeepingJob housekeeping;

    private ResultActions register(String email, String password) throws Exception {
        return call(post("/api/auth/register"), null, Map.of("email", email, "password", password, "fullName", "QA"));
    }

    private ResultActions loginFrom(String ip, String email, String password) throws Exception {
        return mvc.perform(post("/api/auth/login").with(r -> { r.setRemoteAddr(ip); return r; })
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("email", email, "password", password))));
    }

    @Test
    void weak_passwords_are_rejected_everywhere_with_the_policy_message() throws Exception {
        String email = newEmail();
        for (String weak : new String[] {"secret123", "Secret!!!", "12345678!", "Ab1!"}) {
            register(email, weak).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("ký tự đặc biệt")));
        }
        String token = newUser(email);
        call(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/auth/password"), token,
                Map.of("currentPassword", "Secret123!", "newPassword", "weakpassword")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("ký tự đặc biệt")));
        call(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/auth/password"), token,
                Map.of("currentPassword", "Secret123!", "newPassword", "Strong-Pass9")).andExpect(status().isOk());
        call(post("/api/auth/reset-password"), null, Map.of("token", "x".repeat(20), "newPassword", "short1!"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void unverified_email_can_register_again_and_the_newest_registration_wins() throws Exception {
        String email = newEmail();
        register(email, "First-Pass1!").andExpect(status().isOk()).andExpect(jsonPath("$.needsVerification").value(true));
        Long firstId = userId(email);
        // chưa xác thực: đăng ký lại cùng email không bị "Email đã được sử dụng", nhận mật khẩu mới + gửi lại link
        register(email, "Second-Pass2!").andExpect(status().isOk()).andExpect(jsonPath("$.needsVerification").value(true));
        assertEquals(firstId, userId(email), "giữ nguyên dòng người dùng (không nhân đôi email)");
        markEmailVerified(email);
        loginFrom("127.0.0.1", email, "First-Pass1!").andExpect(status().isUnauthorized());
        loginFrom("127.0.0.1", email, "Second-Pass2!").andExpect(status().isOk());
        // đã xác thực: đăng ký lại bị chặn như trước
        register(email, "Third-Pass3!").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("Email")));
    }

    @Test
    void housekeeping_deletes_accounts_unverified_for_over_48_hours_and_admin_can_filter_them() throws Exception {
        String stale = newEmail();
        String fresh = newEmail();
        register(stale, "Stale-Pass1!").andExpect(status().isOk());
        register(fresh, "Fresh-Pass1!").andExpect(status().isOk());
        Long staleId = userId(stale);
        jdbc.update("UPDATE users SET created_at = ? WHERE id = ?", LocalDateTime.now().minusDays(3), staleId);

        String admin = newStaff(Role.ADMIN);
        JsonNode list = read(call(get("/api/admin/users").param("verified", "false").param("size", "100"), admin, null)
                .andExpect(status().isOk()));
        assertTrue(hasEmail(list, stale) && hasEmail(list, fresh), list.toString());
        for (JsonNode row : list.get("items")) {
            if (stale.equals(row.get("email").asText())) assertFalse(row.get("emailVerified").asBoolean());
        }
        JsonNode verifiedOnly = read(call(get("/api/admin/users").param("verified", "true").param("q", stale), admin, null));
        assertFalse(hasEmail(verifiedOnly, stale));

        int[] n = housekeeping.run(Instant.now());
        assertTrue(n[7] >= 1, "tài khoản chưa xác thực quá 48 giờ bị xoá");
        assertTrue(userRepository.findByEmail(stale).isEmpty(), "tài khoản cũ đã bị xoá");
        assertTrue(userRepository.findByEmail(fresh).isPresent(), "tài khoản mới đăng ký còn trong hạn được giữ");
        // email vừa được dọn đăng ký lại bình thường
        register(stale, "Again-Pass1!").andExpect(status().isOk());
    }

    private static boolean hasEmail(JsonNode page, String email) {
        for (JsonNode row : page.get("items")) if (email.equals(row.get("email").asText())) return true;
        return false;
    }

    @Test
    void too_many_failures_from_many_ips_lock_the_account_even_for_the_right_password() throws Exception {
        String email = newEmail();
        newUser(email);
        // mỗi IP chỉ sai 1 lần (dưới trần 5 / phút theo IP) nhưng tổng theo email vượt 20 / 15 phút
        for (int i = 0; i < LoginAttemptLimiter.EMAIL_MAX_FAILURES; i++) {
            loginFrom("10.9." + (i / 250) + "." + (i % 250 + 1), email, "Wrong-Pass" + i + "!").andExpect(status().isUnauthorized());
        }
        loginFrom("10.9.9.9", email, "Secret123!").andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("15 phút")));
    }

    @Test
    void api_responses_carry_security_headers_and_health_reports_mail() throws Exception {
        String token = newUser();
        call(get("/api/decks"), token, null).andExpect(status().isOk())
                .andExpect(header().string("X-Frame-Options", "DENY"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("Referrer-Policy", "no-referrer"))
                .andExpect(header().string("Content-Security-Policy", org.hamcrest.Matchers.containsString("frame-ancestors 'none'")))
                .andExpect(header().string("Permissions-Policy", org.hamcrest.Matchers.containsString("camera=()")));
        JsonNode health = read(call(get("/api/admin/health"), newStaff(Role.ADMIN), null).andExpect(status().isOk()));
        assertEquals("missing", health.get("mail").asText(), "profile test không có SMTP");
    }
}
