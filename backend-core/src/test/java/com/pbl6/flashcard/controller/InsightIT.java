package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.service.LearningPathScheduler;
import com.pbl6.flashcard.service.SettingsService;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Insights (spec §3.7, §3.9): bốn tín hiệu điểm yếu (hay quên theo "again" / ease thấp, phản xạ chậm, sai quiz), cửa sổ ?days=,
 * gom nhóm, chỉ thẻ còn xem được; thẻ phản xạ chậm so với trung vị cá nhân (cùng quy tắc với lý do "slow"); thứ tự gợi ý "học gì
 * tiếp". Dữ liệu dựng qua API như người dùng thật (bộ thẻ, chấm ôn kèm reactionMs, quiz); JDBC chỉ để chỉnh ease / mốc thời gian
 * log và lượt quiz / hạn ôn, và để chèn hàng loạt log "again" khi cần hàng trăm thẻ yếu.
 */
class InsightIT extends IntegrationTest {

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    SettingsService settings;

    private static Map<String, Object> card(String term, String meaning, String level, String kind) {
        Map<String, Object> m = new HashMap<>();
        m.put("term", term);
        m.put("reading", "よみ");
        m.put("meaning", meaning);
        if (level != null) m.put("level", level);
        if (kind != null) m.put("kind", kind);
        return m;
    }

    /** Tạo bộ thẻ riêng; trả term -> cardId theo thứ tự thẻ. */
    private Map<String, String> deck(String token, String title, List<Map<String, Object>> cards, String[] deckIdOut) throws Exception {
        JsonNode d = read(call(post("/api/decks"), token, Map.of("title", title, "level", "N5", "cards", cards))
                .andExpect(status().isCreated()));
        if (deckIdOut != null) deckIdOut[0] = d.get("id").asText();
        Map<String, String> ids = new LinkedHashMap<>();
        for (JsonNode c : d.get("cards")) ids.put(c.get("term").asText(), c.get("id").asText());
        return ids;
    }

    private void review(String token, String cardId, String grade, Integer reactionMs) throws Exception {
        Map<String, Object> body = new HashMap<>(Map.of("cardId", cardId, "grade", grade));
        if (reactionMs != null) body.put("reactionMs", reactionMs);
        call(post("/api/reviews"), token, body).andExpect(status().isOk());
    }

    private void reviews(String token, String cardId, String grade, Integer reactionMs, int times) throws Exception {
        for (int i = 0; i < times; i++) review(token, cardId, grade, reactionMs);
    }

    private JsonNode weaknesses(String token) throws Exception {
        return read(call(get("/api/insights/weaknesses"), token, null).andExpect(status().isOk()));
    }

    private JsonNode weaknesses(String token, int days) throws Exception {
        return read(call(get("/api/insights/weaknesses").param("days", String.valueOf(days)), token, null)
                .andExpect(status().isOk()));
    }

    private static JsonNode cardOf(JsonNode res, String cardId) {
        for (JsonNode c : res.get("cards")) if (cardId.equals(c.get("cardId").asText())) return c;
        return null;
    }

    private static Set<String> cardIds(JsonNode res) {
        Set<String> out = new HashSet<>();
        res.get("cards").forEach(c -> out.add(c.get("cardId").asText()));
        return out;
    }

    private static List<String> reasons(JsonNode card) {
        List<String> out = new ArrayList<>();
        card.get("reasons").forEach(r -> out.add(r.asText()));
        return out;
    }

    private static Map<String, Integer> groupCounts(JsonNode groups) {
        Map<String, Integer> out = new LinkedHashMap<>();
        for (JsonNode g : groups) out.put(g.get("key").asText(), g.get("count").asInt());
        return out;
    }

    /** Đáp án đúng (dòng nghĩa đầu) của từng thẻ trong bộ. */
    private Map<String, String> correctAnswers(String token, String deckId) throws Exception {
        JsonNode deck = read(call(get("/api/decks/" + deckId), token, null).andExpect(status().isOk()));
        Map<String, String> correct = new HashMap<>();
        for (JsonNode c : deck.get("cards")) {
            correct.put(c.get("id").asText(), c.get("meaning").asText().lines().findFirst().orElse(""));
        }
        return correct;
    }

    private JsonNode openAttempt(String token, String deckId, int size, String mode) throws Exception {
        return read(call(post("/api/quiz-attempts"), token, Map.of("deckId", deckId, "size", size, "mode", mode))
                .andExpect(status().isOk()));
    }

