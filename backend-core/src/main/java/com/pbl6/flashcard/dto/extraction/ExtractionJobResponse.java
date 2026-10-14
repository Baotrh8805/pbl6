package com.pbl6.flashcard.dto.extraction;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.pbl6.flashcard.model.ExtractionJob;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Trạng thái một lượt bóc tách; client poll khi status QUEUED/RUNNING. extractedText chỉ kèm khi được hỏi. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ExtractionJobResponse(UUID id, String sourceType, String sourceName, String status, String stage,
                                    Map<String, Object> options, Map<String, Object> textMeta,
                                    Map<String, Object> stats, List<String> deckIds, String errorMessage,
                                    Instant createdAt, Instant startedAt, Instant finishedAt,
                                    String extractedText) {

    /** Dòng OCR có confidence dưới mức này được gửi cho client để người dùng soát trước. */
    static final double LOW_LINE_CONF = 0.75;
    static final int MAX_LOW_LINES = 50;

    public static ExtractionJobResponse of(ExtractionJob j, boolean includeText) {
        // blocks (bbox, ruby) chỉ phục vụ phân tích lại; client chỉ cần phần meta gọn + các dòng OCR nghi sai
        Map<String, Object> meta = j.getTextMeta();
        if (meta != null && meta.containsKey("blocks")) {
            meta = new java.util.LinkedHashMap<>(meta);
            List<Map<String, Object>> lowLines = lowConfidenceLines(meta.remove("blocks"));
            if (!lowLines.isEmpty()) meta.put("lowLines", lowLines);
        }
        return new ExtractionJobResponse(j.getId(), j.getSourceType(), j.getSourceName(), j.getStatus(),
                j.getStage(), j.getOptions(), meta, j.getStats(), j.getDeckIds(), j.getErrorMessage(),
                j.getCreatedAt(), j.getStartedAt(), j.getFinishedAt(),
                includeText ? j.getExtractedText() : null);
    }

    /** blocks[].lines[] = {text, conf} từ ai-service (chỉ Tesseract) → giữ lại dòng conf < LOW_LINE_CONF, giữ thứ tự. */
    @SuppressWarnings("unchecked")
    static List<Map<String, Object>> lowConfidenceLines(Object blocks) {
        List<Map<String, Object>> out = new java.util.ArrayList<>();
        if (!(blocks instanceof List<?> list)) return out;
        for (Object b : list) {
            if (!(b instanceof Map<?, ?> block) || !(block.get("lines") instanceof List<?> lines)) continue;
            for (Object l : lines) {
                if (!(l instanceof Map<?, ?> line) || !(line.get("conf") instanceof Number conf)) continue;
                if (conf.doubleValue() < LOW_LINE_CONF && line.get("text") instanceof String text && !text.isBlank()) {
                    out.add(Map.of("text", text, "conf", conf.doubleValue()));
                    if (out.size() >= MAX_LOW_LINES) return out;
                }
            }
        }
        return out;
    }
}
