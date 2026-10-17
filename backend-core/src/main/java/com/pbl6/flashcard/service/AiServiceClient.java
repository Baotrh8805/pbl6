package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.extraction.AiDtos.AnalyzeResult;
import com.pbl6.flashcard.dto.extraction.AiDtos.EnrichRequest;
import com.pbl6.flashcard.dto.extraction.AiDtos.EnrichResult;
import com.pbl6.flashcard.dto.extraction.AiDtos.TextResult;
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
import java.util.List;
import java.util.Map;

/**
 * Gọi ai-service (FastAPI) cho luồng bóc tách. RestClient có sẵn trong starter-web, không cần WebFlux.
 * Mọi lỗi mạng / 5xx gói thành {@link AiServiceException} để worker đánh dấu job FAILED với thông điệp tiếng Việt.
 */
@Service
public class AiServiceClient {

    private static final Logger log = LoggerFactory.getLogger(AiServiceClient.class);

    public static class AiServiceException extends RuntimeException {
        public AiServiceException(String message, Throwable cause) { super(message, cause); }
        public AiServiceException(String message) { super(message); }
    }

    private final RestClient http;
    /** Kiểm tra sức khoẻ cho dashboard admin: timeout ngắn, không dùng chung client đọc 3 phút. */
    private final RestClient healthHttp;

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
        this.healthHttp = builder.clone().baseUrl(baseUrl).requestFactory(quick).build();
    }

    /** true khi GET /api/extract/health trả 2xx trong 2 giây; mọi lỗi = false. */
    public boolean health() {
        try {
            return healthHttp.get().uri("/api/extract/health").retrieve().toBodilessEntity().getStatusCode().is2xxSuccessful();
        } catch (RuntimeException e) {
            return false;
        }
    }

    /** Văn bản dán / file -> văn bản thuần + meta (OCR, ruby...). Đúng một trong data/text khác null. */
    public TextResult extractText(byte[] data, String filename, String text, String ocrMode) {
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

    private <T> T call(String step, java.util.function.Supplier<T> request) {
        try {
            T result = request.get();
            if (result == null) throw new AiServiceException("Dịch vụ AI trả về rỗng ở bước " + step + ".");
            return result;
        } catch (RestClientResponseException e) {
            String detail = detail(e.getResponseBodyAsString());
            log.warn("ai-service {} -> {}: {}", step, e.getStatusCode().value(), detail);
            // 400/413/503 có "detail" từ FastAPI: lỗi tài liệu (định dạng, quá lớn, OCR chưa sẵn sàng) -> hiện nguyên văn
            if (detail != null && (e.getStatusCode().is4xxClientError() || e.getStatusCode().value() == 503)) {
                throw new AiServiceException(detail, e);
            }
            if (e.getStatusCode().is4xxClientError()) {
                throw new AiServiceException("Dịch vụ AI từ chối yêu cầu (" + step + ").", e);
            }
            throw new AiServiceException("Dịch vụ AI gặp lỗi ở bước " + step + ", vui lòng thử lại sau.", e);
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
