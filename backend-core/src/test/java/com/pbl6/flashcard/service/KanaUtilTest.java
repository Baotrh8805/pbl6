package com.pbl6.flashcard.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class KanaUtilTest {

    @Test
    void katakana_and_half_width_become_hiragana() {
        assertEquals("かめら", KanaUtil.normalize("カメラ"));
        assertEquals("がっこう", KanaUtil.normalize("ｶﾞｯｺｳ"), "nửa độ rộng + dakuten rời ghép lại qua NFKC");
        assertEquals("ゔぁいおりん", KanaUtil.normalize("ヴァイオリン"));
        assertEquals("ゕゖ", KanaUtil.normalize("ヵヶ"));
        assertEquals("いすゞ", KanaUtil.normalize("イスヾ"), "dấu lặp katakana cũng đổi");
        assertEquals(KanaUtil.normalize("まつ"), KanaUtil.normalize("マツ"));
    }

    @Test
    void prolonged_sound_mark_is_kept() {
        assertEquals("こーひー", KanaUtil.normalize("コーヒー"));
        assertNotEquals(KanaUtil.normalize("こひ"), KanaUtil.normalize("コーヒー"));
    }

    @Test
    void whitespace_and_punctuation_are_stripped() {
        assertEquals("たべる", KanaUtil.normalize("  た べ る\t\n"));
        assertEquals("たべる", KanaUtil.normalize("た　べる"), "khoảng trắng toàn độ rộng");
        assertEquals("たべる", KanaUtil.normalize("「たべる。」"));
        assertEquals("たべる", KanaUtil.normalize("た、べ・る！？"));
        assertEquals("たべる", KanaUtil.normalize("たべ​る"), "zero-width space");
        assertEquals("ている", KanaUtil.normalize("〜ている"), "wave dash");
        assertEquals("ている", KanaUtil.normalize("～テイル"), "fullwidth tilde -> ~ qua NFKC");
        assertEquals("ている", KanaUtil.normalize("~ている"));
    }

    @Test
    void latin_is_folded_for_romaji_readings() {
        assertEquals("kaihatsu", KanaUtil.normalize(" Kaihatsu "));
        assertEquals("kaihatsu", KanaUtil.normalize("ＫＡＩＨＡＴＳＵ"), "chữ Latin toàn độ rộng");
    }

    @Test
    void kanji_is_left_untouched() {
        assertEquals("食べる", KanaUtil.normalize("食べる"));
        assertEquals("々", KanaUtil.normalize("々"));
    }

    @Test
    void null_and_blank() {
        assertEquals("", KanaUtil.normalize(null));
        assertEquals("", KanaUtil.normalize(""));
        assertEquals("", KanaUtil.normalize(" 。、 "));
        assertNull(KanaUtil.toHiragana(null));
    }

    @Test
    void to_hiragana_only_changes_katakana() {
        assertEquals("か め ら!", KanaUtil.toHiragana("カ メ ラ!"));
        assertEquals("ー・", KanaUtil.toHiragana("ー・"));
        assertEquals("ヷ", KanaUtil.toHiragana("ヷ"), "không có hiragana tương ứng: giữ nguyên");
    }

    @Test
    void kana_only_detection() {
        assertTrue(KanaUtil.isKanaOnly("すし"));
        assertTrue(KanaUtil.isKanaOnly("コーヒー"));
        assertTrue(KanaUtil.isKanaOnly("ありがとう。"), "dấu câu không tính");
        assertTrue(KanaUtil.isKanaOnly("ｶﾒﾗ"));
        assertFalse(KanaUtil.isKanaOnly("食べる"));
        assertFalse(KanaUtil.isKanaOnly("人々"));
        assertFalse(KanaUtil.isKanaOnly("Tシャツ"));
        assertFalse(KanaUtil.isKanaOnly("abc"));
        assertFalse(KanaUtil.isKanaOnly(""));
        assertFalse(KanaUtil.isKanaOnly(null));
        assertFalse(KanaUtil.isKanaOnly("。"));
    }

    @Test
    void u_row_ending() {
        assertTrue(KanaUtil.endsWithURowKana("書く"));
        assertTrue(KanaUtil.endsWithURowKana("泳ぐ"));
        assertTrue(KanaUtil.endsWithURowKana("食べる"));
        assertTrue(KanaUtil.endsWithURowKana("待つ "));
        assertTrue(KanaUtil.endsWithURowKana("シル"), "katakana cũng tính");
        assertFalse(KanaUtil.endsWithURowKana("学校"));
        assertFalse(KanaUtil.endsWithURowKana("きれい"));
        assertFalse(KanaUtil.endsWithURowKana(""));
        assertFalse(KanaUtil.endsWithURowKana(null));
    }
}
