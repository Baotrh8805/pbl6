package com.pbl6.flashcard.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ProfileRequest(
        @NotBlank(message = "Họ tên không được để trống")
        @Size(max = RegisterRequest.MAX_NAME, message = "Họ tên tối đa " + RegisterRequest.MAX_NAME + " ký tự")
        String fullName
) {}
