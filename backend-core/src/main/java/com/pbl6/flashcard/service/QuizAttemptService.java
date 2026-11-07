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
import com.pbl6.flashcard.model.Flashcard;
import com.pbl6.flashcard.model.QuizAttempt;
import com.pbl6.flashcard.model.QuizResult;
import com.pbl6.flashcard.repository.QuizAttemptRepository;
import com.pbl6.flashcard.repository.QuizResultRepository;
import com.pbl6.flashcard.security.QuizRateLimiter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Random;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Lượt làm quiz do server giữ: phát đề (bản chụp có đáp án nằm ở DB), nhận đáp án từng câu, giữ hạn giờ, chấm điểm
 * và ghi kết quả. Việc sinh đề và chấm từng câu nằm ở {@link QuizService} (hàm thuần, có unit test riêng); ngân hàng câu hỏi
 * (đọc / ghi quiz_questions khi phát đề) ở {@link QuestionBankService}.
 * <p>
 * Hai chế độ: practice (làm từng câu: trả lời xong thấy đáp án + lời giải, câu đã trả lời bị khoá) và exam (làm hết
 * bài: đáp án sửa được tới khi nộp, đáp án đúng chỉ lộ sau khi nộp). Mọi thao tác ghi đều chạy dưới khoá hàng của lượt
 * làm nên tự lưu / nộp / hết giờ song song không ghi đè hay chấm hai lần.
 */
@Service
public class QuizAttemptService {

    private static final Logger log = LoggerFactory.getLogger(QuizAttemptService.class);

    /** Lượt practice không giới hạn giờ nhưng tự đóng sau chừng này để không tồn đọng. */
    static final int PRACTICE_TTL_SECONDS = 24 * 3600;
    /**
     * Số động từ tối đa gửi ai-service cho một lượt: đề ≤ 50 câu nên 100 ứng viên là dư (một số bị ai-service loại vì không
     * phải động từ), và vừa một lô của ai-service (QuizAiClient.MAX_CONJUGATION_VERBS = 200) -> đúng một lần gọi.
     */
    static final int MAX_CONJUGATION_VERBS = 100;

    private static final TypeReference<List<QuizService.Item>> ITEMS = new TypeReference<>() {};
    private static final TypeReference<Map<String, String>> ANSWERS = new TypeReference<>() {};

    private final DeckService deckService;
    private final QuizAttemptRepository attemptRepository;
    private final QuizResultRepository quizResultRepository;
    private final QuizRateLimiter rateLimiter;
    private final ReviewService reviewService;
    private final ObjectMapper json;
    private final ApplicationEventPublisher events;
    private final QuizAiClient quizAi;
    private final QuestionBankService bank;
    /** Phát đề: transaction ngắn tự quản (xem {@link #create(Long, String, int, String, List)}). */
    private final TransactionTemplate tx;
    private final TransactionTemplate readTx;
    private final Random random = new Random();

    public QuizAttemptService(DeckService deckService, QuizAttemptRepository attemptRepository,
                              QuizResultRepository quizResultRepository, QuizRateLimiter rateLimiter,
                              ReviewService reviewService, ObjectMapper json, ApplicationEventPublisher events,
                              QuizAiClient quizAi, QuestionBankService bank, PlatformTransactionManager txManager) {
        this.events = events;
        this.reviewService = reviewService;
        this.deckService = deckService;
        this.attemptRepository = attemptRepository;
        this.quizResultRepository = quizResultRepository;
        this.rateLimiter = rateLimiter;
        this.json = json;
        this.quizAi = quizAi;
        this.bank = bank;
        this.tx = new TransactionTemplate(txManager);
        this.readTx = new TransactionTemplate(txManager);
        this.readTx.setReadOnly(true);
    }

    // ---------- tạo / khôi phục ----------

    /** Như {@link #create(Long, String, int, String, List)} với loại mặc định ["meaning"]. */
    public AttemptState create(Long uid, String deckId, int size, String mode) {
        return create(uid, deckId, size, mode, null);
    }

