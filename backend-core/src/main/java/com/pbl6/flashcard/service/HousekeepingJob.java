package com.pbl6.flashcard.service;

import com.pbl6.flashcard.repository.ExtractionJobRepository;
import com.pbl6.flashcard.repository.PasswordResetTokenRepository;
import com.pbl6.flashcard.repository.RefreshTokenRepository;
import com.pbl6.flashcard.repository.UserRepository;
import com.pbl6.flashcard.model.Notification;
import com.pbl6.flashcard.model.User;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;

/**
 * Dọn dẹp đêm (plan G2/B6): token hết hạn và job bóc tách đã kết thúc quá lâu (cột extracted_text nặng).
 * ponytail: mốc giữ là hằng số (90 ngày); đưa vào app_settings khi admin cần chỉnh. Một server -> không cần khoá phân tán.
 */
@Service
public class HousekeepingJob {
    private static final Logger log = LoggerFactory.getLogger(HousekeepingJob.class);
    static final Duration KEEP_FINISHED_JOBS = Duration.ofDays(90);

    private final RefreshTokenRepository refreshTokens;
    private final PasswordResetTokenRepository resetTokens;
    private final ExtractionJobRepository jobs;
    private final UserRepository users;
    private final NotificationService notifications;

    public HousekeepingJob(RefreshTokenRepository refreshTokens, PasswordResetTokenRepository resetTokens,
                           ExtractionJobRepository jobs, UserRepository users, NotificationService notifications) {
        this.refreshTokens = refreshTokens;
        this.resetTokens = resetTokens;
        this.jobs = jobs;
        this.users = users;
        this.notifications = notifications;
    }

    /** 03:30 giờ Việt Nam mỗi ngày (ít người học). */
    @Scheduled(cron = "0 30 3 * * *", zone = "Asia/Ho_Chi_Minh")
    public void nightly() {
        run(Instant.now());
    }

    @Transactional
    public int[] run(Instant now) {
        int a = refreshTokens.deleteExpired(now);
        int b = resetTokens.deleteExpired(now);
        int c = jobs.deleteFinishedBefore(now.minus(KEEP_FINISHED_JOBS));
        int d = 0;
        for (User u : users.findByIsPremiumTrueAndPremiumUntilBefore(now)) { // Premium có hạn đã hết (G5)
            u.setIsPremium(false);
            u.setPremiumUntil(null);
            users.save(u);
            notifications.notify(u.getId(), Notification.PREMIUM_CHANGED, Map.of("premium", false, "expired", true));
            d++;
        }
        log.info("Housekeeping: xoá {} refresh token, {} reset token, {} job bóc tách cũ; {} Premium hết hạn", a, b, c, d);
        return new int[] {a, b, c, d};
    }
}
