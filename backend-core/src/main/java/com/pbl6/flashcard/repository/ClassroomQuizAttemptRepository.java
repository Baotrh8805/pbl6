package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.ClassroomQuizAttempt;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ClassroomQuizAttemptRepository extends JpaRepository<ClassroomQuizAttempt, UUID> {
    Optional<ClassroomQuizAttempt> findFirstByQuizIdAndUserIdAndExpiresAtAfter(Long quizId, Long userId, Instant now);

    void deleteByQuizIdAndUserId(Long quizId, Long userId);

    void deleteByExpiresAtBefore(Instant now);
}
