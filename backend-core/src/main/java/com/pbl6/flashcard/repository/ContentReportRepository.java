package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.ContentReport;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

public interface ContentReportRepository extends JpaRepository<ContentReport, Long> {

    long countByDeckIdAndStatus(String deckId, String status);

    long countByStatus(String status);

    /** deckId rỗng/null = mọi bộ thẻ. */
    @Query("SELECT r FROM ContentReport r WHERE r.status = :status AND (:deckId IS NULL OR r.deckId = :deckId) "
            + "ORDER BY r.createdAt DESC, r.id DESC")
    Page<ContentReport> search(@Param("status") String status, @Param("deckId") String deckId, Pageable pageable);

    /** Báo cáo của một người học (deckId / status null = không lọc), mới nhất trước. */
    @Query("SELECT r FROM ContentReport r WHERE r.reporterId = :uid AND (:deckId IS NULL OR r.deckId = :deckId) "
            + "AND (:status IS NULL OR r.status = :status) ORDER BY r.createdAt DESC, r.id DESC")
    Page<ContentReport> findMine(@Param("uid") Long uid, @Param("deckId") String deckId, @Param("status") String status,
                                 Pageable pageable);

    /** Người báo cáo rút lại báo cáo của chính mình khi còn OPEN: trả 0 = không phải của họ hoặc đã xử lý. */
    @Modifying(clearAutomatically = true)
    @Query("DELETE FROM ContentReport r WHERE r.id = :id AND r.reporterId = :uid AND r.status = 'OPEN'")
    int withdraw(@Param("id") Long id, @Param("uid") Long uid);

    /** Đóng báo cáo chỉ khi còn OPEN: trả 0 = đã có người xử lý trước. */
    @Modifying(clearAutomatically = true)
    @Query("UPDATE ContentReport r SET r.status = :status, r.action = :action, r.resolutionNote = :note, "
            + "r.resolvedBy = :by, r.resolvedAt = :at WHERE r.id = :id AND r.status = 'OPEN'")
    int close(@Param("id") Long id, @Param("status") String status, @Param("action") String action,
              @Param("note") String note, @Param("by") Long by, @Param("at") Instant at);

    interface DeckCount {
        String getDeckId();
        long getN();
    }

    /** Số báo cáo OPEN của từng bộ thẻ trong một trang. */
    @Query("SELECT r.deckId AS deckId, count(r) AS n FROM ContentReport r WHERE r.status = 'OPEN' AND r.deckId IN :ids GROUP BY r.deckId")
    List<DeckCount> countOpenByDeckIds(@Param("ids") Collection<String> ids);
}
