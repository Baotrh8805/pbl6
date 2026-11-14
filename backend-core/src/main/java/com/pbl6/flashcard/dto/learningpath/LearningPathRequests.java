package com.pbl6.flashcard.dto.learningpath;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/** Body JSON của các endpoint sửa / kích hoạt / cân lại lộ trình học tập. Trường null = không đổi. */
public final class LearningPathRequests {

    private LearningPathRequests() {}

    /** Mask 7 ký tự 0/1 cho T2..CN; "0000000" bị chặn ở service (regex không diễn tả được "ít nhất một ngày"). */
    public static final String STUDY_DAYS = "[01]{7}";

    /**
     * dailyCap 5–200 (trần tải/ngày), studyDays mask T2..CN, reminder bật/tắt nhắc học (V20), remindEmail nhắc thêm qua email (V34). Ở lộ trình ACTIVE, đổi totalDays /
     * startDate / studyDays / dailyCap xếp lại thẻ CHƯA học từ hôm nay (thẻ đã học giữ ngày).
     */
    public record Patch(@Size(max = 100) String title, @Min(1) @Max(365) Integer totalDays, LocalDate startDate,
                        @Min(5) @Max(200) Integer dailyCap, @Pattern(regexp = STUDY_DAYS) String studyDays,
                        Boolean reminder, Boolean remindEmail) {}

    public record ChapterPatch(@NotBlank @Size(max = 100) String title) {}

    /** PUT /{id}/text (spec 21/10): văn bản gốc đã sửa, phân tích lại từ đầu (không tốn lượt). Cùng giới hạn với bóc tách. */
    public record TextBody(@NotBlank @Size(max = 50_000) String text) {}

    public record Activate(LocalDate startDate, @Min(1) @Max(365) Integer totalDays,
                           @Min(5) @Max(200) Integer dailyCap, @Pattern(regexp = STUDY_DAYS) String studyDays) {}

    /** extend=false: chia thẻ nợ + chưa tới ngày vào các ngày còn lại; true: giữ nhịp cũ, kéo dài lộ trình. */
    public record Rebalance(boolean extend) {}

    /**
     * POST /remedial (spec §3.8): lộ trình bổ khuyết từ thẻ yếu — days 3..30 (gợi ý ở GET /api/insights/weaknesses.suggestedDays),
     * groupBy cách gom thẻ thành chương: level (cấp JLPT) | kind (từ vựng / ngữ pháp) | kanji (chữ Hán đầu của term) | deck (bộ
     * thẻ gốc); title tuỳ chọn, mặc định "Bổ khuyết dd/MM/yyyy".
     */
    public record Remedial(@NotNull @Min(3) @Max(30) Integer days,
                           @NotBlank @Pattern(regexp = "level|kind|kanji|deck") String groupBy,
                           @Size(max = 100) String title) {}
}
