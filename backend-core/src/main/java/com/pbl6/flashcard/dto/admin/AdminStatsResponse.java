package com.pbl6.flashcard.dto.admin;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.LocalDate;
import java.util.List;

/**
 * GET /api/admin/stats (spec 5.1). learningPaths (tổng) giữ kiểu long cho client cũ; learningPathBreakdown là phần thêm của 2.0.
 * Đợt 2 (hợp đồng §1.3, §4, §6, §8): openQuestionFlags, pendingMnemonics, openAppeals (hàng đợi kiểm duyệt), ai (hiệu suất engine
 * đọc văn bản + bước dịch nghĩa trong cửa sổ {@code days}) và ocrSeries (đủ {@code days} phần tử như series). Cờ thành phần
 * ai-service (health.engines) nằm ở GET /api/admin/health để thống kê không phải chờ ai-service.
 */
public record AdminStatsResponse(Users users, Decks decks, long cards, Extractions extractions, long quizAttempts,
                                 long learningPaths, long openReports, List<DayPoint> series,
                                 @JsonInclude(JsonInclude.Include.NON_NULL) LearningPathBreakdown learningPathBreakdown,
                                 long openQuestionFlags, long pendingMnemonics, long openAppeals,
                                 Ai ai, List<OcrPoint> ocrSeries,
                                 /* Từ điển (V32): báo cáo từ điển đang mở (badge) + số liệu kho nghĩa Việt */
                                 long openDictReports, com.pbl6.flashcard.dto.dictionary.DictDtos.DictStats dict) {

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

    /** G6: engines xếp theo số lượt giảm dần; enrich luôn có (0 khi chưa có lượt dịch nào). */
    public record Ai(List<EngineStat> engines, Enrich enrich) {}

    /**
     * Một engine bước TEXT (tesseract | gemini | pdf-text | docx | text | pdf…): job DONE/FAILED trong cửa sổ. avgConfidence 0..1
     * (meanConfidence của OCR), avgSeconds = thời gian xử lý TB của job DONE; cả hai null khi không có mẫu.
     */
    public record EngineStat(String engine, long total, long failed, long lowConfidence, Double avgConfidence, Double avgSeconds) {}

    /** Bước dịch nghĩa VI: total = số job đã gọi dịch; enriched = thành công; quota / error = hỏng theo lý do (phần còn lại: thiếu khoá API). */
    public record Enrich(long total, long enriched, long quota, long error) {}

    /** Một ngày OCR (ảnh / PDF scan đã kết thúc). errorRate = failed / ocrJobs (0..1), null khi ngày đó không có lượt OCR. */
    public record OcrPoint(LocalDate date, long ocrJobs, long failed, long lowConfidence, long geminiFallback, Double errorRate) {}
}
