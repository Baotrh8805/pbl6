package com.pbl6.flashcard.dto.library;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** comment tuỳ chọn; để trống/khoảng trắng = không có bình luận (gửi lại sẽ xoá bình luận cũ). */
public record RatingRequest(@NotNull @Min(1) @Max(5) Integer stars, @Size(max = 500) String comment) {}
