package com.pbl6.flashcard.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ResetPasswordRequest(
        @NotBlank(message = "Thiếu mã đặt lại mật khẩu") @Size(max = 100) String token,
        @NotBlank(message = "Mật khẩu mới không được để trống")
        @Size(min = RegisterRequest.MIN_PASSWORD, max = RegisterRequest.MAX_PASSWORD,
                message = "Mật khẩu mới phải từ 6 đến 72 ký tự")
        String newPassword
) {}
