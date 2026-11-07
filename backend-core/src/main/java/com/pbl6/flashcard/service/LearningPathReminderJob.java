package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.learningpath.TodaySummaryResponse;
import com.pbl6.flashcard.model.LearningPath;
import com.pbl6.flashcard.model.Notification;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.repository.UserRepository;
import com.pbl6.flashcard.repository.LearningPathRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;

/**
 * Nhắc học mỗi sáng (spec §4.4): thông báo trong app LEARNING_PATH_REMINDER cho mỗi lộ trình đang học có bật nhắc và có việc hôm
 * nay (thẻ mới / đến hạn / nợ), tối đa một lần mỗi ngày. Chạy mỗi giờ (phút 05) và bắt đầu gửi từ giờ cấu hình
 * learning_path_reminder_hour theo múi giờ app.learning-path.zone — đổi giờ ở Admin Panel có hiệu lực ngay, không cần lập lịch
 * lại. Các giờ sau trong ngày chạy bù cho lộ trình chưa được xét (lượt đúng giờ bị lỗi, server khởi động lại đúng lúc 07:05).
 * <p>Mỗi người dùng một giao dịch ngắn riêng: lỗi của một người chỉ rollback phần của người đó (giờ sau chạy bù), không kéo theo
 * thông báo của mọi người khác, và không giữ khoá dòng lộ trình suốt cả lượt chạy. Lộ trình được "giành" bằng UPDATE có điều kiện
 * chỉ ghi last_reminded_on ({@link LearningPathRepository#claimReminder}) thay vì sửa entity đã nạp từ đầu lượt — bản nạp đó có
 * thể đã cũ (PATCH / complete / xoá chạy xen giữa) và ghi lại cả dòng từ nó sẽ đè thay đổi của người dùng. Ngày đã xét được ghi
 * kể cả khi không có gì để nhắc, nên một lộ trình không bao giờ nhận hai nhắc trong một ngày dù job chạy lại hay hai lượt / hai
 * instance chạy chồng nhau.
 * <p>Email (B4, V34): lộ trình bật thêm remind_email thì người dùng nhận thêm MỘT email mỗi lượt, gộp mọi lộ trình được nhắc qua
 * email hôm nay — tối đa một email / lộ trình / ngày nhờ cùng last_reminded_on. Email soạn trong giao dịch của người đó nhưng gửi
 * SAU khi giao dịch commit (lỗi giao dịch thì không gửi; gửi lỗi không làm mất thông báo trong app). Bỏ qua tài khoản bị khoá / đã
 * xoá / chưa xác thực email. Thiếu SMTP: chỉ ghi một dòng log mỗi lượt.
 */
@Service
public class LearningPathReminderJob {

    private static final Logger log = LoggerFactory.getLogger(LearningPathReminderJob.class);
    /** Giờ nhắc mặc định (cùng giá trị seed ở V20) khi cấu hình không đọc được. */
    static final int DEFAULT_HOUR = 7;

    private final LearningPathRepository paths;
    private final LearningPathService learningPaths;
    private final SettingsService settings;
    private final NotificationService notifications;
    private final UserRepository users;
    private final MailService mail;
    private final TransactionTemplate tx;
    private final ZoneId zone;

    public LearningPathReminderJob(LearningPathRepository paths, LearningPathService learningPaths, SettingsService settings,
                                   NotificationService notifications, UserRepository users, MailService mail,
                                   PlatformTransactionManager txm,
                                   @Value("${app.learning-path.zone:Asia/Ho_Chi_Minh}") String zone) {
        this.paths = paths;
        this.learningPaths = learningPaths;
        this.settings = settings;
        this.notifications = notifications;
        this.users = users;
        this.mail = mail;
        this.tx = new TransactionTemplate(txm);
        this.zone = ZoneId.of(zone);
    }

    /**
     * Phút 05 mỗi giờ. Không mở transaction bao cả lượt: {@link #run} tự chia mỗi người dùng một giao dịch. Cron đọc từ
     * app.learning-path.reminder-cron để test tắt được ("-"): context test bật @EnableScheduling, và cron thật chạy giữa một IT
     * sẽ đánh dấu / nhắc lộ trình của test. LearningPathReminderJobIT gọi thẳng run(now, today) với mốc giờ cố định.
     */
    @Scheduled(cron = "${app.learning-path.reminder-cron:0 5 * * * *}", zone = "${app.learning-path.zone:Asia/Ho_Chi_Minh}")
    public void hourly() {
        Instant now = Instant.now();
        try {
            run(now, LocalDate.ofInstant(now, zone));
        } catch (RuntimeException e) {
            log.error("Job nhắc học lỗi", e); // vd. không đọc được danh sách ứng viên: giờ sau chạy bù
        }
    }

