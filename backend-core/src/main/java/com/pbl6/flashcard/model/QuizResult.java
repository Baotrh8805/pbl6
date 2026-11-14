package com.pbl6.flashcard.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;

import java.time.Instant;

@Entity
@Table(name = "quiz_results")
public class QuizResult {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @JsonIgnore
    private Long id;

    @JsonIgnore // id nội bộ, client không cần
    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "deck_id", nullable = false)
    private String deckId;

    @Column(nullable = false)
    private int score;

    @Column(nullable = false)
    private int total;

    @Column(nullable = false, length = 16)
    private String mode = QuizAttempt.EXAM;

    @JsonIgnore
    @Column(name = "attempt_id")
    private java.util.UUID attemptId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public QuizResult() {}

    public QuizResult(Long userId, String deckId, int score, int total, String mode, java.util.UUID attemptId) {
        this.userId = userId;
        this.deckId = deckId;
        this.score = score;
        this.total = total;
        this.mode = mode;
        this.attemptId = attemptId;
    }

    public Long getId() { return id; }
    public Long getUserId() { return userId; }
    public String getDeckId() { return deckId; }
    public int getScore() { return score; }
    public int getTotal() { return total; }
    public String getMode() { return mode; }
    public Instant getCreatedAt() { return createdAt; }
}
