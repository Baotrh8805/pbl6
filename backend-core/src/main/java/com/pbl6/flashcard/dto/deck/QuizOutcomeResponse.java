package com.pbl6.flashcard.dto.deck;

import java.util.Map;

/** Kết quả nộp bài. expired: nộp sau hạn giờ -> bài không được chấm, ghi 0 điểm. wrong: cardId -> nghĩa đúng. */
public record QuizOutcomeResponse(int score, int total, Map<String, String> wrong, boolean expired) {}
