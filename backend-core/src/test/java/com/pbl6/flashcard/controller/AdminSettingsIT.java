package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.repository.AppSettingRepository;
import com.pbl6.flashcard.service.AiServiceClient;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockPart;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.ResultActions;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Cấu hình đổi lúc chạy (app_settings): hạn mức bóc tách, thông báo, mở / đóng đăng ký, khoá lộ trình (V20), tham số AI (V21). */
class AdminSettingsIT extends IntegrationTest {

    @Autowired
    AppSettingRepository settings;

    @Autowired
    com.pbl6.flashcard.service.SettingsService settingsService;

    /** Không gọi ai-service thật: job được tạo (202) rồi worker lỗi, đủ để đếm hạn mức. */
    @MockitoBean
    AiServiceClient aiClient;

    /** Đủ 13 khoá với giá trị seed (V14 + V20 + V21): PUT đòi mọi khoá. */
    private static Map<String, Object> defaults() {
        Map<String, Object> m = new HashMap<>();
        m.put("extraction_daily_limit_free", 5);
        m.put("extraction_daily_limit_premium", 50);
        m.put("announcement", "");
        m.put("registration_open", true);
        m.put("learning_path_daily_cap_default", 50);
        m.put("learning_path_quiz_pass_pct", 80);
        m.put("learning_path_reminder_hour", 7);
        m.put("ocr_fallback_confidence", 0.85);
        m.put("ocr_low_line_confidence", 0.75);
        m.put("distractor_min_confidence", 0.6);
        m.put("contradiction_alert_threshold", 0.7);
        m.put("ai_model_primary", "");
        m.put("email_verification_required", true);
        return m;
    }

    private Map<String, Object> with(String key, Object value) {
        Map<String, Object> m = defaults();
        m.put(key, value);
        return m;
    }

    /** Ghi thẳng DB: không đi qua API vì test có thể vừa đóng đăng ký (newStaff sẽ không tạo được tài khoản). */
    @AfterEach
    void restoreDefaults() {
        defaults().forEach((k, v) -> {
            var s = settings.findById(k).orElseThrow();
            s.setValue(String.valueOf(v));
            settings.save(s);
        });
    }

    private ResultActions postText(String token) throws Exception {
        return call(multipart("/api/extractions")
                .part(new MockPart("text", "猫が好きです。".getBytes(StandardCharsets.UTF_8))), token, null);
    }

    @Test
    void free_limit_change_applies_to_next_extraction_without_restart() throws Exception { // ST-01
        String root = newStaff(Role.SUPER_ADMIN);
        call(put("/api/admin/settings"), root, with("extraction_daily_limit_free", 2)).andExpect(status().isOk());
        String user = newUser();
        postText(user).andExpect(status().isAccepted());
        postText(user).andExpect(status().isAccepted());
        postText(user).andExpect(status().isTooManyRequests());
    }

    /**
     * STAFF-14: khoá V14 cũng nhận 400 tiếng Việt nêu tên khoá JSON như khoá V20/V21 — trước đây bean validation trả
     * "extractionDailyLimitFree: must be greater than or equal to 0" (tiếng Anh, tên field Java).
     */
    @Test
    void int_values_are_validated() throws Exception { // ST-02
        String root = newStaff(Role.SUPER_ADMIN);
        Object[][] bad = {{"extraction_daily_limit_free", -1}, {"extraction_daily_limit_free", 1001},
                {"extraction_daily_limit_premium", -1}, {"extraction_daily_limit_premium", 1001}};
        for (Object[] b : bad) {
            call(put("/api/admin/settings"), root, with((String) b[0], b[1])).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.message").value(b[0] + " phải từ 0 đến 1000."));
        }
        call(put("/api/admin/settings"), root, with("extraction_daily_limit_free", "abc")).andExpect(status().isBadRequest());
        // biên hợp lệ ghi được
        Map<String, Object> edge = with("extraction_daily_limit_free", 0);
        edge.put("extraction_daily_limit_premium", 1000);
        call(put("/api/admin/settings"), root, edge).andExpect(status().isOk());
    }

