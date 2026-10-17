package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.admin.SettingsResponse;
import com.pbl6.flashcard.model.AppSetting;
import com.pbl6.flashcard.repository.AppSettingRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Cấu hình đổi được lúc chạy, lưu ở app_settings (V14 seed 4 khoá). Đọc DB mỗi lần gọi (1 PK lookup),
 * không cache: đổi ở Admin Panel có hiệu lực ngay cho request kế tiếp.
 */
@Service
public class SettingsService {

    public static final String KEY_LIMIT_FREE = "extraction_daily_limit_free";
    public static final String KEY_LIMIT_PREMIUM = "extraction_daily_limit_premium";
    public static final String KEY_ANNOUNCEMENT = "announcement";
    public static final String KEY_REGISTRATION_OPEN = "registration_open";

    private final AppSettingRepository settings;
    private final AuditService audit;

    public SettingsService(AppSettingRepository settings, AuditService audit) {
        this.settings = settings;
        this.audit = audit;
    }

    private String raw(String key) {
        return settings.findById(key)
                .orElseThrow(() -> new IllegalStateException("Thiếu cấu hình " + key + " trong app_settings"))
                .getValue();
    }

    public int getInt(String key) {
        return Integer.parseInt(raw(key));
    }

    public boolean getBool(String key) {
        return Boolean.parseBoolean(raw(key));
    }

    public String getText(String key) {
        return raw(key);
    }

    @Transactional(readOnly = true)
    public SettingsResponse current() {
        Map<String, AppSetting> all = new HashMap<>();
        settings.findAll().forEach(s -> all.put(s.getKey(), s));
        Instant updatedAt = all.values().stream().map(AppSetting::getUpdatedAt).max(Instant::compareTo).orElse(null);
        return new SettingsResponse(
                Integer.parseInt(all.get(KEY_LIMIT_FREE).getValue()),
                Integer.parseInt(all.get(KEY_LIMIT_PREMIUM).getValue()),
                all.get(KEY_ANNOUNCEMENT).getValue(),
                Boolean.parseBoolean(all.get(KEY_REGISTRATION_OPEN).getValue()),
                updatedAt);
    }

    /** Ghi 4 khoá; chỉ khoá có giá trị khác mới được cập nhật và đưa vào audit SETTINGS_UPDATE. */
    @Transactional
    public SettingsResponse update(Long actorId, SettingsResponse req) {
        Map<String, String> wanted = new LinkedHashMap<>();
        wanted.put(KEY_LIMIT_FREE, String.valueOf(req.extractionDailyLimitFree()));
        wanted.put(KEY_LIMIT_PREMIUM, String.valueOf(req.extractionDailyLimitPremium()));
        wanted.put(KEY_ANNOUNCEMENT, req.announcement().trim());
        wanted.put(KEY_REGISTRATION_OPEN, String.valueOf(req.registrationOpen()));

        Map<String, Object> changes = new HashMap<>();
        Instant now = Instant.now();
        for (Map.Entry<String, String> e : wanted.entrySet()) {
            AppSetting s = settings.findById(e.getKey()).orElseThrow();
            if (s.getValue().equals(e.getValue())) continue;
            changes.putAll(AuditService.diff(e.getKey(), s.getValue(), e.getValue()));
            s.setValue(e.getValue());
            s.setUpdatedAt(now);
            s.setUpdatedBy(actorId);
            settings.save(s);
        }
        if (!changes.isEmpty()) audit.log(actorId, "SETTINGS_UPDATE", "SETTINGS", "app_settings", changes);
        return current();
    }
}
