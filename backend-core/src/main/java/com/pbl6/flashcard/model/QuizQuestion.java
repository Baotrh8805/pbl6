package com.pbl6.flashcard.model;

import jakarta.persistence.*;
import org.hibernate.annotations.DynamicUpdate;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Một câu trong ngân hàng câu hỏi quiz (V22, hợp đồng đợt 2 §1.1). Dòng mới do QuestionBankService ghi bằng
 * INSERT ... ON CONFLICT DO NOTHING (unique theo nội dung) khi phát đề; entity này chỉ dùng để admin đọc / sửa / ẩn.
 * {@link DynamicUpdate}: admin sửa chỉ ghi cột đổi, không ghi đè flag_count mà báo lỗi song song vừa tăng.
 */
@Entity
@Table(name = "quiz_questions")
@DynamicUpdate
public class QuizQuestion {

    public static final String ACTIVE = "ACTIVE";
    public static final String HIDDEN = "HIDDEN";
    /** kind của câu gõ cách đọc: options NULL. */
    public static final String KIND_READING = "READING";

    @Id
    private UUID id;

    @Column(name = "card_id", nullable = false)
    private String cardId;

    @Column(name = "deck_id", nullable = false)
    private String deckId;

    @Column(nullable = false, length = 20)
    private String kind;

    @Column(nullable = false, length = 500)
    private String prompt;

    /** Phương án đã sắp xếp (unique md5 theo nội dung); NULL = câu gõ. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private List<String> options;

    @Column(nullable = false, length = 500)
    private String correct;

    /**
     * cardHash (vân tay thẻ lúc sinh) + form, formLabelVi, example... của câu chia động từ; supersedes = khoá nội dung trước các
     * lần admin sửa prompt / phương án (QuestionBankService.patch).
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> extra;

    @Column(nullable = false, length = 10)
    private String generator;

    @Column(nullable = false, length = 10)
    private String status = ACTIVE;

    @Column(name = "flag_count", nullable = false)
    private int flagCount;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /** Admin sửa nội dung gần nhất; null = nguyên bản máy sinh. */
    @Column(name = "edited_by")
    private Long editedBy;

    public UUID getId() { return id; }
    public String getCardId() { return cardId; }
    public String getDeckId() { return deckId; }
    public String getKind() { return kind; }
    public String getPrompt() { return prompt; }
    public void setPrompt(String prompt) { this.prompt = prompt; }
    public List<String> getOptions() { return options; }
    public void setOptions(List<String> options) { this.options = options; }
    public String getCorrect() { return correct; }
    public void setCorrect(String correct) { this.correct = correct; }
    public Map<String, Object> getExtra() { return extra; }
    public void setExtra(Map<String, Object> extra) { this.extra = extra; }
    public String getGenerator() { return generator; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public int getFlagCount() { return flagCount; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
    public Long getEditedBy() { return editedBy; }
    public void setEditedBy(Long editedBy) { this.editedBy = editedBy; }
}
