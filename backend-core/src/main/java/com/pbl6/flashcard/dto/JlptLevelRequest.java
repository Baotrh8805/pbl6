package com.pbl6.flashcard.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public record JlptLevelRequest(
        @NotNull(message = "Trình độ JLPT không hợp lệ")
        @Pattern(regexp = "N[1-5]", message = "Trình độ JLPT không hợp lệ")
        String jlptLevel
) {}
