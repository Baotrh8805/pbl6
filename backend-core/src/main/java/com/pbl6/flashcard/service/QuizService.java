package com.pbl6.flashcard.service;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.pbl6.flashcard.model.Flashcard;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Random;
import java.util.Set;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.regex.Pattern;

/**
 * Sinh đề và chấm điểm. Đáp án đúng không bao giờ rời server dưới dạng "đáp án":
 * client chỉ nhận danh sách lựa chọn đã trộn (và phản hồi từng câu khi chế độ cho phép).
 * <p>
 * Quiz đa loại (hợp đồng đợt 2 §1.2): meaning (chọn nghĩa), kanji_lookalike / homophone (chọn đúng chữ giữa các chữ giống hình /
 * đồng âm do ai-service sinh, flashcards.distractors), reading (tự gõ cách đọc, chấm sau {@link KanaUtil#normalize}) và
 * conjugation (chọn đúng thể chia, ai-service sinh). Ngân hàng câu hỏi (D11, quiz_questions): mỗi (thẻ, loại) đã đủ
 * {@link #BANK_VARIANTS} câu còn dùng được thì bốc từ ngân hàng — câu admin đã sửa được dùng lại, câu admin đã ẩn không bao giờ
 * ra — chưa đủ thì sinh thêm. Mọi thứ ở đây là hàm thuần trên dữ liệu đã nạp; đọc / ghi DB nằm ở {@link QuestionBankService}.
 */
public final class QuizService {

    public static final int OPTIONS = 4;
    /** Thời gian làm mỗi câu ở chế độ thi (client hiển thị đồng hồ theo số này). */
    public static final int SECONDS_PER_QUESTION = 30;
    /** Bù độ trễ mạng khi client tự nộp lúc hết giờ. */
    public static final int GRACE_SECONDS = 60;
    /** Câu trả lời tự gõ (loại reading) dài tối đa chừng này ký tự (hợp đồng §1.2). */
    public static final int TYPED_ANSWER_MAX = 100;

    // Loại câu hỏi như client thấy (QuestionState.type, body questionTypes); cột quiz_questions.kind là bản chữ hoa (kind()).
    public static final String MEANING = "meaning";
    public static final String KANJI_LOOKALIKE = "kanji_lookalike";
    public static final String HOMOPHONE = "homophone";
    public static final String READING = "reading";
    public static final String CONJUGATION = "conjugation";
    public static final List<String> TYPES = List.of(MEANING, KANJI_LOOKALIKE, HOMOPHONE, READING, CONJUGATION);

    /** QuestionState.inputMode: chọn một phương án / tự gõ (options = []). */
    public static final String CHOICE = "choice";
    public static final String TYPING = "typing";

    public static final String GENERATOR_RULE = "RULE";
    public static final String GENERATOR_AI = "AI";

    /**
     * (thẻ, loại) có từ chừng này câu còn dùng được trong ngân hàng thì bốc ngẫu nhiên một câu thay vì sinh thêm: đủ đa dạng
     * (mỗi câu nghĩa có bộ phương án nhiễu riêng) mà ngân hàng không phình theo số lượt làm.
     */
    static final int BANK_VARIANTS = 3;
    /** Chia động từ có khoảng chục thể (て, ない, た, ます...): giữ nhiều biến thể hơn để không chỉ hỏi mãi 3 thể đầu tiên. */
    static final int CONJUGATION_VARIANTS = 5;
    /** Câu vừa sinh trùng nội dung một câu admin đã ẩn: sinh lại tối đa chừng này lần (phương án nhiễu khác) rồi mới bỏ loại đó. */
    static final int GENERATION_TRIES = 3;
    /** Đoạn nghĩa / thuật ngữ chèn vào prompt bị cắt ở độ dài này: prompt lưu varchar(500). */
    private static final int PROMPT_PART_MAX = 150;
    /** Ứng viên nhiễu là một từ: chuỗi dài hơn thế là dữ liệu hỏng, bỏ. */
    private static final int CANDIDATE_TERM_MAX = 100;
    /** Khoá trong quiz_questions.extra: dấu vân tay nội dung thẻ lúc sinh câu (xem {@link #cardHash}). */
    static final String EXTRA_CARD_HASH = "cardHash";
    /**
     * Khoá trong quiz_questions.extra: {@link #contentKey} của các nội dung mà admin đã sửa bỏ khỏi câu này (prompt / phương án
     * trước khi PATCH). Bước sinh đề sinh lại đúng nội dung cũ thì phát câu đã sửa thay vì ghi lại nội dung cũ thành dòng mới.
     */
    static final String EXTRA_SUPERSEDES = "supersedes";
    /**
     * Ngăn cách các cách đọc được chấp nhận trong đáp án câu gõ ("かく、えがく", "なま / せい"). Không gồm "・" và khoảng trắng: hai
     * dấu đó còn nằm giữa một từ ghép (コーヒー・カップ) và tách ra thì chấp nhận nhầm một nửa từ.
     */
    private static final Pattern READING_SEPARATORS = Pattern.compile("[、,，/／;；|｜]");

