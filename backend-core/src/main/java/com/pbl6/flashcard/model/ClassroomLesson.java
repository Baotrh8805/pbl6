package com.pbl6.flashcard.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "classroom_lessons", indexes = {
        @Index(name = "idx_classroom_lessons_class", columnList = "classroom_id, order_index")
})
public class ClassroomLesson {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "classroom_id", nullable = false)
    private Long classroomId;

    @Column(name = "order_index", nullable = false)
    private Integer orderIndex;

    @Column(nullable = false, length = 150)
    private String title;

    @Column(name = "scheduled_date")
    private LocalDate scheduledDate;

    @Column(name = "has_quiz")
    private Boolean hasQuiz = false;

    @Column(name = "quiz_duration_minutes")
    private Integer quizDurationMinutes = 15;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "classroom_lesson_decks", joinColumns = @JoinColumn(name = "lesson_id"))
    @Column(name = "deck_id")
    private List<String> deckIds = new ArrayList<>();

    public ClassroomLesson() {}

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

    public Integer getOrderIndex() {
        return orderIndex;
    }

    public void setOrderIndex(Integer orderIndex) {
        this.orderIndex = orderIndex;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public LocalDate getScheduledDate() {
        return scheduledDate;
    }

    public void setScheduledDate(LocalDate scheduledDate) {
        this.scheduledDate = scheduledDate;
    }

    public Boolean getHasQuiz() {
        return hasQuiz;
    }

    public void setHasQuiz(Boolean hasQuiz) {
        this.hasQuiz = hasQuiz;
    }

    public Integer getQuizDurationMinutes() {
        return quizDurationMinutes;
    }

    public void setQuizDurationMinutes(Integer quizDurationMinutes) {
        this.quizDurationMinutes = quizDurationMinutes;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public List<String> getDeckIds() {
        return deckIds;
    }

    public void setDeckIds(List<String> deckIds) {
        this.deckIds = deckIds;
    }
}
