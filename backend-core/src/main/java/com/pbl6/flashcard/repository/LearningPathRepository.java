package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.LearningPath;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface LearningPathRepository extends JpaRepository<LearningPath, UUID> {

    Optional<LearningPath> findByIdAndUserId(UUID id, Long userId);

    List<LearningPath> findByUserIdOrderByCreatedAtDesc(Long userId);

    Optional<LearningPath> findByJobId(UUID jobId);

    /** Backend khởi động lại: worker trong RAM đã mất -> lộ trình đang xử lý coi như thất bại. */
    @Modifying
    @Query("UPDATE LearningPath p SET p.status = 'FAILED', p.errorMessage = :m WHERE p.status = 'PROCESSING'")
    int failProcessing(@Param("m") String m);
}