    private QuizService() {}

    /**
     * Một câu hỏi gửi cho client — không có trường nào chỉ ra đáp án đúng. type / inputMode luôn có (câu xem trước là meaning /
     * choice); prompt / questionId vắng mặt khi null để JSON của client cũ không đổi.
     */
    public record Question(String cardId, String term, String reading, List<String> options, String type,
                           @JsonInclude(JsonInclude.Include.NON_NULL) String prompt, String inputMode,
                           @JsonInclude(JsonInclude.Include.NON_NULL) String questionId) {}

    /**
     * Một câu trong bản chụp đề lưu ở server (lượt làm): có đáp án đúng và lời giải nên KHÔNG gửi nguyên cho client.
     * explanation: phần nội dung thẻ sau dòng đầu (định nghĩa phụ, ví dụ, ghi chú), null nếu không có.
     * Trường đợt 2 (type, prompt, inputMode, questionId, example) vắng trong bản chụp cũ -> null = câu nghĩa kiểu cũ.
     * Câu gõ (typing): options = [], correct = cách đọc như trên thẻ (có thể gồm nhiều cách đọc), chấm qua {@link #accepts}.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Item(String cardId, String term, String reading, List<String> options, String correct,
                       String explanation, String type, String prompt, String inputMode, String questionId,
                       String example) {

        public String typeOrMeaning() {
            return type == null ? MEANING : type;
        }

        public boolean typingInput() {
            return TYPING.equals(inputMode);
        }

        /** Đáp án có thuộc câu này không: câu chọn = một trong options; câu gõ nhận chuỗi bất kỳ (độ dài kiểm ở nơi gọi). */
        public boolean allows(String option) {
            return typingInput() || (options != null && options.contains(option));
        }

        /** Đúng / sai. Câu gõ so sau chuẩn hoá kana với từng cách đọc được chấp nhận; câu chọn so nguyên văn như trước. */
        public boolean accepts(String chosen) {
            if (chosen == null) return false;
            if (typingInput()) {
                String n = KanaUtil.normalize(chosen);
                return !n.isEmpty() && typingAnswers(correct).contains(n);
            }
            return correct != null && correct.equals(chosen);
        }

        public Item withQuestionId(String id) {
            return new Item(cardId, term, reading, options, correct, explanation, type, prompt, inputMode, id, example);
        }

