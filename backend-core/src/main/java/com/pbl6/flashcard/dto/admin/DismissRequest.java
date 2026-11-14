package com.pbl6.flashcard.dto.admin;

import jakarta.validation.constraints.Size;

public record DismissRequest(@Size(max = 500) String note) {}
