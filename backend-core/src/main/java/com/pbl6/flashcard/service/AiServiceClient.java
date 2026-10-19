package com.pbl6.flashcard.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.dto.extraction.AiDtos.AnalyzeResult;
import com.pbl6.flashcard.dto.extraction.AiDtos.EnrichRequest;
import com.pbl6.flashcard.dto.extraction.AiDtos.EnrichResult;
import com.pbl6.flashcard.dto.extraction.AiDtos.TextResult;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * Gọi ai-service (FastAPI) cho luồng bóc tách và tra cứu NLP (/api/nlp). RestClient có sẵn trong starter-web, không cần WebFlux.
 * Mọi lỗi mạng / 5xx gói thành {@link AiServiceException} để worker đánh dấu job FAILED với thông điệp tiếng Việt; lời gọi NLP
 * đổi exception đó thành mã HTTP ở {@link NlpService}.
 */
@Service
public class AiServiceClient {

    private static final Logger log = LoggerFactory.getLogger(AiServiceClient.class);

    public static class AiServiceException extends RuntimeException {
        /** Mã HTTP ai-service trả về; 0 = không có phản hồi (không kết nối được, timeout, body rỗng). */
        private final int status;

        public AiServiceException(String message, Throwable cause) { this(message, 0, cause); }
        public AiServiceException(String message) { this(message, 0, null); }
        public AiServiceException(String message, int status, Throwable cause) {
            super(message, cause);
            this.status = status;
        }

        public int status() { return status; }
    }

    /** Tra cứu NLP có người dùng đang chờ trên trang: không để request treo tới 3 phút như bóc tách tài liệu. */
    static final Duration NLP_READ_TIMEOUT = Duration.ofSeconds(30);

    private final RestClient http;
    /** Kiểm tra sức khoẻ cho dashboard admin: timeout ngắn, không dùng chung client đọc 3 phút. */
    private final RestClient healthHttp;
    private final RestClient nlpHttp;

