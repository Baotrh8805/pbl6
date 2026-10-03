package com.pbl6.flashcard.dto.deck;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Request/response của lượt làm quiz (/api/quiz-attempts). Không record nào chứa đáp án đúng của câu chưa được phép xem. */
public final class QuizAttemptDtos {

    private QuizAttemptDtos() {}

    /** mode: practice = làm từng câu (thấy đáp án ngay), exam = làm hết bài rồi nộp. */
    public record CreateRequest(
            @NotBlank String deckId,
            @Min(1) @Max(50) int size,
            @NotBlank @Pattern(regexp = "practice|exam") String mode
    ) {}

    /** option rỗng/null: practice = bỏ qua câu (tính sai), exam = xoá đáp án đã chọn. */
    public record AnswerRequest(@Size(max = 2000) String option) {}

    /** answers: bản đầy đủ phía client, để bù chỗ tự lưu chưa kịp tới server (chỉ dùng ở chế độ thi). */
    public record SubmitRequest(@Size(max = 100) Map<String, String> answers) {}

    /** Phản hồi một câu: chỉ xuất hiện khi chế độ cho phép (practice sau khi trả lời) hoặc lượt đã nộp. */
    public record Feedback(boolean correct, String correctAnswer, String explanation) {}

    public record AnswerResponse(Feedback feedback, int answered) {}

    public record QuestionState(String cardId, String term, String reading, List<String> options,
                                String chosen, Feedback feedback) {}

    /**
     * Toàn bộ trạng thái một lượt làm để dựng lại giao diện sau khi tải lại trang.
     * attemptId = null: bộ thẻ chưa có thẻ nào. score/total chỉ có khi finished.
     * expiresAt + serverNow: client tính giờ còn lại theo đồng hồ server, không theo đồng hồ máy.
     * timeLimitSeconds = 0: không giới hạn thời gian (practice).
     */
    public record AttemptState(UUID attemptId, String deckId, String mode, boolean resumed, boolean finished,
                               boolean expired, Integer score, Integer total, int timeLimitSeconds,
                               Instant expiresAt, Instant serverNow, List<QuestionState> questions) {}
}
