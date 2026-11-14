package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.admin.AdminStatsResponse;
import com.pbl6.flashcard.dto.insights.PathEffectResponse;
import com.pbl6.flashcard.dto.insights.PathEffectResponse.Chapter;
import com.pbl6.flashcard.dto.insights.PathEffectResponse.RemedialSplit;
import com.pbl6.flashcard.dto.insights.PathEffectResponse.Stats;
import com.pbl6.flashcard.dto.insights.PathEffectResponse.Window;
import com.pbl6.flashcard.model.LearningPath;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Hiệu quả lộ trình (kế hoạch 2026-10-26 B3). Đọc thẳng review_logs.path_id / reaction_ms (V20; client gửi từ lộ trình 2.0) bằng
 * JDBC gộp ở DB, không bảng tổng hợp. Lượt ôn gán về chương qua learning_path_cards (path_id, card_id): mỗi thẻ thuộc đúng một
 * chương của lộ trình. Lượt "học nhanh" (source = cram) không tính ở mọi số liệu vì không đổi lịch ôn.
 */
@Service
public class PathEffectService {

    static final int RETENTION_DAYS = 7;
    private static final String NOT_FOUND = "Không tìm thấy lộ trình.";

    private final JdbcTemplate jdbc;

    public PathEffectService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public PathEffectResponse forPath(Long uid, UUID pathId) {
        List<Map<String, Object>> found = jdbc.queryForList(
                "SELECT title, source_type, COALESCE(activated_at, created_at) AS since FROM learning_paths WHERE id = ? AND user_id = ?",
                pathId, uid);
        if (found.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, NOT_FOUND);
        Map<String, Object> path = found.get(0);
        boolean remedial = LearningPath.SOURCE_REMEDIAL.equals(path.get("source_type"));

        Map<UUID, int[]> retention = retentionByChapter(uid, pathId);
        List<Chapter> chapters = jdbc.query("""
                SELECT c.id, c.position, c.title,
                       count(DISTINCT lpc.card_id) AS cards,
                       count(DISTINCT rl.card_id) AS studied,
                       count(rl.id) AS reviews,
                       count(rl.id) FILTER (WHERE rl.grade = 'again') AS again,
                       percentile_cont(0.5) WITHIN GROUP (ORDER BY rl.reaction_ms) AS median
                FROM learning_path_chapters c
                LEFT JOIN learning_path_cards lpc ON lpc.chapter_id = c.id
                LEFT JOIN review_logs rl ON rl.path_id = c.path_id AND rl.card_id = lpc.card_id AND rl.user_id = ?
                                        AND rl.source <> 'cram'
                WHERE c.path_id = ?
                GROUP BY c.id, c.position, c.title
                ORDER BY c.position
                """, (rs, i) -> {
            UUID id = rs.getObject("id", UUID.class);
            int[] r = retention.getOrDefault(id, new int[2]);
            return new Chapter(id.toString(), rs.getInt("position"), rs.getString("title"),
                    stats(rs.getInt("cards"), rs.getInt("studied"), rs.getLong("reviews"), rs.getLong("again"),
                            median(rs), r[0], r[1]));
        }, uid, pathId);

        // Tổng = cộng các chương; riêng trung vị phải tính lại trên toàn bộ lượt (trung vị không cộng được).
        int cards = 0, studied = 0, eligible = 0, retained = 0;
        long reviews = 0, again = 0;
        for (Chapter c : chapters) {
            cards += c.stats().cards();
            studied += c.stats().studiedCards();
            reviews += c.stats().reviews();
            again += c.stats().again();
            eligible += c.stats().retentionEligible();
            retained += c.stats().retained();
        }
        Integer totalMedian = jdbc.query("""
                SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY rl.reaction_ms) AS median
                FROM review_logs rl JOIN learning_path_cards lpc ON lpc.path_id = rl.path_id AND lpc.card_id = rl.card_id
                WHERE rl.path_id = ? AND rl.user_id = ? AND rl.source <> 'cram'
                """, rs -> rs.next() ? median(rs) : null, pathId, uid);
        Stats total = stats(cards, studied, reviews, again, totalMedian, eligible, retained);

        RemedialSplit split = remedial ? null : remedialSplit(uid, pathId, ((Timestamp) path.get("since")).toInstant());
        return new PathEffectResponse(pathId.toString(), (String) path.get("title"), remedial, total, chapters, split);
    }