    /**
     * Gửi nhắc nếu giờ của now (theo múi giờ cấu hình) đã tới giờ cấu hình (kẹp 0..23); trả số thông báo đã gửi. Ứng viên: lộ
     * trình ACTIVE chưa chốt hoàn thành, bật nhắc, chưa xét hôm nay, kích hoạt trước giờ nhắc hôm nay. "Hôm nay" của từng lộ trình
     * lấy từ {@link LearningPathService#todaySummary} (một lượt batch cho mỗi người dùng, cùng cách tính với widget Tổng quan);
     * chỉ nhắc khi có việc (mới + đến hạn + nợ &gt; 0) và lộ trình đang trong kỳ học hoặc đã qua ngày cuối mà còn việc (state
     * during / after). Trước ngày bắt đầu và ngày nghỉ theo lịch (study_days) thì im lặng, kể cả khi có thẻ đến hạn: người học đã
     * chọn nghỉ hôm đó; thẻ đến hạn vẫn hiện ở "Học gì tiếp" / phiên hôm nay khi họ tự mở app. Mọi lộ trình giành được đều ghi
     * last_reminded_on = today, nhắc hay không.
     */
    public int run(Instant now, LocalDate today) {
        int hour = reminderHour();
        if (ZonedDateTime.ofInstant(now, zone).getHour() < hour) return 0;
        Instant activatedBefore = today.atTime(hour, 0).atZone(zone).toInstant();
        Map<Long, List<UUID>> byUser = new LinkedHashMap<>();
        for (LearningPath p : paths.findReminderCandidates(today, activatedBefore)) {
            byUser.computeIfAbsent(p.getUserId(), k -> new ArrayList<>()).add(p.getId());
        }
        int sent = 0;
        int failed = 0;
        List<Email> emails = new ArrayList<>();
        for (Map.Entry<Long, List<UUID>> e : byUser.entrySet()) {
            try {
                UserResult r = tx.execute(s -> remindUser(e.getKey(), e.getValue(), today));
                if (r == null) continue;
                sent += r.sent();
                if (r.email() != null) emails.add(r.email());
            } catch (RuntimeException ex) {
                failed++;
                log.error("Nhắc học lỗi với người dùng {} (giờ sau chạy bù)", e.getKey(), ex);
            }
        }
        int mailed = sendEmails(emails);
        if (sent > 0 || failed > 0) {
            log.info("Nhắc học: gửi {} thông báo cho {} người dùng, {} người lỗi, email {} / {}", sent, byUser.size(), failed,
                    mailed, emails.size());
        }
        return sent;
    }

    /** Kết quả một người dùng: số thông báo trong app + email cần gửi sau commit (null = không gửi). */
    record UserResult(int sent, Email email) {}

    /** Một email nhắc học đã soạn sẵn (nội dung dựng trong giao dịch, gửi sau commit). */
    record Email(String to, String subject, String body) {}

    /** Một lộ trình trong email nhắc. */
    record EmailItem(UUID pathId, String title, int dayIndex, int totalDays, int newCount, int dueCount, int behindCount) {}

    /** Một người dùng, trong giao dịch riêng của {@link #run}: giành từng lộ trình rồi nhắc lộ trình có việc. */
    private UserResult remindUser(Long uid, List<UUID> pathIds, LocalDate today) {
        List<UUID> claimed = new ArrayList<>(pathIds.size());
        for (UUID id : pathIds) if (paths.claimReminder(id, today) == 1) claimed.add(id);
        if (claimed.isEmpty()) return new UserResult(0, null);
        Map<UUID, TodaySummaryResponse> summary = new HashMap<>();
        for (TodaySummaryResponse t : learningPaths.todaySummary(uid, today)) summary.put(t.pathId(), t);
        int sent = 0;
        List<TodaySummaryResponse> reminded = new ArrayList<>();
        for (UUID id : claimed) {
            TodaySummaryResponse t = summary.get(id);
            if (t == null) continue;
            int work = t.newCount() + t.dueCount() + t.behindCount();
            boolean inSession = "during".equals(t.state()) || "after".equals(t.state());
            if (work <= 0 || !inSession) continue;
            Map<String, Object> payload = new HashMap<>();
            payload.put("pathId", id.toString());
            payload.put("title", t.title());
            payload.put("dayIndex", t.dayIndex());
            payload.put("totalDays", t.totalDays());
            payload.put("newCount", t.newCount());
            payload.put("dueCount", t.dueCount());
            payload.put("behindCount", t.behindCount());
            notifications.notify(uid, Notification.LEARNING_PATH_REMINDER, payload);
            reminded.add(t);
            sent++;
        }
        return new UserResult(sent, email(uid, reminded));
    }

