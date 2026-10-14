package com.pbl6.flashcard.service;

import com.pbl6.flashcard.service.LearningPathScheduler.ChapterPlan;
import com.pbl6.flashcard.service.LearningPathScheduler.DayPlan;
import com.pbl6.flashcard.service.LearningPathScheduler.DayRange;
import com.pbl6.flashcard.service.LearningPathScheduler.Task;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/** Chia ngày học theo số thẻ từng chương: logic thuần, kiểm bằng JUnit. */
class LearningPathSchedulerTest {

    private static ChapterPlan plan(String title, int cards, int from, int to) {
        return new ChapterPlan(UUID.randomUUID(), title, "deck-" + title, cards, new DayRange(from, to));
    }

    @Test
    void chiaNgayTheoTiLeSoThe() {
        assertEquals(List.of(new DayRange(1, 12), new DayRange(13, 30)),
                LearningPathScheduler.allocate(List.of(40, 60), 30));
    }

    @Test
    void moiChuongToiThieuMotNgay() {
        assertEquals(List.of(new DayRange(1, 1), new DayRange(2, 2), new DayRange(3, 3)),
                LearningPathScheduler.allocate(List.of(100, 1, 1), 3));
    }

    @Test
    void chuongNhieuHonNgayThiDungChungNgay() {
        List<DayRange> r = LearningPathScheduler.allocate(List.of(10, 10, 10), 2);
        assertEquals(1, r.get(0).dayFrom());
        assertEquals(1, r.get(1).dayFrom());
        assertEquals(2, r.get(2).dayFrom());
        r.forEach(x -> assertEquals(x.dayFrom(), x.dayTo()));
    }

    @Test
    void motNgayNamChuongTatCaNgayMot() {
        List<DayRange> r = LearningPathScheduler.allocate(List.of(1, 2, 3, 4, 5), 1);
        assertEquals(5, r.size());
        r.forEach(x -> assertEquals(new DayRange(1, 1), x));
    }

    @Test
    void chuongKhongTheVanCoMotNgay() {
        List<DayRange> r = LearningPathScheduler.allocate(List.of(0, 5), 4);
        assertEquals(1, r.get(0).dayFrom());
        assertTrue(r.get(0).days() >= 1);
        assertEquals(4, r.get(1).dayTo());
    }

    @Test
    void hoaPhanDuThiChuongTruocDuocCong() {
        // quota 2.5 / 2.5, base 2 / 2, thiếu 1 -> chương trước được +1
        assertEquals(List.of(new DayRange(1, 3), new DayRange(4, 5)),
                LearningPathScheduler.allocate(List.of(10, 10), 5));
    }

    @Test
    void khongCoChuongThiRong() {
        assertTrue(LearningPathScheduler.allocate(List.of(), 5).isEmpty());
    }

    @Test
    void tasksForBaTheNamNgay() {
        ChapterPlan p = plan("a", 3, 1, 5);
        assertEquals(1, LearningPathScheduler.perDay(3, p.range()));
        assertEquals(1, LearningPathScheduler.tasksFor(List.of(p), 3).size());
        assertTrue(LearningPathScheduler.tasksFor(List.of(p), 4).isEmpty());
        assertTrue(LearningPathScheduler.tasksFor(List.of(p), 5).isEmpty());
    }

    @Test
    void perDayLamTronLenVaNgayCuoiLayPhanConLai() {
        ChapterPlan p = plan("a", 40, 1, 6);
        assertEquals(7, p.perDay());
        List<Task> t = LearningPathScheduler.tasksFor(List.of(p), 6);
        assertEquals(1, t.size());
        assertEquals(36, t.get(0).fromPos());
        assertEquals(40, t.get(0).toPos());
        assertEquals(0, LearningPathScheduler.perDay(0, new DayRange(1, 3)));
    }

    @Test
    void evenSplitPhanTruocLonHon() {
        assertEquals(List.of(7, 7, 6), LearningPathScheduler.evenSplit(20, 3));
        assertTrue(LearningPathScheduler.evenSplit(5, 0).isEmpty());
    }

    @Test
    void dayIndexTinhTuNgayBatDau() {
        LocalDate start = LocalDate.of(2026, 10, 14);
        assertEquals(0, LearningPathScheduler.dayIndex(start, start.minusDays(1)));
        assertEquals(1, LearningPathScheduler.dayIndex(start, start));
        assertEquals(4, LearningPathScheduler.dayIndex(start, start.plusDays(3)));
    }

    @Test
    void scheduleMoiNgayMotDayPlan() {
        LocalDate start = LocalDate.of(2026, 10, 14);
        List<DayPlan> days = LearningPathScheduler.schedule(List.of(plan("a", 4, 1, 2)), start, 3);
        assertEquals(3, days.size());
        assertEquals(start.plusDays(2), days.get(2).date());
        assertEquals(1, days.get(0).dayIndex());
        assertEquals(1, days.get(0).tasks().size());
        assertTrue(days.get(2).tasks().isEmpty());
    }
}
