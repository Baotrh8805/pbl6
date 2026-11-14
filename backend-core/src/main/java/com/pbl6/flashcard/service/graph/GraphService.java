package com.pbl6.flashcard.service.graph;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.config.CodedStatusException;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.repository.UserRepository;
import com.pbl6.flashcard.security.AttemptLimiter;
import com.pbl6.flashcard.service.AiServiceClient;
import com.pbl6.flashcard.service.AuditService;
import com.pbl6.flashcard.service.SettingsService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * Đồ thị tri thức cho người học (spec 2026-10-27 §8, §10): userId luôn từ JWT; hạn mức hỏi đáp / khám phá / tự đồng bộ; dữ liệu
 * của người đó được đồng bộ "lười" khi cũ hơn {@link #FRESH} (bộ nhớ RAM, mất khi khởi động lại = đồng bộ lại, vô hại).
 * Neo4j / ai-service tắt → 503 {@code GRAPH_UNAVAILABLE} với thông điệp tiếng Việt.
 */
@Service
public class GraphService {

    private static final Logger log = LoggerFactory.getLogger(GraphService.class);
    static final Duration FRESH = Duration.ofMinutes(10);
    static final Duration RETRY_AFTER_FAILURE = Duration.ofMinutes(1);
    public static final int MAX_QUERY = 64;
    public static final int MAX_QUESTION = 300;
    public static final String CODE_UNAVAILABLE = "GRAPH_UNAVAILABLE";
    public static final String MSG_UNAVAILABLE = "Đồ thị tri thức chưa sẵn sàng (Neo4j chưa chạy hoặc chưa dựng dữ liệu).";

    private final GraphAiClient ai;
    private final GraphSyncService sync;
    private final UserRepository users;
    private final SettingsService settings;
    private final AuditService audit;
    private final AttemptLimiter askLimiter;
    private final AttemptLimiter exploreLimiter = new AttemptLimiter(120, Duration.ofMinutes(1));
    private final AttemptLimiter syncLimiter = new AttemptLimiter(1, Duration.ofMinutes(1));
    private final Map<Long, Instant> lastSync = new ConcurrentHashMap<>();
    private final int askPerHour;

    public GraphService(GraphAiClient ai, GraphSyncService sync, UserRepository users, SettingsService settings, AuditService audit,
                        @Value("${app.graph.ask-per-hour:20}") int askPerHour) {
        this.ai = ai;
        this.sync = sync;
        this.users = users;
        this.settings = settings;
        this.audit = audit;
        this.askPerHour = askPerHour;
        this.askLimiter = new AttemptLimiter(askPerHour, Duration.ofHours(1));
    }

    public JsonNode explore(Long uid, String q, int limit) {
        String query = clean(q, MAX_QUERY, "Từ khoá cần tra");
        limit(exploreLimiter, uid, "Bạn tra quá nhanh, vui lòng thử lại sau.");
        freshen(uid);
        return guard(() -> ai.explore(query, uid, Math.max(1, Math.min(limit, 60))));
    }

    public JsonNode path(Long uid, String from, String to) {
        String a = clean(from, MAX_QUERY, "Điểm đầu");
        String b = clean(to, MAX_QUERY, "Điểm cuối");
        limit(exploreLimiter, uid, "Bạn tra quá nhanh, vui lòng thử lại sau.");
        return guard(() -> ai.path(a, b));
    }

    public JsonNode recommend(Long uid) {
        limit(exploreLimiter, uid, "Bạn tra quá nhanh, vui lòng thử lại sau.");
        freshen(uid);
        return guard(() -> ai.recommend(uid, level(uid), 8));
    }

    public JsonNode conflicts(Long uid) {
        limit(exploreLimiter, uid, "Bạn tra quá nhanh, vui lòng thử lại sau.");
        freshen(uid);
        return guard(() -> ai.conflicts(uid));
    }

    public JsonNode ask(Long uid, String question) {
        String qn = clean(question, MAX_QUESTION, "Câu hỏi");
        limit(askLimiter, uid, "Bạn đã hỏi " + askPerHour + " câu trong một giờ, vui lòng quay lại sau.");
        freshen(uid);
        return guard(() -> ai.ask(qn, uid, level(uid), settings.aiModelPrimary()));
    }

    /** POST /api/graph/sync/me: đồng bộ ngay dữ liệu của mình (tối đa 1 lần / phút). */
    public Map<String, Object> syncMe(Long uid) {
        limit(syncLimiter, uid, "Vừa đồng bộ xong, hãy đợi một phút rồi thử lại.");
        GraphSyncService.SyncResult r = guard(() -> sync.syncUser(uid));
        lastSync.put(uid, Instant.now());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("run", r.run());
        out.put("rows", r.rows());
        out.put("millis", r.millis());
        return out;
    }

    /** Admin > Tổng quan: trạng thái ai-service / Neo4j + lần đồng bộ toàn bộ gần nhất của backend. */
    public Map<String, Object> adminStatus() {
        Map<String, Object> out = new LinkedHashMap<>();
        try {
            out.put("ai", ai.status());
        } catch (AiServiceClient.AiServiceException e) {
            out.put("ai", Map.of("available", false, "built", false, "error", e.getMessage()));
        }
        out.put("syncing", sync.isFullSyncRunning());
        GraphSyncService.SyncResult last = sync.lastFullSync();
        out.put("lastSync", last == null ? null : Map.of("at", last.at().toString(), "rows", last.rows(), "millis", last.millis()));
        out.put("lastSyncError", sync.lastFullSyncError());
        return out;
    }

    /** Admin: dựng lại lớp tham chiếu (ai-service chạy nền) + audit GRAPH_BUILD. AuditService cần giao dịch đang mở. */
    @Transactional
    public JsonNode adminBuild(Long actorId, boolean withGrammar) {
        JsonNode out = guard(() -> ai.build(withGrammar));
        audit.log(actorId, "GRAPH_BUILD", "GRAPH", "reference",
                Map.of("withGrammar", withGrammar, "started", out.path("started").asBoolean(false)));
        return out;
    }

    /** Admin: đồng bộ toàn bộ người học ở luồng nền của backend + audit GRAPH_SYNC; đang chạy → started false. */
    @Transactional
    public Map<String, Object> adminSyncAll(Long actorId) {
        boolean started = sync.startFullSync();
        audit.log(actorId, "GRAPH_SYNC", "GRAPH", "learner", Map.of("started", started));
        return Map.of("started", started, "syncing", true);
    }

    /** Test / tiện ích: quên mốc đồng bộ của một người để lần gọi sau đồng bộ lại. */
    public void forget(Long uid) {
        lastSync.remove(uid);
    }

    private void freshen(Long uid) {
        Instant last = lastSync.get(uid);
        if (last != null && last.plus(FRESH).isAfter(Instant.now())) return;
        try {
            sync.syncUser(uid);
            lastSync.put(uid, Instant.now());
        } catch (AiServiceClient.AiServiceException e) {
            // không chặn truy vấn: ai-service tắt thì chính truy vấn sẽ báo 503; lỗi khác thử lại sau một phút
            lastSync.put(uid, Instant.now().minus(FRESH).plus(RETRY_AFTER_FAILURE));
            log.debug("graph: đồng bộ lười user {} lỗi: {}", uid, e.getMessage());
        }
    }

    private String level(Long uid) {
        return users.findById(uid).map(User::getJlptLevel).orElse(null);
    }

    private static String clean(String s, int max, String what) {
        String v = s == null ? "" : s.strip();
        if (v.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, what + " không được để trống.");
        if (v.length() > max) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, what + " tối đa " + max + " ký tự.");
        return v;
    }

    private static void limit(AttemptLimiter limiter, Long uid, String message) {
        String key = String.valueOf(uid);
        if (limiter.isBlocked(key)) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, message);
        limiter.record(key);
    }

    public static <T> T guard(Supplier<T> call) {
        try {
            return call.get();
        } catch (AiServiceClient.AiServiceException e) {
            if (e.status() == 400 || e.status() == 422) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Yêu cầu không hợp lệ: " + e.getMessage());
            }
            if (e.status() == 0 || e.status() == 503) {
                throw new CodedStatusException(HttpStatus.SERVICE_UNAVAILABLE, CODE_UNAVAILABLE, MSG_UNAVAILABLE);
            }
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Đồ thị tri thức tạm thời không khả dụng, vui lòng thử lại sau.");
        }
    }
}
