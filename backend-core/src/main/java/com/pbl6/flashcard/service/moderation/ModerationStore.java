package com.pbl6.flashcard.service.moderation;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pbl6.flashcard.dto.moderation.ModerationDtos.Screening;
import com.pbl6.flashcard.dto.moderation.ModerationDtos.Span;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Cột mod_* của dict_comments / deck_ratings, bảng dict_sensitive (V38). JDBC thuần như DictionaryStore: hai bảng có cùng bộ cột nên
 * mọi câu lệnh nhận tham số kind = comment | rating.
 */
@Repository
public class ModerationStore {

    public static final String KIND_COMMENT = "comment";
    public static final String KIND_RATING = "rating";
    static final Set<String> OPEN = Set.of(Screening.FLAGGED, Screening.BLOCKED);
    private static final String DISPLAY_NAME = "COALESCE(NULLIF(trim(u.full_name), ''), split_part(u.email, '@', 1))";
    private static final TypeReference<List<Span>> SPANS = new TypeReference<>() {};

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public ModerationStore(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    // ------------------------------------------------------------------ JSON từ đánh dấu

    public String spansJson(List<Span> spans) {
        if (spans == null || spans.isEmpty()) return null;
        try {
            return json.writeValueAsString(spans);
        } catch (Exception e) {
            return null;
        }
    }

    public List<Span> parseSpans(String s) {
        if (s == null || s.isBlank()) return List.of();
        try {
            return json.readValue(s, SPANS);
        } catch (Exception e) {
            return List.of();
        }
    }

    // ------------------------------------------------------------------ ghi kết quả

    private static String table(String kind) {
        return switch (kind) {
            case KIND_COMMENT -> "dict_comments";
            case KIND_RATING -> "deck_ratings";
            default -> throw new IllegalArgumentException("kind " + kind);
        };
    }

    /** Ghi kết quả AI lên dòng (xoá dấu vết xử lý admin trước đó: sửa bình luận = chấm lại từ đầu). */
    public int apply(String kind, long id, Screening s) {
        return jdbc.update("UPDATE " + table(kind) + " SET mod_status = ?, mod_verdict = ?, mod_label = ?, mod_score = ?, mod_spans = ?, "
                + "mod_at = now(), mod_reviewed_by = NULL, mod_reviewed_at = NULL, mod_review_action = NULL WHERE id = ?",
                s.status(), s.verdict(), s.label(), s.score() == null ? null : s.score().floatValue(), spansJson(s.spans()), id);
    }

    /** Admin xử lý: FLAGGED / BLOCKED / PENDING → REVIEWED với action IGNORE | HIDE | RESTORE. */
    public int review(String kind, long id, Long actor, String action) {
        return jdbc.update("UPDATE " + table(kind) + " SET mod_status = ?, mod_reviewed_by = ?, mod_reviewed_at = now(), "
                + "mod_review_action = ? WHERE id = ?", Screening.REVIEWED, actor, action, id);
    }

    /** Đánh giá gửi lại không kèm bình luận: không còn gì để kiểm. */
    public int clearRating(long id) {
        return jdbc.update("UPDATE deck_ratings SET mod_status = ?, mod_verdict = NULL, mod_label = NULL, mod_score = NULL, "
                + "mod_spans = NULL, mod_at = now(), mod_reviewed_by = NULL, mod_reviewed_at = NULL, mod_review_action = NULL WHERE id = ?",
                Screening.CLEAN, id);
    }

    // ------------------------------------------------------------------ đếm

    /** Số lần AI kết luận BLOCKED của một người kể từ mốc (kể cả đã được admin khôi phục: vẫn là hành vi). */
    public long countBlockedSince(long uid, Instant since) {
        Timestamp t = Timestamp.from(since);
        Long a = jdbc.queryForObject("SELECT count(*) FROM dict_comments WHERE user_id = ? AND mod_verdict = 'BLOCKED' AND mod_at >= ?",
                Long.class, uid, t);
        Long b = jdbc.queryForObject("SELECT count(*) FROM deck_ratings WHERE user_id = ? AND mod_verdict = 'BLOCKED' AND mod_at >= ?",
                Long.class, uid, t);
        return (a == null ? 0 : a) + (b == null ? 0 : b);
    }

    public record Counts(long flagged, long blocked, long pending) {
        public long open() { return flagged + blocked; }
    }

    public Counts counts() {
        Map<String, Long> m = new HashMap<>();
        jdbc.query("SELECT mod_status, count(*) AS n FROM dict_comments WHERE mod_status IN ('FLAGGED','BLOCKED','PENDING') GROUP BY mod_status "
                + "UNION ALL SELECT mod_status, count(*) FROM deck_ratings WHERE comment IS NOT NULL "
                + "AND mod_status IN ('FLAGGED','BLOCKED','PENDING') GROUP BY mod_status",
                rs -> { m.merge(rs.getString(1), rs.getLong(2), Long::sum); });
        return new Counts(m.getOrDefault(Screening.FLAGGED, 0L), m.getOrDefault(Screening.BLOCKED, 0L),
                m.getOrDefault(Screening.PENDING, 0L));
    }

    // ------------------------------------------------------------------ hàng chờ / quét lại

    /** Một dòng của hàng chờ admin hoặc của job quét lại (comment: targetKey = entry_key; rating: targetKey = deck_id). */
    public record Row(String kind, long id, long userId, String content, String spansJson, Integer label, Double score, String status,
                      String verdict, String email, String displayName, String targetKey, String targetTitle, Instant createdAt,
                      Instant hiddenAt, Instant commentLockedUntil) {}

    private static final RowMapper<Row> ROW = (rs, i) -> new Row(rs.getString("kind"), rs.getLong("id"), rs.getLong("user_id"),
            rs.getString("content"), rs.getString("spans"), (Integer) rs.getObject("label"), dbl(rs, "score"),
            rs.getString("status"), rs.getString("verdict"), rs.getString("email"), rs.getString("display_name"),
            rs.getString("target_key"), rs.getString("target_title"), inst(rs, "created_at"), inst(rs, "hidden_at"),
            inst(rs, "comment_locked_until"));

    private static Double dbl(ResultSet rs, String col) throws SQLException {
        double v = rs.getDouble(col);
        return rs.wasNull() ? null : v;
    }

    private static Instant inst(ResultSet rs, String col) throws SQLException {
        Timestamp t = rs.getTimestamp(col);
        return t == null ? null : t.toInstant();
    }

    private static final String COMMENT_SELECT = "SELECT 'comment' AS kind, c.id AS id, c.user_id AS user_id, c.content AS content, "
            + "c.mod_spans AS spans, c.mod_label AS label, c.mod_score AS score, c.mod_status AS status, c.mod_verdict AS verdict, "
            + "u.email AS email, " + DISPLAY_NAME + " AS display_name, u.comment_locked_until AS comment_locked_until, "
            + "c.entry_key AS target_key, m.term AS target_title, c.created_at AS created_at, c.hidden_at AS hidden_at "
            + "FROM dict_comments c JOIN users u ON u.id = c.user_id LEFT JOIN dict_meanings m ON m.entry_key = c.entry_key ";
    private static final String RATING_SELECT = "SELECT 'rating' AS kind, r.id AS id, r.user_id AS user_id, r.comment AS content, "
            + "r.mod_spans AS spans, r.mod_label AS label, r.mod_score AS score, r.mod_status AS status, r.mod_verdict AS verdict, "
            + "u.email AS email, " + DISPLAY_NAME + " AS display_name, u.comment_locked_until AS comment_locked_until, "
            + "r.deck_id AS target_key, d.title AS target_title, r.updated_at AS created_at, CAST(NULL AS timestamptz) AS hidden_at "
            + "FROM deck_ratings r JOIN users u ON u.id = r.user_id JOIN decks d ON d.id = r.deck_id ";

    private static String inList(int n) {
        return "(" + String.join(",", java.util.Collections.nCopies(n, "?")) + ")";
    }

    /** Dòng ở các trạng thái cho trước, cũ nhất trước (job quét lại dùng với PENDING). */
    public List<Row> byStatus(Collection<String> statuses, int limit) {
        List<Object> args = new ArrayList<>();
        String in = inList(statuses.size());
        args.addAll(statuses);
        args.addAll(statuses);
        args.add(limit);
        return jdbc.query("SELECT * FROM (" + COMMENT_SELECT + "WHERE c.mod_status IN " + in + " UNION ALL " + RATING_SELECT
                + "WHERE r.comment IS NOT NULL AND r.mod_status IN " + in + ") x ORDER BY created_at ASC, id ASC LIMIT ?",
                ROW, args.toArray());
    }

    private String queueSql(Collection<String> statuses, String kind, String q, List<Object> args, boolean count) {
        String in = inList(statuses.size());
        StringBuilder sb = new StringBuilder();
        boolean comments = !KIND_RATING.equals(kind);
        boolean ratings = !KIND_COMMENT.equals(kind);
        String like = q == null || q.isBlank() ? null : "%" + q.strip() + "%";
        if (comments) {
            sb.append(COMMENT_SELECT).append("WHERE c.mod_status IN ").append(in);
            args.addAll(statuses);
            if (like != null) { sb.append(" AND (c.content ILIKE ? OR u.email ILIKE ? OR c.entry_key = ?)"); args.add(like); args.add(like); args.add(q.strip()); }
        }
        if (comments && ratings) sb.append(" UNION ALL ");
        if (ratings) {
            sb.append(RATING_SELECT).append("WHERE r.comment IS NOT NULL AND r.mod_status IN ").append(in);
            args.addAll(statuses);
            if (like != null) { sb.append(" AND (r.comment ILIKE ? OR u.email ILIKE ? OR r.deck_id = ?)"); args.add(like); args.add(like); args.add(q.strip()); }
        }
        return count ? "SELECT count(*) FROM (" + sb + ") x" : "SELECT * FROM (" + sb + ") x ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?";
    }

    public List<Row> queue(Collection<String> statuses, String kind, String q, int page, int size) {
        List<Object> args = new ArrayList<>();
        String sql = queueSql(statuses, kind, q, args, false);
        args.add(size);
        args.add((long) page * size);
        return jdbc.query(sql, ROW, args.toArray());
    }

    public long queueCount(Collection<String> statuses, String kind, String q) {
        List<Object> args = new ArrayList<>();
        Long n = jdbc.queryForObject(queueSql(statuses, kind, q, args, true), Long.class, args.toArray());
        return n == null ? 0 : n;
    }

    public Optional<Row> find(String kind, long id) {
        String sql = KIND_RATING.equals(kind) ? RATING_SELECT + "WHERE r.id = ?" : COMMENT_SELECT + "WHERE c.id = ?";
        return jdbc.query(sql, ROW, id).stream().findFirst();
    }

    // ------------------------------------------------------------------ dọn dẹp

    /** Bình luận AI chặn mà không ai xử lý quá hạn: xoá bình luận từ điển, xoá trắng bình luận đánh giá (giữ sao). */
    public int[] purgeBlocked(Instant before) {
        Timestamp t = Timestamp.from(before);
        int a = jdbc.update("DELETE FROM dict_comments WHERE mod_status = 'BLOCKED' AND mod_at < ?", t);
        int b = jdbc.update("UPDATE deck_ratings SET comment = NULL, mod_status = 'CLEAN', mod_verdict = NULL, mod_spans = NULL "
                + "WHERE mod_status = 'BLOCKED' AND mod_at < ?", t);
        return new int[] {a, b};
    }

    // ------------------------------------------------------------------ mục từ nhạy cảm

    public record SensitiveRow(String entryKey, boolean sensitive, Long actorId, String note, Instant updatedAt) {}

    public Optional<SensitiveRow> sensitive(String entryKey) {
        return jdbc.query("SELECT entry_key, sensitive, actor_id, note, updated_at FROM dict_sensitive WHERE entry_key = ?",
                (rs, i) -> new SensitiveRow(rs.getString(1), rs.getBoolean(2), (Long) rs.getObject(3), rs.getString(4), inst(rs, "updated_at")),
                entryKey).stream().findFirst();
    }

    public void setSensitive(String entryKey, boolean sensitive, Long actor, String note) {
        jdbc.update("INSERT INTO dict_sensitive (entry_key, sensitive, actor_id, note, updated_at) VALUES (?,?,?,?,now()) "
                + "ON CONFLICT (entry_key) DO UPDATE SET sensitive = EXCLUDED.sensitive, actor_id = EXCLUDED.actor_id, "
                + "note = EXCLUDED.note, updated_at = now()", entryKey, sensitive, actor, note);
    }

    public static String normalizeKind(String kind) {
        String k = kind == null ? "" : kind.trim().toLowerCase(Locale.ROOT);
        if (!KIND_COMMENT.equals(k) && !KIND_RATING.equals(k)) throw new IllegalArgumentException("kind phải là comment hoặc rating.");
        return k;
    }
}
