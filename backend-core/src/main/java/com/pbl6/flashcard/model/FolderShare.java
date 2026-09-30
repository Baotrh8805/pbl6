package com.pbl6.flashcard.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/** Một người (không phải chủ) được xem thư mục và mọi thư mục con. Unique (folder_id, user_id) ở DB. */
@Entity
@Table(name = "folder_shares")
public class FolderShare {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "folder_id", nullable = false)
    private UUID folderId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private Instant createdAt;

    public FolderShare() {}

    public FolderShare(UUID folderId, Long userId) {
        this.folderId = folderId;
        this.userId = userId;
    }

    public Long getId() { return id; }
    public UUID getFolderId() { return folderId; }
    public Long getUserId() { return userId; }
}
