package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.Flashcard;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface FlashcardRepository extends JpaRepository<Flashcard, String> {
    /** Thẻ mẫu của bộ thẻ nổi bật. */
    Optional<Flashcard> findFirstByDeck_IdOrderByPositionAsc(String deckId);

    long countByDeck_OwnerId(Long ownerId);

    /** Chỉ id + vị trí trong bộ (lộ trình: dựng fromPos/toPos của việc hôm nay cho nhiều lộ trình mà không nạp cả thẻ). */
    interface IdPosition {
        String getId();
        Integer getPosition();
    }

    @Query("SELECT f.id AS id, f.position AS position FROM Flashcard f WHERE f.id IN :ids")
    List<IdPosition> findPositions(@Param("ids") Collection<String> ids);

    /** Chỉ bộ thẻ + nội dung thẻ (lộ trình: bộ của chương ra được bao nhiêu câu nghĩa — QuizCapabilities.meaningQuestions). */
    interface DeckMeaning {
        String getDeckId();
        String getMeaning();
    }

    @Query("SELECT f.deck.id AS deckId, f.meaning AS meaning FROM Flashcard f WHERE f.deck.id IN :deckIds")
    List<DeckMeaning> findMeaningsByDeckIds(@Param("deckIds") Collection<String> deckIds);

    /** Thẻ kèm bộ thẻ (fetch join) để InsightService lọc quyền xem theo bộ (DeckService.canView) mà không nạp lười từng bộ. */
    @Query("SELECT f FROM Flashcard f JOIN FETCH f.deck WHERE f.id IN :ids")
    List<Flashcard> findWithDeckByIdIn(@Param("ids") Collection<String> ids);
}
