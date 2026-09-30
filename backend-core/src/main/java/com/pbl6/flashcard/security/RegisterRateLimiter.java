package com.pbl6.flashcard.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * Chặn tạo tài khoản hàng loạt từ một IP. Ngưỡng mặc định (30/giờ) đủ rộng cho cả lớp đăng ký chung
 * một mạng (NAT trường học). Cấu hình: app.rate-limit.register.max / app.rate-limit.register.window.
 */
@Component
public class RegisterRateLimiter extends AttemptLimiter {

    public RegisterRateLimiter(@Value("${app.rate-limit.register.max:30}") int max,
                               @Value("${app.rate-limit.register.window:PT1H}") Duration window) {
        super(max, window);
    }
}
