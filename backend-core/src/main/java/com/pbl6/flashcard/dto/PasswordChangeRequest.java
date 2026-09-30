package com.pbl6.flashcard.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PasswordChangeRequest(
        @NotBlank(message = "Mật khẩu hiện tại không được để trống")
        String currentPassword,
        @NotBlank(message = "Mật khẩu mới không được để trống")
        @Size(min = RegisterRequest.MIN_PASSWORD, max = RegisterRequest.MAX_PASSWORD,
                message = "Mật khẩu mới phải từ " + RegisterRequest.MIN_PASSWORD + " đến "
                        + RegisterRequest.MAX_PASSWORD + " ký tự")
        String newPassword
) {}
