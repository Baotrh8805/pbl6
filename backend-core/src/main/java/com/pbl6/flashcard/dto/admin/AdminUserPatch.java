package com.pbl6.flashcard.dto.admin;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/** Trường null = giữ nguyên. clearLimit=true bỏ hạn mức riêng (JSON không phân biệt "thiếu" và null). */
public record AdminUserPatch(Boolean locked, @jakarta.validation.constraints.Size(max = 200) String lockedReason,
                             Boolean premium, java.time.Instant premiumUntil,
                             @Min(0) @Max(1000) Integer extractionDailyLimit, Boolean clearLimit,
                             /* V38: false = mở khoá bình luận sớm; true = khoá bình luận 24 giờ */ Boolean commentLocked) {
    public AdminUserPatch(Boolean locked, String lockedReason, Boolean premium, java.time.Instant premiumUntil,
                          Integer extractionDailyLimit, Boolean clearLimit) {
        this(locked, lockedReason, premium, premiumUntil, extractionDailyLimit, clearLimit, null);
    }
}
