package com.pbl6.flashcard.dto.learningpath;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/** Body JSON của các endpoint sửa / kích hoạt lộ trình học tập. Trường null = không đổi. */
public final class LearningPathRequests {

    private LearningPathRequests() {}

    public record Patch(@Size(max = 100) String title, @Min(1) @Max(365) Integer totalDays, LocalDate startDate) {}

    public record ChapterPatch(@NotBlank @Size(max = 100) String title) {}

    public record Activate(LocalDate startDate, @Min(1) @Max(365) Integer totalDays) {}
}
