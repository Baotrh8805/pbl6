package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Dashboard cá nhân GET /api/reviews/activity (hợp đồng đợt 2 §7, A5): đủ ?days= ngày tới hôm nay, đếm lượt ôn / quiz theo ngày
 * của ?tz= (kể cả offset cố định — Postgres đọc "+07:00" theo POSIX nên server phải đảo dấu), chuỗi ngày học trên toàn bộ lịch sử
 * (hợp ôn + quiz; hôm nay chưa học thì tính tới hôm qua), dueToday / newCards / learnedTotal / masteredTotal. Lượt ôn / quiz ở quá
 * khứ chèn bằng JDBC với mốc thời gian chọn sẵn (API chỉ ghi được "bây giờ").
 */
class ReviewActivityIT extends IntegrationTest {

    private static final ZoneId VN = ZoneId.of("Asia/Ho_Chi_Minh");

    @Autowired
    JdbcTemplate jdbc;

    private record Deck(String id, List<String> cards) {}

    private Deck deck(String token, int cards) throws Exception {
        List<Map<String, Object>> list = new ArrayList<>();
        for (int i = 0; i < cards; i++) list.add(Map.of("term", "語" + i, "meaning", "nghĩa " + i));
        JsonNode d = read(call(post("/api/decks"), token, Map.of("title", "Dashboard", "level", "N5", "cards", list))
                .andExpect(status().isCreated()));
        List<String> ids = new ArrayList<>();
        d.get("cards").forEach(c -> ids.add(c.get("id").asText()));
        return new Deck(d.get("id").asText(), ids);
    }

    private static LocalDate today() {
        return LocalDate.now(VN);
    }

    /** 12:00 giờ Việt Nam của ngày đó: xa mọi ranh giới ngày ở múi giờ ±7 giờ. */
    private static Instant noonVn(LocalDate day) {
        return day.atTime(LocalTime.NOON).atZone(VN).toInstant();
    }

    private void logReview(Long uid, String cardId, Instant at) {
        jdbc.update("INSERT INTO review_logs (user_id, card_id, grade, source, reviewed_at) VALUES (?, ?, 'good', 'flip', ?)",
                uid, cardId, OffsetDateTime.ofInstant(at, ZoneOffset.UTC));
    }

    private void logQuiz(Long uid, String deckId, Instant at) {
        jdbc.update("INSERT INTO quiz_results (user_id, deck_id, score, total, mode, created_at) VALUES (?, ?, 3, 4, 'exam', ?)",
                uid, deckId, OffsetDateTime.ofInstant(at, ZoneOffset.UTC));
    }

    private void srs(Long uid, String cardId, int intervalDays, Instant dueAt) {
        jdbc.update("INSERT INTO reviews (user_id, card_id, reps, interval_days, ease, due_at) VALUES (?, ?, 1, ?, 2.5, ?) "
                + "ON CONFLICT (user_id, card_id) DO UPDATE SET interval_days = EXCLUDED.interval_days, due_at = EXCLUDED.due_at",
                uid, cardId, intervalDays, OffsetDateTime.ofInstant(dueAt, ZoneOffset.UTC));
    }

    private JsonNode activity(String token, String... params) throws Exception {
        var req = get("/api/reviews/activity");
        for (int i = 0; i + 1 < params.length; i += 2) req.param(params[i], params[i + 1]);
        return read(call(req, token, null).andExpect(status().isOk()));
    }

    /** {reviews, quizzes} của một ngày trong days; null khi ngày nằm ngoài cửa sổ. */
    private static int[] dayOf(JsonNode res, LocalDate day) {
        for (JsonNode d : res.get("days")) {
            if (d.get("day").asText().equals(day.toString())) return new int[] {d.get("reviews").asInt(), d.get("quizzes").asInt()};
        }
        return null;
    }

    @Test
    void empty_dashboard_has_a_full_window_ending_today() throws Exception {
        String token = newUser();
        deck(token, 3);

        JsonNode res = activity(token);
        JsonNode days = res.get("days");
        assertEquals(400, days.size(), "mặc định 400 ngày, đủ phần tử kể cả ngày trống");
        assertEquals(today().minusDays(399).toString(), days.get(0).get("day").asText(), "cũ trước");
        assertEquals(today().toString(), days.get(399).get("day").asText(), "kết thúc hôm nay theo múi giờ ứng dụng");
        for (JsonNode d : days) {
            assertEquals(0, d.get("reviews").asInt());
            assertEquals(0, d.get("quizzes").asInt());
        }
        assertEquals(0, res.get("dueToday").asInt());
        assertEquals(3, res.get("newCards").asInt(), "thẻ trong bộ của mình chưa học");
        assertEquals(0, res.get("learnedTotal").asInt());
        assertEquals(0, res.get("masteredTotal").asInt());
        assertEquals(0, res.get("currentStreak").asInt());
        assertEquals(0, res.get("maxStreak").asInt());

        assertEquals(7, activity(token, "days", "7").get("days").size());
    }

