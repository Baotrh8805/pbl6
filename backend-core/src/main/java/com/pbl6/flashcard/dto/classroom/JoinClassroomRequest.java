package com.pbl6.flashcard.dto.classroom;

import jakarta.validation.constraints.NotBlank;

public record JoinClassroomRequest(
        @NotBlank(message = "Mã lớp học không được để trống")
        String code
) {}
