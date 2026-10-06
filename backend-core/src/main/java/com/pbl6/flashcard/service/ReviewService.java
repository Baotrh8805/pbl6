package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.deck.ReviewResponse;
import com.pbl6.flashcard.model.Review;
import com.pbl6.flashcard.repository.FlashcardRepository;
import com.pbl6.flashcard.repository.ReviewRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;

/** Ôn tập SRS của người dùng. Thuật toán lên lịch nằm ở {@link SrsService} (hàm thuần, có unit test riêng). */
@Service
public class ReviewService {

    private final ReviewRepository reviewRepository;
    private final FlashcardRepository flashcardRepository;
    private final DeckService deckService;

    public ReviewService(ReviewRepository reviewRepository, FlashcardRepository flashcardRepository,
                         DeckService deckService) {
        this.reviewRepository = reviewRepository;
        this.flashcardRepository = flashcardRepository;
        this.deckService = deckService;
    }

    @Transactional(readOnly = true)
    public List<ReviewResponse> reviews(Long uid) {
        return reviewRepository.findByUserId(uid).stream().map(ReviewResponse::of).toList();
    }

    /** Client chỉ gửi cardId + grade; ngày ôn kế tiếp do server quyết định. */
    @Transactional
    public ReviewResponse review(Long uid, String cardId, String grade, boolean cram) {
        if (!visible(uid, cardId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy thẻ.");
        }
        return apply(uid, cardId, grade, cram ? "cram" : "flip");
    }

    /** Quiz practice trả lời xong thì cập nhật lịch (đúng = good, sai = again). Quiz exam không gọi hàm này. */
    @Transactional
    public void fromQuiz(Long uid, String cardId, boolean correct) {
        // Không ném lỗi: thẻ bị xoá / thu quyền giữa bài thì vẫn phải lưu được đáp án quiz
        if (visible(uid, cardId)) apply(uid, cardId, correct ? "good" : "again", "quiz");
    }

    /** Chỉ ôn được thẻ trong bộ thẻ mình xem được: không dò/ghi vào thẻ trong deck riêng của người khác. */
    private boolean visible(Long uid, String cardId) {
        return flashcardRepository.findById(cardId)
                .map(card -> deckService.canView(uid, card.getDeck())).orElse(false);
    }

    private ReviewResponse apply(Long uid, String cardId, String grade, String source) {
        Instant now = Instant.now();
        reviewRepository.log(uid, cardId, grade, source);
        if ("cram".equals(source)) {
            // Học nhanh chỉ ghi nhật ký: không đổi lịch/ease nên không làm phồng mastery sau một đêm nhồi
            return ReviewResponse.of(reviewRepository.findForUpdate(uid, cardId)
                    .orElseGet(() -> SrsService.newReview(uid, cardId, now)));
        }
        // Tạo-nếu-chưa-có rồi khoá dòng: 2 lần chấm song song không vỡ unique (user_id, card_id)
        Review fresh = SrsService.newReview(uid, cardId, now);
        reviewRepository.insertIfAbsent(uid, cardId, fresh.getReps(), fresh.getIntervalDays(), fresh.getEase(),
                fresh.getDueAt());
        Review review = reviewRepository.findForUpdate(uid, cardId).orElseThrow();
        return ReviewResponse.of(SrsService.schedule(review, grade, now));
    }
}
