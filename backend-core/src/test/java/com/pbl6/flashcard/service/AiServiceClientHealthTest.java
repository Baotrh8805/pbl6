package com.pbl6.flashcard.service;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import java.net.InetSocketAddress;
import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** /api/extract/health của ai-service nằm sau kiểm tra X-Internal-Key: health() phải gửi key như các lời gọi khác. */
class AiServiceClientHealthTest {

    private HttpServer server;
    private String baseUrl;

    @BeforeEach
    void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/extract/health", ex -> {
            int code = "secret".equals(ex.getRequestHeaders().getFirst("X-Internal-Key")) ? 200 : 401;
            ex.sendResponseHeaders(code, -1);
            ex.close();
        });
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    @Test
    void health_sends_internal_key() {
        AiServiceClient withKey = new AiServiceClient(RestClient.builder(), baseUrl, "secret", Duration.ofSeconds(5));
        assertTrue(withKey.health(), "có key -> ai-service trả 200 -> ok");
        AiServiceClient noKey = new AiServiceClient(RestClient.builder(), baseUrl, "", Duration.ofSeconds(5));
        assertFalse(noKey.health(), "không key -> 401 -> down");
    }

    @Test
    void health_is_false_when_service_unreachable() {
        server.stop(0);
        AiServiceClient c = new AiServiceClient(RestClient.builder(), baseUrl, "secret", Duration.ofSeconds(5));
        assertFalse(c.health());
        assertTrue(c.healthBody().isEmpty(), "không kết nối được -> rỗng");
    }

    /**
     * SS-07: hạn chót bao CẢ lời gọi, không chỉ timeout kết nối / đọc của client — resolver chậm trả "không có tên này" (~11 giây
     * trên Windows) từng làm /api/admin/health treo dù ai-service tắt. Ở đây máy chủ trả chậm hơn hạn chót (vẫn trong timeout đọc
     * 2 giây) để kiểm cơ chế hạn chót mà không phụ thuộc DNS của máy chạy test.
     */
    @Test
    void health_gives_up_at_the_deadline_even_when_client_timeouts_have_not_fired() {
        server.removeContext("/api/extract/health");
        server.createContext("/api/extract/health", ex -> {
            try {
                Thread.sleep(1500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            ex.sendResponseHeaders(200, -1);
            ex.close();
        });
        AiServiceClient c = new AiServiceClient(RestClient.builder(), baseUrl, "secret", Duration.ofSeconds(5));
        c.healthDeadline = Duration.ofMillis(200);
        long t0 = System.nanoTime();
        assertTrue(c.healthBody().isEmpty(), "quá hạn chót -> down");
        long ms = (System.nanoTime() - t0) / 1_000_000;
        assertTrue(ms < 1000, "trả ngay khi tới hạn chót, không chờ máy chủ trả lời (1,5 giây): " + ms + " ms");
        // trong hạn chót mặc định thì vẫn "ok": health_sends_internal_key / health_body_returns_engine_flags_with_internal_key
    }

    @Test
    void health_body_returns_engine_flags_with_internal_key() {
        server.removeContext("/api/extract/health");
        server.createContext("/api/extract/health", ex -> {
            if (!"secret".equals(ex.getRequestHeaders().getFirst("X-Internal-Key"))) {
                ex.sendResponseHeaders(401, -1);
                ex.close();
                return;
            }
            byte[] body = "{\"sudachi\":true,\"gemini\":false}".getBytes(java.nio.charset.StandardCharsets.UTF_8);
            ex.getResponseHeaders().add("Content-Type", "application/json");
            ex.sendResponseHeaders(200, body.length);
            ex.getResponseBody().write(body);
            ex.close();
        });
        AiServiceClient withKey = new AiServiceClient(RestClient.builder(), baseUrl, "secret", Duration.ofSeconds(5));
        var body = withKey.healthBody().orElseThrow();
        assertTrue(body.get("sudachi").asBoolean());
        assertFalse(body.get("gemini").asBoolean());
        AiServiceClient noKey = new AiServiceClient(RestClient.builder(), baseUrl, "", Duration.ofSeconds(5));
        assertTrue(noKey.healthBody().isEmpty(), "401 -> rỗng");
    }
}
