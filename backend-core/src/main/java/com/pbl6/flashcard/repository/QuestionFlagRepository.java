package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.QuestionFlag;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface QuestionFlagRepository extends JpaRepository<QuestionFlag, Long> {

    long countByStatus(String status);

    List<QuestionFlag> findByQuestionIdOrderByCreatedAtDescIdDesc(UUID questionId);

    interface QuestionCount {
        UUID getQuestionId();
        long getN();
    }

    /** Số báo lỗi OPEN của từng câu trong một trang admin. */
    @Query("SELECT f.questionId AS questionId, count(f) AS n FROM QuestionFlag f "
            + "WHERE f.status = 'OPEN' AND f.questionId IN :ids GROUP BY f.questionId")
    List<QuestionCount> countOpenByQuestionIds(@Param("ids") Collection<UUID> ids);

    /** Đóng báo lỗi chỉ khi còn OPEN (một câu UPDATE): hai admin cùng xử lý thì người sau nhận 0 -> 409. */
    @Modifying(clearAutomatically = true)
    @Query("UPDATE QuestionFlag f SET f.status = 'RESOLVED', f.resolutionNote = :note, f.resolvedBy = :by, "
            + "f.resolvedAt = :at WHERE f.id = :id AND f.status = 'OPEN'")
    int resolve(@Param("id") Long id, @Param("note") String note, @Param("by") Long by, @Param("at") Instant at);
}
