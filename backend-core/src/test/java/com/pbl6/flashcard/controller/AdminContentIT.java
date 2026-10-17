package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.model.ContentReport;
import com.pbl6.flashcard.model.ExtractionJob;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.repository.ContentReportRepository;
import com.pbl6.flashcard.repository.ExtractionJobRepository;
import com.pbl6.flashcard.service.AiServiceClient;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockPart;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Admin kiểm duyệt: bộ thẻ (gỡ / cờ / xoá), bình luận, job bóc tách. */
class AdminContentIT extends IntegrationTest {

    @MockitoBean
    AiServiceClient aiClient;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    ContentReportRepository reports;

    @Autowired
    ExtractionJobRepository jobs;

    private record Account(String email, String token, Long id) {}

    private Account user() throws Exception {
        String email = newEmail();
        return new Account(email, newUser(email), userId(email));
    }

    private Account staff(Role role) throws Exception {
        String email = newEmail();
        return new Account(email, newStaff(role, email), userId(email));
    }

    private JsonNode publicDeck(String token, String title) throws Exception {
        return read(call(post("/api/decks"), token, Map.of("title", title, "level", "N5", "visibility", "public",
                "cards", List.of(Map.of("term", "猫", "meaning", "mèo"), Map.of("term", "犬", "meaning", "chó"))))
                .andExpect(status().isCreated()));
    }

    private long auditCount(String token, String targetType, String targetId) throws Exception {
        JsonNode p = read(call(get("/api/admin/audit-logs").param("targetType", targetType).param("size", "100"), token, null));
        long n = 0;
        for (JsonNode r : p.get("items")) if (r.get("targetId").asText().equals(targetId)) n++;
        return n;
    }

    private void openReport(Long reporterId, String deckId) {
        ContentReport r = new ContentReport();
        r.setDeckId(deckId);
        r.setReporterId(reporterId);
        r.setReason("SPAM");
        reports.save(r);
    }

    @Test
    void unpublish_makes_deck_private_for_everyone_but_owner() throws Exception { // CT-01
        Account owner = user();
        Account other = user();
        Account admin = staff(Role.ADMIN);
        String id = publicDeck(owner.token, "Public").get("id").asText();
        call(get("/api/decks/" + id), other.token, null).andExpect(status().isOk());

        JsonNode res = read(call(post("/api/admin/decks/" + id + "/unpublish"), admin.token, null).andExpect(status().isOk()));
        assertEquals("private", res.get("visibility").asText());
        assertEquals("owner", read(call(get("/api/decks/" + id), owner.token, null).andExpect(status().isOk())).get("access").asText());
        call(get("/api/decks/" + id), other.token, null).andExpect(status().isNotFound());
        JsonNode lib = read(call(get("/api/library/decks").param("q", "Public"), other.token, null));
        for (JsonNode d : lib.get("items")) assertNotEquals(id, d.get("id").asText());
        assertEquals(1, auditCount(admin.token, "DECK", id));
    }

    @Test
    void unpublishing_private_deck_is_noop_without_audit() throws Exception { // CT-02
        Account owner = user();
        Account admin = staff(Role.ADMIN);
        String id = read(call(post("/api/decks"), owner.token, Map.of("title", "P", "level", "N5", "cards", List.of()))
                .andExpect(status().isCreated())).get("id").asText();
        call(post("/api/admin/decks/" + id + "/unpublish"), admin.token, null).andExpect(status().isOk());
        assertEquals(0, auditCount(admin.token, "DECK", id));
    }

