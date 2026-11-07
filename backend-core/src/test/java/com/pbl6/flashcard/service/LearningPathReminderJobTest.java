package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.learningpath.TodaySummaryResponse;
import com.pbl6.flashcard.model.LearningPath;
import com.pbl6.flashcard.model.Notification;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.repository.UserRepository;
import com.pbl6.flashcard.repository.LearningPathRepository;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * LearningPathReminderJob không cần DB: giờ nhắc kẹp về 0..23, cấu hình thiếu / hỏng thì về 7 giờ (không ném lỗi mỗi giờ); trước
 * giờ nhắc thì không chạm DB; mỗi người dùng một giao dịch nên lỗi của một người chỉ rollback phần của người đó.
 */
class LearningPathReminderJobTest {

    private static final ZoneId ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private final SettingsService settings = mock(SettingsService.class);
    private final LearningPathRepository paths = mock(LearningPathRepository.class);
    private final LearningPathService learningPaths = mock(LearningPathService.class);
    private final NotificationService notifications = mock(NotificationService.class);
    private final PlatformTransactionManager txm = mock(PlatformTransactionManager.class);
    private final UserRepository users = mock(UserRepository.class);
    private final MailService mail = mock(MailService.class);
    private final LearningPathReminderJob job =
            new LearningPathReminderJob(paths, learningPaths, settings, notifications, users, mail, txm, ZONE.getId());

    private static Instant at(LocalDate day, int h) {
        return day.atTime(h, 5).atZone(ZONE).toInstant();
    }

    @Test
    void reminder_hour_is_clamped_and_falls_back_to_seven() {
        when(settings.getInt(SettingsService.KEY_LP_REMINDER_HOUR)).thenReturn(9);
        assertEquals(9, job.reminderHour());
        when(settings.getInt(SettingsService.KEY_LP_REMINDER_HOUR)).thenReturn(30);
        assertEquals(23, job.reminderHour());
        when(settings.getInt(SettingsService.KEY_LP_REMINDER_HOUR)).thenReturn(-2);
        assertEquals(0, job.reminderHour());
        Mockito.reset(settings);
        when(settings.getInt(SettingsService.KEY_LP_REMINDER_HOUR)).thenThrow(new NumberFormatException("For input string: \"x\""));
        assertEquals(LearningPathReminderJob.DEFAULT_HOUR, job.reminderHour());
        Mockito.reset(settings);
        when(settings.getInt(SettingsService.KEY_LP_REMINDER_HOUR)).thenThrow(new IllegalStateException("Thiếu cấu hình"));
        assertEquals(7, job.reminderHour());
    }

    @Test
    void before_the_configured_hour_nothing_is_read_or_sent() {
        when(settings.getInt(SettingsService.KEY_LP_REMINDER_HOUR)).thenReturn(9);
        LocalDate day = LocalDate.of(2031, 3, 3);
        assertEquals(0, job.run(at(day, 8), day));
        Mockito.verifyNoInteractions(paths, learningPaths, notifications, txm);
    }

    private static LearningPath path(Long uid) {
        LearningPath p = new LearningPath();
        p.setId(UUID.randomUUID());
        p.setUserId(uid);
        p.setTitle("Lộ trình " + uid);
        return p;
    }

    @Test
    void one_failing_user_does_not_cancel_the_other_users_reminders() {
        when(settings.getInt(SettingsService.KEY_LP_REMINDER_HOUR)).thenReturn(7);
        LocalDate day = LocalDate.of(2031, 3, 3);
        LearningPath broken = path(1L);
        LearningPath fine = path(2L);
        when(paths.findReminderCandidates(eq(day), any())).thenReturn(List.of(broken, fine));
        when(paths.claimReminder(any(), eq(day))).thenReturn(1);
        when(learningPaths.todaySummary(1L, day)).thenThrow(new IllegalStateException("dữ liệu lộ trình hỏng"));
        when(learningPaths.todaySummary(2L, day)).thenReturn(List.of(
                new TodaySummaryResponse(fine.getId(), "Tên mới", 1, 5, "during", 3, 0, 0, "1111111", 50, null, false)));
        when(txm.getTransaction(any())).thenReturn(mock(TransactionStatus.class));

        assertEquals(1, job.run(at(day, 7), day));
        verify(notifications, never()).notify(eq(1L), any(), anyMap());
        verify(notifications).notify(eq(2L), eq(Notification.LEARNING_PATH_REMINDER), anyMap());
        verify(txm, times(1)).rollback(any()); // chỉ giao dịch của người dùng 1
        verify(txm, times(1)).commit(any());
    }

    // ---------- B4: nhắc qua email ----------

    private static User user(Long id, String email) {
        User u = new User();
        u.setId(id);
        u.setEmail(email);
        u.setFullName("Lan");
        u.setEmailVerifiedAt(Instant.now());
        return u;
    }

