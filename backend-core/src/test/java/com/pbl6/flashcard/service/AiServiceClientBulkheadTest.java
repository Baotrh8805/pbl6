package com.pbl6.flashcard.service;

import com.pbl6.flashcard.service.AiServiceClient.AiServiceException;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Rà soát 25/10 (D3): lời gọi dài từ thread request (postJsonLong, tới 3 phút) bị giới hạn số chạy cùng lúc — ai-service treo thì
 * lời gọi thứ LONG_CALL_PERMITS + 1 nhận 503 "đang bận" sau LONG_CALL_WAIT thay vì giữ thêm một thread Tomcat.
 */
class AiServiceClientBulkheadTest {

    private HttpServer server;
    private String baseUrl;
    private final CountDownLatch release = new CountDownLatch(1);
    private final CountDownLatch arrived = new CountDownLatch(AiServiceClient.LONG_CALL_PERMITS);

    @BeforeEach
    void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.setExecutor(Executors.newCachedThreadPool());
        server.createContext("/api/", ex -> {
            ex.getRequestBody().readAllBytes();
            arrived.countDown();
            try {
                release.await(10, TimeUnit.SECONDS); // giả ai-service treo cho tới khi test thả
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            byte[] bytes = "{\"ok\":true}".getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().add("Content-Type", "application/json");
            ex.sendResponseHeaders(200, bytes.length);
            ex.getResponseBody().write(bytes);
            ex.close();
        });
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void stop() {
        release.countDown();
        server.stop(0);
    }

    @Test
    void extra_long_call_is_refused_with_503_while_all_permits_are_busy() throws Exception {
        AiServiceClient client = new AiServiceClient(RestClient.builder(), baseUrl, "secret", Duration.ofSeconds(15));
        ExecutorService pool = Executors.newFixedThreadPool(AiServiceClient.LONG_CALL_PERMITS);
        try {
            List<Future<?>> busy = new ArrayList<>();
            for (int i = 0; i < AiServiceClient.LONG_CALL_PERMITS; i++) {
                busy.add(pool.submit(() -> client.postJsonLong("treo", "/api/slow", Map.of())));
            }
            assertTrue(arrived.await(10, TimeUnit.SECONDS), "đủ số lời gọi dài đã tới ai-service");

            long t0 = System.nanoTime();
            AiServiceException e = assertThrows(AiServiceException.class,
                    () -> client.postJsonLong("thừa", "/api/slow", Map.of()));
            long waitedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - t0);
            assertEquals(503, e.status());
            assertTrue(waitedMs < 8_000, "từ chối sau LONG_CALL_WAIT, không chờ ai-service: " + waitedMs + " ms");

            release.countDown();
            for (Future<?> f : busy) f.get(10, TimeUnit.SECONDS);
            // chỗ đã trả lại: gọi tiếp được
            assertTrue(client.postJsonLong("lại", "/api/slow", Map.of()).path("ok").asBoolean());
        } finally {
            pool.shutdownNow();
        }
    }
}
