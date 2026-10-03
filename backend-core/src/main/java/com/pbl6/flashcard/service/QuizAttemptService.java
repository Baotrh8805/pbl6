package com.pbl6.flashcard.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pbl6.flashcard.dto.deck.QuizAttemptDtos.AnswerResponse;
import com.pbl6.flashcard.dto.deck.QuizAttemptDtos.AttemptState;
import com.pbl6.flashcard.dto.deck.QuizAttemptDtos.Feedback;
import com.pbl6.flashcard.dto.deck.QuizAttemptDtos.QuestionState;
import com.pbl6.flashcard.dto.deck.QuizOutcomeResponse;
import com.pbl6.flashcard.dto.deck.QuizResultResponse;
import com.pbl6.flashcard.model.Deck;
import com.pbl6.flashcard.model.QuizAttempt;
import com.pbl6.flashcard.model.QuizResult;
import com.pbl6.flashcard.repository.QuizAttemptRepository;
import com.pbl6.flashcard.repository.QuizResultRepository;
import com.pbl6.flashcard.security.QuizRateLimiter;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Lượt làm quiz do server giữ: phát đề (bản chụp có đáp án nằm ở DB), nhận đáp án từng câu, giữ hạn giờ, chấm điểm
 * và ghi kết quả. Việc sinh đề và chấm từng câu nằm ở {@link QuizService} (hàm thuần, có unit test riêng).
 * <p>
 * Hai chế độ: practice (làm từng câu: trả lời xong thấy đáp án + lời giải, câu đã trả lời bị khoá) và exam (làm hết
 * bài: đáp án sửa được tới khi nộp, đáp án đúng chỉ lộ sau khi nộp). Mọi thao tác ghi đều chạy dưới khoá hàng của lượt
 * làm nên tự lưu / nộp / hết giờ song song không ghi đè hay chấm hai lần.
 */
@Service
public class QuizAttemptService {

    /** Lượt practice không giới hạn giờ nhưng tự đóng sau chừng này để không tồn đọng. */
    static final int PRACTICE_TTL_SECONDS = 24 * 3600;

    private static final TypeReference<List<QuizService.Item>> ITEMS = new TypeReference<>() {};
    private static final TypeReference<Map<String, String>> ANSWERS = new TypeReference<>() {};

    private final DeckService deckService;
    private final QuizAttemptRepository attemptRepository;
    private final QuizResultRepository quizResultRepository;
    private final QuizRateLimiter rateLimiter;
    private final ObjectMapper json;
    private final Random random = new Random();

    public QuizAttemptService(DeckService deckService, QuizAttemptRepository attemptRepository,
                              QuizResultRepository quizResultRepository, QuizRateLimiter rateLimiter,
                              ObjectMapper json) {
        this.deckService = deckService;
        this.attemptRepository = attemptRepository;
        this.quizResultRepository = quizResultRepository;
        this.rateLimiter = rateLimiter;
        this.json = json;
    }

    // ---------- tạo / khôi phục ----------

    /**
     * Phát đề và mở lượt làm. Đã có lượt đang mở cho bộ thẻ này thì trả lại lượt đó (resumed = true), không tạo
     * lượt mới để không chọn được lượt có lợi. Bộ thẻ trống: attemptId = null.
     */
    @Transactional
    public AttemptState create(Long uid, String deckId, int size, String mode) {
        Deck deck = deckService.readable(uid, deckId);
        Instant now = Instant.now();
        closeExpiredAttempts(uid, now);

        Optional<QuizAttempt> open = attemptRepository.findOpen(uid, deckId, now);
        if (open.isPresent()) return state(open.get(), now, true);

        rateLimiter.checkCreate(uid);
        List<QuizService.Item> items = QuizService.buildItems(deck.getCards(), size, random);
        if (items.isEmpty()) {
            return new AttemptState(null, deckId, mode, false, false, false, null, null, 0, null, now, List.of());
        }
        boolean practice = QuizAttempt.PRACTICE.equals(mode);
        int limit = practice ? 0 : items.size() * QuizService.SECONDS_PER_QUESTION;
        Instant expiresAt = practice ? now.plusSeconds(PRACTICE_TTL_SECONDS)
                : now.plusSeconds(limit + QuizService.GRACE_SECONDS);
        QuizAttempt attempt = new QuizAttempt(uid, deckId, mode,
                items.stream().map(QuizService.Item::cardId).toList(), write(items), now, expiresAt);
        try {
            attemptRepository.saveAndFlush(attempt);
        } catch (DataIntegrityViolationException e) {
            // 2 yêu cầu "Bắt đầu" song song: unique index chỉ cho một lượt mở
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Đã có bài đang làm, vui lòng thử lại.");
        }
        return state(attempt, now, false);
    }