    @Test
    void counts_reviews_and_quizzes_per_day_and_the_srs_totals() throws Exception {
        String email = newEmail();
        String token = newUser(email);
        Long uid = userId(email);
        Deck d = deck(token, 4);
        List<String> c = d.cards();

        // Một lượt ôn thật qua API hôm nay (tạo dòng reviews hạn ngày mai) + lịch sử chèn sẵn
        call(post("/api/reviews"), token, Map.of("cardId", c.get(0), "grade", "good")).andExpect(status().isOk());
        logReview(uid, c.get(1), noonVn(today().minusDays(3)));
        logReview(uid, c.get(2), noonVn(today().minusDays(3)));
        logQuiz(uid, d.id(), noonVn(today().minusDays(3)));
        logQuiz(uid, d.id(), noonVn(today().minusDays(5)));
        // Ranh giới "đến hạn hôm nay" = 00:00 ngày mai giờ VN
        Instant endOfToday = today().plusDays(1).atStartOfDay(VN).toInstant();
        srs(uid, c.get(1), 20, endOfToday.minusSeconds(60));
        srs(uid, c.get(2), 3, endOfToday.plusSeconds(60));
        jdbc.update("UPDATE reviews SET interval_days = 21 WHERE user_id = ? AND card_id = ?", uid, c.get(0));

        // Người khác học cùng lúc không lẫn vào số của mình
        String otherEmail = newEmail();
        String other = newUser(otherEmail);
        Deck od = deck(other, 1);
        call(post("/api/reviews"), other, Map.of("cardId", od.cards().get(0), "grade", "good")).andExpect(status().isOk());
        logQuiz(userId(otherEmail), od.id(), noonVn(today().minusDays(3)));

        JsonNode res = activity(token, "days", "30");
        assertEquals(30, res.get("days").size());
        assertArrayEquals(new int[] {1, 0}, dayOf(res, today()));
        assertArrayEquals(new int[] {2, 1}, dayOf(res, today().minusDays(3)));
        assertArrayEquals(new int[] {0, 1}, dayOf(res, today().minusDays(5)));
        assertArrayEquals(new int[] {0, 0}, dayOf(res, today().minusDays(4)));

        assertEquals(1, res.get("dueToday").asInt(), "chỉ thẻ hạn trước 00:00 ngày mai (VN); thẻ vừa ôn hạn ngày mai");
        assertEquals(1, res.get("newCards").asInt(), "4 thẻ, 3 thẻ đã có lịch SRS");
        assertEquals(3, res.get("learnedTotal").asInt());
        assertEquals(1, res.get("masteredTotal").asInt(), "interval ≥ 21");
        assertEquals(1, res.get("currentStreak").asInt(), "chỉ hôm nay liền mạch (hôm qua, hôm kia trống)");
        assertEquals(1, res.get("maxStreak").asInt());
    }

    @Test
    void day_boundaries_follow_the_requested_time_zone() throws Exception {
        String email = newEmail();
        String token = newUser(email);
        Long uid = userId(email);
        Deck d = deck(token, 1);
        LocalDate day = today().minusDays(5);
        // 00:30 giờ VN ngày D = 17:30 UTC ngày D-1; 23:30 giờ VN ngày D = 01:30 giờ Tokyo ngày D+1
        logReview(uid, d.cards().get(0), day.atTime(0, 30).atZone(VN).toInstant());
        logQuiz(uid, d.id(), day.atTime(23, 30).atZone(VN).toInstant());

        for (JsonNode res : List.of(activity(token), activity(token, "tz", "Asia/Ho_Chi_Minh"), activity(token, "tz", "+07:00"),
                activity(token, "tz", "UTC+7"))) {
            assertArrayEquals(new int[] {1, 1}, dayOf(res, day), "giờ VN (tên vùng hoặc offset +07:00 cố định)");
            assertArrayEquals(new int[] {0, 0}, dayOf(res, day.minusDays(1)));
        }
        JsonNode utc = activity(token, "tz", "UTC");
        assertArrayEquals(new int[] {1, 0}, dayOf(utc, day.minusDays(1)), "lượt ôn lúc 17:30 UTC hôm trước");
        assertArrayEquals(new int[] {0, 1}, dayOf(utc, day));
        JsonNode newYork = activity(token, "tz", "-05:00");
        assertArrayEquals(new int[] {1, 0}, dayOf(newYork, day.minusDays(1)));
        assertArrayEquals(new int[] {0, 1}, dayOf(newYork, day));
        JsonNode tokyo = activity(token, "tz", "Asia/Tokyo");
        assertArrayEquals(new int[] {1, 0}, dayOf(tokyo, day));
        assertArrayEquals(new int[] {0, 1}, dayOf(tokyo, day.plusDays(1)));
        JsonNode india = activity(token, "tz", "+05:30");
        assertArrayEquals(new int[] {1, 0}, dayOf(india, day.minusDays(1)), "17:30 UTC = 23:00 IST cùng ngày D-1");
        assertArrayEquals(new int[] {0, 1}, dayOf(india, day));
    }

