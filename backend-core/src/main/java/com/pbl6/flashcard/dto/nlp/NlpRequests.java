package com.pbl6.flashcard.dto.nlp;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/** Body JSON của các endpoint POST /api/nlp/* (chuyển tiếp sang ai-service). */
public final class NlpRequests {

    private NlpRequests() {}

    /** Trần một lô của ai-service (MAX_CARDS ở kanji_info_router, MAX_KANJI ở radical_router): quá thì ai-service trả 422. */
    public static final int MAX_KANJI = 200;

    /**
     * Mỗi phần tử là một chữ; ai-service tự bỏ mục không phải một chữ Hán nên ở đây chỉ chặn chuỗi dài (≤ 4 đơn vị UTF-16: đủ cho
     * chữ ngoài BMP như 𠮟) để một request không mang theo cả văn bản.
     */
    public record KanjiCards(@NotNull @Size(max = MAX_KANJI) List<@NotNull @Size(min = 1, max = 4) String> kanji,
                             String userLevel) {}

    /** withMnemonic bị bỏ qua (luôn false): mẹo nhớ Gemini cần kiểm duyệt nên làm ở gói C4/G2 sau. */
    public record RadicalCards(@NotNull @Size(max = MAX_KANJI) List<@NotNull @Size(min = 1, max = 4) String> kanji,
                               Boolean withMnemonic) {}
}
