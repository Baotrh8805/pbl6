package com.pbl6.flashcard.dto.moderation;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;

/** DTO kiểm duyệt AI (spec docs/Plan/specs/2026-10-27-kiem-duyet-ai-va-hlr-design.md §4–§6). */
public final class ModerationDtos {

    private ModerationDtos() {}

    /** Một từ bị PhoBERT đánh dấu; start / end = vị trí ký tự trong văn bản gốc, -1 khi không tìm lại được. */
    public record Span(String word, int start, int end, double score) {}

    /** Tín hiệu thô từ ai-service: nhãn 0 sạch / 1 xúc phạm / 2 thù ghét, xác suất 3 lớp, từ đánh dấu (đã ≥ 0,5). */
    public record Signal(int label, List<Double> probs, double score, List<Span> spans, boolean spanModel, boolean empty) {
        public double p2() { return probs != null && probs.size() > 2 ? probs.get(2) : 0; }
    }

    public enum Verdict { CLEAN, FLAGGED, BLOCKED }

    /**
     * Kết quả gắn vào một dòng: status = PENDING (AI lỗi, chấm lại sau) | CLEAN | FLAGGED | BLOCKED; verdict = kết luận AI gốc
     * (null khi PENDING); label / score / spans để admin và chủ xem.
     */
    public record Screening(String status, String verdict, Integer label, Double score, List<Span> spans) {
        public static final String PENDING = "PENDING";
        public static final String CLEAN = "CLEAN";
        public static final String FLAGGED = "FLAGGED";
        public static final String BLOCKED = "BLOCKED";
        public static final String REVIEWED = "REVIEWED";

        public static Screening pending() { return new Screening(PENDING, null, null, null, List.of()); }
        public static Screening clean() { return new Screening(CLEAN, CLEAN, null, null, List.of()); }
        public boolean blocked() { return BLOCKED.equals(status); }
        public boolean flagged() { return FLAGGED.equals(status); }
        public List<String> words() { return spans == null ? List.of() : spans.stream().map(Span::word).distinct().toList(); }
    }

    /** Phần người học thấy trên bình luận của mình / của người khác (DictDtos.Comment.moderation, Rating.moderation). */
    public record Info(String status, boolean masked, List<String> spans, String message) {}

    /** Một dòng hàng chờ admin (bình luận từ điển hoặc bình luận đánh giá bộ thẻ). */
    public record QueueItem(String kind, long id, String content, List<Span> spans, Integer label, Double score, String status,
                            String verdict, Author author, Target target, Instant createdAt, boolean hidden) {}

    public record Author(long id, String email, String displayName, long blocked24h, Instant commentLockedUntil) {}

    /** key = entry_key (comment) hoặc deckId (rating); title = thuật ngữ / tên bộ; sensitive chỉ có với mục từ. */
    public record Target(String key, String title, Boolean sensitive) {}

    public record NoteRequest(@Size(max = 500) String note) {}

    public record SensitiveRequest(@NotNull Boolean sensitive, @Size(max = 300) String note) {}

    /** source: admin (công tắc) | jmdict (nhãn vulg / X / derog / sens / sl) | none. */
    public record Sensitive(boolean value, String source, String note) {}

    public record RescanResponse(int scanned, long pending) {}

    public record Counts(long open, long flagged, long blocked, long pending) {}
}
