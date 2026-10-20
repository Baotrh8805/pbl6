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

    /** Hạn Premium; null = vĩnh viễn (khi is_premium = true). HousekeepingJob hạ về free khi quá hạn. */
    @Column(name = "premium_until")
    private java.time.Instant premiumUntil;

    /** Staff: phải đổi mật khẩu (seed / do người khác đặt) trước khi dùng Admin Panel. */
    @JsonIgnore
    @Column(name = "must_change_password", nullable = false)
    private boolean mustChangePassword = false;

    /** Lý do admin khoá (hiện cho người bị khoá khi đăng nhập); null khi không khoá. */
    @Column(name = "locked_reason")
    private String lockedReason;

    /**
     * Mốc xác thực email (V24); null = chưa xác thực -> USER bị chặn đăng nhập khi app_settings email_verification_required
     * bật (EmailVerificationService.mustVerify). Staff không bao giờ bị chặn bởi cột này.
     */
    @JsonIgnore
    @Column(name = "email_verified_at")
    private java.time.Instant emailVerifiedAt;

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
    /**
     * Cắt về micro giây (độ chính xác Postgres lưu): token cấp ngay từ user trong bộ nhớ (đổi mật khẩu) mang pcv = mốc này
     * tính bằng ms, phải khớp mốc JwtAuthenticationFilter đọc lại từ DB ở request sau (DB tự làm tròn có thể lên 1 ms).
     */
    public void setPasswordChangedAt(java.time.Instant passwordChangedAt) {
        this.passwordChangedAt = passwordChangedAt == null ? null
                : passwordChangedAt.truncatedTo(java.time.temporal.ChronoUnit.MICROS);
    }

    public java.time.Instant getLockedAt() { return lockedAt; }
    public void setLockedAt(java.time.Instant lockedAt) { this.lockedAt = lockedAt; }

    public Integer getExtractionDailyLimit() { return extractionDailyLimit; }
    public void setExtractionDailyLimit(Integer extractionDailyLimit) { this.extractionDailyLimit = extractionDailyLimit; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public java.time.Instant getPremiumUntil() { return premiumUntil; }
    public void setPremiumUntil(java.time.Instant premiumUntil) { this.premiumUntil = premiumUntil; }
    public boolean isMustChangePassword() { return mustChangePassword; }
    public void setMustChangePassword(boolean mustChangePassword) { this.mustChangePassword = mustChangePassword; }
    public String getLockedReason() { return lockedReason; }
    public void setLockedReason(String lockedReason) { this.lockedReason = lockedReason; }
    public java.time.Instant getEmailVerifiedAt() { return emailVerifiedAt; }
    public void setEmailVerifiedAt(java.time.Instant emailVerifiedAt) { this.emailVerifiedAt = emailVerifiedAt; }

    /** Staff còn phải đổi mật khẩu seed: chỉ được dùng /api/auth/** để hoàn tất. */
    @JsonIgnore
    public boolean isSetupPending() { return role != Role.USER && mustChangePassword; }
}
