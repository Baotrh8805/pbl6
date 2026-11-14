package com.pbl6.flashcard.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;

/**
 * Chặn lạm dụng API quiz: tạo lượt hàng loạt và gửi đáp án dồn dập. Ngưỡng rộng so với người dùng thật
 * (bài 50 câu = 50 lần gửi). Cấu hình: app.rate-limit.quiz-create.* / app.rate-limit.quiz-answer.*
 */
@Component
public class QuizRateLimiter {

    private final AttemptLimiter create;
    private final AttemptLimiter answer;

    public QuizRateLimiter(@Value("${app.rate-limit.quiz-create.max:60}") int createMax,
                           @Value("${app.rate-limit.quiz-create.window:PT1H}") Duration createWindow,
                           @Value("${app.rate-limit.quiz-answer.max:1000}") int answerMax,
                           @Value("${app.rate-limit.quiz-answer.window:PT10M}") Duration answerWindow) {
        this.create = new AttemptLimiter(createMax, createWindow);
        this.answer = new AttemptLimiter(answerMax, answerWindow);
    }

    public void checkCreate(Long uid) {
        check(create, uid);
    }

    public void checkAnswer(Long uid) {
        check(answer, uid);
    }

    private static void check(AttemptLimiter limiter, Long uid) {
        String key = String.valueOf(uid);
        if (limiter.isBlocked(key)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Bạn thao tác quá nhanh, vui lòng thử lại sau.");
        }
        limiter.record(key);
    }
}
