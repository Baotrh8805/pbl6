package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.security.CustomUserDetails;
import com.pbl6.flashcard.service.graph.GraphService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Đồ thị tri thức Neo4j + GraphRAG cho người học (UC-34 / UC-35, spec 2026-10-27 §8). userId chỉ từ JWT; Neo4j tắt → 503
 * {@code GRAPH_UNAVAILABLE}.
 */
@RestController
@RequestMapping("/api/graph")
public class GraphController {

    public record AskBody(@NotBlank @Size(max = GraphService.MAX_QUESTION) String question) {}

    private final GraphService graph;

    public GraphController(GraphService graph) {
        this.graph = graph;
    }

    private static long uid(CustomUserDetails me) {
        return me.getUser().getId();
    }

    /** {query, center, nodes, edges}: node tâm theo từ / chữ Hán / âm Hán-Việt / mẫu ngữ pháp + láng giềng, kèm tình trạng học. */
    @GetMapping("/explore")
    public JsonNode explore(@AuthenticationPrincipal CustomUserDetails me, @RequestParam String q,
                            @RequestParam(defaultValue = "24") int limit) {
        return graph.explore(uid(me), q, limit);
    }

    /** Đường nối ngắn nhất giữa hai khái niệm (≤ 6 bước). */
    @GetMapping("/path")
    public JsonNode path(@AuthenticationPrincipal CustomUserDetails me, @RequestParam String from, @RequestParam String to) {
        return graph.path(uid(me), from, to);
    }

    /** {level, words, weakKanji, homophones}: gợi ý tính từ đồ thị + dữ liệu ôn tập của mình. */
    @GetMapping("/recommend")
    public JsonNode recommend(@AuthenticationPrincipal CustomUserDetails me) {
        return graph.recommend(uid(me));
    }

    /** Thẻ cùng thuật ngữ giữa các bộ của mình mà khác cách đọc / trỏ mục từ khác. */
    @GetMapping("/conflicts")
    public JsonNode conflicts(@AuthenticationPrincipal CustomUserDetails me) {
        return graph.conflicts(uid(me));
    }

    /** GraphRAG: câu hỏi tiếng Việt → trả lời có nguồn [n] + đồ thị con; 20 câu / giờ. */
    @PostMapping("/ask")
    public JsonNode ask(@AuthenticationPrincipal CustomUserDetails me, @Valid @RequestBody AskBody body) {
        return graph.ask(uid(me), body.question());
    }

    /** Đồng bộ ngay dữ liệu học của mình sang đồ thị (1 lần / phút); trang đồ thị gọi khi mở. */
    @PostMapping("/sync/me")
    public Map<String, Object> syncMe(@AuthenticationPrincipal CustomUserDetails me) {
        return graph.syncMe(uid(me));
    }
}
