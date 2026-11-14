package com.pbl6.flashcard.service;

import com.pbl6.flashcard.model.LearningPath;
import com.pbl6.flashcard.model.LearningPathCard;
import com.pbl6.flashcard.model.LearningPathChapter;
import com.pbl6.flashcard.repository.LearningPathCardRepository;
import com.pbl6.flashcard.repository.LearningPathCardRepository.CardRow;
import com.pbl6.flashcard.repository.LearningPathCardRepository.DayRow;
import com.pbl6.flashcard.repository.LearningPathChapterRepository;
import com.pbl6.flashcard.repository.LearningPathRepository;
import com.pbl6.flashcard.repository.ReviewRepository;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * V20: lịch theo thẻ (learning_path_cards), cột mới của lộ trình / chương, review_logs.reaction_ms + path_id.
 * Các @Modifying cần giao dịch ghi nên gói trong TransactionTemplate (repo gọi trần chạy ở giao dịch read-only).
 */
class LearningPathCardRepositoryIT extends IntegrationTest {

    @Autowired LearningPathRepository paths;
    @Autowired LearningPathChapterRepository chapters;
    @Autowired LearningPathCardRepository cards;
    @Autowired ReviewRepository reviews;
    @Autowired JdbcTemplate jdbc;
    @Autowired TransactionTemplate tx;

    private LearningPath path(Long uid) {
        LearningPath p = new LearningPath();
        p.setId(UUID.randomUUID());
        p.setUserId(uid);
        p.setTitle("LP2");
        p.setSourceType("remedial"); // giá trị mới của CHECK source_type (V20)
        p.setStatus(LearningPath.ACTIVE);
        p.setTotalDays(7);
        p.setStartDate(LocalDate.now());
        p.setCreatedAt(Instant.now());
        p.setDailyCap(40);
        p.setStudyDays("1111100");
        p.setReminder(false);
        return paths.save(p);
    }

    private LearningPathChapter chapter(LearningPath p) {
        LearningPathChapter ch = new LearningPathChapter();
        ch.setId(UUID.randomUUID());
        ch.setPathId(p.getId());
        ch.setPosition(1);
        ch.setTitle("Bài 1");
        ch.setQuizBestPct(90);
        ch.setQuizPassedAt(Instant.now());
        return chapters.save(ch);
    }

    private void card(LearningPath p, LearningPathChapter ch, String cardId, int seq, int day, double weight) {
        LearningPathCard c = new LearningPathCard();
        c.setPathId(p.getId());
        c.setChapterId(ch.getId());
        c.setCardId(cardId);
        c.setSeq(seq);
        c.setScheduledDay(day);
        c.setWeight(weight);
        cards.save(c);
    }

    @Test
    void rows_carry_learned_flag_counts_group_by_day_and_cascade_follows_cards() throws Exception {
        String email = newEmail();
        newUser(email);
        Long uid = userId(email);
        String deck = "lp2-" + UUID.randomUUID();
        jdbc.update("INSERT INTO decks (id, title, level, owner_id) VALUES (?, 'LP2', 'N5', ?)", deck, uid);
        String c1 = deck + "-1", c2 = deck + "-2", c3 = deck + "-3";
        int pos = 1;
        for (String c : List.of(c1, c2, c3)) {
            jdbc.update("INSERT INTO flashcards (id, deck_id, term, meaning, position) VALUES (?, ?, '水', 'nước', ?)", c, deck, pos++);
        }

        LearningPath p = path(uid);
        LearningPathChapter ch = chapter(p);
        card(p, ch, c1, 1, 1, 1.0);
        card(p, ch, c2, 2, 1, 1.5);
        card(p, ch, c3, 3, 2, 1.2);

        // Cột mới của lộ trình / chương đi vòng qua DB nguyên vẹn
        LearningPath saved = paths.findById(p.getId()).orElseThrow();
        assertEquals(40, saved.getDailyCap());
        assertEquals("1111100", saved.getStudyDays());
        assertFalse(saved.isReminder());
        assertNull(saved.getCompletedAt());
        assertEquals(90, chapters.findById(ch.getId()).orElseThrow().getQuizBestPct());

        // Chấm c2: có dòng reviews; log có / không có reaction_ms + path_id (client cũ gửi null)
        tx.executeWithoutResult(s -> {
            reviews.insertIfAbsent(uid, c2, 1, 1, 2.5, Instant.now());
            reviews.log(uid, c2, "good", "flip", 1234, p.getId());
            reviews.log(uid, c2, "good", "flip", null, null);
            reviews.log(uid, c2, "good", "flip");
        });

        List<CardRow> rows = cards.findRowsWithLearned(p.getId(), uid);
        assertEquals(List.of(c1, c2, c3), rows.stream().map(CardRow::getCardId).toList());
        assertEquals(List.of(false, true, false), rows.stream().map(CardRow::getLearned).toList());
        assertEquals(1.5, rows.get(1).getWeight(), 1e-9);
        assertEquals(ch.getId(), rows.get(1).getChapterId());
        assertEquals(3, rows.get(2).getSeq());
        assertEquals(2, rows.get(2).getScheduledDay());

        List<DayRow> days = cards.countByDay(p.getId(), uid);
        assertEquals(2, days.size());
        assertEquals(1, days.get(0).getScheduledDay());
        assertEquals(2, days.get(0).getN());
        assertEquals(1, days.get(0).getLearned());
        assertEquals(2, days.get(1).getScheduledDay());
        assertEquals(1, days.get(1).getN());
        assertEquals(0, days.get(1).getLearned());

        assertEquals(Integer.valueOf(1234), jdbc.queryForObject(
                "SELECT reaction_ms FROM review_logs WHERE user_id = ? AND path_id = ?", Integer.class, uid, p.getId()));
        assertEquals(Integer.valueOf(3), jdbc.queryForObject(
                "SELECT count(*) FROM review_logs WHERE user_id = ? AND card_id = ?", Integer.class, uid, c2));
        assertEquals(3, cards.countByPathId(p.getId()));
        assertEquals(3, cards.findByPathIdAndChapterIdOrderBySeqAsc(p.getId(), ch.getId()).size());
        assertEquals(List.of(c1, c2), cards.findByPathIdAndScheduledDayOrderBySeqAsc(p.getId(), 1)
                .stream().map(LearningPathCard::getCardId).toList());

        // LP-5: xoá thẻ trong bộ -> dòng lịch mất theo CASCADE, các thẻ còn lại giữ nguyên seq / ngày
        jdbc.update("DELETE FROM flashcards WHERE id = ?", c3);
        assertEquals(List.of(c1, c2), cards.findByPathIdOrderBySeqAsc(p.getId()).stream().map(LearningPathCard::getCardId).toList());

        // Xoá lộ trình -> lịch mất (CASCADE), review_logs.path_id về NULL nhưng log còn (SET NULL)
        tx.executeWithoutResult(s -> assertEquals(2, cards.deleteByPathId(p.getId())));
        assertEquals(0, cards.countByPathId(p.getId()));
        paths.deleteById(p.getId());
        assertEquals(Integer.valueOf(3), jdbc.queryForObject(
                "SELECT count(*) FROM review_logs WHERE user_id = ? AND card_id = ? AND path_id IS NULL", Integer.class, uid, c2));
    }
}
