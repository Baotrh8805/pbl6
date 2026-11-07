package com.pbl6.flashcard.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Câu mẫu của MnemonicTemplate phải trùng từng ký tự với radicals.template_mnemonic của ai-service: chuỗi kỳ vọng dưới đây sinh
 * bằng chính bản Python (ai-service venv, 19/10/2026). Đổi mẫu ở ai-service mà quên sửa bản Java thì test này đỏ.
 */
class MnemonicTemplateTest {

    private static final String W_NAME = "thủy";
    private static final String W_MEANING = "nước, sông";

    @Test
    void full_template_matches_python_and_is_deterministic() {
        String expected = "Chữ 海 có bộ Thủy (nước), âm Hán-Việt HẢI, nghĩa tiếng Anh \"sea\": thấy nước là nhớ HẢI.";
        assertEquals(expected, MnemonicTemplate.of("海", W_NAME, W_MEANING, "HẢI", "sea; ocean"));
        // âm được chuẩn hoá viết hoa, ghi chú trong ngoặc của nghĩa bị bỏ
        assertEquals(expected, MnemonicTemplate.of("海", W_NAME, W_MEANING, "hải ", "sea (body of water); ocean"));
        assertEquals("Nhớ 河 bằng công thức: bộ Thủy (nước) + âm HÀ, nghĩa tiếng Anh \"river\".",
                MnemonicTemplate.of("河", W_NAME, W_MEANING, "HÀ", "river, stream"));
        assertEquals("Chữ 湖 (HỒ) thuộc bộ Thủy: nước gợi nhớ HỒ.", MnemonicTemplate.of("湖", W_NAME, W_MEANING, "HỒ", null));
        assertEquals("DU — chữ 油 mang bộ Thủy nghĩa là nước, nghĩa tiếng Anh \"oil\"; hình dung nước rồi đọc to DU.",
                MnemonicTemplate.of("油", W_NAME, W_MEANING, "DU", "oil; fat"));
        assertEquals("Chữ 泳 (VỊNH) thuộc bộ Thủy: nước gợi nhớ VỊNH, nghĩa tiếng Anh \"swimming\".",
                MnemonicTemplate.of("泳", W_NAME, W_MEANING, "VỊNH", "swimming"));
        assertEquals("Chữ 深 có bộ Thủy (nước), âm Hán-Việt THÂM, nghĩa tiếng Anh \"deep\": thấy nước là nhớ THÂM.",
                MnemonicTemplate.of("深", W_NAME, W_MEANING, "THÂM", "deep"));
        assertEquals("Thấy bộ Nhân (người) trong chữ 人, đọc ngay NHÂN, nghĩa tiếng Anh \"man\".",
                MnemonicTemplate.of("人", "nhân", "người", "NHÂN", "counter for people; man, person"));
    }

    @Test
    void degrades_to_smaller_templates_when_data_is_missing() {
        assertEquals("Nhớ 池 qua bộ Thủy: nước, nghĩa tiếng Anh \"pond\".", MnemonicTemplate.of("池", W_NAME, W_MEANING, null, "pond"));
        assertEquals("Chữ 海 đọc Hán-Việt là HẢI, nghĩa tiếng Anh \"sea\": nhìn chữ, đọc to HẢI ba lần.",
                MnemonicTemplate.of("海", null, null, "HẢI", "sea"));
        assertEquals("Chữ 龘: viết lại ba lần và đọc to nghĩa để nhớ mặt chữ.", MnemonicTemplate.of("龘", null, null, null, null));
        // tên bộ rỗng = không có bộ
        assertEquals("Chữ 字 đọc Hán-Việt là TỰ, nghĩa tiếng Anh \"character\": nhìn chữ, đọc to TỰ ba lần.",
                MnemonicTemplate.of("字", "", "con", "TỰ", "character"));
    }

    @Test
    void affix_glosses_are_dropped_and_non_bmp_kanji_hash_like_python() {
        assertEquals("HỒI là âm của chữ 回 — gắn HỒI với hình chữ để nhớ.",
                MnemonicTemplate.of("回", null, null, "HỒI", "-times; counter for occurrences"));
        assertEquals("NGỰ là âm của chữ 御 — gắn NGỰ với hình chữ để nhớ.",
                MnemonicTemplate.of("御", null, null, "NGỰ", "Honorific prefix; Our ~"));
        assertEquals("SẤT là âm của chữ 𠮟, nghĩa tiếng Anh \"scold\" — gắn SẤT với hình chữ để nhớ.",
                MnemonicTemplate.of("𠮟", null, null, "SẤT", "scold (strongly (very)); rebuke"));
        assertNull(MnemonicTemplate.cleanMeaning("-ian (e.g. Italian); -er"));
        assertEquals("a time, an instance", MnemonicTemplate.cleanMeaning("counter for occurrences; a time, an instance"));
    }

    @Test
    void long_inputs_are_clipped_like_python() {
        assertEquals("NGỮ — chữ 語 mang bộ Ngôn nghĩa là nói, nghĩa tiếng Anh \"a remarkably long English gloss that ke…\"; "
                        + "hình dung nói rồi đọc to NGỮ.",
                MnemonicTemplate.of("語", "ngôn", "nói; lời", "NGỮ", "a remarkably long English gloss that keeps going and going, second"));
        String clipped = MnemonicTemplate.of("波", "a".repeat(120), "b".repeat(120), "BA", "wave");
        assertEquals("Chữ 波 có bộ A" + "a".repeat(119) + " (" + "b".repeat(65) + "…", clipped);
        assertTrue(clipped.codePointCount(0, clipped.length()) <= MnemonicTemplate.MAX_CHARS);
    }
}
