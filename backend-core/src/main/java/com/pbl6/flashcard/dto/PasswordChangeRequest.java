package com.pbl6.flashcard.dto;

import jakarta.validation.constraints.NotBlank;
import com.pbl6.flashcard.security.StrongPassword;

public record PasswordChangeRequest(
        @NotBlank(message = "Mật khẩu hiện tại không được để trống")
        String currentPassword,
        @NotBlank(message = "Mật khẩu mới không được để trống")
        @StrongPassword   // 8..72 ký tự + chữ, số, ký tự đặc biệt (PasswordPolicy)
        String newPassword
) {}
