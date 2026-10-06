package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.Review;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface ReviewRepository extends JpaRepository<Review, Long> {
    List<Review> findByUserId(Long userId);

    /** Tạo bản ghi ôn nếu chưa có. ON CONFLICT: 2 lần chấm song song không vỡ unique (user_id, card_id). */
    @Modifying
    @Query(value = "INSERT INTO reviews (user_id, card_id, reps, interval_days, ease, due_at) "
            + "VALUES (:uid, :cardId, :reps, :intervalDays, :ease, :dueAt) ON CONFLICT (user_id, card_id) DO NOTHING",
            nativeQuery = true)
    void insertIfAbsent(@Param("uid") Long uid, @Param("cardId") String cardId, @Param("reps") int reps,
                        @Param("intervalDays") int intervalDays, @Param("ease") double ease, @Param("dueAt") Instant dueAt);

    @Modifying
    @Query(value = "INSERT INTO review_logs (user_id, card_id, grade, source) VALUES (:uid, :cardId, :grade, :source)",
            nativeQuery = true)
    void log(@Param("uid") Long uid, @Param("cardId") String cardId, @Param("grade") String grade,
             @Param("source") String source);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM Review r WHERE r.userId = :uid AND r.cardId = :cardId")
    Optional<Review> findForUpdate(@Param("uid") Long uid, @Param("cardId") String cardId);

    /** Xoá hàng loạt bằng 1 câu DELETE (derived deleteBy... nạp từng entity rồi xoá từng cái). */
    @Modifying
    @Query("DELETE FROM Review r WHERE r.cardId IN :cardIds")
    void deleteByCardIdIn(@Param("cardIds") List<String> cardIds);
}
