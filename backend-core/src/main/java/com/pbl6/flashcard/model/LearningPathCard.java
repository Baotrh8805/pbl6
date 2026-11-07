package com.pbl6.flashcard.model;

import jakarta.persistence.*;

import java.util.UUID;

/**
 * Một thẻ trong lịch của lộ trình (V20): chốt khi kích hoạt, mỗi thẻ một ngày học. Lịch bám card_id chứ không bám
 * vị trí trong bộ, nên sửa / thêm / xoá thẻ sau khi kích hoạt không làm dải trôi (thẻ bị xoá -> dòng mất theo CASCADE).
 */
@Entity
@Table(name = "learning_path_cards")
public class LearningPathCard {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "path_id", nullable = false)
    private UUID pathId;

    @Column(name = "chapter_id", nullable = false)
    private UUID chapterId;

    @Column(name = "card_id", nullable = false)
    private String cardId;

    /** Thứ tự trong lộ trình: chương trước, rồi thứ tự tài liệu trong chương. */
    @Column(nullable = false)
    private int seq;

    /** Ngày học thứ mấy (1-based, chỉ đếm ngày học theo study_days). */
    @Column(name = "scheduled_day", nullable = false)
    private int scheduledDay;

    /**
     * Trọng số độ khó so với trình độ người học (spec §3.1): 1.0 ngang / dưới cấp, 1.3 và 1.5 trên cấp, 1.2 chưa rõ, ngữ pháp
     * +0.2. columnDefinition để ddl-auto=validate chấp nhận double trên cột numeric(3,1).
     */
    @Column(nullable = false, columnDefinition = "numeric(3,1)")
    private double weight = 1.0;

    public LearningPathCard() {}

    public Long getId() { return id; }
    public UUID getPathId() { return pathId; }
    public void setPathId(UUID pathId) { this.pathId = pathId; }
    public UUID getChapterId() { return chapterId; }
    public void setChapterId(UUID chapterId) { this.chapterId = chapterId; }
    public String getCardId() { return cardId; }
    public void setCardId(String cardId) { this.cardId = cardId; }
    public int getSeq() { return seq; }
    public void setSeq(int seq) { this.seq = seq; }
    public int getScheduledDay() { return scheduledDay; }
    public void setScheduledDay(int scheduledDay) { this.scheduledDay = scheduledDay; }
    public double getWeight() { return weight; }
    public void setWeight(double weight) { this.weight = weight; }
}