    /** Một lượt thi (exam) trên cả bộ: mọi câu đúng trừ wrongCardId (chọn sai), blankCardId (bỏ trống); nộp ngay. */
    private void exam(String token, String deckId, String wrongCardId, String blankCardId) throws Exception {
        Map<String, String> correct = correctAnswers(token, deckId);
        JsonNode paper = openAttempt(token, deckId, correct.size(), "exam");
        Map<String, String> answers = new HashMap<>();
        for (JsonNode q : paper.get("questions")) {
            String cid = q.get("cardId").asText();
            if (cid.equals(blankCardId)) continue;
            String ok = correct.get(cid);
            String wrong = null;
            for (JsonNode o : q.get("options")) if (!o.asText().equals(ok)) wrong = o.asText();
            assertNotNull(wrong, q.toString());
            answers.put(cid, cid.equals(wrongCardId) ? wrong : ok);
        }
        call(post("/api/quiz-attempts/" + paper.get("attemptId").asText() + "/submit"), token, Map.of("answers", answers))
                .andExpect(status().isOk());
    }

    private void examWrongOn(String token, String deckId, String wrongCardId) throws Exception {
        exam(token, deckId, wrongCardId, null);
    }

    @Test
    void weaknesses_union_four_signals_with_reasons_groups_and_visibility() throws Exception {
        String emailA = newEmail();
        String a = newUser(emailA);
        Long uidA = userId(emailA);
        JsonNode empty = weaknesses(a);
        assertEquals(0, empty.get("total").asInt());
        assertEquals(0, empty.get("cards").size());
        assertFalse(empty.get("canRemedial").asBoolean());
        assertEquals(0, empty.get("groups").get("kanji").size());
        assertEquals(3, empty.get("suggestedDays").asInt());

        String[] deckId = new String[1];
        Map<String, String> ids = deck(a, "Tuần", List.of(
                card("水曜日", "thứ tư", "N5", null),
                card("火山", "núi lửa", "N5", null),
                card("金魚", "cá vàng", "N4", null),
                card("食べる", "ăn", "N5", null),
                card("飲む", "uống", null, null),
                card("図書館", "thư viện", "N5", null),
                card("ひらがな", "chữ mềm", "N5", "grammar")), deckId);
        String lapses = ids.get("水曜日");
        String lowEase = ids.get("火山");
        String slow = ids.get("金魚");
        String fast = ids.get("食べる");
        String quizWrong = ids.get("飲む");
        String oldLapses = ids.get("図書館");
        String kana = ids.get("ひらがな");

        reviews(a, lapses, "again", null, 3);                 // hay quên: 3 "again" trong 14 ngày, ease vẫn ≥ 1.8 (1.96)
        review(a, lowEase, "good", null);                     // ease thấp: chỉnh thẳng DB để không kéo theo "again"
        jdbc.update("UPDATE reviews SET ease = 1.5 WHERE user_id = ? AND card_id = ?", uidA, lowEase);
        reviews(a, slow, "good", 9000, 5);                    // chậm: trung vị 9000 > max(4000, 2 × trung vị cá nhân 1000)
        reviews(a, fast, "good", 1000, 6);                    // kéo trung vị cá nhân về 1000; thẻ này không yếu
        examWrongOn(a, deckId[0], quizWrong);                 // sai quiz 2 lần cùng thẻ
        examWrongOn(a, deckId[0], quizWrong);
        reviews(a, oldLapses, "again", null, 3);              // 3 "again" nhưng một lần đã 20 ngày: ngoài cửa sổ 14 ngày
        jdbc.update("UPDATE review_logs SET reviewed_at = ? WHERE id = (SELECT min(id) FROM review_logs WHERE user_id = ? AND card_id = ?)",
                OffsetDateTime.now(ZoneOffset.UTC).minusDays(20), uidA, oldLapses);
        reviews(a, kana, "again", null, 3);                   // không có chữ Hán -> nhóm "Khác"

        JsonNode res = weaknesses(a);
        assertEquals(5, res.get("total").asInt(), res.toString());
        assertEquals(5, res.get("cards").size());
        // thứ tự: nhiều lý do trước (đều 1), rồi againCount giảm dần (3, 3, 0, 0, 0), rồi term
        List<String> order = new ArrayList<>();
        res.get("cards").forEach(c -> order.add(c.get("cardId").asText()));
        assertEquals(List.of(kana, lapses, lowEase, slow, quizWrong), order, res.toString());

        JsonNode c1 = cardOf(res, lapses);
        assertEquals(List.of("lapses"), reasons(c1));
        assertEquals(3, c1.get("againCount").asInt());
        assertEquals(1.96, c1.get("ease").asDouble(), 0.001);
        assertEquals(1, c1.get("intervalDays").asInt());
        assertEquals(deckId[0], c1.get("deckId").asText());
        assertEquals("Tuần", c1.get("deckTitle").asText());
        assertEquals("水曜日", c1.get("term").asText());
        assertEquals("よみ", c1.get("reading").asText());
        assertEquals("thứ tư", c1.get("meaning").asText());
        assertEquals("N5", c1.get("level").asText());
        assertEquals("vocab", c1.get("kind").asText());
        assertFalse(c1.has("medianReactionMs"));
        assertEquals(0, c1.get("quizWrong").asInt());

        JsonNode c2 = cardOf(res, lowEase);
        assertEquals(List.of("low_ease"), reasons(c2));
        assertEquals(1.5, c2.get("ease").asDouble(), 0.001);
        assertEquals(0, c2.get("againCount").asInt());

        JsonNode c3 = cardOf(res, slow);
        assertEquals(List.of("slow"), reasons(c3));
        assertEquals(9000, c3.get("medianReactionMs").asInt());
        assertEquals("N4", c3.get("level").asText());

        JsonNode c5 = cardOf(res, quizWrong);
        assertEquals(List.of("quiz_wrong"), reasons(c5));
        assertEquals(2, c5.get("quizWrong").asInt());
        assertFalse(c5.has("ease"), "chưa từng ôn: không có bản ghi SRS");
        assertFalse(c5.has("level"));

        assertEquals(List.of("lapses"), reasons(cardOf(res, kana)));
        assertEquals("grammar", cardOf(res, kana).get("kind").asText());
        assertNull(cardOf(res, fast), "phản xạ nhanh không yếu");
        assertNull(cardOf(res, oldLapses), "chỉ 2 'again' trong 14 ngày");
        assertFalse(res.get("canRemedial").asBoolean());
        assertEquals(3, res.get("suggestedDays").asInt(), "5 thẻ, trần 50: sàn 3 ngày");

        JsonNode groups = res.get("groups");
        Map<String, Integer> level = groupCounts(groups.get("level"));
        assertEquals(List.of("N5", "N4", "Khác"), new ArrayList<>(level.keySet()), level.toString());
        assertEquals(3, level.get("N5"));
        assertEquals(1, level.get("N4"));
        assertEquals(1, level.get("Khác"));
        Map<String, Integer> kind = groupCounts(groups.get("kind"));
        assertEquals(Map.of("vocab", 4, "grammar", 1), kind);
        Map<String, Integer> kanji = groupCounts(groups.get("kanji"));
        assertEquals(List.of("水", "火", "金", "飲", "Khác"), new ArrayList<>(kanji.keySet()), kanji.toString());
        kanji.values().forEach(n -> assertEquals(1, n));
        JsonNode deckGroup = groups.get("deck");
        assertEquals(1, deckGroup.size());
        assertEquals(deckId[0], deckGroup.get(0).get("key").asText());
        assertEquals("Tuần", deckGroup.get(0).get("title").asText());
        assertEquals(5, deckGroup.get(0).get("count").asInt());

        // Thẻ của người khác: B yếu thẻ của B, A không thấy; được chia sẻ thì thẻ A chấm "again" lọt vào, thu hồi chia sẻ thì biến mất
        String emailB = newEmail();
        String b = newUser(emailB);
        String[] deckB = new String[1];
        String b1 = deck(b, "Của B", List.of(card("犬", "chó", "N5", null)), deckB).get("犬");
        reviews(b, b1, "again", null, 3);
        assertEquals(1, weaknesses(b).get("total").asInt());
        assertEquals(b1, weaknesses(b).get("cards").get(0).get("cardId").asText());
        assertEquals(5, weaknesses(a).get("total").asInt());
        call(put("/api/decks/" + deckB[0] + "/shares"), b, Map.of("email", emailA, "permission", "VIEWER")).andExpect(status().isOk());
        reviews(a, b1, "again", null, 3);
        JsonNode shared = weaknesses(a);
        assertEquals(6, shared.get("total").asInt(), shared.toString());
        assertEquals(deckB[0], cardOf(shared, b1).get("deckId").asText());
        assertEquals(2, shared.get("groups").get("deck").size());
        call(delete("/api/decks/" + deckB[0] + "/shares/" + uidA), b, null).andExpect(status().isNoContent());
        JsonNode after = weaknesses(a);
        assertEquals(5, after.get("total").asInt(), "không còn xem được bộ của B");
        assertNull(cardOf(after, b1));

        call(get("/api/insights/weaknesses").param("days", "0"), a, null).andExpect(status().isBadRequest());
        call(get("/api/insights/weaknesses").param("days", "400"), a, null).andExpect(status().isBadRequest());
        call(get("/api/insights/weaknesses"), null, null).andExpect(status().isUnauthorized());
    }

