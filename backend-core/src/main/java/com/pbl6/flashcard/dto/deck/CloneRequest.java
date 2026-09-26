package com.pbl6.flashcard.dto.deck;

import java.util.UUID;

/** Lưu bản sao bộ thẻ vào thư mục của mình; folderId null = thư mục gốc. */
public record CloneRequest(UUID folderId) {}
