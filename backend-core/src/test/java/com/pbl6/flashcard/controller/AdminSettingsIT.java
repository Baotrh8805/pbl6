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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Cấu hình đổi lúc chạy (app_settings): hạn mức bóc tách, thông báo, mở / đóng đăng ký. */
class AdminSettingsIT extends IntegrationTest {

    @Autowired
    AppSettingRepository settings;

    /** Không gọi ai-service thật: job được tạo (202) rồi worker lỗi, đủ để đếm hạn mức. */
    @MockitoBean
    AiServiceClient aiClient;

    private static Map<String, Object> defaults() {
        Map<String, Object> m = new HashMap<>();
        m.put("extraction_daily_limit_free", 5);
        m.put("extraction_daily_limit_premium", 50);
        m.put("announcement", "");
        m.put("registration_open", true);
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

    @Test
    void int_values_are_validated() throws Exception { // ST-02
        String root = newStaff(Role.SUPER_ADMIN);
        call(put("/api/admin/settings"), root, with("extraction_daily_limit_free", -1)).andExpect(status().isBadRequest());
        call(put("/api/admin/settings"), root, with("extraction_daily_limit_free", 1001)).andExpect(status().isBadRequest());
        call(put("/api/admin/settings"), root, with("extraction_daily_limit_free", "abc")).andExpect(status().isBadRequest());
    }

    @Test
    void announcement_is_limited_to_300_chars() throws Exception { // ST-03
        call(put("/api/admin/settings"), newStaff(Role.SUPER_ADMIN), with("announcement", "x".repeat(301)))
                .andExpect(status().isBadRequest());
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
    void all_four_keys_are_required() throws Exception { // ST-06
        Map<String, Object> m = defaults();
        m.remove("announcement");
        call(put("/api/admin/settings"), newStaff(Role.SUPER_ADMIN), m).andExpect(status().isBadRequest());
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

    @Test
    void migration_seeds_exactly_four_rows() { // ST-08
        assertEquals(4, settings.count());
    }

    @Test
    void only_super_admin_writes_but_every_staff_reads() throws Exception { // AZ-01
        call(put("/api/admin/settings"), newStaff(Role.ADMIN), defaults()).andExpect(status().isForbidden());
        JsonNode s = read(call(get("/api/admin/settings"), newStaff(Role.ADMIN), null).andExpect(status().isOk()));
        assertEquals(5, s.get("extraction_daily_limit_free").asInt());
        call(get("/api/admin/settings"), newUser(), null).andExpect(status().isForbidden());
    }
}
