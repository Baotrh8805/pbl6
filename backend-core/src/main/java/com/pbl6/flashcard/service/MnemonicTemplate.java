package com.pbl6.flashcard.service;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.CRC32;

/**
 * Câu mẹo nhớ mẫu cho thẻ bộ thủ — bản Java của radicals.template_mnemonic (ai-service/app/extract/radicals.py), giữ đúng mẫu
 * câu và cách chọn mẫu (CRC32 của chữ) để người học thấy cùng một câu với mẹo TEMPLATE trong hàng chờ duyệt.
 * <p>
 * Vì sao chép sang đây: thẻ bộ thủ công khai (/api/nlp/radicals/cards) phải gọi ai-service với withMnemonic=false — bật thì
 * ai-service gọi Gemini cho mỗi lượt xem (tốn quota) và trả mẹo chưa duyệt — nhưng khi đó ai-service không điền mẫu. Mọi dữ
 * liệu mẫu cần (âm Hán-Việt, tên / nghĩa bộ, nghĩa EN) đều có sẵn trên thẻ nên backend tự dựng câu. Đổi mẫu ở ai-service thì
 * sửa cả ở đây (MnemonicTemplateTest khoá các câu mẫu sinh từ bản Python).
 */
final class MnemonicTemplate {

    /** MAX_MNEMONIC_CHARS / _MEANING_CHARS của radicals.py. */
    static final int MAX_CHARS = 200;
    private static final int MEANING_CHARS = 40;

    private static final List<String> FULL = List.of(
            "Chữ {k} có bộ {rad} ({rm}), âm Hán-Việt {hv}{mn}: thấy {rm} là nhớ {hv}.",
            "{hv} — chữ {k} mang bộ {rad} nghĩa là {rm}{mn}; hình dung {rm} rồi đọc to {hv}.",
            "Thấy bộ {rad} ({rm}) trong chữ {k}, đọc ngay {hv}{mn}.",
            "Nhớ {k} bằng công thức: bộ {rad} ({rm}) + âm {hv}{mn}.",
            "Chữ {k} ({hv}) thuộc bộ {rad}: {rm} gợi nhớ {hv}{mn}.");
    private static final List<String> RADICAL_ONLY = List.of(
            "Chữ {k} có bộ {rad} ({rm}){mn}: thấy {rm} là nhớ chữ {k}.",
            "Nhớ {k} qua bộ {rad}: {rm}{mn}.");
    private static final List<String> HAN_VIET_ONLY = List.of(
            "Chữ {k} đọc Hán-Việt là {hv}{mn}: nhìn chữ, đọc to {hv} ba lần.",
            "{hv} là âm của chữ {k}{mn} — gắn {hv} với hình chữ để nhớ.");
    private static final List<String> BARE = List.of("Chữ {k}{mn}: viết lại ba lần và đọc to nghĩa để nhớ mặt chữ.");

