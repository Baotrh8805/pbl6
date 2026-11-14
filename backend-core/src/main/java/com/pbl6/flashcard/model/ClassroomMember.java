package com.pbl6.flashcard.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "classroom_members", indexes = {
        @Index(name = "idx_classroom_members_class", columnList = "classroom_id, status"),
        @Index(name = "idx_classroom_members_user", columnList = "user_id")
}, uniqueConstraints = {
        @UniqueConstraint(name = "uq_classroom_user", columnNames = {"classroom_id", "user_id"})
})
public class ClassroomMember {

    public static final String ROLE_TEACHER = "TEACHER";
    public static final String ROLE_STUDENT = "STUDENT";

    public static final String STATUS_PENDING = "PENDING";
    public static final String STATUS_APPROVED = "APPROVED";
    public static final String STATUS_REJECTED = "REJECTED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "classroom_id", nullable = false)
    private Long classroomId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, length = 20)
    private String role = ROLE_STUDENT;

    @Column(nullable = false, length = 20)
    private String status = STATUS_APPROVED;

    @Column(name = "joined_at")
    private Instant joinedAt = Instant.now();

    public ClassroomMember() {}

    public ClassroomMember(Long classroomId, Long userId, String role, String status) {
        this.classroomId = classroomId;
        this.userId = userId;
        this.role = role;
        this.status = status;
        this.joinedAt = Instant.now();
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

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Instant getJoinedAt() {
        return joinedAt;
    }

    public void setJoinedAt(Instant joinedAt) {
        this.joinedAt = joinedAt;
    }
}
