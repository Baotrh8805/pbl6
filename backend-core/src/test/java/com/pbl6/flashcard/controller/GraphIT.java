package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.service.AiServiceClient;
import com.pbl6.flashcard.service.graph.GraphAiClient;
import com.pbl6.flashcard.service.graph.GraphService;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Đồ thị tri thức Neo4j + GraphRAG (spec docs/Plan/specs/2026-10-27-do-thi-tri-thuc-neo4j-design.md §8, §10, §11): userId chỉ từ
 * JWT, đồng bộ lười + sync/me gửi đúng dữ liệu của chính người đó và không gửi email, hạn mức hỏi đáp, 503 GRAPH_UNAVAILABLE,
 * admin build / sync cần ADMIN và ghi audit, health có cờ graph. ai-service giả lập bằng {@link GraphAiClient}.
 */
class GraphIT extends IntegrationTest {

    @MockitoBean
    GraphAiClient ai;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    GraphService graph;

    @BeforeEach
    void setUp() throws Exception {
        Mockito.reset(ai);
        when(ai.sync(any())).thenReturn(json.readTree("{\"written\":{}}"));
        when(ai.syncFinish(any(), any(), any())).thenReturn(json.readTree("{}"));
    }

    private JsonNode obj(String s) throws Exception {
        return json.readTree(s);
    }

    private JsonNode createDeck(String token, String title, String... terms) throws Exception {
        List<Map<String, Object>> cards = new ArrayList<>();
        for (String t : terms) cards.add(Map.of("term", t, "reading", "たべる", "meaning", "nghĩa " + t));
        return read(call(post("/api/decks"), token, Map.of("title", title, "level", "N5", "cards", cards))
                .andExpect(status().isCreated()));
    }

