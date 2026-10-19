package com.pbl6.flashcard.service;

import java.util.UUID;

/**
 * Phát trong cùng giao dịch khi một lượt quiz được chốt và ghi kết quả (nộp bài hoặc hết giờ). LearningPathService nghe để chấm
 * "qua chương" (quiz_best_pct / quiz_passed_at) mà QuizAttemptService không cần biết tới lộ trình. mode: practice | exam.
 */
public record QuizSubmittedEvent(Long uid, String deckId, UUID attemptId, int score, int total, String mode) {}
