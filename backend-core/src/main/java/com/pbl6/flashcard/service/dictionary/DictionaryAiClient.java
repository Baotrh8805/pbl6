package com.pbl6.flashcard.service.dictionary;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.service.AiServiceClient;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Lời gọi ai-service của từ điển (/api/dict/*, spec 2026-10-26 §4.4). Client mỏng trên {@link AiServiceClient#getJson} /
 * {@link AiServiceClient#postJson} như QuizAiClient / ContentAiClient; lỗi là {@link AiServiceClient.AiServiceException}.
 */
@Service
public class DictionaryAiClient {

    private final AiServiceClient ai;

    public DictionaryAiClient(AiServiceClient ai) {
        this.ai = ai;
    }

    /** {items: [{id, key, headKanji, headKana, reading, glossShort, common, jlpt, nExamples}], total}; mode ja | en. */
    public JsonNode search(String q, String mode, int limit, int offset) {
        Map<String, Object> query = new LinkedHashMap<>();
        query.put("q", q);
        query.put("mode", mode);
        query.put("limit", limit);
        query.put("offset", offset);
        return ai.getJson("tra từ điển", "/api/dict/search", null, query);
    }

    /** Mục từ đầy đủ theo id JMdict; 404 khi không có. */
    public JsonNode entry(String wordId) {
        return ai.getJson("mở mục từ điển", "/api/dict/entries/{id}", Map.of("id", wordId), null);
    }

    /** {items: [...]} cho ≤ 50 id (bỏ id không có). */
    public JsonNode entries(List<String> wordIds) {
        return ai.getJson("mở lô mục từ điển", "/api/dict/entries", null, Map.of("ids", String.join(",", wordIds)));
    }

    /** Thẻ chữ Hán + exampleWords; 404 khi không phải một chữ Hán. */
    public JsonNode kanji(String ch) {
        return ai.getJson("tra chữ Hán", "/api/dict/kanji/{ch}", Map.of("ch", ch), null);
    }

    /** {key: "w:<id>" | null}. */
    public JsonNode key(String term, String reading) {
        Map<String, Object> query = new LinkedHashMap<>();
        query.put("term", term);
        query.put("reading", reading);
        return ai.getJson("tìm mục từ điển", "/api/dict/key", null, query);
    }

    /** {tokens: [{surface, lemma, reading, key}]}. */
    public JsonNode tokenize(String text) {
        return ai.postJson("tách câu", "/api/dict/tokenize", Map.of("text", text));
    }

    /**
     * POST /api/dict/translate {items, geminiModel?} → {items: [{ref, meaningVi, examples: [{id, vi}]}], model}. Không khoá / hết
     * quota / quá tải → AiServiceException status 503, message = lý do (no_api_key | quota | aiOverloaded | error).
     */
    public JsonNode translate(List<Map<String, Object>> items) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("items", items);
        String model = ai.geminiModel();
        if (model != null) body.put("geminiModel", model);
        return ai.postJson("dịch từ điển", "/api/dict/translate", body);
    }

    /** Thay toàn bộ bản sao ghi đè ở ai-service. */
    public JsonNode pushOverrides(long version, List<Map<String, Object>> items) {
        return ai.postJsonLong("đồng bộ từ điển", "/api/dict/overrides", Map.of("version", version, "items", items));
    }

    public JsonNode overridesVersion() {
        return ai.getJson("phiên bản ghi đè từ điển", "/api/dict/overrides/version", null, null);
    }
}
