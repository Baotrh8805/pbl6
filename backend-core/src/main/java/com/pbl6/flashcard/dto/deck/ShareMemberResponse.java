package com.pbl6.flashcard.dto.deck;

/** Một người được chia sẻ bộ thẻ. Dựng thẳng từ truy vấn ở DeckShareRepository.findMembers. */
public record ShareMemberResponse(Long userId, String email, String fullName, String permission) {}
