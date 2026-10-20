package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Báo cáo bộ thẻ vi phạm (người học gửi) và xử lý (ADMIN). */
class ContentReportIT extends IntegrationTest {

    private record Account(String email, String token, Long id) {}

    private Account user() throws Exception {
        String email = newEmail();
        return new Account(email, newUser(email), userId(email));
    }

    private Account staff(Role role) throws Exception {
        String email = newEmail();
        return new Account(email, newStaff(role, email), userId(email));
    }

    private String publicDeck(String token, String title) throws Exception {
        return read(call(post("/api/decks"), token, Map.of("title", title, "level", "N5", "visibility", "public",
                "cards", List.of(Map.of("term", "猫", "meaning", "mèo")))).andExpect(status().isCreated())).get("id").asText();
    }

    private ResultActions report(String token, String deckId, String reason, String detail) throws Exception {
        Map<String, Object> body = detail == null ? Map.of("reason", reason) : Map.of("reason", reason, "detail", detail);
        return call(post("/api/library/decks/" + deckId + "/reports"), token, body);
    }

    private long openReports(String staffToken) throws Exception {
        return read(call(get("/api/admin/reports").param("status", "OPEN").param("size", "1"), staffToken, null)).get("total").asLong();
    }

    private long auditCount(String token, String targetType, String targetId) throws Exception {
        JsonNode p = read(call(get("/api/admin/audit-logs").param("targetType", targetType).param("size", "100"), token, null));
        long n = 0;
        for (JsonNode r : p.get("items")) if (r.get("targetId").asText().equals(targetId)) n++;
        return n;
    }

    @Test
    void user_reports_public_deck_of_someone_else() throws Exception { // RP-01, RP-15
        Account owner = user();
        Account reporter = user();
        Account viewer = staff(Role.ADMIN);
        String id = publicDeck(owner.token, "Sai");
        long before = openReports(viewer.token);
        JsonNode res = read(report(reporter.token, id, "WRONG_CONTENT", "Nghĩa thẻ 1 sai").andExpect(status().isCreated()));
        assertEquals("OPEN", res.get("status").asText());
        assertEquals(before + 1, openReports(viewer.token));

        JsonNode page = read(call(get("/api/admin/reports").param("deckId", id), viewer.token, null).andExpect(status().isOk()));
        JsonNode row = page.get("items").get(0);
        assertEquals(reporter.email, row.get("reporterEmail").asText());
        assertEquals("Sai", row.get("deckTitle").asText());
        assertEquals("public", row.get("deckVisibility").asText());
        assertEquals(1, row.get("sameDeckOpen").asInt());
    }

    @Test
    void owner_cannot_report_own_deck() throws Exception { // RP-02
        Account owner = user();
        report(owner.token, publicDeck(owner.token, "Của tôi"), "SPAM", null).andExpect(status().isBadRequest());
    }

    @Test
    void private_or_unknown_deck_is_404() throws Exception { // RP-03
        Account owner = user();
        Account other = user();
        String priv = read(call(post("/api/decks"), owner.token, Map.of("title", "P", "level", "N5", "cards", List.of()))
                .andExpect(status().isCreated())).get("id").asText();
        report(other.token, priv, "SPAM", null).andExpect(status().isNotFound());
        report(other.token, "khong-ton-tai", "SPAM", null).andExpect(status().isNotFound());
    }

    @Test
    void second_open_report_is_409_until_first_is_resolved() throws Exception { // RP-04, RP-05
        Account owner = user();
        Account reporter = user();
        Account admin = staff(Role.ADMIN);
        String id = publicDeck(owner.token, "Hai lần");
        long first = read(report(reporter.token, id, "SPAM", null).andExpect(status().isCreated())).get("id").asLong();
        report(reporter.token, id, "SPAM", null).andExpect(status().isConflict());
        call(post("/api/admin/reports/" + first + "/resolve"), admin.token, Map.of("action", "NONE")).andExpect(status().isOk());
        report(reporter.token, id, "SPAM", null).andExpect(status().isCreated());
    }

