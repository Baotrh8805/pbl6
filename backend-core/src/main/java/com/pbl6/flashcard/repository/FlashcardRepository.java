package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.Flashcard;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface FlashcardRepository extends JpaRepository<Flashcard, String> {
    /** Thẻ mẫu của bộ thẻ nổi bật. */
    Optional<Flashcard> findFirstByDeck_IdOrderByPositionAsc(String deckId);
}
