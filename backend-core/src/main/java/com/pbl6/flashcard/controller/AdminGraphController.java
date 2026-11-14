package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.security.CustomUserDetails;
import com.pbl6.flashcard.service.graph.GraphService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Admin > Tổng quan > Đồ thị tri thức (spec 2026-10-27 §8): trạng thái Neo4j, dựng lại lớp tham chiếu, đồng bộ toàn bộ lớp người
 * học. Mọi thao tác ghi audit_logs. Quyền: /api/admin/** = ADMIN (SecurityConfig).
 */
@RestController
@RequestMapping("/api/admin/graph")
public class AdminGraphController {

    private final GraphService graph;

    public AdminGraphController(GraphService graph) {
        this.graph = graph;
    }

    /** {ai: {available, built, building, builtAt, counts, learner, ...}, syncing, lastSync, lastSyncError}. */
    @GetMapping("/status")
    public Map<String, Object> status() {
        return graph.adminStatus();
    }

    /** Dựng lại lớp tham chiếu (ai-service chạy nền, ~1–2 phút); withGrammar=false bỏ bước bắt mẫu ngữ pháp trong câu ví dụ. */
    @PostMapping("/build")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public JsonNode build(@AuthenticationPrincipal CustomUserDetails me, @RequestParam(defaultValue = "true") boolean withGrammar) {
        return graph.adminBuild(me.getUser().getId(), withGrammar);
    }

    /** Đồng bộ toàn bộ người học ngay (luồng nền của backend); đang chạy → started false. */
    @PostMapping("/sync")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Map<String, Object> syncAll(@AuthenticationPrincipal CustomUserDetails me) {
        return graph.adminSyncAll(me.getUser().getId());
    }
}
