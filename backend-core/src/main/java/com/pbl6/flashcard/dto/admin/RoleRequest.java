package com.pbl6.flashcard.dto.admin;

import com.pbl6.flashcard.model.Role;
import jakarta.validation.constraints.NotNull;

public record RoleRequest(@NotNull Role role) {}
