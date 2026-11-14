package com.pbl6.flashcard.model;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "classroom_quiz_attempts", indexes = {
        @Index(name = "idx_classroom_quiz_attempts_user", columnList = "quiz_id, user_id")
})
public class ClassroomQuizAttempt {

    @Id
    private UUID id;

    @Column(name = "quiz_id", nullable = false)
    private Long quizId;

    @Column(name = "classroom_id", nullable = false)
    private Long classroomId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "items_json", nullable = false, columnDefinition = "jsonb")
    private String itemsJson;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    public ClassroomQuizAttempt() {}

    public ClassroomQuizAttempt(UUID id, Long quizId, Long classroomId, Long userId, String itemsJson, Instant createdAt, Instant expiresAt) {
        this.id = id;
        this.quizId = quizId;
        this.classroomId = classroomId;
        this.userId = userId;
        this.itemsJson = itemsJson;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
    }

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public Long getQuizId() {
        return quizId;
    }

    public void setQuizId(Long quizId) {
        this.quizId = quizId;
    }

    public Long getClassroomId() {
        return classroomId;
    }

    public void setClassroomId(Long classroomId) {
        this.classroomId = classroomId;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getItemsJson() {
        return itemsJson;
    }

    public void setItemsJson(String itemsJson) {
        this.itemsJson = itemsJson;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(Instant expiresAt) {
        this.expiresAt = expiresAt;
    }
}
