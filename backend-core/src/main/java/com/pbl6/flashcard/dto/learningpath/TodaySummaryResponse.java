package com.pbl6.flashcard.dto.learningpath;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;
import java.util.UUID;

/**
 * Một dòng của GET /today-summary (widget Tổng quan, badge sidebar, LP-16): lộ trình ACTIVE kèm "hôm nay" — cùng cách tính
 * với LearningPathResponse.today nhưng gọn, batch cho mọi lộ trình của người dùng. LP-10: lộ trình đã xong vẫn ACTIVE (chốt hoàn
 * thành không đổi status) nên vẫn có dòng để người dùng thấy nó, nhưng mang completedAt (chỉ khi đã chốt) và done (đã chốt hoặc
 * đã học hết thẻ — cùng quy tắc completion.done của GET /{id}) để client không coi nó là lộ trình đang học; dòng done xếp cuối.
 */
public record TodaySummaryResponse(UUID pathId, String title, int dayIndex, int totalDays, String state,
                                   int newCount, int dueCount, int behindCount, String studyDays, int dailyCap,
                                   @JsonInclude(JsonInclude.Include.NON_NULL) Instant completedAt, boolean done) {}
