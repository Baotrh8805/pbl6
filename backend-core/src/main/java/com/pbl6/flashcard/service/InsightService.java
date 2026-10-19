package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.insights.FrictionResponse;
import com.pbl6.flashcard.dto.insights.FrictionResponse.FrictionCard;
import com.pbl6.flashcard.dto.insights.NextItem;
import com.pbl6.flashcard.dto.insights.WeaknessResponse;
import com.pbl6.flashcard.dto.insights.WeaknessResponse.Group;
import com.pbl6.flashcard.dto.insights.WeaknessResponse.Groups;
import com.pbl6.flashcard.dto.insights.WeaknessResponse.WeakCard;
import com.pbl6.flashcard.dto.learningpath.LearningPathChapterResponse;
import com.pbl6.flashcard.dto.learningpath.LearningPathRequests;
import com.pbl6.flashcard.dto.learningpath.LearningPathResponse;
import com.pbl6.flashcard.dto.learningpath.TodaySummaryResponse;
import com.pbl6.flashcard.model.Deck;
import com.pbl6.flashcard.model.Flashcard;
import com.pbl6.flashcard.model.LearningPath;
import com.pbl6.flashcard.model.Review;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.repository.DeckRepository;
import com.pbl6.flashcard.repository.DeckRepository.LibraryRow;
import com.pbl6.flashcard.repository.FlashcardRepository;
import com.pbl6.flashcard.repository.LearningPathRepository;
import com.pbl6.flashcard.repository.ReviewRepository;
import com.pbl6.flashcard.repository.ReviewRepository.CardCount;
import com.pbl6.flashcard.repository.ReviewRepository.DeckCount;
import com.pbl6.flashcard.repository.ReviewRepository.ReactionRow;
import com.pbl6.flashcard.repository.UserRepository;
import com.pbl6.flashcard.service.LearningPathScheduler.CardIn;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Điểm yếu, ma sát trí nhớ và "học gì tiếp" (spec §3.7, §3.9). Mỗi tín hiệu là MỘT truy vấn gộp sẵn ở DB (count / percentile),
 * phần hợp tập, gắn lý do, lọc quyền xem và gom nhóm làm ở Java trên tối đa vài trăm thẻ — không nạp review_logs thô. Chỉ đọc;
 * lộ trình bổ khuyết dựng từ kết quả {@link #weakCards} nằm ở {@link LearningPathService#remedial} (vào qua {@link #remedial}
 * để InsightService phụ thuộc LearningPathService một chiều — "học gì tiếp" cần todaySummary / get của nó).
 */
@Service
public class InsightService {

    /** Cửa sổ mặc định của điểm yếu / ma sát (ngày). */
    public static final int DEFAULT_DAYS = 30;
    /** "Hay quên": ≥ 3 lần "again" trong 14 ngày, hoặc ease dưới 1.8. */
    static final int LAPSE_DAYS = 14;
    static final int LAPSE_MIN_AGAIN = 3;
    static final double LOW_EASE = 1.8;
    /** "Ma sát": trung vị phản xạ của thẻ trên ≥ 5 mẫu vượt max(4 000 ms, 2 × trung vị cá nhân). */
    static final int SLOW_MIN_SAMPLES = 5;
    static final int SLOW_FLOOR_MS = 4000;
    static final double SLOW_RATIO = 2.0;
    /** "Sai quiz": ≥ 2 câu sai cùng thẻ trong cửa sổ. */
    static final int QUIZ_MIN_WRONG = 2;
    static final int MAX_CARDS = 500;
    static final int FRICTION_TOP = 50;
    static final int LIBRARY_SUGGESTIONS = 3;
    /** Khoá nhóm cho thẻ không xếp được (không rõ cấp, term không có chữ Hán). */
    public static final String OTHER = "Khác";

    private final ReviewRepository reviews;
    private final FlashcardRepository flashcards;
    private final DeckRepository decks;
    private final LearningPathRepository paths;
    private final UserRepository users;
    private final DeckService deckService;
    private final QuizAttemptService quizAttempts;
    private final SettingsService settings;
    private final LearningPathService learningPaths;
    private final ZoneId zone;

    public InsightService(ReviewRepository reviews, FlashcardRepository flashcards, DeckRepository decks,
                          LearningPathRepository paths, UserRepository users, DeckService deckService,
                          QuizAttemptService quizAttempts, SettingsService settings, LearningPathService learningPaths,
                          @Value("${app.learning-path.zone:Asia/Ho_Chi_Minh}") String zone) {
        this.reviews = reviews;
        this.flashcards = flashcards;
        this.decks = decks;
        this.paths = paths;
        this.users = users;
        this.deckService = deckService;
        this.quizAttempts = quizAttempts;
        this.settings = settings;
        this.learningPaths = learningPaths;
        this.zone = ZoneId.of(zone);
    }

