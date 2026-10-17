package com.pbl6.flashcard.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import java.time.LocalDateTime;

@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String email;

    @JsonIgnore
    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "full_name")
    private String fullName;

    @Column(name = "jlpt_level")
    private String jlptLevel = "N5";

    @Column(name = "is_premium")
    private Boolean isPremium = false;

    @Enumerated(EnumType.STRING)
    private Role role = Role.USER;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    /** Token có iat trước mốc này bị từ chối (đổi mật khẩu = đăng xuất mọi phiên cũ). */
    @JsonIgnore
    @Column(name = "password_changed_at")
    private java.time.Instant passwordChangedAt;

    /** Khác null = tài khoản bị khoá: không đăng nhập, token đang có bị từ chối (Admin Panel). */
    @Column(name = "locked_at")
    private java.time.Instant lockedAt;

    /** Hạn mức bóc tách / ngày riêng; null = theo app_settings. */
    @Column(name = "extraction_daily_limit")
    private Integer extractionDailyLimit;

    public User() {}

    /** Email so khớp không phân biệt hoa thường: lưu và tra cứu luôn ở dạng này. */
    public static String normalizeEmail(String email) {
        return email == null ? null : email.trim().toLowerCase(java.util.Locale.ROOT);
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }

    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }

    public String getJlptLevel() { return jlptLevel; }
    public void setJlptLevel(String jlptLevel) { this.jlptLevel = jlptLevel; }

    public Boolean getIsPremium() { return isPremium; }
    public void setIsPremium(Boolean isPremium) { this.isPremium = isPremium; }

    public Role getRole() { return role; }
    public void setRole(Role role) { this.role = role; }

    public java.time.Instant getPasswordChangedAt() { return passwordChangedAt; }
    public void setPasswordChangedAt(java.time.Instant passwordChangedAt) { this.passwordChangedAt = passwordChangedAt; }

    public java.time.Instant getLockedAt() { return lockedAt; }
    public void setLockedAt(java.time.Instant lockedAt) { this.lockedAt = lockedAt; }

    public Integer getExtractionDailyLimit() { return extractionDailyLimit; }
    public void setExtractionDailyLimit(Integer extractionDailyLimit) { this.extractionDailyLimit = extractionDailyLimit; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
