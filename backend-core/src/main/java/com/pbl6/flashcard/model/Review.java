package com.pbl6.flashcard.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.time.Instant;

// Nguồn sự thật của tiến độ SRS. Unique (user_id, card_id): mỗi người 1 bản ghi cho mỗi thẻ.
@Entity
@Table(name = "reviews", uniqueConstraints = @UniqueConstraint(columnNames = { "user_id", "card_id" }))
public class Review {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @JsonIgnore
    private Long id;

    @JsonIgnore
    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "card_id", nullable = false)
    private String cardId;

    @Column(nullable = false)
    private int reps;

    @Column(name = "interval_days", nullable = false)
    private int intervalDays;

    @Column(nullable = false)
    private double ease;

    @Column(name = "due_at", nullable = false)
    private Instant dueAt;

    // HLR (V38, spec 2026-10-27 đêm §8): số lượt đã chấm / đúng (không tính học nhanh), lượt gần nhất, p nhớ dự đoán ngay trước
    // lượt chấm gần nhất (null khi chưa gọi được HLR), cờ "phanh" (lượt gần nhất giữ khoảng ôn vì HLR dự đoán quên)
    @Column(nullable = false)
    private int seen;

    @Column(nullable = false)
    private int correct;

    @Column(name = "last_reviewed_at")
    private Instant lastReviewedAt;

    @Column(name = "recall_p")
    private Float recallP;

    @Column(name = "hlr_brake", nullable = false)
    private boolean hlrBrake;

    public Review() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }

    public String getCardId() { return cardId; }
    public void setCardId(String cardId) { this.cardId = cardId; }

    public int getReps() { return reps; }
    public void setReps(int reps) { this.reps = reps; }

    public int getIntervalDays() { return intervalDays; }
    public void setIntervalDays(int intervalDays) { this.intervalDays = intervalDays; }

    public double getEase() { return ease; }
    public void setEase(double ease) { this.ease = ease; }

    public Instant getDueAt() { return dueAt; }
    public void setDueAt(Instant dueAt) { this.dueAt = dueAt; }
    public int getSeen() { return seen; }
    public void setSeen(int seen) { this.seen = seen; }
    public int getCorrect() { return correct; }
    public void setCorrect(int correct) { this.correct = correct; }
    public Instant getLastReviewedAt() { return lastReviewedAt; }
    public void setLastReviewedAt(Instant lastReviewedAt) { this.lastReviewedAt = lastReviewedAt; }
    /** Cột real (float4): làm tròn 4 chữ số để response trước và sau khi đọc lại từ DB cùng một giá trị (0,55 thay vì 0,5500000119). */
    public Double getRecallP() { return recallP == null ? null : Math.round(recallP.doubleValue() * 10_000) / 10_000.0; }
    public void setRecallP(Double recallP) { this.recallP = recallP == null ? null : recallP.floatValue(); }
    public boolean isHlrBrake() { return hlrBrake; }
    public void setHlrBrake(boolean hlrBrake) { this.hlrBrake = hlrBrake; }
}
