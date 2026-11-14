package com.pbl6.flashcard.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pbl6.flashcard.dto.extraction.AiDtos.EnrichInput;
import com.pbl6.flashcard.dto.extraction.AiDtos.EnrichRequest;
import com.pbl6.flashcard.model.AppSetting;
import com.pbl6.flashcard.repository.AppSettingRepository;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * Admin > Cấu hình > Model AI chính (ai_model_primary) có hiệu lực: AiServiceClient đọc SettingsService lúc gọi và gửi kèm ba lượt gọi
 * có Gemini — /extract/text (field multipart "gemini_model", cạnh "ocr_fallback_confidence"), /extract/enrich và /radicals/cards có
 * mẹo nhớ (khoá JSON "geminiModel"). Chưa cấu hình / không đọc được thì không gửi gì để ai-service dùng GEMINI_MODEL của nó.
 */
class AiServiceClientGeminiModelTest {

    private HttpServer server;
    private String baseUrl;
    private final Map<String, String> seen = new ConcurrentHashMap<>();
    private final ObjectMapper json = new ObjectMapper();
    private final SettingsService settings = Mockito.mock(SettingsService.class);

    @BeforeEach
    void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/", this::handle);
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    private AiServiceClient client() {
        return new AiServiceClient(RestClient.builder(), baseUrl, "secret", Duration.ofSeconds(5), settings);
    }

    private void handle(HttpExchange ex) throws IOException {
        String path = ex.getRequestURI().getRawPath();
        seen.put("path", path);
        seen.put("contentType", String.valueOf(ex.getRequestHeaders().getFirst("Content-Type")));
        seen.put("body", new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
        String body = switch (path) {
            case "/api/extract/text" -> "{\"text\":\"日本語\",\"meta\":{},\"blocks\":[]}";
            case "/api/extract/enrich" -> "{\"enriched\":true,\"items\":[],\"reason\":null}";
            default -> "{\"items\":[],\"groups\":[],\"reason\":null,\"model\":null}";
        };
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().add("Content-Type", "application/json");
        ex.sendResponseHeaders(200, bytes.length);
        ex.getResponseBody().write(bytes);
        ex.close();
    }

    /** Giá trị một field của body multipart vừa nhận; null khi không có field đó. */
    private String formField(String name) {
        String body = seen.get("body");
        int i = body.indexOf("name=\"" + name + "\"");
        if (i < 0) return null;
        int start = body.indexOf("\r\n\r\n", i) + 4;
        return body.substring(start, body.indexOf("\r\n--", start));
    }

    private JsonNode jsonBody() throws IOException {
        return json.readTree(seen.get("body"));
    }

    private static List<EnrichInput> oneItem() {
        return List.of(new EnrichInput("1", "語", "ご", null, "word", null));
    }

    @Test
    void configured_model_is_forwarded_on_the_three_gemini_calls() throws Exception {
        Mockito.when(settings.aiModelPrimary()).thenReturn("gemini-2.5-pro");
        AiServiceClient client = client();

        client.extractText(null, null, "日本語", "auto", 0.6);
        assertEquals("/api/extract/text", seen.get("path"));
        assertEquals("gemini-2.5-pro", formField("gemini_model"));
        assertEquals("0.6", formField("ocr_fallback_confidence"), "đi cùng ngưỡng OCR, cùng cách gửi");

        client.enrich(new EnrichRequest("vi", oneItem()));
        assertEquals("/api/extract/enrich", seen.get("path"));
        assertEquals("gemini-2.5-pro", jsonBody().get("geminiModel").asText());
        assertEquals("語", jsonBody().get("items").get(0).get("term").asText());
        // caller tự chọn model thì giữ nguyên
        client.enrich(new EnrichRequest("vi", oneItem(), "gemini-2.5-flash"));
        assertEquals("gemini-2.5-flash", jsonBody().get("geminiModel").asText());

        client.radicalCards(List.of("海"), true);
        assertEquals("/api/radicals/cards", seen.get("path"));
        assertEquals("gemini-2.5-pro", jsonBody().get("geminiModel").asText());
        client.radicalCards(List.of("海"), false);
        assertFalse(jsonBody().has("geminiModel"), "không sinh mẹo -> không gọi Gemini -> không gửi model");
    }

    @Test
    void model_is_read_at_call_time_and_omitted_when_unset() throws Exception {
        // Đổi ở trang Admin có hiệu lực ngay lượt kế tiếp (không cache); xoá trống -> không gửi khoá nào
        Mockito.when(settings.aiModelPrimary()).thenReturn("gemini-2.5-pro", (String) null);
        AiServiceClient client = client();
        client.extractText(null, null, "日本語", "auto", null);
        assertEquals("gemini-2.5-pro", formField("gemini_model"));
        client.extractText(null, null, "日本語", "auto", null);
        assertNull(formField("gemini_model"));
        assertNull(formField("ocr_fallback_confidence"));
        client.enrich(new EnrichRequest("vi", oneItem()));
        assertFalse(jsonBody().has("geminiModel"), "null không gửi thành \"geminiModel\": null");
    }

    @Test
    void client_without_settings_never_sends_model() throws Exception {
        AiServiceClient plain = new AiServiceClient(RestClient.builder(), baseUrl, "secret", Duration.ofSeconds(5));
        assertNull(plain.geminiModel());
        plain.extractText("x".getBytes(StandardCharsets.UTF_8), "a.txt", null, "auto", null);
        assertNull(formField("gemini_model"));
        plain.enrich(new EnrichRequest("vi", oneItem()));
        assertFalse(jsonBody().has("geminiModel"));
    }

    @Test
    void settings_value_is_trimmed_and_blank_missing_or_broken_is_null() {
        AppSettingRepository repo = Mockito.mock(AppSettingRepository.class);
        SettingsService real = new SettingsService(repo, Mockito.mock(AuditService.class));
        Mockito.when(repo.findById(SettingsService.KEY_AI_MODEL_PRIMARY))
                .thenReturn(Optional.of(setting("  gemini-2.5-pro ")), Optional.of(setting("   ")), Optional.of(setting(null)),
                        Optional.empty())
                .thenThrow(new IllegalStateException("DB tạm lỗi"));
        assertEquals("gemini-2.5-pro", real.aiModelPrimary());
        assertNull(real.aiModelPrimary(), "chỉ khoảng trắng");
        assertNull(real.aiModelPrimary(), "giá trị null");
        assertNull(real.aiModelPrimary(), "thiếu dòng (DB sửa tay)");
        assertNull(real.aiModelPrimary(), "lỗi đọc không làm hỏng lượt gọi AI");
    }

    private static AppSetting setting(String value) {
        AppSetting s = new AppSetting();
        s.setKey(SettingsService.KEY_AI_MODEL_PRIMARY);
        s.setValue(value);
        return s;
    }
}
