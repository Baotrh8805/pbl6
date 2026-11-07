package com.pbl6.flashcard.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record VerifyEmailRequest(
        @NotBlank(message = "Thiếu mã xác thực email") @Size(max = 100) String token
) {}
