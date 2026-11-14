package com.pbl6.flashcard.model;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "classroom_quizzes", indexes = {
        @Index(name = "idx_classroom_quizzes_class", columnList = "classroom_id"),
        @Index(name = "idx_classroom_quizzes_lesson", columnList = "lesson_id")
})
public class ClassroomQuiz {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "classroom_id", nullable = false)
    private Long classroomId;

    @Column(name = "lesson_id")
    private Long lessonId;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "duration_minutes", nullable = false)
    private Integer durationMinutes = 15;

    @Column(name = "question_count", nullable = false)
    private Integer questionCount = 30;

    @Column(name = "card_range", length = 50)
    private String cardRange;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "deck_ids", columnDefinition = "jsonb")
    private List<String> deckIds = new ArrayList<>();

    @Column(name = "scope_type", length = 30)
    private String scopeType = "LESSON_ONLY";

    @Column(name = "required_lesson_id")
    private Long requiredLessonId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "extra_deck_ids", columnDefinition = "jsonb")
    private List<String> extraDeckIds = new ArrayList<>();

    @Column(name = "is_published")
    private Boolean isPublished = true;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at")
    private Instant updatedAt = Instant.now();

    public ClassroomQuiz() {}

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

    public Long getLessonId() {
        return lessonId;
    }

    public void setLessonId(Long lessonId) {
        this.lessonId = lessonId;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public Integer getDurationMinutes() {
        return durationMinutes;
    }

    public void setDurationMinutes(Integer durationMinutes) {
        this.durationMinutes = durationMinutes;
    }

    public Integer getQuestionCount() {
        return questionCount;
    }

    public void setQuestionCount(Integer questionCount) {
        this.questionCount = questionCount;
    }

    public String getCardRange() {
        return cardRange;
    }

    public void setCardRange(String cardRange) {
        this.cardRange = cardRange;
    }

    public List<String> getDeckIds() {
        return deckIds;
    }

    public void setDeckIds(List<String> deckIds) {
        this.deckIds = deckIds;
    }

    public String getScopeType() {
        return scopeType;
    }

    public void setScopeType(String scopeType) {
        this.scopeType = scopeType;
    }

    public Long getRequiredLessonId() {
        return requiredLessonId;
    }

    public void setRequiredLessonId(Long requiredLessonId) {
        this.requiredLessonId = requiredLessonId;
    }

    public List<String> getExtraDeckIds() {
        return extraDeckIds;
    }

    public void setExtraDeckIds(List<String> extraDeckIds) {
        this.extraDeckIds = extraDeckIds;
    }

    public Boolean getIsPublished() {
        return isPublished;
    }

    public void setIsPublished(Boolean isPublished) {
        this.isPublished = isPublished;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
