package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.deck.ActivityResponse;
import com.pbl6.flashcard.repository.ReviewRepository;
import com.pbl6.flashcard.repository.ReviewRepository.ActiveDay;
import com.pbl6.flashcard.repository.ReviewRepository.ActivityDay;
import com.pbl6.flashcard.repository.ReviewRepository.ActivityTotals;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.sql.SQLException;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Dashboard cá nhân (hợp đồng đợt 2 §7, A5): heatmap lượt ôn / quiz theo ngày, chuỗi ngày học, các con số tổng. "Ngày" là ngày
 * theo múi giờ của người dùng (?tz=, mặc định múi giờ ứng dụng) — 23:30 ở Hà Nội và 00:30 hôm sau là hai ngày khác nhau dù cùng
 * một ngày UTC. Mọi đếm gộp sẵn ở DB (3 câu SQL), Java chỉ lấp ngày trống và tính chuỗi ({@link ActivityStreaks}).
 */
@Service
public class ReviewActivityService {

    public static final int DEFAULT_DAYS = 400;
    public static final int MAX_DAYS = 730;
    /** SQLSTATE invalid_parameter_value: Postgres không biết tên múi giờ (Java và Postgres có thể lệch phiên bản tzdata). */
    private static final String PG_INVALID_PARAMETER = "22023";

    private final ReviewRepository reviews;
    private final ZoneId defaultZone;

    public ReviewActivityService(ReviewRepository reviews,
                                 @Value("${app.learning-path.zone:Asia/Ho_Chi_Minh}") String zone) {
        this.reviews = reviews;
        this.defaultZone = ZoneId.of(zone);
    }

    /** tz rỗng = múi giờ ứng dụng; tên không hợp lệ (ZoneId.of ném) → 400 thay vì để Postgres báo lỗi 500. */
    public ZoneId zone(String tz) {
        if (tz == null || tz.isBlank()) return defaultZone;
        try {
            return ZoneId.of(tz.trim());
        } catch (DateTimeException e) {
            throw invalidZone(tz);
        }
    }

    @Transactional(readOnly = true)
    public ActivityResponse activity(Long uid, int days, ZoneId zone) {
        return activity(uid, days, zone, Instant.now());
    }

    ActivityResponse activity(Long uid, int days, ZoneId zone, Instant now) {
        int window = Math.max(1, Math.min(MAX_DAYS, days));
        LocalDate today = LocalDate.ofInstant(now, zone);
        LocalDate from = today.minusDays(window - 1L);
        String sqlZone = sqlZone(zone);

        Map<LocalDate, ActivityDay> byDay = new HashMap<>();
        List<ActiveDay> active;
        try {
            for (ActivityDay d : reviews.activityByDay(uid, from.atStartOfDay(zone).toInstant(), sqlZone)) {
                byDay.put(d.getDay().toLocalDate(), d);
            }
            active = reviews.activeDays(uid, sqlZone);
        } catch (DataAccessException e) {
            if (e.getMostSpecificCause() instanceof SQLException sql && PG_INVALID_PARAMETER.equals(sql.getSQLState())) {
                throw invalidZone(zone.getId());
            }
            throw e;
        }

        List<ActivityResponse.Day> series = new ArrayList<>(window);
        for (LocalDate d = from; !d.isAfter(today); d = d.plusDays(1)) {
            ActivityDay row = byDay.get(d);
            series.add(new ActivityResponse.Day(d, row == null ? 0 : row.getReviews(), row == null ? 0 : row.getQuizzes()));
        }
        List<LocalDate> activeDays = new ArrayList<>(active.size());
        for (ActiveDay a : active) activeDays.add(a.getDay().toLocalDate());
        ActivityStreaks.Streaks streaks = ActivityStreaks.compute(activeDays, today);

        // "Đến hạn hôm nay" = due_at trước 00:00 ngày mai theo tz, cùng quy ước với lộ trình (LearningPathService#endOf)
        Instant until = today.plusDays(1).atStartOfDay(zone).toInstant();
        ActivityTotals totals = reviews.activityTotals(uid, until, LearningPathService.MASTERED_DAYS);
        return new ActivityResponse(series, totals.getDueToday(), totals.getNewCards(), totals.getLearnedTotal(),
                totals.getMasteredTotal(), streaks.current(), streaks.max());
    }

    /**
     * Tên múi giờ cho AT TIME ZONE của Postgres. Tên vùng (Asia/Ho_Chi_Minh, America/New_York...) dùng nguyên — Postgres tự lo giờ
     * mùa hè. Offset cố định (+07:00, UTC+7, GMT-05:30) thì PHẢI đảo dấu: chuỗi dạng "+07:00" Postgres đọc theo quy ước POSIX
     * (dương = phía TÂY Greenwich), tức UTC-7 — để nguyên sẽ dồn mọi lượt ôn sang sai ngày mà không báo lỗi.
     */
    static String sqlZone(ZoneId zone) {
        ZoneId normalized = zone.normalized();
        if (!(normalized instanceof ZoneOffset offset)) return normalized.getId();
        if (offset.getTotalSeconds() == 0) return "UTC";
        String id = offset.getId(); // "+07:00", "-05:30", "+05:45:30"
        return (id.charAt(0) == '+' ? "-" : "+") + id.substring(1);
    }

    private static ResponseStatusException invalidZone(String tz) {
        String shown = tz.length() > 64 ? tz.substring(0, 64) + "…" : tz; // không vọng lại nguyên chuỗi dài tuỳ ý
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Múi giờ không hợp lệ: " + shown + ".");
    }
}
