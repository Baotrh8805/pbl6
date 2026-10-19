package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.admin.SettingsResponse;
import com.pbl6.flashcard.model.AppSetting;
import com.pbl6.flashcard.repository.AppSettingRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Cấu hình đổi được lúc chạy, lưu ở app_settings (V14 seed 4 khoá, V20 thêm 3 khoá lộ trình, V21 thêm 6 khoá AI). Đọc DB mỗi lần
 * gọi (1 PK lookup), không cache: đổi ở Admin Panel có hiệu lực ngay cho request kế tiếp.
 */
@Service
public class SettingsService {

    public static final String KEY_LIMIT_FREE = "extraction_daily_limit_free";
    public static final String KEY_LIMIT_PREMIUM = "extraction_daily_limit_premium";
    public static final String KEY_ANNOUNCEMENT = "announcement";
    public static final String KEY_REGISTRATION_OPEN = "registration_open";
    /** Lộ trình 2.0 (V20): trần tải/ngày mặc định, ngưỡng % qua chương, giờ nhắc học (Asia/Ho_Chi_Minh). */
    public static final String KEY_LP_DAILY_CAP = "learning_path_daily_cap_default";
    public static final String KEY_LP_QUIZ_PASS = "learning_path_quiz_pass_pct";
    public static final String KEY_LP_REMINDER_HOUR = "learning_path_reminder_hour";
    /** Tham số AI (V21, WP-G5), đều 0..1: Tesseract dưới ngưỡng thì ai-service chuyển sang OCR dự phòng. */
    public static final String KEY_OCR_FALLBACK = "ocr_fallback_confidence";
    /** Dòng OCR có confidence dưới ngưỡng được trả cho client (textMeta.lowLines) để người dùng soát. */
    public static final String KEY_OCR_LOW_LINE = "ocr_low_line_confidence";
    public static final String KEY_DISTRACTOR_MIN = "distractor_min_confidence";
    public static final String KEY_CONTRADICTION_ALERT = "contradiction_alert_threshold";
    /** Tên model AI chính (≤ 40 ký tự); rỗng = để ai-service tự chọn. */
    public static final String KEY_AI_MODEL_PRIMARY = "ai_model_primary";
    /** Quyết định D2: chặn đăng nhập tới khi xác thực email. Gói xác thực email (V24) đọc khoá này. */
    public static final String KEY_EMAIL_VERIFICATION = "email_verification_required";

    /**
     * Giá trị seed của migration. Chỉ dùng khi dòng thiếu / giá trị trong DB không đọc được (sửa tay sai): GET vẫn trả được để
     * SUPER_ADMIN sửa lại qua giao diện thay vì trang cấu hình 500 vĩnh viễn.
     */
    private static final Map<String, String> DEFAULTS = Map.ofEntries(
            Map.entry(KEY_LIMIT_FREE, "5"), Map.entry(KEY_LIMIT_PREMIUM, "50"), Map.entry(KEY_ANNOUNCEMENT, ""),
            Map.entry(KEY_REGISTRATION_OPEN, "true"), Map.entry(KEY_LP_DAILY_CAP, "50"), Map.entry(KEY_LP_QUIZ_PASS, "80"),
            Map.entry(KEY_LP_REMINDER_HOUR, "7"), Map.entry(KEY_OCR_FALLBACK, "0.85"), Map.entry(KEY_OCR_LOW_LINE, "0.75"),
            Map.entry(KEY_DISTRACTOR_MIN, "0.6"), Map.entry(KEY_CONTRADICTION_ALERT, "0.7"), Map.entry(KEY_AI_MODEL_PRIMARY, ""),
            Map.entry(KEY_EMAIL_VERIFICATION, "true"));

    static final int MAX_MODEL_CHARS = 40;
    static final int MAX_DAILY_LIMIT = 1000;
    static final int MAX_ANNOUNCEMENT_CHARS = 300;

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

    public double getDouble(String key) {
        return Double.parseDouble(raw(key));
    }

    /**
     * Như {@link #getDouble(String)} nhưng không ném: thiếu dòng / không phải số / NaN / vô cực -> fallback. Dùng cho ngưỡng AI
     * nằm trên đường xử lý của người dùng (bóc tách) — cấu hình hỏng không được làm hỏng cả lượt bóc tách.
     */
    public double getDouble(String key, double fallback) {
        try {
            double v = getDouble(key);
            return Double.isFinite(v) ? v : fallback;
        } catch (RuntimeException e) {
            return fallback;
        }
    }

