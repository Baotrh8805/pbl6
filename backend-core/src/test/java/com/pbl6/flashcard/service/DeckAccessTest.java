package com.pbl6.flashcard.service;

import com.pbl6.flashcard.model.Deck;
import com.pbl6.flashcard.model.DeckShare;
import com.pbl6.flashcard.model.Flashcard;
import com.pbl6.flashcard.service.DeckService.Access;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

class DeckAccessTest {

    private static Deck deck(long owner, String visibility) {
        Deck d = new Deck();
        d.setId("d");
        d.setOwnerId(owner);
        d.setVisibility(visibility);
        return d;
    }

    @Test
    void access_rules() {
        Deck privateDeck = deck(999L, Deck.PRIVATE);
        Deck publicDeck = deck(999L, Deck.PUBLIC);

        assertEquals(Optional.of(Access.OWNER), DeckService.access(999L, privateDeck, null));
        // Deck riêng của người khác, không được chia sẻ -> không có quyền
        assertEquals(Optional.empty(), DeckService.access(1L, privateDeck, null));
        assertEquals(Optional.empty(), DeckService.access(null, publicDeck, null));
        // Public -> ai cũng xem, không ai ngoài chủ được sửa
        assertEquals(Optional.of(Access.VIEWER), DeckService.access(1L, publicDeck, null));
        // Chia sẻ quyết định mức quyền; quyền sửa được giữ cả trên deck public
        assertEquals(Optional.of(Access.VIEWER), DeckService.access(1L, privateDeck, DeckShare.VIEWER));
        assertEquals(Optional.of(Access.EDITOR), DeckService.access(1L, privateDeck, DeckShare.EDITOR));
        assertEquals(Optional.of(Access.EDITOR), DeckService.access(1L, publicDeck, DeckShare.EDITOR));
    }

    @Test
    void findCardIn_isolatesCardsPerDeck() {
        Deck deck1 = new Deck();
        deck1.setId("deck-1");

        Flashcard card1 = new Flashcard();
        card1.setId("c-1");
        card1.setDeck(deck1);

        deck1.setCards(new ArrayList<>(List.of(card1)));

        // Thẻ thuộc deck1 -> tìm thấy
        Optional<Flashcard> found = DeckService.findCardIn(deck1, "c-1");
        assertTrue(found.isPresent());
        assertEquals("c-1", found.get().getId());

        // Thẻ thuộc deck khác hoặc không tồn tại (IDOR attempt) -> empty
        assertTrue(DeckService.findCardIn(deck1, "c-other").isEmpty());
        assertTrue(DeckService.findCardIn(null, "c-1").isEmpty());
    }
}
