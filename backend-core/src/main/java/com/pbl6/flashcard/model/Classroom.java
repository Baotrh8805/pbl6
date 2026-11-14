package com.pbl6.flashcard.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "classrooms", indexes = {
        @Index(name = "idx_classrooms_owner", columnList = "owner_id"),
        @Index(name = "idx_classrooms_code", columnList = "code")
})
public class Classroom {

    public static final String PRIVACY_PUBLIC = "PUBLIC";
    public static final String PRIVACY_PRIVATE = "PRIVATE";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(nullable = false, unique = true, length = 12)
    private String code;

    @Column(name = "jlpt_level", length = 10)
    private String jlptLevel = "N5";

    @Column(nullable = false, length = 20)
    private String privacy = PRIVACY_PRIVATE;

    @Column(name = "owner_id", nullable = false)
    private Long ownerId;

    @Column(name = "max_students")
    private Integer maxStudents = 30;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at")
    private Instant updatedAt = Instant.now();

    public Classroom() {}

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getJlptLevel() {
        return jlptLevel;
    }

    public void setJlptLevel(String jlptLevel) {
        this.jlptLevel = jlptLevel;
    }

    public String getPrivacy() {
        return privacy;
    }

    public void setPrivacy(String privacy) {
        this.privacy = privacy;
    }

    public Long getOwnerId() {
        return ownerId;
    }

    public void setOwnerId(Long ownerId) {
        this.ownerId = ownerId;
    }

    public Integer getMaxStudents() {
        return maxStudents;
    }

    public void setMaxStudents(Integer maxStudents) {
        this.maxStudents = maxStudents;
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
