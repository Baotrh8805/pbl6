package com.pbl6.flashcard.dto.admin;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;

/**
 * Body của GET và PUT /api/admin/settings: mọi khoá của app_settings (V14 4 khoá, V20 3 khoá lộ trình, V21 6 khoá AI), tên JSON =
 * tên khoá. PUT đòi đủ mọi khoá để một bản frontend cũ thiếu khoá không vô tình ghi đè bằng giá trị rỗng. Mọi kiểm tra (thiếu khoá,
 * khoảng giá trị) nằm ở {@code SettingsService.update}, không dùng bean validation: thông điệp mặc định của nó là tiếng Anh và nêu
 * tên field Java ("extractionDailyLimitFree: must be greater than or equal to 0") thay vì tên khoá JSON như các khoá còn lại.
 */
public record SettingsResponse(
        /** 0..1000 lượt bóc tách/ngày (cả hai gói) */
        @JsonProperty("extraction_daily_limit_free") Integer extractionDailyLimitFree,
        @JsonProperty("extraction_daily_limit_premium") Integer extractionDailyLimitPremium,
        /** ≤ 300 ký tự */
        @JsonProperty("announcement") String announcement,
        @JsonProperty("registration_open") Boolean registrationOpen,
        /** 5..200 thẻ/ngày */
        @JsonProperty("learning_path_daily_cap_default") Integer learningPathDailyCapDefault,
        /** 50..100 % */
        @JsonProperty("learning_path_quiz_pass_pct") Integer learningPathQuizPassPct,
        /** 0..23 giờ Asia/Ho_Chi_Minh */
        @JsonProperty("learning_path_reminder_hour") Integer learningPathReminderHour,
        /** 0..1: Tesseract dưới mức này thì ai-service chuyển sang OCR dự phòng */
        @JsonProperty("ocr_fallback_confidence") Double ocrFallbackConfidence,
        /** 0..1: dòng OCR dưới mức này được đưa cho người dùng soát (textMeta.lowLines) */
        @JsonProperty("ocr_low_line_confidence") Double ocrLowLineConfidence,
        /** 0..1 */
        @JsonProperty("distractor_min_confidence") Double distractorMinConfidence,
        /** 0..1 */
        @JsonProperty("contradiction_alert_threshold") Double contradictionAlertThreshold,
        /** ≤ 40 ký tự; rỗng = model mặc định của ai-service */
        @JsonProperty("ai_model_primary") String aiModelPrimary,
        @JsonProperty("email_verification_required") Boolean emailVerificationRequired,
        @JsonProperty("updatedAt") Instant updatedAt) {
}