    @Test
    void streaks_span_the_whole_history_and_join_reviews_with_quizzes() throws Exception {
        String email = newEmail();
        String token = newUser(email);
        Long uid = userId(email);
        Deck d = deck(token, 1);
        String card = d.cards().get(0);
        LocalDate t = today();

        // Chuỗi hiện tại 3 ngày: ôn hôm kia, chỉ làm quiz hôm qua, ôn hôm nay
        logReview(uid, card, noonVn(t.minusDays(2)));
        logQuiz(uid, d.id(), noonVn(t.minusDays(1)));
        logReview(uid, card, noonVn(t));
        // Chuỗi 5 ngày cách đây 40 ngày, ngày giữa chỉ có quiz
        for (int i = 36; i <= 40; i++) {
            if (i == 38) logQuiz(uid, d.id(), noonVn(t.minusDays(i)));
            else logReview(uid, card, noonVn(t.minusDays(i)));
        }
        // Chuỗi 8 ngày từ hơn một năm trước: ngoài cửa sổ heatmap nhưng vẫn là chuỗi dài nhất
        for (int i = 493; i <= 500; i++) logReview(uid, card, noonVn(t.minusDays(i)));

        JsonNode res = activity(token, "days", "30");
        assertEquals(30, res.get("days").size());
        assertEquals(3, res.get("currentStreak").asInt());
        assertEquals(8, res.get("maxStreak").asInt(), "chuỗi dài nhất tính trên toàn bộ lịch sử, không chỉ 30 ngày");
        assertArrayEquals(new int[] {0, 1}, dayOf(res, t.minusDays(1)));
    }

    @Test
    void not_studied_yet_today_keeps_the_streak_up_to_yesterday() throws Exception {
        String email = newEmail();
        String token = newUser(email);
        Long uid = userId(email);
        String card = deck(token, 1).cards().get(0);
        logReview(uid, card, noonVn(today().minusDays(1)));
        logReview(uid, card, noonVn(today().minusDays(2)));
        JsonNode res = activity(token);
        assertEquals(2, res.get("currentStreak").asInt());
        assertEquals(2, res.get("maxStreak").asInt());
        assertArrayEquals(new int[] {0, 0}, dayOf(res, today()));

        String lapsedEmail = newEmail();
        String lapsed = newUser(lapsedEmail);
        String card2 = deck(lapsed, 1).cards().get(0);
        logReview(userId(lapsedEmail), card2, noonVn(today().minusDays(2)));
        logReview(userId(lapsedEmail), card2, noonVn(today().minusDays(3)));
        JsonNode broken = activity(lapsed);
        assertEquals(0, broken.get("currentStreak").asInt(), "bỏ trọn hôm qua: chuỗi đứt");
        assertEquals(2, broken.get("maxStreak").asInt());
    }

    @Test
    void invalid_parameters_are_rejected() throws Exception {
        String token = newUser();
        call(get("/api/reviews/activity").param("tz", "Mars/Olympus_Mons"), token, null)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("Múi giờ không hợp lệ")));
        call(get("/api/reviews/activity").param("tz", "+25:00"), token, null).andExpect(status().isBadRequest());
        call(get("/api/reviews/activity").param("days", "0"), token, null).andExpect(status().isBadRequest());
        call(get("/api/reviews/activity").param("days", "731"), token, null).andExpect(status().isBadRequest());
        call(get("/api/reviews/activity").param("days", "abc"), token, null).andExpect(status().isBadRequest());
        // tz rỗng = múi giờ ứng dụng
        call(get("/api/reviews/activity").param("tz", ""), token, null).andExpect(status().isOk());
    }

    @Test
    void dashboard_is_for_learners_only() throws Exception {
        call(get("/api/reviews/activity"), newStaff(Role.ADMIN), null).andExpect(status().isForbidden());
        call(get("/api/reviews/activity"), null, null).andExpect(status().isUnauthorized());
    }
}
