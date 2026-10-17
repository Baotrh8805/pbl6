package com.pbl6.flashcard.dto.admin;

import java.time.LocalDate;
import java.util.List;

/** GET /api/admin/stats (spec 5.1). */
public record AdminStatsResponse(Users users, Decks decks, long cards, Extractions extractions, long quizAttempts,
                                 long learningPaths, long openReports, List<DayPoint> series) {

    public record Users(long total, long new7d, long new30d, long locked, long premium, long active7d) {}

    public record Decks(long total, long publicCount, long official) {
        /** JSON: "public" (từ khoá Java nên trường đặt tên khác). */
        @com.fasterxml.jackson.annotation.JsonProperty("public")
        public long publicCount() { return publicCount; }
    }

    public record Extractions(long total, long done, long failed, long running) {}

    public record DayPoint(LocalDate date, long newUsers, long extractions, long quizzes) {}
}
