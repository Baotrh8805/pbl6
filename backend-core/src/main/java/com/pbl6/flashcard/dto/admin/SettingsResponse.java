package com.pbl6.flashcard.dto.admin;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;

/**
 * Body của GET và PUT /api/admin/settings: mọi khoá của app_settings (V14 4 khoá, V20 3 khoá lộ trình, V21 6 khoá AI), tên JSON =
 * tên khoá. PUT đòi đủ mọi khoá (@NotNull) để một bản frontend cũ thiếu khoá không vô tình ghi đè bằng giá trị rỗng; khoảng giá trị
 * của các khoá mới kiểm ở {@code SettingsService.update} (thông điệp tiếng Việt theo tên khoá).
 */
public record SettingsResponse(
        @JsonProperty("extraction_daily_limit_free") @NotNull @Min(0) @Max(1000) Integer extractionDailyLimitFree,
        @JsonProperty("extraction_daily_limit_premium") @NotNull @Min(0) @Max(1000) Integer extractionDailyLimitPremium,
        @JsonProperty("announcement") @NotNull @Size(max = 300) String announcement,
        @JsonProperty("registration_open") @NotNull Boolean registrationOpen,
        /** 5..200 thẻ/ngày */
        @JsonProperty("learning_path_daily_cap_default") @NotNull Integer learningPathDailyCapDefault,
        /** 50..100 % */
        @JsonProperty("learning_path_quiz_pass_pct") @NotNull Integer learningPathQuizPassPct,
        /** 0..23 giờ Asia/Ho_Chi_Minh */
        @JsonProperty("learning_path_reminder_hour") @NotNull Integer learningPathReminderHour,
        /** 0..1: Tesseract dưới mức này thì ai-service chuyển sang OCR dự phòng */
        @JsonProperty("ocr_fallback_confidence") @NotNull Double ocrFallbackConfidence,
        /** 0..1: dòng OCR dưới mức này được đưa cho người dùng soát (textMeta.lowLines) */
        @JsonProperty("ocr_low_line_confidence") @NotNull Double ocrLowLineConfidence,
        /** 0..1 */
        @JsonProperty("distractor_min_confidence") @NotNull Double distractorMinConfidence,
        /** 0..1 */
        @JsonProperty("contradiction_alert_threshold") @NotNull Double contradictionAlertThreshold,
        /** ≤ 40 ký tự; rỗng = model mặc định của ai-service */
        @JsonProperty("ai_model_primary") @NotNull String aiModelPrimary,
        @JsonProperty("email_verification_required") @NotNull Boolean emailVerificationRequired,
        @JsonProperty("updatedAt") Instant updatedAt) {
}
