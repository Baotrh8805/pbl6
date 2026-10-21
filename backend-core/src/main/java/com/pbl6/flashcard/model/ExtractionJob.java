package com.pbl6.flashcard.model;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Một lượt bóc tách tài liệu (V12). Trạng thái là nguồn sự thật để client poll; worker chạy @Async cập nhật từng
 * giai đoạn. File gốc không lưu: chỉ giữ văn bản đã trích để người dùng sửa và phân tích lại.
 */
@Entity
@Table(name = "extraction_jobs")
public class ExtractionJob {

    public static final String QUEUED = "QUEUED";
    public static final String RUNNING = "RUNNING";
    public static final String DONE = "DONE";
    public static final String FAILED = "FAILED";
    public static final String CANCELLED = "CANCELLED";

    public static final String PURPOSE_EXTRACTION = "extraction";
    public static final String PURPOSE_LEARNING_PATH = "learning_path";

    public static final String STAGE_TEXT = "TEXT";
    public static final String STAGE_ANALYZE = "ANALYZE";
    public static final String STAGE_ENRICH = "ENRICH";

    /** failure_kind (V30): FAILED vì ai-service báo AI quá tải (spec 21/10) -> không tính vào hạn mức 24 giờ. */
    public static final String FAILURE_AI_OVERLOADED = "AI_OVERLOADED";

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "source_type", nullable = false, length = 10)
    private String sourceType;

    @Column(name = "source_name")
    private String sourceName;

    @Column(nullable = false, length = 12)
    private String status = QUEUED;

    @Column(nullable = false, length = 12)
    private String stage = QUEUED;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> options;

    @Column(name = "extracted_text", columnDefinition = "text")
    private String extractedText;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "text_meta", columnDefinition = "jsonb")
    private Map<String, Object> textMeta;

    @Column(name = "error_message", length = 500)
    private String errorMessage;

    /** null = không lỗi / lỗi khác (tính lượt); {@link #FAILURE_AI_OVERLOADED} = lỗi do hệ thống AI (không tính lượt). */
    @Column(name = "failure_kind", length = 32)
    private String failureKind;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> stats;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "deck_ids", nullable = false, columnDefinition = "jsonb")
    private List<String> deckIds = new ArrayList<>();

    /** Mục đích lượt bóc tách: bóc tách thường hay dựng lộ trình học tập (V13). */
    @Column(nullable = false, length = 16)
    private String purpose = PURPOSE_EXTRACTION;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "finished_at")
    private Instant finishedAt;

    public ExtractionJob() {}

    public boolean isTerminal() {
        return DONE.equals(status) || FAILED.equals(status) || CANCELLED.equals(status);
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getSourceType() { return sourceType; }
    public void setSourceType(String sourceType) { this.sourceType = sourceType; }
    public String getSourceName() { return sourceName; }
    public void setSourceName(String sourceName) { this.sourceName = sourceName; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getStage() { return stage; }
    public void setStage(String stage) { this.stage = stage; }
    public Map<String, Object> getOptions() { return options; }
    public void setOptions(Map<String, Object> options) { this.options = options; }
    public String getExtractedText() { return extractedText; }
    public void setExtractedText(String extractedText) { this.extractedText = extractedText; }
    public Map<String, Object> getTextMeta() { return textMeta; }
    public void setTextMeta(Map<String, Object> textMeta) { this.textMeta = textMeta; }
    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
    public String getFailureKind() { return failureKind; }
    public void setFailureKind(String failureKind) { this.failureKind = failureKind; }
    public Map<String, Object> getStats() { return stats; }
    public void setStats(Map<String, Object> stats) { this.stats = stats; }
    public List<String> getDeckIds() { return deckIds; }
    public void setDeckIds(List<String> deckIds) { this.deckIds = deckIds; }
    public String getPurpose() { return purpose; }
    public void setPurpose(String purpose) { this.purpose = purpose; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getStartedAt() { return startedAt; }
    public void setStartedAt(Instant startedAt) { this.startedAt = startedAt; }
    public Instant getFinishedAt() { return finishedAt; }
    public void setFinishedAt(Instant finishedAt) { this.finishedAt = finishedAt; }
}
