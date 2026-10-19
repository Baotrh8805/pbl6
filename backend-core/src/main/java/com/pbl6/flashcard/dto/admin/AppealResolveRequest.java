package com.pbl6.flashcard.dto.admin;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** UNLOCK mở khoá tài khoản qua đường khoá / mở khoá của AdminUserService (quy tắc bậc + audit USER_UNLOCK); NONE chỉ đóng. */
public record AppealResolveRequest(@NotNull Action action, @Size(max = 500) String note) {

    public enum Action { UNLOCK, NONE }
}
