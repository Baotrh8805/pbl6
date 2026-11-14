package com.pbl6.flashcard.model;

import jakarta.persistence.*;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

/**
 * Mẹo nhớ một chữ Hán (V25, C4/G2). Mọi mẹo vào PENDING; admin duyệt thì thành APPROVED (mỗi chữ tối đa một mẹo APPROVED nhờ
 * partial unique index) và mới hiện trên thẻ bộ thủ cho mọi người học. Trạng thái chỉ đổi bằng UPDATE có điều kiện ở repository
 * để hai admin cùng xử lý thì người sau nhận 409.
 */
@Entity
@Table(name = "kanji_mnemonics")
public class KanjiMnemonic {

    public static final String PENDING = "PENDING";
    public static final String APPROVED = "APPROVED";
    public static final String REJECTED = "REJECTED";

    public static final String SOURCE_AI = "AI";
    public static final String SOURCE_TEMPLATE = "TEMPLATE";
    public static final String SOURCE_USER = "USER";

    @Id
    private UUID id;

    @Column(nullable = false, length = 4)
    private String kanji;

    @Column(name = "radical_no")
    private Integer radicalNo;

    @Column(name = "mnemonic_vi", nullable = false, length = 500)
    private String mnemonicVi;

    @Column(nullable = false, length = 10)
    private String source;

    @Column(nullable = false, length = 10)
    private String status = PENDING;

    @Column(name = "generated_model", length = 40)
    private String generatedModel;

    @Column(name = "created_by")
    private Long createdBy;

    @Column(name = "reviewed_by")
    private Long reviewedBy;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @Column(name = "review_note", length = 500)
    private String reviewNote;

    /** Micro giây = timestamptz: response 201 (Mine) trả đúng mốc các lần GET sau đọc từ DB. */
    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now().truncatedTo(ChronoUnit.MICROS);

    // Kiểm duyệt AI (V38, spec 2026-10-27 đêm): nhãn 0 sạch / 1 xúc phạm / 2 thù ghét + từ bị đánh dấu (JSON) cho hàng chờ admin;
    // mẹo nhớ vốn đã duyệt tay nên AI không tự từ chối
    @Column(name = "mod_label")
    private Integer modLabel;

    @Column(name = "mod_score")
    private Float modScore;

    @Column(name = "mod_spans")
    private String modSpans;

    @Column(name = "mod_at")
    private Instant modAt;

    public KanjiMnemonic() {}

    public KanjiMnemonic(String kanji, Integer radicalNo, String mnemonicVi, String source, String generatedModel, Long createdBy) {
        this.id = UUID.randomUUID();
        this.kanji = kanji;
        this.radicalNo = radicalNo;
        this.mnemonicVi = mnemonicVi;
        this.source = source;
        this.generatedModel = generatedModel;
        this.createdBy = createdBy;
    }

    public UUID getId() { return id; }
    public String getKanji() { return kanji; }
    public Integer getRadicalNo() { return radicalNo; }
    public String getMnemonicVi() { return mnemonicVi; }
    public String getSource() { return source; }
    public String getStatus() { return status; }
    public String getGeneratedModel() { return generatedModel; }
    public Long getCreatedBy() { return createdBy; }
    public Long getReviewedBy() { return reviewedBy; }
    public Instant getReviewedAt() { return reviewedAt; }
    public String getReviewNote() { return reviewNote; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Integer getModLabel() { return modLabel; }
    public Double getModScore() { return modScore == null ? null : modScore.doubleValue(); }
    public String getModSpans() { return modSpans; }
    public Instant getModAt() { return modAt; }
    public void setModeration(Integer label, Double score, String spans, Instant at) {
        this.modLabel = label;
        this.modScore = score == null ? null : score.floatValue();
        this.modSpans = spans;
        this.modAt = at;
    }
}
