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

    public record Item(String kind, Integer position, String term, String surface, String reading,
                       List<Map<String, String>> readingSegments, String hanViet, String pos,
                       String meaningEn, String meaningVi, String level, Double levelConfidence,
                       List<String> levelSources, Integer frequency, String example, String exampleVi,
                       Boolean suspect) {}

    /** POST /api/extract/enrich */
    public record EnrichRequest(String targetLang, List<EnrichInput> items) {}

    public record EnrichInput(String ref, String term, String reading, String pos, String meaningEn, String example) {}

    public record EnrichResult(Boolean enriched, List<EnrichOutput> items, String reason) {}

    public record EnrichOutput(String ref, String meaningVi, String exampleVi) {}
}
