package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.dto.deck.ShareMemberResponse;
import com.pbl6.flashcard.model.DeckShare;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface DeckShareRepository extends JpaRepository<DeckShare, Long> {

    /** Mọi quyền được chia sẻ cho user: 1 query cho cả danh sách bộ thẻ (không N+1). */
    List<DeckShare> findByUserId(Long userId);

    Optional<DeckShare> findByDeckIdAndUserId(String deckId, Long userId);

    @Query("SELECT new com.pbl6.flashcard.dto.deck.ShareMemberResponse(s.userId, u.email, u.fullName, s.permission) "
            + "FROM DeckShare s, User u WHERE u.id = s.userId AND s.deckId = :deckId ORDER BY u.email")
    List<ShareMemberResponse> findMembers(@Param("deckId") String deckId);
}
