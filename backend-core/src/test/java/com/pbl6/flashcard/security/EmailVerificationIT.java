package com.pbl6.flashcard.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.repository.AppSettingRepository;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Xác thực email (hợp đồng API đợt 2 §3): đăng ký -> 403 EMAIL_NOT_VERIFIED -> bấm link -> đăng nhập được; gửi lại huỷ link cũ;
 * link hết hạn / dùng lại 400; tắt khoá cấu hình -> đăng ký xong đã xác thực; staff không bị chặn; admin xác thực hộ.
 */
class EmailVerificationIT extends IntegrationTest {

    private static final String INVALID = "Liên kết xác thực email không hợp lệ hoặc đã hết hạn.";

    @MockitoBean
    JavaMailSender mailSender;

    @Autowired
    AppSettingRepository settings;

    @Autowired
    JdbcTemplate jdbc;

    private void setRequired(boolean on) {
        var s = settings.findById("email_verification_required").orElseThrow();
        s.setValue(String.valueOf(on));
        settings.save(s);
    }

    /** Khoá cấu hình dùng chung cả bộ test: luôn trả về giá trị seed. */
    @AfterEach
    void restoreSetting() {
        setRequired(true);
    }

    private JsonNode register(String email) throws Exception {
        return read(call(post("/api/auth/register"), null, Map.of("email", email, "password", "Secret123!", "fullName", "EV"))
                .andExpect(status().isOk()));
    }

    private ResultActions login(String email, String password) throws Exception {
        return call(post("/api/auth/login"), null, Map.of("email", email, "password", password));
    }

    private ResultActions verifyEmail(String token) throws Exception {
        return call(post("/api/auth/verify-email"), null, Map.of("token", token));
    }

    private static RequestPostProcessor from(String ip) {
        return req -> {
            req.setRemoteAddr(ip);
            return req;
        };
    }

