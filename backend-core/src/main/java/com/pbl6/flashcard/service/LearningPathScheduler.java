package com.pbl6.flashcard.service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Chia ngày học cho lộ trình (V13). Thuần, không đụng DB nên kiểm bằng JUnit (LearningPathSchedulerTest).
 * Nguồn sự thật của lịch: khoảng ngày mỗi chương + số thẻ -> việc từng ngày được tính lại khi cần, không lưu.
 */
public final class LearningPathScheduler {

    private LearningPathScheduler() {}

    public record DayRange(int dayFrom, int dayTo) {
        public int days() { return dayTo - dayFrom + 1; }
    }

    public record ChapterPlan(UUID chapterId, String title, String deckId, int cardCount, DayRange range) {
        public int perDay() { return LearningPathScheduler.perDay(cardCount, range); }
    }

    /** Học thẻ vị trí [fromPos, toPos] (đánh số từ 1) của một chương. */
    public record Task(UUID chapterId, String chapterTitle, String deckId, int fromPos, int toPos) {}

    public record DayPlan(int dayIndex, LocalDate date, List<Task> tasks) {}

    /** Chia totalDays ngày cho các chương theo tỉ lệ số thẻ, mỗi chương tối thiểu 1 ngày. */
    public static List<DayRange> allocate(List<Integer> cardCounts, int totalDays) {
        int n = cardCounts.size();
        List<DayRange> out = new ArrayList<>();
        if (n == 0) return out;
        if (n >= totalDays) {
            // nhiều chương hơn ngày: các chương dùng chung ngày, giữ nguyên thứ tự
            for (int i = 0; i < n; i++) {
                int day = (int) ((long) i * totalDays / n) + 1;
                out.add(new DayRange(day, day));
            }
            return out;
        }

        long total = 0;
        for (int c : cardCounts) total += c;
        boolean allZero = total == 0;
        if (allZero) total = n;

        double[] quota = new double[n];
        int[] base = new int[n];
        int sum = 0;
        for (int i = 0; i < n; i++) {
            long c = allZero ? 1 : cardCounts.get(i);
            quota[i] = (double) (totalDays * c) / total;
            base[i] = Math.max(1, (int) Math.floor(quota[i]));
            sum += base[i];
        }

        // Dư ngày (do ép tối thiểu 1): bớt 1 ở chương nhiều ngày nhất, hoà -> chương sau.
        while (sum > totalDays) {
            int pick = -1;
            for (int i = 0; i < n; i++) {
                if (base[i] > 1 && (pick < 0 || base[i] >= base[pick])) pick = i;
            }
            base[pick]--;
            sum--;
        }

        // Thiếu ngày: +1 cho chương có phần dư lớn nhất chưa được cộng (hoà -> chương trước), hết vòng thì lặp lại.
        boolean[] bumped = new boolean[n];
        int bumpedCount = 0;
        while (sum < totalDays) {
            if (bumpedCount == n) {
                bumped = new boolean[n];
                bumpedCount = 0;
            }
            int pick = -1;
            double best = -1;
            for (int i = 0; i < n; i++) {
                if (bumped[i]) continue;
                double rem = quota[i] - Math.floor(quota[i]);
                if (rem > best) {
                    best = rem;
                    pick = i;
                }
            }
            base[pick]++;
            bumped[pick] = true;
            bumpedCount++;
            sum++;
        }

        int day = 1;
        for (int i = 0; i < n; i++) {
            out.add(new DayRange(day, day + base[i] - 1));
            day += base[i];
        }
        return out;
    }

    /** Chia total phần tử thành parts nhóm, nhóm đầu lớn hơn, chênh lệch tối đa 1. */
    public static List<Integer> evenSplit(int total, int parts) {
        List<Integer> out = new ArrayList<>();
        if (parts <= 0) return out;
        int q = total / parts;
        int r = total % parts;
        for (int i = 0; i < parts; i++) out.add(q + (i < r ? 1 : 0));
        return out;
    }

    /** Số thẻ học mỗi ngày của một chương: ceil(cards / days); 0 khi chương không có thẻ. */
    public static int perDay(int cards, DayRange r) {
        if (cards <= 0) return 0;
        return (cards + r.days() - 1) / r.days();
    }

    /** Việc của ngày dayIndex (1-based): đoạn thẻ cần học ở mỗi chương đang trong khoảng ngày của nó. */
    public static List<Task> tasksFor(List<ChapterPlan> plans, int dayIndex) {
        List<Task> out = new ArrayList<>();
        for (ChapterPlan p : plans) {
            DayRange r = p.range();
            if (dayIndex < r.dayFrom() || dayIndex > r.dayTo()) continue;
            int per = p.perDay();
            int k = dayIndex - r.dayFrom() + 1;
            int from = (k - 1) * per + 1;
            int to = Math.min(k * per, p.cardCount());
            if (from > to) continue;
            out.add(new Task(p.chapterId(), p.title(), p.deckId(), from, to));
        }
        return out;
    }

    /** Lịch đầy đủ: mỗi ngày 1..totalDays một DayPlan. */
    public static List<DayPlan> schedule(List<ChapterPlan> plans, LocalDate start, int totalDays) {
        List<DayPlan> out = new ArrayList<>();
        for (int i = 1; i <= totalDays; i++) {
            out.add(new DayPlan(i, start.plusDays(i - 1), tasksFor(plans, i)));
        }
        return out;
    }

    /** Ngày thứ mấy của lộ trình (1 = ngày bắt đầu); 0 hoặc âm khi chưa tới ngày bắt đầu. */
    public static int dayIndex(LocalDate start, LocalDate today) {
        return (int) ChronoUnit.DAYS.between(start, today) + 1;
    }
}