    @Test
    void flags_make_deck_featured_in_library() throws Exception { // CT-03
        Account owner = user();
        Account admin = staff(Role.ADMIN);
        String id = publicDeck(owner.token, "Nổi bật").get("id").asText();
        JsonNode res = read(call(patch("/api/admin/decks/" + id + "/flags"), admin.token, Map.of("official", true, "featured", true))
                .andExpect(status().isOk()));
        assertTrue(res.get("official").asBoolean());
        assertTrue(res.get("featured").asBoolean());
        JsonNode lib = read(call(get("/api/library/decks").param("tab", "official"), owner.token, null).andExpect(status().isOk()));
        assertEquals(id, lib.get("featured").get("deck").get("id").asText(), "bộ nổi bật của Thư viện");
        assertTrue(lib.get("items").findValuesAsText("id").contains(id), "có trong tab official");
        assertEquals(1, auditCount(admin.token, "DECK", id));
    }

    @Test
    void admin_delete_removes_deck_and_dependents() throws Exception { // CT-04
        Account owner = user();
        Account other = user();
        Account admin = staff(Role.ADMIN);
        JsonNode deck = publicDeck(owner.token, "Xoá");
        String id = deck.get("id").asText();
        String cardId = deck.get("cards").get(0).get("id").asText();
        call(put("/api/decks/" + id + "/shares"), owner.token, Map.of("email", other.email, "permission", "VIEWER")).andExpect(status().isOk());
        call(put("/api/library/decks/" + id + "/rating"), other.token, Map.of("stars", 4, "comment", "ok")).andExpect(status().isOk());
        call(post("/api/reviews"), other.token, Map.of("cardId", cardId, "grade", "good")).andExpect(status().isOk());

        call(delete("/api/admin/decks/" + id), admin.token, null).andExpect(status().isNoContent());
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM deck_shares WHERE deck_id = ?", Long.class, id));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM deck_ratings WHERE deck_id = ?", Long.class, id));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM reviews WHERE card_id = ?", Long.class, cardId));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM flashcards WHERE deck_id = ?", Long.class, id));
        for (JsonNode d : read(call(get("/api/decks"), owner.token, null))) assertNotEquals(id, d.get("id").asText());
        assertEquals(1, auditCount(admin.token, "DECK", id));
    }

    @Test
    void viewer_cannot_delete_deck() throws Exception { // CT-05
        Account owner = user();
        String id = publicDeck(owner.token, "V").get("id").asText();
        call(delete("/api/admin/decks/" + id), staff(Role.VIEWER).token, null).andExpect(status().isForbidden());
    }

    @Test
    void private_deck_cards_are_hidden_unless_reported() throws Exception { // CT-06, CT-07
        Account owner = user();
        Account reporter = user();
        Account viewer = staff(Role.VIEWER);
        String id = read(call(post("/api/decks"), owner.token, Map.of("title", "Riêng", "level", "N5",
                "cards", List.of(Map.of("term", "猫", "meaning", "mèo")))).andExpect(status().isCreated())).get("id").asText();
        JsonNode hidden = read(call(get("/api/admin/decks/" + id), viewer.token, null).andExpect(status().isOk()));
        assertTrue(hidden.get("cards").isNull());
        assertEquals(0, hidden.get("openReports").asInt());

        openReport(reporter.id, id);
        JsonNode shown = read(call(get("/api/admin/decks/" + id), viewer.token, null));
        assertEquals(1, shown.get("cards").size());
        assertEquals(1, shown.get("openReports").asInt());

        ContentReport r = reports.findAll().stream().filter(x -> x.getDeckId().equals(id)).findFirst().orElseThrow();
        r.setStatus(ContentReport.RESOLVED);
        r.setResolvedAt(java.time.Instant.now());
        reports.save(r);
        assertTrue(read(call(get("/api/admin/decks/" + id), viewer.token, null)).get("cards").isNull());
    }

    @Test
    void clearing_comment_keeps_stars() throws Exception { // CT-08, CT-09
        Account owner = user();
        Account rater = user();
        Account admin = staff(Role.ADMIN);
        String id = publicDeck(owner.token, "Sao").get("id").asText();
        call(put("/api/library/decks/" + id + "/rating"), rater.token, Map.of("stars", 2, "comment", "tệ")).andExpect(status().isOk());

        JsonNode list = read(call(get("/api/admin/ratings").param("deckId", id), admin.token, null).andExpect(status().isOk()));
        assertEquals(1, list.get("total").asLong());
        long ratingId = list.get("items").get(0).get("id").asLong();
        assertEquals("tệ", list.get("items").get(0).get("comment").asText());

        call(delete("/api/admin/ratings/" + ratingId + "/comment"), admin.token, null).andExpect(status().isNoContent());
        JsonNode ratings = read(call(get("/api/library/decks/" + id + "/ratings"), owner.token, null));
        assertEquals(2.0, ratings.get("rating").asDouble(), 0.01);
        assertEquals(0, read(call(get("/api/admin/ratings").param("deckId", id), admin.token, null)).get("total").asLong(),
                "danh sách chỉ gồm dòng còn bình luận");
        assertEquals(1, auditCount(admin.token, "RATING", String.valueOf(ratingId)));

        call(delete("/api/admin/ratings/" + ratingId + "/comment"), admin.token, null).andExpect(status().isNoContent());
        assertEquals(1, auditCount(admin.token, "RATING", String.valueOf(ratingId)), "xoá lần 2 không audit");
    }

    @Test
    void extraction_list_hides_text_and_running_or_path_jobs_cannot_be_deleted() throws Exception { // CT-10, CT-11
        Account u = user();
        Account admin = staff(Role.ADMIN);
        String jobId = read(call(multipart("/api/extractions").part(new MockPart("text", "猫が好きです。".getBytes(StandardCharsets.UTF_8))), u.token, null)
                .andExpect(status().isAccepted())).get("id").asText();

        JsonNode list = read(call(get("/api/admin/extractions").param("userId", u.id.toString()), admin.token, null).andExpect(status().isOk()));
        assertEquals(1, list.get("total").asLong());
        JsonNode row = list.get("items").get(0);
        assertTrue(row.path("extractedText").isMissingNode(), "không trả văn bản đã trích");
        assertEquals(u.email, row.get("userEmail").asText());

        ExtractionJob job = jobs.findById(UUID.fromString(jobId)).orElseThrow();
        job.setStatus(ExtractionJob.RUNNING);
        jobs.save(job);
        call(delete("/api/admin/extractions/" + jobId), admin.token, null).andExpect(status().isConflict());

        job.setStatus(ExtractionJob.FAILED);
        job.setPurpose(ExtractionJob.PURPOSE_LEARNING_PATH);
        jobs.save(job);
        call(delete("/api/admin/extractions/" + jobId), admin.token, null).andExpect(status().isConflict());

        job.setPurpose(ExtractionJob.PURPOSE_EXTRACTION);
        jobs.save(job);
        call(delete("/api/admin/extractions/" + jobId), admin.token, null).andExpect(status().isNoContent());
        assertTrue(jobs.findById(UUID.fromString(jobId)).isEmpty());
        assertEquals(1, auditCount(admin.token, "EXTRACTION", jobId));
    }

    @Test
    void deck_filters_are_validated_and_unrated_deck_has_null_average() throws Exception { // CT-12, CT-13
        Account owner = user();
        Account viewer = staff(Role.VIEWER);
        String id = publicDeck(owner.token, "Chưa sao").get("id").asText();
        call(get("/api/admin/decks").param("visibility", "foo"), viewer.token, null).andExpect(status().isBadRequest());
        JsonNode page = read(call(get("/api/admin/decks").param("q", "Chưa sao").param("ownerId", owner.id.toString()), viewer.token, null)
                .andExpect(status().isOk()));
        assertEquals(1, page.get("total").asLong());
        JsonNode row = page.get("items").get(0);
        assertEquals(id, row.get("id").asText());
        assertTrue(row.get("avgStars").isNull());
        assertEquals(2, row.get("cardCount").asInt());
        assertEquals(owner.email, row.get("ownerEmail").asText());
    }
}
