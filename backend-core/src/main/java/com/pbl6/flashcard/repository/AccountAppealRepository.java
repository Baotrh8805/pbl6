package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.AccountAppeal;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;

public interface AccountAppealRepository extends JpaRepository<AccountAppeal, Long> {

    long countByStatus(String status);

    @Query("SELECT a FROM AccountAppeal a WHERE a.status = :status ORDER BY a.createdAt DESC, a.id DESC")
    Page<AccountAppeal> search(@Param("status") String status, Pageable pageable);

    /** Đóng khiếu nại chỉ khi còn OPEN: trả 0 = đã có người xử lý trước (hai admin cùng bấm -> người sau 409). */
    @Modifying(clearAutomatically = true)
    @Query("UPDATE AccountAppeal a SET a.status = :status, a.action = :action, a.resolutionNote = :note, "
            + "a.resolvedBy = :by, a.resolvedAt = :at WHERE a.id = :id AND a.status = 'OPEN'")
    int close(@Param("id") Long id, @Param("status") String status, @Param("action") String action,
              @Param("note") String note, @Param("by") Long by, @Param("at") Instant at);
}
