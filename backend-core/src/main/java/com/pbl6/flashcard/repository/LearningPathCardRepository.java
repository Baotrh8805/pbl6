package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.LearningPathCard;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

@Repository
public interface LearningPathCardRepository extends JpaRepository<LearningPathCard, Long> {

    List<LearningPathCard> findByPathIdOrderBySeqAsc(UUID pathId);

    List<LearningPathCard> findByPathIdAndChapterIdOrderBySeqAsc(UUID pathId, UUID chapterId);

    List<LearningPathCard> findByPathIdAndScheduledDayOrderBySeqAsc(UUID pathId, int scheduledDay);

    long countByPathId(UUID pathId);

    /** Số thẻ còn trong lịch của một chương (thẻ bị xoá khỏi bộ đã mất dòng): cỡ đề kiểm tra chương = min(10, số này). */
    long countByPathIdAndChapterId(UUID pathId, UUID chapterId);

    /**
     * Xoá hàng loạt bằng 1 câu DELETE (derived deleteBy... nạp từng entity rồi xoá từng cái). flushAutomatically: insert / update
     * đang chờ trong cùng giao dịch được ghi xuống trước, nên không "sống sót" hay bị xoá bất ngờ. clearAutomatically: persistence
     * context bị XOÁ SẠCH sau câu lệnh — mọi entity đã nạp trước đó (LearningPathCard của chính lộ trình, cả LearningPath đang giữ)
     * thành detached; caller phải nạp lại hoặc save() lại thay vì sửa rồi chờ flush (Hibernate sẽ UPDATE dòng đã mất →
     * "Batch update returned unexpected row count").
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("DELETE FROM LearningPathCard c WHERE c.pathId = :pathId")
    int deleteByPathId(@Param("pathId") UUID pathId);

    /**
     * Một dòng lịch kèm tiến độ ôn của chính người dùng: learned = đã có bản ghi reviews (ít nhất một lần chấm); intervalDays / dueAt
     * = khoảng ôn và hạn ôn kế tiếp của bản ghi đó (null khi chưa học) — "đã thuộc" = intervalDays ≥ 21 tính ở service; position /
     * kind lấy từ flashcards để dựng fromPos/toPos và đếm từ vựng / ngữ pháp mà không cần truy vấn thứ hai.
     */
    interface CardRow {
        String getCardId();
        UUID getChapterId();
        int getSeq();
        int getScheduledDay();
        double getWeight();
        boolean getLearned();
        Integer getIntervalDays();
        Instant getDueAt();
        Integer getPosition();
        String getKind();
    }

    /**
     * Toàn bộ thẻ của lộ trình theo seq, kèm tiến độ ôn. Một truy vấn cho cả phiên học / tiến độ / thẻ nợ / thẻ đến hạn / dự báo /
     * cân lại lịch, thay vì tải reviews của từng thẻ. LEFT JOIN reviews không nhân dòng vì (user_id, card_id) là unique; JOIN
     * flashcards luôn khớp (FK CASCADE: thẻ bị xoá thì dòng lịch cũng mất). Thẻ nợ = scheduled_day < hôm nay AND NOT learned (lọc ở service).
     */
    @Query(value = """
            SELECT c.card_id AS "cardId", c.chapter_id AS "chapterId", c.seq AS "seq", c.scheduled_day AS "scheduledDay",
                   CAST(c.weight AS double precision) AS "weight",
                   (r.id IS NOT NULL) AS "learned", r.interval_days AS "intervalDays", r.due_at AS "dueAt",
                   f.position AS "position", f.kind AS "kind"
            FROM learning_path_cards c
            JOIN flashcards f ON f.id = c.card_id
            LEFT JOIN reviews r ON r.user_id = :uid AND r.card_id = c.card_id
            WHERE c.path_id = :pathId
            ORDER BY c.seq
            """, nativeQuery = true)
    List<CardRow> findRowsWithLearned(@Param("pathId") UUID pathId, @Param("uid") Long uid);

    /** Dòng lịch của nhiều lộ trình (danh sách / tổng quan): chỉ phần cần để đếm mới / nợ / tiến độ, không kèm hạn ôn hay vị trí. */
    interface PathCardRow {
        UUID getPathId();
        String getCardId();
        UUID getChapterId();
        int getSeq();
        int getScheduledDay();
        double getWeight();
        boolean getLearned();
        Integer getIntervalDays();
    }

    /** LP-7: thẻ của mọi lộ trình ACTIVE của người dùng trong một truy vấn; caller gom theo pathId (đã sắp path_id, seq). */
    @Query(value = """
            SELECT c.path_id AS "pathId", c.card_id AS "cardId", c.chapter_id AS "chapterId", c.seq AS "seq",
                   c.scheduled_day AS "scheduledDay", CAST(c.weight AS double precision) AS "weight",
                   (r.id IS NOT NULL) AS "learned", r.interval_days AS "intervalDays"
            FROM learning_path_cards c
            LEFT JOIN reviews r ON r.user_id = :uid AND r.card_id = c.card_id
            WHERE c.path_id IN (:pathIds)
            ORDER BY c.path_id, c.seq
            """, nativeQuery = true)
    List<PathCardRow> findRowsWithLearnedByPathIds(@Param("pathIds") Collection<UUID> pathIds, @Param("uid") Long uid);

    /** Số thẻ theo lộ trình. */
    interface PathCount {
        UUID getPathId();
        long getN();
    }

    /** Số thẻ của từng lộ trình có hạn ôn trước :until (= hết ngày đang xét theo múi giờ cấu hình), gom theo path_id. */
    @Query(value = """
            SELECT c.path_id AS "pathId", count(*) AS "n"
            FROM learning_path_cards c
            JOIN reviews r ON r.user_id = :uid AND r.card_id = c.card_id
            WHERE c.path_id IN (:pathIds) AND r.due_at < :until
            GROUP BY c.path_id
            """, nativeQuery = true)
    List<PathCount> countDueByPathIds(@Param("pathIds") Collection<UUID> pathIds, @Param("uid") Long uid,
                                      @Param("until") Instant until);

    /** Số thẻ theo ngày học: n = tổng, learned = đã có lần chấm (cho dự báo tải và đếm nợ theo ngày). */
    interface DayRow {
        int getScheduledDay();
        long getN();
        long getLearned();
    }

    @Query(value = """
            SELECT c.scheduled_day AS "scheduledDay", count(*) AS "n",
                   count(*) FILTER (WHERE EXISTS (SELECT 1 FROM reviews r WHERE r.user_id = :uid AND r.card_id = c.card_id)) AS "learned"
            FROM learning_path_cards c
            WHERE c.path_id = :pathId
            GROUP BY c.scheduled_day
            ORDER BY c.scheduled_day
            """, nativeQuery = true)
    List<DayRow> countByDay(@Param("pathId") UUID pathId, @Param("uid") Long uid);
}