    /** _AFFIX_GLOSS_RE: nghĩa là phụ tố / lượng từ / kính ngữ thì không ghép vào câu. */
    private static final Pattern AFFIX_GLOSS = Pattern.compile(
            "^(?:[-(~]|counter for\\b|prefix\\b|suffix\\b|honorific|honorable|polite\\b|humble\\b|our ~)",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    private static final Pattern PAREN = Pattern.compile("\\([^()]*\\)");
    private static final Pattern PLACEHOLDER = Pattern.compile("\\{(k|hv|rad|rm|mn)}");

    private MnemonicTemplate() {}

    /**
     * Câu mẹo không rỗng, ≤ {@link #MAX_CHARS} ký tự. radicalNameVi / radicalMeaningVi lấy từ radical của thẻ (null khi không
     * tra được bộ); thiếu bộ hay thiếu âm thì rơi về mẫu ít thành phần hơn như bản Python.
     */
    static String of(String kanji, String radicalNameVi, String radicalMeaningVi, String hanViet, String meaningEn) {
        String hv = blankToNull(hanViet == null ? null : hanViet.strip().toUpperCase(Locale.ROOT));
        String name = radicalNameVi == null ? "" : radicalNameVi.strip();
        String rad = name.isEmpty() ? null : capitalizeFirst(name);
        String rm = blankToNull(firstPart(firstPart(radicalMeaningVi == null ? "" : radicalMeaningVi, ";"), ",").strip());
        String meaning = shortMeaning(meaningEn);
        String mn = meaning.isEmpty() ? "" : ", nghĩa tiếng Anh \"" + meaning + "\"";
        List<String> pool;
        if (rad != null && rm != null && hv != null) pool = FULL;
        else if (rad != null && rm != null) pool = RADICAL_ONLY;
        else if (hv != null) pool = HAN_VIET_ONLY;
        else pool = BARE;
        CRC32 crc = new CRC32();
        crc.update(kanji.getBytes(StandardCharsets.UTF_8));
        String template = pool.get((int) (crc.getValue() % pool.size()));
        Map<String, String> values = new java.util.HashMap<>();
        values.put("k", kanji);
        values.put("hv", String.valueOf(hv));
        values.put("rad", String.valueOf(rad));
        values.put("rm", String.valueOf(rm));
        values.put("mn", mn);
        Matcher m = PLACEHOLDER.matcher(template);
        StringBuilder out = new StringBuilder();
        while (m.find()) m.appendReplacement(out, Matcher.quoteReplacement(values.get(m.group(1))));
        m.appendTail(out);
        return clip(out.toString(), MAX_CHARS);
    }

    /** clean_meaning: bỏ các nghĩa (ngăn bởi ";") mà phần đầu là phụ tố; mọi nghĩa đều là phụ tố → null. */
    static String cleanMeaning(String meaningEn) {
        if (meaningEn == null || meaningEn.isEmpty()) return null;
        List<String> senses = new ArrayList<>();
        for (String s : meaningEn.split(";", -1)) if (!s.strip().isEmpty()) senses.add(s.strip());
        List<String> kept = new ArrayList<>();
        for (String sense : senses) {
            String first = firstPart(stripParens(sense), ",").strip();
            if (first.isEmpty() || first.contains("~") || AFFIX_GLOSS.matcher(first).find()) continue;
            kept.add(sense);
        }
        if (kept.size() == senses.size()) return meaningEn;
        return kept.isEmpty() ? null : String.join("; ", kept);
    }

    /** _short_meaning: nghĩa đầu đã lọc phụ tố, bỏ ngoặc, cắt ở 40 ký tự; không có → "". */
    private static String shortMeaning(String meaningEn) {
        String cleaned = cleanMeaning(meaningEn);
        String first = firstPart(stripParens(firstPart(cleaned == null ? "" : cleaned, ";")), ",").strip();
        if (first.codePointCount(0, first.length()) > MEANING_CHARS) {
            first = prefix(first, MEANING_CHARS - 1).stripTrailing() + "…";
        }
        return first;
    }

    /** Bỏ ghi chú trong ngoặc kể cả lồng nhau ("person (same as 人 (ひと))" → "person"). */
    private static String stripParens(String text) {
        while (true) {
            String next = PAREN.matcher(text).replaceAll("");
            if (next.equals(text)) return text.strip();
            text = next;
        }
    }

    private static String clip(String text, int limit) {
        if (text.codePointCount(0, text.length()) <= limit) return text;
        return prefix(text, limit - 1).stripTrailing() + "…";
    }

    /** n ký tự đầu (theo code point như len() / slice của Python: chữ ngoài BMP như 𠮟 là một). */
    private static String prefix(String text, int n) {
        return text.substring(0, text.offsetByCodePoints(0, n));
    }

    private static String firstPart(String text, String sep) {
        int i = text.indexOf(sep);
        return i < 0 ? text : text.substring(0, i);
    }

    private static String capitalizeFirst(String s) {
        int end = s.offsetByCodePoints(0, 1);
        return s.substring(0, end).toUpperCase(Locale.ROOT) + s.substring(end);
    }

    private static String blankToNull(String s) {
        return s == null || s.isEmpty() ? null : s;
    }
}
