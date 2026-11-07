package com.pbl6.flashcard.model;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;

/**
 * Một lần chấm luyện tập (V23, hợp đồng đợt 2 §2): viết Kanji (write), phát âm (speak), trọng âm (pitch). Chỉ lưu điểm, mục tiêu
 * và detail nhỏ (vài trường để xem lại) — không lưu nét vẽ / đường F0 / âm thanh: chúng lớn và không cần cho thống kê.
 */
@Entity
@Table(name = "practice_logs")
public class PracticeLog {
    public static final String WRITE = "write";
    public static final String SPEAK = "speak";
    public static final String PITCH = "pitch";
    /** Độ dài cột target. */
    public static final int TARGET_MAX = 100;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** null: luyện ngoài thẻ, thẻ không xem được, hoặc thẻ đã bị xoá (FK SET NULL). */
    @Column(name = "card_id")
    private String cardId;

    @Column(nullable = false, length = 5)
    private String kind;

    @Column(nullable = false, length = TARGET_MAX)
    private String target;

    /** smallint 0..100 (CHECK ở DB). */
    @Column(nullable = false)
    private short score;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> detail = Map.of();

    /** Micro giây = timestamptz: response 201 (LogEntry) trả đúng mốc thống kê đọc lại từ DB. */
    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now().truncatedTo(ChronoUnit.MICROS);

    public PracticeLog() {}

    public PracticeLog(Long userId, String cardId, String kind, String target, int score, Map<String, Object> detail) {
        this.userId = userId;
        this.cardId = cardId;
        this.kind = kind;
        this.target = target;
        this.score = (short) score;
        this.detail = detail == null ? Map.of() : detail;
    }

    public Long getId() { return id; }
    public Long getUserId() { return userId; }
    public String getCardId() { return cardId; }
    public String getKind() { return kind; }
    public String getTarget() { return target; }
    public int getScore() { return score; }
    public Map<String, Object> getDetail() { return detail; }
    public Instant getCreatedAt() { return createdAt; }
}
