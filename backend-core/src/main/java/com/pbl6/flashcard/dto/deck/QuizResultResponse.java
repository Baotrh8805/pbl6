package com.pbl6.flashcard.dto.deck;

import java.time.Instant;

/** mode: practice (làm từng câu) | exam (làm hết bài). Một lượt làm quiz kèm tên bộ thẻ (bộ thẻ Thư viện chưa lưu không nằm trong "Bộ thẻ của tôi" để client tra tên). */
public record QuizResultResponse(String deckId, String deckTitle, int score, int total, String mode,
                                 Instant createdAt) {}
