package com.pbl6.flashcard.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "classroom_announcement_comments", indexes = {
        @Index(name = "idx_announcement_comments", columnList = "announcement_id, created_at")
})
public class ClassroomAnnouncementComment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "announcement_id", nullable = false)
    private Long announcementId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();

    public ClassroomAnnouncementComment() {}

    public ClassroomAnnouncementComment(Long announcementId, Long userId, String content) {
        this.announcementId = announcementId;
        this.userId = userId;
        this.content = content;
        this.createdAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getAnnouncementId() {
        return announcementId;
    }

    public void setAnnouncementId(Long announcementId) {
        this.announcementId = announcementId;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
