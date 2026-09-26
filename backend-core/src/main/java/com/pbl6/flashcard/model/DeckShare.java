package com.pbl6.flashcard.model;

import jakarta.persistence.*;
import java.time.Instant;

/** Quyền của một người (không phải chủ) trên một bộ thẻ. Unique (deck_id, user_id) ở DB. */
@Entity
@Table(name = "deck_shares")
public class DeckShare {

    public static final String VIEWER = "VIEWER";
    public static final String EDITOR = "EDITOR";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "deck_id", nullable = false)
    private String deckId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, length = 10)
    private String permission;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private Instant createdAt;

    public DeckShare() {}

    public DeckShare(String deckId, Long userId, String permission) {
        this.deckId = deckId;
        this.userId = userId;
        this.permission = permission;
    }

    public Long getId() { return id; }
    public String getDeckId() { return deckId; }
    public Long getUserId() { return userId; }

    public String getPermission() { return permission; }
    public void setPermission(String permission) { this.permission = permission; }
}
