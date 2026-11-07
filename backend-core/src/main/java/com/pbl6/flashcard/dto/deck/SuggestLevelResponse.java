package com.pbl6.flashcard.dto.deck;

import java.util.Map;

public record SuggestLevelResponse(
        String suggestedLevel,
        String reason,
        Map<String, Integer> breakdown,
        int totalTerms,
        int matchedTerms
) {}

