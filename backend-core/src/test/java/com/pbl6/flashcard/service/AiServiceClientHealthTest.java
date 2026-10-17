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
    }
}
