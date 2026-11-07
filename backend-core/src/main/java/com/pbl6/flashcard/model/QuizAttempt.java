package com.pbl6.flashcard.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Một lượt làm quiz do server phát (xem V5, V9). */
@Entity
@Table(name = "quiz_attempts")
public class QuizAttempt {

    public static final String PRACTICE = "practice";
    public static final String EXAM = "exam";

    private static final String SEPARATOR = "\n";

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "deck_id", nullable = false)
    private String deckId;

    @Column(name = "card_ids", nullable = false, columnDefinition = "text")
    private String cardIds;

    @Column(nullable = false, length = 16)
    private String mode;

    /** JSON bản chụp đề (có đáp án đúng): chỉ dùng ở server. */
    @Column(nullable = false, columnDefinition = "text")
    private String questions;

    /** JSON cardId -> nghĩa đã chọn. */
    @Column(nullable = false, columnDefinition = "text")
    private String answers = "{}";

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "submitted_at")
    private Instant submittedAt;

    public QuizAttempt() {}

    public QuizAttempt(Long userId, String deckId, String mode, List<String> cardIds, String questions,
                       Instant createdAt, Instant expiresAt) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.deckId = deckId;
        this.mode = mode;
        // Id thẻ do server sinh (UUID) hoặc slug seed: không chứa xuống dòng
        this.cardIds = String.join(SEPARATOR, cardIds);
        this.questions = questions;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
    }

    public UUID getId() { return id; }
    public Long getUserId() { return userId; }
    public String getDeckId() { return deckId; }
    public String getMode() { return mode; }
    public boolean isPractice() { return PRACTICE.equals(mode); }
    public List<String> getCardIds() { return List.of(cardIds.split(SEPARATOR)); }
    public String getQuestions() { return questions; }
    public String getAnswers() { return answers; }
    public void setAnswers(String answers) { this.answers = answers; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getExpiresAt() { return expiresAt; }
    public Instant getSubmittedAt() { return submittedAt; }
    public void setSubmittedAt(Instant submittedAt) { this.submittedAt = submittedAt; }
}
