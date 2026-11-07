package com.pbl6.flashcard.dto.practice;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;

/**
 * Body / response của /api/practice/** (hợp đồng đợt 2 §2). Giới hạn trùng với ai-service (kanji_dtw_router MAX_STROKES /
 * MAX_POINTS, audio_praat_router MAX_CONTOUR_POINTS / MAX_WORD_LEN): chặn ở đây để trả 400 tiếng Việt thay vì 413 / 422 từ
 * ai-service, và không chuyển tiếp payload rác.
 */
public final class PracticeDtos {

    private PracticeDtos() {}

    public static final int MAX_STROKES = 40;
    public static final int MAX_POINTS_PER_STROKE = 500;
    public static final int MAX_CONTOUR_POINTS = 2000;
    public static final int MAX_WORD_LEN = 64;
    /** Cao hơn mọi kiểu trọng âm thật (≤ số mora của từ ≤ 64), khớp le=MAX_WORD_LEN của ai-service. */
    public static final int MAX_ACCENT_TYPE = MAX_WORD_LEN;

    /** Một điểm nét vẽ: toạ độ canvas bất kỳ (ai-service tự chuẩn hoá theo hộp bao), t = ms tuỳ chọn (chưa dùng để chấm). */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record StrokePoint(@NotNull(message = "thiếu toạ độ x") Double x,
                              @NotNull(message = "thiếu toạ độ y") Double y,
                              Double t) {}

    /**
     * kanji: đúng một chữ (kiểm ở service theo code point — chữ ngoài BMP dài 2 đơn vị UTF-16); strokes theo thứ tự người dùng vẽ,
     * mỗi nét ≥ 1 điểm (ai-service đòi min_length=1). cardId tuỳ chọn để gắn lượt luyện vào thẻ.
     */
    public record KanjiScoreRequest(
            @NotBlank(message = "kanji là bắt buộc") @Size(max = 4, message = "kanji chỉ gồm một chữ") String kanji,
            @Size(max = 255) String cardId,
            @NotNull(message = "strokes là bắt buộc")
            @Size(min = 1, max = MAX_STROKES, message = "cần từ 1 đến " + MAX_STROKES + " nét")
            List<@NotNull @Size(min = 1, max = MAX_POINTS_PER_STROKE,
                    message = "mỗi nét cần từ 1 đến " + MAX_POINTS_PER_STROKE + " điểm") List<@NotNull @Valid StrokePoint>> strokes) {}

    /** Một khung F0 trình duyệt ước lượng: t giây kể từ lúc ghi, f0 Hz hoặc null = khung không có thanh. */
    public record ContourPoint(@NotNull(message = "thiếu thời điểm t") Double t, Double f0) {}

    /** reading tuỳ chọn khi word toàn kana (ai-service lấy chính word); accentType ghi đè tra cứu kanjium. */
    public record PitchScoreRequest(
            @Size(max = 255) String cardId,
            @NotBlank(message = "word là bắt buộc") @Size(max = MAX_WORD_LEN) String word,
            @Size(max = MAX_WORD_LEN) String reading,
            @Min(0) @Max(MAX_ACCENT_TYPE) Integer accentType,
            @NotNull(message = "contour là bắt buộc")
            @Size(min = 1, max = MAX_CONTOUR_POINTS, message = "contour cần từ 1 đến " + MAX_CONTOUR_POINTS + " điểm")
            List<@NotNull @Valid ContourPoint> contour) {}

    /**
     * Kết quả nhận dạng giọng nói của trình duyệt (Web Speech API): âm thanh không bao giờ gửi lên, chỉ transcript và điểm trình
     * duyệt tự so. transcript được rỗng (không nhận ra gì → điểm 0 vẫn là một lượt luyện).
     */
    public record PronunciationRequest(
            @Size(max = 255) String cardId,
            @NotBlank(message = "term là bắt buộc") @Size(max = 100) String term,
            @NotBlank(message = "target là bắt buộc") @Size(max = 100) String target,
            @NotNull(message = "transcript là bắt buộc") @Size(max = 500) String transcript,
            @NotNull(message = "score là bắt buộc") @Min(0) @Max(100) Integer score) {}

    /** Một dòng nhật ký luyện tập trả về (danh sách recent của /stats, response của POST /pronunciation). */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record LogEntry(String kind, String target, int score, Instant createdAt) {}

    /** avg làm tròn 1 chữ số; null (không có trong JSON) khi count = 0 — chưa luyện thì không có "trung bình 0 điểm". */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record KindStats(long count, Double avg) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record StatsResponse(KindStats write, KindStats speak, KindStats pitch, List<LogEntry> recent) {}
}
