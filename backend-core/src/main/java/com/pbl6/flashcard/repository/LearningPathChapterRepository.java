package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.LearningPathChapter;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface LearningPathChapterRepository extends JpaRepository<LearningPathChapter, UUID> {

    List<LearningPathChapter> findByPathIdOrderByPositionAsc(UUID pathId);
}
