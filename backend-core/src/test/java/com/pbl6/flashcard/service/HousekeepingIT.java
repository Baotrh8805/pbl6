package com.pbl6.flashcard.service;

import com.pbl6.flashcard.model.ExtractionJob;
import com.pbl6.flashcard.model.LearningPath;
import com.pbl6.flashcard.model.PasswordResetToken;
import com.pbl6.flashcard.model.RefreshToken;
import com.pbl6.flashcard.repository.ExtractionJobRepository;
import com.pbl6.flashcard.repository.LearningPathRepository;
import com.pbl6.flashcard.repository.PasswordResetTokenRepository;
import com.pbl6.flashcard.repository.RefreshTokenRepository;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * G2/B6: job đêm xoá token hết hạn và job bóc tách đã kết thúc > 90 ngày; giữ mọi thứ còn hiệu lực / đang chạy.
 * LP-1: job của lộ trình không bị xoá, chỉ xoá trắng văn bản khi lộ trình đã ACTIVE.
 */
class HousekeepingIT extends IntegrationTest {

    @Autowired HousekeepingJob housekeeping;
    @Autowired RefreshTokenRepository refreshTokens;
    @Autowired PasswordResetTokenRepository resetTokens;
    @Autowired ExtractionJobRepository jobs;
    @Autowired LearningPathRepository paths;
    @Autowired JdbcTemplate jdbc;

    private int rows(String table, String hash) {
        return jdbc.queryForObject("SELECT count(*) FROM " + table + " WHERE token_hash = ?", Integer.class, hash);
    }

    private ExtractionJob job(Long uid, String status, Instant createdAt) {
        ExtractionJob j = new ExtractionJob();
        j.setId(java.util.UUID.randomUUID()); // id gán tay (ExtractionService cũng vậy)
        j.setUserId(uid);
        j.setSourceType("text");
        j.setStatus(status);
        j.setOptions(Map.of());
        j.setCreatedAt(createdAt);
        return jobs.save(j);
    }

    @Test
    void removes_only_expired_tokens_and_old_finished_jobs() {
        String email = newEmail();
        try { newUser(email); } catch (Exception e) { throw new RuntimeException(e); }
        Long uid = userId(email);
        Instant now = Instant.now();

        refreshTokens.save(new RefreshToken(uid, "h-live", now.plus(Duration.ofDays(1))));
        refreshTokens.save(new RefreshToken(uid, "h-dead", now.minus(Duration.ofMinutes(1))));
        resetTokens.save(new PasswordResetToken(uid, "r-live", now.plus(Duration.ofMinutes(30))));
        resetTokens.save(new PasswordResetToken(uid, "r-dead", now.minus(Duration.ofMinutes(1))));
        ExtractionJob oldDone = job(uid, ExtractionJob.DONE, now.minus(Duration.ofDays(91)));
        ExtractionJob oldFailed = job(uid, ExtractionJob.FAILED, now.minus(Duration.ofDays(400)));
        ExtractionJob oldRunning = job(uid, ExtractionJob.RUNNING, now.minus(Duration.ofDays(91)));
        ExtractionJob recentDone = job(uid, ExtractionJob.DONE, now.minus(Duration.ofDays(89)));

        int[] n = housekeeping.run(now);
        assertTrue(n[0] >= 1 && n[1] >= 1, "phải xoá ít nhất token hết hạn vừa tạo");
        assertEquals(2, n[2], "chỉ 2 job bóc tách thường đã kết thúc > 90 ngày (job lộ trình đếm ở n[5])");

        assertEquals(1, rows("refresh_tokens", "h-live"));
        assertEquals(0, rows("refresh_tokens", "h-dead"));
        assertEquals(1, rows("password_reset_tokens", "r-live"));
        assertEquals(0, rows("password_reset_tokens", "r-dead"));
        assertFalse(jobs.existsById(oldDone.getId()));
        assertFalse(jobs.existsById(oldFailed.getId()));
        assertTrue(jobs.existsById(oldRunning.getId()), "job đang chạy không bị xoá dù cũ");
        assertTrue(jobs.existsById(recentDone.getId()));
    }

    private ExtractionJob pathJob(Long uid, Instant createdAt) {
        ExtractionJob j = job(uid, ExtractionJob.DONE, createdAt);
        j.setPurpose(ExtractionJob.PURPOSE_LEARNING_PATH);
        j.setExtractedText("văn bản tài liệu");
        return jobs.save(j);
    }

