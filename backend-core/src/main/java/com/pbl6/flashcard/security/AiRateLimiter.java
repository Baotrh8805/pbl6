package com.pbl6.flashcard.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;

/**
 * Chặn lạm dụng các thao tác gọi lại AI không tạo job mới nên KHÔNG bị hạn mức bóc tách ngày chặn (rà soát 25/10, S4): mỗi lần
 * đốt quota Gemini dùng chung của MỌI người học. Đếm theo người dùng như {@link MnemonicRateLimiter}.
 * <ul>
 *   <li>reanalyze: chạy lại / sửa văn bản rồi phân tích lại / dịch lại nghĩa — bóc tách và lộ trình
 *       (app.rate-limit.reanalyze.*, mặc định 10 lần / giờ);</li>
 *   <li>deck-ai: sinh phương án nhiễu cả bộ thẻ, kiểm tra lại mâu thuẫn (app.rate-limit.deck-ai.*, mặc định 20 lần / giờ).</li>
 * </ul>
 */
@Component
public class AiRateLimiter {

    private final AttemptLimiter reanalyze;
    private final AttemptLimiter deckAi;

    public AiRateLimiter(@Value("${app.rate-limit.reanalyze.max:10}") int reanalyzeMax,
                         @Value("${app.rate-limit.reanalyze.window:PT1H}") Duration reanalyzeWindow,
                         @Value("${app.rate-limit.deck-ai.max:20}") int deckAiMax,
                         @Value("${app.rate-limit.deck-ai.window:PT1H}") Duration deckAiWindow) {
        this.reanalyze = new AttemptLimiter(reanalyzeMax, reanalyzeWindow);
        this.deckAi = new AttemptLimiter(deckAiMax, deckAiWindow);
    }

    /** 429 khi đã đủ số lần chạy lại phân tích trong cửa sổ; không thì ghi nhận lần này. */
    public void checkReanalyze(Long uid) {
        check(reanalyze, uid, "Bạn đã chạy lại phân tích quá nhiều lần, vui lòng thử lại sau.");
    }

    /** 429 khi đã đủ số lần sinh phương án nhiễu / kiểm tra mâu thuẫn trong cửa sổ; không thì ghi nhận lần này. */
    public void checkDeckAi(Long uid) {
        check(deckAi, uid, "Bạn đã dùng tính năng AI này quá nhiều lần, vui lòng thử lại sau.");
    }

    private static void check(AttemptLimiter limiter, Long uid, String message) {
        String key = String.valueOf(uid);
        if (limiter.isBlocked(key)) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, message);
        limiter.record(key);
    }
}
