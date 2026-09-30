package com.pbl6.flashcard.security;

import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * Chặn dò mật khẩu: quá MAX_FAILURES lần sai trong WINDOW cho cùng (IP, email) -> tạm khoá tới khi lần sai
 * cũ nhất ra khỏi cửa sổ. Đăng nhập đúng xoá bộ đếm.
 */
@Component
public class LoginAttemptLimiter extends AttemptLimiter {

    public static final int MAX_FAILURES = 5;
    public static final Duration WINDOW = Duration.ofMinutes(1);

    public LoginAttemptLimiter() {
        super(MAX_FAILURES, WINDOW);
    }

    public static String key(String ip, String normalizedEmail) {
        return ip + "|" + normalizedEmail;
    }
}