    /** Token trong mail xác thực gần nhất gửi tới email này (mock JavaMailSender, reset sau mỗi test). */
    private String lastTokenFor(String email) {
        ArgumentCaptor<SimpleMailMessage> mail = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender, atLeastOnce()).send(mail.capture());
        List<SimpleMailMessage> all = mail.getAllValues();
        for (int i = all.size() - 1; i >= 0; i--) {
            SimpleMailMessage m = all.get(i);
            if (m.getTo() != null && Arrays.asList(m.getTo()).contains(email)) {
                Matcher t = Pattern.compile("http://localhost:5173/verify-email\\?token=([A-Za-z0-9_-]+)").matcher(m.getText());
                assertTrue(t.find(), "email phải chứa link xác thực về frontend: " + m.getText());
                return t.group(1);
            }
        }
        return fail("không có mail xác thực nào gửi tới " + email);
    }

    @Test
    void register_blocks_login_until_the_link_is_opened() throws Exception {
        String email = newEmail();
        JsonNode r = register(email);
        assertTrue(r.get("needsVerification").asBoolean());
        assertFalse(r.get("message").asText().isBlank());
        assertNull(userRepository.findByEmail(email).orElseThrow().getEmailVerifiedAt());

        // Sai mật khẩu vẫn là 401 chung, không mã: không lộ "email này đã đăng ký mà chưa xác thực"
        login(email, "sai-mat-khau").andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").doesNotExist());
        login(email, "Secret123!").andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403))
                .andExpect(jsonPath("$.error").value("Forbidden"))
                .andExpect(jsonPath("$.code").value("EMAIL_NOT_VERIFIED"))
                .andExpect(jsonPath("$.message").isNotEmpty());

        String token = lastTokenFor(email);
        JsonNode v = read(verifyEmail(token).andExpect(status().isOk()));
        assertEquals(email, v.get("email").asText());
        assertFalse(v.get("message").asText().isBlank());

        String access = read(login(email, "Secret123!").andExpect(status().isOk())).get("accessToken").asText();
        call(get("/api/auth/me"), access, null).andExpect(status().isOk()).andExpect(jsonPath("$.emailVerified").value(true));
        call(get("/api/decks"), access, null).andExpect(status().isOk());

        // Dùng 1 lần
        verifyEmail(token).andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value(INVALID));
    }

    @Test
    void resend_invalidates_the_previous_link_and_never_reveals_the_email() throws Exception {
        String email = newEmail();
        register(email);
        String first = lastTokenFor(email);

        String generic = read(call(post("/api/auth/resend-verification"), null, Map.of("email", email.toUpperCase()))
                .andExpect(status().isAccepted())).get("message").asText();
        String second = lastTokenFor(email);
        assertNotEquals(first, second);
        verifyEmail(first).andExpect(status().isBadRequest());
        verifyEmail(second).andExpect(status().isOk());

        // Đã xác thực / chưa đăng ký: cùng 202, cùng thông báo, không gửi mail
        clearInvocations(mailSender);
        call(post("/api/auth/resend-verification"), null, Map.of("email", email))
                .andExpect(status().isAccepted()).andExpect(jsonPath("$.message").value(generic));
        call(post("/api/auth/resend-verification"), null, Map.of("email", newEmail()))
                .andExpect(status().isAccepted()).andExpect(jsonPath("$.message").value(generic));
        verify(mailSender, never()).send(any(SimpleMailMessage.class));

        call(post("/api/auth/resend-verification"), null, Map.of("email", "khong-phai-email")).andExpect(status().isBadRequest());
    }

    /**
     * Mail gửi SAU khi token đã commit, ngoài mọi transaction: SMTP chậm không giữ kết nối DB của đăng ký / gửi lại (endpoint
     * công khai), và link trong mail luôn dùng được.
     */
    @Test
    void mail_is_sent_outside_any_transaction() throws Exception {
        List<Boolean> inTransaction = new CopyOnWriteArrayList<>();
        doAnswer(inv -> {
            inTransaction.add(TransactionSynchronizationManager.isActualTransactionActive());
            return null;
        }).when(mailSender).send(any(SimpleMailMessage.class));
        String email = newEmail();
        register(email);
        call(post("/api/auth/resend-verification"), null, Map.of("email", email)).andExpect(status().isAccepted());
        assertEquals(List.of(false, false), inTransaction);
        verifyEmail(lastTokenFor(email)).andExpect(status().isOk());
    }

    @Test
    void resend_is_limited_to_five_per_ip_and_email() throws Exception {
        String email = newEmail();
        register(email);
        for (int i = 0; i < 5; i++) {
            call(post("/api/auth/resend-verification").with(from("10.9.0.1")), null, Map.of("email", email))
                    .andExpect(status().isAccepted());
        }
        call(post("/api/auth/resend-verification").with(from("10.9.0.1")), null, Map.of("email", email))
                .andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.status").value(429));
        call(post("/api/auth/resend-verification").with(from("10.9.0.2")), null, Map.of("email", email))
                .andExpect(status().isAccepted());
    }

    @Test
    void expired_or_unknown_token_is_400() throws Exception {
        String email = newEmail();
        register(email);
        String token = lastTokenFor(email);
        jdbc.update("UPDATE email_verification_tokens SET expires_at = now() - interval '1 minute' WHERE user_id = ?", userId(email));

        verifyEmail(token).andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value(INVALID));
        verifyEmail("khong-ton-tai").andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value(INVALID));
        call(post("/api/auth/verify-email"), null, Map.of()).andExpect(status().isBadRequest());
        assertNull(userRepository.findByEmail(email).orElseThrow().getEmailVerifiedAt());
        login(email, "Secret123!").andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("EMAIL_NOT_VERIFIED"));
    }

    @Test
    void when_the_setting_is_off_registration_is_verified_immediately() throws Exception {
        setRequired(false);
        String email = newEmail();
        JsonNode r = register(email);
        assertFalse(r.get("needsVerification").asBoolean());
        assertNotNull(userRepository.findByEmail(email).orElseThrow().getEmailVerifiedAt());
        verify(mailSender, never()).send(any(SimpleMailMessage.class));

        String access = read(login(email, "Secret123!").andExpect(status().isOk())).get("accessToken").asText();
        call(get("/api/auth/me"), access, null).andExpect(jsonPath("$.emailVerified").value(true));

        // Bật lại: người đã xác thực không bị ảnh hưởng
        setRequired(true);
        login(email, "Secret123!").andExpect(status().isOk());
    }

    /** Token / refresh token có từ lúc admin tắt tính năng: bật lại thì JwtAuthenticationFilter và /refresh cùng chặn. */
    @Test
    void re_enabling_the_setting_blocks_existing_sessions_of_unverified_users() throws Exception {
        String email = newEmail();
        register(email);
        setRequired(false);
        JsonNode tokens = read(login(email, "Secret123!").andExpect(status().isOk()));
        String access = tokens.get("accessToken").asText();
        String refresh = tokens.get("refreshToken").asText();
        call(get("/api/decks"), access, null).andExpect(status().isOk());

        setRequired(true);
        call(get("/api/decks"), access, null).andExpect(status().isUnauthorized());
        call(post("/api/auth/refresh"), null, Map.of("refreshToken", refresh))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("EMAIL_NOT_VERIFIED"));

        verifyEmail(lastTokenFor(email)).andExpect(status().isOk());
        call(get("/api/decks"), access, null).andExpect(status().isOk());
        call(post("/api/auth/refresh"), null, Map.of("refreshToken", refresh)).andExpect(status().isOk());
    }

    @Test
    void staff_are_never_blocked() throws Exception {
        String email = newEmail();
        register(email);
        User u = userRepository.findByEmail(email).orElseThrow();
        u.setRole(Role.ADMIN);
        userRepository.save(u);

        String access = read(login(email, "Secret123!").andExpect(status().isOk())).get("accessToken").asText();
        call(get("/api/admin/users"), access, null).andExpect(status().isOk());
        call(get("/api/auth/me"), access, null).andExpect(jsonPath("$.emailVerified").value(false));

        // Hạ về USER mà chưa xác thực -> bị chặn như người học khác
        u = userRepository.findByEmail(email).orElseThrow();
        u.setRole(Role.USER);
        userRepository.save(u);
        login(email, "Secret123!").andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("EMAIL_NOT_VERIFIED"));
    }

    @Test
    void admin_can_verify_a_user_email() throws Exception {
        String email = newEmail();
        register(email);
        Long id = userId(email);
        String pendingLink = lastTokenFor(email);
        String adminEmail = newEmail();
        String admin = newStaff(Role.ADMIN, adminEmail);
        Long adminId = userId(adminEmail);

        call(post("/api/admin/users/" + id + "/verify-email"), newUser(), null).andExpect(status().isForbidden());
        call(post("/api/admin/users/" + id + "/verify-email"), null, null).andExpect(status().isUnauthorized());

        JsonNode d = read(call(post("/api/admin/users/" + id + "/verify-email"), admin, null).andExpect(status().isOk()));
        assertEquals(email, d.get("email").asText());
        assertTrue(d.get("emailVerified").asBoolean());
        assertTrue(read(call(get("/api/admin/users/" + id), admin, null)).get("emailVerified").asBoolean());
        login(email, "Secret123!").andExpect(status().isOk());
        verifyEmail(pendingLink).andExpect(status().isBadRequest()); // link trong hộp thư bị huỷ

        String audit = "SELECT count(*) FROM admin_audit_logs WHERE action = 'USER_VERIFY_EMAIL' AND actor_id = ? AND target_id = ?";
        assertEquals(1, jdbc.queryForObject(audit, Integer.class, adminId, String.valueOf(id)));
        // Lặp lại: không đổi gì, không audit thêm
        call(post("/api/admin/users/" + id + "/verify-email"), admin, null).andExpect(status().isOk());
        assertEquals(1, jdbc.queryForObject(audit, Integer.class, adminId, String.valueOf(id)));

        // Quy tắc bậc như mọi thao tác ghi trên người dùng
        String peer = newEmail();
        newStaff(Role.ADMIN, peer);
        call(post("/api/admin/users/" + userId(peer) + "/verify-email"), admin, null).andExpect(status().isForbidden());
        call(post("/api/admin/users/999999999/verify-email"), admin, null).andExpect(status().isNotFound());
    }
}
