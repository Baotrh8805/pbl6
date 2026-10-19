package com.pbl6.flashcard.dto.extraction;

import java.util.List;
import java.util.Map;

/** Định dạng trao đổi với ai-service (/api/extract/*). Khớp docs/EXTRACTION.md; trường lạ bị bỏ qua. */
public final class AiDtos {

    private AiDtos() {}

    /** POST /api/extract/text */
    public record TextResult(String text, Map<String, Object> meta, List<Map<String, Object>> blocks) {}

    /** POST /api/extract/analyze */
    public record AnalyzeResult(List<Item> items, Map<String, Object> stats, Boolean truncated) {}

    /**
     * conflicts (F2, hợp đồng đợt 2 §5): cảnh báo mâu thuẫn ai-service gắn cho item (khoá note_vi như Python, ConflictSupport chuẩn
     * hoá thành noteVi khi lưu); ai-service cũ không trả = null. docReading / docMeaningEn: cách đọc / nghĩa EN TÀI LIỆU khai báo —
     * item /extract/analyze luôn mang hai khoá này (và docLevel, backend không lưu nên không khai ở đây), null = tài liệu không ghi
     * (hoặc ai-service cũ chưa trả). ExtractionWorker lưu chúng để kiểm tra lại mâu thuẫn; KnowledgeSourceService lấy cách đọc từ đây.
     */
    public record Item(String kind, Integer position, String term, String surface, String reading,
                       List<Map<String, String>> readingSegments, String hanViet, String pos,
                       String meaningEn, String meaningVi, String level, Double levelConfidence,
                       List<String> levelSources, Integer frequency, String example, String exampleVi,
                       Boolean suspect, Integer chapter, List<Map<String, Object>> conflicts,
                       String docReading, String docMeaningEn) {

        /** Dạng trước F2 (không có conflicts / doc*): giữ cho mã và test đang dựng item theo 18 tham số. */
        public Item(String kind, Integer position, String term, String surface, String reading,
                    List<Map<String, String>> readingSegments, String hanViet, String pos,
                    String meaningEn, String meaningVi, String level, Double levelConfidence,
                    List<String> levelSources, Integer frequency, String example, String exampleVi,
                    Boolean suspect, Integer chapter) {
            this(kind, position, term, surface, reading, readingSegments, hanViet, pos, meaningEn, meaningVi, level,
                    levelConfidence, levelSources, frequency, example, exampleVi, suspect, chapter, null, null, null);
        }
    }

    /** POST /api/extract/enrich */
    public record EnrichRequest(String targetLang, List<EnrichInput> items) {}

    public record EnrichInput(String ref, String term, String reading, String pos, String meaningEn, String example) {}

    public record EnrichResult(Boolean enriched, List<EnrichOutput> items, String reason) {}

    public record EnrichOutput(String ref, String meaningVi, String exampleVi) {}
}