    private void path(Long uid, ExtractionJob job, String status) {
        LearningPath p = new LearningPath();
        p.setId(java.util.UUID.randomUUID());
        p.setUserId(uid);
        p.setTitle("LP");
        p.setSourceType("text");
        p.setStatus(status);
        p.setJobId(job.getId());
        p.setTotalDays(7);
        p.setStartDate(java.time.LocalDate.now());
        p.setCreatedAt(Instant.now());
        paths.save(p);
    }

    private String text(ExtractionJob j) {
        return jobs.findById(j.getId()).orElseThrow().getExtractedText();
    }

    /** LP-1: job lộ trình > 90 ngày vẫn còn; chỉ lộ trình ACTIVE bị xoá trắng extracted_text, bản nháp giữ để còn kích hoạt. */
    @Test
    void keeps_learning_path_jobs_and_clears_text_only_when_path_is_active() {
        String email = newEmail();
        try { newUser(email); } catch (Exception e) { throw new RuntimeException(e); }
        Long uid = userId(email);
        Instant now = Instant.now();

        ExtractionJob activeOld = pathJob(uid, now.minus(Duration.ofDays(91)));
        ExtractionJob draftOld = pathJob(uid, now.minus(Duration.ofDays(91)));
        ExtractionJob activeRecent = pathJob(uid, now.minus(Duration.ofDays(89)));
        path(uid, activeOld, LearningPath.ACTIVE);
        path(uid, draftOld, LearningPath.DRAFT);
        path(uid, activeRecent, LearningPath.ACTIVE);
        // LP-10: lộ trình đã xoá để lại job CANCELLED (giữ lượt hạn mức); mồ côi > 90 ngày thì dọn như job thường, mới thì giữ
        ExtractionJob orphanOld = pathJob(uid, now.minus(Duration.ofDays(91)));
        orphanOld.setStatus(ExtractionJob.CANCELLED);
        jobs.save(orphanOld);
        ExtractionJob orphanRecent = pathJob(uid, now.minus(Duration.ofHours(12)));
        orphanRecent.setStatus(ExtractionJob.CANCELLED);
        jobs.save(orphanRecent);

        int[] n = housekeeping.run(now);
        assertEquals(6, n.length);
        assertTrue(n[4] >= 1, "ít nhất job của lộ trình ACTIVE cũ vừa tạo bị xoá trắng văn bản");
        assertTrue(n[5] >= 1, "job lộ trình mồ côi > 90 ngày bị xoá ở bước riêng (LP-10), không lẫn vào số job thường");

        assertTrue(jobs.existsById(activeOld.getId()) && jobs.existsById(draftOld.getId()) && jobs.existsById(activeRecent.getId()),
                "job của lộ trình còn lộ trình trỏ tới không bao giờ bị xoá");
        assertFalse(jobs.existsById(orphanOld.getId()), "job lộ trình mồ côi > 90 ngày bị xoá");
        assertTrue(jobs.existsById(orphanRecent.getId()), "job mồ côi mới giữ lại (lượt hạn mức 24 giờ)");
        assertNull(text(activeOld), "ACTIVE + > 90 ngày: xoá trắng extracted_text");
        assertEquals("văn bản tài liệu", text(draftOld), "DRAFT giữ văn bản để còn kích hoạt");
        assertEquals("văn bản tài liệu", text(activeRecent), "chưa đủ 90 ngày: giữ nguyên");
    }

    /**
     * Lối vào @Scheduled thật: nightly() gọi run() từ this (không qua proxy) nên chính nó phải mở transaction; thiếu nó mọi
     * @Modifying ném TransactionRequiredException và test chỉ gọi run() không bao giờ phát hiện (từng xảy ra ở 1.0).
     */
    @Test
    void nightly_entry_point_runs_inside_a_transaction() {
        String email = newEmail();
        try { newUser(email); } catch (Exception e) { throw new RuntimeException(e); }
        Long uid = userId(email);
        Instant now = Instant.now();

        refreshTokens.save(new RefreshToken(uid, "h-dead-nightly", now.minus(Duration.ofMinutes(1))));
        ExtractionJob oldDone = job(uid, ExtractionJob.DONE, now.minus(Duration.ofDays(91)));
        ExtractionJob activeOld = pathJob(uid, now.minus(Duration.ofDays(91)));
        path(uid, activeOld, LearningPath.ACTIVE);

        assertDoesNotThrow(() -> housekeeping.nightly());

        assertEquals(0, rows("refresh_tokens", "h-dead-nightly"));
        assertFalse(jobs.existsById(oldDone.getId()), "job bóc tách thường > 90 ngày bị xoá qua lối vào scheduler");
        assertTrue(jobs.existsById(activeOld.getId()), "job lộ trình vẫn còn");
        assertNull(text(activeOld), "LP-1 chạy được từ scheduler");
    }
}
