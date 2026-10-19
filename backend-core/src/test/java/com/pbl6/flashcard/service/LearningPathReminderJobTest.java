package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.learningpath.TodaySummaryResponse;
import com.pbl6.flashcard.model.LearningPath;
import com.pbl6.flashcard.model.Notification;
import com.pbl6.flashcard.repository.LearningPathRepository;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
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
    private final LearningPathReminderJob job =
            new LearningPathReminderJob(paths, learningPaths, settings, notifications, txm, ZONE.getId());

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
}
