package com.pbl6.flashcard.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** POST /api/auth/appeals (công khai): người bị khoá không có token nên tự khai email của tài khoản. */
public record AppealRequest(
        @NotBlank(message = "Email không được để trống")
        @Email(message = "Email không đúng định dạng")
        @Size(max = 255)
        String email,
        @NotBlank(message = "Nội dung khiếu nại không được để trống")
        @Size(min = AppealRequest.MESSAGE_MIN, max = AppealRequest.MESSAGE_MAX, message = AppealRequest.MESSAGE_SIZE)
        String message
) {
    public static final int MESSAGE_MIN = 10;
    public static final int MESSAGE_MAX = 1000;
    /** Dùng chung với AppealService: @Size đếm cả khoảng trắng hai đầu, service kiểm lại độ dài sau trim. */
    public static final String MESSAGE_SIZE = "Nội dung khiếu nại phải từ 10 đến 1000 ký tự";
}
