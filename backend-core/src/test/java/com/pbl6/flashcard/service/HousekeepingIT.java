package com.pbl6.flashcard.service;

import com.pbl6.flashcard.model.ExtractionJob;
import com.pbl6.flashcard.model.PasswordResetToken;
import com.pbl6.flashcard.model.RefreshToken;
import com.pbl6.flashcard.repository.ExtractionJobRepository;
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

/** G2/B6: job đêm xoá token hết hạn và job bóc tách đã kết thúc > 90 ngày; giữ mọi thứ còn hiệu lực / đang chạy. */
class HousekeepingIT extends IntegrationTest {

    @Autowired HousekeepingJob housekeeping;
    @Autowired RefreshTokenRepository refreshTokens;
    @Autowired PasswordResetTokenRepository resetTokens;
    @Autowired ExtractionJobRepository jobs;
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
        assertEquals(2, n[2], "chỉ 2 job đã kết thúc > 90 ngày");

        assertEquals(1, rows("refresh_tokens", "h-live"));
        assertEquals(0, rows("refresh_tokens", "h-dead"));
        assertEquals(1, rows("password_reset_tokens", "r-live"));
        assertEquals(0, rows("password_reset_tokens", "r-dead"));
        assertFalse(jobs.existsById(oldDone.getId()));
        assertFalse(jobs.existsById(oldFailed.getId()));
        assertTrue(jobs.existsById(oldRunning.getId()), "job đang chạy không bị xoá dù cũ");
        assertTrue(jobs.existsById(recentDone.getId()));
    }
}
