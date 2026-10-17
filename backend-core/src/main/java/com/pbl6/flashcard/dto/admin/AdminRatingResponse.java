package com.pbl6.flashcard.dto.admin;

import com.pbl6.flashcard.repository.DeckRatingRepository.AdminRow;

import java.time.Instant;

public record AdminRatingResponse(Long id, String deckId, String deckTitle, Long userId, String userEmail,
                                  int stars, String comment, Instant updatedAt) {
    public static AdminRatingResponse of(AdminRow r) {
        return new AdminRatingResponse(r.getId(), r.getDeckId(), r.getDeckTitle(), r.getUserId(), r.getUserEmail(),
                r.getStars(), r.getComment(), r.getUpdatedAt());
    }
}
