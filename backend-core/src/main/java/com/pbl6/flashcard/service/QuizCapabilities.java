package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.deck.QuizCapabilitiesResponse;
import com.pbl6.flashcard.model.Flashcard;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Thẻ nào ra được câu hỏi loại nào (hợp đồng đợt 2 §1.2). Hàm thuần, dùng chung cho GET /api/decks/{id}/quiz-capabilities và
 * cho bước sinh đề, để con số hiện trên màn chọn loại câu hỏi khớp với đề thật.
 * <ul>
 *   <li>meaning: dòng nghĩa chính không rỗng; cả bộ cần ≥ 2 nghĩa khác nhau mới có phương án sai, không đủ thì 0 thẻ.</li>
 *   <li>kanji_lookalike / homophone: flashcards.distractors có ≥ 1 ứng viên loại đó (POST /api/decks/{id}/distractors sinh).
 *       1 ứng viên đã đủ cho câu 2 lựa chọn.</li>
 *   <li>reading: có cách đọc, hoặc thuật ngữ toàn kana (chính nó là cách đọc) — so sánh sau {@link KanaUtil#normalize}.</li>
 *   <li>conjugation: {@link #isVerbCandidate} — đúng điều kiện chọn thẻ gửi ai-service khi phát đề (QuizAttemptService):
 *       pos là động từ (動詞...), hoặc thẻ từ vựng thiếu pos (thẻ tay) mà đuôi hàng う ("ai-service xác định được nhóm"). Biết
 *       chắc phải gọi ai-service — GET này không gọi, nên số đếm có thể dư vài danh từ như いす (lúc làm bài ai-service bỏ, thẻ đó
 *       ra loại khác / câu nghĩa). Đếm dư mới đúng chiều: đếm thiếu thì frontend khoá hẳn loại này (số 0) cho bộ thẻ tay dù đề
 *       thật ra được.</li>
 * </ul>
 */
public final class QuizCapabilities {

    private QuizCapabilities() {}

    static final String VERB_POS = "動詞";
    static final String KEY_LOOKALIKE = "kanjiLookalike";
    static final String KEY_HOMOPHONES = "homophones";

    public static QuizCapabilitiesResponse count(List<Flashcard> cards) {
        int lookalike = 0;
        int homophone = 0;
        int reading = 0;
        int conjugation = 0;
        for (Flashcard c : cards) {
            if (hasKanjiLookalike(c)) lookalike++;
            if (hasHomophone(c)) homophone++;
            if (hasReading(c)) reading++;
            if (isVerbCandidate(c)) conjugation++;
        }
        return new QuizCapabilitiesResponse(meaningQuestions(cards.stream().map(Flashcard::getMeaning).toList()), lookalike,
                homophone, reading, conjugation);
    }

    /**
     * Số câu nghĩa một bộ thẻ ra được từ nội dung các thẻ: thẻ có dòng nghĩa chính không rỗng, nhưng cả bộ cần ≥ 2 nghĩa khác
     * nhau mới có phương án sai — không đủ thì 0. Dùng chung cho quiz-capabilities và lộ trình (LearningPathService: chương nào ra
     * được bài kiểm tra đủ cỡ để vào mẫu số "N/M chương đã qua kiểm tra").
     */
    public static int meaningQuestions(Iterable<String> meanings) {
        int n = 0;
        Set<String> headlines = new HashSet<>();
        for (String m : meanings) {
            String h = QuizService.headline(m);
            if (h.isEmpty()) continue;
            n++;
            headlines.add(h);
        }
        return headlines.size() >= 2 ? n : 0;
    }

    public static boolean hasKanjiLookalike(Flashcard c) {
        return hasCandidates(c.getDistractors(), KEY_LOOKALIKE);
    }

    public static boolean hasHomophone(Flashcard c) {
        return hasCandidates(c.getDistractors(), KEY_HOMOPHONES);
    }

    public static boolean hasReading(Flashcard c) {
        return !KanaUtil.normalize(c.getReading()).isEmpty() || KanaUtil.isKanaOnly(c.getTerm());
    }

    /** pos là pos1 của Sudachi ("動詞"); startsWith để nhận cả dạng chi tiết "動詞-一般" nếu sau này lưu đủ. */
    public static boolean isVerb(Flashcard c) {
        return c.getPos() != null && c.getPos().strip().startsWith(VERB_POS);
    }

    /**
     * Thẻ được gửi ai-service để sinh câu chia động từ (và được đếm ở quiz-capabilities): pos là động từ, hoặc thẻ từ vựng chưa
     * có pos mà kết thúc bằng kana hàng う (hình thức từ điển). Thẻ có pos khác động từ thì tin pos, không đoán theo đuôi.
     */
    public static boolean isVerbCandidate(Flashcard c) {
        if (isVerb(c)) return true;
        return (c.getPos() == null || c.getPos().isBlank()) && !Flashcard.KIND_GRAMMAR.equals(c.getKind())
                && KanaUtil.endsWithURowKana(c.getTerm());
    }

    /** JSON do ai-service sinh: không tin kiểu, phần tử phải là object có term. */
    private static boolean hasCandidates(Map<String, Object> distractors, String key) {
        if (distractors == null || !(distractors.get(key) instanceof List<?> list)) return false;
        for (Object o : list) {
            if (o instanceof Map<?, ?> m && m.get("term") instanceof String t && !t.isBlank()) return true;
        }
        return false;
    }
}
