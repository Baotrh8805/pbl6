package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.AdminAuditLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;

public interface AdminAuditLogRepository extends JpaRepository<AdminAuditLog, Long> {

    /** Tham số null = không lọc. */
    @Query("SELECT l FROM AdminAuditLog l WHERE (:actorId IS NULL OR l.actorId = :actorId) "
            + "AND (:targetType IS NULL OR l.targetType = :targetType) "
            + "AND (CAST(:from AS timestamp) IS NULL OR l.createdAt >= :from) "
            + "AND (CAST(:to AS timestamp) IS NULL OR l.createdAt < :to) "
            + "ORDER BY l.createdAt DESC, l.id DESC")
    Page<AdminAuditLog> search(@Param("actorId") Long actorId, @Param("targetType") String targetType,
                               @Param("from") Instant from, @Param("to") Instant to, Pageable pageable);
}
