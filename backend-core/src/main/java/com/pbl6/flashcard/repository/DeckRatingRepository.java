package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.DeckRating;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface DeckRatingRepository extends JpaRepository<DeckRating, Long> {

    /** Chấm lần đầu = thêm, chấm lại = sửa. ON CONFLICT: 2 request song song không vỡ unique (deck_id, user_id). */
    @Modifying
    @Query(value = "INSERT INTO deck_ratings (deck_id, user_id, stars) VALUES (:deckId, :uid, :stars) "
            + "ON CONFLICT (deck_id, user_id) DO UPDATE SET stars = EXCLUDED.stars, updated_at = now()",
            nativeQuery = true)
    void upsert(@Param("deckId") String deckId, @Param("uid") Long uid, @Param("stars") short stars);

    interface Summary {
        Double getRating();
        Long getRatingsCount();
    }

    @Query(value = "SELECT CAST(avg(stars) AS double precision) AS \"rating\", count(*) AS \"ratingsCount\" "
            + "FROM deck_ratings WHERE deck_id = :deckId", nativeQuery = true)
    Summary summary(@Param("deckId") String deckId);
}
