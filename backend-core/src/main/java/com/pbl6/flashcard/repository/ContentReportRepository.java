package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.ContentReport;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface ContentReportRepository extends JpaRepository<ContentReport, Long> {

    long countByDeckIdAndStatus(String deckId, String status);

    long countByStatus(String status);

    interface DeckCount {
        String getDeckId();
        long getN();
    }

    /** Số báo cáo OPEN của từng bộ thẻ trong một trang. */
    @Query("SELECT r.deckId AS deckId, count(r) AS n FROM ContentReport r WHERE r.status = 'OPEN' AND r.deckId IN :ids GROUP BY r.deckId")
    List<DeckCount> countOpenByDeckIds(@Param("ids") Collection<String> ids);
}