    public AiServiceClient(RestClient.Builder builder,
                           @Value("${app.ai-service.url}") String baseUrl,
                           @Value("${app.ai-service.key:}") String internalKey,
                           @Value("${app.ai-service.read-timeout:PT3M}") Duration readTimeout) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(5));
        factory.setReadTimeout(readTimeout); // OCR + phân tích tài liệu dài có thể mất vài phút
        RestClient.Builder b = builder.clone().baseUrl(baseUrl).requestFactory(factory);
        if (internalKey != null && !internalKey.isBlank()) {
            b.defaultHeader("X-Internal-Key", internalKey);
        }
        this.http = b.build();
        SimpleClientHttpRequestFactory quick = new SimpleClientHttpRequestFactory();
        quick.setConnectTimeout(Duration.ofSeconds(2));
        quick.setReadTimeout(Duration.ofSeconds(2));
        this.healthHttp = b.clone().requestFactory(quick).build(); // clone SAU khi gắn X-Internal-Key: /health cũng cần key
        SimpleClientHttpRequestFactory interactive = new SimpleClientHttpRequestFactory();
        interactive.setConnectTimeout(Duration.ofSeconds(5));
        interactive.setReadTimeout(readTimeout.compareTo(NLP_READ_TIMEOUT) < 0 ? readTimeout : NLP_READ_TIMEOUT);
        this.nlpHttp = b.clone().requestFactory(interactive).build();
    }

    /**
     * Hạn chót của CẢ lời gọi health. Timeout kết nối / đọc 2 giây của healthHttp không tính bước phân giải tên máy: resolver
     * chậm trả "không có tên này" (Windows thử lại các máy chủ DNS ~11 giây) làm trang admin treo dù ai-service tắt hẳn (SS-07).
     */
    static final Duration HEALTH_DEADLINE = Duration.ofSeconds(3);
    /** Test hạ xuống để kiểm hạn chót mà không phải chờ DNS thật. */
    Duration healthDeadline = HEALTH_DEADLINE;
    /** Luồng chạy lời gọi health: quá hạn thì trả "down" ngay, lời gọi chậm tự kết thúc sau ở luồng daemon này. */
    private final ExecutorService healthExec = Executors.newCachedThreadPool(r -> {
        Thread t = new Thread(r, "ai-health");
        t.setDaemon(true);
        return t;
    });

    @PreDestroy
    void stopHealthExec() {
        healthExec.shutdownNow();
    }

    /** true khi GET /api/extract/health trả 2xx trong hạn chót (3 giây, kể cả phân giải DNS); mọi lỗi = false. */
    public boolean health() {
        return healthBody().isPresent();
    }

    /**
     * GET /api/extract/health (cùng client 2 giây như {@link #health()}) và trả body JSON — cờ từng thành phần
     * {sudachi, jmdict, tesseract, gemini, kanjivg…: boolean} cho dashboard admin (hợp đồng đợt 2 §8). Rỗng khi không gọi được /
     * không 2xx / body không đọc được / quá {@link #HEALTH_DEADLINE}; 2xx không body = object rỗng (dịch vụ vẫn "ok", chỉ là không
     * có cờ).
     */
    public Optional<JsonNode> healthBody() {
        CompletableFuture<Optional<JsonNode>> call;
        try {
            call = CompletableFuture.supplyAsync(this::fetchHealthBody, healthExec);
        } catch (RejectedExecutionException e) { // đã đóng (context tắt)
            return Optional.empty();
        }
        try {
            return call.get(healthDeadline.toMillis(), TimeUnit.MILLISECONDS);
        } catch (TimeoutException | ExecutionException e) {
            return Optional.empty();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Optional.empty();
        }
    }

    private Optional<JsonNode> fetchHealthBody() {
        try {
            var res = healthHttp.get().uri("/api/extract/health").retrieve().toEntity(JsonNode.class);
            if (!res.getStatusCode().is2xxSuccessful()) return Optional.empty();
            JsonNode body = res.getBody();
            return Optional.of(body != null ? body : com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode());
        } catch (RuntimeException e) {
            return Optional.empty();
        }
    }

    /**
     * Văn bản dán / file -> văn bản thuần + meta (OCR, ruby...). Đúng một trong data/text khác null. ocrFallbackConfidence (0..1,
     * cấu hình Admin) gửi thành field "ocr_fallback_confidence"; null = không gửi, ai-service dùng OCR_FALLBACK_CONFIDENCE của nó.
     */
    public TextResult extractText(byte[] data, String filename, String text, String ocrMode, Double ocrFallbackConfidence) {
        MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
        if (data != null) {
            String name = filename != null ? filename : "upload";
            form.add("file", new ByteArrayResource(data) {
                @Override
                public String getFilename() { return name; }
            });
        } else {
            form.add("text", text);
        }
        form.add("ocr_mode", ocrMode != null ? ocrMode : "auto");
        if (ocrFallbackConfidence != null) form.add("ocr_fallback_confidence", String.valueOf(ocrFallbackConfidence));
        return call("trích văn bản", () -> http.post().uri("/api/extract/text")
                .contentType(MediaType.MULTIPART_FORM_DATA).body(form)
                .retrieve().body(TextResult.class));
    }

    public AnalyzeResult analyze(String text, List<Map<String, Object>> blocks, Map<String, Object> options) {
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("text", text);
        body.put("blocks", blocks);
        body.put("options", options);
        return call("phân tích từ vựng", () -> http.post().uri("/api/extract/analyze")
                .contentType(MediaType.APPLICATION_JSON).body(body)
                .retrieve().body(AnalyzeResult.class));
    }

    public EnrichResult enrich(EnrichRequest request) {
        return call("dịch nghĩa", () -> http.post().uri("/api/extract/enrich")
                .contentType(MediaType.APPLICATION_JSON).body(request)
                .retrieve().body(EnrichResult.class));
    }

    // ---------- tra cứu NLP (/api/nlp): trả nguyên JSON của ai-service, tham số đã được NlpService kiểm ----------

    /** GET /api/kanji-info/han-viet-graph: âm Hán-Việt -> chữ Hán -> từ. level null = mọi cấp. */
    public JsonNode hanVietGraph(String reading, String level, int limit) {
        Map<String, Object> vars = new LinkedHashMap<>();
        vars.put("reading", reading);
        vars.put("limit", limit);
        if (level != null) vars.put("level", level);
        return call("tra đồ thị Hán-Việt", () -> nlpHttp.get().uri(u -> {
            u.path("/api/kanji-info/han-viet-graph").queryParam("reading", "{reading}").queryParam("limit", "{limit}");
            if (level != null) u.queryParam("level", "{level}");
            return u.build(vars); // giá trị qua biến URI: được mã hoá trọn (dấu &, +, { } trong chuỗi người dùng không vỡ query)
        }).retrieve().body(JsonNode.class));
    }

    /** GET /api/kanji-info/han-viet-suggest: {query, items: [{reading, count, kanji}]}. */
    public JsonNode hanVietSuggest(String q, int limit) {
        return call("gợi ý âm Hán-Việt", () -> nlpHttp.get().uri(u -> u.path("/api/kanji-info/han-viet-suggest")
                .queryParam("q", "{q}").queryParam("limit", "{limit}").build(Map.of("q", q, "limit", limit)))
                .retrieve().body(JsonNode.class));
    }

    /** POST /api/kanji-info/kanji-cards {kanji, userLevel?}: {items: [...]}. */
    public JsonNode kanjiCards(List<String> kanji, String userLevel) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("kanji", kanji);
        if (userLevel != null) body.put("userLevel", userLevel);
        return call("tra thẻ chữ Hán", () -> nlpHttp.post().uri("/api/kanji-info/kanji-cards")
                .contentType(MediaType.APPLICATION_JSON).body(body)
                .retrieve().body(JsonNode.class));
    }

    /** GET /api/radicals: bảng 214 bộ thủ Khang Hi {items: [...]}. */
    public JsonNode radicals() {
        return call("tra bảng bộ thủ", () -> nlpHttp.get().uri("/api/radicals").retrieve().body(JsonNode.class));
    }

    /** GET /api/radicals/{no}/kanji?levels=N5,N4: chữ JLPT thuộc bộ. levels rỗng = mọi cấp. */
    public JsonNode radicalKanji(int no, List<String> levels) {
        boolean filtered = levels != null && !levels.isEmpty();
        Map<String, Object> vars = new LinkedHashMap<>();
        vars.put("no", no);
        if (filtered) vars.put("levels", String.join(",", levels));
        return call("tra chữ theo bộ thủ", () -> nlpHttp.get().uri(u -> {
            u.path("/api/radicals/{no}/kanji");
            if (filtered) u.queryParam("levels", "{levels}");
            return u.build(vars);
        }).retrieve().body(JsonNode.class));
    }

    /** POST /api/radicals/cards {kanji, withMnemonic}: {items, groups, reason}. */
    public JsonNode radicalCards(List<String> kanji, boolean withMnemonic) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("kanji", kanji);
        body.put("withMnemonic", withMnemonic);
        return call("tra thẻ bộ thủ", () -> nlpHttp.post().uri("/api/radicals/cards")
                .contentType(MediaType.APPLICATION_JSON).body(body)
                .retrieve().body(JsonNode.class));
    }

    // ---------- dùng chung cho các nhóm tính năng gọi ai-service (quiz, luyện tập, nội dung) ----------
    // Mỗi nhóm viết client riêng mỏng (QuizAiClient, PracticeAiClient...) gọi ba hàm này, để không cùng sửa một tệp.

    /**
     * GET JSON tương tác (timeout 30 s). path có thể chứa biến "{x}" lấy từ pathVars; query: giá trị null bị bỏ qua.
     * Mọi giá trị đi qua biến URI nên được mã hoá trọn (dấu &, +, { } trong chuỗi người dùng không vỡ URL).
     */
    public JsonNode getJson(String step, String path, Map<String, ?> pathVars, Map<String, ?> query) {
        Map<String, Object> vars = new LinkedHashMap<>();
        if (pathVars != null) vars.putAll(pathVars);
        Map<String, Object> q = new LinkedHashMap<>();
        if (query != null) query.forEach((k, v) -> { if (v != null) q.put(k, v); });
        q.forEach((k, v) -> vars.put("q_" + k, v));
        return call(step, () -> nlpHttp.get().uri(u -> {
            u.path(path);
            q.keySet().forEach(k -> u.queryParam(k, "{q_" + k + "}"));
            return u.build(vars);
        }).retrieve().body(JsonNode.class));
    }

    /** POST JSON tương tác (timeout 30 s): tra cứu / chấm điểm có người dùng đang chờ trên trang. */
    public JsonNode postJson(String step, String path, Object body) {
        return call(step, () -> nlpHttp.post().uri(path)
                .contentType(MediaType.APPLICATION_JSON).body(body)
                .retrieve().body(JsonNode.class));
    }

    /** POST JSON cho tác vụ dài (timeout như bóc tách, mặc định 3 phút): sinh câu nhiễu cả bộ thẻ, trích nguồn chuẩn... */
    public JsonNode postJsonLong(String step, String path, Object body) {
        return call(step, () -> http.post().uri(path)
                .contentType(MediaType.APPLICATION_JSON).body(body)
                .retrieve().body(JsonNode.class));
    }

    private <T> T call(String step, java.util.function.Supplier<T> request) {
        try {
            T result = request.get();
            if (result == null) throw new AiServiceException("Dịch vụ AI trả về rỗng ở bước " + step + ".");
            return result;
        } catch (RestClientResponseException e) {
            String detail = detail(e.getResponseBodyAsString());
            log.warn("ai-service {} -> {}: {}", step, e.getStatusCode().value(), detail);
            // 400/413/503 có "detail" từ FastAPI: lỗi tài liệu (định dạng, quá lớn, OCR chưa sẵn sàng) -> hiện nguyên văn
            int status = e.getStatusCode().value();
            if (detail != null && (e.getStatusCode().is4xxClientError() || status == 503)) {
                throw new AiServiceException(detail, status, e);
            }
            if (e.getStatusCode().is4xxClientError()) {
                throw new AiServiceException("Dịch vụ AI từ chối yêu cầu (" + step + ").", status, e);
            }
            throw new AiServiceException("Dịch vụ AI gặp lỗi ở bước " + step + ", vui lòng thử lại sau.", status, e);
        } catch (ResourceAccessException e) {
            log.warn("ai-service {} không kết nối được: {}", step, e.getMessage());
            throw new AiServiceException("Không kết nối được dịch vụ AI (" + step + "). Hãy chắc ai-service đang chạy.", e);
        } catch (RestClientException e) {
            // Read timed out giữa chừng khi đọc body (Gemini treo quá AI_SERVICE_READ_TIMEOUT) không phải
            // ResourceAccessException -> vẫn phải gói lại để worker coi là lỗi dịch vụ AI, không phải lỗi hệ thống
            log.warn("ai-service {} không phản hồi kịp: {}", step, e.getMessage());
            throw new AiServiceException("Dịch vụ AI không phản hồi kịp ở bước " + step + ", vui lòng thử lại sau.", e);
        }
    }

    /** FastAPI trả {"detail": "..."}; lấy chuỗi gọn để hiện cho người dùng. */
    private static String detail(String body) {
        if (body == null) return null;
        int i = body.indexOf("\"detail\"");
        if (i < 0) return null;
        int q1 = body.indexOf('"', body.indexOf(':', i) + 1);
        int q2 = q1 >= 0 ? body.indexOf('"', q1 + 1) : -1;
        return q1 >= 0 && q2 > q1 ? body.substring(q1 + 1, q2) : null;
    }
}
