package com.pbl6.flashcard.dto.admin;

import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.model.User;

import java.time.Instant;
import java.time.LocalDateTime;

public final class AdminUserResponse {
    private AdminUserResponse() {}

    public record Row(Long id, String email, String fullName, Role role, Boolean isPremium, Instant lockedAt,
                      LocalDateTime createdAt, long deckCount) {
        public static Row of(User u, long deckCount) {
            return new Row(u.getId(), u.getEmail(), u.getFullName(), u.getRole(), u.getIsPremium(), u.getLockedAt(),
                    u.getCreatedAt(), deckCount);
        }
    }

    public record Detail(Long id, String email, String fullName, String jlptLevel, Role role, Boolean isPremium, Instant premiumUntil,
                         Instant lockedAt, String lockedReason, LocalDateTime createdAt, Integer extractionDailyLimit,
                         long deckCount, long cardCount, long extractionCount, long extractionsToday, long quizCount,
                         Instant lastReviewAt, long activeSessions, boolean mustChangePassword) {}
}
