package com.pbl6.flashcard.model;

import jakarta.persistence.*;

import java.time.Instant;

/** Khiếu nại của tài khoản bị khoá (V27). Một khiếu nại OPEN mỗi email (partial unique index ở DB). */
@Entity
@Table(name = "account_appeals")
public class AccountAppeal {

    public static final String OPEN = "OPEN";
    public static final String RESOLVED = "RESOLVED";
    public static final String DISMISSED = "DISMISSED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String email;

    @Column(name = "user_id")
    private Long userId;

    @Column(nullable = false, length = 1000)
    private String message;

    /**
     * Lý do khoá lúc gửi (V29, STAFF-07): users.locked_reason đổi theo mở / khoá lại nên phải chụp lại tại đây.
     * "" = lúc gửi bị khoá không ghi lý do; null = khiếu nại gửi trước V29 (không biết lý do lúc gửi).
     */
    @Column(name = "locked_reason_at_submit", columnDefinition = "text")
    private String lockedReasonAtSubmit;

    @Column(nullable = false, length = 10)
    private String status = OPEN;

    @Column(length = 10)
    private String action;

    @Column(name = "resolution_note", length = 500)
    private String resolutionNote;

    @Column(name = "resolved_by")
    private Long resolvedBy;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    public String getLockedReasonAtSubmit() { return lockedReasonAtSubmit; }
    public void setLockedReasonAtSubmit(String lockedReasonAtSubmit) { this.lockedReasonAtSubmit = lockedReasonAtSubmit; }
    public String getStatus() { return status; }
    public String getAction() { return action; }
    public String getResolutionNote() { return resolutionNote; }
    public Long getResolvedBy() { return resolvedBy; }
    public Instant getResolvedAt() { return resolvedAt; }
    public Instant getCreatedAt() { return createdAt; }
}
