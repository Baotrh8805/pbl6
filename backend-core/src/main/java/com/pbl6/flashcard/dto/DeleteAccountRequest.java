package com.pbl6.flashcard.dto;

import jakarta.validation.constraints.NotBlank;

/** DELETE /api/auth/me: xác nhận bằng mật khẩu hiện tại. */
public record DeleteAccountRequest(@NotBlank(message = "Nhập mật khẩu để xác nhận") String password) {}
