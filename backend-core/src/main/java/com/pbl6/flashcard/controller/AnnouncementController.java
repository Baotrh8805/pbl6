package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.service.SettingsService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** Thông báo toàn hệ thống (banner cho người học); rỗng = không có. Mọi vai trò đã đăng nhập đọc được. */
@RestController
public class AnnouncementController {

    private final SettingsService settings;

    public AnnouncementController(SettingsService settings) {
        this.settings = settings;
    }

    @GetMapping("/api/announcement")
    public Map<String, String> announcement() {
        return Map.of("text", settings.getText(SettingsService.KEY_ANNOUNCEMENT));
    }
}
