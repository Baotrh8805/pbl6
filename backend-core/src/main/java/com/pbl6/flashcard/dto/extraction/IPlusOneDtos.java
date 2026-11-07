package com.pbl6.flashcard.dto.extraction;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

/** Câu ví dụ i+1 (C6, hợp đồng đợt 2 §9): GET /api/extractions/{id}/i-plus-one và POST .../i-plus-one/apply. */
public final class IPlusOneDtos {

    private IPlusOneDtos() {}

    /** Cùng độ dài cột extraction_items.example và MAX_SENTENCE_CHARS của ai-service (câu dài hơn không được khai thác). */
    public static final int MAX_SENTENCE = 500;

    /**
     * Một câu chỉ có đúng một từ người học chưa biết. target = {lemma, surface, reading, level, meaningEn, readingSegments} nguyên văn
     * từ ai-service; itemId = item từ vựng của job trùng từ đích (để "Dùng làm ví dụ"), luôn có mặt, null khi từ đích không nằm trong
     * danh sách đã bóc tách.
     */
    public record Sentence(String sentence, JsonNode target, int unknownCount, int knownCount, int length, double score,
                           UUID itemId) {}

    /** knownCount = số từ "đã biết" lấy từ thẻ của người học (reps ≥ 2 hoặc interval ≥ 7) gửi kèm. */
    public record Response(List<Sentence> items, int knownCount) {}

    public record ApplyRequest(@NotNull UUID itemId, @NotBlank @Size(max = MAX_SENTENCE) String sentence) {}
}
