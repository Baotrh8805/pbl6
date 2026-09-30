package com.pbl6.flashcard.dto.deck;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Client chỉ gửi cardId + grade; ngày ôn kế tiếp do server quyết định. */
public record ReviewRequest(
        @NotBlank(message = "cardId là bắt buộc") @Size(max = 255) String cardId,
        @NotBlank(message = "grade là bắt buộc")
        @Pattern(regexp = "again|hard|good|easy", message = "grade phải là again|hard|good|easy")
        String grade
) {}
