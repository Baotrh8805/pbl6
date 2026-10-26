package com.pbl6.flashcard.service.dictionary;

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
import java.util.Map;
import java.util.Optional;

/**
 * Truy cập các bảng dict_* của V32 bằng JDBC (như QuestionBankService / ConflictService): nhiều câu là INSERT ... ON CONFLICT,
 * gộp nhóm và UNION cho hàng chờ admin — gọn hơn entity JPA. Mọi thời điểm cắt tới micro giây ở DB (timestamptz(6)).
 */
@Repository
public class DictionaryStore {

    public static final String MACHINE = "MACHINE";
    public static final String VERIFIED = "VERIFIED";
    /** Biểu thức tên hiển thị không lộ email (như DeckRatingRepository). */
    static final String DISPLAY_NAME = "COALESCE(NULLIF(trim(u.full_name), ''), split_part(u.email, '@', 1))";

    private final JdbcTemplate jdbc;

    public DictionaryStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ------------------------------------------------------------------ nghĩa tiếng Việt

    public record Meaning(String entryKey, String term, String reading, String level, String meaningVi, String status,
                          String source, String model, Instant updatedAt, Long updatedBy, Instant verifiedAt, Long verifiedBy) {}

    private static final RowMapper<Meaning> MEANING = (rs, i) -> new Meaning(rs.getString("entry_key"), rs.getString("term"),
            rs.getString("reading"), rs.getString("level"), rs.getString("meaning_vi"), rs.getString("status"),
            rs.getString("source"), rs.getString("model"), inst(rs, "updated_at"), longOrNull(rs, "updated_by"),
            inst(rs, "verified_at"), longOrNull(rs, "verified_by"));

    public Optional<Meaning> meaning(String key) {
        return jdbc.query("SELECT * FROM dict_meanings WHERE entry_key = ?", MEANING, key).stream().findFirst();
    }

    public Map<String, Meaning> meanings(Collection<String> keys) {
        Map<String, Meaning> out = new HashMap<>();
        if (keys.isEmpty()) return out;
        String in = String.join(",", keys.stream().map(k -> "?").toList());
        jdbc.query("SELECT * FROM dict_meanings WHERE entry_key IN (" + in + ")", MEANING, keys.toArray())
                .forEach(m -> out.put(m.entryKey(), m));
        return out;
    }

    /** Khoá so (dạng viết, cách đọc hiragana) dùng cho {@link #meaningsByTerm}. */
    public static String termKey(String term, String reading) {
        return (term == null ? "" : term.strip()) + "|" + toHira(reading);
    }

    static String toHira(String s) {
        if (s == null) return "";
        StringBuilder b = new StringBuilder(s.length());
        s.strip().codePoints().forEach(cp -> b.appendCodePoint(cp >= 0x30A1 && cp <= 0x30F6 ? cp - 0x60 : cp));
        return b.toString();
    }

    /**
     * Nghĩa theo dạng viết (bóc tách không có dictKey): {termKey(term, reading) -> nghĩa}, thêm khoá termKey(term, "") cho dạng viết
     * chỉ có một nghĩa (cách đọc lệch giữa Sudachi và dữ liệu). Bản đã kiểm thắng bản máy dịch khi trùng khoá.
     */
    public Map<String, Meaning> meaningsByTerm(Collection<String> terms) {
        Map<String, Meaning> out = new HashMap<>();
        if (terms.isEmpty()) return out;
        String in = String.join(",", terms.stream().map(t -> "?").toList());
        Map<String, Integer> perTerm = new HashMap<>();
        List<Meaning> rows = jdbc.query("SELECT * FROM dict_meanings WHERE term IN (" + in + ") ORDER BY (status = 'VERIFIED'), entry_key",
                MEANING, terms.toArray());
        for (Meaning m : rows) {
            out.put(termKey(m.term(), m.reading()), m);
            perTerm.merge(m.term(), 1, Integer::sum);
        }
        for (Meaning m : rows) {
            if (perTerm.getOrDefault(m.term(), 0) == 1) out.putIfAbsent(termKey(m.term(), ""), m);
        }
        return out;
    }

    /** Ghi nghĩa máy dịch nếu chưa có dòng (không đè bản admin / seed đã có). Trả true khi đã chèn. */
    public boolean insertMachineMeaning(String key, String term, String reading, String level, String meaningVi, String source,
                                        String model) {
        return jdbc.update("INSERT INTO dict_meanings (entry_key, term, reading, level, meaning_vi, status, source, model) "
                + "VALUES (?,?,?,?,?,'MACHINE',?,?) ON CONFLICT (entry_key) DO NOTHING",
                key, cut(term, 100), cut(reading, 100), level, meaningVi, source, cut(model, 40)) > 0;
    }