    @Test
    void explore_passes_jwt_user_and_syncs_lazily_once() throws Exception {
        String email = newEmail();
        String tok = newUser(email);
        Long uid = userId(email);
        when(ai.explore(eq("食べる"), eq(uid), eq(24)))
                .thenReturn(obj("{\"query\":\"食べる\",\"center\":\"w:1\",\"nodes\":[{\"id\":\"w:1\"}],\"edges\":[]}"));
        call(get("/api/graph/explore").param("q", " 食べる "), tok, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.center").value("w:1"));
        // lần đầu: đồng bộ lười dữ liệu của chính người này (scope user, đúng userId); lần hai trong 10 phút: không đồng bộ lại
        verify(ai, times(1)).syncFinish(any(), eq("user"), eq(uid));
        call(get("/api/graph/explore").param("q", "食べる").param("limit", "999"), tok, null).andExpect(status().isOk());
        verify(ai, times(1)).syncFinish(any(), eq("user"), eq(uid));
        verify(ai).explore(eq("食べる"), eq(uid), eq(60));   // limit kẹp 1..60
        call(get("/api/graph/explore").param("q", "  "), tok, null).andExpect(status().isBadRequest());
        call(get("/api/graph/explore").param("q", "x".repeat(65)), tok, null).andExpect(status().isBadRequest());
        mvc.perform(get("/api/graph/explore").param("q", "食")).andExpect(status().isUnauthorized());
    }

    @Test
    @SuppressWarnings("unchecked")
    void sync_me_sends_only_own_data_without_pii_and_rate_limits() throws Exception {
        String email = newEmail();
        String tok = newUser(email);
        Long uid = userId(email);
        JsonNode deck = createDeck(tok, "Bộ của tôi", "食べる", "飲む");
        String cardId = deck.get("cards").get(0).get("id").asText();
        jdbc.update("INSERT INTO reviews (user_id, card_id, reps, interval_days, ease, due_at) VALUES (?, ?, 3, 4, 2.4, now() - interval '1 day')",
                uid, cardId);
        jdbc.update("INSERT INTO review_logs (user_id, card_id, grade, source) VALUES (?, ?, 'again', 'flip')", uid, cardId);
        jdbc.update("INSERT INTO review_logs (user_id, card_id, grade, source) VALUES (?, ?, 'again', 'flip')", uid, cardId);
        jdbc.update("INSERT INTO review_logs (user_id, card_id, grade, source) VALUES (?, ?, 'good', 'flip')", uid, cardId);
        String otherTok = newUser();
        createDeck(otherTok, "Của người khác", "学校");

        JsonNode out = read(call(post("/api/graph/sync/me"), tok, null).andExpect(status().isOk()));
        assertThat(out.get("rows").get("users").asInt()).isEqualTo(1);
        assertThat(out.get("rows").get("decks").asInt()).isEqualTo(1);
        assertThat(out.get("rows").get("cards").asInt()).isEqualTo(2);
        assertThat(out.get("rows").get("reviews").asInt()).isEqualTo(1);
        String run = out.get("run").asText();

        ArgumentCaptor<Map<String, Object>> cap = ArgumentCaptor.forClass(Map.class);
        verify(ai, Mockito.atLeastOnce()).sync(cap.capture());
        Map<String, Map<String, Object>> byKind = new java.util.HashMap<>();
        for (Map<String, Object> body : cap.getAllValues()) {
            assertThat(body.get("run")).isEqualTo(run);
            assertThat(body.get("scope")).isEqualTo("user");
            assertThat(body.get("userId")).isEqualTo(uid);
            for (String kind : List.of("users", "decks", "cards", "reviews")) {
                if (body.containsKey(kind)) byKind.put(kind, body);
            }
        }
        List<Map<String, Object>> users = (List<Map<String, Object>>) byKind.get("users").get("users");
        assertThat(users).hasSize(1);
        assertThat(users.get(0)).containsEntry("id", uid).containsEntry("level", "N5").doesNotContainKeys("email", "fullName", "password");
        List<Map<String, Object>> cards = (List<Map<String, Object>>) byKind.get("cards").get("cards");
        assertThat(cards).extracting(c -> c.get("term")).containsExactlyInAnyOrder("食べる", "飲む");   // không có 学校 của người khác
        assertThat(cards.get(0)).containsEntry("ownerId", uid).containsEntry("deckId", deck.get("id").asText());
        List<Map<String, Object>> reviews = (List<Map<String, Object>>) byKind.get("reviews").get("reviews");
        assertThat(reviews).hasSize(1);
        assertThat(reviews.get(0)).containsEntry("cardId", cardId).containsEntry("again30d", 2).containsEntry("reps", 3);
        assertThat(reviews.get(0).get("dueAt")).isNotNull();
        assertThat(reviews.get(0).get("lastAt")).isNotNull();
        verify(ai).syncFinish(run, "user", uid);

        call(post("/api/graph/sync/me"), tok, null).andExpect(status().isTooManyRequests());
    }

    @Test
    void ask_validates_passes_level_and_rate_limits() throws Exception {
        String email = newEmail();
        String tok = newUser(email);
        Long uid = userId(email);
        when(ai.ask(eq("食べる là gì?"), eq(uid), eq("N5"), any()))
                .thenReturn(obj("{\"answer\":\"ăn [1]\",\"model\":\"template\",\"sources\":[{\"n\":1}]}"));
        for (int i = 0; i < 3; i++) {   // app.graph.ask-per-hour=3 trong profile test
            call(post("/api/graph/ask"), tok, Map.of("question", "食べる là gì?"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.answer").value("ăn [1]"));
        }
        call(post("/api/graph/ask"), tok, Map.of("question", "食べる là gì?")).andExpect(status().isTooManyRequests());
        call(post("/api/graph/ask"), tok, Map.of("question", "   ")).andExpect(status().isBadRequest());
        call(post("/api/graph/ask"), tok, Map.of("question", "x".repeat(301))).andExpect(status().isBadRequest());
    }

    @Test
    void neo4j_down_maps_to_503_with_code() throws Exception {
        String tok = newUser();
        when(ai.recommend(any(), any(), anyInt())).thenThrow(new AiServiceClient.AiServiceException("graphUnavailable", 503, null));
        call(get("/api/graph/recommend"), tok, null)
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("GRAPH_UNAVAILABLE"))
                .andExpect(jsonPath("$.message").value(GraphService.MSG_UNAVAILABLE));
        when(ai.conflicts(any())).thenThrow(new AiServiceClient.AiServiceException("Không kết nối được dịch vụ AI", null));
        call(get("/api/graph/conflicts"), tok, null).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("GRAPH_UNAVAILABLE"));
        when(ai.path(any(), any())).thenThrow(new AiServiceClient.AiServiceException("q hỏng", 422, null));
        call(get("/api/graph/path").param("from", "食").param("to", "飯"), tok, null).andExpect(status().isBadRequest());
    }

    @Test
    void admin_build_sync_status_need_admin_and_audit() throws Exception {
        String user = newUser();
        call(post("/api/admin/graph/build"), user, null).andExpect(status().isForbidden());
        call(get("/api/admin/graph/status"), user, null).andExpect(status().isForbidden());

        String adminEmail = newEmail();
        String admin = newStaff(Role.ADMIN, adminEmail);
        Long adminId = userId(adminEmail);
        when(ai.build(anyBoolean())).thenReturn(obj("{\"building\":true,\"started\":true}"));
        when(ai.status()).thenReturn(obj("{\"available\":true,\"built\":true,\"counts\":{\"Word\":5}}"));
        call(post("/api/admin/graph/build").param("withGrammar", "false"), admin, null)
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.started").value(true));
        verify(ai).build(false);
        Integer audited = jdbc.queryForObject("SELECT count(*) FROM admin_audit_logs WHERE actor_id = ? AND action = 'GRAPH_BUILD'",
                Integer.class, adminId);
        assertThat(audited).isEqualTo(1);
        call(get("/api/admin/graph/status"), admin, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ai.counts.Word").value(5))
                .andExpect(jsonPath("$.syncing").value(false));
        call(post("/api/admin/graph/sync"), admin, null)
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.started").value(true));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM admin_audit_logs WHERE actor_id = ? AND action = 'GRAPH_SYNC'",
                Integer.class, adminId)).isEqualTo(1);
        for (int i = 0; i < 100 && read(call(get("/api/admin/graph/status"), admin, null)).get("syncing").asBoolean(); i++) {
            Thread.sleep(50);
        }
        JsonNode st = read(call(get("/api/admin/graph/status"), admin, null));
        assertThat(st.get("syncing").asBoolean()).isFalse();
        assertThat(st.get("lastSync").get("rows").get("users").asInt()).isGreaterThanOrEqualTo(2);
        verify(ai).syncFinish(any(), eq("all"), eq(null));
        // Neo4j tắt → build 503 GRAPH_UNAVAILABLE
        when(ai.build(anyBoolean())).thenThrow(new AiServiceClient.AiServiceException("graphUnavailable", 503, null));
        call(post("/api/admin/graph/build"), admin, null).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("GRAPH_UNAVAILABLE"));
        // health có cờ graph (ai-service giả không tới được → down)
        call(get("/api/admin/health"), admin, null).andExpect(status().isOk()).andExpect(jsonPath("$.graph").value("down"));
    }
}
