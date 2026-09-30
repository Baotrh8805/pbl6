package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.QuizResult;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface QuizResultRepository extends JpaRepository<QuizResult, Long> {

    /** Kết quả kèm tên bộ thẻ: bộ thẻ Thư viện chưa lưu không nằm trong "Bộ thẻ của tôi" để client tra tên. */
    record View(String deckId, String deckTitle, int score, int total, Instant createdAt) {}

    @Query("SELECT new com.pbl6.flashcard.repository.QuizResultRepository$View(q.deckId, d.title, q.score, q.total, q.createdAt) "
            + "FROM QuizResult q, Deck d WHERE d.id = q.deckId AND q.userId = :uid ORDER BY q.createdAt DESC, q.id DESC")
    List<View> findRecent(@Param("uid") Long uid, Pageable page);

    long countByUserId(Long userId);
}
