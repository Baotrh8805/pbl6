package com.pbl6.flashcard.service;

import com.pbl6.flashcard.service.AiServiceClient.AiServiceException;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Spec 21/10 (OCR hạ cấp khi Gemini quá tải): ai-service trả 503 kèm {@code "code":"aiOverloaded"} khi Gemini quá tải mà không
 * có bản Tesseract dùng được. Client phải nhận ra để worker ghi failure_kind = AI_OVERLOADED (không tính hạn mức); 503 thường
 * (OCR engine unavailable) vẫn là lỗi dịch vụ như cũ.
 */
class AiServiceClientOverloadTest {

    private HttpServer server;
    private String baseUrl;
    private volatile int status = 200;
    private volatile String body = "{}";

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

    private void handle(HttpExchange ex) throws IOException {
        ex.getRequestBody().readAllBytes();
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().add("Content-Type", "application/json");
        ex.sendResponseHeaders(status, bytes.length);
        ex.getResponseBody().write(bytes);
        ex.close();
    }

    private void respond(int status, String body) {
        this.status = status;
        this.body = body;
    }

    private AiServiceClient client() {
        return new AiServiceClient(RestClient.builder(), baseUrl, "secret", Duration.ofSeconds(5));
    }

    @Test
    void overloaded_503_sets_flag_and_keeps_detail() {
        respond(503, "{\"detail\":\"Dịch vụ AI đang quá tải, hãy thử lại sau vài phút.\",\"code\":\"aiOverloaded\"}");
        AiServiceException e = assertThrows(AiServiceException.class,
                () -> client().extractText(null, null, "日本語", "auto", null));
        assertTrue(e.isOverloaded());
        assertEquals(503, e.status());
        assertEquals("Dịch vụ AI đang quá tải, hãy thử lại sau vài phút.", e.getMessage());
    }

    @Test
    void plain_503_detail_is_not_overloaded() {
        respond(503, "{\"detail\":\"OCR engine unavailable: chưa cài Tesseract\"}");
        AiServiceException e = assertThrows(AiServiceException.class,
                () -> client().extractText(null, null, "日本語", "auto", null));
        assertFalse(e.isOverloaded());
        assertEquals("OCR engine unavailable: chưa cài Tesseract", e.getMessage());
    }

    @Test
    void old_constructors_default_to_not_overloaded() {
        assertFalse(new AiServiceException("x").isOverloaded());
        assertFalse(new AiServiceException("x", 503, null).isOverloaded());
    }
}