    /** Ghi / sửa nghĩa của admin (đã kiểm). */
    public void upsertAdminMeaning(String key, String term, String reading, String meaningVi, Long actor) {
        jdbc.update("INSERT INTO dict_meanings (entry_key, term, reading, meaning_vi, status, source, updated_by, verified_at, "
                + "verified_by) VALUES (?,?,?,?,'VERIFIED','ADMIN',?,now(),?) ON CONFLICT (entry_key) DO UPDATE SET "
                + "meaning_vi = EXCLUDED.meaning_vi, status = 'VERIFIED', source = 'ADMIN', updated_at = now(), "
                + "updated_by = EXCLUDED.updated_by, verified_at = now(), verified_by = EXCLUDED.verified_by, "
                + "term = COALESCE(dict_meanings.term, EXCLUDED.term), reading = COALESCE(dict_meanings.reading, EXCLUDED.reading)",
                key, cut(term, 100), cut(reading, 100), meaningVi, actor, actor);
    }

    /** Thay nghĩa máy dịch bằng bản dịch mới (admin bấm "Dịch lại"); bản đã kiểm không bị đè. */
    public int replaceMachineMeaning(String key, String meaningVi, String model) {
        return jdbc.update("UPDATE dict_meanings SET meaning_vi = ?, source = 'GEMINI', model = ?, updated_at = now() "
                + "WHERE entry_key = ? AND status = 'MACHINE'", meaningVi, cut(model, 40), key);
    }

    public int verify(String key, Long actor) {
        return jdbc.update("UPDATE dict_meanings SET status = 'VERIFIED', verified_at = now(), verified_by = ?, updated_at = now() "
                + "WHERE entry_key = ?", actor, key);
    }

    public int deleteMeaning(String key) {
        return jdbc.update("DELETE FROM dict_meanings WHERE entry_key = ?", key);
    }

    public long countMeanings(String status) {
        Long n = status == null ? jdbc.queryForObject("SELECT COUNT(*) FROM dict_meanings", Long.class)
                : jdbc.queryForObject("SELECT COUNT(*) FROM dict_meanings WHERE status = ?", Long.class, status);
        return n == null ? 0 : n;
    }

    public long countSeed() {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM dict_meanings WHERE source = 'SEED'", Long.class);
        return n == null ? 0 : n;
    }

    /** Lô seed: chèn nếu chưa có (ON CONFLICT DO NOTHING). rows = [key, term, reading, level, meaningVi]. */
    public int insertSeed(List<String[]> rows) {
        int[] r = jdbc.batchUpdate("INSERT INTO dict_meanings (entry_key, term, reading, level, meaning_vi, status, source, model) "
                + "VALUES (?,?,?,?,?,'MACHINE','SEED','claude-fable-5-1') ON CONFLICT (entry_key) DO NOTHING", rows.stream()
                .map(a -> new Object[]{a[0], cut(a[1], 100), cut(a[2], 100), a[3], a[4]}).toList());
        int n = 0;
        for (int x : r) n += Math.max(0, x);
        return n;
    }

    /** Tìm trong nghĩa tiếng Việt (ILIKE, đã kiểm trước, nghĩa ngắn trước). */
    public List<Meaning> searchVi(String q, int limit) {
        String like = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
        return jdbc.query("SELECT * FROM dict_meanings WHERE meaning_vi ILIKE ? ESCAPE '\\' "
                + "ORDER BY (status = 'VERIFIED') DESC, length(meaning_vi), entry_key LIMIT ?", MEANING, like, limit);
    }

    // ------------------------------------------------------------------ bản dịch câu ví dụ

    public record ExampleVi(String entryKey, String exampleId, String textVi, String status, String source) {}

