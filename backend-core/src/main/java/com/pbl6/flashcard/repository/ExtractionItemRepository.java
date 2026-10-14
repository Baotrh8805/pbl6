package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.ExtractionItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface ExtractionItemRepository extends JpaRepository<ExtractionItem, UUID> {

    List<ExtractionItem> findByJobIdOrderByPositionAsc(UUID jobId);

    void deleteByJobId(UUID jobId);
}