    @Test
    void announcement_is_limited_to_300_chars() throws Exception { // ST-03
        String root = newStaff(Role.SUPER_ADMIN);
        call(put("/api/admin/settings"), root, with("announcement", "x".repeat(301)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("announcement tối đa 300 ký tự."));
        call(put("/api/admin/settings"), root, with("announcement", "x".repeat(300))).andExpect(status().isOk());
    }

    @Test
    void announcement_is_visible_to_users() throws Exception { // ST-04
        String root = newStaff(Role.SUPER_ADMIN);
        String user = newUser();
        call(put("/api/admin/settings"), root, with("announcement", "Bảo trì")).andExpect(status().isOk());
        assertEquals("Bảo trì", read(call(get("/api/announcement"), user, null).andExpect(status().isOk())).get("text").asText());
        call(put("/api/admin/settings"), root, with("announcement", "")).andExpect(status().isOk());
        assertEquals("", read(call(get("/api/announcement"), user, null)).get("text").asText());
    }

    @Test
    void closing_registration_blocks_register_but_not_login() throws Exception { // ST-05
        String root = newStaff(Role.SUPER_ADMIN);
        String email = newEmail();
        newUser(email);
        call(put("/api/admin/settings"), root, with("registration_open", false)).andExpect(status().isOk());
        call(post("/api/auth/register"), null, Map.of("email", newEmail(), "password", "secret123", "fullName", "X"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message", containsString("ngừng đăng ký")));
        call(post("/api/auth/login"), null, Map.of("email", email, "password", "secret123")).andExpect(status().isOk());
    }

    @Test
    void all_keys_are_required() throws Exception { // ST-06
        String root = newStaff(Role.SUPER_ADMIN);
        for (String key : defaults().keySet()) {
            Map<String, Object> m = defaults();
            m.remove(key);
            // STAFF-14: thông điệp tiếng Việt nêu tên khoá JSON (không phải "registrationOpen: must not be null")
            call(put("/api/admin/settings"), root, m).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.message").value("Thiếu khoá " + key + "."));
        }
    }

    @Test
    void get_returns_every_key_with_seed_defaults() throws Exception { // ST-09
        JsonNode s = read(call(get("/api/admin/settings"), newStaff(Role.ADMIN), null).andExpect(status().isOk()));
        assertEquals(50, s.get("learning_path_daily_cap_default").asInt());
        assertEquals(80, s.get("learning_path_quiz_pass_pct").asInt());
        assertEquals(7, s.get("learning_path_reminder_hour").asInt());
        assertEquals(0.85, s.get("ocr_fallback_confidence").asDouble(), 1e-9);
        assertEquals(0.75, s.get("ocr_low_line_confidence").asDouble(), 1e-9);
        assertEquals(0.6, s.get("distractor_min_confidence").asDouble(), 1e-9);
        assertEquals(0.7, s.get("contradiction_alert_threshold").asDouble(), 1e-9);
        assertEquals("", s.get("ai_model_primary").asText());
        assertTrue(s.get("email_verification_required").asBoolean());
        assertTrue(s.has("updatedAt"));
    }

    /** Khoảng giá trị khoá V20/V21 kiểm ở service: 400 tiếng Việt nêu tên khoá; biên hợp lệ thì ghi được. */
    @Test
    void new_keys_are_range_checked() throws Exception { // ST-10
        String root = newStaff(Role.SUPER_ADMIN);
        Object[][] bad = {
                {"learning_path_daily_cap_default", 4}, {"learning_path_daily_cap_default", 201},
                {"learning_path_quiz_pass_pct", 49}, {"learning_path_quiz_pass_pct", 101},
                {"learning_path_reminder_hour", -1}, {"learning_path_reminder_hour", 24},
                {"ocr_fallback_confidence", -0.01}, {"ocr_fallback_confidence", 1.01},
                {"ocr_low_line_confidence", 1.5}, {"distractor_min_confidence", -1},
                {"contradiction_alert_threshold", 2}, {"ai_model_primary", "m".repeat(41)}};
        for (Object[] b : bad) {
            call(put("/api/admin/settings"), root, with((String) b[0], b[1])).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.message", containsString((String) b[0])));
        }
        // Sai kiểu: Jackson từ chối trước khi tới service
        call(put("/api/admin/settings"), root, with("ocr_fallback_confidence", "abc")).andExpect(status().isBadRequest());
        call(put("/api/admin/settings"), root, with("email_verification_required", "maybe")).andExpect(status().isBadRequest());
        // Hai lỗi cùng lúc -> một 400 nêu cả hai khoá
        Map<String, Object> two = with("learning_path_reminder_hour", 30);
        two.put("ocr_low_line_confidence", -2);
        call(put("/api/admin/settings"), root, two).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("learning_path_reminder_hour")))
                .andExpect(jsonPath("$.message", containsString("ocr_low_line_confidence")))
                .andExpect(jsonPath("$.message", containsString("phải từ")));

        assertNull(settingsService.aiModelPrimary(), "seed rỗng -> không gửi model, ai-service dùng GEMINI_MODEL");
        Map<String, Object> edge = defaults();
        edge.put("learning_path_daily_cap_default", 200);
        edge.put("learning_path_quiz_pass_pct", 50);
        edge.put("learning_path_reminder_hour", 0);
        edge.put("ocr_fallback_confidence", 1);
        edge.put("ocr_low_line_confidence", 0);
        edge.put("distractor_min_confidence", 0.55);
        edge.put("contradiction_alert_threshold", 0.9);
        edge.put("ai_model_primary", "  gemini-2.5-flash  ");
        edge.put("email_verification_required", false);
        JsonNode s = read(call(put("/api/admin/settings"), root, edge).andExpect(status().isOk()));
        assertEquals(200, s.get("learning_path_daily_cap_default").asInt());
        assertEquals(1.0, s.get("ocr_fallback_confidence").asDouble(), 1e-9);
        assertEquals(0.0, s.get("ocr_low_line_confidence").asDouble(), 1e-9);
        assertEquals("gemini-2.5-flash", s.get("ai_model_primary").asText(), "cắt khoảng trắng");
        assertEquals("gemini-2.5-flash", settingsService.aiModelPrimary(), "giá trị AiServiceClient gửi cho ai-service");
        assertFalse(s.get("email_verification_required").asBoolean());
        // Lưu dạng chuỗi gọn (không "1.0" / "0.0"); đọc lại qua SettingsService.getDouble được
        assertEquals("1", settings.findById("ocr_fallback_confidence").orElseThrow().getValue());
        assertEquals("0", settings.findById("ocr_low_line_confidence").orElseThrow().getValue());
        assertEquals("0.55", settings.findById("distractor_min_confidence").orElseThrow().getValue());
        assertEquals(0.55, settingsService.getDouble("distractor_min_confidence"), 1e-9);
        assertEquals(200, settingsService.getInt("learning_path_daily_cap_default"));
    }

    /** Khoá mới được audit như khoá cũ: chỉ khoá đổi, before/after là chuỗi lưu trong DB. */
    @Test
    void new_keys_are_audited() throws Exception { // ST-11
        String email = newEmail();
        String root = newStaff(Role.SUPER_ADMIN, email);
        Long rootId = userId(email);
        Map<String, Object> m = defaults();
        m.put("ocr_fallback_confidence", 0.9);
        m.put("ai_model_primary", "gemini-2.5-pro");
        call(put("/api/admin/settings"), root, m).andExpect(status().isOk());
        JsonNode detail = read(call(get("/api/admin/audit-logs").param("actorId", rootId.toString())
                .param("targetType", "SETTINGS"), root, null)).get("items").get(0).get("detail");
        assertEquals(2, detail.size(), detail.toString());
        assertEquals("0.85", detail.get("ocr_fallback_confidence").get("before").asText());
        assertEquals("0.9", detail.get("ocr_fallback_confidence").get("after").asText());
        assertEquals("", detail.get("ai_model_primary").get("before").asText());
        assertEquals("gemini-2.5-pro", detail.get("ai_model_primary").get("after").asText());
    }

    @Test
    void only_changed_keys_are_audited_and_noop_is_not() throws Exception { // ST-07
        String email = newEmail();
        String root = newStaff(Role.SUPER_ADMIN, email);
        Long rootId = userId(email);
        call(put("/api/admin/settings"), root, with("extraction_daily_limit_free", 7)).andExpect(status().isOk());
        JsonNode logs = read(call(get("/api/admin/audit-logs").param("actorId", rootId.toString())
                .param("targetType", "SETTINGS"), root, null));
        assertEquals(1, logs.get("total").asLong());
        JsonNode detail = logs.get("items").get(0).get("detail");
        assertEquals(1, detail.size(), "chỉ khoá đã đổi");
        assertEquals("5", detail.get("extraction_daily_limit_free").get("before").asText());
        assertEquals("7", detail.get("extraction_daily_limit_free").get("after").asText());

        call(put("/api/admin/settings"), root, with("extraction_daily_limit_free", 7)).andExpect(status().isOk());
        assertEquals(1, read(call(get("/api/admin/audit-logs").param("actorId", rootId.toString()), root, null))
                .get("total").asLong(), "không đổi gì -> không audit");
    }

    /**
     * V14 seed 4 khoá; V20 (lộ trình 2.0) thêm 3 khoá learning_path_*; V21 (WP-G5) thêm 6 khoá AI — không khoá nào khác lọt vào
     * app_settings, và CHECK của V21 chặn khoá lạ.
     */
    @Test
    void migration_seeds_exactly_thirteen_rows() { // ST-08
        assertEquals(13, settings.count());
        for (String k : defaults().keySet()) {
            assertTrue(settings.existsById(k), k);
        }
        com.pbl6.flashcard.model.AppSetting unknown = new com.pbl6.flashcard.model.AppSetting();
        unknown.setKey("khoa_la");
        unknown.setValue("1");
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class, () -> settings.saveAndFlush(unknown));
    }

    @Test
    void only_super_admin_writes_but_every_staff_reads() throws Exception { // AZ-01
        call(put("/api/admin/settings"), newStaff(Role.ADMIN), defaults()).andExpect(status().isForbidden());
        JsonNode s = read(call(get("/api/admin/settings"), newStaff(Role.ADMIN), null).andExpect(status().isOk()));
        assertEquals(5, s.get("extraction_daily_limit_free").asInt());
        call(get("/api/admin/settings"), newUser(), null).andExpect(status().isForbidden());
    }
}
