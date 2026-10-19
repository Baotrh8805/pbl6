package com.pbl6.flashcard.dto.learningpath;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;
import java.util.UUID;

/**
 * Một chương. DRAFT: số thẻ + khoảng ngày tính sống từ item được chọn, bằng đúng bộ chia ngày của lúc kích hoạt (plan 2.0, xem
 * LearningPathService.draftSchedule) nên khớp lịch nhận được; ACTIVE: tất cả suy từ learning_path_cards
 * (số thẻ còn trong lịch, dải ngày = min/max scheduled_day, learned / mastered theo reviews của người dùng) nên bộ thẻ bị xoá →
 * cardCount 0, không có dải ngày. Trường 2.0 (learned, mastered, state, quizBestPct, quizPassedAt) chỉ có ở ACTIVE; null bị bỏ
 * để client 1.0 không thấy khác biệt. state: passed | review | current | locked | open (quy tắc ở LearningPathService.chapterState).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record LearningPathChapterResponse(UUID id, int position, String title, String deckId, boolean deckDeleted,
                                          int cardCount, int vocabCount, int grammarCount,
                                          Integer dayFrom, Integer dayTo, int perDay,
                                          Integer learned, Integer mastered, String state,
                                          Integer quizBestPct, Instant quizPassedAt) {

    /** Dạng 1.0 (bản nháp): chưa có tiến độ / trạng thái. */
    public LearningPathChapterResponse(UUID id, int position, String title, String deckId, boolean deckDeleted,
                                       int cardCount, int vocabCount, int grammarCount,
                                       Integer dayFrom, Integer dayTo, int perDay) {
        this(id, position, title, deckId, deckDeleted, cardCount, vocabCount, grammarCount, dayFrom, dayTo, perDay,
                null, null, null, null, null);
    }
}
