package com.pbl6.flashcard.model;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

/**
 * Báo lỗi một câu hỏi quiz của người học (V22). Một báo lỗi OPEN mỗi người mỗi câu (partial unique index ở DB); dòng mới do
 * QuestionBankService ghi bằng INSERT ... ON CONFLICT DO NOTHING, entity này để admin đọc / đóng.
 */
@Entity
@Table(name = "question_flags")
public class QuestionFlag {

    public static final String OPEN = "OPEN";
    public static final String RESOLVED = "RESOLVED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "question_id", nullable = false)
    private UUID questionId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, length = 20)
    private String reason;

    @Column(length = 500)
    private String detail;

    @Column(nullable = false, length = 10)
    private String status = OPEN;

    @Column(name = "resolution_note", length = 500)
    private String resolutionNote;

    @Column(name = "resolved_by")
    private Long resolvedBy;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public UUID getQuestionId() { return questionId; }
    public Long getUserId() { return userId; }
    public String getReason() { return reason; }
    public String getDetail() { return detail; }
    public String getStatus() { return status; }
    public String getResolutionNote() { return resolutionNote; }
    public Long getResolvedBy() { return resolvedBy; }
    public Instant getResolvedAt() { return resolvedAt; }
    public Instant getCreatedAt() { return createdAt; }
}
