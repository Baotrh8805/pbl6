package com.pbl6.flashcard.service;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Rà soát 25/10 (S8): thiếu SMTP thì link đặt lại mật khẩu chỉ được in ra log khi frontend là localhost (máy dev).
 * B4 (26/10): isConfigured + sendNotice cho email nhắc học.
 */
class MailServiceTest {

    @SuppressWarnings("unchecked")
    private static MailService mail(String frontendUrl) {
        return new MailService(mock(ObjectProvider.class), frontendUrl, "no-reply@test");
    }

    @SuppressWarnings("unchecked")
    private static MailService mailWith(JavaMailSender sender) {
        ObjectProvider<JavaMailSender> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(sender);
        return new MailService(provider, "https://nihongen.example.com/", "no-reply@test");
    }

    @Test
    void only_localhost_frontends_count_as_dev() {
        assertTrue(mail("http://localhost:5173").isLocalFrontend());
        assertTrue(mail("http://127.0.0.1:5173/").isLocalFrontend());
        assertTrue(mail("https://LOCALHOST").isLocalFrontend());
        assertFalse(mail("https://nihongen.example.com").isLocalFrontend());
        assertFalse(mail("https://localhost.attacker.com").isLocalFrontend());
        assertFalse(mail("không phải url").isLocalFrontend());
    }

    @Test
    void missing_smtp_on_a_real_domain_does_not_throw() {
        // Không có JavaMailSender: chỉ ghi log lỗi (không lộ link), luồng gọi vẫn chạy tiếp
        mail("https://nihongen.example.com").sendLink("a@b.c", "đặt lại mật khẩu", "s", "b", "https://x/reset?token=t");
    }

    @Test
    void notice_without_smtp_is_skipped_and_reported_as_not_sent() {
        MailService m = mail("https://nihongen.example.com");
        assertFalse(m.isConfigured());
        assertFalse(m.sendNotice("a@b.c", "nhắc học", "s", "b"));
    }

    @Test
    void notice_with_smtp_sends_plain_text_and_swallows_send_errors() {
        JavaMailSender sender = mock(JavaMailSender.class);
        MailService m = mailWith(sender);
        assertTrue(m.isConfigured());
        assertEquals("https://nihongen.example.com/roadmap/1", m.frontendLink("/roadmap/1"));

        assertTrue(m.sendNotice("lan@example.test", "nhắc học", "Hôm nay học 8 thẻ", "Chào Lan"));
        ArgumentCaptor<SimpleMailMessage> msg = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(sender).send(msg.capture());
        assertEquals("no-reply@test", msg.getValue().getFrom());
        assertArrayEquals(new String[] {"lan@example.test"}, msg.getValue().getTo());
        assertEquals("Hôm nay học 8 thẻ", msg.getValue().getSubject());
        assertEquals("Chào Lan", msg.getValue().getText());

        doThrow(new MailSendException("SMTP từ chối")).when(sender).send(any(SimpleMailMessage.class));
        assertFalse(m.sendNotice("lan@example.test", "nhắc học", "s", "b"), "lỗi gửi chỉ ghi log, không ném");
    }
}
