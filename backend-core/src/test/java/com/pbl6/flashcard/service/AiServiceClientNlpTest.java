package com.pbl6.flashcard.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Lời gọi NLP của AiServiceClient trên HTTP thật (HttpServer của JDK): đúng đường dẫn ai-service, query được mã hoá trọn, có
 * X-Internal-Key, body JSON đúng tên trường, và mã lỗi của ai-service đi kèm AiServiceException để NlpService đổi ra HTTP.
 */
class AiServiceClientNlpTest {

    private HttpServer server;
    private AiServiceClient client;
    private final Map<String, String> seen = new ConcurrentHashMap<>();
    private final ObjectMapper json = new ObjectMapper();

    @BeforeEach
    void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/", this::handle);
        server.start();
        client = new AiServiceClient(RestClient.builder(), "http://127.0.0.1:" + server.getAddress().getPort(), "secret",
                Duration.ofSeconds(5));
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    private void handle(HttpExchange ex) throws IOException {
        String path = ex.getRequestURI().getRawPath();
        seen.put("method", ex.getRequestMethod());
        seen.put("path", path);
        seen.put("rawQuery", String.valueOf(ex.getRequestURI().getRawQuery()));
        seen.put("key", String.valueOf(ex.getRequestHeaders().getFirst("X-Internal-Key")));
        seen.put("body", new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
        int code = 200;
        String body = "{\"ok\":true}";
        if (path.equals("/api/radicals/7/kanji")) {
            code = 404;
            body = "{\"detail\":\"Không có bộ thủ số 7\"}";
        } else if (path.equals("/api/radicals")) {
            code = 500;
            body = "Internal Server Error";
        }
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().add("Content-Type", code == 500 ? "text/plain" : "application/json");
        ex.sendResponseHeaders(code, bytes.length);
        ex.getResponseBody().write(bytes);
        ex.close();
    }

    private String queryParam(String name) {
        for (String pair : seen.get("rawQuery").split("&")) {
            int i = pair.indexOf('=');
            if (i > 0 && pair.substring(0, i).equals(name)) {
                return URLDecoder.decode(pair.substring(i + 1), StandardCharsets.UTF_8);
            }
        }
        return null;
    }

    @Test
    void get_endpoints_hit_ai_service_paths_with_encoded_query_and_key() throws Exception {
        JsonNode r = client.hanVietGraph("nhật & a+b {x}", "N5", 30);
        assertTrue(r.get("ok").asBoolean());
        assertEquals("GET", seen.get("method"));
        assertEquals("/api/kanji-info/han-viet-graph", seen.get("path"));
        assertEquals("secret", seen.get("key"));
        assertEquals("nhật & a+b {x}", queryParam("reading"), "ký tự đặc biệt không làm vỡ query");
        assertEquals("N5", queryParam("level"));
        assertEquals("30", queryParam("limit"));

        client.hanVietGraph("thuy", null, 10);
        assertEquals(null, queryParam("level"), "không lọc cấp -> không gửi level");

        client.hanVietSuggest("nh", 5);
        assertEquals("/api/kanji-info/han-viet-suggest", seen.get("path"));
        assertEquals("nh", queryParam("q"));
        assertEquals("5", queryParam("limit"));

        client.radicalKanji(85, List.of("N5", "N4"));
        assertEquals("/api/radicals/85/kanji", seen.get("path"));
        assertEquals("N5,N4", queryParam("levels"));
        client.radicalKanji(85, List.of());
        assertFalse(seen.get("rawQuery").contains("levels"));
    }

    @Test
    void post_endpoints_send_json_bodies() throws Exception {
        client.kanjiCards(List.of("水", "火"), "N4");
        assertEquals("POST", seen.get("method"));
        assertEquals("/api/kanji-info/kanji-cards", seen.get("path"));
        assertEquals(json.readTree("{\"kanji\":[\"水\",\"火\"],\"userLevel\":\"N4\"}"), json.readTree(seen.get("body")));
        client.kanjiCards(List.of("水"), null);
        assertFalse(json.readTree(seen.get("body")).has("userLevel"));

        client.radicalCards(List.of("河"), false);
        assertEquals("/api/radicals/cards", seen.get("path"));
        assertEquals(json.readTree("{\"kanji\":[\"河\"],\"withMnemonic\":false}"), json.readTree(seen.get("body")));
    }

    @Test
    void errors_carry_ai_service_status() {
        AiServiceClient.AiServiceException notFound = assertThrows(AiServiceClient.AiServiceException.class,
                () -> client.radicalKanji(7, null));
        assertEquals(404, notFound.status());
        assertEquals("Không có bộ thủ số 7", notFound.getMessage());

        AiServiceClient.AiServiceException failed = assertThrows(AiServiceClient.AiServiceException.class, client::radicals);
        assertEquals(500, failed.status());

        server.stop(0);
        AiServiceClient.AiServiceException down = assertThrows(AiServiceClient.AiServiceException.class, client::radicals);
        assertEquals(0, down.status(), "không kết nối được: không có mã HTTP");
        assertTrue(down.getMessage().contains("Không kết nối được dịch vụ AI"));
    }
}
