package com.pbl6.flashcard.dto.extraction;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;

/**
 * Tuỳ chọn bóc tách do người dùng chọn trong modal; lưu nguyên vào extraction_jobs.options và chuyển
 * thẳng cho ai-service. Trường null = dùng mặc định ({@link #withDefaults}).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ExtractionOptions(
        @Pattern(regexp = "N[1-5]") String userLevel,
        @Pattern(regexp = "all|at_or_above|only_unknown_to_me") String levelFilter,
        Boolean includeGrammar,
        Boolean includeFurigana,
        Boolean includeHanViet,
        @Pattern(regexp = "vi|en") String meaningLang,
        @Pattern(regexp = "above|drop") String treatUnknownAs,
        @Min(1) @Max(100) Integer minFrequency,
        @Pattern(regexp = "auto|vertical|horizontal") String ocrMode,
        /** auto: ai-service tự nhận dạng; list: mỗi dòng một cụm + nghĩa in sẵn; prose: tách từng từ. */
        @Pattern(regexp = "auto|list|prose") String extractMode,
        /** Tách tài liệu thành chương (dùng cho Lộ trình học); mặc định false. */
        Boolean splitChapters
) {
    public static ExtractionOptions empty() {
        return new ExtractionOptions(null, null, null, null, null, null, null, null, null, null, null);
    }

    /** Điền mặc định; trình độ lấy từ hồ sơ người dùng khi client không gửi. */
    public ExtractionOptions withDefaults(String profileLevel) {
        return new ExtractionOptions(
                userLevel != null ? userLevel : (profileLevel != null && profileLevel.matches("N[1-5]") ? profileLevel : "N5"),
                levelFilter != null ? levelFilter : "at_or_above",
                includeGrammar != null ? includeGrammar : Boolean.TRUE,
                includeFurigana != null ? includeFurigana : Boolean.TRUE,
                includeHanViet != null ? includeHanViet : Boolean.TRUE,
                meaningLang != null ? meaningLang : "vi",
                treatUnknownAs != null ? treatUnknownAs : "above",
                minFrequency != null ? minFrequency : 1,
                ocrMode != null ? ocrMode : "auto",
                extractMode != null ? extractMode : "auto",
                splitChapters != null ? splitChapters : Boolean.FALSE);
    }

    public ExtractionOptions withSplitChapters(boolean value) {
        return new ExtractionOptions(userLevel, levelFilter, includeGrammar, includeFurigana, includeHanViet,
                meaningLang, treatUnknownAs, minFrequency, ocrMode, extractMode, value);
    }

    public boolean wantsVietnamese() {
        return "vi".equals(meaningLang);
    }
}
