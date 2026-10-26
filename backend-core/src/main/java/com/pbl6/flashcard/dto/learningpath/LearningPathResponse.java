package com.pbl6.flashcard.dto.learningpath;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Lộ trình học tập. Danh sách không kèm chapters/days/forecast; today + completion chỉ có khi ACTIVE; suggestedDays / overCap chỉ
 * ở GET /{id} của bản nháp; overflow chỉ có (= true) trên response của thao tác vừa xếp lịch mà không giữ được trần (kích hoạt,
 * PATCH đổi khung, cân lại). Mọi tên trường 1.0 giữ nguyên; trường 2.0 null bị bỏ (NON_NULL) để client 1.0 không vỡ.
 * quizPassPct: ngưỡng qua bài kiểm tra chương (app_settings learning_path_quiz_pass_pct) — chỉ ở GET /{id} của ACTIVE (đi cùng
 * chapters), để client hiện "Chưa đạt N% — Làm lại" cho chương đã làm quiz mà chưa qua (D4: chỉ gắn nhãn, không chặn).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record LearningPathResponse(UUID id, String title, String status, String sourceType, String sourceName,
                                   int totalDays, LocalDate startDate, Boolean chaptersDetected, UUID jobId,
                                   UUID folderId, Instant createdAt, Instant activatedAt, String errorMessage,
                                   JobSummary job, List<LearningPathChapterResponse> chapters, Today today,
                                   List<Day> days,
                                   int dailyCap, String studyDays, boolean reminder, boolean remindEmail, Instant completedAt,
                                   Instant lastRebalancedAt, Completion completion, Integer quizPassPct,
                                   List<Forecast> forecast,
                                   Integer suggestedDays, Boolean overCap, Boolean overflow) {

    /**
     * Tiến độ job bóc tách bên dưới (client poll khi PROCESSING). Spec 21/10: failureKind = "AI_OVERLOADED" khi FAILED vì AI quá
     * tải (không tính lượt, client ẩn "Chạy lại"); ocrDegraded = true khi có trang OCR giữ bản Tesseract vì Gemini quá tải
     * (client hiện cảnh báo + ô sửa văn bản gốc). Cả hai null khi không có để response cũ không đổi (NON_NULL ở lớp ngoài).
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record JobSummary(String status, String stage, String errorMessage, Map<String, Object> stats,
                             String failureKind, Boolean ocrDegraded) {}

    /**
     * Hôm nay của lộ trình theo ngày date (?date= của máy khách hoặc múi giờ cấu hình). state: before (chưa tới ngày học 1) |
     * during | rest (ngày nghỉ theo study_days; dayIndex = ngày học gần nhất trước đó) | after (qua ngày cuối). tasks giữ cho
     * client 1.0 (dải vị trí theo chương), nay tính từ thẻ xếp cho hôm nay và kèm cardIds; newCount = thẻ chưa học xếp đúng hôm
     * nay, dueCount = thẻ của lộ trình đến hạn ôn tới hết ngày, behindCount = thẻ chưa học xếp ở ngày đã qua (nợ).
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Today(LocalDate date, int dayIndex, String state, List<Task> tasks,
                        Integer newCount, Integer dueCount, Integer behindCount) {}

    /**
     * Việc của một ngày ở một chương. fromPos/toPos: vị trí thẻ trong bộ (đánh số từ 1; client 1.0 học dải này qua ?range=a-b);
     * ACTIVE 2.0: min/max flashcards.position của các thẻ xếp cho ngày đó (1..count khi thẻ không có position), count = số thẻ,
     * cardIds = đúng các thẻ — client 2.0 dùng cardIds, không cần dải nữa.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Task(UUID chapterId, String chapterTitle, String deckId, int fromPos, int toPos,
                       Integer count, List<String> cardIds) {}

    /** Một ngày học của lịch đầy đủ (chỉ GET /{id}); date tính theo study_days (ngày nghỉ không có dòng). */
    public record Day(int dayIndex, LocalDate date, List<Task> tasks) {}

    /**
     * Hai thước đo tiến độ (spec §1 mục 5): learned = thẻ đã có ít nhất một lần chấm, mastered = khoảng ôn ≥ 21 ngày; pct làm tròn
     * xuống nên 100 chỉ khi học hết; chaptersPassed = chương đã qua bài kiểm tra; chaptersTotal = chương đã qua hoặc có bài kiểm tra
     * tính được cho chương — không đếm chương "empty" (hết thẻ mà chưa qua) và chương mà bộ thẻ không ra đủ min(10, số thẻ) câu
     * nghĩa (vd. 1 thẻ, mọi thẻ cùng một nghĩa), để chaptersPassed tới được chaptersTotal; done =
     * đã chốt hoàn thành hoặc đã học 100 % thẻ (theo thẻ, không phụ thuộc số chương).
     */
    public record Completion(int total, int learned, int mastered, int learnedPct, int masteredPct,
                             int chaptersPassed, int chaptersTotal, boolean done) {}

    /** Một cột của biểu đồ khối lượng (§3.3): thẻ mới xếp cho ngày + lượt ôn dự báo / đến hạn thật; overCap khi load &gt; dailyCap. */
    public record Forecast(int dayIndex, LocalDate date, int newCount, double newWeight, double predictedReviews,
                           double load, boolean overCap) {}
}
