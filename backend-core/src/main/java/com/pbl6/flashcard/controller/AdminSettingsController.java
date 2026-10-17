package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.dto.admin.SettingsResponse;
import com.pbl6.flashcard.security.CustomUserDetails;
import com.pbl6.flashcard.service.SettingsService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** Cấu hình hệ thống: mọi staff xem, chỉ SUPER_ADMIN sửa. */
@RestController
@RequestMapping("/api/admin/settings")
public class AdminSettingsController {

    private final SettingsService settings;

    public AdminSettingsController(SettingsService settings) {
        this.settings = settings;
    }

    @GetMapping
    public SettingsResponse get() {
        return settings.current();
    }

    @PutMapping
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public SettingsResponse update(@AuthenticationPrincipal CustomUserDetails me, @Valid @RequestBody SettingsResponse body) {
        return settings.update(me.getUser().getId(), body);
    }
}
