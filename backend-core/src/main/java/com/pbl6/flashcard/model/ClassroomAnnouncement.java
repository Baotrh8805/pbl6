package com.pbl6.flashcard.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "classroom_announcements", indexes = {
        @Index(name = "idx_announcements_class", columnList = "classroom_id, created_at")
})
public class ClassroomAnnouncement {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "classroom_id", nullable = false)
    private Long classroomId;

    @Column(name = "author_id", nullable = false)
    private Long authorId;

    @Column(length = 200)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(name = "is_pinned")
    private Boolean isPinned = false;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();

    public ClassroomAnnouncement() {}

    public ClassroomAnnouncement(Long classroomId, Long authorId, String title, String content) {
        this.classroomId = classroomId;
        this.authorId = authorId;
        this.title = title;
        this.content = content;
        this.createdAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getClassroomId() {
        return classroomId;
    }

    public void setClassroomId(Long classroomId) {
        this.classroomId = classroomId;
    }

    public Long getAuthorId() {
        return authorId;
    }

    public void setAuthorId(Long authorId) {
        this.authorId = authorId;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public Boolean getIsPinned() {
        return isPinned;
    }

    public void setIsPinned(Boolean isPinned) {
        this.isPinned = isPinned;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
