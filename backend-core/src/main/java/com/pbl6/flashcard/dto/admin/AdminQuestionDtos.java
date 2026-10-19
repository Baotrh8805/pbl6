package com.pbl6.flashcard.dto.admin;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import com.pbl6.flashcard.model.QuestionFlag;
import com.pbl6.flashcard.model.QuizQuestion;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Admin Panel > Ngân hàng câu hỏi (G3, hợp đồng đợt 2 §1.3). */
public final class AdminQuestionDtos {

    private AdminQuestionDtos() {}

    /** Một dòng của danh sách. options = [] với câu gõ (READING); openFlags = số báo lỗi đang OPEN, flagCount = tổng từng nhận. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Row(UUID id, String deckId, String deckTitle, String cardId, String term, String kind, String prompt,
                      List<String> options, String correct, String status, int flagCount, long openFlags,
                      String generator, Instant updatedAt) {

        public static Row of(QuizQuestion q, String deckTitle, String term, long openFlags) {
            return new Row(q.getId(), q.getDeckId(), deckTitle, q.getCardId(), term, q.getKind(), q.getPrompt(),
                    q.getOptions() == null ? List.of() : q.getOptions(), q.getCorrect(), q.getStatus(), q.getFlagCount(),
                    openFlags, q.getGenerator(), q.getUpdatedAt());
        }
    }

    /** Chi tiết = mọi trường của {@link Row} (cùng cấp trong JSON) + các báo lỗi, mới nhất trước. */
    public record Detail(@JsonUnwrapped Row row, List<Flag> flags) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Flag(Long id, String userEmail, String reason, String detail, String status, Instant createdAt,
                       String resolutionNote) {

        public static Flag of(QuestionFlag f, String userEmail) {
            return new Flag(f.getId(), userEmail, f.getReason(), f.getDetail(), f.getStatus(), f.getCreatedAt(),
                    f.getResolutionNote());
        }
    }

    /**
     * Trường null = giữ nguyên. Câu chọn: options 2..8 phương án khác nhau, correct ∈ options; câu gõ (READING): không có
     * phương án, correct là cách đọc (có thể nhiều cách, ngăn bởi "、"). Kiểm ở service vì phụ thuộc loại câu.
     */
    public record Patch(@Size(max = 500) String prompt, @Size(max = 8) List<@NotNull @Size(max = 500) String> options,
                        @Size(max = 500) String correct) {}

    public record ResolveFlagRequest(@Size(max = 500) String note) {}
}
