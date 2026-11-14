package com.pbl6.flashcard.service;

import com.pbl6.flashcard.service.LearningPathScheduler.CardIn;
import com.pbl6.flashcard.service.LearningPathScheduler.ChapterPlan;
import com.pbl6.flashcard.service.LearningPathScheduler.DayPlan;
import com.pbl6.flashcard.service.LearningPathScheduler.DayPos;
import com.pbl6.flashcard.service.LearningPathScheduler.DayRange;
import com.pbl6.flashcard.service.LearningPathScheduler.ForecastDay;
import com.pbl6.flashcard.service.LearningPathScheduler.PlanResult;
import com.pbl6.flashcard.service.LearningPathScheduler.Task;
import org.junit.jupiter.api.Test;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/** Chia ngày học theo số thẻ từng chương (1.0) và theo thẻ có trọng số / trần tải / ngày nghỉ (2.0): logic thuần, kiểm bằng JUnit. */
class LearningPathSchedulerTest {

    private static ChapterPlan plan(String title, int cards, int from, int to) {
        return new ChapterPlan(UUID.randomUUID(), title, "deck-" + title, cards, new DayRange(from, to));
    }

    // ---- tiện ích cho phần 2.0

    /** Chương thứ i có UUID cố định để kết quả tất định giữa hai lần chạy. */
    private static UUID ch(int i) {
        return new UUID(0L, i);
    }

    /** Thẻ chưa học, trọng số w, seq liên tục từ 1, cardId "c&lt;seq&gt;"; chương i có perChapter[i] thẻ. */
    private static List<CardIn> cards(double w, int... perChapter) {
        List<CardIn> out = new ArrayList<>();
        int seq = 1;
        for (int i = 0; i < perChapter.length; i++) {
            for (int j = 0; j < perChapter[i]; j++, seq++) out.add(new CardIn("c" + seq, ch(i), seq, w, false, null));
        }
        return out;
    }

    /** Lộ trình đang chạy: perDay thẻ/ngày, chương chapterSize thẻ; thẻ có seq ≤ learnedUpTo đã học; mọi thẻ đều có scheduledDay. */
    private static List<CardIn> running(int total, int perDay, int chapterSize, int learnedUpTo) {
        List<CardIn> out = new ArrayList<>();
        for (int seq = 1; seq <= total; seq++) {
            out.add(new CardIn("c" + seq, ch((seq - 1) / chapterSize), seq, 1.0, seq <= learnedUpTo, (seq - 1) / perDay + 1));
        }
        return out;
    }

    private static Map<Integer, List<CardIn>> byDay(List<CardIn> cards, PlanResult r) {
        Map<Integer, List<CardIn>> m = new TreeMap<>();
        for (CardIn c : cards) m.computeIfAbsent(r.dayOf().get(c.cardId()), k -> new ArrayList<>()).add(c);
        return m;
    }

    private static int countOn(List<CardIn> cards, PlanResult r, int day) {
        List<CardIn> l = byDay(cards, r).get(day);
        return l == null ? 0 : l.size();
    }

    /** Tải lớn nhất của một ngày theo chính hàm forecast (mới + ôn dự báo). */
    private static double maxLoad(List<CardIn> cards, PlanResult r, int days, int cap) {
        return LearningPathScheduler.forecast(byDay(cards, r), days, cap, null).stream()
                .mapToDouble(ForecastDay::load).max().orElse(0);
    }

    private static DayRange rangeOf(List<CardIn> cards, PlanResult r, UUID chapter) {
        int min = Integer.MAX_VALUE, max = Integer.MIN_VALUE;
        for (CardIn c : cards) {
            if (!chapter.equals(c.chapterId())) continue;
            int d = r.dayOf().get(c.cardId());
            min = Math.min(min, d);
            max = Math.max(max, d);
        }
        return new DayRange(min, max);
    }

