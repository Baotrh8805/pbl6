package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.deck.SuggestLevelResponse;
import com.pbl6.flashcard.service.dictionary.DictionaryStore;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.when;

class DeckSuggestLevelTest {

    @Test
    void parseTitleLevel_recognizesVariousPatterns() {
        assertEquals("N3", DeckService.parseTitleLevel("Từ vựng N3 - Chuyên ngành CNTT"));
        assertEquals("N2", DeckService.parseTitleLevel("JLPT N2 500 câu Mimikara"));
        assertEquals("N5", DeckService.parseTitleLevel("Bài 1 n5 cơ bản"));
        assertEquals("N1", DeckService.parseTitleLevel("Kanji N1 cao cấp"));
        assertEquals("N4", DeckService.parseTitleLevel("Luyện thi (N4) cấp tốc"));
        assertNull(DeckService.parseTitleLevel("Từ vựng gia đình và người thân"));
        assertNull(DeckService.parseTitleLevel(null));
        assertNull(DeckService.parseTitleLevel(""));
    }

    @Test
    void cleanTerm_stripsGrammarAndPosAnnotations() {
        assertEquals("持ち寄る", DeckService.cleanTerm("持ち寄る (V)"));
        assertEquals("お世辞", DeckService.cleanTerm("お世辞 (N)"));
        assertEquals("赤道", DeckService.cleanTerm("赤道 [n]"));
        assertEquals("即座", DeckService.cleanTerm("即座（副）"));
        assertEquals("食べる", DeckService.cleanTerm("食べる"));
    }

    @Test
    void suggestLevel_withVocabularyMatch() {
        DictionaryStore dictStore = Mockito.mock(DictionaryStore.class);
        when(dictStore.findLevelsByTermsAndReadings(anyCollection(), anyCollection())).thenReturn(Map.of(
                "食べる", "N5",
                "飲む", "N5",
                "行く", "N5"
        ));

        DeckService service = new DeckService(null, null, null, null, null, null, dictStore, null);
        SuggestLevelResponse res = service.suggestLevel("Bài 1", List.of("食べる (V)", "飲む (V)", "行く (V)"), List.of("たべる", "のむ", "いく"));

        assertEquals("N5", res.suggestedLevel());
        assertEquals(3, res.matchedTerms());
        assertEquals(3, res.breakdown().get("N5"));
        assertTrue(res.reason().contains("N5"));
    }

    @Test
    void suggestLevel_withTitlePriorityWhenNoVocab() {
        DictionaryStore dictStore = Mockito.mock(DictionaryStore.class);
        when(dictStore.findLevelsByTermsAndReadings(anyCollection(), anyCollection())).thenReturn(Map.of());

        DeckService service = new DeckService(null, null, null, null, null, null, dictStore, null);
        SuggestLevelResponse res = service.suggestLevel("Ngữ pháp N2", List.of("từ lạ 1", "từ lạ 2"), List.of());

        assertEquals("N2", res.suggestedLevel());
        assertEquals(0, res.matchedTerms());
        assertTrue(res.reason().contains("tiêu đề"));
    }
}

