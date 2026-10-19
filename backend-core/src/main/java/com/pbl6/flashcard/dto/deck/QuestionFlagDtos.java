package com.pbl6.flashcard.dto.deck;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Người học báo lỗi một câu hỏi quiz: POST /api/quiz-questions/{questionId}/flags (hợp đồng đợt 2 §1.2). */
public final class QuestionFlagDtos {

    private QuestionFlagDtos() {}

    public enum Reason { WRONG_ANSWER, BAD_DISTRACTOR, TYPO, OTHER }

    /** detail bắt buộc khi reason = OTHER (kiểm ở service, như báo cáo bộ thẻ). */
    public record Request(@NotNull Reason reason, @Size(max = 500) String detail) {}

    /** 201: id báo lỗi + trạng thái (OPEN). */
    public record Created(Long id, String status) {}
}
