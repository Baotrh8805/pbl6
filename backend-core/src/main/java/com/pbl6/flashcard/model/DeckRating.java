package com.pbl6.flashcard.model;

import jakarta.persistence.*;
import java.time.Instant;

/** Một lượt chấm sao. Ghi bằng DeckRatingRepository.upsert; entity chỉ để Hibernate validate schema. */
@Entity
@Table(name = "deck_ratings")
public class DeckRating {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "deck_id", nullable = false)
    private String deckId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false)
    private Short stars;

    @Column(length = 500)
    private String comment;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    // Kiểm duyệt AI (V38): ghi bằng ModerationStore (JDBC); entity chỉ đọc
    @Column(name = "mod_status", nullable = false, length = 8, insertable = false, updatable = false)
    private String modStatus;

    @Column(name = "mod_spans", insertable = false, updatable = false)
    private String modSpans;

    public DeckRating() {}

    public Long getId() { return id; }
    public String getDeckId() { return deckId; }
    public Long getUserId() { return userId; }
    public Short getStars() { return stars; }
    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public String getModStatus() { return modStatus; }
    public String getModSpans() { return modSpans; }
}
