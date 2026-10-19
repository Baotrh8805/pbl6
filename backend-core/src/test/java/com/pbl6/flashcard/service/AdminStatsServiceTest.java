package com.pbl6.flashcard.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

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

    @Test
    void engine_flags_keep_only_boolean_keys() throws Exception { // §8 health.engines
        var body = new ObjectMapper().readTree("{\"sudachi\":true,\"gemini\":false,\"version\":\"1.2\",\"nested\":{\"x\":true}}");
        assertEquals(Map.of("sudachi", true, "gemini", false), AdminStatsService.engineFlags(body));
        assertTrue(AdminStatsService.engineFlags(null).isEmpty());
        assertTrue(AdminStatsService.engineFlags(new ObjectMapper().readTree("[true]")).isEmpty());
    }

    @Test
    void ocr_point_error_rate_is_a_fraction_and_null_without_jobs() { // §8 ocrSeries
        LocalDate d = LocalDate.of(2026, 10, 19);
        assertEquals(0.3333, AdminStatsService.ocrPoint(d, 3, 1, 0, 0).errorRate());
        assertEquals(0.0, AdminStatsService.ocrPoint(d, 4, 0, 1, 1).errorRate());
        assertNull(AdminStatsService.ocrPoint(d, 0, 0, 0, 0).errorRate());
    }

    @Test
    void round_handles_null_and_non_finite() {
        assertNull(AdminStatsService.round(null, 2));
        assertNull(AdminStatsService.round(Double.NaN, 2));
        assertEquals(12.3, AdminStatsService.round(12.34, 1));
        assertEquals(0.667, AdminStatsService.round(2 / 3.0, 3));
    }
}
