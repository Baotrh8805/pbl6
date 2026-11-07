package com.pbl6.flashcard.dto.deck;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public record DeckRequest(
        @NotBlank @Size(max = 200) String title,
        @NotBlank @Pattern(regexp = "N[1-5]") String level,
        @Size(max = 1000) String description,
        UUID folderId,
        // null = giữ nguyên (khi sửa) / private (khi tạo). Chỉ chủ bộ thẻ đổi được.
        @Pattern(regexp = "private|public") String visibility,
        @Pattern(regexp = CATEGORIES) String category,
        // @Valid trên phần tử: thiếu nó thì @Size của thẻ lồng không được kiểm -> tràn cột -> 500
        @Size(max = 1000) List<@Valid Card> cards,
        // B5.1 (LC-04): true = người dùng đã xác nhận giữ thuật ngữ trùng (sau 409 DUPLICATE_TERM); null / false = chặn trùng
        Boolean allowDuplicate
) {
    /** Dạng 7 tham số cho mã nội bộ (bóc tách, lộ trình) — chưa có cờ trùng; caller truyền cờ qua dạng đầy đủ khi cần. */
    public DeckRequest(String title, String level, String description, UUID folderId, String visibility, String category,
                       List<Card> cards) {
        this(title, level, description, folderId, visibility, category, cards, null);
    }

    public static final String CATEGORIES = "dokkai|goi|kanji|bunpou|kaiwa|it|business";

    /** id: có = sửa thẻ đó (giữ lịch sử SRS), null = thẻ mới. Chỉ dùng khi PUT deck. */
    public record Card(
            @Size(max = 255) String id,
            @NotBlank @Size(max = 200) String term,
            @Size(max = 200) String reading,
            // Nội dung nhiều dòng (định nghĩa, ví dụ, ghi chú); dòng đầu là định nghĩa chính
            @NotBlank @Size(max = 2000) String meaning,
            // Metadata bóc tách AI (tuỳ chọn, V12): client giữ nguyên khi sửa để không mất khi PUT deck
            @Pattern(regexp = "N[1-5]") String level,
            @Pattern(regexp = "vocab|grammar") String kind,
            @Size(max = 50) List<Map<String, String>> readingSegments,
            @Size(max = 100) String hanViet,
            // Từ loại Sudachi (V22, ví dụ 動詞): quiz chia động từ chỉ hỏi thẻ là động từ
            @Size(max = 40) String pos
    ) {
        /** Thẻ chỉ có nội dung cơ bản (import, nhân bản). */
        public Card(String id, String term, String reading, String meaning) {
            this(id, term, reading, meaning, null, null, null, null, null);
        }

        /** Thẻ có metadata bóc tách nhưng không có từ loại (giữ chữ ký cũ cho các nơi tạo thẻ trước V22). */
        public Card(String id, String term, String reading, String meaning, String level, String kind,
                    List<Map<String, String>> readingSegments, String hanViet) {
            this(id, term, reading, meaning, level, kind, readingSegments, hanViet, null);
        }
    }
}
