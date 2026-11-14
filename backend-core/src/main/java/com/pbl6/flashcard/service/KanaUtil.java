package com.pbl6.flashcard.service;

import java.text.Normalizer;
import java.util.Locale;

/**
 * Chuẩn hoá kana cho câu hỏi tự gõ cách đọc (quiz loại reading, hợp đồng đợt 2 §1.2): người học gõ katakana, nửa độ rộng, có
 * khoảng trắng hay dấu câu thì vẫn được chấm như cách đọc lưu trên thẻ. Hai phía (đáp án đúng và câu trả lời) luôn qua cùng
 * {@link #normalize} rồi mới so, nên quy tắc ở đây chỉ cần nhất quán, không cần "đúng ngữ pháp".
 */
public final class KanaUtil {

    private KanaUtil() {}

    /** Khoảng cách giữa katakana và hiragana tương ứng trong Unicode (ア U+30A2 -> あ U+3042). */
    private static final int KATA_HIRA_OFFSET = 0x60;
    /** Dấu kéo dài ー: thuộc nhóm "modifier letter" chứ không phải dấu câu, phải giữ (コーヒー -> こーひー, không thành こひ). */
    private static final char PROLONGED_SOUND = 'ー';

    /**
     * NFKC (katakana nửa độ rộng ｶﾞ -> ガ, chữ Latin toàn độ rộng -> thường) -> katakana thành hiragana -> bỏ khoảng trắng, ký tự
     * điều khiển / định dạng (zero-width) và mọi dấu câu Unicode (、。・「」 〜 ...) -> chữ Latin viết thường (cách đọc romaji của
     * thẻ tay). null -> "".
     */
    public static String normalize(String s) {
        if (s == null || s.isEmpty()) return "";
        String nfkc = Normalizer.normalize(s, Normalizer.Form.NFKC);
        StringBuilder out = new StringBuilder(nfkc.length());
        nfkc.codePoints().forEach(cp -> {
            if (removable(cp)) return;
            out.appendCodePoint(toHiragana(cp));
        });
        return out.toString().toLowerCase(Locale.ROOT);
    }

    /** Chỉ đổi katakana thành hiragana, giữ nguyên mọi ký tự khác (kể cả khoảng trắng). null -> null. */
    public static String toHiragana(String s) {
        if (s == null) return null;
        StringBuilder out = new StringBuilder(s.length());
        s.codePoints().forEach(cp -> out.appendCodePoint(toHiragana(cp)));
        return out.toString();
    }

    /**
     * Thuật ngữ chỉ gồm kana (sau {@link #normalize}, nên katakana, ー và dấu câu xen giữa vẫn tính): khi đó chính thuật ngữ là
     * cách đọc, thẻ không có reading vẫn ra được câu tự gõ. Chuỗi rỗng / null -> false.
     */
    public static boolean isKanaOnly(String s) {
        String n = normalize(s);
        if (n.isEmpty()) return false;
        return n.codePoints().allMatch(KanaUtil::isKana);
    }

    /**
     * Kết thúc bằng kana hàng う (う く ぐ す つ ぬ ぶ む る, katakana cũng tính): hình thức từ điển của động từ. Chỉ là bộ lọc thô
     * để chọn ứng viên gửi ai-service khi thẻ thiếu từ loại; ai-service mới quyết định có chia được hay không.
     */
    public static boolean endsWithURowKana(String s) {
        String n = normalize(s);
        if (n.isEmpty()) return false;
        int last = n.codePointBefore(n.length());
        return "うくぐすつぬぶむる".indexOf(last) >= 0;
    }

    private static int toHiragana(int cp) {
        // ァ (U+30A1) .. ヶ (U+30F6) và hai dấu lặp ヽ ヾ có bản hiragana cách đúng 0x60; ヷ..ヺ, ー, ・ không có -> giữ nguyên
        if ((cp >= 0x30A1 && cp <= 0x30F6) || cp == 0x30FD || cp == 0x30FE) return cp - KATA_HIRA_OFFSET;
        return cp;
    }

    private static boolean isKana(int cp) {
        return (cp >= 0x3041 && cp <= 0x309F)   // hiragana (gồm ゝ ゞ ゟ và dấu ゛ ゜ rời)
                || (cp >= 0x30A0 && cp <= 0x30FF) // katakana còn lại sau khi đổi (ヷ..ヺ, ー)
                || (cp >= 0x31F0 && cp <= 0x31FF); // katakana mở rộng (tiếng Ainu)
    }

    private static boolean removable(int cp) {
        if (cp == PROLONGED_SOUND) return false;
        if (Character.isWhitespace(cp) || Character.isSpaceChar(cp)) return true;
        switch (Character.getType(cp)) {
            case Character.CONTROL, Character.FORMAT,
                 Character.CONNECTOR_PUNCTUATION, Character.DASH_PUNCTUATION, Character.START_PUNCTUATION,
                 Character.END_PUNCTUATION, Character.INITIAL_QUOTE_PUNCTUATION, Character.FINAL_QUOTE_PUNCTUATION,
                 Character.OTHER_PUNCTUATION -> {
                return true;
            }
            default -> {
                // ～ toàn độ rộng qua NFKC thành "~" (nhóm ký hiệu toán, không phải dấu câu) nhưng trên thẻ ngữ pháp nó chính là
                // 〜 (dấu câu) -> bỏ cả hai để 〜ている và ～ている so bằng nhau.
                return cp == '~';
            }
        }
    }
}
