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

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public QuizResult() {}

    public QuizResult(Long userId, String deckId, int score, int total) {
        this.userId = userId;
        this.deckId = deckId;
        this.score = score;
        this.total = total;
    }

    public Long getId() { return id; }
    public Long getUserId() { return userId; }
    public String getDeckId() { return deckId; }
    public int getScore() { return score; }
    public int getTotal() { return total; }
    public Instant getCreatedAt() { return createdAt; }
}
