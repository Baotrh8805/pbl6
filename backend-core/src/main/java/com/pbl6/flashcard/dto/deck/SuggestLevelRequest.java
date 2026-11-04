package com.pbl6.flashcard.dto.deck;

import java.util.List;

public record SuggestLevelRequest(String title, List<String> terms, List<String> readings) {}

