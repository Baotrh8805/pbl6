package com.pbl6.flashcard.dto.deck;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
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
        @Size(max = 1000) List<@Valid Card> cards
) {
    public static final String CATEGORIES = "dokkai|goi|kanji|bunpou|kaiwa|it|business";

    /** id: có = sửa thẻ đó (giữ lịch sử SRS), null = thẻ mới. Chỉ dùng khi PUT deck. */
    public record Card(
            @Size(max = 255) String id,
            @NotBlank @Size(max = 200) String term,
            @Size(max = 200) String reading,
            // Nội dung nhiều dòng (định nghĩa, ví dụ, ghi chú); dòng đầu là định nghĩa chính
            @NotBlank @Size(max = 2000) String meaning
    ) {}
}