    /** Lượt đang mở của bộ thẻ (để trang quiz đề nghị "Tiếp tục"); empty nếu không có. */
    @Transactional
    public Optional<AttemptState> open(Long uid, String deckId) {
        Instant now = Instant.now();
        closeExpiredAttempts(uid, now);
        return attemptRepository.findOpen(uid, deckId, now).map(a -> state(a, now, true));
    }

    /** Trạng thái một lượt (kể cả đã nộp -> kèm đáp án đúng + lời giải của mọi câu để xem lại). */
    @Transactional
    public AttemptState get(Long uid, UUID attemptId) {
        Instant now = Instant.now();
        closeExpiredAttempts(uid, now);
        QuizAttempt attempt = attemptRepository.findById(attemptId)
                .filter(a -> a.getUserId().equals(uid))
                .orElseThrow(QuizAttemptService::notFound);
        return state(attempt, now, false);
    }

    /** Vài câu mẫu để xem trước bộ đề: không mở lượt làm, không tính điểm. */
    @Transactional(readOnly = true)
    public List<QuizService.Question> quizPreview(Long uid, String deckId, int size) {
        return QuizService.buildQuiz(deckService.readable(uid, deckId).getCards(), size, random);
    }

    // ---------- trả lời ----------

    /**
     * Lưu đáp án một câu (idempotent theo câu). practice: lưu lần đầu rồi khoá, trả phản hồi; gọi lại trả đúng phản
     * hồi đã có. exam: ghi đè được tới khi nộp, không trả phản hồi.
     */
    @Transactional
    public AnswerResponse answer(Long uid, UUID attemptId, String cardId, String option) {
        rateLimiter.checkAnswer(uid);
        QuizAttempt attempt = lock(uid, attemptId);
        if (attempt.getSubmittedAt() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Bài làm này đã được nộp.");
        }
        if (Instant.now().isAfter(attempt.getExpiresAt())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Đã hết thời gian làm bài.");
        }
        QuizService.Item item = items(attempt).stream().filter(i -> i.cardId().equals(cardId)).findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Câu hỏi không thuộc bài làm này."));
        Map<String, String> answers = answers(attempt);
        boolean blank = option == null || option.isBlank();

        if (attempt.isPractice()) {
            if (answers.containsKey(cardId)) return new AnswerResponse(feedback(item, answers.get(cardId)), answers.size());
            if (!blank && !item.options().contains(option)) throw badOption();
            String chosen = blank ? "" : option;
            answers.put(cardId, chosen);
            attempt.setAnswers(write(answers));
            return new AnswerResponse(feedback(item, chosen), answers.size());
        }

        if (blank) {
            answers.remove(cardId);
        } else {
            if (!item.options().contains(option)) throw badOption();
            answers.put(cardId, option);
        }
        attempt.setAnswers(write(answers));
        return new AnswerResponse(null, answers.size());
    }

    // ---------- nộp ----------

    /**
     * Chốt và chấm trên bản chụp đề. Gọi lại sau khi đã nộp trả đúng kết quả cũ (client mất response vẫn nộp lại được).
     * Quá hạn: các đáp án đã lưu trước hạn vẫn được chấm, đáp án gửi kèm lúc này bị bỏ (expired = true).
     */
    @Transactional
    public QuizOutcomeResponse submit(Long uid, UUID attemptId, Map<String, String> clientAnswers) {
        QuizAttempt attempt = lock(uid, attemptId);
        if (attempt.getSubmittedAt() != null) return outcome(attempt);

        Instant now = Instant.now();
        if (!attempt.isPractice() && clientAnswers != null && !now.isAfter(attempt.getExpiresAt())) {
            mergeClientAnswers(attempt, clientAnswers);
        }
        close(attempt, now);
        return outcome(attempt);
    }

    /** Đáp án client gửi kèm khi nộp ghi đè bản đã lưu; câu lạ / lựa chọn không có trong đề bị bỏ (tính là bỏ trống). */
    private void mergeClientAnswers(QuizAttempt attempt, Map<String, String> clientAnswers) {
        Map<String, String> answers = answers(attempt);
        for (QuizService.Item item : items(attempt)) {
            if (!clientAnswers.containsKey(item.cardId())) continue;
            String option = clientAnswers.get(item.cardId());
            if (option != null && item.options().contains(option)) answers.put(item.cardId(), option);
            else answers.remove(item.cardId());
        }
        attempt.setAnswers(write(answers));
    }

    // ---------- đóng lượt / kết quả ----------

