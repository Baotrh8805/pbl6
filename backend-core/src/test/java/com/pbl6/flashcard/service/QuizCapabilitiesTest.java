package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.deck.DeckRequest;
import com.pbl6.flashcard.dto.deck.QuizCapabilitiesResponse;
import com.pbl6.flashcard.model.ExtractionItem;
import com.pbl6.flashcard.model.Flashcard;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class QuizCapabilitiesTest {

    private static Flashcard card(String term, String reading, String meaning, String pos) {
        Flashcard c = new Flashcard();
        c.setId(term);
        c.setTerm(term);
        c.setReading(reading);
        c.setMeaning(meaning);
        c.setPos(pos);
        return c;
    }

    @Test
    void meaning_questions_need_two_distinct_headlines() { // lộ trình dùng số này để biết chương có bài kiểm tra đủ cỡ không
        assertEquals(0, QuizCapabilities.meaningQuestions(List.of()));
        assertEquals(0, QuizCapabilities.meaningQuestions(List.of("viết")), "1 thẻ: không có phương án sai");
        assertEquals(0, QuizCapabilities.meaningQuestions(List.of("viết\nví dụ 1", "  \nviết\nví dụ 2")),
                "chỉ dòng nghĩa chính tính: hai thẻ cùng 'viết' = một nghĩa");
        assertEquals(3, QuizCapabilities.meaningQuestions(List.of("viết", "viết", "đọc")), "đủ 2 nghĩa: mọi thẻ có nghĩa ra câu");
        assertEquals(2, QuizCapabilities.meaningQuestions(java.util.Arrays.asList("viết", " \n ", null, "đọc")),
                "thẻ không có dòng nghĩa nào không ra câu");
        assertEquals(3, QuizCapabilities.count(List.of(card("書く", "かく", "viết", null), card("読む", "よむ", "đọc", null),
                card("見る", "みる", "viết", null))).meaning(), "quiz-capabilities đếm cùng một cách");
    }

    @Test
    void reading_needs_reading_or_kana_only_term() {
        assertTrue(QuizCapabilities.hasReading(card("書く", "かく", "viết", null)));
        assertTrue(QuizCapabilities.hasReading(card("コーヒー", null, "cà phê", null)));
        assertFalse(QuizCapabilities.hasReading(card("書く", null, "viết", null)));
        assertFalse(QuizCapabilities.hasReading(card("書く", " 。 ", "viết", null)), "reading chỉ có dấu câu = không có");
    }

    @Test
    void is_verb_reads_pos_only() {
        assertTrue(QuizCapabilities.isVerb(card("書く", "かく", "viết", "動詞")));
        assertTrue(QuizCapabilities.isVerb(card("書く", "かく", "viết", "動詞-一般")));
        assertFalse(QuizCapabilities.isVerb(card("書く", "かく", "viết", null)));
        assertFalse(QuizCapabilities.isVerb(card("勉強", "べんきょう", "học", "名詞")));
        assertFalse(QuizCapabilities.isVerb(card("ない", null, "không", "助動詞")));
    }

    @Test
    void verb_candidate_trusts_pos_and_guesses_u_row_ending_only_without_pos() {
        assertTrue(QuizCapabilities.isVerbCandidate(card("書く", "かく", "viết", "動詞")));
        assertTrue(QuizCapabilities.isVerbCandidate(card("書く", "かく", "viết", null)), "thẻ tay thiếu pos: đoán theo đuôi");
        assertTrue(QuizCapabilities.isVerbCandidate(card("食べる", null, "ăn", " ")), "pos rỗng = thiếu");
        assertTrue(QuizCapabilities.isVerbCandidate(card("いす", null, "ghế", null)), "đếm dư danh từ: ai-service bỏ lúc làm bài");
        assertFalse(QuizCapabilities.isVerbCandidate(card("いす", null, "ghế", "名詞")), "có pos khác động từ: tin pos");
        assertFalse(QuizCapabilities.isVerbCandidate(card("学校", "がっこう", "trường học", null)));
        Flashcard grammar = card("～ている", null, "đang", null);
        grammar.setKind(Flashcard.KIND_GRAMMAR);
        assertFalse(QuizCapabilities.isVerbCandidate(grammar), "thẻ ngữ pháp không chia");
    }

    @Test
    void distractor_kinds_need_a_candidate_with_term() {
        Flashcard c = card("書く", "かく", "viết", null);
        assertFalse(QuizCapabilities.hasKanjiLookalike(c), "null = chưa sinh");
        Map<String, Object> d = new HashMap<>();
        d.put("kanjiLookalike", List.of(Map.of("term", "昼")));
        d.put("homophones", List.of());
        c.setDistractors(d);
        assertTrue(QuizCapabilities.hasKanjiLookalike(c));
        assertFalse(QuizCapabilities.hasHomophone(c));
        d.put("homophones", List.of(Map.of("reading", "かく"), "rác"));
        assertFalse(QuizCapabilities.hasHomophone(c), "phần tử không có term / không phải object: bỏ qua");
        d.put("kanjiLookalike", "không phải danh sách");
        assertFalse(QuizCapabilities.hasKanjiLookalike(c));
    }

    @Test
    void count_aggregates_and_meaning_needs_two_distinct_headlines() {
        Flashcard verb = card("書く", "かく", "viết\nví dụ", "動詞");
        verb.setDistractors(Map.of("kanjiLookalike", List.of(Map.of("term", "昼")), "homophones", List.of(Map.of("term", "欠く"))));
        QuizCapabilitiesResponse r = QuizCapabilities.count(List.of(verb, card("学校", null, "trường học", null)));
        assertEquals(new QuizCapabilitiesResponse(2, 1, 1, 1, 1), r);

        assertEquals(0, QuizCapabilities.count(List.of(card("犬", null, "chó", null), card("狗", null, "chó\nkhác", null)))
                .meaning());
        assertEquals(0, QuizCapabilities.count(List.of(card("犬", null, "chó", null))).meaning());
        assertEquals(new QuizCapabilitiesResponse(0, 0, 0, 0, 0), QuizCapabilities.count(List.of()));
    }

    @Test
    void manual_deck_without_pos_still_counts_conjugation() {
        // Bộ thẻ tay (pos luôn null): số 0 làm frontend khoá loại "Chia thể động từ" dù đề thật gửi các thẻ này cho ai-service
        QuizCapabilitiesResponse r = QuizCapabilities.count(List.of(card("食べる", null, "ăn", null),
                card("飲む", null, "uống", null), card("学校", null, "trường học", null)));
        assertEquals(2, r.conjugation());
    }

    @Test
    void extraction_card_carries_pos() {
        ExtractionItem i = new ExtractionItem();
        i.setKind(ExtractionItem.VOCAB);
        i.setTerm("書く");
        i.setReading("かく");
        i.setMeaningVi("viết");
        i.setPos("動詞");
        DeckRequest.Card card = ExtractionService.toCard(i);
        assertEquals("動詞", card.pos());
        assertEquals("書く", card.term());
        i.setPos(null);
        assertNull(ExtractionService.toCard(i).pos());
    }
}
