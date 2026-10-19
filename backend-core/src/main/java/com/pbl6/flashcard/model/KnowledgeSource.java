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
 * Nguồn tri thức chuẩn (V28, G4): danh sách từ vựng / ngữ pháp / chữ Hán quản trị tải lên. entries của nguồn ACTIVE (trừ OTHER)
 * là "references" gửi ai-service khi phân tích tài liệu và kiểm tra lại mâu thuẫn — mục quản trị ghi đè từ điển cho đúng từ đó.
 * Sửa nội dung = phiên bản mới trên cùng dòng (version + 1); file gốc không lưu, chỉ giữ văn bản đã trích (content).
 */
@Entity
@Table(name = "knowledge_sources")
public class KnowledgeSource {

    public static final String ACTIVE = "ACTIVE";
    public static final String ARCHIVED = "ARCHIVED";

    public static final String KIND_VOCAB = "VOCAB";
    public static final String KIND_GRAMMAR = "GRAMMAR";
    public static final String KIND_KANJI = "KANJI";
    public static final String KIND_OTHER = "OTHER";

    @Id
    private UUID id;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(nullable = false, length = 10)
    private String kind;

    @Column(length = 2)
    private String level;

    @Column(nullable = false)
    private int version = 1;

    @Column(name = "source_name")
    private String sourceName;

    @Column(columnDefinition = "text")
    private String content;

    /** [{term, reading, meaning, level}] trích bằng ai-service (bố cục danh sách). */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private List<Map<String, Object>> entries = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "text_meta", columnDefinition = "jsonb")
    private Map<String, Object> textMeta;

    @Column(nullable = false, length = 10)
    private String status = ACTIVE;

    @Column(name = "uploaded_by")
    private Long uploadedBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public KnowledgeSource() {}

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public String getLevel() { return level; }
    public void setLevel(String level) { this.level = level; }
    public int getVersion() { return version; }
    public void setVersion(int version) { this.version = version; }
    public String getSourceName() { return sourceName; }
    public void setSourceName(String sourceName) { this.sourceName = sourceName; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public List<Map<String, Object>> getEntries() { return entries; }
    public void setEntries(List<Map<String, Object>> entries) { this.entries = entries; }
    public Map<String, Object> getTextMeta() { return textMeta; }
    public void setTextMeta(Map<String, Object> textMeta) { this.textMeta = textMeta; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Long getUploadedBy() { return uploadedBy; }
    public void setUploadedBy(Long uploadedBy) { this.uploadedBy = uploadedBy; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
