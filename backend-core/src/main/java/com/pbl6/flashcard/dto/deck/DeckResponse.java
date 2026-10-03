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

    public record CardResponse(String id, String term, String reading, String meaning,
                               Integer position) {
        public static CardResponse of(Flashcard c) {
            return new CardResponse(c.getId(), c.getTerm(), c.getReading(), c.getMeaning(),
                    c.getPosition());
        }
    }

    public static DeckResponse of(Deck d, String access) {
        return of(d, access, false);
    }

    /**
     * showFolder: chỉ bật khi liệt kê bộ thẻ của một thư mục được chia sẻ. Người xem đã thấy các id thư mục con
     * qua /api/folders nên cần folderId để đếm / xếp bộ thẻ vào đúng thư mục con.
     */
    public static DeckResponse of(Deck d, String access, boolean showFolder) {
        return new DeckResponse(d.getId(), d.getTitle(), d.getLevel(), d.getDescription(), d.getOwnerId(),
                // Thư mục là cách chủ bộ thẻ sắp xếp -> người khác không thấy (trừ khi đang xem thư mục được chia sẻ)
                "owner".equals(access) || showFolder ? d.getFolderId() : null,
                access, d.getVisibility(), d.getCategory(), d.getCards().stream()
                        // fetch-join có thể không áp @OrderBy -> tự sắp theo position
                        .sorted(Comparator.comparing(Flashcard::getPosition, Comparator.nullsLast(Comparator.naturalOrder())))
                        .map(CardResponse::of).toList());
    }
}
