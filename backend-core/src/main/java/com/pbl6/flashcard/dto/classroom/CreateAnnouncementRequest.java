package com.pbl6.flashcard.dto.classroom;

import jakarta.validation.constraints.NotBlank;

public record CreateAnnouncementRequest(
        String title,
        @NotBlank(message = "Nội dung thông báo không được để trống")
        String content,
        Boolean isPinned
) {}
