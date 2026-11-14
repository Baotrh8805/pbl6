package com.pbl6.flashcard.dto.deck;

import java.util.List;

/**
 * GET /api/decks/{id}/recall (HLR, V38, spec 2026-10-27 đêm §6.2): cards = số thẻ của bộ, studied = thẻ đã học (có số liệu),
 * avgRecall = trung bình p nhớ dự đoán của thẻ đã học (null khi chưa học), forgettingSoon = số thẻ p &lt; 0,7; items theo thứ tự p tăng.
 */
public record DeckRecallResponse(int cards, int studied, Double avgRecall, int forgettingSoon, List<Item> items) {
    public record Item(String cardId, double recall, boolean forget) {}
}