    /** Người 2 có một lộ trình bật email; trả id lộ trình. */
    private UUID emailScenario(LocalDate day, User owner) {
        when(settings.getInt(SettingsService.KEY_LP_REMINDER_HOUR)).thenReturn(7);
        LearningPath p = path(2L);
        when(paths.findReminderCandidates(eq(day), any())).thenReturn(List.of(p));
        when(paths.claimReminder(any(), eq(day))).thenReturn(1);
        when(learningPaths.todaySummary(2L, day)).thenReturn(List.of(
                new TodaySummaryResponse(p.getId(), "N5 Bài 1", 2, 5, "during", 3, 4, 1, "1111111", 50, null, false)));
        when(paths.findRemindEmailIds(any())).thenReturn(List.of(p.getId()));
        when(users.findById(2L)).thenReturn(Optional.of(owner));
        when(mail.frontendLink(anyString())).thenAnswer(i -> "https://app.test" + i.getArgument(0));
        when(txm.getTransaction(any())).thenReturn(mock(TransactionStatus.class));
        return p.getId();
    }

    @Test
    void email_goes_out_after_commit_with_today_counts_and_link() {
        LocalDate day = LocalDate.of(2031, 3, 4);
        UUID id = emailScenario(day, user(2L, "lan@example.test"));
        when(mail.isConfigured()).thenReturn(true);
        when(mail.sendNotice(anyString(), anyString(), anyString(), anyString())).thenReturn(true);

        assertEquals(1, job.run(at(day, 7), day));
        var order = Mockito.inOrder(txm, mail);
        order.verify(txm).commit(any());
        order.verify(mail).sendNotice(eq("lan@example.test"), eq("nhắc học"), eq("Hôm nay học 8 thẻ – N5 Bài 1"),
                Mockito.argThat(b -> b.contains("3 thẻ mới, 4 thẻ đến hạn ôn, 1 thẻ còn nợ")
                        && b.contains("https://app.test/roadmap/" + id) && b.contains("(ngày 2/5)")));
    }

    @Test
    void missing_smtp_or_locked_unverified_accounts_get_no_email_but_keep_the_in_app_reminder() {
        LocalDate day = LocalDate.of(2031, 3, 5);
        emailScenario(day, user(2L, "lan@example.test"));
        when(mail.isConfigured()).thenReturn(false);
        assertEquals(1, job.run(at(day, 7), day));
        verify(mail, never()).sendNotice(anyString(), anyString(), anyString(), anyString());
        verify(notifications).notify(eq(2L), eq(Notification.LEARNING_PATH_REMINDER), anyMap());

        for (User bad : List.of(lockedUser(), unverifiedUser())) {
            Mockito.reset(mail);
            when(mail.isConfigured()).thenReturn(true);
            emailScenario(day, bad);
            job.run(at(day, 7), day);
            verify(mail, never()).sendNotice(anyString(), anyString(), anyString(), anyString());
        }
    }

    private static User lockedUser() {
        User u = user(2L, "khoa@example.test");
        u.setLockedAt(Instant.now());
        return u;
    }

    private static User unverifiedUser() {
        User u = user(2L, "chua@example.test");
        u.setEmailVerifiedAt(null);
        return u;
    }

    @Test
    void path_without_remind_email_sends_nothing() {
        LocalDate day = LocalDate.of(2031, 3, 6);
        emailScenario(day, user(2L, "lan@example.test"));
        when(paths.findRemindEmailIds(any())).thenReturn(List.of());
        when(mail.isConfigured()).thenReturn(true);
        assertEquals(1, job.run(at(day, 7), day));
        verify(mail, never()).sendNotice(anyString(), anyString(), anyString(), anyString());
        verify(users, never()).findById(any());
    }

    @Test
    void compose_lists_each_path_and_skips_zero_counts() {
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        var one = LearningPathReminderJob.compose("x@test", " ", List.of(
                new LearningPathReminderJob.EmailItem(a, "Bài 1", 1, 3, 5, 0, 0)), id -> "L/" + id);
        assertEquals("Hôm nay học 5 thẻ – Bài 1", one.subject());
        assertTrue(one.body().startsWith("Chào bạn,"), one.body());
        assertTrue(one.body().contains("  5 thẻ mới\n"), one.body());
        assertFalse(one.body().contains("đến hạn"), one.body());

        var two = LearningPathReminderJob.compose("x@test", "Minh", List.of(
                new LearningPathReminderJob.EmailItem(a, "Bài 1", 1, 3, 5, 0, 0),
                new LearningPathReminderJob.EmailItem(b, "Bài 2", 4, 9, 0, 2, 3)), id -> "L/" + id);
        assertEquals("Hôm nay học 10 thẻ trong 2 lộ trình", two.subject());
        assertTrue(two.body().contains("L/" + a) && two.body().contains("L/" + b), two.body());
        assertTrue(two.body().contains("2 thẻ đến hạn ôn, 3 thẻ còn nợ"), two.body());
        assertTrue(two.body().contains("Nhắc qua email"), "chỉ cách tắt");
    }
}
