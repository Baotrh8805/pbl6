package com.pbl6.flashcard.dto.deck;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Hoàn tác lượt chấm mới nhất của thẻ (spec 25/10 §3.8). Trạng thái cũ lấy từ review_logs, client chỉ gửi cardId. */
public record UndoReviewRequest(@NotBlank(message = "cardId là bắt buộc") @Size(max = 255) String cardId) {}