    @Test
    void reason_other_requires_detail_and_detail_is_limited() throws Exception { // RP-06, RP-07
        Account owner = user();
        Account reporter = user();
        String id = publicDeck(owner.token, "Khác");
        report(reporter.token, id, "OTHER", null).andExpect(status().isBadRequest());
        report(reporter.token, id, "OTHER", "   ").andExpect(status().isBadRequest());
        report(reporter.token, id, "SPAM", "x".repeat(501)).andExpect(status().isBadRequest());
        report(reporter.token, id, "BOGUS", null).andExpect(status().isBadRequest());
    }

    @Test
    void eleventh_report_within_an_hour_is_rate_limited() throws Exception { // RP-08
        Account owner = user();
        Account reporter = user();
        for (int i = 0; i < 10; i++) {
            report(reporter.token, publicDeck(owner.token, "D" + i), "SPAM", null).andExpect(status().isCreated());
        }
        report(reporter.token, publicDeck(owner.token, "D10"), "SPAM", null).andExpect(status().isTooManyRequests());
    }

    @Test
    void resolve_with_unpublish_hides_deck_and_audits_twice() throws Exception { // RP-09
        Account owner = user();
        Account reporter = user();
        Account other = user();
        Account admin = staff(Role.ADMIN);
        String id = publicDeck(owner.token, "Gỡ");
        long rid = read(report(reporter.token, id, "COPYRIGHT", "sách X")).get("id").asLong();

        JsonNode res = read(call(post("/api/admin/reports/" + rid + "/resolve"), admin.token,
                Map.of("action", "UNPUBLISH_DECK", "note", "Vi phạm bản quyền")).andExpect(status().isOk()));
        assertEquals("RESOLVED", res.get("status").asText());
        assertEquals("UNPUBLISH_DECK", res.get("action").asText());
        assertEquals(admin.email, res.get("resolvedByEmail").asText());
        assertFalse(res.get("resolvedAt").isNull());
        // response xử lý đọc lại từ DB sau câu UPDATE: cùng mốc với danh sách tới micro giây
        JsonNode listed = read(call(get("/api/admin/reports").param("status", "RESOLVED").param("deckId", id), admin.token, null)
                .andExpect(status().isOk())).get("items").get(0);
        assertEquals(res.get("resolvedAt").asText(), listed.get("resolvedAt").asText());
        assertEquals(res.get("createdAt").asText(), listed.get("createdAt").asText());
        call(get("/api/decks/" + id), other.token, null).andExpect(status().isNotFound());
        assertEquals(1, auditCount(admin.token, "REPORT", String.valueOf(rid)));
        assertEquals(1, auditCount(admin.token, "DECK", id));
    }

    @Test
    void resolve_with_clear_comment_needs_rating_of_same_deck() throws Exception { // RP-10
        Account owner = user();
        Account reporter = user();
        Account rater = user();
        Account admin = staff(Role.ADMIN);
        String id = publicDeck(owner.token, "Bình luận");
        String otherDeck = publicDeck(owner.token, "Khác");
        call(put("/api/library/decks/" + id + "/rating"), rater.token, Map.of("stars", 1, "comment", "Lừa đảo")).andExpect(status().isOk());
        call(put("/api/library/decks/" + otherDeck + "/rating"), rater.token, Map.of("stars", 5, "comment", "Hay")).andExpect(status().isOk());
        long ratingId = read(call(get("/api/admin/ratings").param("deckId", id), admin.token, null)).get("items").get(0).get("id").asLong();
        long otherRating = read(call(get("/api/admin/ratings").param("deckId", otherDeck), admin.token, null)).get("items").get(0).get("id").asLong();
        long rid = read(report(reporter.token, id, "OFFENSIVE", "bình luận xúc phạm")).get("id").asLong();

        call(post("/api/admin/reports/" + rid + "/resolve"), admin.token, Map.of("action", "CLEAR_COMMENT")).andExpect(status().isBadRequest());
        call(post("/api/admin/reports/" + rid + "/resolve"), admin.token, Map.of("action", "CLEAR_COMMENT", "ratingId", otherRating))
                .andExpect(status().isBadRequest());
        call(post("/api/admin/reports/" + rid + "/resolve"), admin.token, Map.of("action", "CLEAR_COMMENT", "ratingId", ratingId))
                .andExpect(status().isOk());
        JsonNode ratings = read(call(get("/api/library/decks/" + id + "/ratings"), owner.token, null));
        assertEquals(1.0, ratings.get("rating").asDouble(), 0.01);
        assertTrue(ratings.get("items").get(0).get("comment").isNull());
        assertEquals(1, auditCount(admin.token, "REPORT", String.valueOf(rid)));
        assertEquals(1, auditCount(admin.token, "RATING", String.valueOf(ratingId)));
    }

