package com.pbl6.flashcard.dto.deck;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Request/response của lượt làm quiz (/api/quiz-attempts). Không record nào chứa đáp án đúng của câu chưa được phép xem. */
public final class QuizAttemptDtos {

    private QuizAttemptDtos() {}

    /** Giá trị hợp lệ của questionTypes (hợp đồng đợt 2 §1.2), khớp QuizService.TYPES. */
    public static final String QUESTION_TYPES = "meaning|kanji_lookalike|homophone|reading|conjugation";

    /**
     * mode: practice = làm từng câu (thấy đáp án ngay), exam = làm hết bài rồi nộp.
     * questionTypes: loại câu hỏi, xoay vòng theo đúng thứ tự gửi lên; null / rỗng = ["meaning"] như trước đợt 2.
     */
    public record CreateRequest(
            @NotBlank String deckId,
            @Min(1) @Max(50) int size,
            @NotBlank @Pattern(regexp = "practice|exam") String mode,
            @Size(max = 5) List<@NotNull @Pattern(regexp = QUESTION_TYPES) String> questionTypes
    ) {}

    /**
     * option rỗng/null: practice = bỏ qua câu (tính sai), exam = xoá đáp án đã chọn. Câu gõ (inputMode = typing): chuỗi tự gõ
     * ≤ 100 ký tự (kiểm ở service vì giới hạn chỉ áp cho loại câu này).
     */
    public record AnswerRequest(@Size(max = 2000) String option) {}

    /** answers: bản đầy đủ phía client, để bù chỗ tự lưu chưa kịp tới server (chỉ dùng ở chế độ thi). */
    public record SubmitRequest(@Size(max = 100) Map<String, String> answers) {}

    /**
     * Phản hồi một câu: chỉ xuất hiện khi chế độ cho phép (practice sau khi trả lời) hoặc lượt đã nộp.
     * example: câu ví dụ chứa dạng đúng (câu chia động từ); vắng mặt khi không có.
     */
    public record Feedback(boolean correct, String correctAnswer, String explanation,
                           @JsonInclude(JsonInclude.Include.NON_NULL) String example) {}

    public record AnswerResponse(Feedback feedback, int answered) {}

    /**
     * Một câu của lượt làm. Trường đợt 2: type (meaning | kanji_lookalike | homophone | reading | conjugation), inputMode
     * (choice | typing — typing thì options = []), prompt (câu hỏi hiển thị; vắng = câu nghĩa chỉ hiện từ), questionId (id trong
     * ngân hàng để báo lỗi; vắng = câu không lưu được vào ngân hàng). Câu chưa lộ đáp án mà thuật ngữ / cách đọc chính là đáp án
     * (chọn đúng chữ, gõ cách đọc) thì term = "" / reading = null; lộ đáp án (feedback) thì có đủ.
     */
    public record QuestionState(String cardId, String term, String reading, List<String> options,
                                String chosen, Feedback feedback, String type,
                                @JsonInclude(JsonInclude.Include.NON_NULL) String prompt, String inputMode,
                                @JsonInclude(JsonInclude.Include.NON_NULL) String questionId) {}

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
