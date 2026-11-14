package com.pbl6.flashcard.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RefreshRequest(
        @NotBlank(message = "Thiếu refresh token") @Size(max = 100) String refreshToken
) {}
