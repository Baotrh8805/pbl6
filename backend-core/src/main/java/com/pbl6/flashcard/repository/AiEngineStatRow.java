package com.pbl6.flashcard.repository;

/**
 * Một dòng thống kê engine đọc văn bản (G6, hợp đồng đợt 2 §8) từ native query GROUP BY engine. Alias trong câu SQL đặt trong
 * dấu nháy kép để Postgres giữ chữ hoa (lowConfidence...) khớp tên getter. avg* = null khi nhóm không có mẫu.
 */
public interface AiEngineStatRow {
    String getEngine();
    long getTotal();
    long getFailed();
    long getLowConfidence();
    Double getAvgConfidence();
    Double getAvgSeconds();
}
