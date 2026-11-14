package com.pbl6.flashcard.repository;

/** Bước dịch nghĩa tiếng Việt (G6, hợp đồng đợt 2 §8): total = số job đã gọi enrich, theo kết quả lần gọi gần nhất. */
public interface EnrichStatRow {
    long getTotal();
    long getEnriched();
    long getQuota();
    long getError();
}
