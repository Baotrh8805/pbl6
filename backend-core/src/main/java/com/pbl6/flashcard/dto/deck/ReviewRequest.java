package com.pbl6.flashcard.dto.deck;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.UUID;

/**
 * Client chỉ gửi cardId + grade; ngày ôn kế tiếp do server quyết định. reactionMs (E1, V20): thời gian từ lúc hiện thẻ tới lúc
 * chấm, 0–600000 ms, chỉ ghi nhật ký để phân tích "ma sát trí nhớ" — KHÔNG đổi thuật toán SRS; pathId: lộ trình đang học (gắn lượt
 * ôn với lộ trình). Cả hai tuỳ chọn để client 1.0 không đổi gì.
 */
public record ReviewRequest(
        @NotBlank(message = "cardId là bắt buộc") @Size(max = 255) String cardId,
        @NotBlank(message = "grade là bắt buộc")
        @Pattern(regexp = "again|hard|good|easy", message = "grade phải là again|hard|good|easy")
        String grade,
        Boolean cram, // true = phiên "Học nhanh": chỉ ghi nhật ký, không đổi lịch ôn
        @Min(value = 0, message = "reactionMs phải từ 0 đến 600000")
        @Max(value = 600000, message = "reactionMs phải từ 0 đến 600000")
        Integer reactionMs,
        UUID pathId
) {}
