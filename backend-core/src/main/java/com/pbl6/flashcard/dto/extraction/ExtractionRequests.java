package com.pbl6.flashcard.dto.extraction;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.UUID;

/** Body JSON của các endpoint /api/extractions/{id}/... */
public final class ExtractionRequests {

    private ExtractionRequests() {}

    /** PUT /text: văn bản đã sửa tay, phân tích lại từ bước ANALYZE. */
    public record TextUpdate(@NotBlank @Size(max = 50_000) String text) {}

    /** PATCH /items: mỗi phần tử sửa một item; trường null = giữ nguyên. level "" = bỏ cấp (null). */
    public record ItemPatch(@NotNull UUID id, Boolean selected,
                            @Size(max = 200) String term,
                            @Size(max = 200) String reading,
                            @Size(max = 1000) String meaningVi,
                            @Size(max = 1000) String meaningEn,
                            @Pattern(regexp = "N[1-5]|") String level) {}

    /** POST /decks: mỗi loại (từ vựng / ngữ pháp) một bộ thẻ; null = không tạo loại đó. */
    public record CreateDecks(@Valid DeckSpec vocab, @Valid DeckSpec grammar) {}

    public record DeckSpec(@NotBlank @Size(max = 200) String title, UUID folderId,
                           @Pattern(regexp = "N[1-5]") String level) {}
}
