package com.pbl6.flashcard.dto;

import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.model.User;

import java.time.LocalDateTime;

/** Hồ sơ trả cho client (GET /api/auth/me ...): không lộ entity, không có mật khẩu / mốc đổi mật khẩu. */
public record UserResponse(Long id, String email, String fullName, String jlptLevel, Boolean isPremium, Role role,
                           LocalDateTime createdAt) {

    public static UserResponse of(User u) {
        return new UserResponse(u.getId(), u.getEmail(), u.getFullName(), u.getJlptLevel(), u.getIsPremium(),
                u.getRole(), u.getCreatedAt());
    }
}