    @Transactional(readOnly = true)
    public SettingsResponse current() {
        Map<String, AppSetting> all = new HashMap<>();
        settings.findAll().forEach(s -> all.put(s.getKey(), s));
        Instant updatedAt = all.values().stream().map(AppSetting::getUpdatedAt).max(Instant::compareTo).orElse(null);
        return new SettingsResponse(
                intOf(all, KEY_LIMIT_FREE),
                intOf(all, KEY_LIMIT_PREMIUM),
                textOf(all, KEY_ANNOUNCEMENT),
                Boolean.parseBoolean(textOf(all, KEY_REGISTRATION_OPEN)),
                intOf(all, KEY_LP_DAILY_CAP),
                intOf(all, KEY_LP_QUIZ_PASS),
                intOf(all, KEY_LP_REMINDER_HOUR),
                doubleOf(all, KEY_OCR_FALLBACK),
                doubleOf(all, KEY_OCR_LOW_LINE),
                doubleOf(all, KEY_DISTRACTOR_MIN),
                doubleOf(all, KEY_CONTRADICTION_ALERT),
                textOf(all, KEY_AI_MODEL_PRIMARY),
                Boolean.parseBoolean(textOf(all, KEY_EMAIL_VERIFICATION)),
                updatedAt);
    }

    private static String textOf(Map<String, AppSetting> all, String key) {
        AppSetting s = all.get(key);
        return s != null && s.getValue() != null ? s.getValue() : DEFAULTS.get(key);
    }

    private static int intOf(Map<String, AppSetting> all, String key) {
        try {
            return Integer.parseInt(textOf(all, key).trim());
        } catch (NumberFormatException e) {
            return Integer.parseInt(DEFAULTS.get(key));
        }
    }

    private static double doubleOf(Map<String, AppSetting> all, String key) {
        try {
            double v = Double.parseDouble(textOf(all, key).trim());
            if (Double.isFinite(v)) return v;
        } catch (NumberFormatException ignored) {
            // rơi xuống mặc định
        }
        return Double.parseDouble(DEFAULTS.get(key));
    }

    /**
     * Ghi mọi khoá; chỉ khoá có giá trị khác mới được cập nhật và đưa vào audit SETTINGS_UPDATE. Mọi khoá — kể cả 4 khoá V14, trước
     * đây do bean validation chặn với thông điệp tiếng Anh theo tên field Java — kiểm ở đây (gom mọi lỗi vào một 400) để thông điệp
     * tiếng Việt nêu đúng tên khoá JSON mà trang Admin gửi.
     */
    @Transactional
    public SettingsResponse update(Long actorId, SettingsResponse req) {
        validate(req);
        Map<String, String> wanted = new LinkedHashMap<>();
        wanted.put(KEY_LIMIT_FREE, String.valueOf(req.extractionDailyLimitFree()));
        wanted.put(KEY_LIMIT_PREMIUM, String.valueOf(req.extractionDailyLimitPremium()));
        wanted.put(KEY_ANNOUNCEMENT, req.announcement().trim());
        wanted.put(KEY_REGISTRATION_OPEN, String.valueOf(req.registrationOpen()));
        wanted.put(KEY_LP_DAILY_CAP, String.valueOf(req.learningPathDailyCapDefault()));
        wanted.put(KEY_LP_QUIZ_PASS, String.valueOf(req.learningPathQuizPassPct()));
        wanted.put(KEY_LP_REMINDER_HOUR, String.valueOf(req.learningPathReminderHour()));
        wanted.put(KEY_OCR_FALLBACK, decimal(req.ocrFallbackConfidence()));
        wanted.put(KEY_OCR_LOW_LINE, decimal(req.ocrLowLineConfidence()));
        wanted.put(KEY_DISTRACTOR_MIN, decimal(req.distractorMinConfidence()));
        wanted.put(KEY_CONTRADICTION_ALERT, decimal(req.contradictionAlertThreshold()));
        wanted.put(KEY_AI_MODEL_PRIMARY, req.aiModelPrimary().trim());
        wanted.put(KEY_EMAIL_VERIFICATION, String.valueOf(req.emailVerificationRequired()));

        Map<String, Object> changes = new HashMap<>();
        Instant now = Instant.now();
        for (Map.Entry<String, String> e : wanted.entrySet()) {
            // Dòng thiếu (DB sửa tay) được tạo lại thay vì 500: CHECK khoá của V21 vẫn chặn khoá lạ
            AppSetting s = settings.findById(e.getKey()).orElseGet(() -> {
                AppSetting fresh = new AppSetting();
                fresh.setKey(e.getKey());
                return fresh;
            });
            if (e.getValue().equals(s.getValue())) continue;
            changes.putAll(AuditService.diff(e.getKey(), s.getValue(), e.getValue()));
            s.setValue(e.getValue());
            s.setUpdatedAt(now);
            s.setUpdatedBy(actorId);
            settings.save(s);
        }
        if (!changes.isEmpty()) audit.log(actorId, "SETTINGS_UPDATE", "SETTINGS", "app_settings", changes);
        return current();
    }

