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

/** Admin Panel > Tổng quan: mọi staff. */
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

    @GetMapping("/health")
    public Map<String, String> health() {
        return service.health();
    }
}
