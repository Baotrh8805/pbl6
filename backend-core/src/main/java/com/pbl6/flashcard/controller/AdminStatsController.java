package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.dto.admin.AdminStatsResponse;
import com.pbl6.flashcard.service.AdminStatsService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** Admin Panel > Tổng quan (ADMIN trở lên). */
@RestController
@RequestMapping("/api/admin")
@Validated
public class AdminStatsController {

    private final AdminStatsService service;

    public AdminStatsController(AdminStatsService service) {
        this.service = service;
    }

    @GetMapping("/stats")
    public AdminStatsResponse stats(@RequestParam(defaultValue = "30") @Min(7) @Max(90) int days) {
        return service.stats(days);
    }

    /** db / aiService / version / backup / lastBackupAt + engines (cờ thành phần ai-service, hợp đồng đợt 2 §8). */
    @GetMapping("/health")
    public Map<String, Object> health() {
        return service.health();
    }
}
