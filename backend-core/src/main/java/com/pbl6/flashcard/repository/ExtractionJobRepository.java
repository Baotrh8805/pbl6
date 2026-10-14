package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.ExtractionJob;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ExtractionJobRepository extends JpaRepository<ExtractionJob, UUID> {

    Optional<ExtractionJob> findByIdAndUserId(UUID id, Long userId);

    List<ExtractionJob> findTop50ByUserIdOrderByCreatedAtDesc(Long userId);

    List<ExtractionJob> findTop50ByUserIdAndPurposeOrderByCreatedAtDesc(Long userId, String purpose);

    /** Giới hạn lượt bóc tách mỗi ngày: đếm theo DB để bền qua restart. */
    long countByUserIdAndCreatedAtAfter(Long userId, Instant since);

    /** Backend khởi động lại: worker trong RAM đã mất -> mọi job dở dang coi như thất bại. */
    @Modifying
    @Query("UPDATE ExtractionJob j SET j.status = 'FAILED', j.errorMessage = :message, j.finishedAt = :now "
            + "WHERE j.status IN ('QUEUED', 'RUNNING')")
    int failUnfinished(@Param("message") String message, @Param("now") Instant now);
}
