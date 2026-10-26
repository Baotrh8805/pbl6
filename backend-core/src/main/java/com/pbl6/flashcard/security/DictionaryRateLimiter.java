package com.pbl6.flashcard.security;

import com.pbl6.flashcard.service.SettingsService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;

/**
 * Giới hạn theo người dùng cho từ điển (spec 2026-10-26 §10, D26):
 * <ul>
 *   <li>AI: lượt gọi Gemini khi tra (dịch nghĩa / ví dụ). Trần đọc từ app_settings {@code dictionary_ai_hourly_limit} mỗi lần kiểm
 *       (admin đổi có hiệu lực ngay); 0 = tắt dịch lúc tra. Hết lượt KHÔNG chặn tra cứu — chỉ không dịch mới.</li>
 *   <li>Bình luận: app.rate-limit.dict-comment.* (mặc định 20 / giờ) → 429.</li>
 *   <li>Tách câu cho popup tra nhanh: app.rate-limit.dict-tokenize.* (mặc định 60 / phút) → 429.</li>
 *   <li>Vẽ chữ Hán để tra (nhận dạng sau mỗi nét): app.rate-limit.dict-handwriting.* (mặc định 120 / phút) → 429.</li>
 * </ul>
 * Lưu trong RAM như các bộ giới hạn khác (mất khi khởi động lại).
 */
@Component
public class DictionaryRateLimiter {

    private final AttemptLimiter ai = new AttemptLimiter(Integer.MAX_VALUE, Duration.ofHours(1));
    private final AttemptLimiter comment;
    private final AttemptLimiter tokenize;
    private final AttemptLimiter handwriting;
    private final SettingsService settings;

    public DictionaryRateLimiter(SettingsService settings,
                                 @Value("${app.rate-limit.dict-comment.max:20}") int commentMax,
                                 @Value("${app.rate-limit.dict-comment.window:PT1H}") Duration commentWindow,
                                 @Value("${app.rate-limit.dict-tokenize.max:60}") int tokenizeMax,
                                 @Value("${app.rate-limit.dict-tokenize.window:PT1M}") Duration tokenizeWindow,
                                 @Value("${app.rate-limit.dict-handwriting.max:120}") int handwritingMax,
                                 @Value("${app.rate-limit.dict-handwriting.window:PT1M}") Duration handwritingWindow) {
        this.settings = settings;
        this.comment = new AttemptLimiter(commentMax, commentWindow);
        this.tokenize = new AttemptLimiter(tokenizeMax, tokenizeWindow);
        this.handwriting = new AttemptLimiter(handwritingMax, handwritingWindow);
    }

    public int aiLimit() {
        return Math.max(0, settings.dictionaryAiHourlyLimit());
    }

    /** Số lượt dịch AI còn lại trong giờ này. */
    public int aiLeft(Long uid) {
        return Math.max(0, aiLimit() - ai.count(key(uid)));
    }

    /** Còn lượt thì ghi nhận một lượt và trả true; hết lượt / tắt → false (không ném). */
    public boolean tryAcquireAi(Long uid) {
        String k = key(uid);
        synchronized (this) {
            if (ai.count(k) >= aiLimit()) return false;
            ai.record(k);
            return true;
        }
    }

    /** Trả lại lượt vừa lấy khi lời gọi không tới được Gemini (không có khoá AI): không tính vào trần. */
    public void refundAi(Long uid) {
        ai.undoLast(key(uid));
    }

    public void checkComment(Long uid) {
        check(comment, uid, "Bạn bình luận quá nhanh, vui lòng thử lại sau.");
    }

    public void checkTokenize(Long uid) {
        check(tokenize, uid, "Bạn tra quá nhanh, vui lòng thử lại sau.");
    }

    public void checkHandwriting(Long uid) {
        check(handwriting, uid, "Bạn vẽ quá nhanh, vui lòng thử lại sau.");
    }

    private static void check(AttemptLimiter limiter, Long uid, String message) {
        String k = key(uid);
        if (limiter.isBlocked(k)) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, message);
        limiter.record(k);
    }

    private static String key(Long uid) {
        return String.valueOf(uid);
    }
}
