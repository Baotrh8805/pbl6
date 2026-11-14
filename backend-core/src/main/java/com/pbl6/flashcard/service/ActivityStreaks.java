package com.pbl6.flashcard.service;

import java.time.LocalDate;
import java.util.Collection;
import java.util.TreeSet;

/**
 * Chuỗi ngày học liên tiếp cho dashboard cá nhân (hợp đồng đợt 2 §7, A5). Hàm thuần trên tập ngày đã học (ngày theo múi giờ của
 * người dùng, hợp của ngày có lượt ôn và ngày có bài quiz) để test được không cần DB.
 * <p>
 * Chuỗi hiện tại: hôm nay chưa học thì vẫn tính tới hôm qua — người học mở app buổi sáng không thấy chuỗi về 0 trước khi kịp
 * học; đứt từ hôm kia trở về trước thì là 0. Ngày "tương lai" (đồng hồ máy chủ lệch, tz khác lúc ghi) không nối chuỗi hiện tại
 * nhưng vẫn được xét cho chuỗi dài nhất.
 */
public final class ActivityStreaks {

    private ActivityStreaks() {}

    public record Streaks(int current, int max) {}

    public static Streaks compute(Collection<LocalDate> activeDays, LocalDate today) {
        if (activeDays == null || activeDays.isEmpty()) return new Streaks(0, 0);
        TreeSet<LocalDate> days = new TreeSet<>();
        for (LocalDate d : activeDays) if (d != null) days.add(d);

        int max = 0;
        int run = 0;
        LocalDate prev = null;
        for (LocalDate d : days) {
            run = prev != null && prev.plusDays(1).equals(d) ? run + 1 : 1;
            max = Math.max(max, run);
            prev = d;
        }

        LocalDate end = days.contains(today) ? today : today.minusDays(1);
        int current = 0;
        for (LocalDate d = end; days.contains(d); d = d.minusDays(1)) current++;
        return new Streaks(current, max);
    }
}
