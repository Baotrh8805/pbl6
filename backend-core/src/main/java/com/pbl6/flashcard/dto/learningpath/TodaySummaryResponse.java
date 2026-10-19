package com.pbl6.flashcard.dto.learningpath;

import java.util.UUID;

/**
 * Một dòng của GET /today-summary (widget Tổng quan, badge sidebar, LP-16): lộ trình ACTIVE kèm "hôm nay" — cùng cách tính
 * với LearningPathResponse.today nhưng gọn, batch cho mọi lộ trình của người dùng.
 */
public record TodaySummaryResponse(UUID pathId, String title, int dayIndex, int totalDays, String state,
                                   int newCount, int dueCount, int behindCount, String studyDays, int dailyCap) {}
