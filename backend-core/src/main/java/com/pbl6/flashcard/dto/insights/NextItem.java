package com.pbl6.flashcard.dto.insights;

/**
 * Một gợi ý của GET /api/insights/next (F3, spec §3.9), đã sắp theo ưu tiên: path_today (phiên hôm nay của lộ trình) → due (thẻ
 * đến hạn ngoài các lộ trình đang có phiên hôm nay, trong bộ còn xem được) → catchup (thẻ nợ của lộ trình) → remedial (đủ thẻ
 * yếu để bổ khuyết) → next_chapter (chương kế chưa mở của lộ trình mới nhất) → library (bộ Thư viện cùng cấp chưa có, chưa học,
 * tối đa 3). count = số thẻ; to = đường dẫn ở frontend.
 */
public record NextItem(String kind, String title, int count, String to) {}
