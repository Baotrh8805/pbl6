package com.pbl6.flashcard.repository;

/** Kết quả native query GROUP BY ngày cho dashboard admin. */
public interface DayCount {
    java.sql.Date getDay();
    long getN();
}
