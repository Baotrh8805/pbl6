package com.pbl6.flashcard.dto.learningpath;

import java.util.UUID;

/** Một chương: DRAFT tính số thẻ + khoảng ngày sống từ item được chọn; ACTIVE lấy giá trị đã chốt. */
public record LearningPathChapterResponse(UUID id, int position, String title, String deckId, boolean deckDeleted,
                                          int cardCount, int vocabCount, int grammarCount,
                                          Integer dayFrom, Integer dayTo, int perDay) {}
