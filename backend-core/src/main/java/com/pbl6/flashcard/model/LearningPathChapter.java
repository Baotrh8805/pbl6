package com.pbl6.flashcard.model;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

/** Một chương của lộ trình (V13): gắn một bộ thẻ và khoảng ngày học [dayFrom, dayTo]. */
@Entity
@Table(name = "learning_path_chapters")
public class LearningPathChapter {

    @Id
    private UUID id;

    @Column(name = "path_id", nullable = false)
    private UUID pathId;

    @Column(nullable = false)
    private int position;

    @Column(nullable = false, length = 100)
    private String title;

    @Column(name = "deck_id")
    private String deckId;

    /** NULL khi DRAFT (tính sống từ extraction_items), chốt khi ACTIVE. */
    @Column(name = "card_count")
    private Integer cardCount;

    @Column(name = "day_from")
    private Integer dayFrom;

    @Column(name = "day_to")
    private Integer dayTo;

    /** Điểm % cao nhất của bài kiểm tra cuối chương (V20); null = chưa làm. */
    @Column(name = "quiz_best_pct")
    private Integer quizBestPct;

    /** Thời điểm đạt ngưỡng learning_path_quiz_pass_pct lần đầu (V20); null = chưa qua chương. */
    @Column(name = "quiz_passed_at")
    private Instant quizPassedAt;

    public LearningPathChapter() {}

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getPathId() { return pathId; }
    public void setPathId(UUID pathId) { this.pathId = pathId; }
    public int getPosition() { return position; }
    public void setPosition(int position) { this.position = position; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDeckId() { return deckId; }
    public void setDeckId(String deckId) { this.deckId = deckId; }
    public Integer getCardCount() { return cardCount; }
    public void setCardCount(Integer cardCount) { this.cardCount = cardCount; }
    public Integer getDayFrom() { return dayFrom; }
    public void setDayFrom(Integer dayFrom) { this.dayFrom = dayFrom; }
    public Integer getDayTo() { return dayTo; }
    public void setDayTo(Integer dayTo) { this.dayTo = dayTo; }
    public Integer getQuizBestPct() { return quizBestPct; }
    public void setQuizBestPct(Integer quizBestPct) { this.quizBestPct = quizBestPct; }
    public Instant getQuizPassedAt() { return quizPassedAt; }
    public void setQuizPassedAt(Instant quizPassedAt) { this.quizPassedAt = quizPassedAt; }
}
