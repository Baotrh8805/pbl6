package com.pbl6.flashcard.service.graph;

import com.pbl6.flashcard.service.AiServiceClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Đồng bộ lớp người học Postgres → Neo4j qua ai-service (spec 2026-10-27 §5). Backend là chủ dữ liệu: đọc bằng JDBC theo trang
 * {@value #BATCH} dòng, mỗi trang một lô POST /api/graph/sync cùng một mã {@code run}, rồi POST /sync/finish để ai-service xoá
 * những gì không còn trong run (xoá ở Postgres → mất ở Neo4j). Không gửi email / họ tên / mật khẩu: chỉ id + cấp JLPT. Staff và
 * tài khoản đã xoá ({@code @deleted.local}) không đồng bộ.
 */
@Service
public class GraphSyncService {

    private static final Logger log = LoggerFactory.getLogger(GraphSyncService.class);
    static final int BATCH = 2000;
    static final String LIVE_USER = "u.role = 'USER' AND u.email NOT LIKE '%@deleted.local'";

    public record SyncResult(String run, String scope, Long userId, Map<String, Integer> rows, long millis, Instant at) {}

    private final JdbcTemplate jdbc;
    private final GraphAiClient ai;
    private final AtomicBoolean fullRunning = new AtomicBoolean(false);
    private final AtomicReference<SyncResult> lastFull = new AtomicReference<>();
    private final AtomicReference<String> lastFullError = new AtomicReference<>();

    public GraphSyncService(JdbcTemplate jdbc, GraphAiClient ai) {
        this.jdbc = jdbc;
        this.ai = ai;
    }

    /** Toàn bộ người học + nghĩa Việt từ điển (job đêm, admin "Đồng bộ ngay"). Đồng bộ; lỗi ai-service ném ra. */
    public SyncResult syncAll() {
        return run("all", null);
    }

    /** Dữ liệu của một người (trang đồ thị mở, hoặc POST /api/graph/sync/me); nghĩa Việt chỉ cho từ có trong thẻ của họ. */
    public SyncResult syncUser(Long uid) {
        return run("user", uid);
    }

    /** Admin bấm "Đồng bộ ngay": chạy syncAll ở luồng nền; false nếu đang chạy dở. */
    public boolean startFullSync() {
        if (!fullRunning.compareAndSet(false, true)) return false;
        Thread t = new Thread(() -> {
            try {
                lastFull.set(syncAll());
                lastFullError.set(null);
            } catch (RuntimeException e) {
                log.warn("graph: đồng bộ toàn bộ lỗi: {}", e.getMessage());
                lastFullError.set(e.getMessage());
            } finally {
                fullRunning.set(false);
            }
        }, "graph-sync");
        t.setDaemon(true);
        t.start();
        return true;
    }

    public boolean isFullSyncRunning() { return fullRunning.get(); }
    public SyncResult lastFullSync() { return lastFull.get(); }
    public String lastFullSyncError() { return lastFullError.get(); }

    /** Job đêm ghi kết quả vào cùng chỗ với admin để dashboard hiện "lần đồng bộ gần nhất". */
    void recordFull(SyncResult r) { lastFull.set(r); lastFullError.set(null); }

    private SyncResult run(String scope, Long uid) {
        long started = System.currentTimeMillis();
        String run = UUID.randomUUID().toString();
        Map<String, Integer> rows = new LinkedHashMap<>();
        boolean user = uid != null;
        Object[] own = user ? new Object[]{uid} : new Object[0];

        rows.put("users", push(run, scope, uid, "users",
                "SELECT u.id, u.jlpt_level FROM users u WHERE " + LIVE_USER + (user ? " AND u.id = ?" : "") + " ORDER BY u.id",
                own, (rs, i) -> map("id", rs.getLong("id"), "level", rs.getString("jlpt_level"))));
        rows.put("decks", push(run, scope, uid, "decks",
                "SELECT d.id, d.title, d.level, d.owner_id FROM decks d JOIN users u ON u.id = d.owner_id WHERE " + LIVE_USER
                        + (user ? " AND d.owner_id = ?" : "") + " ORDER BY d.id",
                own, (rs, i) -> map("id", rs.getString("id"), "title", rs.getString("title"), "level", rs.getString("level"),
                        "ownerId", rs.getLong("owner_id"))));
        rows.put("cards", push(run, scope, uid, "cards",
                "SELECT f.id, f.deck_id, d.owner_id, f.term, f.reading, f.meaning, f.position FROM flashcards f "
                        + "JOIN decks d ON d.id = f.deck_id JOIN users u ON u.id = d.owner_id WHERE " + LIVE_USER
                        + (user ? " AND d.owner_id = ?" : "") + " ORDER BY f.id",
                own, (rs, i) -> map("id", rs.getString("id"), "deckId", rs.getString("deck_id"), "ownerId", rs.getLong("owner_id"),
                        "term", rs.getString("term"), "reading", rs.getString("reading"), "meaning", rs.getString("meaning"),
                        "pos", rs.getObject("position", Integer.class))));
        rows.put("reviews", push(run, scope, uid, "reviews",
                "SELECT r.user_id, r.card_id, r.ease, r.interval_days, r.reps, r.due_at, "
                        + "(SELECT count(*) FROM review_logs l WHERE l.user_id = r.user_id AND l.card_id = r.card_id AND l.grade = 'again' "
                        + "AND l.reviewed_at >= now() - interval '30 days') AS again30d, "
                        + "(SELECT max(l.reviewed_at) FROM review_logs l WHERE l.user_id = r.user_id AND l.card_id = r.card_id) AS last_at "
                        + "FROM reviews r JOIN users u ON u.id = r.user_id WHERE " + LIVE_USER + (user ? " AND r.user_id = ?" : "")
                        + " ORDER BY r.id",
                own, (rs, i) -> map("userId", rs.getLong("user_id"), "cardId", rs.getString("card_id"), "ease", rs.getDouble("ease"),
                        "intervalDays", rs.getInt("interval_days"), "reps", rs.getInt("reps"), "dueAt", iso(rs, "due_at"),
                        "again30d", rs.getInt("again30d"), "lastAt", iso(rs, "last_at"))));
        rows.put("paths", push(run, scope, uid, "paths",
                "SELECT p.id, p.user_id, p.title, p.status FROM learning_paths p JOIN users u ON u.id = p.user_id WHERE " + LIVE_USER
                        + " AND p.status <> 'FAILED'" + (user ? " AND p.user_id = ?" : "") + " ORDER BY p.created_at, p.id",
                own, (rs, i) -> map("id", rs.getString("id"), "userId", rs.getLong("user_id"), "title", rs.getString("title"),
                        "status", rs.getString("status"))));
        rows.put("chapters", push(run, scope, uid, "chapters",
                "SELECT c.id, c.path_id, p.user_id, c.title, c.position, c.deck_id FROM learning_path_chapters c "
                        + "JOIN learning_paths p ON p.id = c.path_id JOIN users u ON u.id = p.user_id WHERE " + LIVE_USER
                        + " AND p.status <> 'FAILED'" + (user ? " AND p.user_id = ?" : "") + " ORDER BY c.path_id, c.position, c.id",
                own, (rs, i) -> map("id", rs.getString("id"), "pathId", rs.getString("path_id"), "ownerId", rs.getLong("user_id"),
                        "title", rs.getString("title"), "position", rs.getInt("position"), "deckId", rs.getString("deck_id"))));
        rows.put("pathCards", push(run, scope, uid, "pathCards",
                "SELECT lc.chapter_id, lc.card_id, lc.seq, lc.scheduled_day FROM learning_path_cards lc "
                        + "JOIN learning_paths p ON p.id = lc.path_id JOIN users u ON u.id = p.user_id WHERE " + LIVE_USER
                        + " AND p.status <> 'FAILED'" + (user ? " AND p.user_id = ?" : "") + " ORDER BY lc.id",
                own, (rs, i) -> map("chapterId", rs.getString("chapter_id"), "cardId", rs.getString("card_id"), "seq", rs.getInt("seq"),
                        "day", rs.getInt("scheduled_day"))));
        rows.put("meanings", push(run, scope, uid, "meanings",
                user ? "SELECT m.entry_key, m.meaning_vi FROM dict_meanings m WHERE m.entry_key LIKE 'w:%' AND m.term IN "
                        + "(SELECT f.term FROM flashcards f JOIN decks d ON d.id = f.deck_id WHERE d.owner_id = ?) ORDER BY m.entry_key"
                        : "SELECT m.entry_key, m.meaning_vi FROM dict_meanings m WHERE m.entry_key LIKE 'w:%' ORDER BY m.entry_key",
                own, (rs, i) -> map("key", rs.getString("entry_key"), "vi", rs.getString("meaning_vi"))));
        ai.syncFinish(run, scope, uid);
        SyncResult result = new SyncResult(run, scope, uid, rows, System.currentTimeMillis() - started, Instant.now());
        log.info("graph: đồng bộ {} {} xong trong {} ms: {}", scope, uid == null ? "" : "user " + uid, result.millis(), rows);
        return result;
    }

    /** Đọc theo trang và gửi mỗi trang một lô; trả tổng số dòng. Trang rỗng ngay từ đầu → không gửi gì. */
    private int push(String run, String scope, Long uid, String kind, String sql, Object[] args, RowMapper<Map<String, Object>> mapper) {
        int total = 0;
        for (int offset = 0; ; offset += BATCH) {
            Object[] all = new Object[args.length + 2];
            System.arraycopy(args, 0, all, 0, args.length);
            all[args.length] = BATCH;
            all[args.length + 1] = offset;
            List<Map<String, Object>> page = jdbc.query(sql + " LIMIT ? OFFSET ?", mapper, all);
            if (page.isEmpty()) break;
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("run", run);
            body.put("scope", scope);
            if (uid != null) body.put("userId", uid);
            body.put(kind, page);
            ai.sync(body);
            total += page.size();
            if (page.size() < BATCH) break;
        }
        return total;
    }

    private static String iso(ResultSet rs, String col) throws SQLException {
        OffsetDateTime t = rs.getObject(col, OffsetDateTime.class);
        return t == null ? null : t.toString();
    }

    private static Map<String, Object> map(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    /** Lỗi ai-service khi đồng bộ: giữ nguyên để caller quyết định (job ghi log, API trả 503). */
    static boolean isUnavailable(AiServiceClient.AiServiceException e) {
        return e.status() == 0 || e.status() == 503;
    }

    /** Dùng cho test: trang đầu của một truy vấn, không gửi đi. */
    List<Map<String, Object>> peek(String sql, Object... args) {
        List<Map<String, Object>> out = new ArrayList<>();
        jdbc.query(sql, rs -> { out.add(Map.of("n", rs.getObject(1))); }, args);
        return out;
    }
}
