package com.pbl6.flashcard.dto.dictionary;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;

/** DTO của từ điển (spec docs/Plan/specs/2026-10-26-tu-dien-design.md §6.4, §8.3). Mục từ trả dạng JSON gộp (ObjectNode). */
public final class DictDtos {

    private DictDtos() {}

    // ------------------------------------------------------------ người học

    public record TranslateExamplesRequest(@NotNull @Size(min = 1, max = 10) List<@NotBlank @Size(max = 40) String> exampleIds) {}

    public record TokenizeRequest(@NotBlank @Size(max = 300) String text) {}

    /** Tab Dịch (D33): câu / đoạn ≤ 1 000 ký tự; direction null = auto (có chữ Nhật → ja-vi, không thì vi-ja). */
    public record TranslateTextRequest(@NotBlank @Size(max = 1000) String text,
                                       @Pattern(regexp = "auto|ja-vi|vi-ja") String direction) {}

    /** Vẽ chữ Hán để tra: các nét theo thứ tự vẽ, mỗi nét là dãy điểm (toạ độ khung vẽ). */
    public record HandwritingRequest(
            @jakarta.validation.constraints.NotNull @Size(min = 1, max = 40)
            java.util.List<java.util.List<HwPoint>> strokes) {}   // 1..500 điểm mỗi nét: kiểm ở DictionaryService (chú thích lồng làm Jackson không dựng được record)

    public record HwPoint(double x, double y) {}

    public record CommentRequest(@NotBlank @Size(max = 1000) String content) {}

    /**
     * moderation (V38): null khi CLEAN / đã admin xử lý; chủ thấy {status, spans, message}; người khác chỉ thấy {status FLAGGED,
     * masked true} khi content là bản che từ. BLOCKED chỉ chủ thấy (người khác không nhận được bình luận).
     */
    public record Comment(long id, String entryKey, long userId, String displayName, String content, int helpfulCount,
                          boolean votedByMe, boolean mine, boolean hidden, Instant createdAt, Instant updatedAt,
                          com.pbl6.flashcard.dto.moderation.ModerationDtos.Info moderation) {}

    public record CommentPage(List<Comment> items, long total, int page, int size) {}

    public record HelpfulResponse(int helpfulCount, boolean votedByMe) {}

    public record EntryReportRequest(
            @NotBlank @Pattern(regexp = "reading|han_viet|meaning_vi|meaning_en|kanji_meaning|example|example_vi|other") String field,
            @Size(max = 40) String subKey,
            @Size(max = 1000) String proposedValue,
            @Size(max = 1000) String note) {}

    public record CommentReportRequest(@NotBlank @Pattern(regexp = "SPAM|OFFENSIVE|WRONG|OTHER") String reason,
                                       @Size(max = 1000) String note) {}

    public record Report(long id, String kind, String entryKey, String term, Long commentId, String commentContent, String field,
                         String subKey, String currentValue, String proposedValue, String reason, String note, Long reporterId,
                         String reporterEmail, String status, String action, String resolutionNote, Instant resolvedAt,
                         Instant createdAt) {}

    public record ReportPage(List<Report> items, long total, int page, int size) {}

    public record FavoriteRequest(@Size(max = 300) String note) {}

    public record AiStats(int aiLeft, int aiLimit) {}

    // ------------------------------------------------------------ admin

    public record MeaningRequest(@NotBlank @Size(max = 1000) String value, @Size(max = 300) String reason) {}

    public record OverrideRequest(
            @NotBlank @Pattern(regexp = "reading|han_viet|meaning_en|kanji_meaning|example_jpn|example_eng|example_hidden") String field,
            @Size(max = 40) String subKey,
            @Size(max = 2000) String value,
            @Size(max = 300) String reason) {}

    public record ExampleViRequest(@Size(max = 1000) String value, @Size(max = 300) String reason) {}

    public record NoteRequest(@Size(max = 500) String note) {}

    public record RequiredNoteRequest(@NotBlank @Size(max = 500) String note) {}

    public record QueueRow(String entryKey, String group, long openReports, Instant lastReportAt, long lookups30d, String term,
                           String reading, String level, String meaningVi, String status, String source, Instant updatedAt,
                           String headKanji, String headKana, String glossShort) {}

    public record History(long id, String entryKey, String field, String subKey, String oldValue, String newValue, Long actorId,
                          String actorEmail, Long reportId, String reason, Instant createdAt) {}

    public record AdminComment(long id, String entryKey, long userId, String displayName, String email, String content,
                               int helpfulCount, boolean hidden, String hiddenNote, Instant createdAt,
                               /* V38: PENDING | CLEAN | FLAGGED | BLOCKED | REVIEWED + từ bị đánh dấu */
                               String modStatus, List<String> modSpans) {}

    public record SyncResponse(long backendVersion, Long aiVersion, Integer aiCount, boolean ok) {}

    public record DictStats(long entriesVi, long verified, long machine, long lookups7d, long comments7d, long openReports) {}
}