    /** Email gộp các lộ trình vừa nhắc mà bật remind_email (đọc lại cột lúc này); null khi không có hoặc tài khoản không nhận được. */
    private Email email(Long uid, List<TodaySummaryResponse> reminded) {
        if (reminded.isEmpty()) return null;
        Set<UUID> wanted = new HashSet<>(paths.findRemindEmailIds(reminded.stream().map(TodaySummaryResponse::pathId).toList()));
        if (wanted.isEmpty()) return null;
        User u = users.findById(uid).orElse(null);
        if (u == null || u.getLockedAt() != null || u.getEmailVerifiedAt() == null || AccountDeletionService.isDeleted(u)
                || u.getEmail() == null || u.getEmail().isBlank()) {
            return null;
        }
        List<EmailItem> items = reminded.stream().filter(t -> wanted.contains(t.pathId()))
                .map(t -> new EmailItem(t.pathId(), t.title(), t.dayIndex(), t.totalDays(), t.newCount(), t.dueCount(),
                        t.behindCount()))
                .toList();
        return compose(u.getEmail(), u.getFullName(), items, id -> mail.frontendLink("/roadmap/" + id));
    }

    /** Ngoài giao dịch: thiếu SMTP thì một dòng log cho cả lượt, không log từng người. Trả số email đã giao cho SMTP. */
    private int sendEmails(List<Email> emails) {
        if (emails.isEmpty()) return 0;
        if (!mail.isConfigured()) {
            log.info("Chưa cấu hình SMTP (spring.mail.host): bỏ qua {} email nhắc học", emails.size());
            return 0;
        }
        int ok = 0;
        for (Email e : emails) {
            if (mail.sendNotice(e.to(), "nhắc học", e.subject(), e.body())) ok++;
        }
        return ok;
    }

    /**
     * Soạn email nhắc (hàm thuần, test được): tiêu đề nêu tổng số thẻ hôm nay; thân liệt kê từng lộ trình (ngày học, thẻ mới / đến
     * hạn / nợ) kèm link, và chỉ chỗ tắt (Cài đặt lộ trình). link: pathId -> URL trang lộ trình.
     */
    static Email compose(String to, String fullName, List<EmailItem> items, Function<UUID, String> link) {
        int total = 0;
        for (EmailItem i : items) total += i.newCount() + i.dueCount() + i.behindCount();
        String subject = items.size() == 1
                ? "Hôm nay học " + total + " thẻ – " + items.get(0).title()
                : "Hôm nay học " + total + " thẻ trong " + items.size() + " lộ trình";
        String name = fullName == null || fullName.isBlank() ? "bạn" : fullName.trim();
        StringBuilder b = new StringBuilder();
        b.append("Chào ").append(name).append(",\n\n");
        b.append(items.size() == 1 ? "Lộ trình của bạn có việc hôm nay:\n\n" : "Các lộ trình của bạn có việc hôm nay:\n\n");
        for (EmailItem i : items) {
            b.append("• ").append(i.title()).append(" (ngày ").append(i.dayIndex()).append("/").append(i.totalDays()).append(")\n");
            List<String> parts = new ArrayList<>();
            if (i.newCount() > 0) parts.add(i.newCount() + " thẻ mới");
            if (i.dueCount() > 0) parts.add(i.dueCount() + " thẻ đến hạn ôn");
            if (i.behindCount() > 0) parts.add(i.behindCount() + " thẻ còn nợ");
            b.append("  ").append(String.join(", ", parts)).append("\n");
            b.append("  Học ngay: ").append(link.apply(i.pathId())).append("\n\n");
        }
        b.append("Không muốn nhận email này? Mở lộ trình, vào Cài đặt và tắt \"Nhắc qua email\". Thông báo trong ứng dụng vẫn giữ.\n");
        return new Email(to, subject, b.toString());
    }

    /**
     * Giờ nhắc (0..23) từ learning_path_reminder_hour; dòng cấu hình thiếu / hỏng (sửa tay ở DB) thì về mặc định 7 giờ thay vì
     * làm job ném lỗi mỗi giờ và không ai được nhắc.
     */
    int reminderHour() {
        try {
            return Math.max(0, Math.min(23, settings.getInt(SettingsService.KEY_LP_REMINDER_HOUR)));
        } catch (RuntimeException e) {
            log.warn("Cấu hình {} không đọc được, dùng {} giờ", SettingsService.KEY_LP_REMINDER_HOUR, DEFAULT_HOUR);
            return DEFAULT_HOUR;
        }
    }
}
