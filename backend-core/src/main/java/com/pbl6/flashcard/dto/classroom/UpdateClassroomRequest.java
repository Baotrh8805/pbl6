package com.pbl6.flashcard.dto.classroom;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;

public record UpdateClassroomRequest(
        @NotBlank(message = "Tên lớp học không được để trống")
        @Size(min = 3, max = 100, message = "Tên lớp học phải từ 3 đến 100 ký tự")
        String name,
        String description,
        String jlptLevel,
        String privacy,
        Integer maxStudents,
        List<LessonItemRequest> lessons
) {
    public record LessonItemRequest(
            Long id,
            Integer orderIndex,
            String title,
            LocalDate scheduledDate,
            List<String> deckIds
    ) {}
}
