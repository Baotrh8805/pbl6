package com.pbl6.flashcard.dto.classroom;

import java.time.Instant;

public record LessonSubmissionDto(
        Long userId,
        String fullName,
        String email,
        Boolean isCompleted,
        Instant completedAt,
        Integer quizScore
) {}
