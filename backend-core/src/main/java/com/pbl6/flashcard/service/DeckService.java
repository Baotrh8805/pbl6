package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.deck.DeckRequest;
import com.pbl6.flashcard.dto.deck.DeckResponse;
import com.pbl6.flashcard.dto.deck.DeckResponse.CardResponse;
import com.pbl6.flashcard.dto.deck.ShareRequest;
import com.pbl6.flashcard.model.Deck;
import com.pbl6.flashcard.model.DeckShare;
import com.pbl6.flashcard.model.Flashcard;
import com.pbl6.flashcard.model.Folder;
import com.pbl6.flashcard.model.QuizAttempt;
import com.pbl6.flashcard.model.QuizResult;
import com.pbl6.flashcard.model.Review;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.repository.DeckRepository;
import com.pbl6.flashcard.repository.DeckShareRepository;
import com.pbl6.flashcard.repository.FlashcardRepository;
import com.pbl6.flashcard.repository.FolderRepository;
import com.pbl6.flashcard.repository.QuizAttemptRepository;
import com.pbl6.flashcard.repository.QuizResultRepository;
import com.pbl6.flashcard.repository.ReviewRepository;
import com.pbl6.flashcard.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Nghiệp vụ bộ thẻ / thẻ / ôn tập / quiz. Mỗi thao tác một transaction và trả DTO, nên controller không
 * chạm lazy collection sau khi transaction đóng (spring.jpa.open-in-view=false).
 */
@Service
public class DeckService {

    private static final String DECK_NOT_FOUND = "Không tìm thấy bộ thẻ.";
    private static final String CARD_NOT_FOUND = "Không tìm thấy thẻ trong bộ thẻ này.";

    private final DeckRepository deckRepository;
    private final FlashcardRepository flashcardRepository;
    private final ReviewRepository reviewRepository;
    private final QuizResultRepository quizResultRepository;
    private final FolderRepository folderRepository;
    private final DeckShareRepository shareRepository;
    private final UserRepository userRepository;
    private final QuizAttemptRepository attemptRepository;
    private final Random random = new Random();

    public DeckService(DeckRepository deckRepository, FlashcardRepository flashcardRepository,
                       ReviewRepository reviewRepository, QuizResultRepository quizResultRepository,
                       FolderRepository folderRepository, DeckShareRepository shareRepository,
                       UserRepository userRepository, QuizAttemptRepository attemptRepository) {
        this.deckRepository = deckRepository;
        this.flashcardRepository = flashcardRepository;
        this.reviewRepository = reviewRepository;
        this.quizResultRepository = quizResultRepository;
        this.folderRepository = folderRepository;
        this.shareRepository = shareRepository;
        this.userRepository = userRepository;
        this.attemptRepository = attemptRepository;
    }

    // ---------- quyền ----------

    /** Quyền trên bộ thẻ, từ cao xuống thấp. */
    public enum Access {
        OWNER, EDITOR, VIEWER;

        public String json() { return name().toLowerCase(java.util.Locale.ROOT); }
    }

    /**
     * Chủ > quyền được chia sẻ > public / nằm trong thư mục được chia sẻ (chỉ xem). Không có quyền = empty.
     * sharePermission: DeckShare.permission của uid trên deck này, null nếu không được chia sẻ.
     * inSharedFolder: deck nằm trong thư mục (hoặc thư mục con của thư mục) được chia sẻ cho uid / để public.
     */
    public static Optional<Access> access(Long uid, Deck deck, String sharePermission, boolean inSharedFolder) {
        if (uid == null || deck == null) return Optional.empty();
        if (uid.equals(deck.getOwnerId())) return Optional.of(Access.OWNER);
        if (DeckShare.EDITOR.equals(sharePermission)) return Optional.of(Access.EDITOR);
        if (DeckShare.VIEWER.equals(sharePermission) || deck.isPublic() || inSharedFolder) {
            return Optional.of(Access.VIEWER);
        }
        return Optional.empty();
    }

    private Optional<Access> access(Long uid, Deck deck) {
        if (uid.equals(deck.getOwnerId())) return Optional.of(Access.OWNER);
        String permission = shareRepository.findByDeckIdAndUserId(deck.getId(), uid)
                .map(DeckShare::getPermission).orElse(null);
        Optional<Access> direct = access(uid, deck, permission, false);
        if (direct.isPresent() || deck.getFolder() == null) return direct;
        // Chỉ hỏi chuỗi thư mục khi không có quyền nào khác (thêm 1 query)
        return access(uid, deck, permission, folderRepository.isSharedWith(deck.getFolder().getId(), uid));
    }

