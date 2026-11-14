package com.pbl6.flashcard.dto.admin;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.pbl6.flashcard.model.AccountAppeal;
import com.pbl6.flashcard.model.User;

import java.time.Instant;

/**
 * Một khiếu nại trong Admin Panel (hợp đồng API đợt 2 §6). userLocked / lockedReason là trạng thái HIỆN TẠI của tài khoản (không
 * phải lúc gửi): admin thấy ngay tài khoản đã được mở khoá ở chỗ khác chưa. userId null = tài khoản không còn.
 * <p>
 * lockedReasonAtSubmit (STAFF-07, V29) là lý do khoá chụp lúc gửi, không đổi khi tài khoản được mở / khoá lại: "" = lúc gửi bị
 * khoá không ghi lý do; vắng (NON_NULL) = khiếu nại gửi trước V29, trang admin hiện lockedReason hiện tại kèm nhãn.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record AppealResponse(Long id, String email, Long userId, boolean userLocked, String lockedReason,
                             String lockedReasonAtSubmit, String message, String status, String action, String resolutionNote,
                             String resolvedByEmail, Instant resolvedAt, Instant createdAt) {

    public static AppealResponse of(AccountAppeal a, User user, String resolvedByEmail) {
        boolean locked = user != null && user.getLockedAt() != null;
        return new AppealResponse(a.getId(), a.getEmail(), a.getUserId(), locked, locked ? user.getLockedReason() : null,
                a.getLockedReasonAtSubmit(), a.getMessage(), a.getStatus(), a.getAction(), a.getResolutionNote(), resolvedByEmail,
                a.getResolvedAt(), a.getCreatedAt());
    }
}
