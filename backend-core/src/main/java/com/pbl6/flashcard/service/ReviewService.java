package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.deck.ReviewResponse;
import com.pbl6.flashcard.model.Review;
import com.pbl6.flashcard.repository.FlashcardRepository;
import com.pbl6.flashcard.repository.LearningPathRepository;
import com.pbl6.flashcard.repository.ReviewRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Ôn tập SRS của người dùng. Thuật toán lên lịch nằm ở {@link SrsService} (hàm thuần, có unit test riêng). */
@Service
public class ReviewService {

    private final ReviewRepository reviewRepository;
    private final FlashcardRepository flashcardRepository;
    private final DeckService deckService;
    private final LearningPathRepository paths;

    public ReviewService(ReviewRepository reviewRepository, FlashcardRepository flashcardRepository,
                         DeckService deckService, LearningPathRepository paths) {
        this.reviewRepository = reviewRepository;
        this.flashcardRepository = flashcardRepository;
        this.deckService = deckService;
        this.paths = paths;
    }

    @Transactional(readOnly = true)
    public List<ReviewResponse> reviews(Long uid) {
        return reviewRepository.findByUserId(uid).stream().map(ReviewResponse::of).toList();
    }

    /** Client chỉ gửi cardId + grade; ngày ôn kế tiếp do server quyết định. */
    @Transactional
    public ReviewResponse review(Long uid, String cardId, String grade, boolean cram) {
        return review(uid, cardId, grade, cram, null, null);
    }

    /**
     * E1 (V20): reactionMs (0–600000, client đo từ lúc hiện thẻ tới lúc chấm) và pathId (lộ trình đang học) ghi vào review_logs
     * cho "ma sát trí nhớ" và phân tích hiệu quả lộ trình — tín hiệu phụ, KHÔNG đổi thuật toán SRS (spec §7). Cả phiên cram cũng
     * ghi. pathId không phải lộ trình của người dùng (đã xoá, tab cũ) → ghi NULL chứ không chặn lượt chấm (FK path_id sẽ vỡ 500 nếu
     * để lọt, và việc học không nên hỏng vì một thẻ gắn nhầm).
     */
    @Transactional
    public ReviewResponse review(Long uid, String cardId, String grade, boolean cram, Integer reactionMs, UUID pathId) {
        if (!visible(uid, cardId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy thẻ.");
        }
        UUID owned = pathId != null && paths.existsByIdAndUserId(pathId, uid) ? pathId : null;
        return apply(uid, cardId, grade, cram ? "cram" : "flip", reactionMs, owned);
    }

    /** Quiz practice trả lời xong thì cập nhật lịch (đúng = good, sai = again). Quiz exam không gọi hàm này. */
    @Transactional
    public void fromQuiz(Long uid, String cardId, boolean correct) {
        // Không ném lỗi: thẻ bị xoá / thu quyền giữa bài thì vẫn phải lưu được đáp án quiz
        if (visible(uid, cardId)) apply(uid, cardId, correct ? "good" : "again", "quiz", null, null);
    }

    /** Chỉ ôn được thẻ trong bộ thẻ mình xem được: không dò/ghi vào thẻ trong deck riêng của người khác. */
    private boolean visible(Long uid, String cardId) {
        return flashcardRepository.findById(cardId)
                .map(card -> deckService.canView(uid, card.getDeck())).orElse(false);
    }

    /** Cửa sổ hoàn tác (spec 25/10 §3.8): lâu hơn thì lượt chấm đã "chốt". */
    public static final Duration UNDO_WINDOW = Duration.ofMinutes(30);

    /**
     * Hoàn tác lượt chấm mới nhất (lật / cram) của thẻ: ghi lại lịch cũ lưu trong log (hoặc xoá dòng reviews nếu đó là lượt đầu
     * tiên), rồi xoá log để heatmap / chuỗi ngày không đếm lượt đã bỏ. Gọi nhiều lần lùi từng bước. 409 khi không có gì để hoàn
     * tác: không có log, log từ quiz, log trước V31 (prev_exists NULL) hoặc quá {@link #UNDO_WINDOW}. Mọi truy vấn lọc theo uid
     * nên không chạm được lượt của người khác (cũng 409, không lộ thẻ có tồn tại hay không).
     */
    @Transactional
    public void undo(Long uid, String cardId) {
        // Khoá dòng reviews trước rồi mới tới log: cùng thứ tự với apply() để chấm + hoàn tác song song không deadlock
        reviewRepository.findForUpdate(uid, cardId);
        ReviewRepository.LatestLog last = reviewRepository
                .findLatestLogForUpdate(uid, cardId, UNDO_WINDOW.toSeconds())
                .filter(l -> !"quiz".equals(l.getSource()) && l.getPrevExists() != null && l.getFresh())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Không hoàn tác được lượt chấm này."));
        if ("flip".equals(last.getSource())) {
            if (last.getPrevExists()) reviewRepository.restoreFromLog(last.getId());
            else reviewRepository.deleteOne(uid, cardId);
        }
        reviewRepository.deleteLog(last.getId());
    }

    private ReviewResponse apply(Long uid, String cardId, String grade, String source, Integer reactionMs, UUID pathId) {
        // micro giây = timestamptz: dueAt (= now + n ngày) trả trong response đúng bằng bản GET /api/reviews đọc lại
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        if ("cram".equals(source)) {
            // Học nhanh chỉ ghi nhật ký: không đổi lịch/ease nên không làm phồng mastery sau một đêm nhồi
            Optional<Review> existing = reviewRepository.findForUpdate(uid, cardId);
            reviewRepository.log(uid, cardId, grade, source, reactionMs, pathId, existing.isPresent(), null, null, null, null);
            return ReviewResponse.of(existing.orElseGet(() -> SrsService.newReview(uid, cardId, now)));
        }
        // Tạo-nếu-chưa-có rồi khoá dòng: 2 lần chấm song song không vỡ unique (user_id, card_id)
        Review fresh = SrsService.newReview(uid, cardId, now);
        boolean created = reviewRepository.insertIfAbsent(uid, cardId, fresh.getReps(), fresh.getIntervalDays(),
                fresh.getEase(), fresh.getDueAt()) == 1;
        Review review = reviewRepository.findForUpdate(uid, cardId).orElseThrow();
        // Chụp lịch NGAY TRƯỚC khi chấm (V31) để hoàn tác; quiz không hoàn tác được nên để NULL
        if ("quiz".equals(source)) {
            reviewRepository.log(uid, cardId, grade, source, reactionMs, pathId, null, null, null, null, null);
        } else if (created) {
            reviewRepository.log(uid, cardId, grade, source, reactionMs, pathId, false, null, null, null, null);
        } else {
            reviewRepository.log(uid, cardId, grade, source, reactionMs, pathId, true, review.getReps(),
                    review.getIntervalDays(), review.getEase(), review.getDueAt());
        }
        return ReviewResponse.of(SrsService.schedule(review, grade, now));
    }
}