        public Question toQuestion() {
            return new Question(cardId, term, reading, options, typeOrMeaning(), prompt, typingInput() ? TYPING : CHOICE,
                    questionId);
        }
    }

    public record Graded(int score, int total, List<String> wrongCardIds) {}

    /**
     * Câu đã có trong ngân hàng (quiz_questions) của một thẻ. options null / rỗng = câu gõ; extra.cardHash = vân tay thẻ lúc sinh.
     */
    public record BankEntry(String id, String cardId, String kind, String prompt, List<String> options, String correct,
                            Map<String, Object> extra, boolean hidden) {

        String cardHash() {
            return extra != null && extra.get(EXTRA_CARD_HASH) instanceof String s ? s : null;
        }

        /** Khoá nội dung admin đã sửa bỏ khỏi câu này (extra.supersedes); rỗng với câu chưa sửa prompt / phương án. */
        Set<String> supersedes() {
            return supersededKeys(extra);
        }
    }

    /**
     * Dòng ngân hàng cần ghi cho một câu vừa sinh, đúng dạng lưu: prompt của câu nghĩa = thuật ngữ (client không hiện prompt câu
     * nghĩa), options đã sắp xếp (unique md5 theo nội dung không phụ thuộc thứ tự trộn), null với câu gõ.
     * refreshId != null: trùng nội dung một dòng cũ sinh từ nội dung thẻ trước khi sửa -> cập nhật correct / extra dòng đó.
     */
    public record Draft(String cardId, String kind, String prompt, List<String> options, String correct,
                        Map<String, Object> extra, String generator, String refreshId) {

        Draft refreshing(String id) {
            return new Draft(cardId, kind, prompt, options, correct, extra, generator, id);
        }
    }

    /** Kết quả sinh một câu: draft = null khi câu bốc nguyên từ ngân hàng (đã có questionId, không cần ghi). */
    public record Built(Item item, Draft draft) {}

    /**
     * Dữ liệu ngoài thẻ mà bước sinh đề cần: câu chia động từ ai-service đã sinh theo cardId, và ngân hàng câu hỏi của bộ thẻ
     * theo cardId (gồm cả câu đã ẩn để tránh sinh lại đúng câu đó).
     */
    public record Sources(Map<String, List<QuizAiClient.ConjugationItem>> conjugations, Map<String, List<BankEntry>> bank) {

        public static final Sources NONE = new Sources(Map.of(), Map.of());

        public Sources {
            conjugations = conjugations == null ? Map.of() : conjugations;
            bank = bank == null ? Map.of() : bank;
        }
    }

    /**
     * Nội dung thẻ nhiều dòng (định nghĩa, ví dụ, ghi chú): quiz chỉ lấy dòng không rỗng đầu tiên làm đáp án
     * để lựa chọn ngắn gọn. Dùng chung cho cả sinh đề lẫn chấm điểm.
     */
    public static String headline(String meaning) {
        if (meaning == null) return "";
        return meaning.lines().map(String::strip).filter(l -> !l.isEmpty()).findFirst().orElse("");
    }

    /** Phần nội dung sau dòng đầu = lời giải (định nghĩa phụ, ví dụ, ghi chú); null nếu không có. */
    public static String explanation(String meaning) {
        if (meaning == null) return null;
        List<String> lines = meaning.lines().map(String::strip).toList();
        int first = 0;
        while (first < lines.size() && lines.get(first).isEmpty()) first++;
        String rest = String.join("\n", lines.subList(Math.min(first + 1, lines.size()), lines.size())).strip();
        return rest.isEmpty() ? null : rest;
    }

    /** "kanji_lookalike" -> "KANJI_LOOKALIKE" (cột quiz_questions.kind). */
    public static String kind(String type) {
        return type.toUpperCase(Locale.ROOT);
    }

    /**
     * Danh sách loại client gửi -> danh sách dùng để xoay vòng: bỏ trùng, giữ thứ tự (thứ tự quyết định vòng xoay); null / rỗng
     * = ["meaning"] như trước đợt 2. Giá trị lạ đã bị chặn ở lớp validate (400) nên ở đây chỉ lọc phòng thủ.
     */
    public static List<String> normalizeTypes(List<String> types) {
        if (types == null) return List.of(MEANING);
        List<String> out = types.stream().filter(TYPES::contains).distinct().toList();
        return out.isEmpty() ? List.of(MEANING) : out;
    }

    /** Câu chưa lộ đáp án: loại mà chính thuật ngữ là đáp án (chọn đúng chữ) thì không gửi thuật ngữ cho client. */
    public static boolean termIsAnswer(String type) {
        return KANJI_LOOKALIKE.equals(type) || HOMOPHONE.equals(type);
    }

    /** Loại mà cách đọc là đáp án (gõ cách đọc) hoặc gợi ý thẳng đáp án (chọn đúng chữ): giữ kín tới khi lộ đáp án. */
    public static boolean readingIsAnswer(String type) {
        return READING.equals(type) || termIsAnswer(type);
    }

    /**
     * Các cách đọc chấp nhận được của đáp án câu gõ, đã chuẩn hoá: "かく、えがく" -> {かく, えがく}; một cách đọc -> chính nó.
     * Hai phía (đáp án và câu trả lời) luôn qua cùng {@link KanaUtil#normalize} rồi mới so.
     */
    public static Set<String> typingAnswers(String correct) {
        Set<String> out = new LinkedHashSet<>();
        if (correct == null) return out;
        for (String part : READING_SEPARATORS.split(correct)) {
            String n = KanaUtil.normalize(part);
            if (!n.isEmpty()) out.add(n);
        }
        return out;
    }

    /**
     * Vân tay nội dung thẻ mà câu hỏi dựa vào (thuật ngữ, cách đọc, dòng nghĩa chính). Lưu vào quiz_questions.extra lúc sinh:
     * thẻ bị sửa thì câu cũ trong ngân hàng không còn "dùng được" và câu mới được sinh theo nội dung mới.
     */
    public static String cardHash(Flashcard card) {
        return sha256Hex(String.join("\u001f", String.valueOf(card.getTerm()), String.valueOf(card.getReading()),
                headline(card.getMeaning())), 8);
    }

    /**
     * Khoá nội dung một câu: prompt + phương án không kể thứ tự (null / rỗng = câu gõ) — cùng nghĩa với khoá unique md5 của
     * quiz_questions nhưng tính ở Java, không phụ thuộc cách Postgres in jsonb ra text. Dùng cho extra.supersedes.
     */
    static String contentKey(String prompt, List<String> options) {
        List<String> sorted = canonical(options);
        return sha256Hex(String.valueOf(prompt) + '\u001f' + (sorted == null ? "" : String.join("\u001e", sorted)), 16);
    }

    /** extra.supersedes đọc phòng thủ (jsonb có thể bị sửa tay): chỉ lấy phần tử chuỗi. */
    static Set<String> supersededKeys(Map<String, Object> extra) {
        Set<String> out = new LinkedHashSet<>();
        if (extra != null && extra.get(EXTRA_SUPERSEDES) instanceof Collection<?> list) {
            for (Object o : list) if (o instanceof String s) out.add(s);
        }
        return out;
    }

    private static String sha256Hex(String source, int bytes) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(source.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest, 0, bytes);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e); // JVM nào cũng phải có SHA-256
        }
    }

    public static List<Question> buildQuiz(List<Flashcard> cards, int size, Random random) {
        return buildItems(cards, size, random).stream().map(Item::toQuestion).toList();
    }

    /** Một câu hợp lệ cần ít nhất 2 lựa chọn khác nhau, nên bộ thẻ cần tối thiểu 2 thẻ có nghĩa khác nhau. */
    public static List<Item> buildItems(List<Flashcard> cards, int size, Random random) {
        return buildItems(cards, size, random, List.of(MEANING), Sources.NONE);
    }

    /** Các câu của {@link #build} (bỏ phần cần ghi ngân hàng) — cho nơi chỉ cần đề, không lưu ngân hàng. */
    public static List<Item> buildItems(List<Flashcard> cards, int size, Random random, List<String> types, Sources sources) {
        return build(cards, size, random, types, sources).stream().map(Built::item).toList();
    }

    /**
     * Sinh đề nhiều loại: mỗi thẻ một câu; loại của thẻ xoay vòng theo types (con trỏ chỉ tiến khi một loại được dùng) trong số
     * loại thẻ đó hỗ trợ; thẻ không hỗ trợ loại nào đã chọn -> câu meaning; meaning cũng không ra được (bộ thẻ < 2 nghĩa khác
     * nhau) -> bỏ thẻ, lấy thẻ kế tiếp. Thẻ hỗ trợ ít nhất một loại đã chọn được ưu tiên vào đề, để chọn "chỉ chia động từ"
     * trên bộ 50 thẻ có 8 động từ thì ra đủ 8 câu chia động từ chứ không phải vài câu tình cờ trúng.
     */
    public static List<Built> build(List<Flashcard> cards, int size, Random random, List<String> types, Sources sources) {
        List<Flashcard> pool = new ArrayList<>(cards);
        Collections.shuffle(pool, random);
        List<String> order = normalizeTypes(types);
        Generator g = new Generator(pool, random, sources == null ? Sources.NONE : sources);

        List<Flashcard> ordered = new ArrayList<>(pool.size());
        List<Flashcard> rest = new ArrayList<>();
        for (Flashcard c : pool) (order.stream().anyMatch(t -> g.supports(c, t)) ? ordered : rest).add(c);
        ordered.addAll(rest);

        int target = Math.min(Math.max(size, 1), pool.size());
        List<Built> out = new ArrayList<>();
        int next = 0;
        for (Flashcard card : ordered) {
            if (out.size() >= target) break;
            Built built = null;
            for (int k = 0; k < order.size() && built == null; k++) {
                built = g.make(card, order.get((next + k) % order.size()));
                if (built != null) next = (next + k + 1) % order.size();
            }
            if (built == null && !order.contains(MEANING)) built = g.make(card, MEANING);
            if (built != null) out.add(built);
        }
        return out;
    }

    /**
     * Chấm trên đúng các câu server đã phát: câu không trả lời = sai, cardId lạ trong answers bị bỏ qua.
     * @param meanings cardId -> nghĩa đúng, lấy từ bản chụp đề của lượt làm
     * @param issued   cardId các câu đã phát (QuizAttempt)
     * @param answers  cardId -> nghĩa người dùng chọn (dữ liệu không đáng tin)
     */
    public static Graded grade(Map<String, String> meanings, List<String> issued, Map<String, String> answers) {
        return grade(issued, answers, cardId -> {
            String correct = meanings.get(cardId);
            return correct == null ? null : correct::equals;
        });
    }

    /** Như trên nhưng chấm theo từng câu của bản chụp ({@link Item#accepts}: câu gõ so sau chuẩn hoá kana). */
    public static Graded grade(List<Item> items, List<String> issued, Map<String, String> answers) {
        Map<String, Item> byCard = new HashMap<>();
        for (Item i : items) byCard.putIfAbsent(i.cardId(), i);
        return grade(issued, answers, cardId -> {
            Item item = byCard.get(cardId);
            return item == null ? null : item::accepts;
        });
    }

    private static Graded grade(List<String> issued, Map<String, String> answers, Function<String, Predicate<String>> checker) {
        int score = 0;
        int total = 0;
        List<String> wrong = new ArrayList<>();
        for (String cardId : issued) {
            Predicate<String> correct = checker.apply(cardId);
            if (correct == null) continue; // thẻ bị xoá sau khi phát đề: không tính vào tổng
            total++;
            if (correct.test(answers.get(cardId))) score++;
            else wrong.add(cardId);
        }
        return new Graded(score, total, wrong);
    }

    // ---------- sinh từng câu ----------

    /** Trạng thái sinh đề của một lượt: kho nghĩa để lấy phương án nhiễu, dữ liệu ngoài, vân tay thẻ đã tính. */
    private static final class Generator {

        private final Random random;
        private final Sources sources;
        /** Các dòng nghĩa chính khác nhau của cả bộ = kho phương án nhiễu của câu nghĩa. */
        private final List<String> headlines;
        private final Map<String, String> hashes = new HashMap<>();

        Generator(List<Flashcard> pool, Random random, Sources sources) {
            this.random = random;
            this.sources = sources;
            LinkedHashSet<String> distinct = new LinkedHashSet<>();
            for (Flashcard c : pool) {
                String h = headline(c.getMeaning());
                if (!h.isEmpty()) distinct.add(h);
            }
            this.headlines = List.copyOf(distinct);
        }

        private String hash(Flashcard card) {
            return hashes.computeIfAbsent(card.getId(), id -> cardHash(card));
        }

        /** Ước lượng rẻ (không sinh câu) để xếp thẻ ưu tiên; quyết định cuối cùng là {@link #make} != null. */
        boolean supports(Flashcard card, String type) {
            boolean direct = switch (type) {
                case MEANING -> !headline(card.getMeaning()).isEmpty() && headlines.size() >= 2;
                case KANJI_LOOKALIKE -> QuizCapabilities.hasKanjiLookalike(card);
                case HOMOPHONE -> QuizCapabilities.hasHomophone(card);
                case READING -> QuizCapabilities.hasReading(card);
                case CONJUGATION -> !conjugations(card).isEmpty();
                default -> false;
            };
            return direct || !current(card, kind(type)).isEmpty();
        }

        /**
         * Một câu loại type cho thẻ, hoặc null nếu thẻ không ra được loại này. Đủ biến thể còn dùng được trong ngân hàng -> bốc
         * một; chưa đủ -> sinh mới: trùng câu đã ẩn thì sinh lại (tối đa {@link #GENERATION_TRIES} lần), trùng câu đang dùng
         * thì dùng lại dòng đó (câu admin đã sửa đáp án vẫn giữ bản sửa), trùng câu cũ sinh từ nội dung thẻ trước khi sửa thì cập
         * nhật dòng đó theo nội dung mới. Trùng nội dung GỐC của một câu admin đã sửa prompt / phương án (extra.supersedes, thẻ
         * chưa đổi) thì phát câu đã sửa — câu sửa mà đã bị ẩn thì coi như nội dung gốc cũng bị ẩn. Sinh không được mà ngân hàng
         * còn câu dùng được -> bốc từ ngân hàng.
         */
        Built make(Flashcard card, String type) {
            String kind = kind(type);
            List<BankEntry> entries = entries(card, kind);
            List<BankEntry> current = current(card, kind);
            if (current.size() >= (CONJUGATION.equals(type) ? CONJUGATION_VARIANTS : BANK_VARIANTS)) {
                return fromEntry(card, type, current.get(random.nextInt(current.size())));
            }
            String hash = hash(card);
            for (int i = 0; i < GENERATION_TRIES; i++) {
                Built fresh = generate(card, type, hash);
                if (fresh == null) break;
                BankEntry same = entries.stream().filter(e -> sameContent(e, fresh.draft())).findFirst().orElse(null);
                if (same == null) {
                    // Câu chọn đúng chữ với ≤ 3 ứng viên, prompt cố định của câu gõ...: sinh lại luôn ra đúng nội dung admin đã sửa
                    // bỏ. Ghi nó thành dòng mới (md5 khác bản sửa nên không va chạm) là phát lại đúng phương án bị báo lỗi.
                    List<BankEntry> edited = supersedingEntries(entries, hash, fresh.draft());
                    if (edited.isEmpty()) return fresh;
                    BankEntry live = edited.stream().filter(e -> !e.hidden() && usable(e)).findFirst().orElse(null);
                    if (live != null) return fromEntry(card, type, live);
                    continue;
                }
                if (same.hidden()) continue;
                if (hash.equals(same.cardHash()) && usable(same)) return fromEntry(card, type, same);
                return new Built(fresh.item().withQuestionId(same.id()), fresh.draft().refreshing(same.id()));
            }
            return current.isEmpty() ? null : fromEntry(card, type, current.get(random.nextInt(current.size())));
        }

        private List<BankEntry> entries(Flashcard card, String kind) {
            return sources.bank().getOrDefault(card.getId(), List.of()).stream().filter(e -> kind.equals(e.kind())).toList();
        }

        /**
         * Câu admin đã sửa mà nội dung trước khi sửa trùng câu vừa sinh. Chỉ tính câu sinh từ đúng nội dung thẻ hiện tại: thẻ đổi
         * thì bản sửa hết hiệu lực (như đáp án admin sửa), nội dung sinh theo thẻ mới được ghi bình thường.
         */
        private static List<BankEntry> supersedingEntries(List<BankEntry> entries, String hash, Draft draft) {
            if (entries.isEmpty()) return entries;
            String key = contentKey(draft.prompt(), draft.options());
            return entries.stream().filter(e -> hash.equals(e.cardHash()) && e.supersedes().contains(key)).toList();
        }

        /** Câu đang dùng (không ẩn), sinh từ đúng nội dung thẻ hiện tại và còn đúng cấu trúc. */
        private List<BankEntry> current(Flashcard card, String kind) {
            List<BankEntry> entries = entries(card, kind);
            if (entries.isEmpty()) return entries;
            String hash = hash(card);
            return entries.stream().filter(e -> !e.hidden() && hash.equals(e.cardHash()) && usable(e)).toList();
        }

        private List<QuizAiClient.ConjugationItem> conjugations(Flashcard card) {
            String term = card.getTerm() == null ? "" : card.getTerm().strip();
            return sources.conjugations().getOrDefault(card.getId(), List.of()).stream()
                    .filter(ci -> ci != null && validChoice(ci.options(), ci.correct()))
                    // Thẻ bị sửa thuật ngữ giữa lúc gọi ai-service và lúc phát đề: câu đó hỏi từ cũ, bỏ
                    .filter(ci -> ci.term() == null || ci.term().strip().equals(term))
                    .toList();
        }

        private Built generate(Flashcard card, String type, String hash) {
            return switch (type) {
                case MEANING -> meaning(card, hash);
                case KANJI_LOOKALIKE -> lookalike(card, hash, QuizCapabilities.KEY_LOOKALIKE);
                case HOMOPHONE -> lookalike(card, hash, QuizCapabilities.KEY_HOMOPHONES);
                case READING -> reading(card, hash);
                case CONJUGATION -> conjugation(card, hash);
                default -> null;
            };
        }

        /** Nghĩa đúng + tối đa 3 nghĩa khác của bộ thẻ, lấy ngẫu nhiên mỗi câu (sinh lại sau câu bị ẩn ra bộ khác). */
        private Built meaning(Flashcard card, String hash) {
            String correct = headline(card.getMeaning());
            if (correct.isEmpty()) return null;
            List<String> others = new ArrayList<>(headlines);
            others.remove(correct);
            // Bộ thẻ chỉ có 1 thẻ / mọi thẻ cùng nghĩa: không ra được câu trắc nghiệm hợp lệ -> không có câu nghĩa
            if (others.isEmpty()) return null;
            Collections.shuffle(others, random);
            List<String> options = new ArrayList<>();
            options.add(correct);
            options.addAll(others.subList(0, Math.min(OPTIONS - 1, others.size())));
            // Prompt lưu = thuật ngữ (admin thấy câu hỏi gì); client không nhận prompt câu nghĩa (null): ở chế độ chỉ nghe,
            // hiện thuật ngữ trong prompt là lộ đề.
            return built(card, MEANING, card.getTerm(), null, options, correct, extra(hash), GENERATOR_RULE, null);
        }

        /** Chọn đúng chữ của thẻ giữa các chữ giống hình (kanjiLookalike) / đồng âm (homophones) trong flashcards.distractors. */
        private Built lookalike(Flashcard card, String hash, String key) {
            String term = card.getTerm() == null ? "" : card.getTerm().strip();
            String meaning = headline(card.getMeaning());
            if (term.isEmpty() || meaning.isEmpty()) return null;
            List<Map<?, ?>> candidates = candidates(card, key, term);
            if (candidates.isEmpty()) return null;
            Collections.shuffle(candidates, random);
            List<String> options = new ArrayList<>();
            options.add(term);
            for (Map<?, ?> c : candidates) {
                if (options.size() >= OPTIONS) break;
                options.add(((String) c.get("term")).strip());
            }
            String reading = card.getReading() != null && !card.getReading().isBlank() ? card.getReading().strip() : null;
            if (reading == null && QuizCapabilities.KEY_HOMOPHONES.equals(key)) {
                // Từ đồng âm do ai-service tìm theo cách đọc nên ứng viên mang đúng cách đọc của thẻ thiếu reading
                reading = candidates.stream().map(c -> c.get("reading")).filter(r -> r instanceof String s && !s.isBlank())
                        .map(r -> ((String) r).strip()).findFirst().orElse(null);
            }
            String hint = reading == null ? "" : " (" + clip(reading) + ")";
            boolean lookalike = QuizCapabilities.KEY_LOOKALIKE.equals(key);
            String prompt = (lookalike ? "Chữ nào có nghĩa '" : "Từ đồng âm nào có nghĩa '") + clip(meaning) + "'" + hint + "?";
            return built(card, lookalike ? KANJI_LOOKALIKE : HOMOPHONE, prompt, prompt, options, term, extra(hash),
                    GENERATOR_AI, null);
        }

        /** Ứng viên có term (khác chữ của thẻ, không trùng nhau) trong JSON do ai-service sinh — không tin kiểu dữ liệu. */
        private static List<Map<?, ?>> candidates(Flashcard card, String key, String term) {
            List<Map<?, ?>> out = new ArrayList<>();
            Set<String> seen = new LinkedHashSet<>();
            seen.add(term);
            if (card.getDistractors() == null || !(card.getDistractors().get(key) instanceof List<?> list)) return out;
            for (Object o : list) {
                if (o instanceof Map<?, ?> m && m.get("term") instanceof String t && !t.isBlank()
                        && t.strip().length() <= CANDIDATE_TERM_MAX && seen.add(t.strip())) {
                    out.add(m);
                }
            }
            return out;
        }

        /**
         * Tự gõ cách đọc: đáp án = reading của thẻ, giữ nguyên chữ để phản hồi hiện đúng cách viết trên thẻ (コーヒー chứ không
         * phải こーひー) — chấm luôn qua chuẩn hoá; thẻ toàn kana không có reading thì chính term là đáp án.
         */
        private Built reading(Flashcard card, String hash) {
            String answer = !KanaUtil.normalize(card.getReading()).isEmpty() ? card.getReading().strip()
                    : KanaUtil.isKanaOnly(card.getTerm()) ? card.getTerm().strip() : null;
            if (answer == null) return null;
            String prompt = "Cách đọc của 「" + clip(card.getTerm().strip()) + "」 là gì?";
            return built(card, READING, prompt, prompt, List.of(), answer, extra(hash), GENERATOR_RULE, null);
        }

        /** Câu chia động từ do ai-service sinh cho thẻ này (QuizAttemptService gọi trước, ngoài transaction). */
        private Built conjugation(Flashcard card, String hash) {
            List<QuizAiClient.ConjugationItem> list = conjugations(card);
            if (list.isEmpty()) return null;
            QuizAiClient.ConjugationItem ci = list.get(random.nextInt(list.size()));
            String prompt = ci.prompt() != null && !ci.prompt().isBlank() ? ci.prompt().strip()
                    : "Thể " + Objects.requireNonNullElse(ci.formLabelVi(), String.valueOf(ci.form())) + " của "
                    + clip(card.getTerm().strip());
            Map<String, Object> extra = extra(hash);
            putIfPresent(extra, "lemma", ci.lemma());
            putIfPresent(extra, "group", ci.group());
            putIfPresent(extra, "form", ci.form());
            putIfPresent(extra, "formLabelVi", ci.formLabelVi());
            putIfPresent(extra, "example", ci.example());
            return built(card, CONJUGATION, prompt, prompt, ci.options().stream().distinct().toList(), ci.correct(), extra,
                    GENERATOR_AI, ci.example());
        }

        private Built built(Flashcard card, String type, String bankPrompt, String shownPrompt, List<String> options,
                            String correct, Map<String, Object> extra, String generator, String example) {
            boolean typing = READING.equals(type);
            List<String> shown = new ArrayList<>(options);
            Collections.shuffle(shown, random);
            List<String> canonical = typing ? null : options.stream().sorted().toList();
            Item item = new Item(card.getId(), card.getTerm(), card.getReading(), typing ? List.of() : List.copyOf(shown),
                    correct, explanation(card.getMeaning()), type, shownPrompt, typing ? TYPING : CHOICE, null, example);
            return new Built(item, new Draft(card.getId(), kind(type), bankPrompt, canonical, correct, extra, generator, null));
        }

        /** Câu bốc từ ngân hàng: phương án trộn lại cho lượt này; lời giải lấy từ thẻ hiện tại. */
        private Built fromEntry(Flashcard card, String type, BankEntry e) {
            boolean typing = READING.equals(type);
            List<String> options = new ArrayList<>(typing || e.options() == null ? List.of() : e.options());
            Collections.shuffle(options, random);
            // Câu nghĩa: prompt lưu = thuật ngữ -> client không nhận; admin viết prompt khác thì mới hiện
            String prompt = MEANING.equals(type)
                    && (e.prompt() == null || e.prompt().isBlank() || e.prompt().equals(card.getTerm())) ? null : e.prompt();
            String example = e.extra() != null && e.extra().get("example") instanceof String s ? s : null;
            Item item = new Item(card.getId(), card.getTerm(), card.getReading(), List.copyOf(options), e.correct(),
                    explanation(card.getMeaning()), type, prompt, typing ? TYPING : CHOICE, e.id(), example);
            return new Built(item, null);
        }

        private static Map<String, Object> extra(String hash) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put(EXTRA_CARD_HASH, hash);
            return m;
        }
    }

    /** Cùng nội dung theo đúng khoá unique của quiz_questions (prompt + options, không kể thứ tự phương án). */
    static boolean sameContent(BankEntry e, Draft d) {
        return Objects.equals(e.prompt(), d.prompt()) && Objects.equals(canonical(e.options()), d.options());
    }

    /** Dòng ngân hàng còn đúng cấu trúc (admin PATCH đã kiểm, đây chỉ phòng dữ liệu sửa tay trong DB). */
    static boolean usable(BankEntry e) {
        if (e.prompt() == null || e.correct() == null || e.correct().isBlank()) return false;
        if (kind(READING).equals(e.kind())) return e.options() == null || e.options().isEmpty();
        return validChoice(e.options(), e.correct());
    }

    private static boolean validChoice(Collection<String> options, String correct) {
        if (options == null || correct == null || correct.isBlank()) return false;
        Set<String> distinct = new LinkedHashSet<>(options);
        return distinct.size() >= 2 && !distinct.contains(null) && distinct.contains(correct);
    }

    private static List<String> canonical(List<String> options) {
        return options == null || options.isEmpty() ? null : options.stream().sorted().toList();
    }

    private static String clip(String s) {
        return s.length() <= PROMPT_PART_MAX ? s : s.substring(0, PROMPT_PART_MAX) + "…";
    }

    private static void putIfPresent(Map<String, Object> m, String key, String value) {
        if (value != null && !value.isBlank()) m.put(key, value);
    }
}
