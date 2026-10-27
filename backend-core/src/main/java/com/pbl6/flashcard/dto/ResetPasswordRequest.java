package com.pbl6.flashcard.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import com.pbl6.flashcard.security.StrongPassword;

public record ResetPasswordRequest(
        @NotBlank(message = "Thiếu mã đặt lại mật khẩu") @Size(max = 100) String token,
        @NotBlank(message = "Mật khẩu mới không được để trống")
        @StrongPassword   // 8..72 ký tự + chữ, số, ký tự đặc biệt (PasswordPolicy)
        String newPassword
) {}
