package com.pbl6.flashcard.dto.learningpath;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.pbl6.flashcard.service.LearningPathScheduler;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Lộ trình học tập. Danh sách không kèm chapters/days; today chỉ có khi ACTIVE. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record LearningPathResponse(UUID id, String title, String status, String sourceType, String sourceName,
                                   int totalDays, LocalDate startDate, Boolean chaptersDetected, UUID jobId,
                                   UUID folderId, Instant createdAt, Instant activatedAt, String errorMessage,
                                   JobSummary job, List<LearningPathChapterResponse> chapters, Today today,
                                   List<LearningPathScheduler.DayPlan> days) {

    /** Tiến độ job bóc tách bên dưới (client poll khi PROCESSING). */
    public record JobSummary(String status, String stage, String errorMessage, Map<String, Object> stats) {}

    /** state: before | during | after so với khoảng [1, totalDays]. */
    public record Today(LocalDate date, int dayIndex, String state, List<LearningPathScheduler.Task> tasks) {}
}
