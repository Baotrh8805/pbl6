package com.pbl6.flashcard.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;

/**
 * Chống spam báo lỗi câu hỏi quiz (hợp đồng đợt 2 §1.2: quá 20 lần / giờ -> 429). Đếm theo người dùng như
 * {@link ReportRateLimiter}: lớp học chung mạng không bị vạ lây. Cấu hình: app.rate-limit.question-flag.*
 */
@Component
public class QuestionFlagRateLimiter {

    private final AttemptLimiter limiter;

    public QuestionFlagRateLimiter(@Value("${app.rate-limit.question-flag.max:20}") int max,
                                   @Value("${app.rate-limit.question-flag.window:PT1H}") Duration window) {
        this.limiter = new AttemptLimiter(max, window);
    }

    public void check(Long uid) {
        String key = String.valueOf(uid);
        if (limiter.isBlocked(key)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Bạn đã gửi quá nhiều báo lỗi câu hỏi, vui lòng thử lại sau.");
        }
        limiter.record(key);
    }
}
