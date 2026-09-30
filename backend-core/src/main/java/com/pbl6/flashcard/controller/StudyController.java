package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.dto.deck.CloneRequest;
import com.pbl6.flashcard.dto.deck.DeckRequest;
import com.pbl6.flashcard.dto.deck.DeckRequest.Card;
import com.pbl6.flashcard.dto.deck.DeckResponse;
import com.pbl6.flashcard.dto.deck.DeckResponse.CardResponse;
import com.pbl6.flashcard.dto.deck.QuizSubmission;
import com.pbl6.flashcard.dto.deck.ReviewRequest;
import com.pbl6.flashcard.dto.deck.ShareRequest;
import com.pbl6.flashcard.repository.DeckShareRepository;
import com.pbl6.flashcard.repository.QuizResultRepository;
import com.pbl6.flashcard.model.Review;
import com.pbl6.flashcard.security.CustomUserDetails;
import com.pbl6.flashcard.service.DeckService;
import com.pbl6.flashcard.service.QuizService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/** HTTP <-> DeckService. User id lấy thẳng từ principal (JwtAuthenticationFilter đã nạp), không query lại. */
@RestController
@RequestMapping("/api")
@Validated // để @Valid trên phần tử List<@Valid Card> (endpoint batch) thực sự chạy
public class StudyController {

    private final DeckService deckService;

    public StudyController(DeckService deckService) {
        this.deckService = deckService;
    }

    private static Long uid(CustomUserDetails principal) {
        return principal.getUser().getId();
    }

    /** folderId != null: chỉ lấy bộ thẻ trong thư mục đó (đã lọc theo quyền sở hữu). */
    @GetMapping("/decks")
    public List<DeckResponse> listDecks(@AuthenticationPrincipal CustomUserDetails me,
                                        @RequestParam(required = false) UUID folderId) {
        return deckService.list(uid(me), folderId);
    }

    @GetMapping("/decks/{deckId}")
    public DeckResponse getDeck(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String deckId) {
        return deckService.get(uid(me), deckId);
    }

    @PostMapping("/decks")
    public ResponseEntity<DeckResponse> createDeck(@AuthenticationPrincipal CustomUserDetails me,
                                                   @Valid @RequestBody DeckRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(deckService.create(uid(me), req));
    }

    @PutMapping("/decks/{deckId}")
    public DeckResponse updateDeck(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String deckId,
                                   @Valid @RequestBody DeckRequest req) {
        return deckService.update(uid(me), deckId, req);
    }

    @DeleteMapping("/decks/{deckId}")
    public ResponseEntity<Void> deleteDeck(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String deckId) {
        deckService.delete(uid(me), deckId);
        return ResponseEntity.noContent().build();
    }

    /** Lưu bản sao bộ thẻ (Thư viện/được chia sẻ) về tài khoản. Body tuỳ chọn: {"folderId": "..."}. */
    @PostMapping("/decks/{deckId}/clone")
    public ResponseEntity<DeckResponse> cloneDeck(@AuthenticationPrincipal CustomUserDetails me,
                                                  @PathVariable String deckId,
                                                  @RequestBody(required = false) CloneRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(deckService.cloneDeck(uid(me), deckId, req != null ? req.folderId() : null));
    }

    @GetMapping("/decks/{deckId}/shares")
    public List<DeckShareRepository.Member> shares(@AuthenticationPrincipal CustomUserDetails me,
                                                   @PathVariable String deckId) {
        return deckService.shares(uid(me), deckId);
    }

    /** Thêm hoặc đổi quyền người được chia sẻ; trả danh sách sau khi đổi. */
    @PutMapping("/decks/{deckId}/shares")
    public List<DeckShareRepository.Member> share(@AuthenticationPrincipal CustomUserDetails me,
                                                  @PathVariable String deckId, @Valid @RequestBody ShareRequest req) {
        return deckService.share(uid(me), deckId, req);
    }

