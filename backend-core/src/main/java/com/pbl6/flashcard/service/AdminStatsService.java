package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.admin.AdminStatsResponse;
import com.pbl6.flashcard.dto.admin.AdminStatsResponse.DayPoint;
import com.pbl6.flashcard.model.Deck;
import com.pbl6.flashcard.model.ExtractionJob;
import com.pbl6.flashcard.model.LearningPath;
import com.pbl6.flashcard.repository.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/** Dashboard admin (UC-38): mọi con số tính thẳng ở DB, không bảng tổng hợp. */
@Service
public class AdminStatsService {

    private final UserRepository users;
    private final DeckRepository decks;
    private final FlashcardRepository cards;
    private final ExtractionJobRepository jobs;
    private final QuizAttemptRepository quizzes;
    private final LearningPathRepository paths;
    private final ReportService reports;
    private final AiServiceClient ai;
    private final ZoneId zone;
    private final String version;
    private final String backupMarker;
    static final Duration BACKUP_STALE_AFTER = Duration.ofHours(48);

    public AdminStatsService(UserRepository users, DeckRepository decks, FlashcardRepository cards,
                             ExtractionJobRepository jobs, QuizAttemptRepository quizzes, LearningPathRepository paths,
                             ReportService reports, AiServiceClient ai,
                             @Value("${app.learning-path.zone:Asia/Ho_Chi_Minh}") String zone,
                             @Value("${app.version:dev}") String version,
                             @Value("${app.backup.marker:}") String backupMarker) {
        this.users = users;
        this.decks = decks;
        this.cards = cards;
        this.jobs = jobs;
        this.quizzes = quizzes;
        this.paths = paths;
        this.reports = reports;
        this.ai = ai;
        this.zone = ZoneId.of(zone);
        this.version = version;
        this.backupMarker = backupMarker;
    }

    @Transactional(readOnly = true)
    public AdminStatsResponse stats(int days) {
        Instant now = Instant.now();
        LocalDate today = LocalDate.now(zone);
        LocalDate from = today.minusDays(days - 1L);
        Instant since = from.atStartOfDay(zone).toInstant();
        String zoneId = zone.getId();

        long[] newUsers = fill(byDay(users.countByDay(LocalDateTime.ofInstant(since, ZoneId.systemDefault()))), from, days);
        long[] extractions = fill(byDay(jobs.countByDay(since, zoneId)), from, days);
        long[] quizzesByDay = fill(byDay(quizzes.countByDay(since, zoneId)), from, days);
        List<DayPoint> series = new ArrayList<>(days);
        for (int i = 0; i < days; i++) {
            series.add(new DayPoint(from.plusDays(i), newUsers[i], extractions[i], quizzesByDay[i]));
        }

        return new AdminStatsResponse(
                new AdminStatsResponse.Users(users.count(),
                        users.countByCreatedAtAfter(LocalDateTime.now().minusDays(7)),
                        users.countByCreatedAtAfter(LocalDateTime.now().minusDays(30)),
                        users.countByLockedAtIsNotNull(), users.countByIsPremiumTrue(),
                        users.countActiveSince(now.minus(Duration.ofDays(7))), users.countStaffPendingSetup()),
                new AdminStatsResponse.Decks(decks.count(), decks.countByVisibility(Deck.PUBLIC), decks.countByOfficialTrue()),
                cards.count(),
                new AdminStatsResponse.Extractions(jobs.count(), jobs.countByStatus(ExtractionJob.DONE),
                        jobs.countByStatus(ExtractionJob.FAILED),
                        jobs.countByStatusIn(List.of(ExtractionJob.QUEUED, ExtractionJob.RUNNING))),
                quizzes.count(), paths.count(), reports.countOpen(), series,
                new AdminStatsResponse.LearningPathBreakdown(paths.countByStatusAndCompletedAtIsNull(LearningPath.ACTIVE),
                        paths.countByCompletedAtIsNotNull(), paths.countByStatus(LearningPath.FAILED),
                        paths.countBySourceType(LearningPath.SOURCE_REMEDIAL), paths.countByStatus(LearningPath.DRAFT)));
    }

    public Map<String, String> health() {
        Map<String, String> m = new java.util.LinkedHashMap<>();
        m.put("db", "ok");
        m.put("aiService", ai.health() ? "ok" : "down");
        m.put("version", version);
        java.nio.file.Path marker = backupMarker.isBlank() ? null : java.nio.file.Path.of(backupMarker);
        m.put("backup", backupStatus(marker, Instant.now()));
        m.put("lastBackupAt", marker != null && java.nio.file.Files.exists(marker) ? lastModified(marker).toString() : null);
        return m;
    }

    /** unmonitored (không cấu hình) | missing (chưa có file) | stale (quá 48 giờ) | ok. Dựa vào mtime, không đọc nội dung. */
    static String backupStatus(java.nio.file.Path marker, Instant now) {
        if (marker == null) return "unmonitored";
        if (!java.nio.file.Files.exists(marker)) return "missing";
        return lastModified(marker).isBefore(now.minus(BACKUP_STALE_AFTER)) ? "stale" : "ok";
    }

    private static Instant lastModified(java.nio.file.Path p) {
        try {
            return java.nio.file.Files.getLastModifiedTime(p).toInstant();
        } catch (java.io.IOException e) {
            return Instant.EPOCH;
        }
    }

    private static Map<LocalDate, Long> byDay(List<DayCount> rows) {
        return rows.stream().collect(Collectors.toMap(r -> r.getDay().toLocalDate(), DayCount::getN, Long::sum));
    }

    /** Vị trí i = from + i ngày; ngày không có dữ liệu = 0; ngày ngoài cửa sổ bị bỏ. */
    static long[] fill(Map<LocalDate, Long> counts, LocalDate from, int days) {
        long[] out = new long[days];
        for (int i = 0; i < days; i++) out[i] = counts.getOrDefault(from.plusDays(i), 0L);
        return out;
    }
}