    /** Ngày không giảm theo seq và mỗi chương chiếm một dải liền mạch (không có ngày trống xen giữa). */
    private static void assertMonotonicAndContiguous(List<CardIn> cards, PlanResult r) {
        int prev = 0;
        Map<UUID, Set<Integer>> daysOf = new HashMap<>();
        for (CardIn c : cards) {
            int d = r.dayOf().get(c.cardId());
            assertTrue(d >= prev, "ngày phải không giảm theo seq tại " + c.cardId());
            prev = d;
            daysOf.computeIfAbsent(c.chapterId(), k -> new TreeSet<>()).add(d);
        }
        for (Map.Entry<UUID, Set<Integer>> e : daysOf.entrySet()) {
            DayRange range = rangeOf(cards, r, e.getKey());
            assertEquals(range.days(), e.getValue().size(), "chương " + e.getKey() + " phải liền mạch");
        }
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

    // =========================================================================================== 2.0 §3.1

    @Test
    void trongSoTheoCapJlptVaNguPhap() {
        assertEquals(1.0, LearningPathScheduler.weight("N5", "N3", false));
        assertEquals(1.0, LearningPathScheduler.weight("N3", "N3", false));
        assertEquals(1.3, LearningPathScheduler.weight("N2", "N3", false));
        assertEquals(1.5, LearningPathScheduler.weight("N1", "N3", false));
        assertEquals(1.2, LearningPathScheduler.weight(null, "N3", false));
        assertEquals(1.2, LearningPathScheduler.weight("unknown", "N3", false));
        assertEquals(1.2, LearningPathScheduler.weight("N5", "N3", true));
        assertEquals(1.7, LearningPathScheduler.weight("N1", "N3", true));
        assertEquals(1.4, LearningPathScheduler.weight(null, "N3", true));
        // người học không rõ trình độ -> N5: N4 cao hơn 1 bậc
        assertEquals(1.3, LearningPathScheduler.weight("N4", null, false));
        assertEquals(1.3, LearningPathScheduler.weight("n2", " n3 ", false));
    }

    // =========================================================================================== 2.0 §3.2

    @Test
    void s01PlanChiaDeuKhongVuotTranChuongLienMach() {
        List<CardIn> cards = cards(1.0, 20, 20, 20);
        PlanResult r = LearningPathScheduler.plan(cards, 6, 30);
        assertFalse(r.overflow());
        assertEquals(6, r.daysUsed());
        assertEquals(10.0, r.quota(), 1e-9);
        assertEquals(60, r.dayOf().size());
        for (int d = 1; d <= 6; d++) assertEquals(10, countOn(cards, r, d), "ngày " + d);
        assertEquals(new DayRange(1, 2), rangeOf(cards, r, ch(0)));
        assertEquals(new DayRange(3, 4), rangeOf(cards, r, ch(1)));
        assertEquals(new DayRange(5, 6), rangeOf(cards, r, ch(2)));
        assertTrue(maxLoad(cards, r, 6, 30) <= 30.0);
        assertMonotonicAndContiguous(cards, r);
    }

    @Test
    void s02PlanVuotSucChuaBaoOverflow() {
        List<CardIn> cards = cards(1.0, 100);
        PlanResult r = LearningPathScheduler.plan(cards, 4, 30);
        assertTrue(r.overflow());
        assertEquals(4, r.daysUsed());
        // mọi thẻ vẫn có ngày trong 1..4, chia đều bỏ trần để UI còn hiện được lịch kèm cảnh báo
        for (CardIn c : cards) {
            int d = r.dayOf().get(c.cardId());
            assertTrue(d >= 1 && d <= 4);
        }
        for (int d = 1; d <= 4; d++) assertEquals(25, countOn(cards, r, d));
        assertTrue(LearningPathScheduler.forecast(byDay(cards, r), 4, 30, null).stream().anyMatch(ForecastDay::overCap));
        assertMonotonicAndContiguous(cards, r);
    }

    @Test
    void planKhongCoTheMotTheMotNgay() {
        PlanResult empty = LearningPathScheduler.plan(List.of(), 5, 30);
        assertTrue(empty.dayOf().isEmpty());
        assertEquals(0, empty.daysUsed());
        assertFalse(empty.overflow());

        PlanResult one = LearningPathScheduler.plan(cards(1.5, 1), 5, 30);
        assertEquals(1, one.dayOf().get("c1"));
        assertEquals(1, one.daysUsed());

        List<CardIn> twelve = cards(1.0, 12);
        PlanResult oneDay = LearningPathScheduler.plan(twelve, 1, 30);
        assertEquals(12, countOn(twelve, oneDay, 1));
        assertEquals(1, oneDay.daysUsed());
        assertFalse(oneDay.overflow());

        List<CardIn> forty = cards(1.0, 40);
        PlanResult tooMany = LearningPathScheduler.plan(forty, 1, 30);
        assertEquals(40, countOn(forty, tooMany, 1));
        assertTrue(tooMany.overflow());
        // totalDays <= 0 coi như 1
        assertEquals(1, LearningPathScheduler.plan(cards(1.0, 3), 0, 30).daysUsed());
    }

    @Test
    void planTranNhoHonMotTheKhongTreo() {
        List<CardIn> cards = cards(1.5, 10);
        PlanResult r = assertTimeoutPreemptively(Duration.ofSeconds(5), () -> LearningPathScheduler.plan(cards, 5, 1));
        assertTrue(r.overflow());
        assertEquals(10, r.dayOf().size());
        for (int d = 1; d <= 5; d++) assertEquals(2, countOn(cards, r, d));
        // cap <= 0 = không trần: chia đều bình thường, không overflow
        PlanResult noCap = assertTimeoutPreemptively(Duration.ofSeconds(5), () -> LearningPathScheduler.plan(cards, 5, 0));
        assertFalse(noCap.overflow());
        assertEquals(5, noCap.daysUsed());
    }

    @Test
    void planGiuNgayTheDaHocVaTinhVaoTai() {
        List<CardIn> cards = new ArrayList<>();
        for (int i = 1; i <= 10; i++) cards.add(new CardIn("l" + i, ch(0), i, 1.0, true, 1));
        for (int i = 11; i <= 30; i++) cards.add(new CardIn("n" + i, ch(1), i, 1.0, false, null));
        PlanResult r = LearningPathScheduler.plan(cards, 4, 30);
        assertFalse(r.overflow());
        assertEquals(4, r.daysUsed());
        assertEquals(30, r.dayOf().size());
        for (int i = 1; i <= 10; i++) assertEquals(1, r.dayOf().get("l" + i));
        // ngày 1 đã đủ quota nhờ thẻ ghim -> thẻ mới không chen vào
        for (int i = 11; i <= 30; i++) assertTrue(r.dayOf().get("n" + i) >= 2, "n" + i);
        assertEquals(new DayRange(2, 4), rangeOf(cards, r, ch(1)));
        // thẻ đã học mà không có ngày thì vẫn được xếp
        List<CardIn> noDay = List.of(new CardIn("x", ch(0), 1, 1.0, true, null));
        assertEquals(1, LearningPathScheduler.plan(noDay, 3, 30).dayOf().get("x"));
    }

    @Test
    void planChuongNhoGopChungNgayVoiChuongKe() {
        List<CardIn> cards = cards(1.0, 20, 1, 20);
        PlanResult r = LearningPathScheduler.plan(cards, 4, 100);
        assertFalse(r.overflow());
        assertEquals(4, r.daysUsed());
        DayRange a = rangeOf(cards, r, ch(0));
        DayRange b = rangeOf(cards, r, ch(1));
        DayRange c = rangeOf(cards, r, ch(2));
        assertTrue(a.dayTo() < b.dayFrom(), "chương lớn kết thúc thì chương sau sang ngày mới");
        assertEquals(b.dayFrom(), c.dayFrom(), "chương 1 thẻ (< quota/2) học chung ngày với chương kế");
        assertMonotonicAndContiguous(cards, r);
    }

    @Test
    void planChuongKetThucTrenNgayVoiThiKhongNgat() {
        // 9 bài × 5 thẻ trong 10 ngày: không thể chia đều mà không xẻ bài; không được tạo "ngày 1 thẻ" (4 + 1) rồi dồn tiếp
        List<CardIn> cards = cards(1.0, 5, 5, 5, 5, 5, 5, 5, 5, 5);
        PlanResult r = LearningPathScheduler.plan(cards, 10, 30);
        assertFalse(r.overflow());
        assertEquals(10, r.daysUsed());
        // 8 bài đầu trọn vẹn mỗi bài một ngày (đuôi 1 thẻ được học nốt), bài cuối chia 3 + 2 cho hai ngày còn lại
        for (int d = 1; d <= 8; d++) assertEquals(5, countOn(cards, r, d), "ngày " + d);
        assertEquals(3, countOn(cards, r, 9));
        assertEquals(2, countOn(cards, r, 10));
        assertMonotonicAndContiguous(cards, r);
    }

    /** Chương i có size[i] thẻ, mọi chương cùng cỡ. */
    private static List<CardIn> chapters(int chapters, int size) {
        int[] sizes = new int[chapters];
        Arrays.fill(sizes, size);
        return cards(1.0, sizes);
    }

    @Test
    void planChuoiChuongNhoKhongBiDonVaoMotNgay() {
        // Lộ trình bổ khuyết gom theo chữ Hán: 30 nhóm 1 thẻ / 10 ngày -> đúng 3 thẻ/ngày. Từng ra 29 + 1 vì với thẻ mở đầu chương
        // "đuôi chương" = cả chương ≤ max(1 thẻ, quota/4) nên ngày không bao giờ đóng theo quota, chỉ trần mới chặn.
        List<CardIn> ones = chapters(30, 1);
        PlanResult r1 = LearningPathScheduler.plan(ones, 10, 100);
        assertFalse(r1.overflow());
        assertEquals(10, r1.daysUsed());
        for (int d = 1; d <= 10; d++) assertEquals(3, countOn(ones, r1, d), "ngày " + d);
        assertMonotonicAndContiguous(ones, r1);

        // 40 chương 3 thẻ / 10 ngày -> 12 thẻ/ngày (4 bài trọn vẹn), không phải 100 thẻ ngày 1
        List<CardIn> threes = chapters(40, 3);
        PlanResult r3 = LearningPathScheduler.plan(threes, 10, 100);
        assertFalse(r3.overflow());
        for (int d = 1; d <= 10; d++) assertEquals(12, countOn(threes, r3, d), "ngày " + d);
        assertMonotonicAndContiguous(threes, r3);

        // Một chương lớn rồi mười chương 1 thẻ / 6 ngày: mười chương nhỏ không bị dồn hết vào ngày 5
        List<CardIn> mixed = cards(1.0, 20, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1);
        PlanResult rm = LearningPathScheduler.plan(mixed, 6, 100);
        assertFalse(rm.overflow());
        for (int d = 1; d <= 6; d++) assertEquals(5, countOn(mixed, rm, d), "ngày " + d);
        assertMonotonicAndContiguous(mixed, rm);

        // Cấu hình mặc định: 25 bài × 6 thẻ, 6 ngày, trần 30 -> không vừa trần (overflow) nhưng lịch phẳng, không 144 thẻ ngày 1
        List<CardIn> sixes = chapters(25, 6);
        PlanResult r6 = LearningPathScheduler.plan(sixes, 6, 30);
        assertTrue(r6.overflow());
        assertEquals(6, r6.daysUsed());
        for (int d = 1; d <= 6; d++) assertTrue(countOn(sixes, r6, d) <= 30, "ngày " + d + ": " + countOn(sixes, r6, d));
    }

    @Test
    void rebalanceChuongMotTheKhongVuotQuota() {
        // 30 nhóm 1 thẻ, 3 thẻ/ngày, chưa học gì, hôm nay ngày 4 -> mọi thẻ xếp lại từ ngày 4, không ngày nào quá ceil(quota)
        // (từng ra 26 thẻ ngày 4 vì cùng lỗi "đuôi chương" của plan)
        List<CardIn> cards = running(30, 3, 1, 0);
        for (boolean extend : new boolean[]{false, true}) {
            PlanResult r = LearningPathScheduler.rebalance(cards, 4, 10, 100, extend);
            assertFalse(r.overflow(), "extend=" + extend);
            assertEquals(30, r.dayOf().size());
            int limit = (int) Math.ceil(r.quota() - 1e-9);
            for (int d = 1; d <= 3; d++) assertEquals(0, countOn(cards, r, d), "extend=" + extend + " ngày " + d);
            for (int d = 4; d <= r.daysUsed(); d++) {
                int n = countOn(cards, r, d);
                assertTrue(n >= 1 && n <= limit, "extend=" + extend + " ngày " + d + ": " + n + " (tối đa " + limit + ")");
            }
        }
        assertEquals(10, LearningPathScheduler.rebalance(cards, 4, 10, 100, false).daysUsed());
        assertEquals(13, LearningPathScheduler.rebalance(cards, 4, 10, 100, true).daysUsed(), "giữ q = 3 -> 3 thẻ/ngày từ ngày 4");
    }

    @Test
    void planTatDinh() {
        List<CardIn> cards = cards(1.3, 7, 13, 4, 22, 9);
        PlanResult a = LearningPathScheduler.plan(cards, 12, 40);
        PlanResult b = LearningPathScheduler.plan(new ArrayList<>(cards), 12, 40);
        assertEquals(a, b);
        assertEquals(new ArrayList<>(a.dayOf().keySet()), new ArrayList<>(b.dayOf().keySet()));
    }

    @Test
    void planNgayKhongGiamTheoSeqVaChuongLienMach() {
        double[] ws = {1.0, 1.2, 1.3, 1.5, 1.7};
        int[] sizes = {7, 13, 4, 22, 9};
        List<CardIn> cards = new ArrayList<>();
        int seq = 1;
        for (int i = 0; i < sizes.length; i++) {
            for (int j = 0; j < sizes[i]; j++, seq++) cards.add(new CardIn("c" + seq, ch(i), seq, ws[seq % ws.length], false, null));
        }
        // trộn thứ tự đầu vào: plan phải tự sắp theo seq
        List<CardIn> shuffled = new ArrayList<>(cards);
        Collections.reverse(shuffled);
        PlanResult r = LearningPathScheduler.plan(shuffled, 12, 50);
        assertFalse(r.overflow());
        assertEquals(12, r.daysUsed());
        assertMonotonicAndContiguous(cards, r);
        assertTrue(maxLoad(cards, r, 12, 50) <= 50.0);
        assertEquals(new ArrayList<>(cards.stream().map(CardIn::cardId).toList()), new ArrayList<>(r.dayOf().keySet()),
                "dayOf theo thứ tự seq");
    }

    @Test
    void planKhongVuaTranThiChiaPhangKhongBoTrongNgayRoiDon() {
        // Cấu hình mặc định (trần 30) với 10 thẻ/ngày: tải ổn định 10 + 0.9×27 = 37 > 30 -> không lịch nào vừa trần.
        // Phải báo overflow và trả lịch phẳng 10/ngày, không phải "ngày 20 thẻ xen ngày 0 thẻ" với sóng ôn tới 87.
        List<CardIn> cards = cards(1.0, 50, 50, 50, 50, 50, 50);
        PlanResult r = LearningPathScheduler.plan(cards, 30, 30);
        assertTrue(r.overflow());
        assertEquals(30, r.daysUsed());
        for (int d = 1; d <= 30; d++) assertEquals(10, countOn(cards, r, d), "ngày " + d);
        // tải ổn định từ ngày 18: 10 mới + 0.9 × (10 + 10 + 10 + 10) với k = 1, 3, 7, 17
        assertEquals(46.0, maxLoad(cards, r, 30, 30), 1e-9);
        assertMonotonicAndContiguous(cards, r);
        // trần 60 thì vừa: cùng lịch phẳng nhưng không overflow
        PlanResult ok = LearningPathScheduler.plan(cards, 30, 60);
        assertFalse(ok.overflow());
        assertEquals(r.dayOf(), ok.dayOf());
    }

    @Test
    void planBoTrongNgayBiSongOnCuaTheDaHocLapKin() {
        // 35 thẻ đã học hôm 1 -> ngày 2 (k=1) và ngày 4 (k=3) riêng ôn dự báo đã ≥ 30: thẻ mới phải né hai ngày đó
        List<CardIn> cards = new ArrayList<>();
        for (int i = 1; i <= 35; i++) cards.add(new CardIn("l" + i, ch(0), i, 1.0, true, 1));
        for (int i = 36; i <= 45; i++) cards.add(new CardIn("n" + i, ch(1), i, 1.0, false, null));
        PlanResult r = LearningPathScheduler.plan(cards, 6, 30);
        assertEquals(0, countOn(cards, r, 2));
        assertEquals(0, countOn(cards, r, 4));
        assertEquals(10, countOn(cards, r, 3) + countOn(cards, r, 5) + countOn(cards, r, 6));
        for (int i = 1; i <= 35; i++) assertEquals(1, r.dayOf().get("l" + i));
        // vẫn overflow vì ngày 1/2/4 vượt trần do chính thẻ đã học (UI nên hiện biểu đồ forecast, không chỉ gợi ý tăng ngày)
        assertTrue(r.overflow());
        assertTrue(LearningPathScheduler.forecast(byDay(cards, r), 6, 30, null).get(1).overCap());
    }

    @Test
    void planDungDuSoNgayKhiDuThe() {
        List<CardIn> c31 = cards(1.0, 31);
        PlanResult r31 = LearningPathScheduler.plan(c31, 30, 100);
        assertEquals(30, r31.daysUsed());
        for (int d = 1; d <= 30; d++) assertTrue(countOn(c31, r31, d) >= 1, "ngày " + d + " không được trống");

        List<CardIn> c24 = cards(1.0, 24);
        PlanResult r24 = LearningPathScheduler.plan(c24, 10, 100);
        assertEquals(10, r24.daysUsed());
        for (int d = 1; d <= 10; d++) {
            int n = countOn(c24, r24, d);
            assertTrue(n == 2 || n == 3, "ngày " + d + ": " + n);
        }
        // ít thẻ hơn ngày: tối thiểu 1 thẻ/ngày, dồn về đầu, không rải ngày trống vào giữa
        List<CardIn> c5 = cards(1.5, 5);
        PlanResult r5 = LearningPathScheduler.plan(c5, 30, 100);
        assertEquals(5, r5.daysUsed());
        for (int d = 1; d <= 5; d++) assertEquals(1, countOn(c5, r5, d));
    }

    // =========================================================================================== 2.0 §3.3

    @Test
    void s03ForecastNgayTamCongBaNguon() {
        Map<Integer, List<CardIn>> byDay = new HashMap<>();
        int seq = 1;
        for (int d = 1; d <= 7; d++) {
            List<CardIn> l = new ArrayList<>();
            for (int i = 0; i < 10; i++, seq++) l.add(new CardIn("c" + seq, ch(0), seq, 1.0, false, d));
            byDay.put(d, l);
        }
        List<ForecastDay> f = LearningPathScheduler.forecast(byDay, 8, 30, null);
        assertEquals(8, f.size());
        assertEquals(0.0, f.get(0).predictedReviews(), 1e-9);
        assertEquals(9.0, f.get(1).predictedReviews(), 1e-9);                  // k = 1
        assertEquals(18.0, f.get(3).predictedReviews(), 1e-9);                 // k = 1, 3
        assertEquals(27.0, f.get(7).predictedReviews(), 1e-9);                 // k = 1, 3, 7 -> 9 + 9 + 9
        assertEquals(0, f.get(7).newCount());
        assertEquals(27.0, f.get(7).load(), 1e-9);
        assertFalse(f.get(7).overCap());
        assertEquals(10, f.get(3).newCount());
        assertEquals(28.0, f.get(3).load(), 1e-9);
        // trần 20: ngày 4 tải 28 vượt; trần <= 0 không bao giờ vượt
        assertTrue(LearningPathScheduler.forecast(byDay, 8, 20, null).get(3).overCap());
        assertFalse(LearningPathScheduler.forecast(byDay, 8, 0, null).get(3).overCap());
    }

    @Test
    void forecastQuaNgayCuoiKhongLoi() {
        Map<Integer, List<CardIn>> byDay = new HashMap<>();
        byDay.put(-3, List.of(new CardIn("a", ch(0), 1, 1.0, false, -3)));
        byDay.put(0, List.of(new CardIn("b", ch(0), 2, 1.0, false, 0)));
        byDay.put(9, List.of(new CardIn("c", ch(0), 3, 1.0, false, 9), new CardIn("d", ch(0), 4, 1.0, false, 9),
                new CardIn("e", ch(0), 5, 1.0, false, 9)));
        byDay.put(12, List.of(new CardIn("f", ch(0), 6, 1.0, false, 12)));
        List<ForecastDay> f = LearningPathScheduler.forecast(byDay, 10, 30, Map.of());
        assertEquals(10, f.size());
        assertEquals(10, f.get(9).dayIndex());
        assertEquals(2.7, f.get(9).predictedReviews(), 1e-9);
        assertEquals(0.0, f.get(0).predictedReviews(), 1e-9);
        assertEquals(3, f.get(8).newCount());
        assertEquals(3, LearningPathScheduler.forecast(null, 3, 30, null).size());
        assertTrue(LearningPathScheduler.forecast(byDay, 0, 30, null).isEmpty());
    }

    @Test
    void forecastDungLichThatChoTheDaHoc() {
        Map<Integer, List<CardIn>> byDay = new HashMap<>();
        List<CardIn> learned = new ArrayList<>();
        List<CardIn> fresh = new ArrayList<>();
        for (int i = 1; i <= 10; i++) learned.add(new CardIn("l" + i, ch(0), i, 1.0, true, 1));
        for (int i = 11; i <= 20; i++) fresh.add(new CardIn("n" + i, ch(0), i, 1.0, false, 2));
        byDay.put(1, learned);
        byDay.put(2, fresh);

        List<ForecastDay> predicted = LearningPathScheduler.forecast(byDay, 5, 30, null);
        assertEquals(9.0, predicted.get(1).predictedReviews(), 1e-9);
        assertEquals(9.0, predicted.get(3).predictedReviews(), 1e-9);   // k = 3 từ ngày 1

        List<ForecastDay> actual = LearningPathScheduler.forecast(byDay, 5, 30, Map.of(3, 4));
        assertEquals(0.0, actual.get(1).predictedReviews(), 1e-9);      // thẻ đã học không dự báo nữa
        assertEquals(13.0, actual.get(2).predictedReviews(), 1e-9);     // 9 dự báo (ngày 2, k = 1) + 4 đến hạn thật
        assertEquals(0.0, actual.get(3).predictedReviews(), 1e-9);
        assertEquals(10, actual.get(0).newCount());                      // cột "mới" vẫn đủ cả thẻ đã học
    }

    // =========================================================================================== 2.0 §3.4

    @Test
    void s04RebalanceChiaNoVaoNgayConLai() {
        // 60 thẻ, 6/ngày, 10 ngày, 2 chương; đã học ngày 1 + 3 thẻ ngày 2; hôm nay ngày 5 -> nợ 15 thẻ (seq 10..24)
        List<CardIn> cards = running(60, 6, 30, 9);
        PlanResult r = LearningPathScheduler.rebalance(cards, 5, 10, 30, false);
        assertFalse(r.overflow());
        assertEquals(10, r.daysUsed());
        assertEquals(60, r.dayOf().size());
        for (CardIn c : cards) {
            int d = r.dayOf().get(c.cardId());
            if (c.learned()) assertEquals(c.scheduledDay(), d, "thẻ đã học giữ ngày " + c.cardId());
            else assertTrue(d >= 5 && d <= 10, c.cardId() + " phải nằm trong 5..10, được " + d);
        }
        for (int d = 5; d <= 10; d++) assertTrue(countOn(cards, r, d) >= 1, "ngày " + d + " phải có thẻ");
        assertEquals(0, countOn(cards, r, 3));
        assertEquals(0, countOn(cards, r, 4));
        assertTrue(maxLoad(cards, r, 10, 30) <= 30.0);
        assertEquals(51.0 / 6, r.quota(), 1e-9);
    }

    @Test
    void rebalanceKhongNoThiGiuNguyen() {
        List<CardIn> cards = running(60, 6, 30, 24); // học đủ tới hết ngày 4, hôm nay ngày 5
        for (boolean extend : new boolean[]{false, true}) {
            PlanResult r = LearningPathScheduler.rebalance(cards, 5, 10, 30, extend);
            assertFalse(r.overflow());
            assertEquals(10, r.daysUsed());
            for (CardIn c : cards) assertEquals(c.scheduledDay(), r.dayOf().get(c.cardId()));
        }
        // chưa tới ngày bắt đầu cũng không có gì đổi
        PlanResult before = LearningPathScheduler.rebalance(running(12, 2, 6, 0), -3, 6, 30, false);
        for (CardIn c : running(12, 2, 6, 0)) assertEquals(c.scheduledDay(), before.dayOf().get(c.cardId()));
    }

    @Test
    void rebalanceKeoDaiTangDaysUsed() {
        List<CardIn> cards = running(60, 6, 30, 9);
        PlanResult r = LearningPathScheduler.rebalance(cards, 5, 10, 30, true);
        assertFalse(r.overflow());
        assertTrue(r.daysUsed() > 10, "kéo dài phải vượt 10 ngày, được " + r.daysUsed());
        assertEquals(6.0, r.quota(), 1e-9);
        for (CardIn c : cards) {
            int d = r.dayOf().get(c.cardId());
            if (c.learned()) assertEquals(c.scheduledDay(), d);
            else assertTrue(d >= 5, c.cardId());
        }
        // giữ q cũ: không ngày nào từ hôm nay vượt quá q (+ đuôi chương ≤ max(1 thẻ, q/4) được học nốt)
        for (int d = 5; d <= r.daysUsed(); d++) assertTrue(countOn(cards, r, d) <= 7, "ngày " + d);
        assertTrue(maxLoad(cards, r, r.daysUsed(), 30) <= 30.0);
    }

    @Test
    void rebalanceSauNgayCuoiDonVaoHomNay() {
        List<CardIn> cards = running(10, 1, 10, 0);
        PlanResult r = LearningPathScheduler.rebalance(cards, 12, 10, 30, false);
        assertFalse(r.overflow());
        assertEquals(12, r.daysUsed());
        for (CardIn c : cards) assertEquals(12, r.dayOf().get(c.cardId()));
    }

    // ---- replan (đổi khung lịch ở lộ trình ACTIVE)

    @Test
    void replanXepLaiCaKhiKhongNoVaGhimTheDaHoc() {
        // Học đủ tới hết ngày 4 (24 thẻ), hôm nay ngày 5, người dùng kéo 10 -> 12 ngày: rebalance giữ nguyên (không nợ) nhưng
        // replan phải dàn 36 thẻ còn lại ra 8 ngày 5..12 (4–5 thẻ/ngày thay vì 6)
        List<CardIn> cards = running(60, 6, 30, 24);
        PlanResult same = LearningPathScheduler.rebalance(cards, 5, 12, 30, false);
        for (CardIn c : cards) assertEquals(c.scheduledDay(), same.dayOf().get(c.cardId()));

        PlanResult r = LearningPathScheduler.replan(cards, 5, 12, 30);
        assertFalse(r.overflow());
        assertEquals(12, r.daysUsed());
        assertEquals(60, r.dayOf().size());
        assertEquals(36.0 / 8, r.quota(), 1e-9);
        for (CardIn c : cards) {
            int d = r.dayOf().get(c.cardId());
            if (c.learned()) assertEquals(c.scheduledDay(), d, "thẻ đã học giữ ngày " + c.cardId());
            else assertTrue(d >= 5 && d <= 12, c.cardId() + " phải nằm trong 5..12, được " + d);
        }
        // 4–5 thẻ/ngày; ngày 5 nhận 6 vì đuôi 1 thẻ của chương 1 (≤ max(1, q/4)) được học nốt trong ngày
        for (int d = 5; d <= 12; d++) {
            int n = countOn(cards, r, d);
            assertTrue(n >= 4 && n <= 6, "ngày " + d + ": " + n);
        }
        assertMonotonicAndContiguous(cards, r);
        assertTrue(maxLoad(cards, r, 12, 30) <= 30.0);
        // tất định
        assertEquals(r, LearningPathScheduler.replan(new ArrayList<>(cards), 5, 12, 30));
    }

    @Test
    void replanQuaNgayCuoiDonVaoFromDay() {
        List<CardIn> cards = running(10, 1, 10, 3);
        PlanResult r = LearningPathScheduler.replan(cards, 12, 10, 30);
        assertFalse(r.overflow());
        assertEquals(12, r.daysUsed());
        for (CardIn c : cards) assertEquals(c.learned() ? c.scheduledDay() : 12, r.dayOf().get(c.cardId()), c.cardId());
    }

    @Test
    void replanTruocNgayBatDauXepTuNgayMot() {
        List<CardIn> cards = cards(1.0, 20);
        PlanResult r = LearningPathScheduler.replan(cards, -2, 4, 30);
        assertFalse(r.overflow());
        assertEquals(4, r.daysUsed());
        for (int d = 1; d <= 4; d++) assertEquals(5, countOn(cards, r, d), "ngày " + d);
        // thẻ chưa học đã có ngày cũ cũng bị xếp lại (chỉ thẻ đã học mới được ghim)
        List<CardIn> old = running(20, 10, 20, 0);
        PlanResult r2 = LearningPathScheduler.replan(old, 1, 4, 30);
        for (int d = 1; d <= 4; d++) assertEquals(5, countOn(old, r2, d), "ngày " + d);
        // rút ngắn khung: 20 thẻ còn 2 ngày -> 10/ngày, không overflow với trần 30
        PlanResult r3 = LearningPathScheduler.replan(old, 1, 2, 30);
        assertEquals(2, r3.daysUsed());
        assertEquals(10, countOn(old, r3, 1));
        assertEquals(10, countOn(old, r3, 2));
        assertFalse(r3.overflow());
    }

    // =========================================================================================== 2.0 §3.5

    @Test
    void s05DayIndexForMaskNghiCuoiTuan() {
        LocalDate fri = LocalDate.of(2026, 10, 16);
        assertEquals(DayOfWeek.FRIDAY, fri.getDayOfWeek());
        String mask = "1111100";
        assertEquals(new DayPos(1, false), LearningPathScheduler.dayIndexFor(fri, fri, mask));
        assertEquals(new DayPos(1, true), LearningPathScheduler.dayIndexFor(fri, fri.plusDays(1), mask));  // thứ 7
        assertEquals(new DayPos(1, true), LearningPathScheduler.dayIndexFor(fri, fri.plusDays(2), mask));  // CN
        assertEquals(new DayPos(2, false), LearningPathScheduler.dayIndexFor(fri, fri.plusDays(3), mask)); // thứ 2
        assertEquals(fri, LearningPathScheduler.dateForDay(fri, 1, mask));
        assertEquals(fri.plusDays(3), LearningPathScheduler.dateForDay(fri, 2, mask));
        assertEquals(fri.plusDays(7), LearningPathScheduler.dateForDay(fri, 6, mask));   // thứ 6 tuần sau
        assertEquals(fri.plusDays(10), LearningPathScheduler.dateForDay(fri, 7, mask));  // thứ 2 tuần sau nữa
    }

    @Test
    void maskMotNgayHocMoiTuan() {
        LocalDate wed = LocalDate.of(2026, 10, 14);
        assertEquals(DayOfWeek.WEDNESDAY, wed.getDayOfWeek());
        String sundayOnly = "0000001";
        LocalDate sun = LocalDate.of(2026, 10, 18);
        assertEquals(sun, LearningPathScheduler.dateForDay(wed, 1, sundayOnly));
        assertEquals(sun.plusWeeks(4), LearningPathScheduler.dateForDay(wed, 5, sundayOnly));
        assertEquals(new DayPos(0, true), LearningPathScheduler.dayIndexFor(wed, wed, sundayOnly));
        assertEquals(new DayPos(2, false), LearningPathScheduler.dayIndexFor(wed, sun.plusWeeks(1), sundayOnly));
        assertEquals(new DayPos(2, true), LearningPathScheduler.dayIndexFor(wed, sun.plusWeeks(1).plusDays(1), sundayOnly));
        assertEquals(new DayPos(0, false), LearningPathScheduler.dayIndexFor(wed, sun.minusWeeks(1), sundayOnly));
        assertEquals(new DayPos(-1, false), LearningPathScheduler.dayIndexFor(wed, sun.minusWeeks(2), sundayOnly));
    }

    @Test
    void batDauVaoNgayNghi() {
        LocalDate sat = LocalDate.of(2026, 10, 17);
        assertEquals(DayOfWeek.SATURDAY, sat.getDayOfWeek());
        String mask = "1111100";
        LocalDate mon = sat.plusDays(2);
        assertEquals(mon, LearningPathScheduler.dateForDay(sat, 1, mask));
        assertEquals(new DayPos(0, true), LearningPathScheduler.dayIndexFor(sat, sat, mask));
        assertEquals(new DayPos(0, true), LearningPathScheduler.dayIndexFor(sat, sat.plusDays(1), mask));
        assertEquals(new DayPos(1, false), LearningPathScheduler.dayIndexFor(sat, mon, mask));
        assertEquals(sat.minusDays(1), LearningPathScheduler.dateForDay(sat, 0, mask)); // thứ 6 trước đó
        assertEquals(new DayPos(0, false), LearningPathScheduler.dayIndexFor(sat, sat.minusDays(1), mask));
    }

    @Test
    void dayIndexForMaskDayDuKhopDayIndexCu() {
        LocalDate start = LocalDate.of(2026, 10, 14);
        for (String mask : new String[]{"1111111", null, "0000000", "abc", "11111"}) {
            for (int o = -10; o <= 40; o++) {
                LocalDate d = start.plusDays(o);
                assertEquals(new DayPos(LearningPathScheduler.dayIndex(start, d), false),
                        LearningPathScheduler.dayIndexFor(start, d, mask), "mask=" + mask + " offset=" + o);
                assertEquals(d, LearningPathScheduler.dateForDay(start, o + 1, mask));
            }
        }
    }

    @Test
    void dateForDayVaDayIndexForNghichDaoNhau() {
        LocalDate[] starts = {LocalDate.of(2026, 10, 12), LocalDate.of(2026, 10, 17), LocalDate.of(2026, 12, 31), LocalDate.of(2028, 2, 28)};
        String[] masks = {"1111111", "1111100", "0101010", "0000001", "1000000", "0110011"};
        for (LocalDate start : starts) {
            for (String m : masks) {
                LocalDate prev = null;
                for (int k = -10; k <= 30; k++) {
                    LocalDate d = LearningPathScheduler.dateForDay(start, k, m);
                    assertEquals(new DayPos(k, false), LearningPathScheduler.dayIndexFor(start, d, m), start + " " + m + " k=" + k);
                    if (prev != null) assertTrue(d.isAfter(prev), "ngày học phải tăng dần");
                    if (k == 1) assertFalse(d.isBefore(start), "ngày 1 không trước ngày bắt đầu");
                    prev = d;
                }
            }
        }
    }

    // =========================================================================================== 2.0 §3.6

    @Test
    void suggestDaysKep3Den90() {
        assertEquals(3, LearningPathScheduler.suggestDays(0, 30));
        assertEquals(3, LearningPathScheduler.suggestDays(10, 30));
        assertEquals(90, LearningPathScheduler.suggestDays(10000, 30));
        assertEquals(4, LearningPathScheduler.suggestDays(100, 0));     // không trần -> công thức spec: 25 thẻ/ngày
        assertEquals(3, LearningPathScheduler.suggestDays(60.0, 200));  // 20/ngày, tải ngày 3 = 20 + 0.9 × 20 = 38 ≤ 200
        assertEquals(5, LearningPathScheduler.suggestDays(100.5, 200)); // 4.02 -> 5
        // Trần 30 (mặc định V20 là 50): công thức spec (25 thẻ mới/ngày) cho tải 70 ngay ngày 4 -> gợi ý phải dài hơn để plan không overflow
        assertEquals(6, LearningPathScheduler.suggestDays(60, 30));     // S-01: 10/ngày, tải tối đa 28
        assertEquals(13, LearningPathScheduler.suggestDays(100, 30));   // 8 rồi 7/ngày: 8 + 0.9 × 24 = 29.6
        assertEquals(23, LearningPathScheduler.suggestDays(150, 30));   // 7 rồi 6/ngày: 6 + 0.9 × 26 = 29.4 (k = 17 đã bật)
        assertEquals(54, LearningPathScheduler.suggestDays(300, 30));   // 6 rồi 5/ngày: 5 + 0.9 × 27 = 29.3 (k = 40 đã bật)
        assertEquals(60, LearningPathScheduler.suggestDays(100, 10));   // trần rất thấp: 2 rồi 1 thẻ/ngày, tải đúng 10
        assertEquals(40, LearningPathScheduler.suggestDays(250, 30));   // spec cũ nói 10 ngày = 25 mới + 0.9 × 75 ôn
    }

    /** Lịch phẳng n thẻ / days ngày như plan xếp khi không vướng trần: r = n mod days ngày đầu nhận ceil, còn lại floor. */
    private static Map<Integer, List<CardIn>> flatByDay(int n, int days) {
        Map<Integer, List<CardIn>> m = new TreeMap<>();
        int floor = n / days, r = n % days, seq = 1;
        for (int d = 1; d <= days; d++) {
            List<CardIn> l = new ArrayList<>();
            for (int i = 0; i < floor + (d <= r ? 1 : 0); i++, seq++) l.add(new CardIn("c" + seq, ch(0), seq, 1.0, false, d));
            m.put(d, l);
        }
        return m;
    }

    private static boolean flatOverCap(int n, int days, int cap) {
        return LearningPathScheduler.forecast(flatByDay(n, days), days, cap, null).stream().anyMatch(ForecastDay::overCap);
    }

    @Test
    void suggestDaysKhopVoiPlanTheoTranMacDinh() {
        int defaultCap = 30; // trần ví dụ (mặc định V20 là 50): sóng ôn chạm trần sớm hơn nên kiểm được nhiều mốc k
        for (int n : new int[]{60, 100, 150, 300}) {
            List<CardIn> cards = cards(1.0, n);
            int d = LearningPathScheduler.suggestDays(n, defaultCap);
            assertTrue(d >= 3 && d <= 90, n + " thẻ -> " + d);
            PlanResult r = LearningPathScheduler.plan(cards, d, defaultCap);
            assertFalse(r.overflow(), n + " thẻ / " + d + " ngày phải vừa trần");
            assertEquals(d, LearningPathScheduler.suggestDays(cards, defaultCap), "bản theo danh sách thẻ cho cùng số ngày");
            // plan với số ngày gợi ý cho đúng lịch phẳng (không phải lịch lồi lõm vừa trần nhờ né ngày) và lịch đó dưới trần
            Map<Integer, List<CardIn>> flat = flatByDay(n, d);
            for (int day = 1; day <= d; day++) assertEquals(flat.get(day).size(), countOn(cards, r, day), n + " thẻ, ngày " + day);
            assertFalse(flatOverCap(n, d, defaultCap));
            // nhỏ nhất: bớt một ngày thì lịch phẳng vượt trần (trừ khi đã chạm sàn 3 ngày / 25 thẻ mỗi ngày);
            // plan(d − 1) có thể vẫn "không overflow" nhờ lịch lồi lõm (60 thẻ / 5 ngày) nên không dùng nó làm tiêu chí
            int floor = Math.max(3, (n + 24) / 25);
            if (d > floor) assertTrue(flatOverCap(n, d - 1, defaultCap), n + " thẻ / " + (d - 1) + " ngày: lịch phẳng vẫn vừa");
        }
        // thẻ nặng hơn: cùng tổng trọng số nhưng ít thẻ hơn -> ít lượt ôn hơn -> không cần nhiều ngày hơn bản theo tổng
        assertTrue(LearningPathScheduler.suggestDays(cards(1.5, 100), 30) <= LearningPathScheduler.suggestDays(150, 30));
        // nhiều bài nhỏ (20 × 5 thẻ) vẫn vừa trần với số ngày gợi ý
        List<CardIn> lessons = chapters(20, 5);
        int d = LearningPathScheduler.suggestDays(lessons, 30);
        assertFalse(LearningPathScheduler.plan(lessons, d, 30).overflow());
        // bản nháp: cờ learned / scheduledDay của đầu vào bị bỏ qua
        assertEquals(LearningPathScheduler.suggestDays(cards(1.0, 60), 30),
                LearningPathScheduler.suggestDays(running(60, 6, 30, 24), 30));
        assertEquals(3, LearningPathScheduler.suggestDays(List.of(), 30));
        assertEquals(3, LearningPathScheduler.suggestDays((List<CardIn>) null, 30));
    }
}
