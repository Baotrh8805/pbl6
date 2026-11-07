package com.pbl6.flashcard.dto.library;

import com.pbl6.flashcard.repository.DeckRatingRepository;

import java.time.Instant;
import java.util.List;

/** Tổng hợp + đánh giá của chính mình (null nếu chưa chấm) + một trang đánh giá. */
public record DeckRatingsResponse(Double rating, long ratingsCount, Mine mine, List<Item> items, int page, int size) {

    public record Mine(int stars, String comment) {}

    /**
     * moderation (V38): chỉ khác null khi bình luận đang bị AI gắn cờ / chặn (chủ) hoặc bản che (người khác, masked); chỉ trường này
     * bị bỏ khi null — comment vẫn trả "comment": null như trước (client cũ đọc được).
     */
    public record Item(String displayName, int stars, String comment, Instant updatedAt, boolean mine,
                       @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
                       com.pbl6.flashcard.dto.moderation.ModerationDtos.Info moderation) {
        public static Item of(DeckRatingRepository.Row r) {
            return new Item(r.getDisplayName(), r.getStars(), r.getComment(), r.getUpdatedAt(),
                    Boolean.TRUE.equals(r.getMine()), null);
        }

        public Item withComment(String comment, com.pbl6.flashcard.dto.moderation.ModerationDtos.Info moderation) {
            return new Item(displayName, stars, comment, updatedAt, mine, moderation);
        }
    }
}
