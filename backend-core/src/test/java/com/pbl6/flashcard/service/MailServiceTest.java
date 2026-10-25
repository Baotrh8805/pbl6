package com.pbl6.flashcard.service;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

/** Rà soát 25/10 (S8): thiếu SMTP thì link đặt lại mật khẩu chỉ được in ra log khi frontend là localhost (máy dev). */
class MailServiceTest {

    @SuppressWarnings("unchecked")
    private static MailService mail(String frontendUrl) {
        return new MailService(mock(ObjectProvider.class), frontendUrl, "no-reply@test");
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
}
