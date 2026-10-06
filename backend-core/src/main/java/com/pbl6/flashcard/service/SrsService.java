package com.pbl6.flashcard.service;

import com.pbl6.flashcard.model.Review;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

/**
 * SM-2 rút gọn. Nguồn sự thật của lịch ôn: client chỉ gửi "grade", server tự tính ngày.
 * Phải khớp thuật toán ở frontend/src/lib/srs.ts (bản client chỉ dùng để xem trước).
 */
public final class SrsService {

    public static final double MIN_EASE = 1.3;
    public static final double MAX_EASE = 3.0;
    private static final double DEFAULT_EASE = 2.5;

    private SrsService() {}

    public static boolean isValidGrade(String grade) {
        return "again".equals(grade) || "hard".equals(grade) || "good".equals(grade) || "easy".equals(grade);
    }

    private static double clampEase(double ease) {
        return Math.round(Math.min(MAX_EASE, Math.max(MIN_EASE, ease)) * 100.0) / 100.0;
    }

    public static Review newReview(Long userId, String cardId, Instant now) {
        Review r = new Review();
        r.setUserId(userId);
        r.setCardId(cardId);
        r.setReps(0);
        r.setIntervalDays(0);
        r.setEase(DEFAULT_EASE);
        r.setDueAt(now);
        return r;
    }

    /** Cập nhật tại chỗ và trả về chính bản ghi đó. */
    public static Review schedule(Review review, String grade, Instant now) {
        boolean again = "again".equals(grade);
        double delta = again ? -0.2 : "hard".equals(grade) ? -0.15 : "easy".equals(grade) ? 0.15 : 0.0;
        // Mean reversion: mỗi lần ôn ease nhích 10% về 2.5 -> thẻ bị kẹt ở sàn 1.3 tự hồi phục (hết "Ease Hell")
        double ease = clampEase(review.getEase() + 0.1 * (DEFAULT_EASE - review.getEase()) + delta);
        int prev = review.getIntervalDays();
        int days;
        if (again) {
            // ponytail: quên chỉ còn giữ 30% khoảng ôn (tối thiểu 1 ngày), không reset về 0; phiên học tự xếp lại thẻ "Lại"
            days = Math.max(1, (int) Math.round(prev * 0.3));
        } else if (prev == 0) {
            days = "easy".equals(grade) ? 4 : 1;
        } else {
            double factor = "hard".equals(grade) ? 1.2 : "easy".equals(grade) ? ease * 1.3 : ease;
            days = Math.max(prev + 1, (int) Math.round(prev * factor));
        }

        if (!again) review.setReps(review.getReps() + 1);
        review.setIntervalDays(days);
        review.setEase(ease);
        review.setDueAt(now.plus(days, ChronoUnit.DAYS));
        return review;
    }
}
