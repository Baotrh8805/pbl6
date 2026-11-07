package com.pbl6.flashcard.dto.library;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Báo cáo bộ thẻ public. detail bắt buộc khi reason = OTHER (kiểm ở service). */
public record ReportRequest(@NotNull Reason reason, @Size(max = 500) String detail) {

    public enum Reason { WRONG_CONTENT, COPYRIGHT, OFFENSIVE, SPAM, OTHER }
}
