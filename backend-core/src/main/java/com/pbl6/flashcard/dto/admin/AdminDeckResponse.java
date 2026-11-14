package com.pbl6.flashcard.dto.admin;

import com.pbl6.flashcard.dto.deck.DeckResponse.CardResponse;
import com.pbl6.flashcard.repository.DeckRepository.AdminDeckRow;

import java.util.List;

public final class AdminDeckResponse {
    private AdminDeckResponse() {}

    public record Row(String id, String title, String level, String category, Long ownerId, String ownerEmail,
                      String visibility, boolean official, boolean featured, long cardCount, Double avgStars,
                      long downloads, long openReports) {
        public static Row of(AdminDeckRow r) {
            return new Row(r.getId(), r.getTitle(), r.getLevel(), r.getCategory(), r.getOwnerId(), r.getOwnerEmail(),
                    r.getVisibility(), Boolean.TRUE.equals(r.getOfficial()), Boolean.TRUE.equals(r.getFeatured()),
                    r.getCardCount(), r.getAvgStars(), r.getDownloads(), r.getOpenReports());
        }
    }

    /** Như Row + thẻ; cards = null khi bộ thẻ private và không có báo cáo OPEN (nội dung riêng tư). */
    public record Detail(String id, String title, String level, String category, Long ownerId, String ownerEmail,
                         String visibility, boolean official, boolean featured, long cardCount, Double avgStars,
                         long downloads, long openReports, List<CardResponse> cards) {
        public static Detail of(Row r, List<CardResponse> cards) {
            return new Detail(r.id(), r.title(), r.level(), r.category(), r.ownerId(), r.ownerEmail(), r.visibility(),
                    r.official(), r.featured(), r.cardCount(), r.avgStars(), r.downloads(), r.openReports(), cards);
        }
    }
}
