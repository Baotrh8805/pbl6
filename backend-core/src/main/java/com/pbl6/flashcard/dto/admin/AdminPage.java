package com.pbl6.flashcard.dto.admin;

import org.springframework.data.domain.Page;

import java.util.List;

/** Trang kết quả dùng chung cho mọi danh sách của Admin Panel. */
public record AdminPage<T>(List<T> items, long total, int page, int size) {

    public static <T> AdminPage<T> of(Page<T> p) {
        return new AdminPage<>(p.getContent(), p.getTotalElements(), p.getNumber(), p.getSize());
    }

    /** Khi đã map nội dung sang DTO khác nhưng vẫn giữ tổng / trang của truy vấn gốc. */
    public static <T> AdminPage<T> of(Page<?> p, List<T> items) {
        return new AdminPage<>(items, p.getTotalElements(), p.getNumber(), p.getSize());
    }
}