    @DeleteMapping("/decks/{deckId}/shares/{userId}")
    public ResponseEntity<Void> unshare(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String deckId,
                                        @PathVariable Long userId) {
        deckService.unshare(uid(me), deckId, userId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/decks/{deckId}/cards")
    public ResponseEntity<CardResponse> addCard(@AuthenticationPrincipal CustomUserDetails me,
                                                @PathVariable String deckId, @Valid @RequestBody Card req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(deckService.addCards(uid(me), deckId, List.of(req)).get(0));
    }

    @PostMapping("/decks/{deckId}/cards/batch")
    public ResponseEntity<List<CardResponse>> addCardsBatch(@AuthenticationPrincipal CustomUserDetails me,
                                                            @PathVariable String deckId,
                                                            @RequestBody @Size(max = 1000) List<@Valid Card> reqList) {
        return ResponseEntity.status(HttpStatus.CREATED).body(deckService.addCards(uid(me), deckId, reqList));
    }

    @PutMapping("/decks/{deckId}/cards/{cardId}")
    public CardResponse updateCard(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String deckId,
                                   @PathVariable String cardId, @Valid @RequestBody Card req) {
        return deckService.updateCard(uid(me), deckId, cardId, req);
    }

    @DeleteMapping("/decks/{deckId}/cards/{cardId}")
    public ResponseEntity<Void> deleteCard(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String deckId,
                                           @PathVariable String cardId) {
        deckService.deleteCard(uid(me), deckId, cardId);
        return ResponseEntity.noContent().build();
    }

    /** Tiến độ SRS của chính người đang đăng nhập. */
    @GetMapping("/reviews")
    public List<Review> myReviews(@AuthenticationPrincipal CustomUserDetails me) {
        return deckService.reviews(uid(me));
    }

    /** Client chỉ gửi cardId + grade; ngày ôn kế tiếp do server quyết định. */
    @PostMapping("/reviews")
    public Review submitReview(@AuthenticationPrincipal CustomUserDetails me, @Valid @RequestBody ReviewRequest body) {
        return deckService.review(uid(me), body.cardId(), body.grade());
    }

    /** Phát đề trắc nghiệm + mở lượt làm có hạn giờ; response không chứa đáp án đúng. */
    @GetMapping("/quizzes/{deckId}")
    public QuizService.Paper getQuiz(@AuthenticationPrincipal CustomUserDetails me,
                                     @PathVariable String deckId,
                                     @RequestParam(defaultValue = "10") @Min(1) @Max(50) int size) {
        return deckService.quiz(uid(me), deckId, size);
    }

    /** Câu hỏi mẫu (xem trước đề), không mở lượt làm bài. */
    @GetMapping("/quizzes/{deckId}/preview")
    public List<QuizService.Question> previewQuiz(@AuthenticationPrincipal CustomUserDetails me,
                                                  @PathVariable String deckId,
                                                  @RequestParam(defaultValue = "2") @Min(1) @Max(5) int size) {
        return deckService.quizPreview(uid(me), deckId, size);
    }

    /** Chấm điểm ở server trên đúng các câu đã phát cho lượt làm; mỗi lượt nộp một lần. */
    @PostMapping("/quizzes/{deckId}")
    public DeckService.QuizOutcome submitQuiz(@AuthenticationPrincipal CustomUserDetails me,
                                              @PathVariable String deckId,
                                              @Valid @RequestBody QuizSubmission body) {
        return deckService.submitQuiz(uid(me), deckId, body.attemptId(), body.answers());
    }

    /** Lịch sử làm bài để hiển thị ở trang cá nhân. */
    @GetMapping("/quiz-results")
    public List<QuizResultRepository.View> myQuizResults(@AuthenticationPrincipal CustomUserDetails me) {
        return deckService.recentResults(uid(me));
    }

    /** Tổng số bài đã làm (danh sách trên chỉ trả 10 bài gần nhất). */
    @GetMapping("/quiz-results/count")
    public long myQuizResultCount(@AuthenticationPrincipal CustomUserDetails me) {
        return deckService.countResults(uid(me));
    }
}
