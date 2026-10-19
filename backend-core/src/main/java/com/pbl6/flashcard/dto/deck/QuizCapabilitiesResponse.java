package com.pbl6.flashcard.dto.deck;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * GET /api/decks/{id}/quiz-capabilities: số thẻ của bộ ra được câu hỏi từng loại (hợp đồng đợt 2 §1.2). Frontend tắt loại có
 * 0 thẻ trên màn chọn loại câu hỏi. Quy tắc đếm: {@link com.pbl6.flashcard.service.QuizCapabilities}.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record QuizCapabilitiesResponse(int meaning, int kanjiLookalike, int homophone, int reading, int conjugation) {}
