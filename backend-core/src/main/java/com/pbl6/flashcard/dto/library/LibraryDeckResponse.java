package com.pbl6.flashcard.dto.library;

import com.pbl6.flashcard.dto.deck.DeckResponse.CardResponse;
import com.pbl6.flashcard.repository.DeckRepository.LibraryRow;

import java.util.List;

/** Một bộ thẻ trong Thư viện cộng đồng. rating null = chưa có đánh giá; myRating null = mình chưa chấm. */
public record LibraryDeckResponse(String id, String title, String level, String description, String category,
                                  boolean official, boolean featured, String authorName, boolean mine,
                                  long cardsCount, long downloadsCount, long quizCount,
                                  Double rating, long ratingsCount, Integer myRating) {

    public static LibraryDeckResponse of(LibraryRow r, Long uid) {
        return new LibraryDeckResponse(r.getId(), r.getTitle(), r.getLevel(), r.getDescription(), r.getCategory(),
                Boolean.TRUE.equals(r.getOfficial()), Boolean.TRUE.equals(r.getFeatured()), r.getAuthorName(),
                uid.equals(r.getOwnerId()), r.getCardsCount(), r.getDownloadsCount(), r.getQuizCount(),
                round1(r.getRating()), r.getRatingsCount(), r.getMyRating());
    }

    /** 1 chữ số thập phân như giao diện cũ (4.9). */
    public static Double round1(Double rating) {
        return rating == null ? null : Math.round(rating * 10) / 10.0;
    }

    /** Kết quả sau khi chấm sao. */
    /** moderation (V38): kết quả kiểm duyệt AI của bình luận vừa gửi (bỏ khi null: không có bình luận / sạch); rating vẫn trả null như trước. */
    public record Rating(Double rating, long ratingsCount, int myRating,
                         @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
                         com.pbl6.flashcard.dto.moderation.ModerationDtos.Info moderation) {
        public Rating(Double rating, long ratingsCount, int myRating) { this(rating, ratingsCount, myRating, null); }
    }

    /** Bộ thẻ nổi bật + thẻ mẫu (thẻ đầu tiên) cho banner. */
    public record Featured(LibraryDeckResponse deck, CardResponse sampleCard) {}

    /** allCount: tổng bộ thẻ public (không lọc), cho tab "Tất cả" và badge ở sidebar. */
    public record Page(List<LibraryDeckResponse> items, long total, int page, int size, long allCount,
                       Featured featured) {}
}
