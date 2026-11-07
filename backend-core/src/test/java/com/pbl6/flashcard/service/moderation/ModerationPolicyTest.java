package com.pbl6.flashcard.service.moderation;

import com.pbl6.flashcard.dto.moderation.ModerationDtos.Signal;
import com.pbl6.flashcard.dto.moderation.ModerationDtos.Span;
import com.pbl6.flashcard.dto.moderation.ModerationDtos.Verdict;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Bảng quyết định §4 của spec 2026-10-27 đêm + che từ. */
class ModerationPolicyTest {

    private static Signal sig(int label, double p0, double p1, double p2, Span... spans) {
        return new Signal(label, List.of(p0, p1, p2), List.of(p0, p1, p2).get(label), List.of(spans), spans.length > 0, false);
    }

    private static Span span(String w, double score) {
        return new Span(w, -1, -1, score);
    }

    @Test
    void hate_with_strong_p2_and_a_span_is_blocked_unless_entry_is_sensitive() {
        Signal s = sig(2, 0.05, 0.1, 0.85, span("chó", 0.99));
        assertEquals(Verdict.BLOCKED, ModerationPolicy.decide(s, false));
        assertEquals(Verdict.FLAGGED, ModerationPolicy.decide(s, true), "mục từ tục: chỉ gắn cờ");
    }

    @Test
    void hate_without_span_or_with_weak_p2_is_only_flagged() {
        assertEquals(Verdict.FLAGGED, ModerationPolicy.decide(sig(2, 0.1, 0.1, 0.8), false), "không có từ đánh dấu");
        assertEquals(Verdict.FLAGGED, ModerationPolicy.decide(sig(2, 0.2, 0.2, 0.6, span("chó", 0.99)), false), "p2 < 0,8");
        assertEquals(Verdict.FLAGGED, ModerationPolicy.decide(sig(2, 0.05, 0.1, 0.85, span("chó", 0.3)), false), "span dưới 0,5 không tính");
    }

    @Test
    void offensive_is_flagged_and_clean_needs_a_strong_span_to_be_flagged() {
        assertEquals(Verdict.FLAGGED, ModerationPolicy.decide(sig(1, 0.3, 0.6, 0.1), false));
        assertEquals(Verdict.CLEAN, ModerationPolicy.decide(sig(0, 0.9, 0.08, 0.02), false));
        assertEquals(Verdict.CLEAN, ModerationPolicy.decide(sig(0, 0.9, 0.08, 0.02, span("mày", 0.7)), false), "span 0,7 chưa 'rất chắc'");
        assertEquals(Verdict.FLAGGED, ModerationPolicy.decide(sig(0, 0.9, 0.08, 0.02, span("vãi", 0.95)), false));
        assertEquals(Verdict.CLEAN, ModerationPolicy.decide(null, false));
    }

    @Test
    void mask_uses_positions_then_words_and_keeps_first_character() {
        String text = "Mày viết cái gì vậy, vl thật";
        String masked = ModerationPolicy.mask(text, List.of(new Span("Mày", 0, 3, 0.99), new Span("vl", 21, 23, 0.99)));
        assertEquals("M∗∗ viết cái gì vậy, v∗ thật", masked);
        // không có vị trí: thay theo từ (không phân biệt hoa thường, cả từ ghép `_`)
        assertEquals("Đ∗ n∗∗, k∗∗∗∗∗∗∗∗ nhé", ModerationPolicy.mask("Đồ ngu, khuất mắt nhé",
                List.of(span("ngu", 0.9), span("đồ", 0.9), span("khuất_mắt", 0.9))), "từ ghép pyvi che cả cụm");
        assertEquals("x", ModerationPolicy.mask("x", List.of()));
        assertNull(ModerationPolicy.mask(null, List.of(span("a", 1))));
        // vị trí ngoài chuỗi → bỏ qua, không ném
        assertEquals("abc", ModerationPolicy.mask("abc", List.of(new Span("zzz", 10, 13, 0.9))));
    }

    @Test
    void mask_word_single_char_and_overlaps() {
        assertEquals("a∗", ModerationPolicy.maskWord("a"), "từ 1 ký tự vẫn giữ ký tự đầu + 1 dấu");
        assertEquals("c∗∗", ModerationPolicy.maskWord("chó"));
        String out = ModerationPolicy.mask("thằng chó", List.of(new Span("thằng chó", 0, 9, 0.9), new Span("chó", 6, 9, 0.9)));
        assertEquals("t∗∗∗∗∗∗∗∗", out, "span chồng lấn chỉ che một lần");
    }

    @Test
    void messages() {
        assertTrue(ModerationPolicy.message("BLOCKED", List.of("chó")).contains("chó"));
        assertTrue(ModerationPolicy.message("FLAGGED", List.of()).contains("quản trị viên"));
        assertTrue(ModerationPolicy.message("PENDING", null).contains("AI"));
        assertNull(ModerationPolicy.message("CLEAN", null));
    }
}
