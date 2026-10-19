package com.pbl6.flashcard.dto.admin;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.LocalDate;
import java.util.List;

/** GET /api/admin/stats (spec 5.1). learningPaths (tổng) giữ kiểu long cho client cũ; learningPathBreakdown là phần thêm của 2.0. */
public record AdminStatsResponse(Users users, Decks decks, long cards, Extractions extractions, long quizAttempts,
                                 long learningPaths, long openReports, List<DayPoint> series,
                                 @JsonInclude(JsonInclude.Include.NON_NULL) LearningPathBreakdown learningPathBreakdown) {

    /** staffPendingSetup: staff chưa đổi mật khẩu seed (dashboard cảnh báo). */
    public record Users(long total, long new7d, long new30d, long locked, long premium, long active7d, long staffPendingSetup) {}

    public record Decks(long total, long publicCount, long official) {
        /** JSON: "public" (từ khoá Java nên trường đặt tên khác). */
        @com.fasterxml.jackson.annotation.JsonProperty("public")
        public long publicCount() { return publicCount; }
    }

    public record Extractions(long total, long done, long failed, long running) {}

    /**
     * Lộ trình theo trạng thái (spec §4.5): active = ACTIVE chưa chốt hoàn thành; completed = completed_at có giá trị (vẫn ACTIVE);
     * failed / draft theo status (PROCESSING là trạng thái thoáng qua, không đếm riêng nên tổng các mục có thể nhỏ hơn learningPaths);
     * remedial = source_type 'remedial' (đếm chéo, lộ trình bổ khuyết cũng nằm trong active / completed).
     */
    public record LearningPathBreakdown(long active, long completed, long failed, long remedial, long draft) {}

    public record DayPoint(LocalDate date, long newUsers, long extractions, long quizzes) {}
}
