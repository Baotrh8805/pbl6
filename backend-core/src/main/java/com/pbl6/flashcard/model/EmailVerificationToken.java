package com.pbl6.flashcard.model;

import jakarta.persistence.*;
import java.time.Instant;

/** Token xác thực email (chỉ lưu hash). Xem V24__email_verification.sql. */
@Entity
@Table(name = "email_verification_tokens")
public class EmailVerificationToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "token_hash", nullable = false, length = 64)
    private String tokenHash;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private Instant createdAt;

    public EmailVerificationToken() {}

    public EmailVerificationToken(Long userId, String tokenHash, Instant expiresAt) {
        this.userId = userId;
        this.tokenHash = tokenHash;
        this.expiresAt = expiresAt;
    }

    public Long getUserId() { return userId; }
    public Instant getExpiresAt() { return expiresAt; }
}
