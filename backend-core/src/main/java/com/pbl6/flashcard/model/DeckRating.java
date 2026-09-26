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

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public DeckRating() {}

    public Long getId() { return id; }
    public String getDeckId() { return deckId; }
    public Long getUserId() { return userId; }
    public Short getStars() { return stars; }
    public Instant getUpdatedAt() { return updatedAt; }
}