    @Test
    void resolving_twice_or_dismissing_after_resolve_is_409() throws Exception { // RP-11
        Account owner = user();
        Account reporter = user();
        Account admin = staff(Role.ADMIN);
        long rid = read(report(reporter.token, publicDeck(owner.token, "2x"), "SPAM", null)).get("id").asLong();
        call(post("/api/admin/reports/" + rid + "/resolve"), admin.token, Map.of("action", "NONE")).andExpect(status().isOk());
        call(post("/api/admin/reports/" + rid + "/resolve"), admin.token, Map.of("action", "NONE")).andExpect(status().isConflict());
        call(post("/api/admin/reports/" + rid + "/dismiss"), admin.token, Map.of("note", "x")).andExpect(status().isConflict());
    }

    @Test
    void concurrent_resolves_let_exactly_one_win() throws Exception { // RP-12
        Account owner = user();
        Account reporter = user();
        Account a = staff(Role.ADMIN);
        Account b = staff(Role.ADMIN);
        long rid = read(report(reporter.token, publicDeck(owner.token, "Đua"), "SPAM", null)).get("id").asLong();

        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<Integer>> results = new ArrayList<>();
        for (String token : List.of(a.token, b.token)) {
            results.add(pool.submit(() -> {
                go.await();
                return call(post("/api/admin/reports/" + rid + "/resolve"), token, Map.of("action", "NONE"))
                        .andReturn().getResponse().getStatus();
            }));
        }
        go.countDown();
        List<Integer> statuses = new ArrayList<>();
        for (Future<Integer> f : results) statuses.add(f.get(30, TimeUnit.SECONDS));
        pool.shutdown();
        assertTrue(statuses.contains(200) && statuses.contains(409), statuses.toString());
        assertEquals(1, auditCount(a.token, "REPORT", String.valueOf(rid)));
    }

    @Test
    void unpublish_action_on_private_deck_only_audits_report() throws Exception { // RP-13
        Account owner = user();
        Account reporter = user();
        Account admin = staff(Role.ADMIN);
        String id = publicDeck(owner.token, "Đã private");
        long rid = read(report(reporter.token, id, "SPAM", null)).get("id").asLong();
        call(post("/api/admin/decks/" + id + "/unpublish"), admin.token, null).andExpect(status().isOk());
        call(post("/api/admin/reports/" + rid + "/resolve"), admin.token, Map.of("action", "UNPUBLISH_DECK")).andExpect(status().isOk());
        assertEquals(1, auditCount(admin.token, "DECK", id), "chỉ lần gỡ tay, resolve không gỡ lại");
        assertEquals(1, auditCount(admin.token, "REPORT", String.valueOf(rid)));
    }

    @Test
    void deleting_deck_removes_its_open_reports() throws Exception { // RP-14
        Account owner = user();
        Account reporter = user();
        Account admin = staff(Role.ADMIN);
        String id = publicDeck(owner.token, "Xoá kèm báo cáo");
        report(reporter.token, id, "SPAM", null).andExpect(status().isCreated());
        long before = openReports(admin.token);
        call(delete("/api/admin/decks/" + id), admin.token, null).andExpect(status().isNoContent());
        assertEquals(before - 1, openReports(admin.token));
    }

    @Test
    void dismiss_records_note_and_status() throws Exception {
        Account owner = user();
        Account reporter = user();
        Account admin = staff(Role.ADMIN);
        long rid = read(report(reporter.token, publicDeck(owner.token, "Bỏ qua"), "SPAM", null)).get("id").asLong();
        JsonNode res = read(call(post("/api/admin/reports/" + rid + "/dismiss"), admin.token, Map.of("note", "Không vi phạm")).andExpect(status().isOk()));
        assertEquals("DISMISSED", res.get("status").asText());
        assertEquals("Không vi phạm", res.get("resolutionNote").asText());
        JsonNode dismissed = read(call(get("/api/admin/reports").param("status", "DISMISSED").param("size", "100"), admin.token, null));
        assertTrue(dismissed.get("items").findValuesAsText("id").contains(String.valueOf(rid)));
    }
}
