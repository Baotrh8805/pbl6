package com.pbl6.flashcard.dto.deck;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.LocalDate;
import java.util.List;

/**
 * GET /api/reviews/activity (hợp đồng đợt 2 §7, A5) — dashboard cá nhân. days: đủ ?days= phần tử liên tiếp, cũ → mới, kết thúc ở
 * hôm nay theo tz (ngày không học có reviews = quizzes = 0) để heatmap vẽ thẳng không phải tự lấp ngày trống.
 * dueToday: thẻ đã học có due_at trước hết hôm nay (tz); newCards: thẻ trong các bộ mình sở hữu chưa ôn lần nào; masteredTotal:
 * thẻ có khoảng ôn ≥ 21 ngày; currentStreak / maxStreak: chuỗi ngày có ôn hoặc làm quiz trên TOÀN bộ lịch sử, không chỉ cửa sổ
 * days (hôm nay chưa học thì chuỗi hiện tại tính tới hôm qua).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ActivityResponse(List<Day> days, long dueToday, long newCards, long learnedTotal, long masteredTotal,
                               int currentStreak, int maxStreak) {

    /** day: "YYYY-MM-DD"; reviews = số lượt ôn (review_logs, mọi nguồn: lật thẻ, quiz luyện tập, học nhanh), quizzes = số bài đã nộp. */
    public record Day(LocalDate day, long reviews, long quizzes) {}
}
