package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.dto.deck.QuizOutcomeResponse;
import com.pbl6.flashcard.dto.deck.QuizResultResponse;
import com.pbl6.flashcard.dto.deck.QuizAttemptDtos.*;
import com.pbl6.flashcard.dto.deck.ReviewRequest;
import com.pbl6.flashcard.dto.deck.ReviewResponse;
import com.pbl6.flashcard.security.CustomUserDetails;
import com.pbl6.flashcard.service.QuizAttemptService;
import com.pbl6.flashcard.service.QuizService;
import com.pbl6.flashcard.service.ReviewService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/** Học và kiểm tra: ôn tập SRS, làm quiz, lịch sử làm bài. Bộ thẻ / thẻ nằm ở {@link DeckController}. */
@RestController
@RequestMapping("/api")
@Validated // để @Min/@Max trên tham số query (size của quiz) thực sự chạy
public class StudyController {

    private final ReviewService reviewService;
    private final QuizAttemptService quizService;

    public StudyController(ReviewService reviewService, QuizAttemptService quizService) {
        this.reviewService = reviewService;
        this.quizService = quizService;
    }

    private static Long uid(CustomUserDetails principal) {
        return principal.getUser().getId();
    }

    /** Tiến độ SRS của chính người đang đăng nhập. */
    @GetMapping("/reviews")
    public List<ReviewResponse> myReviews(@AuthenticationPrincipal CustomUserDetails me) {
        return reviewService.reviews(uid(me));
    }

    /** Client chỉ gửi cardId + grade; ngày ôn kế tiếp do server quyết định. */
    @PostMapping("/reviews")
    public ReviewResponse submitReview(@AuthenticationPrincipal CustomUserDetails me, @Valid @RequestBody ReviewRequest body) {
        return reviewService.review(uid(me), body.cardId(), body.grade(), Boolean.TRUE.equals(body.cram()));
    }

    /** Câu hỏi mẫu (xem trước đề), không mở lượt làm bài. */
    @GetMapping("/quizzes/{deckId}/preview")
    public List<QuizService.Question> previewQuiz(@AuthenticationPrincipal CustomUserDetails me,
                                                  @PathVariable String deckId,
                                                  @RequestParam(defaultValue = "2") @Min(1) @Max(5) int size) {
        return quizService.quizPreview(uid(me), deckId, size);
    }

    /**
     * Mở lượt làm quiz (mode practice | exam) hoặc tiếp tục lượt đang mở của bộ thẻ (resumed = true).
     * Response không chứa đáp án đúng.
     */
    @PostMapping("/quiz-attempts")
    public AttemptState createAttempt(@AuthenticationPrincipal CustomUserDetails me,
                                      @Valid @RequestBody CreateRequest body) {
        return quizService.create(uid(me), body.deckId(), body.size(), body.mode());
    }

    /** Lượt đang mở của bộ thẻ (để đề nghị "Tiếp tục"); 204 nếu không có. */
    @GetMapping("/quiz-attempts/open")
    public ResponseEntity<AttemptState> openAttempt(@AuthenticationPrincipal CustomUserDetails me,
                                                    @RequestParam String deckId) {
        return quizService.open(uid(me), deckId).map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    /** Khôi phục một lượt; đã nộp thì kèm đáp án đúng + lời giải để xem lại. */
    @GetMapping("/quiz-attempts/{attemptId}")
    public AttemptState getAttempt(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID attemptId) {
        return quizService.get(uid(me), attemptId);
    }

    /** Lưu đáp án một câu (practice: khoá + trả phản hồi; exam: tự lưu, sửa được tới khi nộp). */
    @PutMapping("/quiz-attempts/{attemptId}/answers/{cardId}")
    public AnswerResponse answer(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID attemptId,
                                 @PathVariable String cardId, @Valid @RequestBody AnswerRequest body) {
        return quizService.answer(uid(me), attemptId, cardId, body.option());
    }

    /** Chấm điểm ở server trên bản chụp đề; nộp lại trả đúng kết quả cũ. */
    @PostMapping("/quiz-attempts/{attemptId}/submit")
    public QuizOutcomeResponse submit(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID attemptId,
                                      @Valid @RequestBody(required = false) SubmitRequest body) {
        return quizService.submit(uid(me), attemptId, body == null ? null : body.answers());
    }

    /** Lịch sử làm bài để hiển thị ở trang cá nhân. */
    @GetMapping("/quiz-results")
    public List<QuizResultResponse> myQuizResults(@AuthenticationPrincipal CustomUserDetails me) {
        return quizService.recentResults(uid(me));
    }

    /** Tổng số bài đã làm (danh sách trên chỉ trả 10 bài gần nhất). */
    @GetMapping("/quiz-results/count")
    public long myQuizResultCount(@AuthenticationPrincipal CustomUserDetails me) {
        return quizService.countResults(uid(me));
    }
}
