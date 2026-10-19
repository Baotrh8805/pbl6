package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.Review;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ReviewRepository extends JpaRepository<Review, Long> {
    List<Review> findByUserId(Long userId);

    /** Tạo bản ghi ôn nếu chưa có. ON CONFLICT: 2 lần chấm song song không vỡ unique (user_id, card_id). */
    @Modifying
    @Query(value = "INSERT INTO reviews (user_id, card_id, reps, interval_days, ease, due_at) "
            + "VALUES (:uid, :cardId, :reps, :intervalDays, :ease, :dueAt) ON CONFLICT (user_id, card_id) DO NOTHING",
            nativeQuery = true)
    void insertIfAbsent(@Param("uid") Long uid, @Param("cardId") String cardId, @Param("reps") int reps,
                        @Param("intervalDays") int intervalDays, @Param("ease") double ease, @Param("dueAt") Instant dueAt);

    @Modifying
    @Query(value = "INSERT INTO review_logs (user_id, card_id, grade, source) VALUES (:uid, :cardId, :grade, :source)",
            nativeQuery = true)
    void log(@Param("uid") Long uid, @Param("cardId") String cardId, @Param("grade") String grade,
             @Param("source") String source);

    /**
     * Như {@link #log(Long, String, String, String)} nhưng ghi thêm thời gian phản xạ (ms, 0–600000) và lộ trình (V20);
     * hai cột này được phép null (client cũ, ôn ngoài lộ trình). Spring Data gắn kiểu cho tham số null nên Postgres không
     * nhận nhầm bytea.
     */
    @Modifying
    @Query(value = "INSERT INTO review_logs (user_id, card_id, grade, source, reaction_ms, path_id) "
            + "VALUES (:uid, :cardId, :grade, :source, :reactionMs, :pathId)", nativeQuery = true)
    void log(@Param("uid") Long uid, @Param("cardId") String cardId, @Param("grade") String grade,
             @Param("source") String source, @Param("reactionMs") Integer reactionMs, @Param("pathId") UUID pathId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM Review r WHERE r.userId = :uid AND r.cardId = :cardId")
    Optional<Review> findForUpdate(@Param("uid") Long uid, @Param("cardId") String cardId);

    /** Xoá hàng loạt bằng 1 câu DELETE (derived deleteBy... nạp từng entity rồi xoá từng cái). */
    @Modifying
    @Query("DELETE FROM Review r WHERE r.cardId IN :cardIds")
    void deleteByCardIdIn(@Param("cardIds") List<String> cardIds);

    // ---------- Điểm yếu & ma sát trí nhớ (InsightService, spec §3.7): mỗi tín hiệu một truy vấn, gộp ở Java ----------

    /** Bản ghi SRS của một số thẻ (ease / khoảng ôn của các thẻ đã lọt vào danh sách điểm yếu). */
    List<Review> findByUserIdAndCardIdIn(Long userId, Collection<String> cardIds);

    /** "Hay quên" theo ease: thẻ có ease dưới ngưỡng (1.8) — SM-2 hạ ease 0.2 mỗi lần "again", sàn 1.3. */
    List<Review> findByUserIdAndEaseLessThan(Long userId, double ease);

    /** Số lần theo thẻ. */
    interface CardCount {
        String getCardId();
        long getN();
    }

    /** Số lần chấm "again" từng thẻ kể từ :since (cửa sổ 14 ngày của "hay quên"); thẻ không có lần nào không có dòng. */
    @Query(value = """
            SELECT l.card_id AS "cardId", count(*) AS "n"
            FROM review_logs l
            WHERE l.user_id = :uid AND l.grade = 'again' AND l.reviewed_at >= :since
            GROUP BY l.card_id
            """, nativeQuery = true)
    List<CardCount> countAgainByCard(@Param("uid") Long uid, @Param("since") Instant since);

    /** Trung vị thời gian phản xạ của một thẻ. */
    interface ReactionRow {
        String getCardId();
        long getSamples();
        Double getMedianMs();
    }

    /**
     * Trung vị reaction_ms từng thẻ (percentile_cont ở DB, không nạp từng log) trên các lượt có đo kể từ :since, chỉ thẻ đủ
     * :minSamples mẫu — ít mẫu hơn thì một lần lơ đãng đã thành "ma sát".
     */
    @Query(value = """
            SELECT l.card_id AS "cardId", count(*) AS "samples",
                   CAST(percentile_cont(0.5) WITHIN GROUP (ORDER BY l.reaction_ms) AS double precision) AS "medianMs"
            FROM review_logs l
            WHERE l.user_id = :uid AND l.reaction_ms IS NOT NULL AND l.reviewed_at >= :since
            GROUP BY l.card_id
            HAVING count(*) >= :minSamples
            """, nativeQuery = true)
    List<ReactionRow> medianReactionByCard(@Param("uid") Long uid, @Param("since") Instant since,
                                           @Param("minSamples") int minSamples);

    /** Trung vị reaction_ms của chính người dùng trên mọi lượt có đo kể từ :since; null khi chưa đo lần nào. */
    @Query(value = """
            SELECT CAST(percentile_cont(0.5) WITHIN GROUP (ORDER BY l.reaction_ms) AS double precision)
            FROM review_logs l
            WHERE l.user_id = :uid AND l.reaction_ms IS NOT NULL AND l.reviewed_at >= :since
            """, nativeQuery = true)
    Double personalMedianReactionMs(@Param("uid") Long uid, @Param("since") Instant since);

    /** Số thẻ theo bộ. */
    interface DeckCount {
        String getDeckId();
        long getN();
    }

    /**
     * "Học gì tiếp" (§3.9 mục 2): số thẻ đến hạn trước :until theo bộ thẻ, TRỪ thẻ nằm trong lịch của các lộ trình :pathIds — lộ
     * trình mà phiên hôm nay đã được gợi ý riêng (ACTIVE, chưa chốt hoàn thành, đã tới ngày học 1; InsightService truyền vào), để
     * một thẻ không bị đếm hai lần. Thẻ của lộ trình đã chốt hoàn thành / chưa bắt đầu vẫn đếm ở đây, nếu không chúng biến mất
     * khỏi mọi gợi ý. Gom theo bộ để caller lọc quyền xem ({@link com.pbl6.flashcard.service.DeckService#canView}) một lần mỗi bộ:
     * bộ bị thu hồi chia sẻ còn để lại dòng reviews mà người dùng không ôn được nữa. JOIN flashcards bỏ luôn dòng mồ côi.
     * :pathIds không được rỗng (IN () là lỗi cú pháp) — caller truyền một id không tồn tại khi không có lộ trình nào.
     */
    @Query(value = """
            SELECT f.deck_id AS "deckId", count(*) AS "n"
            FROM reviews r JOIN flashcards f ON f.id = r.card_id
            WHERE r.user_id = :uid AND r.due_at < :until
              AND NOT EXISTS (SELECT 1 FROM learning_path_cards c
                              WHERE c.card_id = r.card_id AND c.path_id IN (:pathIds))
            GROUP BY f.deck_id
            """, nativeQuery = true)
    List<DeckCount> countDueByDeckOutsidePaths(@Param("uid") Long uid, @Param("until") Instant until,
                                               @Param("pathIds") Collection<UUID> pathIds);

    /**
     * Bộ thẻ (trong :deckIds) mà người dùng đã từng ôn ít nhất một thẻ — "Học gì tiếp" không gợi ý bộ Thư viện đã học trực tiếp
     * (học bộ public không cần lưu bản sao). :deckIds không rỗng.
     */
    @Query(value = """
            SELECT DISTINCT f.deck_id FROM reviews r JOIN flashcards f ON f.id = r.card_id
            WHERE r.user_id = :uid AND f.deck_id IN (:deckIds)
            """, nativeQuery = true)
    List<String> findStudiedDeckIds(@Param("uid") Long uid, @Param("deckIds") Collection<String> deckIds);

    // ---------- Dashboard cá nhân (A5, hợp đồng đợt 2 §7): gộp theo ngày ở DB theo múi giờ của người dùng ----------
    // :zone là tên múi giờ Postgres hiểu (ReviewActivityService#sqlZone đã đổi offset cố định sang quy ước POSIX). GROUP BY theo
    // vị trí cột: mỗi lần :zone xuất hiện là một tham số riêng nên Postgres không nhận ra biểu thức SELECT và GROUP BY là một.

    /** Số lượt ôn và số bài quiz của một ngày (theo tz). */
    interface ActivityDay {
        java.sql.Date getDay();
        long getReviews();
        long getQuizzes();
    }

    /**
     * Lượt ôn (review_logs, mọi nguồn) và bài quiz đã nộp (quiz_results) theo ngày kể từ :since; chỉ ngày có hoạt động. Cả hai
     * nhánh đi theo index (user_id, thời điểm): idx_review_logs_user_time (V11) và idx_quiz_results_user_time (V23).
     */
    @Query(value = """
            SELECT x.day AS "day", CAST(sum(x.reviews) AS bigint) AS "reviews", CAST(sum(x.quizzes) AS bigint) AS "quizzes"
            FROM (
                SELECT CAST(l.reviewed_at AT TIME ZONE :zone AS date) AS day, count(*) AS reviews, 0 AS quizzes
                FROM review_logs l
                WHERE l.user_id = :uid AND l.reviewed_at >= :since
                GROUP BY 1
                UNION ALL
                SELECT CAST(q.created_at AT TIME ZONE :zone AS date) AS day, 0 AS reviews, count(*) AS quizzes
                FROM quiz_results q
                WHERE q.user_id = :uid AND q.created_at >= :since
                GROUP BY 1
            ) x
            GROUP BY x.day
            ORDER BY x.day
            """, nativeQuery = true)
    List<ActivityDay> activityByDay(@Param("uid") Long uid, @Param("since") Instant since, @Param("zone") String zone);

    /** Một ngày có hoạt động (theo tz). */
    interface ActiveDay {
        java.sql.Date getDay();
    }

    /**
     * Mọi ngày (theo tz) có ít nhất một lượt ôn hoặc một bài quiz, trên TOÀN bộ lịch sử — chuỗi dài nhất không được cắt theo cửa
     * sổ heatmap. Mỗi ngày một dòng (UNION bỏ trùng) nên vài năm học cũng chỉ vài trăm dòng.
     */
    @Query(value = """
            SELECT CAST(l.reviewed_at AT TIME ZONE :zone AS date) AS "day" FROM review_logs l WHERE l.user_id = :uid
            UNION
            SELECT CAST(q.created_at AT TIME ZONE :zone AS date) AS "day" FROM quiz_results q WHERE q.user_id = :uid
            """, nativeQuery = true)
    List<ActiveDay> activeDays(@Param("uid") Long uid, @Param("zone") String zone);

    /** Các con số tổng của dashboard. */
    interface ActivityTotals {
        long getDueToday();
        long getNewCards();
        long getLearnedTotal();
        long getMasteredTotal();
    }

    /**
     * Một câu, bốn đếm: đến hạn trước :until (hết hôm nay theo tz), thẻ mới (trong bộ mình sở hữu, chưa có dòng reviews — học
     * nhanh chỉ ghi nhật ký nên thẻ chỉ "cram" vẫn là mới), đã học (có dòng reviews), thuộc lâu (interval_days ≥ :masteredDays).
     * reviews.card_id có FK CASCADE (V2) nên không có dòng mồ côi để JOIN lọc.
     */
    @Query(value = """
            SELECT (SELECT count(*) FROM reviews r WHERE r.user_id = :uid AND r.due_at < :until) AS "dueToday",
                   (SELECT count(*) FROM flashcards f JOIN decks d ON d.id = f.deck_id
                    WHERE d.owner_id = :uid
                      AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.user_id = :uid AND r.card_id = f.id)) AS "newCards",
                   (SELECT count(*) FROM reviews r WHERE r.user_id = :uid) AS "learnedTotal",
                   (SELECT count(*) FROM reviews r WHERE r.user_id = :uid AND r.interval_days >= :masteredDays) AS "masteredTotal"
            """, nativeQuery = true)
    ActivityTotals activityTotals(@Param("uid") Long uid, @Param("until") Instant until,
                                  @Param("masteredDays") int masteredDays);
}