    /** Lượt quá hạn chưa nộp (đóng tab, bỏ dở) -> chấm các đáp án đã lưu, để không chọn được lượt có lợi. */
    private void closeExpiredAttempts(Long uid, Instant now) {
        for (QuizAttempt attempt : attemptRepository.findExpiredOpen(uid, now)) close(attempt, now);
    }

    private void close(QuizAttempt attempt, Instant now) {
        Map<String, String> answers = answers(attempt);
        attempt.setSubmittedAt(now);
        // Luyện tập bỏ dở mà chưa trả lời câu nào: không ghi kết quả 0 điểm làm nhiễu lịch sử
        if (attempt.isPractice() && answers.isEmpty()) return;
        QuizService.Graded graded = grade(attempt, answers);
        quizResultRepository.save(new QuizResult(attempt.getUserId(), attempt.getDeckId(), graded.score(),
                graded.total(), attempt.getMode(), attempt.getId()));
    }

    private QuizOutcomeResponse outcome(QuizAttempt attempt) {
        List<QuizService.Item> items = items(attempt);
        QuizService.Graded graded = grade(attempt, answers(attempt));
        Map<String, String> correct = items.stream()
                .collect(Collectors.toMap(QuizService.Item::cardId, QuizService.Item::correct));
        Map<String, String> wrong = graded.wrongCardIds().stream()
                .collect(Collectors.toMap(id -> id, correct::get));
        return new QuizOutcomeResponse(graded.score(), graded.total(), wrong, isExpired(attempt));
    }

    private QuizService.Graded grade(QuizAttempt attempt, Map<String, String> answers) {
        Map<String, String> correct = items(attempt).stream()
                .collect(Collectors.toMap(QuizService.Item::cardId, QuizService.Item::correct));
        return QuizService.grade(correct, attempt.getCardIds(), answers);
    }

    private static boolean isExpired(QuizAttempt attempt) {
        return attempt.getSubmittedAt() != null && attempt.getSubmittedAt().isAfter(attempt.getExpiresAt());
    }

    // ---------- dựng response ----------

    private AttemptState state(QuizAttempt attempt, Instant now, boolean resumed) {
        List<QuizService.Item> items = items(attempt);
        Map<String, String> answers = answers(attempt);
        boolean finished = attempt.getSubmittedAt() != null;
        boolean practice = attempt.isPractice();

        List<QuestionState> questions = items.stream().map(item -> {
            String chosen = answers.get(item.cardId());
            // Đáp án đúng chỉ lộ khi: practice và câu này đã trả lời, hoặc cả lượt đã nộp
            Feedback fb = finished || (practice && chosen != null) ? feedback(item, chosen) : null;
            return new QuestionState(item.cardId(), item.term(), item.reading(), item.options(), chosen, fb);
        }).toList();

        Integer score = null;
        Integer total = null;
        if (finished) {
            QuizService.Graded graded = grade(attempt, answers);
            score = graded.score();
            total = graded.total();
        }
        int limit = practice ? 0 : items.size() * QuizService.SECONDS_PER_QUESTION;
        return new AttemptState(attempt.getId(), attempt.getDeckId(), attempt.getMode(), resumed, finished,
                isExpired(attempt), score, total, limit, attempt.getExpiresAt(), now, questions);
    }

    private static Feedback feedback(QuizService.Item item, String chosen) {
        return new Feedback(item.correct().equals(chosen), item.correct(), item.explanation());
    }

    @Transactional
    public List<QuizResultResponse> recentResults(Long uid) {
        closeExpiredAttempts(uid, Instant.now());
        return quizResultRepository.findRecent(uid, PageRequest.of(0, 10));
    }

    @Transactional
    public long countResults(Long uid) {
        closeExpiredAttempts(uid, Instant.now());
        return quizResultRepository.countByUserId(uid);
    }

    // ---------- tiện ích ----------

    /** Khoá lượt làm; lượt không phải của người gọi = 404 (không lộ lượt của người khác). */
    private QuizAttempt lock(Long uid, UUID attemptId) {
        return attemptRepository.findForUpdate(attemptId)
                .filter(a -> a.getUserId().equals(uid))
                .orElseThrow(QuizAttemptService::notFound);
    }

    private static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy lượt làm bài.");
    }

    private static ResponseStatusException badOption() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Lựa chọn không thuộc câu hỏi này.");
    }

    private List<QuizService.Item> items(QuizAttempt attempt) {
        try {
            return json.readValue(attempt.getQuestions(), ITEMS);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Bản chụp đề hỏng: " + attempt.getId(), e);
        }
    }

    private Map<String, String> answers(QuizAttempt attempt) {
        try {
            return new HashMap<>(json.readValue(attempt.getAnswers(), ANSWERS));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Đáp án lưu hỏng: " + attempt.getId(), e);
        }
    }

    private String write(Object value) {
        try {
            return json.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
