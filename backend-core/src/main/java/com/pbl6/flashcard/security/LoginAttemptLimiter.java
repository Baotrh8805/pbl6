package com.pbl6.flashcard.security;

import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * Chặn dò mật khẩu hai lớp:
 * <ul>
 *   <li>Theo (IP, email): quá MAX_FAILURES lần sai trong WINDOW -> tạm khoá tới khi lần sai cũ nhất ra khỏi cửa sổ (chặn một máy
 *       thử nhanh).</li>
 *   <li>Theo email (mọi IP, rà soát 27/10): quá EMAIL_MAX_FAILURES lần sai trong EMAIL_WINDOW -> khoá đăng nhập tài khoản đó 15
 *       phút, kể cả khi lần tiếp theo đúng mật khẩu (chặn dò phân tán qua nhiều IP / proxy). Mật khẩu đúng xoá cả hai bộ đếm.</li>
 * </ul>
 * Bộ đếm trong RAM (AttemptLimiter): khởi động lại server là về 0, đủ cho một instance.
 */
@Component
public class LoginAttemptLimiter extends AttemptLimiter {

    public static final int MAX_FAILURES = 5;
    public static final Duration WINDOW = Duration.ofMinutes(1);
    public static final int EMAIL_MAX_FAILURES = 20;
    public static final Duration EMAIL_WINDOW = Duration.ofMinutes(15);

    private final AttemptLimiter byEmail = new AttemptLimiter(EMAIL_MAX_FAILURES, EMAIL_WINDOW);

    public LoginAttemptLimiter() {
        super(MAX_FAILURES, WINDOW);
    }

    public static String key(String ip, String normalizedEmail) {
        return ip + "|" + normalizedEmail;
    }

    /** Tài khoản (email) đang bị khoá đăng nhập tạm thời vì sai quá nhiều từ mọi IP? */
    public boolean isEmailBlocked(String normalizedEmail) {
        return byEmail.isBlocked(normalizedEmail);
    }

    /** Ghi một lần sai cho cả hai lớp. */
    public void recordFailure(String ip, String normalizedEmail) {
        record(key(ip, normalizedEmail));
        byEmail.record(normalizedEmail);
    }

    /** Đăng nhập đúng: xoá cả hai lớp. */
    public void resetAll(String ip, String normalizedEmail) {
        reset(key(ip, normalizedEmail));
        byEmail.reset(normalizedEmail);
    }
}
