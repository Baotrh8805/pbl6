package com.pbl6.flashcard.dto.admin;

import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.service.AccountDeletionService;

import java.time.Instant;
import java.time.LocalDateTime;

public final class AdminUserResponse {
    private AdminUserResponse() {}

    /**
     * deleted: tài khoản đã tự xoá (AccountDeletionService.isDeleted) -> frontend hiện nhãn "Đã xoá" thay vì "Bị khoá" và ẩn nút
     * mở khoá / Premium / vai trò (backend trả 409). boolean nguyên thuỷ: luôn có trong JSON, kể cả khi bật NON_NULL.
     */
    public record Row(Long id, String email, String fullName, Role role, Boolean isPremium, Instant lockedAt,
                      LocalDateTime createdAt, long deckCount, boolean deleted, boolean emailVerified) {
        public static Row of(User u, long deckCount) {
            return new Row(u.getId(), u.getEmail(), u.getFullName(), u.getRole(), u.getIsPremium(), u.getLockedAt(),
                    u.getCreatedAt(), deckCount, AccountDeletionService.isDeleted(u), u.getEmailVerifiedAt() != null);
        }
    }

    public record Detail(Long id, String email, String fullName, String jlptLevel, Role role, Boolean isPremium, Instant premiumUntil,
                         Instant lockedAt, String lockedReason, LocalDateTime createdAt, Integer extractionDailyLimit,
                         long deckCount, long cardCount, long extractionCount, long extractionsToday, long quizCount,
                         Instant lastReviewAt, long activeSessions, boolean mustChangePassword,
                         /* hợp đồng API đợt 2 §3: false -> nút "Xác thực email" (POST /api/admin/users/{id}/verify-email) */
                         boolean emailVerified,
                         /* như Row.deleted */
                         boolean deleted) {}
}