    /**
     * chapterId → {eligible, retained}: lượt đầu của mỗi thẻ trong lộ trình (t0), rồi lượt ôn đầu tiên của chính thẻ đó (mọi nguồn
     * trừ học nhanh, không cần cùng lộ trình) ở thời điểm ≥ t0 + 7 ngày.
     */
    private Map<UUID, int[]> retentionByChapter(Long uid, UUID pathId) {
        Map<UUID, int[]> out = new HashMap<>();
        jdbc.query("""
                WITH firsts AS (
                    SELECT lpc.chapter_id, rl.card_id, min(rl.reviewed_at) AS t0
                    FROM review_logs rl JOIN learning_path_cards lpc ON lpc.path_id = rl.path_id AND lpc.card_id = rl.card_id
                    WHERE rl.path_id = ? AND rl.user_id = ? AND rl.source <> 'cram'
                    GROUP BY lpc.chapter_id, rl.card_id
                ), later AS (
                    SELECT f.chapter_id,
                           (SELECT l.grade FROM review_logs l
                            WHERE l.user_id = ? AND l.card_id = f.card_id AND l.source <> 'cram'
                              AND l.reviewed_at >= f.t0 + make_interval(days => ?)
                            ORDER BY l.reviewed_at, l.id LIMIT 1) AS grade
                    FROM firsts f
                )
                SELECT chapter_id, count(grade) AS eligible,
                       count(*) FILTER (WHERE grade IS NOT NULL AND grade <> 'again') AS retained
                FROM later GROUP BY chapter_id
                """, rs -> {
            out.put(rs.getObject("chapter_id", UUID.class), new int[] {rs.getInt("eligible"), rs.getInt("retained")});
        }, pathId, uid, uid, RETENTION_DAYS);
        return out;
    }

    /** Lộ trình bổ khuyết đầu tiên người học tạo sau khi lộ trình này bắt đầu; chia lượt ôn của lộ trình này tại mốc đó. */
    private RemedialSplit remedialSplit(Long uid, UUID pathId, Instant since) {
        List<Map<String, Object>> r = jdbc.queryForList("""
                SELECT id, title, created_at FROM learning_paths
                WHERE user_id = ? AND source_type = ? AND id <> ? AND created_at > ?
                ORDER BY created_at, id LIMIT 1
                """, uid, LearningPath.SOURCE_REMEDIAL, pathId, at(since));
        if (r.isEmpty()) return null;
        Instant at = ((Timestamp) r.get(0).get("created_at")).toInstant();
        Map<Boolean, Window> w = new HashMap<>();
        jdbc.query("""
                SELECT (rl.reviewed_at >= ?) AS after, count(*) AS reviews,
                       count(*) FILTER (WHERE rl.grade = 'again') AS again,
                       percentile_cont(0.5) WITHIN GROUP (ORDER BY rl.reaction_ms) AS median
                FROM review_logs rl
                WHERE rl.path_id = ? AND rl.user_id = ? AND rl.source <> 'cram'
                GROUP BY 1
                """, rs -> {
            w.put(rs.getBoolean("after"), window(rs.getLong("reviews"), rs.getLong("again"), median(rs)));
        }, at(at), pathId, uid);
        Window empty = window(0, 0, null);
        return new RemedialSplit(r.get(0).get("id").toString(), (String) r.get(0).get("title"), at,
                w.getOrDefault(false, empty), w.getOrDefault(true, empty));
    }

    /**
     * Tổng quan admin: lượt ôn (trừ học nhanh) trong cửa sổ, chia trong lộ trình (path_id có giá trị) và ngoài lộ trình, để so tỷ
     * lệ "again" và phản xạ của hai cách học.
     */
    @Transactional(readOnly = true)
    public AdminStatsResponse.PathEffect global(Instant since) {
        Map<Boolean, Window> w = new HashMap<>();
        jdbc.query("""
                SELECT (path_id IS NOT NULL) AS in_path, count(*) AS reviews,
                       count(*) FILTER (WHERE grade = 'again') AS again,
                       percentile_cont(0.5) WITHIN GROUP (ORDER BY reaction_ms) AS median
                FROM review_logs WHERE reviewed_at >= ? AND source <> 'cram'
                GROUP BY 1
                """, rs -> {
            w.put(rs.getBoolean("in_path"), window(rs.getLong("reviews"), rs.getLong("again"), median(rs)));
        }, at(since));
        Window empty = window(0, 0, null);
        return new AdminStatsResponse.PathEffect(w.getOrDefault(true, empty), w.getOrDefault(false, empty));
    }

    static Stats stats(int cards, int studied, long reviews, long again, Integer median, int eligible, int retained) {
        return new Stats(cards, studied, reviews, again, ratio(again, reviews), median, eligible, retained, ratio(retained, eligible));
    }

    static Window window(long reviews, long again, Integer median) {
        return new Window(reviews, again, ratio(again, reviews), median);
    }

    /** Tham số thời gian cho JDBC: OffsetDateTime so đúng với cột timestamptz, không phụ thuộc múi giờ phiên. */
    private static OffsetDateTime at(Instant t) {
        return OffsetDateTime.ofInstant(t, ZoneOffset.UTC);
    }

    /** 0..1 làm tròn 3 chữ số; null khi mẫu số 0. */
    static Double ratio(long part, long whole) {
        return whole <= 0 ? null : Math.round(part * 1000.0 / whole) / 1000.0;
    }

    private static Integer median(ResultSet rs) throws SQLException {
        double m = rs.getDouble("median");
        return rs.wasNull() ? null : (int) Math.round(m);
    }
}
