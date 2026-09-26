package com.pbl6.flashcard.dto.deck;

import com.pbl6.flashcard.model.Deck;
import com.pbl6.flashcard.model.Flashcard;

import java.util.Comparator;
import java.util.List;
import java.util.UUID;

/**
 * Dữ liệu trả về cho client: không lộ entity (lazy proxy, quan hệ ngược) ra ngoài transaction.
 * access: quyền của người gọi -> owner | editor | viewer (client dựa vào đây để hiện nút sửa/xoá).
 */
public record DeckResponse(String id, String title, String level, String description, Long ownerId,
                           UUID folderId, String access, String visibility, String category,
                           List<CardResponse> cards) {

    public record CardResponse(String id, String term, String reading, String meaning, String example,
                               Integer position) {
        public static CardResponse of(Flashcard c) {
            return new CardResponse(c.getId(), c.getTerm(), c.getReading(), c.getMeaning(), c.getExample(),
                    c.getPosition());
        }
    }

    public static DeckResponse of(Deck d, String access) {
        return new DeckResponse(d.getId(), d.getTitle(), d.getLevel(), d.getDescription(), d.getOwnerId(),
                // Thư mục là cách chủ bộ thẻ sắp xếp -> người khác không thấy
                "owner".equals(access) ? d.getFolderId() : null,
                access, d.getVisibility(), d.getCategory(), d.getCards().stream()
                        // fetch-join có thể không áp @OrderBy -> tự sắp theo position
                        .sorted(Comparator.comparing(Flashcard::getPosition, Comparator.nullsLast(Comparator.naturalOrder())))
                        .map(CardResponse::of).toList());
    }
}
