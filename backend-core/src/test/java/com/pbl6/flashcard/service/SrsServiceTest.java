package com.pbl6.flashcard.service;

import com.pbl6.flashcard.model.Review;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static org.junit.jupiter.api.Assertions.*;

/** Lịch ôn là logic không tầm thường và là nguồn sự thật -> kiểm bằng JUnit sẵn có (mvn test). */
class SrsServiceTest {

    private static final Instant NOW = Instant.parse("2025-01-01T00:00:00Z");

    @Test
    void lichOnTapDungTheoTungMucDo() {
        Review card = SrsService.newReview(1L, "n5-1", NOW);
        assertEquals(NOW, card.getDueAt(), "Thẻ mới đến hạn ngay");

        SrsService.schedule(card, "good", NOW);
        assertEquals(1, card.getIntervalDays(), "Lần đầu 'Tốt' = 1 ngày");
        assertEquals(NOW.plus(1, ChronoUnit.DAYS), card.getDueAt(), "dueAt = now + interval");

        SrsService.schedule(card, "good", NOW);
        assertEquals(3, card.getIntervalDays(), "1 ngày * ease 2.5 -> 3 ngày");
        assertEquals(2, card.getReps());

        double easeTruoc = card.getEase();
        SrsService.schedule(card, "again", NOW);
        assertEquals(1, card.getIntervalDays(), "'Lại' giữ 30% khoảng ôn (3 -> 1), tối thiểu 1 ngày");
        assertEquals(2, card.getReps(), "'Lại' không xoá chuỗi ôn");
        assertTrue(card.getEase() < easeTruoc, "'Lại' hạ ease");
        assertTrue(card.getDueAt().isAfter(NOW), "'Lại' hẹn lại, không để dueAt ở quá khứ");

        card.setIntervalDays(100);
        SrsService.schedule(card, "again", NOW);
        assertEquals(30, card.getIntervalDays(), "Thẻ đã vững quên một lần vẫn giữ 30% khoảng ôn");

        for (int i = 0; i < 20; i++) SrsService.schedule(card, "again", NOW);
        assertEquals(SrsService.MIN_EASE, card.getEase(), 1e-9, "ease có sàn 1.3");
    }

    @Test
    void easeKetOSanTuHoiPhucKhiOnTot() {
        Review card = SrsService.newReview(1L, "n5-1", NOW);
        card.setEase(SrsService.MIN_EASE);
        card.setIntervalDays(10);
        for (int i = 0; i < 10; i++) SrsService.schedule(card, "good", NOW);
        assertTrue(card.getEase() > 2.0, "Mean reversion: ôn 'Tốt' liên tục kéo ease khỏi sàn 1.3");
    }

    @Test
    void chiChapNhanGradeHopLe() {
        assertTrue(SrsService.isValidGrade("good"));
        assertFalse(SrsService.isValidGrade("perfect"));
        assertFalse(SrsService.isValidGrade(null));
    }
}
