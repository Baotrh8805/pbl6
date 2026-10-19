package com.pbl6.flashcard.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;

/**
 * Chặn lạm dụng "Sinh mẹo nhớ" (POST /api/kanji/mnemonics/generate): mỗi lần gọi đốt quota Gemini dùng chung với bóc tách / OCR dự
 * phòng của MỌI người học và giữ một luồng servlet tới vài phút. Đếm theo người dùng (không theo IP, lớp học chung mạng không bị vạ
 * lây), chỉ lần thực sự gọi ai-service mới tính. Cấu hình: app.rate-limit.mnemonic-generate.*.
 */
@Component
public class MnemonicRateLimiter {

    private final AttemptLimiter limiter;

    public MnemonicRateLimiter(@Value("${app.rate-limit.mnemonic-generate.max:10}") int max,
                               @Value("${app.rate-limit.mnemonic-generate.window:PT1H}") Duration window) {
        this.limiter = new AttemptLimiter(max, window);
    }

    /** 429 khi đã đủ số lần trong cửa sổ; không thì ghi nhận lần này. */
    public void check(Long uid) {
        String key = String.valueOf(uid);
        if (limiter.isBlocked(key)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Bạn đã sinh mẹo nhớ quá nhiều lần, vui lòng thử lại sau.");
        }
        limiter.record(key);
    }
}
