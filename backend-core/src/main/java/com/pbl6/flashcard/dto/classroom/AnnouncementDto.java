package com.pbl6.flashcard.dto.classroom;

import java.time.Instant;
import java.util.List;

public record AnnouncementDto(
        Long id,
        Long classroomId,
        Long authorId,
        String authorName,
        String title,
        String content,
        Boolean isPinned,
        Instant createdAt,
        List<CommentDto> comments
) {
    public record CommentDto(
            Long id,
            Long announcementId,
            Long userId,
            String userName,
            String content,
            Instant createdAt
    ) {}
}
