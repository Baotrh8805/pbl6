package com.pbl6.flashcard.service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
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

    // =====================================================================================================
    // Bản 2.0 (spec 2026-10-19 §3): lịch theo thẻ, trọng số độ khó, trần tải, dự báo ôn, ngày nghỉ, gợi ý ngày.
    // Tất cả thuần và tất định; phần 1.0 phía trên giữ nguyên cho lộ trình cũ (theo vị trí thẻ).
    // =====================================================================================================

    /**
     * Khoảng cách (ngày) từ ngày học thẻ tới các lần ôn kỳ vọng, lấy từ chuỗi khoảng ôn của SM-2 hiện tại khi chấm "Tốt"
     * liên tiếp (1 → 3 → 7 → 17 → 40, spec §3.3). Dùng làm "ngày d − k" khi dự báo, nên chỉ là xấp xỉ: thẻ thật sẽ ôn ở d+1, d+4…
     * nhưng tổng lượt ôn trong vài tuần đầu tương đương, và ta chỉ cần tải xấp xỉ để tránh dồn ngày.
     */
    private static final int[] FORECAST_OFFSETS = {1, 3, 7, 17, 40};
    /** Tỉ lệ thẻ thật sự quay lại ôn đúng dự báo (phần còn lại bị "Lại", ôn sớm hoặc bỏ qua). */
    public static final double RETENTION = 0.9;
    /** Số lần nới quota (×1.15) tối đa khi hết ngày mà còn thẻ hoặc tải vẫn vượt trần, trước khi báo overflow (§3.2 bước 3). */
    private static final int MAX_NUDGES = 10;
    private static final double NUDGE = 1.15;
    /** Sai số so sánh số thực khi cộng dồn trọng số (0.1 không biểu diễn chính xác). */
    private static final double EPS = 1e-6;
    private static final String ALL_DAYS = "1111111";
    /** Chặn trên tuyệt đối khi kéo dài lộ trình (rebalance extend=true) để vòng lặp luôn dừng. */
    private static final int MAX_EXTEND_DAYS = 3650;

    /**
     * Một thẻ đưa vào thuật toán (không phải entity). seq = thứ tự trong lộ trình (chương rồi thứ tự tài liệu); scheduledDay = ngày
     * đang có (null khi chưa xếp). learned = đã có ít nhất một lượt chấm: thẻ như vậy mà có scheduledDay thì được "ghim" — giữ nguyên
     * ngày (lịch sử không bị viết lại) nhưng vẫn tính vào tải của ngày đó; mọi thẻ khác được xếp lại.
     */
    public record CardIn(String cardId, UUID chapterId, int seq, double weight, boolean learned, Integer scheduledDay) {}

    /**
     * Kết quả chia ngày. dayOf: ngày của TỪNG thẻ đầu vào (kể cả thẻ ghim, giữ ngày cũ), theo thứ tự seq. daysUsed: ngày lớn nhất có
     * thẻ (0 khi không có thẻ; với plan luôn ≤ totalDays trừ khi thẻ ghim nằm ngoài; với rebalance extend=true chính là totalDays mới).
     * overflow: không lịch nào giữ được tải ≤ trần ở mọi ngày của cửa sổ (kể cả do sóng ôn của thẻ đã học) → trả lịch có phần vượt
     * trần nhỏ nhất (thường là lịch phẳng theo quota); UI gợi ý tăng ngày hoặc trần và hiện biểu đồ {@link #forecast}.
     * quota: trọng số trung bình một ngày học (Σweight / số ngày của cửa sổ, tối thiểu 1) để UI hiện "~N thẻ/ngày".
     */
    public record PlanResult(Map<String, Integer> dayOf, int daysUsed, boolean overflow, double quota) {}

    /**
     * Một ngày trong dự báo khối lượng: newCount/newWeight = thẻ mới xếp cho ngày; predictedReviews = lượt ôn kỳ vọng (dự báo
     * × RETENTION, cộng số đến hạn thật nếu được cung cấp); load = newWeight + predictedReviews; overCap = load > trần.
     */
    public record ForecastDay(int dayIndex, int newCount, double newWeight, double predictedReviews, double load, boolean overCap) {}

    /**
     * Vị trí một ngày lịch trong lộ trình: index = ngày học thứ mấy (1 = ngày học đầu tiên; ≤ 0 trước đó); rest = ngày nghỉ theo
     * mask, khi đó index là ngày học gần nhất TRƯỚC nó (để UI vẫn biết đang ở đâu và hiện "hôm nay nghỉ").
     */
    public record DayPos(int index, boolean rest) {}

    // ----------------------------------------------------------------------------------------------- §3.1

    /**
     * §3.1 Trọng số một thẻ theo cấp JLPT so với trình độ người học: thẻ ≤ cấp người học 1.0; cao hơn 1 bậc 1.3; cao hơn ≥ 2 bậc
     * 1.5; không rõ cấp thẻ 1.2; ngữ pháp +0.2 (mẫu câu tốn công hơn một từ). Cấp dạng "N5".."N1" (không phân biệt hoa thường,
     * N5 thấp nhất); trình độ người học không rõ coi như N5 — mặc định hồ sơ, giống ExtractionOptions. Làm tròn 1 chữ số thập phân
     * cho khớp cột numeric(3,1) và để 1.2 + 0.2 không thành 1.4000000000000001.
     */
    public static double weight(String cardLevel, String userLevel, boolean grammar) {
        int card = levelRank(cardLevel);
        int user = levelRank(userLevel);
        if (user < 0) user = 5;
        double w;
        if (card < 0) {
            w = 1.2;
        } else {
            int above = user - card; // N5=5 … N1=1: cấp "cao hơn" có số nhỏ hơn
            w = above <= 0 ? 1.0 : above == 1 ? 1.3 : 1.5;
        }
        if (grammar) w += 0.2;
        return Math.round(w * 10) / 10.0;
    }

    /** "N5" → 5 … "N1" → 1; −1 khi không nhận ra (null, rỗng, "unknown"…). */
    private static int levelRank(String level) {
        if (level == null) return -1;
        String s = level.trim().toUpperCase();
        if (s.length() != 2 || s.charAt(0) != 'N') return -1;
        char c = s.charAt(1);
        return c >= '1' && c <= '5' ? c - '0' : -1;
    }

    // ----------------------------------------------------------------------------------------------- §3.2

    /**
     * §3.2 Chia ngày theo thẻ cho cửa sổ ngày 1..totalDays. Thẻ duyệt theo seq và nhận ngày không giảm dần, nên mỗi chương luôn
     * chiếm một dải ngày liền mạch. Một ngày nhận thẻ tới khi:
     * <ul>
     *   <li>đủ quota: trọng số mới trong ngày ≥ (trọng số còn phải xếp / số ngày còn lại). Quota "chạy" này thay cho q cố định của
     *       spec để phần dư tự dàn ra các ngày sau (q = ceil(Σ/D) cố định làm lộ trình 31 thẻ / 30 ngày kết thúc ở ngày 16);
     *       kẹp tối thiểu 1 nên ít thẻ thì dồn về đầu, không rải ngày trống vào giữa. Chương đang học dở chỉ còn cái đuôi ≤
     *       max(một thẻ, quota/4) thì học nốt trong ngày thay vì để 1–2 thẻ lẻ sang ngày sau (chỉ với chương đã bắt đầu trong
     *       lượt xếp; thẻ mở đầu chương mới luôn chịu kiểm tra quota, nên 30 chương 1 thẻ / 10 ngày vẫn ra 3 thẻ/ngày); hoặc</li>
     *   <li>chạm trần: trọng số mới + ôn dự báo (xem {@link #forecast}) + thẻ sắp thêm &gt; cap. Ngày trống vẫn nhận ít nhất một thẻ
     *       (không thẻ nào bị kẹt) trừ khi riêng ôn dự báo đã ≥ cap — ngày đó bị bỏ qua.</li>
     * </ul>
     * Chương kết thúc khi ngày hiện tại đã đầy ít nhất nửa ngưỡng thì chương kế bắt đầu ngày mới để dải ngày các chương không chồng
     * nhau; chương nhỏ (trọng số &lt; quota/2) hoặc chương kết thúc trên một ngày còn vơi thì chương kế học tiếp cùng ngày (không chia
     * nhỏ quá mức, không tạo ngày 1 thẻ). Hết ngày mà còn thẻ, hoặc xếp đủ nhưng vẫn có ngày tải &gt; trần: thử bỏ quy
     * tắc ngắt chương, rồi nới quota ×1.15 tối đa 10 vòng (ngày đầu nhận nhiều hơn trước khi làn sóng ôn tới). Không cách nào giữ
     * tải ≤ trần ở mọi ngày → {@code overflow=true} (UI báo tăng ngày hoặc trần) và trả lịch có tổng phần vượt trần nhỏ nhất —
     * thường là lịch phẳng theo quota bỏ trần, xem {@link #solve}. Mọi thẻ luôn có ngày trong 1..totalDays.
     * Thẻ {@code learned} có {@code scheduledDay} giữ nguyên ngày và vẫn tính vào tải ngày đó; mọi thẻ khác xếp lại từ ngày 1 —
     * với lộ trình đang chạy hãy dùng {@link #rebalance} để chỉ xếp từ hôm nay. dailyCap ≤ 0 = không trần. Tất định.
     */
    public static PlanResult plan(List<CardIn> cards, int totalDays, int dailyCap) {
        Input in = Input.of(cards, 1, Math.max(1, totalDays));
        double q = Math.max(in.totalWeight / in.days(), 1.0);
        return solve(in, q, cap(dailyCap));
    }

    // ----------------------------------------------------------------------------------------------- §3.3

    /**
     * §3.3 Dự báo khối lượng từng ngày 1..totalDays. Thẻ mới ở ngày d quay lại ôn vào d+k, k ∈ {1,3,7,17,40}, nhân RETENTION 0.9;
     * chỉ tính nguồn là ngày ≥ 1 ("chỉ các ngày trong lộ trình"). Khoá byDay ≤ 0 hoặc &gt; totalDays không có dòng riêng nhưng
     * được bỏ qua an toàn (không lỗi chỉ số). actualDueByDay: số thẻ ĐÃ HỌC đến hạn thật theo ngày học (từ reviews.due_at, caller
     * quy về chỉ số ngày bằng {@link #dayIndexFor}); khi khác null và không rỗng, thẻ learned không còn được dự báo mà lấy số thật
     * này (không nhân RETENTION vì là lịch thật); null/rỗng = dự báo cho mọi thẻ (lộ trình chưa chạy). load = newWeight + reviews;
     * overCap khi load &gt; dailyCap (cap ≤ 0: không bao giờ overCap).
     * <p>Số chuẩn (S-03): 10 thẻ/ngày × 7 ngày → ngày 8 = (10 + 10 + 10) × 0.9 = 27.0 (k = 1, 3, 7). RETENTION nhân đúng MỘT lần
     * lên số thẻ; bảng test của spec từng ghi "9 + 9 + 9 × 0.9" (= 24.3, nhân hai lần) là lỗi chép — bản sao thuần ở frontend
     * (roadmapUtils) phải cho 27.0 để biểu đồ hai bên khớp nhau.
     */
    public static List<ForecastDay> forecast(Map<Integer, List<CardIn>> byDay, int totalDays, int dailyCap,
                                             Map<Integer, Integer> actualDueByDay) {
        List<ForecastDay> out = new ArrayList<>();
        if (totalDays < 1) return out;
        boolean useActual = actualDueByDay != null && !actualDueByDay.isEmpty();
        Grid all = new Grid();       // mọi thẻ: cột "mới" của biểu đồ
        Grid predicted = new Grid(); // chỉ thẻ còn được dự báo
        if (byDay != null) {
            for (Map.Entry<Integer, List<CardIn>> e : byDay.entrySet()) {
                if (e.getKey() == null || e.getValue() == null || e.getKey() < 1) continue;
                int day = e.getKey();
                for (CardIn c : e.getValue()) {
                    all.add(day, c.weight());
                    if (!(useActual && c.learned())) predicted.add(day, c.weight());
                }
            }
        }
        double cap = cap(dailyCap);
        for (int d = 1; d <= totalDays; d++) {
            double reviews = predicted.forecast(d);
            if (useActual) {
                Integer actual = actualDueByDay.get(d);
                if (actual != null && actual > 0) reviews += actual;
            }
            double newWeight = all.weight(d);
            double load = newWeight + reviews;
            out.add(new ForecastDay(d, all.count(d), newWeight, reviews, load, load > cap + EPS));
        }
        return out;
    }

    // ----------------------------------------------------------------------------------------------- §3.4

    /**
     * §3.4 Cân lại lịch khi học trễ. Thẻ nợ = chưa học và scheduledDay &lt; todayIndex (hoặc chưa có ngày). Không có thẻ nợ → trả
     * nguyên lịch hiện tại (bấm "Cân lại" khi không trễ không đổi gì). Có nợ: thẻ đã học giữ ngày; MỌI thẻ chưa học (nợ + chưa tới
     * ngày) được xếp lại từ todayIndex theo quy tắc của {@link #plan}:
     * <ul>
     *   <li>extend=false: chính là {@link #replan}(cards, todayIndex, totalDays, dailyCap) — vào cửa sổ [todayIndex, totalDays]
     *       với quota mới = trọng số cần xếp / số ngày còn lại (cho phép vượt q cũ, vẫn tôn trọng trần; không đủ chỗ → overflow như
     *       plan). todayIndex &gt; totalDays (đã qua ngày cuối) → mọi thẻ dồn vào ngày todayIndex và daysUsed &gt; totalDays, caller
     *       nên kéo total_days theo.</li>
     *   <li>extend=true: giữ quota cũ (Σweight toàn lộ trình / totalDays) và kéo dài tới khi đủ chỗ; daysUsed là totalDays mới.
     *       Thử cả hai cách ngắt chương, lấy cách kết thúc sớm hơn.</li>
     * </ul>
     * todayIndex &lt; 1 (chưa tới ngày bắt đầu) coi như 1. Tất định.
     */
    public static PlanResult rebalance(List<CardIn> cards, int todayIndex, int totalDays, int dailyCap, boolean extend) {
        int today = Math.max(1, todayIndex);
        int days = Math.max(1, totalDays);
        List<CardIn> sorted = sortedBySeq(cards);
        double total = 0;
        boolean behind = false;
        for (CardIn c : sorted) {
            total += c.weight();
            if (c.scheduledDay() == null || (!c.learned() && c.scheduledDay() < today)) behind = true;
        }
        double baseQuota = Math.max(total / days, 1.0);
        if (!behind) {
            Map<String, Integer> dayOf = new LinkedHashMap<>();
            int max = 0;
            for (CardIn c : sorted) {
                dayOf.put(c.cardId(), c.scheduledDay());
                max = Math.max(max, c.scheduledDay());
            }
            return new PlanResult(dayOf, max, false, baseQuota);
        }
        double cap = cap(dailyCap);
        if (!extend) return replan(sorted, today, days, dailyCap);
        Input in = Input.of(sorted, today, today + MAX_EXTEND_DAYS);
        // Ứng viên theo thứ tự ưu tiên: tôn trọng trần (ngắt chương / không), rồi lịch phẳng bỏ trần. Chọn lịch có phần vượt trần
        // nhỏ nhất, hoà thì kết thúc sớm nhất (kéo dài ít nhất), hoà nữa thì ứng viên đứng trước.
        Fill best = null;
        double bestExcess = Double.POSITIVE_INFINITY;
        for (double c : new double[]{cap, Double.POSITIVE_INFINITY}) {
            for (boolean breaks : new boolean[]{true, false}) {
                Fill f = fill(in, baseQuota, 1.0, true, c, breaks);
                if (!f.complete(in)) continue;
                double excess = f.excess(in.first, f.maxDay, cap);
                if (excess < bestExcess - EPS || (Math.abs(excess - bestExcess) <= EPS && f.maxDay < best.maxDay)) {
                    best = f;
                    bestExcess = excess;
                }
            }
        }
        if (best == null) {
            // Không thể xảy ra (bỏ trần luôn xếp đủ trong 3650 ngày); phòng hờ: dồn phần còn lại vào ngay sau ngày cuối đã dùng.
            best = fill(in, baseQuota, 1.0, true, Double.POSITIVE_INFINITY, false);
            int tail = Math.max(best.maxDay, today - 1) + 1;
            for (CardIn c : in.toPlace) best.dayOf.putIfAbsent(c.cardId(), tail);
            bestExcess = Double.POSITIVE_INFINITY;
        }
        return result(in, best.dayOf, baseQuota, bestExcess > EPS);
    }

    /**
     * Xếp lại MỌI thẻ chưa học từ ngày fromDay — dùng khi người dùng đổi khung lịch của lộ trình đang chạy (PATCH totalDays /
     * startDate / studyDays / dailyCap, spec §4.1 và §7). Khác {@link #rebalance}: luôn xếp lại dù không có thẻ nợ, vì khung vừa đổi
     * nên phần chưa học phải dàn lại theo khung mới (rebalance chỉ sửa khi học trễ). Thẻ đã học giữ ngày (lịch sử không bị viết
     * lại) và vẫn tính vào tải; thẻ chưa học — kể cả thẻ nợ và thẻ chưa tới ngày — vào cửa sổ [fromDay, totalDays] với cùng quy tắc
     * lấp ngày / trần của rebalance(extend=false): quota = (trọng số cần xếp + thẻ ghim trong cửa sổ) / số ngày cửa sổ, cho phép vượt
     * q cũ, không đủ chỗ → overflow như {@link #plan}. fromDay &gt; totalDays (đã qua ngày cuối) → cửa sổ chỉ còn ngày fromDay: mọi thẻ
     * chưa học dồn vào đó và daysUsed &gt; totalDays, caller kéo total_days theo. fromDay &lt; 1 coi như 1. Tất định.
     */
    public static PlanResult replan(List<CardIn> cards, int fromDay, int totalDays, int dailyCap) {
        int from = Math.max(1, fromDay);
        Input in = Input.of(cards, from, Math.max(Math.max(1, totalDays), from));
        double q = Math.max((in.placeWeight + in.pinnedInWindow()) / in.days(), 1.0);
        return solve(in, q, cap(dailyCap));
    }

    // ----------------------------------------------------------------------------------------------- §3.5

    /**
     * §3.5 Ngày lịch của ngày học thứ dayIndex. mask 7 ký tự '0'/'1' cho Thứ 2..Chủ nhật ("1111111" = học cả tuần); mask null,
     * sai định dạng hoặc toàn '0' coi như học cả tuần. Ngày 1 = ngày học đầu tiên TỪ start trở đi (start rơi vào ngày nghỉ thì
     * ngày 1 là ngày học kế tiếp). dayIndex ≤ 0 đếm lùi: 0 = ngày học ngay trước ngày 1, nên {@link #dayIndexFor} là hàm ngược
     * trên mọi số nguyên; với mask cả tuần, kết quả là start + (dayIndex − 1) như bản 1.0.
     */
    public static LocalDate dateForDay(LocalDate start, int dayIndex, String mask) {
        String m = normMask(mask);
        LocalDate day1 = nextStudyDay(start, m);
        if (dayIndex >= 1) return advance(day1, dayIndex - 1, m);
        return retreat(day1, 1 - dayIndex, m);
    }

    /**
     * §3.5 Ngày học thứ mấy của một ngày lịch. Ngày học: index = 1 + số ngày học trong [ngày 1, date) (≤ 0 khi date trước ngày 1,
     * trùng {@link #dayIndex} với mask cả tuần). Ngày nghỉ: rest=true và index = chỉ số của ngày học gần nhất trước nó (0 nếu chưa
     * có ngày học nào) — caller suy ra state: index ≤ 0 → before, rest → "hôm nay nghỉ, vẫn có N thẻ đến hạn", index &gt; totalDays → after.
     */
    public static DayPos dayIndexFor(LocalDate start, LocalDate date, String mask) {
        String m = normMask(mask);
        LocalDate day1 = nextStudyDay(start, m);
        boolean study = isStudyDay(date, m);
        if (!date.isBefore(day1)) {
            int before = countStudyDays(day1, date, m);
            return new DayPos(before + (study ? 1 : 0), !study);
        }
        int between = countStudyDays(date, day1, m);
        return new DayPos(study ? 1 - between : -between, !study);
    }

    // ----------------------------------------------------------------------------------------------- §3.6

    /** Số thẻ mới một buổi học thoải mái: sàn của gợi ý số ngày (§3.6) và cũng là mức khi không có trần. */
    private static final int COMFORT_NEW_PER_DAY = 25;
    private static final int MIN_SUGGEST_DAYS = 3;
    private static final int MAX_SUGGEST_DAYS = 90;

    /**
     * §3.6 Gợi ý số ngày cho bản nháp ("Gợi ý N ngày [Áp dụng]"). Spec viết ceil(Σweight / min(cap, 25)), nhưng {@link #plan} áp
     * trần lên TẢI = mới + ôn dự báo (S-02), nên với trần mặc định 30 gợi ý đó (25 thẻ mới/ngày) gần như luôn cho overflow ngay
     * khi bấm "Áp dụng" (100 thẻ / 4 ngày: tải 70; sóng ôn k = 1, 3, 7, 17, 40 làm tải ổn định ≈ 3.7–5.5 × số thẻ mới/ngày).
     * Để gợi ý và bộ chia ngày nói cùng một thứ, gợi ý là số ngày NHỎ NHẤT trong [max(3, ceil(Σweight / 25)), 90] mà lịch
     * PHẲNG theo quota (chia đều như {@link #plan} khi không vướng trần, thử cả hai cách ngắt chương) có tải ≤ trần ở MỌI ngày.
     * Khi đó plan với số ngày ấy chắc chắn không overflow (ứng viên vòng 0 của nó trùng lịch phẳng), nên "Áp dụng" rồi kích hoạt
     * không bao giờ hiện cảnh báo. Không dùng điều kiện yếu hơn "plan không overflow": plan có thể vừa trần bằng lịch lồi lõm nhờ
     * né / dồn ngày (60 thẻ / 3 ngày / trần 30 → {30, 3, 27}) — đúng theo nghĩa đen nhưng không phải thứ nên gợi ý. Không số ngày
     * nào tới 90 vừa → 90 (UI cảnh báo đỏ, gợi ý tăng trần). cap ≤ 0 (không trần) → đúng công thức của spec với 25 thẻ/ngày. Quét
     * tuyến tính từ nhỏ lên (hai lượt xếp mỗi D, rẻ; không nhị phân vì vừa trần không đơn điệu theo D: mốc k = 17, 40 bật thêm
     * một nguồn ôn vào ngày cuối). Thẻ coi như chưa học (bản nháp), cờ learned / scheduledDay bị bỏ qua. Σweight ≤ 0 → 3.
     */
    public static int suggestDays(List<CardIn> cards, int dailyCap) {
        List<CardIn> fresh = new ArrayList<>();
        double total = 0;
        for (CardIn c : sortedBySeq(cards)) {
            fresh.add(new CardIn(c.cardId(), c.chapterId(), c.seq(), c.weight(), false, null));
            total += c.weight();
        }
        if (total <= 0) return MIN_SUGGEST_DAYS;
        int from = (int) Math.ceil(total / COMFORT_NEW_PER_DAY - EPS);
        from = Math.max(MIN_SUGGEST_DAYS, Math.min(MAX_SUGGEST_DAYS, from));
        if (dailyCap <= 0) return from;
        double cap = cap(dailyCap);
        for (int d = from; d <= MAX_SUGGEST_DAYS; d++) {
            Input in = Input.of(fresh, 1, d);
            if (flatFits(in, Math.max(total / d, 1.0), cap)) return d;
        }
        return MAX_SUGGEST_DAYS;
    }

    /** Lịch phẳng theo quota (xếp bỏ trần, factor 1) có xếp đủ và tải ≤ trần ở mọi ngày của cửa sổ không — thử cả hai cách ngắt chương. */
    private static boolean flatFits(Input in, double quota, double cap) {
        for (boolean breaks : new boolean[]{true, false}) {
            Fill f = fill(in, quota, 1.0, false, Double.POSITIVE_INFINITY, breaks);
            if (f.complete(in) && f.excess(in.first, in.last, cap) <= EPS) return true;
        }
        return false;
    }

    /**
     * Như {@link #suggestDays(List, int)} khi chỉ biết tổng trọng số (bản nháp chưa tính trọng số từng thẻ, hoặc nhãn
     * "~N thẻ/ngày" ở FE): mô phỏng ceil(Σweight) thẻ cùng một chương, trọng số bằng nhau. Thẻ thật nặng hơn 1.0 thì ít thẻ hơn
     * cùng tổng trọng số nên ít lượt ôn hơn (ôn đếm theo thẻ) — kết quả này vì vậy hơi dè dặt, không bao giờ ít ngày hơn bản theo
     * danh sách thẻ.
     */
    public static int suggestDays(double totalWeight, int dailyCap) {
        if (totalWeight <= 0) return MIN_SUGGEST_DAYS;
        int n = (int) Math.ceil(totalWeight - EPS);
        double w = totalWeight / n;
        List<CardIn> cards = new ArrayList<>(n);
        UUID chapter = new UUID(0L, 0L);
        for (int i = 1; i <= n; i++) cards.add(new CardIn("s" + i, chapter, i, w, false, null));
        return suggestDays(cards, dailyCap);
    }

    // ----------------------------------------------------------------------------------------------- nội bộ

    /** Trần tải dạng số thực; ≤ 0 nghĩa là không trần. */
    private static double cap(int dailyCap) {
        return dailyCap > 0 ? dailyCap : Double.POSITIVE_INFINITY;
    }

    private static List<CardIn> sortedBySeq(List<CardIn> cards) {
        List<CardIn> out = cards == null ? new ArrayList<>() : new ArrayList<>(cards);
        out.sort(Comparator.comparingInt(CardIn::seq)); // ổn định: cùng seq giữ thứ tự đầu vào
        return out;
    }

    /** Tải theo ngày: trọng số mới và số thẻ mới (số thẻ dùng cho dự báo ôn vì mỗi thẻ là một lượt ôn, không phân biệt độ khó). */
    private static final class Grid {
        private final Map<Integer, Double> weight = new HashMap<>();
        private final Map<Integer, Integer> count = new HashMap<>();

        void add(int day, double w) {
            weight.merge(day, w, Double::sum);
            count.merge(day, 1, Integer::sum);
        }

        double weight(int day) { return weight.getOrDefault(day, 0.0); }

        int count(int day) { return count.getOrDefault(day, 0); }

        Grid copy() {
            Grid g = new Grid();
            g.weight.putAll(weight);
            g.count.putAll(count);
            return g;
        }

        /** Lượt ôn dự báo của ngày: thẻ mới ở các ngày d − k (k ∈ FORECAST_OFFSETS, chỉ ngày ≥ 1) × RETENTION. */
        double forecast(int day) {
            int n = 0;
            for (int k : FORECAST_OFFSETS) {
                if (day - k >= 1) n += count(day - k);
            }
            return n * RETENTION;
        }
    }

    /** Đầu vào đã phân loại cho một cửa sổ xếp [first, last]: thẻ ghim (đã học, có ngày) vs thẻ cần xếp, trọng số từng chương. */
    private static final class Input {
        final List<CardIn> all;
        final List<CardIn> toPlace = new ArrayList<>();
        final Map<String, Integer> pinnedDay = new HashMap<>();
        final Grid pinned = new Grid();
        final Map<UUID, Double> chapterWeight = new HashMap<>();
        final int first;
        final int last;
        double totalWeight;
        double placeWeight;

        private Input(List<CardIn> all, int first, int last) {
            this.all = all;
            this.first = first;
            this.last = last;
        }

        static Input of(List<CardIn> cards, int first, int last) {
            Input in = new Input(sortedBySeq(cards), first, last);
            for (CardIn c : in.all) {
                in.totalWeight += c.weight();
                in.chapterWeight.merge(c.chapterId(), c.weight(), Double::sum);
                if (c.learned() && c.scheduledDay() != null) {
                    in.pinned.add(c.scheduledDay(), c.weight());
                    in.pinnedDay.put(c.cardId(), c.scheduledDay());
                } else {
                    in.toPlace.add(c);
                    in.placeWeight += c.weight();
                }
            }
            return in;
        }

        int days() { return last - first + 1; }

        /** Trọng số thẻ ghim nằm trong cửa sổ: chiếm chỗ nên tính vào quota của cửa sổ. */
        double pinnedInWindow() {
            double s = 0;
            for (Map.Entry<Integer, Double> e : pinned.weight.entrySet()) {
                if (e.getKey() >= first && e.getKey() <= last) s += e.getValue();
            }
            return s;
        }
    }

    /** Kết quả một lượt xếp: ngày của thẻ đã xếp (theo seq), tải theo ngày; placed &lt; toPlace.size() nghĩa là hết chỗ. */
    private static final class Fill {
        final Map<String, Integer> dayOf = new LinkedHashMap<>();
        Grid grid;
        int placed;
        int maxDay;

        boolean complete(Input in) { return placed == in.toPlace.size(); }

        /** Tổng phần tải vượt trần trên các ngày [from, to] — 0 nghĩa là lịch tôn trọng trần ở mọi ngày. */
        double excess(int from, int to, double cap) {
            double s = 0;
            for (int d = from; d <= to; d++) s += Math.max(0, grid.weight(d) + grid.forecast(d) - cap);
            return s;
        }

        /** Trọng số mới lớn nhất của một ngày trong [from, to]: thước đo "đều" giữa các lịch cùng tôn trọng trần. */
        double peakNew(int from, int to) {
            double p = 0;
            for (int d = from; d <= to; d++) p = Math.max(p, grid.weight(d));
            return p;
        }
    }

    /**
     * Xếp thẻ cần xếp của in vào [in.first, in.last] (xem Javadoc của {@link #plan}).
     * fixedQuota=true: ngưỡng mỗi ngày cố định qRef (rebalance extend); false: ngưỡng chạy = factor × (còn phải xếp + ghim phía
     * trước) / số ngày còn lại, tối thiểu 1. qRef/2 là ngưỡng "chương nhỏ" khi breaks=true.
     */
    private static Fill fill(Input in, double qRef, double factor, boolean fixedQuota, double cap, boolean breaks) {
        Fill out = new Fill();
        Grid grid = in.pinned.copy();
        out.grid = grid;
        double pinnedAhead = in.pinnedInWindow();
        double remaining = in.placeWeight;
        int d = in.first;
        // Ngưỡng của một ngày chốt lúc BƯỚC VÀO ngày đó (phần còn lại chia cho số ngày còn lại); tính lại theo phần đã xếp trong
        // ngày sẽ làm ngưỡng tụt dần và ngày chỉ nhận được nửa phần của mình.
        double dayTarget = target(fixedQuota, qRef, factor, remaining, pinnedAhead, in.last - d + 1);
        // tail[i] = trọng số còn lại của chương kể từ thẻ i (thẻ cùng chương liền nhau theo seq): đuôi nhỏ được học nốt trong ngày
        List<CardIn> cards = in.toPlace;
        double[] tail = new double[cards.size()];
        for (int i = cards.size() - 1; i >= 0; i--) {
            boolean sameAsNext = i + 1 < cards.size() && Objects.equals(cards.get(i).chapterId(), cards.get(i + 1).chapterId());
            tail[i] = cards.get(i).weight() + (sameAsNext ? tail[i + 1] : 0);
        }
        UUID prevChapter = null;
        boolean any = false;
        for (int i = 0; i < cards.size(); i++) {
            CardIn c = cards.get(i);
            // (1) sang chương mới: chương vừa xong đủ lớn (≥ quota/2) và ngày hiện tại đã đầy ít nhất một nửa -> ngày mới (dải ngày
            //     các chương không chồng nhau). Ngày còn vơi (chương để lại cái đuôi 1–2 thẻ) thì chương kế học tiếp trong ngày đó,
            //     không tạo "ngày 1 thẻ" rồi dồn phần dư sang ngày sau.
            if (breaks && any && !Objects.equals(prevChapter, c.chapterId()) && grid.weight(d) >= dayTarget / 2 - EPS
                    && in.chapterWeight.getOrDefault(prevChapter, 0.0) >= qRef / 2 - EPS) {
                pinnedAhead -= in.pinned.weight(d);
                d++;
                dayTarget = target(fixedQuota, qRef, factor, remaining, pinnedAhead, in.last - d + 1);
            }
            // (2) ngày đầy (đủ ngưỡng hoặc chạm trần) -> ngày sau, tới hết cửa sổ. Đuôi chương chỉ được học nốt khi chương ĐÃ BẮT
            //     ĐẦU trong lượt xếp này và còn chương sau nó. Thẻ mở đầu một chương mới luôn chịu kiểm tra ngưỡng như thường: với
            //     nó "đuôi" = cả chương, nên chuỗi chương nhỏ (lộ trình bổ khuyết gom 1–3 thẻ/nhóm, chương nháp bị bớt thẻ) sẽ
            //     luôn ≤ max(1 thẻ, ngưỡng/4) và một ngày nuốt hết 29 chương 1 thẻ nếu cho phép. Đuôi của chương cuối cứ để cho
            //     các ngày còn lại (31 thẻ / 30 ngày phải dùng đủ 30 ngày).
            double chapterTail = any && Objects.equals(prevChapter, c.chapterId()) && tail[i] < remaining - EPS
                    ? tail[i] : Double.POSITIVE_INFINITY;
            while (d <= in.last && dayFull(grid, d, dayTarget, cap, c.weight(), chapterTail)) {
                pinnedAhead -= in.pinned.weight(d);
                d++;
                dayTarget = target(fixedQuota, qRef, factor, remaining, pinnedAhead, in.last - d + 1);
            }
            if (d > in.last) break;
            grid.add(d, c.weight());
            remaining -= c.weight();
            out.dayOf.put(c.cardId(), d);
            out.placed++;
            out.maxDay = d;
            prevChapter = c.chapterId();
            any = true;
        }
        return out;
    }

    /** Ngưỡng trọng số mới của một ngày: cố định qRef, hoặc factor × (còn phải xếp + ghim phía trước) / số ngày còn lại, tối thiểu 1. */
    private static double target(boolean fixedQuota, double qRef, double factor, double remaining, double pinnedAhead, int daysLeft) {
        if (fixedQuota || daysLeft <= 0) return qRef;
        return Math.max(factor * (remaining + pinnedAhead) / daysLeft, 1.0);
    }

    /**
     * Ngày d không nhận thêm thẻ nặng nextWeight khi: đã có thẻ và đủ ngưỡng — trừ khi phần còn lại của chương (chapterTail, tính cả
     * thẻ này) chỉ là cái đuôi ≤ max(một thẻ, ngưỡng/4): học nốt trong ngày thay vì để 1–2 thẻ lẻ sang ngày sau (caller truyền
     * +∞ cho thẻ mở đầu chương mới, xem {@link #fill}); hoặc đã có thẻ và thêm nữa sẽ vượt trần (tải = mới + ôn dự báo); hoặc còn
     * trống nhưng riêng ôn dự báo đã ≥ trần. Ngày trống chưa bị lấp kín luôn nhận một thẻ để không thẻ nào bị kẹt.
     */
    private static boolean dayFull(Grid g, int d, double target, double cap, double nextWeight, double chapterTail) {
        double w = g.weight(d);
        double reviews = g.forecast(d);
        if (w > 0) {
            boolean quotaDone = w >= target - EPS && chapterTail > Math.max(nextWeight, target / 4) + EPS;
            return quotaDone || w + reviews + nextWeight > cap + EPS;
        }
        return reviews >= cap - EPS;
    }

    /**
     * §3.2 bước 3 cho cửa sổ hữu hạn. Ứng viên theo thứ tự ưu tiên: ngắt chương → không ngắt → nới quota ×1.15 (tối đa 10 vòng, ngày
     * đầu nhận nhiều hơn trước khi làn sóng ôn tới) → lịch phẳng theo quota gốc bỏ trần (ngắt chương nếu vừa, không thì thôi).
     * Trong các ứng viên xếp đủ và có tải ≤ trần ở MỌI ngày, chọn ứng viên có đỉnh thẻ mới/ngày thấp nhất (đều nhất), hoà thì ứng
     * viên đứng trước. Không có ứng viên nào như vậy → chọn ứng viên xếp đủ có tổng phần vượt trần nhỏ nhất và báo overflow: quy tắc
     * "ôn dự báo ≥ trần thì bỏ trống ngày" chỉ có ích khi nhờ đó tải thật sự xuống dưới trần (làn sóng ôn của thẻ đã học); khi cả
     * lộ trình vốn không vừa trần, bỏ trống rồi dồn thẻ sang ngày kế chỉ tạo sóng ôn lớn hơn (300 thẻ / 30 ngày / trần 30 cho các
     * ngày 20 thẻ xen ngày 0 thẻ với tải 87 thay vì 10 thẻ/ngày tải 46), nên lịch phẳng thắng theo tiêu chí này.
     */
    private static PlanResult solve(Input in, double quota, double cap) {
        Fill best = null;
        double bestExcess = Double.POSITIVE_INFINITY;
        double bestPeak = Double.POSITIVE_INFINITY;
        double factor = 1.0;
        for (int round = 0; round <= MAX_NUDGES; round++) {
            for (boolean breaks : new boolean[]{true, false}) {
                Fill f = fill(in, quota, factor, false, cap, breaks);
                if (!f.complete(in)) continue;
                double excess = f.excess(in.first, in.last, cap);
                if (excess <= EPS) {
                    double peak = f.peakNew(in.first, in.last);
                    if (bestExcess > EPS || peak < bestPeak - EPS) {
                        best = f;
                        bestExcess = 0;
                        bestPeak = peak;
                    }
                } else if (bestExcess > EPS && excess < bestExcess - EPS) {
                    best = f;
                    bestExcess = excess;
                }
            }
            factor *= NUDGE;
        }
        if (bestExcess > EPS) {
            // Lịch phẳng bỏ trần chỉ còn ý nghĩa khi không ứng viên nào tôn trọng trần (nếu nó tôn trọng được thì vòng 0 đã trùng nó)
            for (boolean breaks : new boolean[]{true, false}) {
                Fill f = fill(in, quota, 1.0, false, Double.POSITIVE_INFINITY, breaks);
                if (!f.complete(in)) continue;
                double excess = f.excess(in.first, in.last, cap);
                if (excess < bestExcess - EPS) {
                    best = f;
                    bestExcess = excess;
                }
            }
        }
        if (best == null) {
            // Không thể xảy ra (bỏ trần, không ngắt chương thì ngày cuối nhận hết); phòng hờ: dồn phần còn sót vào ngày cuối.
            best = fill(in, quota, 1.0, false, Double.POSITIVE_INFINITY, false);
            for (CardIn c : in.toPlace) best.dayOf.putIfAbsent(c.cardId(), in.last);
            bestExcess = Double.POSITIVE_INFINITY;
        }
        return result(in, best.dayOf, quota, bestExcess > EPS);
    }

    /** Ghép ngày của thẻ ghim và thẻ vừa xếp theo thứ tự seq; daysUsed = ngày lớn nhất. */
    private static PlanResult result(Input in, Map<String, Integer> placed, double quota, boolean overflow) {
        Map<String, Integer> dayOf = new LinkedHashMap<>();
        int max = 0;
        for (CardIn c : in.all) {
            Integer day = in.pinnedDay.containsKey(c.cardId()) ? in.pinnedDay.get(c.cardId()) : placed.get(c.cardId());
            dayOf.put(c.cardId(), day);
            if (day != null) max = Math.max(max, day);
        }
        return new PlanResult(dayOf, max, overflow, quota);
    }

    // ---- ngày học / ngày nghỉ

    private static String normMask(String mask) {
        if (mask == null || !mask.matches("[01]{7}") || mask.indexOf('1') < 0) return ALL_DAYS;
        return mask;
    }

    /** Thứ 2 = ký tự 0 … Chủ nhật = ký tự 6 (DayOfWeek.getValue() 1..7). */
    private static boolean isStudyDay(LocalDate date, String mask) {
        return mask.charAt(date.getDayOfWeek().getValue() - 1) == '1';
    }

    private static int studyDaysPerWeek(String mask) {
        int n = 0;
        for (int i = 0; i < 7; i++) if (mask.charAt(i) == '1') n++;
        return n;
    }

    /** Ngày học đầu tiên ≥ date (mask có ít nhất một '1' nên tìm thấy trong 7 ngày). */
    private static LocalDate nextStudyDay(LocalDate date, String mask) {
        LocalDate x = date;
        while (!isStudyDay(x, mask)) x = x.plusDays(1);
        return x;
    }

    /** Ngày học cuối cùng ≤ date. */
    private static LocalDate prevStudyDay(LocalDate date, String mask) {
        LocalDate x = date;
        while (!isStudyDay(x, mask)) x = x.minusDays(1);
        return x;
    }

    /** Tiến n ngày học từ một ngày học: nhảy theo tuần rồi dò phần lẻ (≤ 6 bước). */
    private static LocalDate advance(LocalDate studyDay, int n, String mask) {
        int perWeek = studyDaysPerWeek(mask);
        LocalDate x = studyDay.plusWeeks(n / perWeek);
        for (int i = 0, rem = n % perWeek; i < rem; i++) x = nextStudyDay(x.plusDays(1), mask);
        return x;
    }

    /** Lùi n ngày học từ một ngày học. */
    private static LocalDate retreat(LocalDate studyDay, int n, String mask) {
        int perWeek = studyDaysPerWeek(mask);
        LocalDate x = studyDay.minusWeeks(n / perWeek);
        for (int i = 0, rem = n % perWeek; i < rem; i++) x = prevStudyDay(x.minusDays(1), mask);
        return x;
    }

    /** Số ngày học trong [from, to) (nửa mở); 0 khi from ≥ to. Tuần tròn nhân lên, phần lẻ dò tay (≤ 6 ngày). */
    private static int countStudyDays(LocalDate from, LocalDate to, String mask) {
        long n = ChronoUnit.DAYS.between(from, to);
        if (n <= 0) return 0;
        int count = (int) (n / 7) * studyDaysPerWeek(mask);
        LocalDate x = from.plusDays(n - n % 7);
        while (x.isBefore(to)) {
            if (isStudyDay(x, mask)) count++;
            x = x.plusDays(1);
        }
        return count;
    }
}