    /** Ngày "hôm nay" theo máy khách (?date=) hoặc theo múi giờ cấu hình (như LearningPathService). */
    public LocalDate today(LocalDate date) {
        return date != null ? date : LocalDate.now(zone);
    }

    // ---------- điểm yếu ----------

    /** Điểm yếu trong days ngày; suggestedDays = số ngày gợi ý cho lộ trình bổ khuyết dựng từ 150 thẻ yếu nhất (kẹp 3..30). */
    @Transactional(readOnly = true)
    public WeaknessResponse weaknesses(Long uid, int days) {
        List<WeakCard> cards = weakCards(uid, days, Instant.now());
        String userLevel = users.findById(uid).map(User::getJlptLevel).orElse(null);
        // Gợi ý số ngày cho lộ trình bổ khuyết nên tính trên đúng những thẻ nó sẽ lấy (150 thẻ yếu nhất), không phải cả danh sách
        List<WeakCard> taken = cards.subList(0, Math.min(cards.size(), LearningPathService.REMEDIAL_MAX_CARDS));
        List<CardIn> ins = new ArrayList<>(taken.size());
        UUID one = new UUID(0L, 0L);
        for (WeakCard c : taken) {
            ins.add(new CardIn(c.cardId(), one, ins.size() + 1,
                    LearningPathScheduler.weight(c.level(), userLevel, Flashcard.KIND_GRAMMAR.equals(c.kind())), false, null));
        }
        int suggested = Math.min(LearningPathService.REMEDIAL_MAX_DAYS, Math.max(LearningPathService.REMEDIAL_MIN_DAYS,
                LearningPathScheduler.suggestDays(ins, settings.getInt(SettingsService.KEY_LP_DAILY_CAP))));
        return new WeaknessResponse(cards.size(), cards, groups(cards), cards.size() >= LearningPathService.REMEDIAL_MIN_CARDS,
                suggested);
    }

    /**
     * Thẻ yếu = hợp của bốn tín hiệu (§3.7), mỗi thẻ kèm lý do; chỉ thẻ trong bộ người dùng còn xem được (chủ / được chia sẻ /
     * public — {@link DeckService#canView}, hỏi theo bộ chứ không theo thẻ); tối đa {@link #MAX_CARDS}. Thứ tự tất định: nhiều lý do
     * trước, rồi số "again" giảm dần, rồi term, rồi id. days là cửa sổ của "ma sát" và "sai quiz"; "hay quên" theo lần "again" luôn
     * lấy 14 ngày (không quá days).
     */
    List<WeakCard> weakCards(Long uid, int days, Instant now) {
        int window = Math.max(1, days);
        Instant since = now.minus(window, ChronoUnit.DAYS);
        Instant lapseSince = now.minus(Math.min(LAPSE_DAYS, window), ChronoUnit.DAYS);

        Map<String, Integer> again = new HashMap<>();
        for (CardCount c : reviews.countAgainByCard(uid, lapseSince)) again.put(c.getCardId(), (int) c.getN());
        Map<String, Review> lowEase = new HashMap<>();
        for (Review r : reviews.findByUserIdAndEaseLessThan(uid, LOW_EASE)) lowEase.put(r.getCardId(), r);
        Double personal = reviews.personalMedianReactionMs(uid, since);
        Map<String, ReactionRow> reaction = new HashMap<>();
        for (ReactionRow r : reviews.medianReactionByCard(uid, since, SLOW_MIN_SAMPLES)) reaction.put(r.getCardId(), r);
        Map<String, Integer> quizWrong = quizAttempts.wrongAnswerCounts(uid, since);

        double slowLimit = slowLimit(personal);
        Set<String> ids = new LinkedHashSet<>();
        again.forEach((id, n) -> { if (n >= LAPSE_MIN_AGAIN) ids.add(id); });
        ids.addAll(lowEase.keySet());
        reaction.forEach((id, r) -> { if (r.getMedianMs() != null && r.getMedianMs() > slowLimit) ids.add(id); });
        quizWrong.forEach((id, n) -> { if (n >= QUIZ_MIN_WRONG) ids.add(id); });
        if (ids.isEmpty()) return List.of();

        Map<String, Review> state = new HashMap<>(lowEase);
        for (Review r : reviews.findByUserIdAndCardIdIn(uid, ids)) state.put(r.getCardId(), r);
        List<WeakCard> out = new ArrayList<>();
        for (Flashcard f : viewable(uid, ids)) {
            List<String> reasons = new ArrayList<>(4);
            int n = again.getOrDefault(f.getId(), 0);
            if (n >= LAPSE_MIN_AGAIN) reasons.add("lapses");
            Review r = state.get(f.getId());
            if (r != null && r.getEase() < LOW_EASE) reasons.add("low_ease");
            ReactionRow rr = reaction.get(f.getId());
            if (rr != null && rr.getMedianMs() != null && rr.getMedianMs() > slowLimit) reasons.add("slow");
            int wrong = quizWrong.getOrDefault(f.getId(), 0);
            if (wrong >= QUIZ_MIN_WRONG) reasons.add("quiz_wrong");
            out.add(new WeakCard(f.getId(), f.getDeck().getId(), f.getDeck().getTitle(), f.getTerm(), f.getReading(),
                    f.getMeaning(), f.getLevel(), f.getKind(), reasons, n, r == null ? null : r.getEase(),
                    r == null ? null : r.getIntervalDays(),
                    rr == null || rr.getMedianMs() == null ? null : (int) Math.round(rr.getMedianMs()), wrong));
        }
        out.sort(Comparator.comparingInt((WeakCard c) -> c.reasons().size()).reversed()
                .thenComparing(Comparator.comparingInt(WeakCard::againCount).reversed())
                .thenComparing(WeakCard::term).thenComparing(WeakCard::cardId));
        return out.size() > MAX_CARDS ? List.copyOf(out.subList(0, MAX_CARDS)) : out;
    }

