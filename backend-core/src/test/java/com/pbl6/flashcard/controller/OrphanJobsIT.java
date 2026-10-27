package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.config.InstanceId;
import com.pbl6.flashcard.service.ExtractionService;
import com.pbl6.flashcard.service.LearningPathService;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

/**
 * B8 (kế hoạch 26/10): khởi động lại chỉ đánh FAILED job bóc tách / lộ trình dở dang CỦA CHÍNH instance (V37 instance_id), hoặc dòng
 * chưa ghi instance quá {@link ExtractionService#ORPHAN_GRACE}; việc đang chạy của instance khác và dòng chưa ghi instance còn mới
 * không bị đụng. Dòng chèn thẳng bằng JDBC (không cần ai-service).
 */
class OrphanJobsIT extends IntegrationTest {

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    ExtractionService extraction;

    @Autowired
    LearningPathService learningPaths;

    @Autowired
    InstanceId instance;

    private UUID job(Long uid, String status, String instanceId, Instant createdAt) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO extraction_jobs (id, user_id, source_type, status, stage, options, created_at, instance_id) "
                + "VALUES (?, ?, 'text', ?, 'QUEUED', CAST('{}' AS jsonb), ?, ?)", id, uid, status, Timestamp.from(createdAt), instanceId);
        return id;
    }

    private UUID path(Long uid, String instanceId, Instant createdAt) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO learning_paths (id, user_id, title, source_type, status, total_days, start_date, created_at, instance_id) "
                + "VALUES (?, ?, 'IT mồ côi', 'text', 'PROCESSING', 3, CURRENT_DATE, ?, ?)", id, uid, Timestamp.from(createdAt), instanceId);
        return id;
    }

    private String jobStatus(UUID id) {
        return jdbc.queryForObject("SELECT status FROM extraction_jobs WHERE id = ?", String.class, id);
    }

    private String pathStatus(UUID id) {
        return jdbc.queryForObject("SELECT status FROM learning_paths WHERE id = ?", String.class, id);
    }

    @Test
    void restart_fails_only_own_or_stale_unowned_jobs_and_paths() throws Exception {
        String email = newEmail();
        newUser(email);
        Long uid = userId(email);
        Instant now = Instant.now();
        Instant stale = now.minus(Duration.ofMinutes(40));
        String me = instance.value();
        assertFalse(me.isBlank(), "InstanceId phải có giá trị (hostname khi không cấu hình)");

        UUID mine = job(uid, "RUNNING", me, now);
        UUID other = job(uid, "RUNNING", "other-host", now);
        UUID staleUnowned = job(uid, "QUEUED", null, stale);
        UUID freshUnowned = job(uid, "QUEUED", null, now);
        UUID done = job(uid, "DONE", me, now);
        UUID pMine = path(uid, me, now);
        UUID pOther = path(uid, "other-host", now);
        UUID pStale = path(uid, null, stale);
        UUID pFresh = path(uid, null, now);
        try {
            extraction.failOrphans();
            assertEquals("FAILED", jobStatus(mine), "job của chính instance -> FAILED");
            assertEquals("RUNNING", jobStatus(other), "job instance khác đang chạy -> giữ nguyên");
            assertEquals("FAILED", jobStatus(staleUnowned), "job chưa ghi instance quá 30 phút -> FAILED");
            assertEquals("QUEUED", jobStatus(freshUnowned), "job chưa ghi instance còn mới -> giữ nguyên");
            assertEquals("DONE", jobStatus(done), "job đã xong không bị đụng");
            assertEquals("Máy chủ đã khởi động lại trong lúc xử lý. Hãy chạy lại.",
                    jdbc.queryForObject("SELECT error_message FROM extraction_jobs WHERE id = ?", String.class, mine));

            learningPaths.failOrphans();
            assertEquals("FAILED", pathStatus(pMine));
            assertEquals("PROCESSING", pathStatus(pOther));
            assertEquals("FAILED", pathStatus(pStale));
            assertEquals("PROCESSING", pathStatus(pFresh));
        } finally {
            for (UUID id : List.of(pMine, pOther, pStale, pFresh)) jdbc.update("DELETE FROM learning_paths WHERE id = ?", id);
            for (UUID id : List.of(mine, other, staleUnowned, freshUnowned, done)) jdbc.update("DELETE FROM extraction_jobs WHERE id = ?", id);
        }
    }

    /** Job / lộ trình tạo qua API mang instance của backend đang chạy (V37) — để lần khởi động sau dọn đúng. */
    @Test
    void jobs_created_via_api_carry_the_instance_id() throws Exception {
        String email = newEmail();
        newUser(email);
        Long uid = userId(email);
        Instant before = Instant.now();
        UUID id = job(uid, "QUEUED", instance.value(), before);
        try {
            assertEquals(instance.value(), jdbc.queryForObject("SELECT instance_id FROM extraction_jobs WHERE id = ?", String.class, id));
        } finally {
            jdbc.update("DELETE FROM extraction_jobs WHERE id = ?", id);
        }
    }
}
