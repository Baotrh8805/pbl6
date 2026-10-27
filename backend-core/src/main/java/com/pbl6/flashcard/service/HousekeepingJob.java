package com.pbl6.flashcard.service;

import com.pbl6.flashcard.repository.EmailVerificationTokenRepository;
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
 * Dọn dẹp đêm (plan G2/B6): token hết hạn và job bóc tách đã kết thúc quá lâu (cột extracted_text nặng). Job của lộ
 * trình còn lộ trình không bị xoá (LP-1): chỉ xoá trắng extracted_text khi lộ trình đã ACTIVE, bản nháp giữ nguyên để còn kích
 * hoạt; job lộ trình mồ côi (lộ trình đã xoá, LP-10 giữ dòng CANCELLED để không hoàn lượt) bị xoá như job thường.
 * ponytail: mốc giữ là hằng số (90 ngày); đưa vào app_settings khi admin cần chỉnh. Một server -> không cần khoá phân tán.
 */
@Service
public class HousekeepingJob {
    private static final Logger log = LoggerFactory.getLogger(HousekeepingJob.class);
    static final Duration KEEP_FINISHED_JOBS = Duration.ofDays(90);
    /** Tài khoản chưa xác thực email quá hạn này bị xoá (link xác thực chỉ sống 24 giờ; người thật đăng ký lại được ngay). */
    static final Duration KEEP_UNVERIFIED = Duration.ofHours(48);

    private final RefreshTokenRepository refreshTokens;
    private final PasswordResetTokenRepository resetTokens;
    private final ExtractionJobRepository jobs;
    private final UserRepository users;
    private final NotificationService notifications;
    private final EmailVerificationTokenRepository verificationTokens;
    private final com.pbl6.flashcard.service.moderation.ModerationStore moderation;

    public HousekeepingJob(RefreshTokenRepository refreshTokens, PasswordResetTokenRepository resetTokens,
                           ExtractionJobRepository jobs, UserRepository users, NotificationService notifications,
                           EmailVerificationTokenRepository verificationTokens,
                           com.pbl6.flashcard.service.moderation.ModerationStore moderation) {
        this.moderation = moderation;
        this.verificationTokens = verificationTokens;
        this.refreshTokens = refreshTokens;
        this.resetTokens = resetTokens;
        this.jobs = jobs;
        this.users = users;
        this.notifications = notifications;
    }

    /**
     * 03:30 giờ Việt Nam mỗi ngày (ít người học). Phải tự mở transaction: scheduler gọi nightly() qua proxy, nhưng run() được gọi
     * từ this (không qua proxy) nên @Transactional của run() không có tác dụng — @Modifying đầu tiên ném
     * TransactionRequiredException và cả đêm dọn dẹp (kể cả LP-1) không chạy. run() tham gia transaction này (REQUIRED);
     * HousekeepingIT gọi thẳng nightly() để giữ lối vào thật được kiểm.
     */
    @Scheduled(cron = "0 30 3 * * *", zone = "Asia/Ho_Chi_Minh")
    @Transactional
    public void nightly() {
        run(Instant.now());
    }

    @Transactional
    public int[] run(Instant now) {
        int a = refreshTokens.deleteExpired(now);
        int b = resetTokens.deleteExpired(now);
        Instant cutoff = now.minus(KEEP_FINISHED_JOBS);
        int c = jobs.deleteFinishedBefore(cutoff);
        int e = jobs.clearTextOfOldPathJobs(cutoff); // LP-1: job lộ trình chỉ bị xoá trắng văn bản
        int f = jobs.deleteOrphanPathJobsBefore(cutoff); // LP-10: job của lộ trình đã xoá (giữ lại vì hạn mức) quá hạn
        int d = 0;
        for (User u : users.findByIsPremiumTrueAndPremiumUntilBefore(now)) { // Premium có hạn đã hết (G5)
            u.setIsPremium(false);
            u.setPremiumUntil(null);
            users.save(u);
            notifications.notify(u.getId(), Notification.PREMIUM_CHANGED, Map.of("premium", false, "expired", true));
            d++;
        }
        // Thêm ở cuối mảng: chỉ số cũ (HousekeepingIT, log) giữ nguyên nghĩa
        int g = verificationTokens.deleteExpired(now);
        int h = deleteStaleUnverified(now);
        // V38: bình luận AI chặn mà admin không xử lý quá 30 ngày (spec 2026-10-27 đêm §5): xoá bình luận từ điển, xoá trắng
        // bình luận đánh giá (giữ sao)
        int[] purged = moderation.purgeBlocked(now.minus(com.pbl6.flashcard.service.moderation.ModerationPolicy.BLOCKED_TTL));
        int i = purged[0] + purged[1];
        log.info("Housekeeping: xoá {} refresh token, {} reset token, {} job bóc tách cũ; {} Premium hết hạn; "
                + "xoá trắng văn bản {} job lộ trình cũ; xoá {} job lộ trình mồ côi; xoá {} token xác thực email; "
                + "xoá {} tài khoản chưa xác thực quá 48 giờ; xoá {} bình luận AI chặn quá 30 ngày",
                a, b, c, d, e, f, g, h, i);
        return new int[] {a, b, c, d, e, f, g, h, i};
    }

    /**
     * Rà soát 27/10: tài khoản đăng ký mà không bấm link xác thực trong 48 giờ không nên tồn tại (admin thấy "ma", email bị chiếm).
     * Xoá hẳn: tài khoản này chưa đăng nhập bao giờ nên không có dữ liệu học; token xác thực xoá theo (ON DELETE CASCADE, V24).
     * users.createdAt là LocalDateTime theo múi giờ JVM (V1) -> so bằng cùng múi giờ. Một dòng lỗi (vd. FK lạ) không chặn dòng khác.
     */
    int deleteStaleUnverified(Instant now) {
        java.time.LocalDateTime before = java.time.LocalDateTime.ofInstant(now.minus(KEEP_UNVERIFIED), java.time.ZoneId.systemDefault());
        int n = 0;
        for (User u : users.findStaleUnverified(before)) {
            try {
                verificationTokens.deleteByUserId(u.getId());
                users.delete(u);
                n++;
            } catch (RuntimeException ex) {
                log.warn("Housekeeping: không xoá được tài khoản chưa xác thực {}: {}", u.getId(), ex.getMessage());
            }
        }
        return n;
    }
}