    /** Ngưỡng "chậm": max(4 000 ms, 2 × trung vị cá nhân); chưa có trung vị cá nhân thì chỉ còn sàn 4 000 ms. */
    private static double slowLimit(Double personal) {
        return Math.max(SLOW_FLOOR_MS, personal == null ? 0 : SLOW_RATIO * personal);
    }

    /**
     * Thẻ theo id mà người dùng còn xem được, theo thứ tự ids. Quyền hỏi một lần cho mỗi bộ (vài bộ) thay vì mỗi thẻ; thẻ đã bị
     * xoá không còn dòng (review_logs CASCADE nhưng quiz_attempts.questions giữ id cũ) nên tự rơi.
     */
    private List<Flashcard> viewable(Long uid, Set<String> ids) {
        Map<String, Flashcard> byId = new HashMap<>();
        for (Flashcard f : flashcards.findWithDeckByIdIn(ids)) byId.put(f.getId(), f);
        Map<String, Boolean> deckOk = new HashMap<>();
        List<Flashcard> out = new ArrayList<>();
        for (String id : ids) {
            Flashcard f = byId.get(id);
            if (f == null) continue;
            Deck d = f.getDeck();
            if (deckOk.computeIfAbsent(d.getId(), k -> deckService.canView(uid, d))) out.add(f);
        }
        return out;
    }

    /** Gom theo cấp JLPT, loại, chữ Hán đầu tiên của term, bộ thẻ — mỗi thẻ vào đúng một nhóm nên tổng mỗi cách gom = total. */
    static Groups groups(List<WeakCard> cards) {
        return new Groups(group(cards, "level"), group(cards, "kind"), group(cards, "kanji"), group(cards, "deck"));
    }

    private static List<Group> group(List<WeakCard> cards, String by) {
        Map<String, int[]> count = new HashMap<>();
        Map<String, String> title = new HashMap<>();
        for (WeakCard c : cards) {
            String key = groupKey(c, by);
            count.computeIfAbsent(key, k -> new int[1])[0]++;
            if ("deck".equals(by)) title.putIfAbsent(key, c.deckTitle());
        }
        List<Group> out = new ArrayList<>();
        count.forEach((k, n) -> out.add(new Group(k, title.get(k), n[0])));
        out.sort(GROUP_ORDER);
        return out;
    }

    /** Nhóm đông trước; hoà thì "Khác" cuối rồi theo khoá. */
    static final Comparator<Group> GROUP_ORDER = Comparator.comparingInt(Group::count).reversed()
            .thenComparing(g -> OTHER.equals(g.key()) ? 1 : 0).thenComparing(Group::key);