    public Map<String, ExampleVi> examplesVi(String key) {
        Map<String, ExampleVi> out = new HashMap<>();
        jdbc.query("SELECT entry_key, example_id, text_vi, status, source FROM dict_example_vi WHERE entry_key = ?",
                (rs, i) -> new ExampleVi(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5)), key)
                .forEach(e -> out.put(e.exampleId(), e));
        return out;
    }

    public void insertMachineExample(String key, String exampleId, String textVi, String model) {
        jdbc.update("INSERT INTO dict_example_vi (entry_key, example_id, text_vi, status, source, model) "
                + "VALUES (?,?,?,'MACHINE','GEMINI',?) ON CONFLICT (entry_key, example_id) DO NOTHING",
                key, exampleId, textVi, cut(model, 40));
    }

    public void upsertAdminExample(String key, String exampleId, String textVi, Long actor) {
        jdbc.update("INSERT INTO dict_example_vi (entry_key, example_id, text_vi, status, source, updated_by) "
                + "VALUES (?,?,?,'VERIFIED','ADMIN',?) ON CONFLICT (entry_key, example_id) DO UPDATE SET text_vi = EXCLUDED.text_vi, "
                + "status = 'VERIFIED', source = 'ADMIN', updated_at = now(), updated_by = EXCLUDED.updated_by",
                key, exampleId, textVi, actor);
    }

    public int deleteExampleVi(String key, String exampleId) {
        return jdbc.update("DELETE FROM dict_example_vi WHERE entry_key = ? AND example_id = ?", key, exampleId);
    }

    // ------------------------------------------------------------------ ghi đè + lịch sử

    public record Override(long id, String entryKey, String field, String subKey, String value, Instant createdAt) {}

    private static final RowMapper<Override> OVERRIDE = (rs, i) -> new Override(rs.getLong("id"), rs.getString("entry_key"),
            rs.getString("field"), rs.getString("sub_key"), rs.getString("value"), inst(rs, "created_at"));

    public List<Override> overrides(String key) {
        return jdbc.query("SELECT * FROM dict_overrides WHERE entry_key = ? ORDER BY field, sub_key", OVERRIDE, key);
    }

    public Map<String, List<Override>> overridesFor(Collection<String> keys) {
        Map<String, List<Override>> out = new HashMap<>();
        if (keys.isEmpty()) return out;
        String in = String.join(",", keys.stream().map(k -> "?").toList());
        jdbc.query("SELECT * FROM dict_overrides WHERE entry_key IN (" + in + ")", OVERRIDE, keys.toArray())
                .forEach(o -> out.computeIfAbsent(o.entryKey(), k -> new ArrayList<>()).add(o));
        return out;
    }

    public List<Override> allOverrides() {
        return jdbc.query("SELECT * FROM dict_overrides ORDER BY id", OVERRIDE);
    }

    public Optional<String> overrideValue(String key, String field, String subKey) {
        return jdbc.queryForList("SELECT value FROM dict_overrides WHERE entry_key = ? AND field = ? AND sub_key = ?",
                String.class, key, field, subKey == null ? "" : subKey).stream().findFirst();
    }

    public void putOverride(String key, String field, String subKey, String value, Long actor) {
        jdbc.update("INSERT INTO dict_overrides (entry_key, field, sub_key, value, created_by) VALUES (?,?,?,?,?) "
                + "ON CONFLICT (entry_key, field, sub_key) DO UPDATE SET value = EXCLUDED.value, created_at = now(), "
                + "created_by = EXCLUDED.created_by", key, field, subKey == null ? "" : subKey, value, actor);
    }

    public int removeOverride(String key, String field, String subKey) {
        return jdbc.update("DELETE FROM dict_overrides WHERE entry_key = ? AND field = ? AND sub_key = ?",
                key, field, subKey == null ? "" : subKey);
    }

    public record History(long id, String entryKey, String field, String subKey, String oldValue, String newValue, Long actorId,
                          String actorEmail, Long reportId, String reason, Instant createdAt) {}

    private static final RowMapper<History> HISTORY = (rs, i) -> new History(rs.getLong("id"), rs.getString("entry_key"),
            rs.getString("field"), rs.getString("sub_key"), rs.getString("old_value"), rs.getString("new_value"),
            longOrNull(rs, "actor_id"), rs.getString("actor_email"), longOrNull(rs, "report_id"), rs.getString("reason"),
            inst(rs, "created_at"));

    private static final String HISTORY_SELECT = "SELECT h.*, u.email AS actor_email FROM dict_edit_history h "
            + "LEFT JOIN users u ON u.id = h.actor_id ";

    public long addHistory(String key, String field, String subKey, String oldValue, String newValue, Long actor, Long reportId,
                           String reason) {
        Long id = jdbc.queryForObject("INSERT INTO dict_edit_history (entry_key, field, sub_key, old_value, new_value, actor_id, "
                + "report_id, reason) VALUES (?,?,?,?,?,?,?,?) RETURNING id", Long.class, key, field, subKey == null ? "" : subKey,
                oldValue, newValue, actor, reportId, cut(reason, 300));
        return id == null ? 0 : id;
    }

    public List<History> history(String key, int limit) {
        return jdbc.query(HISTORY_SELECT + "WHERE h.entry_key = ? ORDER BY h.id DESC LIMIT ?", HISTORY, key, limit);
    }

    public Optional<History> historyRow(long id) {
        return jdbc.query(HISTORY_SELECT + "WHERE h.id = ?", HISTORY, id).stream().findFirst();
    }

    public List<History> historyPage(Long actor, String field, Instant from, Instant to, int page, int size) {
        StringBuilder where = new StringBuilder("WHERE 1=1");
        List<Object> args = new ArrayList<>();
        historyFilter(where, args, actor, field, from, to);
        args.add(size);
        args.add((long) page * size);
        return jdbc.query(HISTORY_SELECT + where + " ORDER BY h.id DESC LIMIT ? OFFSET ?", HISTORY, args.toArray());
    }

    public long historyCount(Long actor, String field, Instant from, Instant to) {
        StringBuilder where = new StringBuilder("WHERE 1=1");
        List<Object> args = new ArrayList<>();
        historyFilter(where, args, actor, field, from, to);
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM dict_edit_history h " + where, Long.class, args.toArray());
        return n == null ? 0 : n;
    }

    private static void historyFilter(StringBuilder where, List<Object> args, Long actor, String field, Instant from, Instant to) {
        if (actor != null) { where.append(" AND h.actor_id = ?"); args.add(actor); }
        if (field != null && !field.isBlank()) { where.append(" AND h.field = ?"); args.add(field); }
        if (from != null) { where.append(" AND h.created_at >= ?"); args.add(Timestamp.from(from)); }
        if (to != null) { where.append(" AND h.created_at < ?"); args.add(Timestamp.from(to)); }
    }

    /** Phiên bản lớp ghi đè = id lịch sử lớn nhất (tăng mỗi lần sửa); 0 khi chưa sửa gì. */
    public long overridesVersion() {
        Long v = jdbc.queryForObject("SELECT COALESCE(MAX(id), 0) FROM dict_edit_history", Long.class);
        return v == null ? 0 : v;
    }

    // ------------------------------------------------------------------ bình luận

    public record Comment(long id, String entryKey, long userId, String displayName, String content, int helpfulCount,
                          boolean votedByMe, Instant hiddenAt, String hiddenNote, Instant createdAt, Instant updatedAt) {}

    private static RowMapper<Comment> commentMapper() {
        return (rs, i) -> new Comment(rs.getLong("id"), rs.getString("entry_key"), rs.getLong("user_id"),
                rs.getString("display_name"), rs.getString("content"), rs.getInt("helpful_count"), rs.getBoolean("voted"),
                inst(rs, "hidden_at"), rs.getString("hidden_note"), inst(rs, "created_at"), inst(rs, "updated_at"));
    }

    private static final String COMMENT_SELECT = "SELECT c.*, " + DISPLAY_NAME + " AS display_name, "
            + "EXISTS (SELECT 1 FROM dict_comment_votes v WHERE v.comment_id = c.id AND v.user_id = ?) AS voted "
            + "FROM dict_comments c JOIN users u ON u.id = c.user_id ";

    /** Bình luận của một mục: ẩn thì chỉ chủ thấy; sort helpful | newest. */
    public List<Comment> comments(String key, long viewer, String sort, int page, int size) {
        String order = "helpful".equals(sort) ? "c.helpful_count DESC, c.created_at DESC" : "c.created_at DESC";
        return jdbc.query(COMMENT_SELECT + "WHERE c.entry_key = ? AND (c.hidden_at IS NULL OR c.user_id = ?) ORDER BY " + order
                + ", c.id DESC LIMIT ? OFFSET ?", commentMapper(), viewer, key, viewer, size, (long) page * size);
    }

    public long countComments(String key, long viewer) {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM dict_comments c WHERE c.entry_key = ? AND (c.hidden_at IS NULL "
                + "OR c.user_id = ?)", Long.class, key, viewer);
        return n == null ? 0 : n;
    }

    public long countVisibleComments(String key) {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM dict_comments WHERE entry_key = ? AND hidden_at IS NULL", Long.class, key);
        return n == null ? 0 : n;
    }

    public Optional<Comment> comment(long id, long viewer) {
        return jdbc.query(COMMENT_SELECT + "WHERE c.id = ?", commentMapper(), viewer, id).stream().findFirst();
    }

    public long insertComment(String key, long userId, String content) {
        Long id = jdbc.queryForObject("INSERT INTO dict_comments (entry_key, user_id, content) VALUES (?,?,?) RETURNING id",
                Long.class, key, userId, content);
        return id == null ? 0 : id;
    }

    public int updateComment(long id, String content) {
        return jdbc.update("UPDATE dict_comments SET content = ?, updated_at = now() WHERE id = ?", content, id);
    }

    public int deleteComment(long id) {
        return jdbc.update("DELETE FROM dict_comments WHERE id = ?", id);
    }

    public long commentsToday(long userId) {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM dict_comments WHERE user_id = ? AND created_at > now() - interval '1 day'",
                Long.class, userId);
        return n == null ? 0 : n;
    }

    /** Bật / tắt "Hữu ích"; trả số đếm mới. */
    public int toggleVote(long commentId, long userId) {
        int removed = jdbc.update("DELETE FROM dict_comment_votes WHERE comment_id = ? AND user_id = ?", commentId, userId);
        if (removed == 0) {
            jdbc.update("INSERT INTO dict_comment_votes (comment_id, user_id) VALUES (?,?) ON CONFLICT DO NOTHING", commentId, userId);
        }
        jdbc.update("UPDATE dict_comments SET helpful_count = (SELECT COUNT(*) FROM dict_comment_votes WHERE comment_id = ?) "
                + "WHERE id = ?", commentId, commentId);
        Integer n = jdbc.queryForObject("SELECT helpful_count FROM dict_comments WHERE id = ?", Integer.class, commentId);
        return n == null ? 0 : n;
    }

    public int hideComment(long id, Long actor, String note) {
        return jdbc.update("UPDATE dict_comments SET hidden_at = now(), hidden_by = ?, hidden_note = ? WHERE id = ?",
                actor, cut(note, 300), id);
    }

    public int unhideComment(long id) {
        return jdbc.update("UPDATE dict_comments SET hidden_at = NULL, hidden_by = NULL, hidden_note = NULL WHERE id = ?", id);
    }

    public record AdminComment(long id, String entryKey, long userId, String displayName, String email, String content,
                               int helpfulCount, Instant hiddenAt, String hiddenNote, Instant createdAt) {}

    public List<AdminComment> adminComments(String q, Boolean hidden, String entryKey, int page, int size) {
        StringBuilder where = new StringBuilder("WHERE 1=1");
        List<Object> args = new ArrayList<>();
        adminCommentFilter(where, args, q, hidden, entryKey);
        args.add(size);
        args.add((long) page * size);
        return jdbc.query("SELECT c.*, " + DISPLAY_NAME + " AS display_name, u.email FROM dict_comments c JOIN users u "
                + "ON u.id = c.user_id " + where + " ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?",
                (rs, i) -> new AdminComment(rs.getLong("id"), rs.getString("entry_key"), rs.getLong("user_id"),
                        rs.getString("display_name"), rs.getString("email"), rs.getString("content"), rs.getInt("helpful_count"),
                        inst(rs, "hidden_at"), rs.getString("hidden_note"), inst(rs, "created_at")), args.toArray());
    }

    public long adminCommentCount(String q, Boolean hidden, String entryKey) {
        StringBuilder where = new StringBuilder("WHERE 1=1");
        List<Object> args = new ArrayList<>();
        adminCommentFilter(where, args, q, hidden, entryKey);
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM dict_comments c JOIN users u ON u.id = c.user_id " + where, Long.class,
                args.toArray());
        return n == null ? 0 : n;
    }

    private static void adminCommentFilter(StringBuilder where, List<Object> args, String q, Boolean hidden, String entryKey) {
        if (q != null && !q.isBlank()) {
            where.append(" AND (c.content ILIKE ? OR u.email ILIKE ? OR c.entry_key = ?)");
            String like = "%" + q.strip() + "%";
            args.add(like);
            args.add(like);
            args.add(q.strip());
        }
        if (hidden != null) where.append(hidden ? " AND c.hidden_at IS NOT NULL" : " AND c.hidden_at IS NULL");
        if (entryKey != null && !entryKey.isBlank()) { where.append(" AND c.entry_key = ?"); args.add(entryKey); }
    }

    // ------------------------------------------------------------------ báo cáo

    public record Report(long id, String kind, String entryKey, Long commentId, String field, String subKey, String currentValue,
                         String proposedValue, String reason, String note, Long reporterId, String reporterEmail, String status,
                         String action, String resolutionNote, Long resolvedBy, Instant resolvedAt, Instant createdAt,
                         String commentContent) {}

    private static final RowMapper<Report> REPORT = (rs, i) -> new Report(rs.getLong("id"), rs.getString("kind"),
            rs.getString("entry_key"), longOrNull(rs, "comment_id"), rs.getString("field"), rs.getString("sub_key"),
            rs.getString("current_value"), rs.getString("proposed_value"), rs.getString("reason"), rs.getString("note"),
            longOrNull(rs, "reporter_id"), rs.getString("reporter_email"), rs.getString("status"), rs.getString("action"),
            rs.getString("resolution_note"), longOrNull(rs, "resolved_by"), inst(rs, "resolved_at"), inst(rs, "created_at"),
            rs.getString("comment_content"));

    private static final String REPORT_SELECT = "SELECT r.*, u.email AS reporter_email, c.content AS comment_content "
            + "FROM dict_reports r LEFT JOIN users u ON u.id = r.reporter_id LEFT JOIN dict_comments c ON c.id = r.comment_id ";

    public long insertReport(String kind, String key, Long commentId, String field, String subKey, String current,
                             String proposed, String reason, String note, long reporter) {
        Long id = jdbc.queryForObject("INSERT INTO dict_reports (kind, entry_key, comment_id, field, sub_key, current_value, "
                + "proposed_value, reason, note, reporter_id) VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id", Long.class, kind, key,
                commentId, field, subKey, current, proposed, reason, note, reporter);
        return id == null ? 0 : id;
    }

    public boolean openEntryReportExists(long reporter, String key, String field, String subKey) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM dict_reports WHERE kind = 'ENTRY' AND "
                + "status = 'OPEN' AND reporter_id = ? AND entry_key = ? AND field = ? AND COALESCE(sub_key, '') = ?)",
                Boolean.class, reporter, key, field, subKey == null ? "" : subKey));
    }

    public boolean openCommentReportExists(long reporter, long commentId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM dict_reports WHERE kind = 'COMMENT' AND "
                + "status = 'OPEN' AND reporter_id = ? AND comment_id = ?)", Boolean.class, reporter, commentId));
    }

    public Optional<Report> report(long id) {
        return jdbc.query(REPORT_SELECT + "WHERE r.id = ?", REPORT, id).stream().findFirst();
    }

    public List<Report> openEntryReports(String key) {
        return jdbc.query(REPORT_SELECT + "WHERE r.entry_key = ? AND r.status = 'OPEN' ORDER BY r.created_at", REPORT, key);
    }

    public List<Report> reportsByReporter(long reporter, int page, int size) {
        return jdbc.query(REPORT_SELECT + "WHERE r.reporter_id = ? ORDER BY r.created_at DESC LIMIT ? OFFSET ?", REPORT, reporter,
                size, (long) page * size);
    }

    public long countReportsByReporter(long reporter) {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM dict_reports WHERE reporter_id = ?", Long.class, reporter);
        return n == null ? 0 : n;
    }

    public List<Report> reports(String kind, String status, String q, int page, int size) {
        StringBuilder where = new StringBuilder("WHERE 1=1");
        List<Object> args = new ArrayList<>();
        reportFilter(where, args, kind, status, q);
        args.add(size);
        args.add((long) page * size);
        return jdbc.query(REPORT_SELECT + where + " ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?", REPORT, args.toArray());
    }

    public long countReports(String kind, String status, String q) {
        StringBuilder where = new StringBuilder("WHERE 1=1");
        List<Object> args = new ArrayList<>();
        reportFilter(where, args, kind, status, q);
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM dict_reports r LEFT JOIN users u ON u.id = r.reporter_id " + where,
                Long.class, args.toArray());
        return n == null ? 0 : n;
    }

    private static void reportFilter(StringBuilder where, List<Object> args, String kind, String status, String q) {
        if (kind != null && !kind.isBlank()) { where.append(" AND r.kind = ?"); args.add(kind); }
        if (status != null && !status.isBlank()) { where.append(" AND r.status = ?"); args.add(status); }
        if (q != null && !q.isBlank()) {
            where.append(" AND (r.entry_key = ? OR r.note ILIKE ? OR r.proposed_value ILIKE ? OR u.email ILIKE ?)");
            String like = "%" + q.strip() + "%";
            args.add(q.strip());
            args.add(like);
            args.add(like);
            args.add(like);
        }
    }

    /** Đóng báo cáo nếu còn OPEN; 0 = đã đóng trước đó (409). */
    public int closeReport(long id, String status, String action, String note, Long actor) {
        return jdbc.update("UPDATE dict_reports SET status = ?, action = ?, resolution_note = ?, resolved_by = ?, resolved_at = now() "
                + "WHERE id = ? AND status = 'OPEN'", status, action, cut(note, 500), actor, id);
    }

    public long countOpenReports() {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM dict_reports WHERE status = 'OPEN'", Long.class);
        return n == null ? 0 : n;
    }

    // ------------------------------------------------------------------ sổ tay + lịch sử tra

    public record Favorite(String entryKey, String note, Instant createdAt) {}

    public void putFavorite(long userId, String key, String note) {
        jdbc.update("INSERT INTO dict_favorites (user_id, entry_key, note) VALUES (?,?,?) ON CONFLICT (user_id, entry_key) "
                + "DO UPDATE SET note = EXCLUDED.note", userId, key, cut(note, 300));
    }

    public int removeFavorite(long userId, String key) {
        return jdbc.update("DELETE FROM dict_favorites WHERE user_id = ? AND entry_key = ?", userId, key);
    }

    public Optional<Favorite> favorite(long userId, String key) {
        return jdbc.query("SELECT entry_key, note, created_at FROM dict_favorites WHERE user_id = ? AND entry_key = ?",
                (rs, i) -> new Favorite(rs.getString(1), rs.getString(2), inst(rs, "created_at")), userId, key).stream().findFirst();
    }

    public List<Favorite> favorites(long userId, int page, int size) {
        return jdbc.query("SELECT entry_key, note, created_at FROM dict_favorites WHERE user_id = ? ORDER BY created_at DESC "
                + "LIMIT ? OFFSET ?", (rs, i) -> new Favorite(rs.getString(1), rs.getString(2), inst(rs, "created_at")),
                userId, size, (long) page * size);
    }

    public long countFavorites(long userId) {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM dict_favorites WHERE user_id = ?", Long.class, userId);
        return n == null ? 0 : n;
    }

    /** Ghi lịch sử tra (bỏ nếu đã tra cùng mục trong 1 giờ) rồi cắt còn {@code keep} dòng mới nhất. */
    public void recordLookup(long userId, String key, String query, int keep) {
        int inserted = jdbc.update("INSERT INTO dict_lookup_history (user_id, entry_key, query) SELECT ?, ?, ? WHERE NOT EXISTS ("
                + "SELECT 1 FROM dict_lookup_history WHERE user_id = ? AND entry_key = ? AND created_at > now() - interval '1 hour')",
                userId, key, cut(query, 64), userId, key);
        if (inserted > 0) {
            jdbc.update("DELETE FROM dict_lookup_history WHERE user_id = ? AND id < (SELECT id FROM dict_lookup_history "
                    + "WHERE user_id = ? ORDER BY id DESC OFFSET ? LIMIT 1)", userId, userId, keep - 1);
        }
    }

    public record Lookup(String entryKey, Instant lastAt) {}

    public List<Lookup> history(long userId, int limit) {
        return jdbc.query("SELECT entry_key, MAX(created_at) AS last_at FROM dict_lookup_history WHERE user_id = ? "
                + "GROUP BY entry_key ORDER BY last_at DESC LIMIT ?", (rs, i) -> new Lookup(rs.getString(1), inst(rs, "last_at")),
                userId, limit);
    }

    public long countLookupRows(long userId) {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM dict_lookup_history WHERE user_id = ?", Long.class, userId);
        return n == null ? 0 : n;
    }

    public int clearHistory(long userId) {
        return jdbc.update("DELETE FROM dict_lookup_history WHERE user_id = ?", userId);
    }

    public long lookupsSince(Instant since) {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM dict_lookup_history WHERE created_at >= ?", Long.class,
                Timestamp.from(since));
        return n == null ? 0 : n;
    }

    public long commentsSince(Instant since) {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM dict_comments WHERE created_at >= ?", Long.class, Timestamp.from(since));
        return n == null ? 0 : n;
    }

    // ------------------------------------------------------------------ hàng chờ admin (D16)

    /** grp: 1 bị báo cáo, 2 chỉ có nghĩa Anh (được tra 30 ngày mà chưa có nghĩa Việt), 3 nghĩa máy chưa kiểm, 4 đã kiểm. */
    public record QueueRow(String entryKey, int grp, long openReports, Instant lastReportAt, long lookups30d, String term,
                           String reading, String level, String meaningVi, String status, String source, Instant updatedAt) {}

    private static String queueSql(boolean count) {
        String base = "WITH lk AS (SELECT entry_key, COUNT(*) AS n FROM dict_lookup_history "
                + "WHERE created_at > now() - interval '30 days' GROUP BY entry_key), "
                + "rp AS (SELECT entry_key, COUNT(*) AS n, MAX(created_at) AS last_at FROM dict_reports "
                + "WHERE kind = 'ENTRY' AND status = 'OPEN' GROUP BY entry_key), "
                + "q AS ("
                + "SELECT rp.entry_key, 1 AS grp FROM rp "
                + "UNION ALL SELECT lk.entry_key, 2 FROM lk WHERE NOT EXISTS (SELECT 1 FROM dict_meanings m WHERE m.entry_key = lk.entry_key) "
                + "AND NOT EXISTS (SELECT 1 FROM rp WHERE rp.entry_key = lk.entry_key) "
                + "UNION ALL SELECT m.entry_key, CASE WHEN m.status = 'MACHINE' THEN 3 ELSE 4 END FROM dict_meanings m "
                + "WHERE NOT EXISTS (SELECT 1 FROM rp WHERE rp.entry_key = m.entry_key)) "
                + "SELECT " + (count ? "COUNT(*)" : "q.entry_key, q.grp, COALESCE(rp.n, 0) AS open_reports, rp.last_at, "
                + "COALESCE(lk.n, 0) AS lookups, m.term, m.reading, m.level, m.meaning_vi, m.status, m.source, m.updated_at")
                + " FROM q LEFT JOIN rp ON rp.entry_key = q.entry_key LEFT JOIN lk ON lk.entry_key = q.entry_key "
                + "LEFT JOIN dict_meanings m ON m.entry_key = q.entry_key ";
        return base;
    }

    private static void queueFilter(StringBuilder where, List<Object> args, List<Integer> groups, String level, String kind,
                                    String q) {
        where.append("WHERE q.grp IN (").append(String.join(",", groups.stream().map(g -> "?").toList())).append(")");
        args.addAll(groups);
        if (level != null && !level.isBlank()) { where.append(" AND m.level = ?"); args.add(level); }
        if ("kanji".equals(kind)) where.append(" AND q.entry_key LIKE 'k:%'");
        if ("word".equals(kind)) where.append(" AND q.entry_key LIKE 'w:%'");
        if (q != null && !q.isBlank()) {
            String like = "%" + q.strip() + "%";
            where.append(" AND (q.entry_key = ? OR m.term ILIKE ? OR m.reading ILIKE ? OR m.meaning_vi ILIKE ?)");
            args.add(q.strip());
            args.add(like);
            args.add(like);
            args.add(like);
        }
    }

    public List<QueueRow> queue(List<Integer> groups, String level, String kind, String q, int page, int size) {
        StringBuilder where = new StringBuilder();
        List<Object> args = new ArrayList<>();
        queueFilter(where, args, groups, level, kind, q);
        args.add(size);
        args.add((long) page * size);
        return jdbc.query(queueSql(false) + where + " ORDER BY q.grp, open_reports DESC, rp.last_at DESC NULLS LAST, lookups DESC, "
                + "CASE m.level WHEN 'N5' THEN 0 WHEN 'N4' THEN 1 WHEN 'N3' THEN 2 WHEN 'N2' THEN 3 WHEN 'N1' THEN 4 ELSE 5 END, "
                + "q.entry_key LIMIT ? OFFSET ?", (rs, i) -> new QueueRow(rs.getString("entry_key"), rs.getInt("grp"),
                rs.getLong("open_reports"), inst(rs, "last_at"), rs.getLong("lookups"), rs.getString("term"), rs.getString("reading"),
                rs.getString("level"), rs.getString("meaning_vi"), rs.getString("status"), rs.getString("source"),
                inst(rs, "updated_at")), args.toArray());
    }

    public long queueCount(List<Integer> groups, String level, String kind, String q) {
        StringBuilder where = new StringBuilder();
        List<Object> args = new ArrayList<>();
        queueFilter(where, args, groups, level, kind, q);
        Long n = jdbc.queryForObject(queueSql(true) + where, Long.class, args.toArray());
        return n == null ? 0 : n;
    }

    /** Ví dụ trong tài liệu của chính người học có chứa term (câu ví dụ của mục bóc tách), ≤ limit câu khác nhau. */
    public List<Map<String, Object>> userExamples(long userId, String term, int limit) {
        String like = "%" + term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
        return jdbc.queryForList("SELECT DISTINCT ON (i.example) i.example AS jpn, i.example_vi AS vi, j.source_name AS source "
                + "FROM extraction_items i JOIN extraction_jobs j ON j.id = i.job_id WHERE j.user_id = ? AND i.example IS NOT NULL "
                + "AND i.example ILIKE ? ESCAPE '\\' ORDER BY i.example LIMIT ?", userId, like, limit);
    }

    // ------------------------------------------------------------------ tiện ích

    static String cut(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }

    private static Instant inst(ResultSet rs, String col) throws SQLException {
        Timestamp t = rs.getTimestamp(col);
        return t == null ? null : t.toInstant();
    }

    private static Long longOrNull(ResultSet rs, String col) throws SQLException {
        long v = rs.getLong(col);
        return rs.wasNull() ? null : v;
    }
}
