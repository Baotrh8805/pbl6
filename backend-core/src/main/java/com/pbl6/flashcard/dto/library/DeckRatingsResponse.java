package com.pbl6.flashcard.dto.library;

import com.pbl6.flashcard.repository.DeckRatingRepository;

import java.time.Instant;
import java.util.List;

/** Tổng hợp + đánh giá của chính mình (null nếu chưa chấm) + một trang đánh giá. */
public record DeckRatingsResponse(Double rating, long ratingsCount, Mine mine, List<Item> items, int page, int size) {

    public record Mine(int stars, String comment) {}

    public record Item(String displayName, int stars, String comment, Instant updatedAt, boolean mine) {
        public static Item of(DeckRatingRepository.Row r) {
            return new Item(r.getDisplayName(), r.getStars(), r.getComment(), r.getUpdatedAt(),
                    Boolean.TRUE.equals(r.getMine()));
        }
    }
}
