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
    void ai_models_expose_what_ai_service_accepts_for_the_primary_model_setting() throws Exception { // G5 Model AI chính
        var mapper = new ObjectMapper();
        var body = mapper.readTree("{\"gemini\":true,\"geminiModel\":\" gemini-3.8-flash \","
                + "\"geminiModels\":[\"gemini-3.8-flash\",\"gemini-3.7-flash\",\"gemini-3.7-flash\",\"\",5,null,\""
                + "x".repeat(AdminStatsService.MAX_AI_MODEL_CHARS + 1) + "\"]}");
        Map<String, Object> m = AdminStatsService.aiModels(body);
        assertEquals("gemini-3.8-flash", m.get("default"));
        assertEquals(java.util.List.of("gemini-3.8-flash", "gemini-3.7-flash"), m.get("allowed"), "bỏ trùng / rỗng / không phải chuỗi / quá dài");
        assertNull(AdminStatsService.aiModels(null), "ai-service tắt -> trang cấu hình ghi 'chưa kiểm tra được'");
        assertNull(AdminStatsService.aiModels(mapper.readTree("{\"gemini\":true}")), "ai-service bản cũ chưa trả geminiModels");
        var many = mapper.createObjectNode();
        var arr = many.putArray("geminiModels");
        for (int i = 0; i < 80; i++) arr.add("m-" + i);
        Map<String, Object> capped = AdminStatsService.aiModels(many);
        assertNull(capped.get("default"));
        assertEquals(AdminStatsService.MAX_AI_MODELS, ((java.util.List<?>) capped.get("allowed")).size());
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
