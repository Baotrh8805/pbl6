package com.pbl6.flashcard.dto;

import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.model.User;

import java.time.LocalDateTime;

/**
 * Hồ sơ trả cho client (GET /api/auth/me ...): không lộ entity, không có mật khẩu / mốc đổi mật khẩu.
 * emailVerified (hợp đồng API đợt 2 §3): chỉ cờ, không lộ mốc thời gian.
 */
public record UserResponse(Long id, String email, String fullName, String jlptLevel, Boolean isPremium, Role role,
                           LocalDateTime createdAt, boolean mustChangePassword, java.time.Instant premiumUntil,
                           boolean emailVerified) {

    public static UserResponse of(User u) {
        return new UserResponse(u.getId(), u.getEmail(), u.getFullName(), u.getJlptLevel(), u.getIsPremium(),
                u.getRole(), u.getCreatedAt(), u.isMustChangePassword(), u.getPremiumUntil(), u.getEmailVerifiedAt() != null);
    }
}
