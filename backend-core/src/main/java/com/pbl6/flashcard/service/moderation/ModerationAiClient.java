package com.pbl6.flashcard.service.moderation;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.dto.moderation.ModerationDtos.Signal;
import com.pbl6.flashcard.dto.moderation.ModerationDtos.Span;
import com.pbl6.flashcard.service.AiServiceClient;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * POST /api/moderation/check của ai-service (spec 2026-10-27 đêm §6.1): client mỏng, timeout ngắn ({@link AiServiceClient#postJsonQuick}
 * 3 s) vì người dùng đang chờ bình luận đăng; lỗi là {@link AiServiceClient.AiServiceException} (caller để PENDING).
 */
@Service
public class ModerationAiClient {

    public static final int MAX_ITEMS = 20;

    private final AiServiceClient ai;

    public ModerationAiClient(AiServiceClient ai) {
        this.ai = ai;
    }

    /** Một tín hiệu cho mỗi văn bản, cùng thứ tự; ≤ 20 văn bản mỗi lời gọi. */
    public List<Signal> check(List<String> texts) {
        if (texts.isEmpty()) return List.of();
        if (texts.size() > MAX_ITEMS) throw new IllegalArgumentException("tối đa " + MAX_ITEMS + " văn bản");
        List<Map<String, Object>> items = new ArrayList<>();
        for (int i = 0; i < texts.size(); i++) {
            Map<String, Object> it = new LinkedHashMap<>();
            it.put("ref", String.valueOf(i));
            it.put("text", texts.get(i));
            items.add(it);
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("items", items);
        body.put("spans", true);
        JsonNode res = ai.postJsonQuick("kiểm duyệt bình luận", "/api/moderation/check", body);
        // AiServiceClient.call() đã chặn body null; client giả (Mockito trong IT khác) trả null → coi như dịch vụ lỗi, không 500
        if (res == null) throw new AiServiceClient.AiServiceException("Dịch vụ AI trả về rỗng khi kiểm duyệt.", 0, null);
        Map<String, Signal> byRef = new LinkedHashMap<>();
        for (JsonNode n : res.path("items")) byRef.put(n.path("ref").asText(), parse(n));
        List<Signal> out = new ArrayList<>(texts.size());
        for (int i = 0; i < texts.size(); i++) {
            Signal s = byRef.get(String.valueOf(i));
            if (s == null) throw new AiServiceClient.AiServiceException("Dịch vụ AI trả thiếu kết quả kiểm duyệt.", 0, null);
            out.add(s);
        }
        return out;
    }

    static Signal parse(JsonNode n) {
        List<Double> probs = new ArrayList<>();
        n.path("probs").forEach(p -> probs.add(p.asDouble()));
        List<Span> spans = new ArrayList<>();
        for (JsonNode s : n.path("spans")) {
            spans.add(new Span(s.path("word").asText(), s.path("start").asInt(-1), s.path("end").asInt(-1), s.path("score").asDouble()));
        }
        int label = Math.max(0, Math.min(2, n.path("label").asInt(0)));
        double score = n.hasNonNull("score") ? n.get("score").asDouble() : (probs.size() > label ? probs.get(label) : 0);
        return new Signal(label, probs, score, spans, n.path("spanModel").asBoolean(false), n.path("empty").asBoolean(false));
    }
}
