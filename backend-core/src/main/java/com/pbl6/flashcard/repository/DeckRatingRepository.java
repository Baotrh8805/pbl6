package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.DeckRating;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface DeckRatingRepository extends JpaRepository<DeckRating, Long> {

    /** Chấm lần đầu = thêm, chấm lại = sửa. ON CONFLICT: 2 request song song không vỡ unique (deck_id, user_id). */
    @Modifying
    @Query(value = "INSERT INTO deck_ratings (deck_id, user_id, stars, comment) VALUES (:deckId, :uid, :stars, :comment) "
            + "ON CONFLICT (deck_id, user_id) DO UPDATE SET stars = EXCLUDED.stars, comment = EXCLUDED.comment, "
            + "updated_at = now()",
            nativeQuery = true)
    void upsert(@Param("deckId") String deckId, @Param("uid") Long uid, @Param("stars") short stars,
                @Param("comment") String comment);

    @Modifying
    @Query(value = "DELETE FROM deck_ratings WHERE deck_id = :deckId AND user_id = :uid", nativeQuery = true)
    int deleteMine(@Param("deckId") String deckId, @Param("uid") Long uid);

    Optional<DeckRating> findByDeckIdAndUserId(String deckId, Long userId);

    interface Summary {
        Double getRating();
        Long getRatingsCount();
    }

    @Query(value = "SELECT CAST(avg(stars) AS double precision) AS \"rating\", count(*) AS \"ratingsCount\" "
            + "FROM deck_ratings WHERE deck_id = :deckId", nativeQuery = true)
    Summary summary(@Param("deckId") String deckId);

    interface AdminRow {
        Long getId();
        String getDeckId();
        String getDeckTitle();
        Long getUserId();
        String getUserEmail();
        Integer getStars();
        String getComment();
        Instant getUpdatedAt();
    }

    /** Admin: chỉ dòng còn bình luận; deckId rỗng = mọi bộ thẻ; q đã lower + escape (rỗng = không lọc). */
    @Query(value = """
            SELECT r.id AS "id", r.deck_id AS "deckId", d.title AS "deckTitle", r.user_id AS "userId", u.email AS "userEmail",
                   CAST(r.stars AS integer) AS "stars", r.comment AS "comment", r.updated_at AS "updatedAt"
            FROM deck_ratings r JOIN decks d ON d.id = r.deck_id JOIN users u ON u.id = r.user_id
            WHERE r.comment IS NOT NULL AND (:deckId = '' OR r.deck_id = :deckId)
              AND (:q = '' OR lower(r.comment) LIKE :q ESCAPE '!')
            ORDER BY r.updated_at DESC, r.id DESC
            """,
            countQuery = """
            SELECT count(*) FROM deck_ratings r
            WHERE r.comment IS NOT NULL AND (:deckId = '' OR r.deck_id = :deckId)
              AND (:q = '' OR lower(r.comment) LIKE :q ESCAPE '!')
            """, nativeQuery = true)
    org.springframework.data.domain.Page<AdminRow> searchAdmin(@Param("deckId") String deckId, @Param("q") String q,
                                                              org.springframework.data.domain.Pageable pageable);

    interface Row {
        String getDisplayName();
        Integer getStars();
        String getComment();
        Instant getUpdatedAt();
        Boolean getMine();
        /** V38: bình luận FLAGGED được che từ cho người khác; BLOCKED của người khác không có trong danh sách. */
        String getModStatus();
        String getModSpans();
    }

    /** Đánh giá của một bộ thẻ, mới nhất trước. Tên hiển thị = full_name, thiếu thì phần trước @ của email. */
    @Query(value = "SELECT COALESCE(NULLIF(trim(u.full_name), ''), split_part(u.email, '@', 1)) AS \"displayName\", "
            + "CAST(r.stars AS integer) AS \"stars\", r.comment AS \"comment\", r.updated_at AS \"updatedAt\", "
            + "(r.user_id = :uid) AS \"mine\", r.mod_status AS \"modStatus\", r.mod_spans AS \"modSpans\" "
            + "FROM deck_ratings r JOIN users u ON u.id = r.user_id WHERE r.deck_id = :deckId "
            + "AND (r.mod_status <> 'BLOCKED' OR r.user_id = :uid) "
            + "ORDER BY r.updated_at DESC, r.id DESC LIMIT :limit OFFSET :offset", nativeQuery = true)
    List<Row> findRows(@Param("deckId") String deckId, @Param("uid") Long uid,
                       @Param("limit") int limit, @Param("offset") int offset);
}