    /** Khoá nhóm của một thẻ theo cách gom (level | kind | kanji | deck); dùng chung với lộ trình bổ khuyết để hai bên khớp nhau. */
    static String groupKey(WeakCard c, String by) {
        return switch (by) {
            case "level" -> c.level() != null ? c.level() : OTHER;
            case "kind" -> Flashcard.KIND_GRAMMAR.equals(c.kind()) ? Flashcard.KIND_GRAMMAR : Flashcard.KIND_VOCAB;
            case "kanji" -> {
                String k = firstKanji(c.term());
                yield k != null ? k : OTHER;
            }
            case "deck" -> c.deckId();
            default -> throw new IllegalArgumentException("groupBy không hợp lệ: " + by);
        };
    }

    /** Chữ Hán (script Han) đầu tiên trong term, null nếu không có (kana / romaji). */
    static String firstKanji(String term) {
        if (term == null) return null;
        for (int i = 0; i < term.length(); ) {
            int cp = term.codePointAt(i);
            if (Character.UnicodeScript.of(cp) == Character.UnicodeScript.HAN) return new String(Character.toChars(cp));
            i += Character.charCount(cp);
        }
        return null;
    }

    // ---------- ma sát trí nhớ ----------

    /**
     * F4: thẻ phản xạ chậm trong 30 ngày theo ĐÚNG quy tắc "slow" của điểm yếu (§3.7: trung vị thẻ trên ≥ 5 mẫu &gt; 2 × trung
     * vị cá nhân VÀ &gt; 4 000 ms — {@link #slowLimit}), để hai trang không bất đồng về cùng một thẻ: người đọc chậm (trung vị
     * cá nhân 5 000 ms) không thấy mọi thẻ trên 4 giây thành "ma sát", người đọc nhanh không thấy thẻ 3 giây thành "ma sát".
     */
    @Transactional(readOnly = true)
    public FrictionResponse friction(Long uid) {
        Instant since = Instant.now().minus(DEFAULT_DAYS, ChronoUnit.DAYS);
        Double personal = reviews.personalMedianReactionMs(uid, since);
        double limit = slowLimit(personal);
        Map<String, ReactionRow> slow = new LinkedHashMap<>();
        for (ReactionRow r : reviews.medianReactionByCard(uid, since, SLOW_MIN_SAMPLES)) {
            if (r.getMedianMs() != null && r.getMedianMs() > limit) slow.put(r.getCardId(), r);
        }
        List<FrictionCard> out = new ArrayList<>();
        if (!slow.isEmpty()) {
            for (Flashcard f : viewable(uid, slow.keySet())) {
                ReactionRow r = slow.get(f.getId());
                Double ratio = personal == null || personal <= 0 ? null : Math.round(10.0 * r.getMedianMs() / personal) / 10.0;
                out.add(new FrictionCard(f.getId(), f.getTerm(), f.getReading(), f.getMeaning(), f.getDeck().getId(),
                        (int) Math.round(r.getMedianMs()), (int) r.getSamples(), ratio));
            }
            out.sort(Comparator.comparingInt(FrictionCard::medianReactionMs).reversed().thenComparing(FrictionCard::cardId));
            if (out.size() > FRICTION_TOP) out = List.copyOf(out.subList(0, FRICTION_TOP));
        }
        return new FrictionResponse(personal == null ? null : (int) Math.round(personal), out);
    }

    // ---------- học gì tiếp ----------

