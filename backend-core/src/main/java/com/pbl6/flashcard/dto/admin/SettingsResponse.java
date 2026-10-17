package com.pbl6.flashcard.dto.admin;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;

/** Body của GET và PUT /api/admin/settings: đúng 4 khoá của app_settings, tên JSON = tên khoá. */
public record SettingsResponse(
        @JsonProperty("extraction_daily_limit_free") @NotNull @Min(0) @Max(1000) Integer extractionDailyLimitFree,
        @JsonProperty("extraction_daily_limit_premium") @NotNull @Min(0) @Max(1000) Integer extractionDailyLimitPremium,
        @JsonProperty("announcement") @NotNull @Size(max = 300) String announcement,
        @JsonProperty("registration_open") @NotNull Boolean registrationOpen,
        @JsonProperty("updatedAt") Instant updatedAt) {
}
