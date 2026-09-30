package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.QuizAttempt;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface QuizAttemptRepository extends JpaRepository<QuizAttempt, UUID> {

    /** Khoá lượt làm khi nộp: 2 lần nộp song song không ghi 2 kết quả. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT a FROM QuizAttempt a WHERE a.id = :id")
    Optional<QuizAttempt> findForUpdate(@Param("id") UUID id);

    /** Lượt quá hạn chưa nộp của user (khoá để không chốt điểm 2 lần). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT a FROM QuizAttempt a WHERE a.userId = :uid AND a.submittedAt IS NULL AND a.expiresAt < :now")
    List<QuizAttempt> findExpiredOpen(@Param("uid") Long uid, @Param("now") Instant now);
}