    /**
     * §3.9: gợi ý theo thứ tự ưu tiên cố định. Lộ trình đã chốt hoàn thành không gợi ý nữa; "hôm nay" của lộ trình dùng chính
     * todaySummary (một lượt batch cho mọi lộ trình ACTIVE); "due" đếm thẻ đến hạn NGOÀI các lộ trình vừa được gợi ý phiên hôm
     * nay (thẻ của lộ trình đã hoàn thành / chưa bắt đầu đếm ở đây) và chỉ trong bộ còn xem được; chương kế = chương locked đầu
     * tiên của lộ trình ACTIVE mới nhất (trạng thái lấy từ GET /{id} để cùng quy tắc với trang lộ trình); bộ Thư viện cùng cấp lấy
     * trang đầu theo lượt tải rồi bỏ bộ của mình, đã lưu bản sao, hoặc đã học trực tiếp (có lượt ôn).
     */
    @Transactional(readOnly = true)
    public List<NextItem> next(Long uid, LocalDate date) {
        List<NextItem> out = new ArrayList<>();
        List<LearningPath> active = paths.findByUserIdAndStatusOrderByCreatedAtDesc(uid, LearningPath.ACTIVE).stream()
                .filter(p -> p.getCompletedAt() == null).toList();
        Map<UUID, TodaySummaryResponse> today = new HashMap<>();
        if (!active.isEmpty()) learningPaths.todaySummary(uid, date).forEach(t -> today.put(t.pathId(), t));
        List<UUID> surfaced = new ArrayList<>(); // lộ trình mà thẻ đến hạn đã nằm trong phiên hôm nay (dueCount)
        for (LearningPath p : active) {
            TodaySummaryResponse t = today.get(p.getId());
            if (t == null || "before".equals(t.state())) continue;
            surfaced.add(p.getId());
            int n = t.newCount() + t.dueCount();
            if (n > 0) out.add(new NextItem("path_today", p.getTitle(), n, "/session?session=today&path=" + p.getId()));
        }
        int due = dueOutside(uid, date, surfaced);
        if (due > 0) out.add(new NextItem("due", "Ôn thẻ đến hạn", due, "/decks"));
        for (LearningPath p : active) {
            TodaySummaryResponse t = today.get(p.getId());
            if (t != null && t.behindCount() > 0) {
                out.add(new NextItem("catchup", p.getTitle(), t.behindCount(), "/session?session=catchup&path=" + p.getId()));
            }
        }
        int weak = weakCards(uid, DEFAULT_DAYS, Instant.now()).size();
        if (weak >= LearningPathService.REMEDIAL_MIN_CARDS) {
            out.add(new NextItem("remedial", "Tạo lộ trình bổ khuyết", weak, "/roadmap?remedial=1"));
        }
        if (!active.isEmpty()) {
            LearningPathResponse full = learningPaths.get(uid, active.get(0).getId(), date);
            for (LearningPathChapterResponse c : full.chapters()) {
                if ("locked".equals(c.state())) {
                    out.add(new NextItem("next_chapter", c.title(), c.cardCount(), "/roadmap/" + full.id()));
                    break;
                }
            }
        }
        String level = users.findById(uid).map(User::getJlptLevel).orElse(null);
        List<LibraryRow> library = decks.findLibraryPage(uid, "", level == null ? "" : level, "", "all", "downloads", 20, 0);
        Set<String> skip = new HashSet<>(decks.findClonedSourceIds(uid));
        if (!library.isEmpty()) {
            skip.addAll(reviews.findStudiedDeckIds(uid, library.stream().map(LibraryRow::getId).toList()));
        }
        int added = 0;
        for (LibraryRow r : library) {
            if (uid.equals(r.getOwnerId()) || skip.contains(r.getId())) continue;
            int n = r.getCardsCount() == null ? 0 : r.getCardsCount().intValue();
            out.add(new NextItem("library", r.getTitle(), n, "/decks/" + r.getId()));
            if (++added >= LIBRARY_SUGGESTIONS) break;
        }
        return out;
    }

    /** Id lộ trình không bao giờ tồn tại (id thật sinh bằng UUID.randomUUID, phiên bản 4), thay cho danh sách rỗng. */
    private static final UUID NO_PATH = new UUID(0L, 0L);

    /**
     * Thẻ đến hạn tới hết ngày date ngoài các lộ trình surfaced, chỉ trong bộ người dùng còn xem được (quyền hỏi một lần mỗi bộ,
     * như {@link #viewable}). Danh sách lộ trình rỗng thì truyền {@link #NO_PATH}: IN () là lỗi cú pháp SQL.
     */
    private int dueOutside(Long uid, LocalDate date, List<UUID> surfaced) {
        Instant until = date.plusDays(1).atStartOfDay(zone).toInstant();
        List<UUID> exclude = surfaced.isEmpty() ? List.of(NO_PATH) : surfaced;
        Map<String, Long> byDeck = new HashMap<>();
        for (DeckCount c : reviews.countDueByDeckOutsidePaths(uid, until, exclude)) byDeck.put(c.getDeckId(), c.getN());
        if (byDeck.isEmpty()) return 0;
        long total = 0;
        for (Deck d : decks.findAllById(byDeck.keySet())) {
            if (deckService.canView(uid, d)) total += byDeck.get(d.getId());
        }
        return (int) Math.min(Integer.MAX_VALUE, total);
    }

    // ---------- lộ trình bổ khuyết ----------

    /** §3.8: thẻ yếu trong 30 ngày → {@link LearningPathService#remedial}; cùng một giao dịch để lịch khớp danh sách vừa tính. */
    @Transactional
    public LearningPathResponse remedial(Long uid, LearningPathRequests.Remedial req, LocalDate date) {
        return learningPaths.remedial(uid, req, weakCards(uid, DEFAULT_DAYS, Instant.now()), date);
    }
}