    public static Optional<Flashcard> findCardIn(Deck deck, String cardId) {
        if (deck == null || deck.getCards() == null || cardId == null) {
            return Optional.empty();
        }
        return deck.getCards().stream().filter(c -> cardId.equals(c.getId())).findFirst();
    }

    private static ResponseStatusException deckNotFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, DECK_NOT_FOUND);
    }

    /** deckId đến từ URL. Không xem được = 404, không lộ sự tồn tại. */
    private Deck readable(Long uid, String deckId) {
        return deckRepository.findById(deckId).filter(d -> access(uid, d).isPresent())
                .orElseThrow(DeckService::deckNotFound);
    }

    /**
     * Khoá dòng deck tới hết transaction: các thao tác ghi trên cùng deck chạy lần lượt.
     * Xem được nhưng thiếu quyền = 403; không xem được = 404.
     */
    private Deck lockedWith(Long uid, String deckId, Access required) {
        Deck deck = deckRepository.findByIdForUpdate(deckId).orElseThrow(DeckService::deckNotFound);
        Access access = access(uid, deck).orElseThrow(DeckService::deckNotFound);
        if (access.compareTo(required) > 0) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, required == Access.OWNER
                    ? "Chỉ chủ bộ thẻ được thực hiện thao tác này." : "Bạn chỉ có quyền xem bộ thẻ này.");
        }
        return deck;
    }

    private Deck writable(Long uid, String deckId) {
        return lockedWith(uid, deckId, Access.EDITOR);
    }

    private Folder ownedFolder(Long uid, UUID folderId) {
        if (folderId == null) return null;
        return folderRepository.findById(folderId)
                .filter(f -> uid.equals(f.getUser().getId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Thư mục không tồn tại hoặc không thuộc quyền sở hữu."));
    }

    // ---------- bộ thẻ ----------

    /**
     * folderId null: "Bộ thẻ của tôi" (sở hữu + được chia sẻ qua email).
     * folderId có: bộ thẻ trong thư mục đó, của mình hoặc được chia sẻ (qua thư mục) cho mình; khác = 404.
     */
    @Transactional(readOnly = true)
    public List<DeckResponse> list(Long uid, UUID folderId) {
        boolean viaSharedFolder = false;
        List<Deck> decks;
        if (folderId == null) {
            decks = deckRepository.findPersonalWithCards(uid);
        } else {
            Folder folder = folderRepository.findById(folderId).orElseThrow(DeckService::folderNotFound);
            viaSharedFolder = !uid.equals(folder.getUser().getId());
            if (viaSharedFolder && !folderRepository.isSharedWith(folderId, uid)) throw folderNotFound();
            decks = deckRepository.findInFolderWithCards(folderId);
        }
        // Mọi quyền được chia sẻ của user trong 1 query, không hỏi lại cho từng deck
        Map<String, String> shared = shareRepository.findByUserId(uid).stream()
                .collect(Collectors.toMap(DeckShare::getDeckId, DeckShare::getPermission));
        boolean inSharedFolder = viaSharedFolder;
        return decks.stream()
                .map(d -> DeckResponse.of(d, access(uid, d, shared.get(d.getId()), inSharedFolder).orElseThrow().json()))
                .toList();
    }

    private static ResponseStatusException folderNotFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy thư mục.");
    }

    @Transactional(readOnly = true)
    public DeckResponse get(Long uid, String deckId) {
        Deck deck = readable(uid, deckId);
        return DeckResponse.of(deck, access(uid, deck).orElseThrow().json());
    }

    @Transactional
    public DeckResponse create(Long uid, DeckRequest req) {
        Deck deck = new Deck();
        deck.setId(UUID.randomUUID().toString());
        deck.setTitle(req.title());
        deck.setLevel(req.level());
        deck.setDescription(req.description());
        deck.setOwnerId(uid);
        deck.setFolder(ownedFolder(uid, req.folderId()));
        if (req.visibility() != null) deck.setVisibility(req.visibility());
        deck.setCategory(req.category());
        int pos = 1;
        for (DeckRequest.Card c : complete(req.cards())) {
            deck.getCards().add(newCard(deck, c, pos++));
        }
        return DeckResponse.of(deckRepository.save(deck), Access.OWNER.json());
    }

    /** Lưu bộ thẻ xem được (Thư viện, được chia sẻ) thành bản riêng. Bản sao ghi nguồn -> lượt tải của bản gốc. */
    @Transactional
    public DeckResponse cloneDeck(Long uid, String deckId, UUID folderId) {
        Deck source = readable(uid, deckId);
        Deck copy = new Deck();
        copy.setId(UUID.randomUUID().toString());
        copy.setTitle(source.getTitle());
        copy.setLevel(source.getLevel());
        copy.setDescription(source.getDescription());
        copy.setCategory(source.getCategory());
        copy.setOwnerId(uid);
        copy.setFolder(ownedFolder(uid, folderId));
        copy.setSourceDeckId(source.getId());
        List<Flashcard> ordered = source.getCards().stream()
                .sorted(Comparator.comparing(Flashcard::getPosition, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
        int pos = 1;
        for (Flashcard f : ordered) {
            copy.getCards().add(newCard(copy, new DeckRequest.Card(null, f.getTerm(), f.getReading(), f.getMeaning(),
                    f.getExample()), pos++));
        }
        return DeckResponse.of(deckRepository.save(copy), Access.OWNER.json());
    }

    @Transactional
    public DeckResponse update(Long uid, String deckId, DeckRequest req) {
        Deck deck = writable(uid, deckId);
        boolean owner = uid.equals(deck.getOwnerId());
        deck.setTitle(req.title());
        deck.setLevel(req.level());
        deck.setDescription(req.description());
        // Thư mục/hiển thị/chủ đề thuộc về chủ bộ thẻ: người được chia sẻ quyền sửa không đổi được
        if (owner) {
            deck.setFolder(ownedFolder(uid, req.folderId()));
            if (req.visibility() != null) deck.setVisibility(req.visibility());
            if (req.category() != null) deck.setCategory(req.category());
        }

        if (req.cards() != null) {
            // Khớp theo id thẻ (không theo vị trí): thẻ giữ id thì giữ lịch sử SRS của mọi người học;
            // xoá/chèn/đổi chỗ ở giữa không làm review "nhảy" sang thẻ khác.
            List<DeckRequest.Card> incoming = complete(req.cards());
            List<Flashcard> existing = deck.getCards();
            Map<String, Flashcard> byId = existing.stream()
                    .collect(Collectors.toMap(Flashcard::getId, Function.identity()));
            Set<String> kept = new HashSet<>();
            for (DeckRequest.Card c : incoming) {
                if (c.id() != null && (!byId.containsKey(c.id()) || !kept.add(c.id()))) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "Thẻ " + c.id() + " không thuộc bộ thẻ này hoặc bị lặp.");
                }
            }

            List<Flashcard> removed = existing.stream().filter(f -> !kept.contains(f.getId())).toList();
            if (!removed.isEmpty()) {
                reviewRepository.deleteByCardIdIn(removed.stream().map(Flashcard::getId).toList());
                existing.removeAll(removed);
            }
            for (int i = 0; i < incoming.size(); i++) {
                DeckRequest.Card c = incoming.get(i);
                Flashcard card = c.id() != null ? byId.get(c.id()) : null;
                if (card == null) {
                    existing.add(newCard(deck, c, i + 1));
                } else {
                    apply(card, c);
                    card.setPosition(i + 1);
                }
            }
        }
        return DeckResponse.of(deckRepository.save(deck), (owner ? Access.OWNER : Access.EDITOR).json());
    }

    @Transactional
    public void delete(Long uid, String deckId) {
        Deck deck = lockedWith(uid, deckId, Access.OWNER);
        List<String> cardIds = deck.getCards().stream().map(Flashcard::getId).toList();
        if (!cardIds.isEmpty()) {
            reviewRepository.deleteByCardIdIn(cardIds);
        }
        deckRepository.delete(deck); // quiz_results, deck_shares, deck_ratings: FK ON DELETE CASCADE
    }

    // ---------- chia sẻ (chỉ chủ bộ thẻ) ----------

    @Transactional(readOnly = true)
    public List<DeckShareRepository.Member> shares(Long uid, String deckId) {
        Deck deck = readable(uid, deckId);
        if (!uid.equals(deck.getOwnerId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Chỉ chủ bộ thẻ được thực hiện thao tác này.");
        }
        return shareRepository.findMembers(deckId);
    }

    /** Chia sẻ mới, hoặc đổi quyền của người đã được chia sẻ. */
    @Transactional
    public List<DeckShareRepository.Member> share(Long uid, String deckId, ShareRequest req) {
        lockedWith(uid, deckId, Access.OWNER);
        User target = userRepository.findByEmail(User.normalizeEmail(req.email()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Không tìm thấy người dùng với email này."));
        if (uid.equals(target.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bạn đã là chủ bộ thẻ này.");
        }
        DeckShare share = shareRepository.findByDeckIdAndUserId(deckId, target.getId())
                .orElseGet(() -> new DeckShare(deckId, target.getId(), req.permission()));
        share.setPermission(req.permission());
        shareRepository.save(share);
        return shareRepository.findMembers(deckId);
    }

    @Transactional
    public void unshare(Long uid, String deckId, Long userId) {
        lockedWith(uid, deckId, Access.OWNER);
        shareRepository.findByDeckIdAndUserId(deckId, userId).ifPresent(shareRepository::delete);
    }

    // ---------- thẻ ----------

    @Transactional
    public List<CardResponse> addCards(Long uid, String deckId, List<DeckRequest.Card> reqs) {
        Deck deck = writable(uid, deckId);
        // max + 1 (không phải size + 1): sau khi xoá thẻ ở giữa, size + 1 có thể trùng position đang có
        int pos = deck.getCards().stream().map(Flashcard::getPosition)
                .filter(Objects::nonNull).max(Comparator.naturalOrder()).orElse(0);
        List<Flashcard> created = new ArrayList<>();
        for (DeckRequest.Card c : complete(reqs)) {
            Flashcard card = newCard(deck, c, ++pos);
            deck.getCards().add(card);
            created.add(card);
        }
        deckRepository.save(deck);
        return created.stream().map(CardResponse::of).toList();
    }

    @Transactional
    public CardResponse updateCard(Long uid, String deckId, String cardId, DeckRequest.Card req) {
        Flashcard card = findCardIn(writable(uid, deckId), cardId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, CARD_NOT_FOUND));
        apply(card, req);
        return CardResponse.of(card);
    }

    @Transactional
    public void deleteCard(Long uid, String deckId, String cardId) {
        Deck deck = writable(uid, deckId);
        Flashcard card = findCardIn(deck, cardId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, CARD_NOT_FOUND));
        reviewRepository.deleteByCardIdIn(List.of(cardId));
        deck.getCards().remove(card);
    }

    // ---------- ôn tập (SRS) ----------

    @Transactional(readOnly = true)
    public List<Review> reviews(Long uid) {
        return reviewRepository.findByUserId(uid);
    }

    /** Client chỉ gửi cardId + grade; ngày ôn kế tiếp do server quyết định. */
    @Transactional
    public Review review(Long uid, String cardId, String grade) {
        // Chỉ ôn được thẻ trong bộ thẻ mình xem được: không dò/ghi vào thẻ trong deck riêng của người khác
        boolean visible = flashcardRepository.findById(cardId)
                .map(card -> access(uid, card.getDeck()).isPresent()).orElse(false);
        if (!visible) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy thẻ.");
        }
        Instant now = Instant.now();
        // Tạo-nếu-chưa-có rồi khoá dòng: 2 lần chấm song song không vỡ unique (user_id, card_id)
        Review fresh = SrsService.newReview(uid, cardId, now);
        reviewRepository.insertIfAbsent(uid, cardId, fresh.getReps(), fresh.getIntervalDays(), fresh.getEase(),
                fresh.getDueAt());
        Review review = reviewRepository.findForUpdate(uid, cardId).orElseThrow();
        return SrsService.schedule(review, grade, now);
    }

    // ---------- quiz ----------

    /** Phát đề và ghi lượt làm (hạn giờ do server giữ). Bộ thẻ trống: không tạo lượt. */
    @Transactional
    public QuizService.Paper quiz(Long uid, String deckId, int size) {
        Deck deck = readable(uid, deckId);
        Instant now = Instant.now();
        closeExpiredAttempts(uid, now);
        List<QuizService.Question> questions = QuizService.buildQuiz(deck.getCards(), size, random);
        if (questions.isEmpty()) return new QuizService.Paper(null, 0, questions);

        int limit = questions.size() * QuizService.SECONDS_PER_QUESTION;
        QuizAttempt attempt = new QuizAttempt(uid, deckId, questions.stream().map(QuizService.Question::cardId).toList(),
                now, now.plusSeconds(limit + QuizService.GRACE_SECONDS));
        attemptRepository.save(attempt);
        return new QuizService.Paper(attempt.getId(), limit, questions);
    }

    /** Vài câu mẫu để xem trước bộ đề: không mở lượt làm, không tính điểm. */
    @Transactional(readOnly = true)
    public List<QuizService.Question> quizPreview(Long uid, String deckId, int size) {
        return QuizService.buildQuiz(readable(uid, deckId).getCards(), size, random);
    }

    /** expired: nộp sau hạn giờ -> bài không được chấm, ghi 0 điểm. */
    public record QuizOutcome(int score, int total, Map<String, String> wrong, boolean expired) {}

    /**
     * Chấm điểm ở server trên đúng các câu đã phát cho lượt làm này; câu bỏ trống = sai.
     * Mỗi lượt chỉ nộp một lần.
     */
    @Transactional
    public QuizOutcome submitQuiz(Long uid, String deckId, UUID attemptId, Map<String, String> answers) {
        Deck deck = readable(uid, deckId);
        QuizAttempt attempt = attemptRepository.findForUpdate(attemptId)
                .filter(a -> a.getUserId().equals(uid) && a.getDeckId().equals(deckId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy lượt làm bài."));
        if (attempt.getSubmittedAt() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Bài làm này đã được nộp.");
        }
        Instant now = Instant.now();
        boolean expired = now.isAfter(attempt.getExpiresAt());
        return close(attempt, deck, expired ? Map.of() : answers, now, expired);
    }

    /** Lượt quá hạn chưa nộp (đóng tab, bỏ dở) -> ghi 0 điểm, để không chọn được lượt có lợi. */
    private void closeExpiredAttempts(Long uid, Instant now) {
        for (QuizAttempt attempt : attemptRepository.findExpiredOpen(uid, now)) {
            deckRepository.findById(attempt.getDeckId())
                    .ifPresent(deck -> close(attempt, deck, Map.of(), now, true));
        }
    }

    private QuizOutcome close(QuizAttempt attempt, Deck deck, Map<String, String> answers, Instant now, boolean expired) {
        Map<String, String> meanings = deck.getCards().stream()
                .collect(Collectors.toMap(Flashcard::getId, Flashcard::getMeaning));
        QuizService.Graded graded = QuizService.grade(meanings, attempt.getCardIds(), answers);
        attempt.setSubmittedAt(now);
        quizResultRepository.save(new QuizResult(attempt.getUserId(), deck.getId(), graded.score(), graded.total()));
        Map<String, String> wrong = graded.wrongCardIds().stream()
                .collect(Collectors.toMap(Function.identity(), meanings::get));
        return new QuizOutcome(graded.score(), graded.total(), wrong, expired);
    }

    @Transactional
    public List<QuizResultRepository.View> recentResults(Long uid) {
        closeExpiredAttempts(uid, Instant.now());
        return quizResultRepository.findRecent(uid, org.springframework.data.domain.PageRequest.of(0, 10));
    }

    @Transactional
    public long countResults(Long uid) {
        closeExpiredAttempts(uid, Instant.now());
        return quizResultRepository.countByUserId(uid);
    }

    // ---------- tiện ích ----------

    /** Bỏ thẻ thiếu thuật ngữ/nghĩa (dòng trống trong trình soạn). */
    private static List<DeckRequest.Card> complete(List<DeckRequest.Card> cards) {
        if (cards == null) return List.of();
        return cards.stream()
                .filter(c -> c != null && c.term() != null && !c.term().isBlank()
                        && c.meaning() != null && !c.meaning().isBlank())
                .toList();
    }

    private static Flashcard newCard(Deck deck, DeckRequest.Card c, int position) {
        Flashcard card = new Flashcard();
        card.setId(UUID.randomUUID().toString());
        card.setDeck(deck);
        card.setPosition(position);
        apply(card, c);
        return card;
    }

    private static void apply(Flashcard card, DeckRequest.Card c) {
        card.setTerm(c.term().trim());
        card.setReading(c.reading() != null ? c.reading().trim() : null);
        card.setMeaning(c.meaning().trim());
        card.setExample(c.example() != null ? c.example().trim() : null);
    }
}
