package com.pbl6.flashcard.dto.classroom;

import java.time.Instant;

public record ClassroomMemberDto(
        Long userId,
        String fullName,
        String email,
        String role,
        String status,
        Instant joinedAt,
        Long completedLessonsCount
) {}