    @Test
    void days_window_bounds_every_time_based_signal_and_lapses_never_look_past_fourteen_days() throws Exception {
        String email = newEmail();
        String token = newUser(email);
        Long uid = userId(email);
        String[] deckId = new String[1];
        Map<String, String> ids = deck(token, "Cửa sổ", List.of(
                card("十日", "mười ngày", "N5", null), card("十三日", "mười ba ngày", "N5", null),
                card("十五日", "mười lăm ngày", "N5", null), card("問題", "câu hỏi", "N5", null),
                card("遅刻", "đến muộn", "N5", null), card("早い", "sớm", "N5", null)), deckId);
        String lapse10 = ids.get("十日");
        String lapse13 = ids.get("十三日");
        String lapse15 = ids.get("十五日");
        String quiz10 = ids.get("問題");
        String slow10 = ids.get("遅刻");
        String fast = ids.get("早い");
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);

        reviews(token, lapse10, "again", null, 3);
        reviews(token, lapse13, "again", null, 3);
        reviews(token, lapse15, "again", null, 3);
        reviews(token, slow10, "good", 9000, 5);
        reviews(token, fast, "good", 1000, 6);    // trung vị cá nhân (mọi cửa sổ) = 1000
        examWrongOn(token, deckId[0], quiz10);
        examWrongOn(token, deckId[0], quiz10);
        String back = "UPDATE review_logs SET reviewed_at = ? WHERE user_id = ? AND card_id = ?";
        jdbc.update(back, now.minusDays(10), uid, lapse10);
        jdbc.update(back, now.minusDays(14).plusHours(1), uid, lapse13);    // vừa trong 14 ngày
        jdbc.update(back, now.minusDays(14).minusHours(1), uid, lapse15);   // vừa ngoài 14 ngày
        jdbc.update(back, now.minusDays(10), uid, slow10);
        jdbc.update("UPDATE quiz_attempts SET submitted_at = ? WHERE user_id = ?", now.minusDays(10), uid);

