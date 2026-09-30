package com.pbl6.flashcard.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Một lượt làm quiz do server phát (xem V5__quiz_attempts.sql). */
@Entity
@Table(name = "quiz_attempts")
public class QuizAttempt {

    private static final String SEPARATOR = "\n";

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "deck_id", nullable = false)
    private String deckId;

    @Column(name = "card_ids", nullable = false, columnDefinition = "text")
    private String cardIds;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "submitted_at")
    private Instant submittedAt;

    public QuizAttempt() {}

    public QuizAttempt(Long userId, String deckId, List<String> cardIds, Instant createdAt, Instant expiresAt) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.deckId = deckId;
        // Id thẻ do server sinh (UUID) hoặc slug seed: không chứa xuống dòng
        this.cardIds = String.join(SEPARATOR, cardIds);
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
    }

    public UUID getId() { return id; }
    public Long getUserId() { return userId; }
    public String getDeckId() { return deckId; }
    public List<String> getCardIds() { return List.of(cardIds.split(SEPARATOR)); }
    public Instant getExpiresAt() { return expiresAt; }
    public Instant getSubmittedAt() { return submittedAt; }
    public void setSubmittedAt(Instant submittedAt) { this.submittedAt = submittedAt; }
}
