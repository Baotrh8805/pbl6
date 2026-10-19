package com.pbl6.flashcard.dto.deck;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * POST /api/decks/{id}/distractors (hợp đồng đợt 2 §1.2): updated = số thẻ đã ghi flashcards.distractors (kể cả thẻ không tìm
 * được ứng viên nào: ghi hai danh sách rỗng), withLookalike / withHomophone = trong số đó, bao nhiêu thẻ có ≥ 1 ứng viên.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record DistractorsResponse(int updated, int withLookalike, int withHomophone) {}
