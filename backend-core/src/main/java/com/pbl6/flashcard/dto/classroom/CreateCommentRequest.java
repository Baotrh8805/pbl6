package com.pbl6.flashcard.dto.classroom;

import jakarta.validation.constraints.NotBlank;

public record CreateCommentRequest(
        @NotBlank(message = "Nội dung bình luận không được để trống")
        String content
) {}
