package com.pbl6.flashcard.service;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;

class AdminStatsServiceTest {

    @Test
    void fill_pads_missing_days_with_zero() { // SS-04
        LocalDate from = LocalDate.of(2026, 10, 1);
        long[] out = AdminStatsService.fill(Map.of(from.plusDays(1), 3L), from, 3);
        assertArrayEquals(new long[]{0, 3, 0}, out);
    }

    @Test
    void fill_ignores_days_outside_window() {
        LocalDate from = LocalDate.of(2026, 10, 1);
        long[] out = AdminStatsService.fill(Map.of(from.minusDays(1), 9L, from.plusDays(5), 9L, from, 1L), from, 2);
        assertArrayEquals(new long[]{1, 0}, out);
    }
}
