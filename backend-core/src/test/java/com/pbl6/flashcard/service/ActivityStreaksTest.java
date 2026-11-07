package com.pbl6.flashcard.service;

import com.pbl6.flashcard.service.ActivityStreaks.Streaks;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** Chuỗi ngày học của dashboard (A5): hàm thuần trên tập ngày, không cần DB. Kèm quy ước tên múi giờ gửi Postgres. */
class ActivityStreaksTest {

    private static final LocalDate TODAY = LocalDate.parse("2026-10-19");

    private static List<LocalDate> daysAgo(int... offsets) {
        List<LocalDate> out = new ArrayList<>();
        for (int o : offsets) out.add(TODAY.minusDays(o));
        return out;
    }

    @Test
    void no_activity_means_no_streak() {
        assertEquals(new Streaks(0, 0), ActivityStreaks.compute(List.of(), TODAY));
        assertEquals(new Streaks(0, 0), ActivityStreaks.compute(null, TODAY));
    }

    @Test
    void current_streak_ends_today_when_studied_today() {
        assertEquals(new Streaks(3, 3), ActivityStreaks.compute(daysAgo(0, 1, 2), TODAY));
        assertEquals(new Streaks(1, 1), ActivityStreaks.compute(daysAgo(0), TODAY));
    }

    @Test
    void not_studied_yet_today_keeps_the_streak_up_to_yesterday() {
        assertEquals(new Streaks(2, 2), ActivityStreaks.compute(daysAgo(1, 2), TODAY),
                "buổi sáng chưa học: chuỗi chưa về 0");
        assertEquals(new Streaks(0, 2), ActivityStreaks.compute(daysAgo(2, 3), TODAY),
                "bỏ trọn hôm qua: chuỗi hiện tại đứt, chuỗi dài nhất còn");
    }

    @Test
    void max_streak_is_the_longest_run_anywhere_in_history() {
        // Chuỗi 5 ngày cách đây hơn một năm, chuỗi 2 ngày tới hôm nay, chuỗi 1 ngày lẻ ở giữa
        Streaks s = ActivityStreaks.compute(daysAgo(0, 1, 50, 400, 401, 402, 403, 404), TODAY);
        assertEquals(2, s.current());
        assertEquals(5, s.max());
    }

    @Test
    void duplicates_and_order_do_not_matter() {
        List<LocalDate> days = new ArrayList<>(daysAgo(2, 0, 1, 1, 0, 2));
        days.add(null); // dòng lỗi không làm hỏng phép tính
        assertEquals(new Streaks(3, 3), ActivityStreaks.compute(days, TODAY));
    }

    @Test
    void runs_cross_month_year_and_leap_day_boundaries() {
        LocalDate leapToday = LocalDate.parse("2028-03-01");
        List<LocalDate> days = Arrays.asList(LocalDate.parse("2028-02-28"), LocalDate.parse("2028-02-29"), leapToday);
        assertEquals(new Streaks(3, 3), ActivityStreaks.compute(days, leapToday));

        LocalDate newYear = LocalDate.parse("2027-01-01");
        assertEquals(new Streaks(2, 2), ActivityStreaks.compute(List.of(LocalDate.parse("2026-12-31"), newYear), newYear));
    }

    @Test
    void future_days_do_not_extend_the_current_streak_but_count_for_max() {
        // Hôm nay chưa học, ngày mai đã có (lệch đồng hồ / tz khác lúc ghi): chuỗi hiện tại vẫn là chuỗi tới hôm qua
        Streaks s = ActivityStreaks.compute(List.of(TODAY.minusDays(1), TODAY.plusDays(1), TODAY.plusDays(2)), TODAY);
        assertEquals(1, s.current());
        assertEquals(2, s.max());
    }

    @Test
    void fixed_offsets_are_inverted_for_postgres_posix_time_zones() {
        // Tên vùng giữ nguyên: Postgres tự áp giờ mùa hè
        assertEquals("Asia/Ho_Chi_Minh", ReviewActivityService.sqlZone(ZoneId.of("Asia/Ho_Chi_Minh")));
        assertEquals("America/New_York", ReviewActivityService.sqlZone(ZoneId.of("America/New_York")));
        // Offset cố định: Postgres đọc "+07:00" là UTC-7 (POSIX) nên phải gửi "-07:00"
        assertEquals("-07:00", ReviewActivityService.sqlZone(ZoneId.of("+07:00")));
        assertEquals("-07:00", ReviewActivityService.sqlZone(ZoneId.of("UTC+7")));
        assertEquals("+05:30", ReviewActivityService.sqlZone(ZoneId.of("GMT-05:30")));
        assertEquals("UTC", ReviewActivityService.sqlZone(ZoneId.of("Z")));
        assertEquals("UTC", ReviewActivityService.sqlZone(ZoneId.of("UTC")));
        assertEquals("UTC", ReviewActivityService.sqlZone(ZoneId.of("Etc/UTC")));
    }
}
