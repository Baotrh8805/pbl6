package com.pbl6.flashcard.dto.deck;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.Map;
import java.util.UUID;

/** Nộp bài: lượt làm do server phát + cardId -> nghĩa đã chọn (câu bỏ trống được phép, tính là sai). */
public record QuizSubmission(
        @NotNull(message = "attemptId là bắt buộc") UUID attemptId,
        @NotNull(message = "answers là bắt buộc") @Size(max = 100) Map<String, String> answers
) {}
