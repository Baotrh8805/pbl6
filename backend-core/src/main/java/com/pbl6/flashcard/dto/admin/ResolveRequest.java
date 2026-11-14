package com.pbl6.flashcard.dto.admin;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** ratingId bắt buộc khi action = CLEAR_COMMENT và phải thuộc bộ thẻ bị báo cáo (kiểm ở service). */
public record ResolveRequest(@NotNull Action action, @Size(max = 500) String note, Long ratingId) {

    public enum Action { NONE, UNPUBLISH_DECK, CLEAR_COMMENT }
}