    private static void validate(SettingsResponse req) {
        List<String> errors = new ArrayList<>();
        // PUT đòi đủ mọi khoá: một bản frontend cũ thiếu khoá không được ghi đè cấu hình bằng giá trị rỗng
        Map<String, Object> all = new LinkedHashMap<>();
        all.put(KEY_LIMIT_FREE, req.extractionDailyLimitFree());
        all.put(KEY_LIMIT_PREMIUM, req.extractionDailyLimitPremium());
        all.put(KEY_ANNOUNCEMENT, req.announcement());
        all.put(KEY_REGISTRATION_OPEN, req.registrationOpen());
        all.put(KEY_LP_DAILY_CAP, req.learningPathDailyCapDefault());
        all.put(KEY_LP_QUIZ_PASS, req.learningPathQuizPassPct());
        all.put(KEY_LP_REMINDER_HOUR, req.learningPathReminderHour());
        all.put(KEY_OCR_FALLBACK, req.ocrFallbackConfidence());
        all.put(KEY_OCR_LOW_LINE, req.ocrLowLineConfidence());
        all.put(KEY_DISTRACTOR_MIN, req.distractorMinConfidence());
        all.put(KEY_CONTRADICTION_ALERT, req.contradictionAlertThreshold());
        all.put(KEY_AI_MODEL_PRIMARY, req.aiModelPrimary());
        all.put(KEY_EMAIL_VERIFICATION, req.emailVerificationRequired());
        all.forEach((key, v) -> {
            if (v == null) errors.add("Thiếu khoá " + key + ".");
        });
        intRange(errors, KEY_LIMIT_FREE, req.extractionDailyLimitFree(), 0, MAX_DAILY_LIMIT);
        intRange(errors, KEY_LIMIT_PREMIUM, req.extractionDailyLimitPremium(), 0, MAX_DAILY_LIMIT);
        if (req.announcement() != null && req.announcement().length() > MAX_ANNOUNCEMENT_CHARS) {
            errors.add(KEY_ANNOUNCEMENT + " tối đa " + MAX_ANNOUNCEMENT_CHARS + " ký tự.");
        }
        intRange(errors, KEY_LP_DAILY_CAP, req.learningPathDailyCapDefault(), 5, 200);
        intRange(errors, KEY_LP_QUIZ_PASS, req.learningPathQuizPassPct(), 50, 100);
        intRange(errors, KEY_LP_REMINDER_HOUR, req.learningPathReminderHour(), 0, 23);
        unit(errors, KEY_OCR_FALLBACK, req.ocrFallbackConfidence());
        unit(errors, KEY_OCR_LOW_LINE, req.ocrLowLineConfidence());
        unit(errors, KEY_DISTRACTOR_MIN, req.distractorMinConfidence());
        unit(errors, KEY_CONTRADICTION_ALERT, req.contradictionAlertThreshold());
        if (req.aiModelPrimary() != null && req.aiModelPrimary().trim().length() > MAX_MODEL_CHARS) {
            errors.add(KEY_AI_MODEL_PRIMARY + " tối đa " + MAX_MODEL_CHARS + " ký tự.");
        }
        if (!errors.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, String.join("; ", errors));
        }
    }

    private static void intRange(List<String> errors, String key, Integer v, int min, int max) {
        if (v != null && (v < min || v > max)) errors.add(key + " phải từ " + min + " đến " + max + ".");
    }

    private static void unit(List<String> errors, String key, Double v) {
        if (v != null && !(Double.isFinite(v) && v >= 0 && v <= 1)) errors.add(key + " phải từ 0 đến 1.");
    }

    /** Dạng chuỗi ổn định cho số thực (0.85, 0.6, 1, 0): trùng giá trị seed nên PUT lại y nguyên không sinh audit. */
    static String decimal(double v) {
        return BigDecimal.valueOf(v).stripTrailingZeros().toPlainString();
    }
}
