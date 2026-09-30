package com.pbl6.flashcard.dto.folder;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Mời người dùng xem thư mục theo email (quyền duy nhất: xem & học). */
public record FolderShareRequest(
        @NotBlank(message = "Email không được để trống")
        @Email(message = "Email không đúng định dạng")
        @Size(max = 255)
        String email
) {}
