package com.pbl6.flashcard.service.graph;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.service.AiServiceClient;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Lời gọi ai-service của đồ thị tri thức (/api/graph/*, spec 2026-10-27 §8). Client mỏng như {@link
 * com.pbl6.flashcard.service.dictionary.DictionaryAiClient}; ai-service là tầng duy nhất nối Neo4j nên backend không có driver
 * Neo4j. Neo4j tắt → ai-service trả 503 {@code graphUnavailable} → {@link AiServiceClient.AiServiceException} status 503.
 */
@Service
public class GraphAiClient {

    private final AiServiceClient ai;

    public GraphAiClient(AiServiceClient ai) {
        this.ai = ai;
    }

    /** {available, built, building, builtAt, counts, learner, error}; không bao giờ 503 (available false khi Neo4j tắt). */
    public JsonNode status() {
        return ai.getJson("trạng thái đồ thị", "/api/graph/status", null, null);
    }

    /** Dựng lại lớp tham chiếu ở luồng nền của ai-service → {building, started}. */
    public JsonNode build(boolean withGrammar) {
        return ai.postJson("dựng đồ thị", "/api/graph/build?withGrammar=" + withGrammar, Map.of());
    }

    /** Một lô lớp người học: {run, scope, userId?, users | decks | cards | reviews | paths | chapters | pathCards | meanings}. */
    public JsonNode sync(Map<String, Object> payload) {
        return ai.postJson("đồng bộ đồ thị", "/api/graph/sync", payload);
    }

    /** Kết thúc lần đồng bộ: ai-service xoá dữ liệu lớp người học không thuộc run (scope all: cả đồ thị; user: của userId). */
    public JsonNode syncFinish(String run, String scope, Long userId) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("run", run);
        body.put("scope", scope);
        if (userId != null) body.put("userId", userId);
        return ai.postJson("kết thúc đồng bộ đồ thị", "/api/graph/sync/finish", body);
    }

    /** {query, center, nodes, edges}; userId để gắn ngữ cảnh học và chỉ lộ thẻ của chính người đó. */
    public JsonNode explore(String q, Long userId, int limit) {
        Map<String, Object> query = new LinkedHashMap<>();
        query.put("q", q);
        query.put("userId", userId);
        query.put("limit", limit);
        return ai.getJson("khám phá đồ thị", "/api/graph/explore", null, query);
    }

    /** Đường nối ngắn nhất giữa hai khái niệm (chỉ qua quan hệ lớp tham chiếu). */
    public JsonNode path(String from, String to) {
        Map<String, Object> query = new LinkedHashMap<>();
        query.put("from", from);
        query.put("to", to);
        return ai.getJson("đường nối đồ thị", "/api/graph/path", null, query);
    }

    /** {level, words, weakKanji, homophones}. */
    public JsonNode recommend(Long userId, String level, int limit) {
        Map<String, Object> query = new LinkedHashMap<>();
        query.put("userId", userId);
        query.put("level", level);
        query.put("limit", limit);
        return ai.getJson("gợi ý từ đồ thị", "/api/graph/recommend", null, query);
    }

    /** {items: [{term, kind, a: {card, deck, word}, b: {...}}]}. */
    public JsonNode conflicts(Long userId) {
        return ai.getJson("xung đột bộ thẻ", "/api/graph/conflicts", null, Map.of("userId", userId));
    }

    /** GraphRAG: {question, answer, model, note, entities, sources, subgraph}. */
    public JsonNode ask(String question, Long userId, String level, String geminiModel) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("question", question);
        body.put("userId", userId);
        if (level != null) body.put("level", level);
        if (geminiModel != null && !geminiModel.isBlank()) body.put("geminiModel", geminiModel);
        return ai.postJsonLong("hỏi đáp đồ thị", "/api/graph/ask", body);
    }
}
