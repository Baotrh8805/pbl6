package com.pbl6.flashcard.service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Hàm thuần dùng chung cho cảnh báo mâu thuẫn (F2, hợp đồng đợt 2 §5): chuẩn hoá cảnh báo ai-service trước khi lưu, đếm thống kê,
 * đọc ngưỡng từ cấu hình. Worker (lúc phân tích) và {@link ConflictService} (kiểm tra lại) cùng dùng để hai đường ghi ra một dạng.
 */
final class ConflictSupport {

    /** Năm trường ai-service kiểm (conflicts.FIELDS); conflictsByField luôn đủ năm khoá để client vẽ bảng không cần kiểm thiếu. */
    static final List<String> FIELDS = List.of("reading", "furigana", "meaning", "level", "grammar");
    /** Giá trị seed của contradiction_alert_threshold (V21); dùng khi cấu hình thiếu / hỏng. */
    static final double DEFAULT_MIN_CONFIDENCE = 0.7;
    /** ai-service trả tối đa 4 cảnh báo / item (reading|furigana, meaning, level); trần này chỉ chặn dữ liệu lạ phình jsonb. */
    static final int MAX_PER_ITEM = 10;
    /**
     * Khoá trong extraction_jobs.options: ngưỡng cảnh báo đã gửi khi phân tích (ExtractionService.prepareJob, hoặc worker điền khi
     * phân tích lại job cũ). Có khoá này = item của job được phân tích bởi pipeline có F2 — ConflictService dựa vào đó để biết
     * docReading / docMeaningEn null nghĩa là "tài liệu không khai báo", không phải "job cũ chưa lưu".
     */
    static final String OPTION_MIN_CONFIDENCE = "conflictMinConfidence";

    private ConflictSupport() {}

    /**
     * Cảnh báo của một item -> [{field, document, reference, source, confidence, noteVi}]. ai-service (Python) đặt tên note_vi;
     * hợp đồng với frontend là noteVi nên đổi ở đây, một lần, lúc ghi DB. Phần tử không phải object / thiếu field bị bỏ; raw không
     * phải danh sách (ai-service cũ không trả conflicts) -> [].
     */
    static List<Map<String, Object>> normalize(Object raw) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (!(raw instanceof Collection<?> list)) return out;
        for (Object o : list) {
            if (!(o instanceof Map<?, ?> m)) continue;
            String field = text(m.get("field"));
            if (field == null) continue;
            Map<String, Object> c = new LinkedHashMap<>();
            c.put("field", field);
            c.put("document", text(m.get("document")));
            c.put("reference", text(m.get("reference")));
            c.put("source", text(m.get("source")));
            c.put("confidence", m.get("confidence") instanceof Number n ? n.doubleValue() : null);
            c.put("noteVi", text(m.containsKey("noteVi") ? m.get("noteVi") : m.get("note_vi")));
            out.add(c);
            if (out.size() >= MAX_PER_ITEM) break;
        }
        return out;
    }

    /** Như conflicts.summarize của ai-service: {conflicts: tổng, conflictsByField: {reading, furigana, meaning, level, grammar}}. */
    static Map<String, Object> summarize(Collection<List<Map<String, Object>>> lists) {
        Map<String, Integer> byField = new LinkedHashMap<>();
        FIELDS.forEach(f -> byField.put(f, 0));
        int total = 0;
        for (List<Map<String, Object>> l : lists) {
            for (Map<String, Object> c : l) {
                byField.merge(String.valueOf(c.get("field")), 1, Integer::sum);
                total++;
            }
        }
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("conflicts", total);
        stats.put("conflictsByField", byField);
        return stats;
    }

    /**
     * Gộp kết quả kiểm tra lại với cảnh báo đã lưu của một item: trường nằm trong {@code evaluated} lấy cảnh báo mới ({@code fresh}),
     * trường khác giữ nguyên cảnh báo đã lưu ({@code stored}) — kiểm tra lại không có đủ dữ liệu để đánh giá lại trường đó (vd. level /
     * grammar cần docLevel mà backend không lưu), nên ghi đè bằng [] là xoá oan cảnh báo lúc phân tích. Thứ tự theo {@link #FIELDS}
     * (như ai-service), cảnh báo trường lạ đã lưu giữ ở cuối; cảnh báo mới của trường không được đánh giá bị bỏ. Hàm thuần.
     */
    static List<Map<String, Object>> merge(List<Map<String, Object>> stored, List<Map<String, Object>> fresh,
                                           Collection<String> evaluated) {
        List<Map<String, Object>> old = stored != null ? stored : List.of();
        List<Map<String, Object>> now = fresh != null ? fresh : List.of();
        List<Map<String, Object>> out = new ArrayList<>();
        for (String f : FIELDS) {
            for (Map<String, Object> c : evaluated.contains(f) ? now : old) {
                if (f.equals(c.get("field"))) out.add(c);
            }
        }
        for (Map<String, Object> c : old) {
            if (!FIELDS.contains(String.valueOf(c.get("field")))) out.add(c);
        }
        return out.size() > MAX_PER_ITEM ? new ArrayList<>(out.subList(0, MAX_PER_ITEM)) : out;
    }

    /**
     * contradiction_alert_threshold (Admin > Cấu hình): chỉ cảnh báo có confidence ≥ ngưỡng mới được giữ. Cấu hình hỏng không được làm
     * hỏng lượt bóc tách: không đọc được -> giá trị seed; ngoài 0..1 (ai-service trả 422) -> kẹp lại.
     */
    static double minConfidence(SettingsService settings) {
        double v = settings.getDouble(SettingsService.KEY_CONTRADICTION_ALERT, DEFAULT_MIN_CONFIDENCE);
        return Math.max(0, Math.min(1, v));
    }

    private static String text(Object o) {
        if (o == null) return null;
        String s = String.valueOf(o).strip();
        return s.isEmpty() ? null : s;
    }
}
