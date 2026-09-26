package com.pbl6.flashcard.dto.deck;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Chia sẻ (hoặc đổi quyền) bộ thẻ cho người dùng theo email. */
public record ShareRequest(
        @NotBlank @Email @Size(max = 255) String email,
        @NotBlank @Pattern(regexp = "VIEWER|EDITOR") String permission
) {}
