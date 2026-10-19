package com.pbl6.flashcard.security;

import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class PasswordResetIT extends IntegrationTest {

    @MockitoBean
    JavaMailSender mailSender;

    private String tokenFromLastMail() {
        ArgumentCaptor<SimpleMailMessage> mail = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender, atLeastOnce()).send(mail.capture());
        Matcher m = Pattern.compile("reset-password\\?token=([A-Za-z0-9_-]+)").matcher(mail.getValue().getText());
        assertTrue(m.find(), "email phải chứa link đặt lại mật khẩu");
        return m.group(1);
    }

    @Test
    void reset_link_sets_new_password_revokes_sessions_and_is_single_use() throws Exception {
        String email = newEmail();
        String oldToken = newUser(email);
        Thread.sleep(1100); // iat của JWT tính theo giây

        String generic = read(call(post("/api/auth/forgot-password"), null, Map.of("email", email.toUpperCase()))
                .andExpect(status().isOk())).get("message").asText();
        String resetToken = tokenFromLastMail();

        call(post("/api/auth/reset-password"), null, Map.of("token", resetToken, "newPassword", "moi-123456"))
                .andExpect(status().isOk());
        call(get("/api/auth/me"), oldToken, null).andExpect(status().isUnauthorized());
        call(post("/api/auth/login"), null, Map.of("email", email, "password", "moi-123456")).andExpect(status().isOk());
        call(post("/api/auth/login"), null, Map.of("email", email, "password", "secret123")).andExpect(status().isUnauthorized());

        // Dùng lại link -> không hợp lệ
        call(post("/api/auth/reset-password"), null, Map.of("token", resetToken, "newPassword", "khac-123456"))
                .andExpect(status().isBadRequest());

        // Email chưa đăng ký: cùng thông báo, không gửi mail
        clearInvocations(mailSender);
        call(post("/api/auth/forgot-password"), null, Map.of("email", newEmail())).andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value(generic));
        verify(mailSender, never()).send(any(SimpleMailMessage.class));
    }

    @Test
    void invalid_input_and_bad_tokens_are_rejected() throws Exception {
        call(post("/api/auth/forgot-password"), null, Map.of("email", "not-an-email")).andExpect(status().isBadRequest());
        call(post("/api/auth/reset-password"), null, Map.of("token", "khong-ton-tai", "newPassword", "abcdef"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn."));

        String email = newEmail();
        newUser(email);
        call(post("/api/auth/forgot-password"), null, Map.of("email", email)).andExpect(status().isOk());
        call(post("/api/auth/reset-password"), null, Map.of("token", tokenFromLastMail(), "newPassword", "123"))
                .andExpect(status().isBadRequest());
    }

    /** Mail gửi sau khi token đã commit, ngoài transaction: SMTP chậm không giữ kết nối DB của endpoint công khai. */
    @Test
    void mail_is_sent_outside_any_transaction() throws Exception {
        String email = newEmail();
        newUser(email);
        List<Boolean> inTransaction = new CopyOnWriteArrayList<>();
        doAnswer(inv -> {
            inTransaction.add(TransactionSynchronizationManager.isActualTransactionActive());
            return null;
        }).when(mailSender).send(any(SimpleMailMessage.class));
        call(post("/api/auth/forgot-password"), null, Map.of("email", email)).andExpect(status().isOk());
        assertEquals(List.of(false), inTransaction);
        call(post("/api/auth/reset-password"), null, Map.of("token", tokenFromLastMail(), "newPassword", "abcdef1"))
                .andExpect(status().isOk());
    }

    @Test
    void requesting_again_invalidates_the_previous_link() throws Exception {
        String email = newEmail();
        newUser(email);
        call(post("/api/auth/forgot-password"), null, Map.of("email", email)).andExpect(status().isOk());
        String first = tokenFromLastMail();
        call(post("/api/auth/forgot-password"), null, Map.of("email", email)).andExpect(status().isOk());
        String second = tokenFromLastMail();
        assertNotEquals(first, second);
        call(post("/api/auth/reset-password"), null, Map.of("token", first, "newPassword", "abcdef1"))
                .andExpect(status().isBadRequest());
        call(post("/api/auth/reset-password"), null, Map.of("token", second, "newPassword", "abcdef1"))
                .andExpect(status().isOk());
    }
}
