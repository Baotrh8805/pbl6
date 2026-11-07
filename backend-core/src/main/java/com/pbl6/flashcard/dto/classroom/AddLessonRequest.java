package com.pbl6.flashcard.dto.classroom;

import jakarta.validation.constraints.NotBlank;
import java.time.LocalDate;
import java.util.List;

public record AddLessonRequest(
        Integer orderIndex,
        @NotBlank(message = "Tiêu đề buổi học không được để trống")
        String title,
        LocalDate scheduledDate,
        Boolean hasQuiz,
        Integer quizDurationMinutes,
        List<String> deckIds
) {}
