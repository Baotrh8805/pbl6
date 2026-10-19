package com.pbl6.flashcard.model;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;

/** Thông báo trong app (V17). type tự do (không CHECK) để thêm loại mới không cần migration; payload cho frontend dựng câu. */
@Entity
@Table(name = "notifications")
public class Notification {
    public static final String REPORT_RESOLVED = "REPORT_RESOLVED";
    public static final String DECK_UNPUBLISHED = "DECK_UNPUBLISHED";
    public static final String DECK_DELETED = "DECK_DELETED";
    public static final String COMMENT_CLEARED = "COMMENT_CLEARED";
    public static final String PREMIUM_CHANGED = "PREMIUM_CHANGED";
    public static final String ROLE_CHANGED = "ROLE_CHANGED";
    /** Lộ trình 2.0 (spec §4.4): bản nháp sẵn sàng / thất bại, nhắc học mỗi sáng, qua chương, hoàn thành. Cột type dài 30. */
    public static final String LEARNING_PATH_READY = "LEARNING_PATH_READY";
    public static final String LEARNING_PATH_FAILED = "LEARNING_PATH_FAILED";
    public static final String LEARNING_PATH_REMINDER = "LEARNING_PATH_REMINDER";
    public static final String LEARNING_PATH_CHAPTER_PASSED = "LEARNING_PATH_CHAPTER_PASSED";
    public static final String LEARNING_PATH_COMPLETED = "LEARNING_PATH_COMPLETED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, length = 30)
    private String type;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> payload = Map.of();

    @Column(name = "read_at")
    private Instant readAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Notification() {}

    public Notification(Long userId, String type, Map<String, Object> payload) {
        this.userId = userId;
        this.type = type;
        this.payload = payload == null ? Map.of() : payload;
    }

    public Long getId() { return id; }
    public Long getUserId() { return userId; }
    public String getType() { return type; }
    public Map<String, Object> getPayload() { return payload; }
    public Instant getReadAt() { return readAt; }
    public void setReadAt(Instant readAt) { this.readAt = readAt; }
    public Instant getCreatedAt() { return createdAt; }
}
