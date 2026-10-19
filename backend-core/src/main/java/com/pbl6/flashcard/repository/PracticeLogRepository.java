package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.PracticeLog;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface PracticeLogRepository extends JpaRepository<PracticeLog, Long> {

    /** Số lượt và điểm trung bình của một loại luyện tập. */
    interface KindStat {
        String getKind();
        long getN();
        Double getAvg();
    }

    /** Gộp sẵn ở DB theo loại (idx_practice_logs_user_time): không nạp từng dòng nhật ký để tính trung bình. */
    @Query(value = """
            SELECT p.kind AS "kind", count(*) AS "n", CAST(avg(p.score) AS double precision) AS "avg"
            FROM practice_logs p
            WHERE p.user_id = :uid AND p.created_at >= :since
            GROUP BY p.kind
            """, nativeQuery = true)
    List<KindStat> statsByKind(@Param("uid") Long uid, @Param("since") Instant since);

    /** Lượt gần nhất trong cửa sổ; id phá hoà khi hai lượt cùng mốc thời gian để thứ tự ổn định. */
    @Query("SELECT p FROM PracticeLog p WHERE p.userId = :uid AND p.createdAt >= :since ORDER BY p.createdAt DESC, p.id DESC")
    List<PracticeLog> findRecent(@Param("uid") Long uid, @Param("since") Instant since, Pageable page);
}
