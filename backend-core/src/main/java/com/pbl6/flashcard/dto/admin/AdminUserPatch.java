package com.pbl6.flashcard.dto.admin;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/** Trường null = giữ nguyên. clearLimit=true bỏ hạn mức riêng (JSON không phân biệt "thiếu" và null). */
public record AdminUserPatch(Boolean locked, @jakarta.validation.constraints.Size(max = 200) String lockedReason,
                             Boolean premium, java.time.Instant premiumUntil,
                             @Min(0) @Max(1000) Integer extractionDailyLimit, Boolean clearLimit) {}