    /**
     * Bài kiểm tra chương của lộ trình (LearningPathService.chapterQuiz): LUÔN trả một lượt exam, loại câu mặc định ["meaning"],
     * size câu. Lượt đang mở trên bộ thẻ chỉ được nối lại khi nộp nó ra được tính là bài kiểm tra chương — exam có ít nhất size
     * câu, đúng điều kiện LearningPathService.onQuizSubmitted chấm "qua chương" ({@link #countsAsChapterExam}). Trước đây
     * {@link #create} trả lại bất kỳ lượt mở nào: một lượt practice (mở 24 giờ) chiếm chỗ bài kiểm tra, người học làm đúng 10/10
     * mà chương không qua, không có thông báo nào.
     * <p>
     * Unique index V9 chỉ cho MỘT lượt mở trên mỗi (user, bộ thẻ), nên lượt không dùng được (practice, exam ít câu mở từ trang
     * Quiz) bị đóng ngay trước khi ghi lượt mới, cùng giao dịch — phát đề lỗi / 429 thì rollback, lượt cũ vẫn mở. Đóng như hết hạn:
     * chấm các đáp án đã lưu, ghi quiz_results ({@link #closeForChapterExam}); lượt exam đã mở thì luôn có kết quả, nên không bỏ
     * được một lượt bất lợi bằng cách bấm "Kiểm tra chương". Trang lộ trình hỏi người học trước khi nộp thay lượt đang làm dở.
     * Chỉ đóng khi đề mới đủ cỡ: đề mới cũng thiếu câu (nộp ra cũng không tính) thì trả lại lượt đang mở, không đụng gì.
     */
    public AttemptState chapterExam(Long uid, String deckId, int size) {
        List<String> types = QuizService.normalizeTypes(null);
        return tx.execute(status -> openOrCreate(uid, deckId, size, QuizAttempt.EXAM, types, Map.of(), false, size));
    }

    /** Nộp lượt này có được tính là bài kiểm tra chương cỡ chapterSize không (LearningPathService.onQuizSubmitted). */
    static boolean countsAsChapterExam(QuizAttempt attempt, int chapterSize) {
        return QuizAttempt.EXAM.equals(attempt.getMode()) && attempt.getCardIds().size() >= chapterSize;
    }

    /**
     * Phát đề và mở lượt làm. Đã có lượt đang mở cho bộ thẻ này thì trả lại lượt đó (resumed = true, giữ nguyên chế độ và loại
     * câu), không tạo lượt mới để không chọn được lượt có lợi. Bộ thẻ trống: attemptId = null. Bài kiểm tra chương của lộ trình
     * không đi đường này mà qua {@link #chapterExam} (không nhận lại lượt practice).
     * <p>
     * questionTypes (hợp đồng đợt 2 §1.2): null / rỗng = ["meaning"]. Có "conjugation" thì câu chia động từ do ai-service sinh
     * TRƯỚC, ngoài transaction (như DeckService.generateDistractors): (1) transaction đọc kiểm quyền + lấy động từ, (2) gọi
     * ai-service — không giữ kết nối DB / khoá phát đề trong lúc chờ tới 30 giây, ai-service lỗi / tắt thì lặng lẽ bỏ loại này
     * (thẻ ra loại khác, cuối cùng là meaning), (3) transaction phát đề như cũ. Không @Transactional: gọi từ trong một
     * transaction khác (bài kiểm tra chương) thì các bước nhập chung transaction đó.
     */
    public AttemptState create(Long uid, String deckId, int size, String mode, List<String> questionTypes) {
        List<String> types = QuizService.normalizeTypes(questionTypes);
        Map<String, List<QuizAiClient.ConjugationItem>> conjugations = Map.of();
        boolean rateCounted = false;
        if (types.contains(QuizService.CONJUGATION)) {
            List<VerbCard> verbs = readTx.execute(status -> verbCandidates(uid, deckId));
            if (verbs != null) { // null = đã có lượt mở, bước 3 trả lại lượt đó
                // Đếm lượt tạo trước khi tốn một lần gọi ai-service, bước 3 khỏi đếm lại
                rateLimiter.checkCreate(uid);
                rateCounted = true;
                conjugations = conjugations(verbs);
            }
        }
        Map<String, List<QuizAiClient.ConjugationItem>> conj = conjugations;
        boolean counted = rateCounted;
        return tx.execute(status -> openOrCreate(uid, deckId, size, mode, types, conj, counted, null));
    }

