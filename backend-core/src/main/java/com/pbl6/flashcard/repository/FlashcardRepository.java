package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.Flashcard;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface FlashcardRepository extends JpaRepository<Flashcard, String> {
    /** Thẻ tồn tại và nằm trong bộ thẻ user được xem (của mình, public, hoặc được chia sẻ). */
    @Query("SELECT COUNT(f) > 0 FROM Flashcard f WHERE f.id = :cardId "
            + "AND (f.deck.ownerId = :uid OR f.deck.visibility = 'public' "
            + "OR EXISTS (SELECT 1 FROM DeckShare s WHERE s.deckId = f.deck.id AND s.userId = :uid))")
    boolean existsReadableBy(@Param("cardId") String cardId, @Param("uid") Long uid);

    /** Thẻ mẫu của bộ thẻ nổi bật. */
    Optional<Flashcard> findFirstByDeck_IdOrderByPositionAsc(String deckId);
}
