package com.pbl6.flashcard.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * POST /api/auth/register (hợp đồng API đợt 2 §3): trước đây là chuỗi trần, nay là JSON. needsVerification=true -> frontend
 * hiện màn "kiểm tra hộp thư" thay vì chuyển sang đăng nhập.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record RegisterResponse(String message, boolean needsVerification) {}
