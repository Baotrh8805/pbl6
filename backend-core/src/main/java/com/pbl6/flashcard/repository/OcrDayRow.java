package com.pbl6.flashcard.repository;

/** Một ngày của chuỗi OCR (G6, hợp đồng đợt 2 §8): chỉ job nguồn ảnh / PDF scan đã kết thúc (DONE / FAILED). */
public interface OcrDayRow {
    java.sql.Date getDay();
    long getOcrJobs();
    long getFailed();
    long getLowConfidence();
    long getGeminiFallback();
}
