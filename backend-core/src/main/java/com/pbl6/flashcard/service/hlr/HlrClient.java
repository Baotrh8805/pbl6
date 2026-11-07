package com.pbl6.flashcard.service.hlr;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.service.AiServiceClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * POST /api/hlr/predict của ai-service (spec 2026-10-27 đêm §6.1, §8): xác suất còn nhớ của thẻ từ số lượt đã chấm / đúng và
 * khoảng cách thời gian. Timeout ngắn ({@link AiServiceClient#postJsonQuick}); {@link #tryPredict} nuốt lỗi (WARN gộp mỗi phút)
 * để lượt chấm / trang bộ thẻ không hỏng khi ai-service tắt — khi đó SM-2 chạy thuần, giao diện ẩn số liệu HLR.
 */
@Service
public class HlrClient {

    private static final Logger log = LoggerFactory.getLogger(HlrClient.class);
    public static final int MAX_BATCH = 500;
    static final long WARN_EVERY_MS = 60_000;

    public record Item(String ref, int seen, int correct, double deltaDays) {}

    /** recall = p đã hiệu chỉnh; forget = p &lt; ngưỡng của model (0,8235); intervalDays chỉ để tham khảo (§8.3). */
    public record Prediction(double recall, double recallRaw, double halfLifeDays, double intervalDays, boolean forget) {}

    private final AiServiceClient ai;
    private final boolean enabled;
    private volatile long lastWarn;

    public HlrClient(AiServiceClient ai, @Value("${app.hlr.enabled:true}") boolean enabled) {
        this.ai = ai;
        this.enabled = enabled;
    }

    public boolean enabled() { return enabled; }

    /** Dự đoán theo lô (tự chia ≤ 500); ném AiServiceException khi ai-service lỗi. */
    public Map<String, Prediction> predict(List<Item> items) {
        Map<String, Prediction> out = new LinkedHashMap<>();
        for (int from = 0; from < items.size(); from += MAX_BATCH) {
            List<Item> part = items.subList(from, Math.min(items.size(), from + MAX_BATCH));
            List<Map<String, Object>> rows = new ArrayList<>(part.size());
            for (Item it : part) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("ref", it.ref());
                m.put("seen", Math.max(0, it.seen()));
                m.put("correct", Math.max(0, Math.min(it.correct(), it.seen())));
                m.put("deltaDays", Math.max(0, it.deltaDays()));
                rows.add(m);
            }
            JsonNode res = ai.postJsonQuick("dự đoán trí nhớ", "/api/hlr/predict", Map.of("items", rows));
            // client giả (Mockito trong IT khác) trả null → coi như dịch vụ lỗi để tryPredict rơi về SM-2
            if (res == null) throw new AiServiceClient.AiServiceException("Dịch vụ AI trả về rỗng khi dự đoán trí nhớ.", 0, null);
            for (JsonNode n : res.path("items")) {
                out.put(n.path("ref").asText(), new Prediction(n.path("recall").asDouble(), n.path("recallRaw").asDouble(),
                        n.path("halfLifeDays").asDouble(), n.path("intervalDays").asDouble(), n.path("forget").asBoolean()));
            }
        }
        return out;
    }

    /** Như {@link #predict} nhưng tắt / lỗi → Optional.empty (caller dùng SM-2 thuần hoặc ẩn số liệu). */
    public Optional<Map<String, Prediction>> tryPredict(List<Item> items) {
        if (!enabled || items.isEmpty()) return Optional.empty();
        try {
            return Optional.of(predict(items));
        } catch (AiServiceClient.AiServiceException e) {
            long now = System.currentTimeMillis();
            if (now - lastWarn > WARN_EVERY_MS) {
                lastWarn = now;
                log.warn("HLR không dùng được, lịch ôn chạy SM-2 thuần: {}", e.getMessage());
            }
            return Optional.empty();
        }
    }
}
