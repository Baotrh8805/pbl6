package com.pbl6.flashcard.model;

import jakarta.persistence.*;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Lộ trình học tập (V13): một lượt bóc tách tài liệu -> các chương -> lịch học theo ngày.
 * Xoá lộ trình chỉ xoá kế hoạch, bộ thẻ / thư mục giữ nguyên.
 */
@Entity
@Table(name = "learning_paths")
public class LearningPath {

    public static final String PROCESSING = "PROCESSING";
    public static final String DRAFT = "DRAFT";
    public static final String ACTIVE = "ACTIVE";
    public static final String FAILED = "FAILED";
    /** source_type của lộ trình bổ khuyết (V20, spec §3.8): không có job bóc tách, tạo thẳng ACTIVE. */
    public static final String SOURCE_REMEDIAL = "remedial";

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, length = 100)
    private String title;

    @Column(name = "source_type", nullable = false, length = 10)
    private String sourceType;

    @Column(name = "source_name")
    private String sourceName;

    @Column(nullable = false, length = 12)
    private String status = PROCESSING;

    @Column(name = "job_id")
    private UUID jobId;

    @Column(name = "folder_id")
    private UUID folderId;

    @Column(name = "total_days", nullable = false)
    private int totalDays;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "chapters_detected")
    private Boolean chaptersDetected;

    @Column(name = "error_message", length = 500)
    private String errorMessage;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "activated_at")
    private Instant activatedAt;

    /** Trần tải mỗi ngày (thẻ mới + ôn dự báo), 5–200 (V20); mặc định lấy từ app_settings learning_path_daily_cap_default. */
    @Column(name = "daily_cap", nullable = false)
    private int dailyCap = 50;

    /** Ngày học trong tuần T2..CN, 7 ký tự 0/1, không được toàn 0 (V20). Ngày tắt là ngày nghỉ, không đếm vào dayIndex. */
    @Column(name = "study_days", nullable = false, length = 7)
    private String studyDays = "1111111";

    /** Nhận thông báo nhắc học mỗi sáng (V20). */
    @Column(nullable = false)
    private boolean reminder = true;

    /** Người dùng chốt hoàn thành hoặc hệ thống tự đặt khi qua ngày cuối và đã học hết (V20). */
    @Column(name = "completed_at")
    private Instant completedAt;

    /** Lần cân lại lịch gần nhất (V20); null = chưa từng. */
    @Column(name = "last_rebalanced_at")
    private Instant lastRebalancedAt;

    /**
     * Ngày (theo múi giờ cấu hình) job nhắc học đã xét lộ trình này lần gần nhất (V21): LearningPathReminderJob ghi kể cả khi hôm
     * đó không có gì để nhắc, nên mỗi lộ trình được xét đúng một lần mỗi ngày dù job chạy mỗi giờ. null = chưa từng.
     */
    @Column(name = "last_reminded_on")
    private LocalDate lastRemindedOn;

    public LearningPath() {}

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getSourceType() { return sourceType; }
    public void setSourceType(String sourceType) { this.sourceType = sourceType; }
    public String getSourceName() { return sourceName; }
    public void setSourceName(String sourceName) { this.sourceName = sourceName; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public UUID getJobId() { return jobId; }
    public void setJobId(UUID jobId) { this.jobId = jobId; }
    public UUID getFolderId() { return folderId; }
    public void setFolderId(UUID folderId) { this.folderId = folderId; }
    public int getTotalDays() { return totalDays; }
    public void setTotalDays(int totalDays) { this.totalDays = totalDays; }
    public LocalDate getStartDate() { return startDate; }
    public void setStartDate(LocalDate startDate) { this.startDate = startDate; }
    public Boolean getChaptersDetected() { return chaptersDetected; }
    public void setChaptersDetected(Boolean chaptersDetected) { this.chaptersDetected = chaptersDetected; }
    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getActivatedAt() { return activatedAt; }
    public void setActivatedAt(Instant activatedAt) { this.activatedAt = activatedAt; }
    public int getDailyCap() { return dailyCap; }
    public void setDailyCap(int dailyCap) { this.dailyCap = dailyCap; }
    public String getStudyDays() { return studyDays; }
    public void setStudyDays(String studyDays) { this.studyDays = studyDays; }
    public boolean isReminder() { return reminder; }
    public void setReminder(boolean reminder) { this.reminder = reminder; }
    public Instant getCompletedAt() { return completedAt; }
    public void setCompletedAt(Instant completedAt) { this.completedAt = completedAt; }
    public Instant getLastRebalancedAt() { return lastRebalancedAt; }
    public void setLastRebalancedAt(Instant lastRebalancedAt) { this.lastRebalancedAt = lastRebalancedAt; }
    public LocalDate getLastRemindedOn() { return lastRemindedOn; }
    public void setLastRemindedOn(LocalDate lastRemindedOn) { this.lastRemindedOn = lastRemindedOn; }
}
