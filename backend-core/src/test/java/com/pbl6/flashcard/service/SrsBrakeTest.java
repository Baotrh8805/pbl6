package com.pbl6.flashcard.service;

import com.pbl6.flashcard.model.Review;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** "Phanh" HLR (D32): khoảng ôn SM-2 không được tăng khi model dự đoán quên. */
class SrsBrakeTest {

    private static final Instant NOW = Instant.parse("2026-10-27T00:00:00Z");

    @Test
    void brake_keeps_interval_at_previous_value_and_marks_flag() {
        Review r = SrsService.newReview(1L, "c", NOW);
        SrsService.schedule(r, "good", NOW);            // 1 ngày
        SrsService.schedule(r, "good", NOW);            // 3 ngày
        int prev = r.getIntervalDays();
        double ease = r.getEase();
        SrsService.schedule(r, "good", NOW);            // SM-2 muốn ~8 ngày
        assertTrue(r.getIntervalDays() > prev);
        SrsService.brake(r, prev, NOW);
        assertEquals(prev, r.getIntervalDays(), "giữ khoảng trước lượt chấm");
        assertEquals(NOW.plus(prev, ChronoUnit.DAYS), r.getDueAt());
        assertTrue(r.isHlrBrake());
        assertTrue(r.getEase() >= ease, "phanh không hạ ease (SM-2 đã tính theo grade)");
    }

    @Test
    void brake_never_goes_below_one_day_and_never_raises_interval() {
        Review r = SrsService.newReview(1L, "c", NOW);
        SrsService.schedule(r, "good", NOW);            // 1 ngày
        SrsService.brake(r, 0, NOW);
        assertEquals(1, r.getIntervalDays());
        r.setIntervalDays(2);
        r.setHlrBrake(false);
        SrsService.brake(r, 10, NOW);
        assertEquals(2, r.getIntervalDays(), "khoảng SM-2 đã nhỏ hơn khoảng trước (vd. sau Lại) thì giữ nguyên");
        assertTrue(r.isHlrBrake());
    }

    @Test
    void new_review_has_no_hlr_data() {
        Review r = SrsService.newReview(1L, "c", NOW);
        assertEquals(0, r.getSeen());
        assertEquals(0, r.getCorrect());
        assertFalse(r.isHlrBrake());
    }
}