        // 30 ngày (mặc định): "hay quên" vẫn chỉ nhìn 14 ngày -> lapse15 rơi; mọi tín hiệu 10 ngày trước còn
        JsonNode d30 = weaknesses(token);
        assertEquals(Set.of(lapse10, lapse13, quiz10, slow10), cardIds(d30), d30.toString());
        assertEquals(List.of("slow"), reasons(cardOf(d30, slow10)));
        assertEquals(List.of("quiz_wrong"), reasons(cardOf(d30, quiz10)));
        assertEquals(d30.toString(), weaknesses(token, 30).toString());
        // 14 ngày: như 30
        assertEquals(Set.of(lapse10, lapse13, quiz10, slow10), cardIds(weaknesses(token, 14)));
        // 11 ngày: cửa sổ "again" = 11 -> lapse13 rơi; quiz / chậm 10 ngày trước vẫn trong cửa sổ
        assertEquals(Set.of(lapse10, quiz10, slow10), cardIds(weaknesses(token, 11)));
        // 7 ngày: mọi tín hiệu theo thời gian đều đã cũ hơn cửa sổ
        JsonNode d7 = weaknesses(token, 7);
        assertEquals(0, d7.get("total").asInt(), d7.toString());
    }

    @Test
    void quiz_blank_answers_count_in_exam_and_explicit_practice_skips_but_not_unopened_practice_questions() throws Exception {
        String token = newUser();
        String[] deckId = new String[1];
        Map<String, String> ids = deck(token, "Bỏ trống", List.of(
                card("春", "mùa xuân", "N5", null), card("夏", "mùa hạ", "N5", null), card("秋", "mùa thu", "N5", null),
                card("冬", "mùa đông", "N5", null), card("雨", "mưa", "N5", null)), deckId);
        String skipped = ids.get("春");
        String blankInExam = ids.get("夏");
        // Luyện tập 2 lượt: bấm "Bỏ qua câu này" (lưu "") ở 春, không mở các câu khác, nộp
        for (int i = 0; i < 2; i++) {
            JsonNode paper = openAttempt(token, deckId[0], 5, "practice");
            String attempt = paper.get("attemptId").asText();
            JsonNode fb = read(call(put("/api/quiz-attempts/" + attempt + "/answers/" + skipped), token, Map.of("option", ""))
                    .andExpect(status().isOk()));
            assertFalse(fb.get("feedback").get("correct").asBoolean(), "bỏ qua ở practice được chấm sai");
            call(post("/api/quiz-attempts/" + attempt + "/submit"), token, null).andExpect(status().isOk());
        }
        // Thi 2 lượt: bỏ trống 夏, còn lại đúng
        exam(token, deckId[0], null, blankInExam);
        exam(token, deckId[0], null, blankInExam);

        JsonNode res = weaknesses(token);
        assertEquals(Set.of(skipped, blankInExam), cardIds(res), res.toString());
        JsonNode s = cardOf(res, skipped);
        assertEquals(List.of("quiz_wrong"), reasons(s));
        assertEquals(2, s.get("quizWrong").asInt());
        assertEquals(2, s.get("againCount").asInt(), "mỗi lần bỏ qua ở practice cũng ghi 'again' vào lịch ôn");
        assertEquals(2, cardOf(res, blankInExam).get("quizWrong").asInt());
    }

    @Test
    void remedial_takes_the_150_weakest_cards_and_suggested_days_is_sized_for_them() throws Exception {
        String email = newEmail();
        String token = newUser(email);
        Long uid = userId(email);
        List<Map<String, Object>> cards = new ArrayList<>();
        for (int i = 1; i <= 300; i++) cards.add(card(String.format("語%03d", i), "nghĩa " + i, "N5", null));
        Map<String, String> ids = deck(token, "Ba trăm", cards, null);
        List<Object[]> logs = new ArrayList<>();
        for (String id : ids.values()) for (int i = 0; i < 3; i++) logs.add(new Object[] {uid, id});
        jdbc.batchUpdate("INSERT INTO review_logs (user_id, card_id, grade, source) VALUES (?, ?, 'again', 'flip')", logs);

        JsonNode res = weaknesses(token);
        assertEquals(300, res.get("total").asInt());
        assertTrue(res.get("canRemedial").asBoolean());
        int cap = settings.getInt(SettingsService.KEY_LP_DAILY_CAP);
        int for150 = Math.min(30, Math.max(3, LearningPathScheduler.suggestDays(150.0, cap)));
        int for300 = Math.min(30, Math.max(3, LearningPathScheduler.suggestDays(300.0, cap)));
        assertNotEquals(for150, for300, "fixture phải phân biệt được 150 và 300 thẻ");
        assertEquals(for150, res.get("suggestedDays").asInt(), "gợi ý cho đúng 150 thẻ lộ trình sẽ lấy");

        JsonNode path = read(call(post("/api/learning-paths/remedial"), token,
                Map.of("days", res.get("suggestedDays").asInt(), "groupBy", "level")).andExpect(status().isCreated()));
        assertEquals(1, path.get("chapters").size(), path.toString());
        assertEquals(150, path.get("chapters").get(0).get("cardCount").asInt());
        assertFalse(path.has("overflow"), "số ngày gợi ý vừa trần");
        JsonNode deck = read(call(get("/api/decks/" + path.get("chapters").get(0).get("deckId").asText()), token, null)
                .andExpect(status().isOk()));
        Set<String> terms = new HashSet<>();
        deck.get("cards").forEach(c -> terms.add(c.get("term").asText()));
        assertEquals(150, terms.size());
        assertTrue(terms.contains("語001") && terms.contains("語150"), "150 thẻ yếu nhất (hoà thì theo term)");
        assertFalse(terms.contains("語151"));
    }

    @Test
    void friction_requires_both_twice_personal_median_and_over_four_seconds_like_the_slow_reason() throws Exception {
        String none = newUser();
        JsonNode empty = read(call(get("/api/insights/friction"), none, null).andExpect(status().isOk()));
        assertFalse(empty.has("personalMedianMs"));
        assertEquals(0, empty.get("cards").size());

        // Người đọc nhanh (trung vị 1000): thẻ 3.5 s gấp 3.5 lần nhưng chưa tới 4 s -> không; đúng 4000 ms -> không (phải vượt)
        String a = newUser();
        String[] deckA = new String[1];
        Map<String, String> ids = deck(a, "Phản xạ", List.of(
                card("遅い", "chậm", "N5", null), card("普通", "vừa", "N5", null), card("四秒", "bốn giây", "N5", null),
                card("速い", "nhanh", "N5", null), card("早い", "sớm", "N5", null), card("少ない", "ít mẫu", "N5", null)), deckA);
        String slow = ids.get("遅い");
        // trung vị cá nhân = 1000 (24 / 43 mẫu); chia hai thẻ: ~17 lượt "good" liên tiếp một thẻ làm khoảng ôn tràn kiểu timestamp
        reviews(a, ids.get("速い"), "good", 1000, 12);
        reviews(a, ids.get("早い"), "good", 1000, 12);
        reviews(a, ids.get("普通"), "good", 3500, 5);
        reviews(a, ids.get("四秒"), "good", 4000, 5);
        reviews(a, slow, "good", 9000, 5);
        reviews(a, ids.get("少ない"), "good", 9000, 4); // chỉ 4 mẫu: chưa đủ để kết luận
        JsonNode res = read(call(get("/api/insights/friction"), a, null).andExpect(status().isOk()));
        assertEquals(1000, res.get("personalMedianMs").asInt(), res.toString());
        assertEquals(1, res.get("cards").size(), res.toString());
        JsonNode first = res.get("cards").get(0);
        assertEquals(slow, first.get("cardId").asText());
        assertEquals("遅い", first.get("term").asText());
        assertEquals("よみ", first.get("reading").asText());
        assertEquals("chậm", first.get("meaning").asText());
        assertEquals(deckA[0], first.get("deckId").asText());
        assertEquals(9000, first.get("medianReactionMs").asInt());
        assertEquals(5, first.get("samples").asInt());
        assertEquals(9.0, first.get("ratio").asDouble(), 0.001);
        assertSameAsSlowReason(a, res);

        // Trung vị 2500: đúng gấp 2 (5000) -> không (phải vượt); 5100 -> có
        String b = newUser();
        Map<String, String> idsB = deck(b, "Biên", List.of(
                card("基準", "chuẩn", "N5", null), card("二倍", "gấp đôi", "N5", null), card("超過", "vượt", "N5", null)), null);
        reviews(b, idsB.get("基準"), "good", 2500, 12);
        reviews(b, idsB.get("二倍"), "good", 5000, 5);
        reviews(b, idsB.get("超過"), "good", 5100, 5);
        JsonNode resB = read(call(get("/api/insights/friction"), b, null).andExpect(status().isOk()));
        assertEquals(2500, resB.get("personalMedianMs").asInt(), resB.toString());
        assertEquals(1, resB.get("cards").size(), resB.toString());
        assertEquals(idsB.get("超過"), resB.get("cards").get(0).get("cardId").asText());
        assertEquals(2.0, resB.get("cards").get(0).get("ratio").asDouble(), 0.001); // 2.04 làm tròn 1 chữ số
        assertSameAsSlowReason(b, resB);

        // Người đọc chậm (trung vị 5000): thẻ 4.5 s trên 4 s nhưng nhanh hơn chính họ -> không; 10.5 s (gấp 2.1) -> có
        String c = newUser();
        Map<String, String> idsC = deck(c, "Chậm rãi", List.of(
                card("普段", "thường ngày", "N5", null), card("少し", "hơi chậm", "N5", null), card("難問", "câu khó", "N5", null)), null);
        reviews(c, idsC.get("普段"), "good", 5000, 12);
        reviews(c, idsC.get("少し"), "good", 4500, 5);
        reviews(c, idsC.get("難問"), "good", 10500, 5);
        JsonNode resC = read(call(get("/api/insights/friction"), c, null).andExpect(status().isOk()));
        assertEquals(5000, resC.get("personalMedianMs").asInt(), resC.toString());
        assertEquals(1, resC.get("cards").size(), resC.toString());
        assertEquals(idsC.get("難問"), resC.get("cards").get(0).get("cardId").asText());
        assertEquals(2.1, resC.get("cards").get(0).get("ratio").asDouble(), 0.001);
        assertSameAsSlowReason(c, resC);
    }

    /** /friction và lý do "slow" của /weaknesses nói cùng một thứ về cùng người dùng. */
    private void assertSameAsSlowReason(String token, JsonNode friction) throws Exception {
        Set<String> slowReason = new HashSet<>();
        for (JsonNode c : weaknesses(token).get("cards")) if (reasons(c).contains("slow")) slowReason.add(c.get("cardId").asText());
        assertEquals(cardIds(friction), slowReason);
    }

    private List<String> kinds(JsonNode next) {
        List<String> out = new ArrayList<>();
        next.forEach(n -> out.add(n.get("kind").asText()));
        return out;
    }

    private JsonNode next(String token) throws Exception {
        return read(call(get("/api/insights/next"), token, null).andExpect(status().isOk()));
    }

    private static JsonNode firstOf(JsonNode next, String kind) {
        for (JsonNode n : next) if (kind.equals(n.get("kind").asText())) return n;
        return null;
    }

    private static Set<String> tos(JsonNode next) {
        Set<String> out = new HashSet<>();
        next.forEach(n -> out.add(n.get("to").asText()));
        return out;
    }

    @Test
    void next_orders_suggestions_by_priority_and_handles_empty_user() throws Exception {
        // Hai bộ public N5 của người khác, mỗi bộ 3 lượt tải: chắc chắn có ít nhất 2 gợi ý Thư viện
        String publisher = newUser();
        for (int i = 1; i <= 2; i++) {
            List<Map<String, Object>> cs = List.of(card("本" + i, "sách " + i, "N5", null), card("机" + i, "bàn " + i, "N5", null));
            String id = read(call(post("/api/decks"), publisher, Map.of("title", "Thư viện InsightIT " + i, "level", "N5",
                    "visibility", "public", "cards", cs)).andExpect(status().isCreated())).get("id").asText();
            for (int k = 0; k < 3; k++) call(post("/api/decks/" + id + "/clone"), newUser(), null).andExpect(status().isCreated());
        }

        String email = newEmail();
        String token = newUser(email);
        Long uid = userId(email);
        // Người mới: chỉ còn gợi ý Thư viện (bộ public cùng cấp N5 của người khác, tối đa 3)
        JsonNode fresh = next(token);
        assertTrue(fresh.size() >= 2 && fresh.size() <= 3, fresh.toString());
        for (JsonNode n : fresh) {
            assertEquals("library", n.get("kind").asText());
            assertTrue(n.get("to").asText().startsWith("/decks/"));
            assertTrue(n.get("count").asInt() > 0);
            JsonNode d = read(call(get(n.get("to").asText().replace("/decks/", "/api/decks/")), token, null)
                    .andExpect(status().isOk()));
            assertEquals("N5", d.get("level").asText(), "cùng cấp JLPT của người học");
            assertNotEquals(uid.longValue(), d.get("ownerId").asLong());
            assertEquals(n.get("title").asText(), d.get("title").asText());
            assertEquals(n.get("count").asInt(), d.get("cards").size());
        }
        // Học thẳng một bộ Thư viện (không lưu bản sao) -> không gợi ý lại; lưu bản sao bộ khác -> cũng không
        String studied = fresh.get(0).get("to").asText().substring("/decks/".length());
        String studiedCard = read(call(get("/api/decks/" + studied), token, null)).get("cards").get(0).get("id").asText();
        review(token, studiedCard, "good", null);
        assertFalse(tos(next(token)).contains("/decks/" + studied));
        String cloned = fresh.get(1).get("to").asText().substring("/decks/".length());
        call(post("/api/decks/" + cloned + "/clone"), token, null).andExpect(status().isCreated());
        Set<String> afterClone = tos(next(token));
        assertFalse(afterClone.contains("/decks/" + cloned));
        assertFalse(afterClone.contains("/decks/" + studied));

        // 12 thẻ yếu (3 "again" mỗi thẻ) -> đề xuất bổ khuyết, trước Thư viện
        List<Map<String, Object>> cards = new ArrayList<>();
        String[] kanji = {"水", "火", "金", "木", "土", "日", "月", "山", "川", "田", "人", "口"};
        for (String k : kanji) cards.add(card(k + "語", "nghĩa " + k, "N5", null));
        Map<String, String> ids = deck(token, "Yếu", cards, null);
        for (String id : ids.values()) reviews(token, id, "again", null, 3);
        JsonNode weakOnly = next(token);
        assertEquals("remedial", weakOnly.get(0).get("kind").asText(), weakOnly.toString());
        assertEquals(12, weakOnly.get(0).get("count").asInt());
        assertEquals("/roadmap?remedial=1", weakOnly.get(0).get("to").asText());
        assertEquals("library", weakOnly.get(1).get("kind").asText());

        // 2 thẻ đến hạn (ngoài lộ trình) -> "due" đứng trước "remedial"
        List<String> all = new ArrayList<>(ids.values());
        for (String id : all.subList(0, 2)) {
            jdbc.update("UPDATE reviews SET due_at = ? WHERE card_id = ?", OffsetDateTime.now(ZoneOffset.UTC).minusHours(1), id);
        }
        JsonNode withDue = next(token);
        assertEquals(List.of("due", "remedial"), kinds(withDue).subList(0, 2), withDue.toString());
        assertEquals(2, withDue.get(0).get("count").asInt());
        assertEquals("/decks", withDue.get(0).get("to").asText());

        // Tạo lộ trình bổ khuyết (ACTIVE từ hôm nay) -> phiên hôm nay đứng đầu, rồi due, remedial (thẻ gốc vẫn yếu), chương kế
        // (chương chưa tới ngày), rồi Thư viện; thẻ đến hạn là thẻ gốc, không nằm trong lộ trình (lộ trình học bản clone)
        JsonNode path = read(call(post("/api/learning-paths/remedial"), token, Map.of("days", 5, "groupBy", "kanji"))
                .andExpect(status().isCreated()));
        String pid = path.get("id").asText();
        assertEquals("ACTIVE", path.get("status").asText());
        int todayNew = path.get("today").get("newCount").asInt();
        assertTrue(todayNew > 0, path.toString());
        JsonNode withPath = next(token);
        List<String> ks = kinds(withPath);
        assertEquals(List.of("path_today", "due", "remedial", "next_chapter"), ks.subList(0, 4), withPath.toString());
        assertEquals("library", ks.get(ks.size() - 1));
        JsonNode first = withPath.get(0);
        assertEquals(path.get("title").asText(), first.get("title").asText());
        assertEquals(todayNew, first.get("count").asInt());
        assertEquals("/session?session=today&path=" + pid, first.get("to").asText());
        assertEquals(2, withPath.get(1).get("count").asInt());
        assertEquals(12, withPath.get(2).get("count").asInt());
        JsonNode chapter = firstOf(withPath, "next_chapter");
        assertEquals("/roadmap/" + pid, chapter.get("to").asText());
        String lockedTitle = null;
        for (JsonNode c : path.get("chapters")) {
            if ("locked".equals(c.get("state").asText())) {
                lockedTitle = c.get("title").asText();
                break;
            }
        }
        assertEquals(lockedTitle, chapter.get("title").asText(), "chương locked đầu tiên của lộ trình mới nhất");
        assertNull(firstOf(withPath, "catchup"), "ngày 1 chưa có thẻ nợ");

        // Ngày mai (?date=): thẻ mới ngày 1 chưa học thành nợ -> thêm "catchup" sau "due"
        String startDate = path.get("startDate").asText();
        String tomorrow = LocalDate.parse(startDate).plusDays(1).toString();
        JsonNode later = read(call(get("/api/insights/next").param("date", tomorrow), token, null)
                .andExpect(status().isOk()));
        JsonNode catchup = firstOf(later, "catchup");
        assertNotNull(catchup, later.toString());
        assertEquals(todayNew, catchup.get("count").asInt());
        assertEquals("/session?session=catchup&path=" + pid, catchup.get("to").asText());
        List<String> lk = kinds(later);
        assertEquals(List.of("path_today", "due", "catchup", "remedial", "next_chapter"), lk.subList(0, 5), later.toString());

        // Học hết 12 thẻ (clone) rồi chốt hoàn thành: lộ trình không còn gợi ý (phiên hôm nay / chương kế), và thẻ đến hạn của nó
        // về lại mục "due" thay vì biến mất khỏi "học gì tiếp"
        List<String> clones = new ArrayList<>();
        for (JsonNode c : path.get("chapters")) {
            read(call(get("/api/decks/" + c.get("deckId").asText()), token, null).andExpect(status().isOk()))
                    .get("cards").forEach(x -> clones.add(x.get("id").asText()));
        }
        assertEquals(12, clones.size());
        for (String id : clones) {
            call(post("/api/reviews"), token, Map.of("cardId", id, "grade", "good", "pathId", pid)).andExpect(status().isOk());
        }
        JsonNode done = read(call(post("/api/learning-paths/" + pid + "/complete").param("date", startDate), token, null)
                .andExpect(status().isOk()));
        assertTrue(done.hasNonNull("completedAt"), done.toString());
        for (String id : clones.subList(0, 3)) {
            jdbc.update("UPDATE reviews SET due_at = ? WHERE user_id = ? AND card_id = ?",
                    OffsetDateTime.now(ZoneOffset.UTC).minus(Duration.ofHours(1)), uid, id);
        }
        JsonNode afterDone = read(call(get("/api/insights/next").param("date", startDate), token, null)
                .andExpect(status().isOk()));
        assertFalse(tos(afterDone).contains("/session?session=today&path=" + pid), afterDone.toString());
        assertNull(firstOf(afterDone, "next_chapter"), "không còn lộ trình đang học");
        JsonNode due = firstOf(afterDone, "due");
        assertNotNull(due, afterDone.toString());
        assertEquals(5, due.get("count").asInt(), "2 thẻ gốc + 3 thẻ của lộ trình đã hoàn thành");
        assertEquals("due", afterDone.get(0).get("kind").asText());
    }
}
