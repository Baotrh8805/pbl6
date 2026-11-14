package com.pbl6.flashcard.dto.deck;

import com.pbl6.flashcard.model.Review;

import java.time.Instant;

/**
 * Tiến độ SRS của một thẻ (không có id bản ghi / user id). HLR (V38, D32): recallBefore = p nhớ dự đoán ngay trước lượt chấm gần
 * nhất (null khi thẻ mới / HLR không dùng được), hlrBrake = lượt gần nhất giữ khoảng ôn vì HLR dự đoán quên, scheduler = sm2 |
 * sm2+hlr (chỉ có trong response của POST /api/reviews).
 */
@com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
public record ReviewResponse(String cardId, int reps, int intervalDays, double ease, Instant dueAt, Double recallBefore,
                             Boolean hlrBrake, String scheduler) {

    public static ReviewResponse of(Review r) {
        return new ReviewResponse(r.getCardId(), r.getReps(), r.getIntervalDays(), r.getEase(), r.getDueAt(), r.getRecallP(),
                r.isHlrBrake(), null);
    }

    public static ReviewResponse of(Review r, String scheduler) {
        return new ReviewResponse(r.getCardId(), r.getReps(), r.getIntervalDays(), r.getEase(), r.getDueAt(), r.getRecallP(),
                r.isHlrBrake(), scheduler);
    }
}