    /**
     * chapterSize null = lượt thường (trả lại mọi lượt đang mở); khác null = bài kiểm tra chương cỡ đó ({@link #chapterExam}):
     * nối lại lượt {@link #countsAsChapterExam}; lượt mở khác bị đóng ngay trước khi ghi lượt mới, trừ khi đề mới cũng thiếu câu.
     */
    private AttemptState openOrCreate(Long uid, String deckId, int size, String mode, List<String> types,
                                      Map<String, List<QuizAiClient.ConjugationItem>> conjugations, boolean rateCounted,
                                      Integer chapterSize) {
        Deck deck = deckService.readable(uid, deckId);
        attemptRepository.lockCreate(Objects.hash(uid, deckId));
        // micro giây = timestamptz: expiresAt (= now + thời gian làm bài) của lượt mới = bản nối lại / GET đọc từ DB
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        closeExpiredAttempts(uid, now);

        // Bài kiểm tra chương có thể phải đóng lượt đang mở -> đọc nó dưới khoá dòng (xem findOpenForUpdate)
        Optional<QuizAttempt> open = chapterSize == null ? attemptRepository.findOpen(uid, deckId, now)
                : attemptRepository.findOpenForUpdate(uid, deckId, now);
        QuizAttempt replaced = null;
        if (open.isPresent()) {
            if (chapterSize == null || countsAsChapterExam(open.get(), chapterSize)) return state(open.get(), now, true);
            replaced = open.get();
        }

        if (!rateCounted && replaced == null) rateLimiter.checkCreate(uid);
        QuizService.Sources sources = new QuizService.Sources(conjugations, bank.load(deckId, types));
        List<QuizService.Built> built = QuizService.build(deck.getCards(), size, random, types, sources);
        if (replaced != null) {
            // Đề mới cũng thiếu câu (bộ ít nghĩa có câu bị admin ẩn, bộ chỉ còn 1 thẻ...): nộp ra cũng không tính cho chương, nên
            // đóng lượt đang làm chẳng được gì — chấm dở một bài kiểm tra / mất lượt luyện tập rồi phát một đề cũng không qua được,
            // lặp lại ở mỗi lần bấm. Trả lại lượt đó như trước khi có chapterExam (không tốn lượt tạo, không ghi ngân hàng câu hỏi).
            if (built.size() < chapterSize) return state(replaced, now, true);
            if (!rateCounted) rateLimiter.checkCreate(uid);
        }
        List<QuizService.Item> items = bank.persist(deckId, built);
        if (items.isEmpty()) {
            // Không phát được đề: lượt đang mở (nếu có) giữ nguyên — đóng nó mà không có lượt mới thay thì chỉ mất bài đang làm
            return new AttemptState(null, deckId, mode, false, false, false, null, null, 0, null, now, List.of());
        }
        if (replaced != null) closeForChapterExam(replaced, now);
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

    /** Thẻ gửi ai-service để sinh câu chia động từ. */
    private record VerbCard(String cardId, String term, String reading) {}

    /**
     * Ứng viên động từ của bộ thẻ ({@link QuizCapabilities#isVerbCandidate}, cùng điều kiện với số đếm quiz-capabilities): pos là
     * động từ, hoặc thẻ từ vựng thiếu pos (thẻ tay) mà kết thúc bằng kana hàng う — hợp đồng cho phép "ai-service xác định được
     * nhóm"; ai-service loại thẻ không phải động từ (not_a_verb). null = đã có lượt mở.
     */
    private List<VerbCard> verbCandidates(Long uid, String deckId) {
        Deck deck = deckService.readable(uid, deckId);
        if (attemptRepository.findOpen(uid, deckId, Instant.now()).isPresent()) return null;
        List<VerbCard> out = new ArrayList<>();
        for (Flashcard c : deck.getCards()) {
            if (QuizCapabilities.isVerbCandidate(c)) out.add(new VerbCard(c.getId(), c.getTerm(), c.getReading()));
        }
        Collections.shuffle(out, random);
        return out.size() > MAX_CONJUGATION_VERBS ? new ArrayList<>(out.subList(0, MAX_CONJUGATION_VERBS)) : out;
    }

    /**
     * Gọi ai-service (một câu mỗi động từ, thể ngẫu nhiên) và gắn câu về thẻ theo thuật ngữ đã gửi. Lỗi bất kỳ -> không có câu
     * chia động từ nào (log cảnh báo), lượt làm vẫn mở được với các loại còn lại.
     */
    private Map<String, List<QuizAiClient.ConjugationItem>> conjugations(List<VerbCard> verbs) {
        if (verbs.isEmpty()) return Map.of();
        QuizAiClient.ConjugationQuiz quiz;
        try {
            quiz = quizAi.conjugationQuiz(verbs.stream().map(v -> new QuizAiClient.Verb(v.term(), v.reading())).toList(),
                    null, 1, random.nextLong());
        } catch (AiServiceClient.AiServiceException e) {
            log.warn("Bỏ câu chia động từ của lượt quiz: {}", e.getMessage());
            return Map.of();
        } catch (RuntimeException e) {
            log.warn("Bỏ câu chia động từ của lượt quiz (lỗi không mong đợi)", e);
            return Map.of();
        }
        if (quiz == null || quiz.items() == null) return Map.of();
        // ai-service trả term đúng như đã gửi (đã strip); hai thẻ cùng thuật ngữ thì ai-service bỏ bản trùng -> thẻ đầu nhận câu
        Map<String, Deque<String>> idsByTerm = new HashMap<>();
        for (VerbCard v : verbs) idsByTerm.computeIfAbsent(v.term().strip(), k -> new ArrayDeque<>()).add(v.cardId());
        Map<String, List<QuizAiClient.ConjugationItem>> out = new HashMap<>();
        for (QuizAiClient.ConjugationItem item : quiz.items()) {
            if (item == null || item.term() == null) continue;
            Deque<String> ids = idsByTerm.get(item.term().strip());
            if (ids != null && !ids.isEmpty()) out.computeIfAbsent(ids.peekFirst(), k -> new ArrayList<>()).add(item);
        }
        return out;
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

    /** Vài câu mẫu để xem trước bộ đề: không mở lượt làm, không tính điểm, không ghi ngân hàng câu hỏi. */
    @Transactional(readOnly = true)
    public List<QuizService.Question> quizPreview(Long uid, String deckId, int size) {
        return QuizService.buildQuiz(deckService.readable(uid, deckId).getCards(), size, random);
    }

    // ---------- trả lời ----------

    /**
     * Lưu đáp án một câu (idempotent theo câu). practice: lưu lần đầu rồi khoá, trả phản hồi; gọi lại trả đúng phản
     * hồi đã có. exam: ghi đè được tới khi nộp, không trả phản hồi. Câu gõ (reading): lưu chuỗi người học gõ (≤ 100 ký tự,
     * bỏ khoảng trắng hai đầu) để xem lại đúng như đã gõ; chấm luôn sau chuẩn hoá kana ({@link QuizService.Item#accepts}).
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
        if (attempt.isPractice() && answers.containsKey(cardId)) {
            return new AnswerResponse(feedback(item, answers.get(cardId)), answers.size());
        }
        boolean blank = option == null || option.isBlank();
        String value = blank ? "" : item.typingInput() ? typed(option) : option;

        if (attempt.isPractice()) {
            if (!blank && !item.allows(value)) throw badOption();
            answers.put(cardId, value);
            attempt.setAnswers(write(answers));
            reviewService.fromQuiz(uid, cardId, item.accepts(value)); // chỉ practice; exam không đụng lịch ôn
            return new AnswerResponse(feedback(item, value), answers.size());
        }

        if (blank) {
            answers.remove(cardId);
        } else {
            if (!item.allows(value)) throw badOption();
            answers.put(cardId, value);
        }
        attempt.setAnswers(write(answers));
        return new AnswerResponse(null, answers.size());
    }

    /** Câu trả lời tự gõ: bỏ khoảng trắng hai đầu, quá {@link QuizService#TYPED_ANSWER_MAX} ký tự = 400. */
    private static String typed(String option) {
        String value = option.strip();
        if (value.length() > QuizService.TYPED_ANSWER_MAX) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Câu trả lời tự gõ tối đa " + QuizService.TYPED_ANSWER_MAX + " ký tự.");
        }
        return value;
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

    /**
     * Đáp án client gửi kèm khi nộp ghi đè bản đã lưu; câu lạ / lựa chọn không có trong đề / câu gõ rỗng hoặc quá dài bị bỏ
     * (tính là bỏ trống).
     */
    private void mergeClientAnswers(QuizAttempt attempt, Map<String, String> clientAnswers) {
        Map<String, String> answers = answers(attempt);
        for (QuizService.Item item : items(attempt)) {
            if (!clientAnswers.containsKey(item.cardId())) continue;
            String option = clientAnswers.get(item.cardId());
            String value = option == null || !item.typingInput() ? option : option.strip();
            boolean valid = value != null && !value.isEmpty() && item.allows(value)
                    && (!item.typingInput() || value.length() <= QuizService.TYPED_ANSWER_MAX);
            if (valid) answers.put(item.cardId(), value);
            else answers.remove(item.cardId());
        }
        attempt.setAnswers(write(answers));
    }

    // ---------- đóng lượt / kết quả ----------

    /** Lượt quá hạn chưa nộp (đóng tab, bỏ dở) -> chấm các đáp án đã lưu, để không chọn được lượt có lợi. */
    private void closeExpiredAttempts(Long uid, Instant now) {
        for (QuizAttempt attempt : attemptRepository.findExpiredOpen(uid, now)) close(attempt, now);
    }

    /**
     * Đóng lượt đang mở không phải bài kiểm tra chương (xem {@link #chapterExam}) như khi nó hết hạn: chấm các đáp án đã lưu, câu
     * chưa làm tính sai; luyện tập chưa trả lời câu nào thì không ghi kết quả ({@link #close}). Không bỏ lượt mà không chấm: tab
     * khác đang mở lượt đó đồng bộ lại sẽ thấy "đã nộp" kèm điểm (state() chấm mọi lượt đã đóng), nên điểm đó phải có trong lịch
     * sử như mọi lần nộp — trang Quiz cũng nói "bài dở sẽ được chấm theo các câu đã trả lời", và trang lộ trình hỏi trước khi nộp
     * thay. flush ngay: Hibernate ghi INSERT trước UPDATE khi flush, không flush ở đây thì lượt mới được ghi lúc lượt cũ còn "mở"
     * và đụng unique index một-lượt-mở (V9).
     */
    private void closeForChapterExam(QuizAttempt attempt, Instant now) {
        log.info("Nộp thay lượt {} ({}) để mở bài kiểm tra chương trên bộ thẻ {}", attempt.getId(), attempt.getMode(),
                attempt.getDeckId());
        close(attempt, now);
        attemptRepository.flush();
    }

    private void close(QuizAttempt attempt, Instant now) {
        Map<String, String> answers = answers(attempt);
        attempt.setSubmittedAt(now);
        // Luyện tập bỏ dở mà chưa trả lời câu nào: không ghi kết quả 0 điểm làm nhiễu lịch sử
        if (attempt.isPractice() && answers.isEmpty()) return;
        QuizService.Graded graded = grade(attempt, answers);
        quizResultRepository.save(new QuizResult(attempt.getUserId(), attempt.getDeckId(), graded.score(),
                graded.total(), attempt.getMode(), attempt.getId()));
        // Đồng bộ, cùng giao dịch: bài kiểm tra chương của lộ trình (LearningPathService.onQuizSubmitted) ghi quiz_passed_at ngay
        // trong lần nộp; listener lỗi thì rollback cả kết quả — listener tự bắt lỗi của mình để điều đó không xảy ra.
        events.publishEvent(new QuizSubmittedEvent(attempt.getUserId(), attempt.getDeckId(), attempt.getId(), graded.score(),
                graded.total(), attempt.getMode()));
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
        return QuizService.grade(items(attempt), attempt.getCardIds(), answers);
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
            return questionState(item, chosen, fb);
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

    /**
     * Câu chưa lộ đáp án (feedback null) mà thuật ngữ / cách đọc chính là đáp án (chọn đúng chữ giống hình / đồng âm, gõ cách
     * đọc): không gửi hai trường đó — client hiện prompt thay cho thuật ngữ, nên chỉ ai mở DevTools mới thấy, và đó đúng là chỗ
     * không được lộ. Bản chụp cũ (trước đợt 2) không có type / inputMode -> câu nghĩa, chọn đáp án.
     */
    private static QuestionState questionState(QuizService.Item item, String chosen, Feedback fb) {
        String type = item.typeOrMeaning();
        boolean hidden = fb == null;
        String term = hidden && QuizService.termIsAnswer(type) ? "" : item.term();
        String reading = hidden && QuizService.readingIsAnswer(type) ? null : item.reading();
        return new QuestionState(item.cardId(), term, reading, item.options(), chosen, fb, type, item.prompt(),
                item.typingInput() ? QuizService.TYPING : QuizService.CHOICE, item.questionId());
    }

    private static Feedback feedback(QuizService.Item item, String chosen) {
        return new Feedback(item.accepts(chosen), item.correct(), item.explanation(), item.example());
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

    /**
     * "Sai quiz" (InsightService, spec §3.7): số câu trả lời sai theo thẻ trong các lượt đã nộp sau since, so answers với bản
     * chụp đề như lúc chấm (QuizService.grade). Câu không có đáp án: exam tính sai (bài thi chấm như vậy, người học thấy điểm
     * đó); practice thì không tính — lượt luyện tập đóng sau 24 giờ với vài câu chưa mở không nói gì về trí nhớ. Riêng câu practice
     * người học BẤM "Bỏ qua câu này" (lưu đáp án "") là sai: đó là "không biết", {@link #answer} đã chấm nó sai và ghi "again" vào
     * lịch ôn, nên điểm yếu đếm giống như vậy.
     */
    @Transactional(readOnly = true)
    public Map<String, Integer> wrongAnswerCounts(Long uid, Instant since) {
        Map<String, Integer> out = new HashMap<>();
        for (QuizAttempt attempt : attemptRepository.findByUserIdAndSubmittedAtAfter(uid, since)) {
            Map<String, String> answers;
            List<QuizService.Item> items;
            try {
                answers = answers(attempt);
                items = items(attempt);
            } catch (IllegalStateException e) {
                // Một bản chụp hỏng chỉ làm mất tín hiệu của lượt đó; ném tiếp thì cả trang Điểm yếu / "học gì tiếp" thành 500
                continue;
            }
            for (QuizService.Item item : items) {
                String chosen = answers.get(item.cardId());
                boolean wrong = chosen != null ? !item.accepts(chosen) : !attempt.isPractice();
                if (wrong) out.merge(item.cardId(), 1, Integer::sum);
            }
        }
        return out;
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
