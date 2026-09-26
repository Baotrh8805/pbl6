package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.QuizResult;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface QuizResultRepository extends JpaRepository<QuizResult, Long> {
    List<QuizResult> findTop10ByUserIdOrderByCreatedAtDesc(Long userId);

    long countByUserId(Long userId);
}
