package com.pbl6.flashcard.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;

/** Chống spam báo cáo bộ thẻ: đếm theo người dùng (không theo IP, lớp học chung mạng không bị vạ lây). */
@Component
public class ReportRateLimiter {

    private final AttemptLimiter limiter;

    public ReportRateLimiter(@Value("${app.rate-limit.report.max:10}") int max,
                             @Value("${app.rate-limit.report.window:PT1H}") Duration window) {
        this.limiter = new AttemptLimiter(max, window);
    }

    public void check(Long uid) {
        String key = String.valueOf(uid);
        if (limiter.isBlocked(key)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Bạn đã gửi quá nhiều báo cáo, vui lòng thử lại sau.");
        }
        limiter.record(key);
    }
}
