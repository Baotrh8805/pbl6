package com.pbl6.flashcard.dto.classroom;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public record ClassroomResponse(
        Long id,
        String name,
        String description,
        String code,
        String jlptLevel,
        String privacy,
        Long ownerId,
        String ownerName,
        Integer maxStudents,
        Long memberCount,
        Long pendingCount,
        Boolean isOwner,
        String myStatus,
        Instant createdAt,
        List<LessonResponse> lessons
) {
    public record LessonResponse(
            Long id,
            Integer orderIndex,
            String title,
            LocalDate scheduledDate,
            Boolean hasQuiz,
            Integer quizDurationMinutes,
            List<String> deckIds,
            Boolean isCompleted,
            Integer quizScore,
            Long completedMembersCount
    ) {}
}
