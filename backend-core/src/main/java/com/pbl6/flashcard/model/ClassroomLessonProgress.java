package com.pbl6.flashcard.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "classroom_lesson_progress", indexes = {
        @Index(name = "idx_lesson_progress_user", columnList = "user_id")
}, uniqueConstraints = {
        @UniqueConstraint(name = "uq_lesson_user_progress", columnNames = {"lesson_id", "user_id"})
})
public class ClassroomLessonProgress {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "lesson_id", nullable = false)
    private Long lessonId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "is_completed")
    private Boolean isCompleted = false;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "quiz_score")
    private Integer quizScore;

    @Column(name = "quiz_attempt_id")
    private UUID quizAttemptId;

    public ClassroomLessonProgress() {}

    public ClassroomLessonProgress(Long lessonId, Long userId) {
        this.lessonId = lessonId;
        this.userId = userId;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getLessonId() {
        return lessonId;
    }

    public void setLessonId(Long lessonId) {
        this.lessonId = lessonId;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public Boolean getIsCompleted() {
        return isCompleted;
    }

    public void setIsCompleted(Boolean isCompleted) {
        this.isCompleted = isCompleted;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }

    public void setCompletedAt(Instant completedAt) {
        this.completedAt = completedAt;
    }

    public Integer getQuizScore() {
        return quizScore;
    }

    public void setQuizScore(Integer quizScore) {
        this.quizScore = quizScore;
    }

    public UUID getQuizAttemptId() {
        return quizAttemptId;
    }

    public void setQuizAttemptId(UUID quizAttemptId) {
        this.quizAttemptId = quizAttemptId;
    }
}
