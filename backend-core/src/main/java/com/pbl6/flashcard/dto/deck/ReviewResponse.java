package com.pbl6.flashcard.dto.deck;

import com.pbl6.flashcard.model.Review;

import java.time.Instant;

/** Tiến độ SRS của một thẻ (không có id bản ghi / user id). */
public record ReviewResponse(String cardId, int reps, int intervalDays, double ease, Instant dueAt) {

    public static ReviewResponse of(Review r) {
        return new ReviewResponse(r.getCardId(), r.getReps(), r.getIntervalDays(), r.getEase(), r.getDueAt());
    }
}
