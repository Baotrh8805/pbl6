package com.pbl6.flashcard.service.dictionary;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.Set;
import java.util.regex.Pattern;

/**
 * Khoá mục từ điển (spec 2026-10-26-tu-dien-design §3), hàm thuần.
 * <ul>
 *   <li>{@code w:<id>}: mục JMdict (id số, ổn định giữa các bản JMdict) — dữ liệu gốc ở ai-service;</li>
 *   <li>{@code w:jlpt:<dạng viết>|<cách đọc>}: từ JLPT không khớp JMdict — chỉ có nghĩa Việt dịch sẵn;</li>
 *   <li>{@code k:<chữ>}: một chữ Hán (thẻ chữ Hán của ai-service).</li>
 * </ul>
 */
public final class DictionaryKeys {

    public static final int MAX_LEN = 64;
    private static final Pattern WORD = Pattern.compile("^w:(\\d{1,10})$");
    private static final Pattern JLPT = Pattern.compile("^w:jlpt:([^|]{1,24})\\|([^|]{0,24})$");
    private static final Pattern KANJI = Pattern.compile("^k:([\\x{4E00}-\\x{9FFF}\\x{3400}-\\x{4DBF}\\x{F900}-\\x{FAFF}])$");
    /** Trường người học được báo lỗi (dict_reports.field). */
    public static final Set<String> REPORT_FIELDS = Set.of("reading", "han_viet", "meaning_vi", "meaning_en", "kanji_meaning",
            "example", "example_vi", "other");
    /** Trường của lớp ghi đè (dict_overrides.field, khớp ai-service overrides.FIELDS). */
    public static final Set<String> OVERRIDE_FIELDS = Set.of("reading", "han_viet", "meaning_en", "kanji_meaning", "example_jpn",
            "example_eng", "example_hidden");

    public enum Kind { WORD, JLPT, KANJI }

    public record Key(String raw, Kind kind, String value, String reading) {
        public boolean isWord() { return kind != Kind.KANJI; }
        /** id JMdict (chỉ với WORD). */
        public String wordId() { return kind == Kind.WORD ? value : null; }
        /** Chữ Hán (chỉ với KANJI). */
        public String kanji() { return kind == Kind.KANJI ? value : null; }
    }

    private DictionaryKeys() {}

    /** Khoá hợp lệ → Key; sai dạng → null. */
    public static Key tryParse(String raw) {
        if (raw == null || raw.isEmpty() || raw.length() > MAX_LEN) return null;
        var m = WORD.matcher(raw);
        if (m.matches()) return new Key(raw, Kind.WORD, m.group(1), null);
        m = JLPT.matcher(raw);
        if (m.matches()) return new Key(raw, Kind.JLPT, m.group(1), m.group(2));
        m = KANJI.matcher(raw);
        if (m.matches()) return new Key(raw, Kind.KANJI, m.group(1), null);
        return null;
    }

    /** Như {@link #tryParse} nhưng sai dạng → 400. */
    public static Key parse(String raw) {
        Key k = tryParse(raw);
        if (k == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Khoá mục từ điển không hợp lệ.");
        return k;
    }

    public static String kanjiKey(String ch) {
        return "k:" + ch;
    }

    /** Ký tự là chữ Hán (CJK cơ bản, mở rộng A, tương thích). */
    public static boolean isKanji(int cp) {
        return (cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0x3400 && cp <= 0x4DBF) || (cp >= 0xF900 && cp <= 0xFAFF);
    }

    /** Chuỗi có chữ Nhật (kana / kanji) không. */
    public static boolean hasJapanese(String s) {
        if (s == null) return false;
        return s.codePoints().anyMatch(cp -> isKanji(cp) || (cp >= 0x3040 && cp <= 0x30FF));
    }
}
