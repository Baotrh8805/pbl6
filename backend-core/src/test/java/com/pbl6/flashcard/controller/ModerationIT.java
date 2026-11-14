package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.pbl6.flashcard.dto.moderation.ModerationDtos.Signal;
import com.pbl6.flashcard.dto.moderation.ModerationDtos.Span;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.service.AiServiceClient;
import com.pbl6.flashcard.service.HousekeepingJob;
import com.pbl6.flashcard.service.dictionary.DictionaryAiClient;
import com.pbl6.flashcard.service.dictionary.DictionaryService;
import com.pbl6.flashcard.service.moderation.ModerationAiClient;
import com.pbl6.flashcard.service.moderation.ModerationService;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Kiểm duyệt bình luận bằng AI (spec docs/Plan/specs/2026-10-27-kiem-duyet-ai-va-hlr-design.md, D31). ai-service giả lập:
 * {@link ModerationAiClient} trả nhãn theo từ khoá ("chó" = thù ghét + từ đánh dấu, "ngu" = xúc phạm, "vãi" = sạch nhưng từ đánh dấu
 * rất chắc), {@link DictionaryAiClient} trả mục từ (có / không nhãn JMdict vulg).
 */
class ModerationIT extends IntegrationTest {

    @MockitoBean
    ModerationAiClient modAi;

    @MockitoBean
    DictionaryAiClient dictAi;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    DictionaryService dictionary;

    @Autowired
    ModerationService moderation;

    @Autowired
    HousekeepingJob housekeeping;

    @Autowired
    ObjectMapper json;

    private String id;

    @BeforeEach
    void setUp() throws Exception {
        Mockito.reset(modAi, dictAi);
        dictionary.invalidate();
        id = String.valueOf(ThreadLocalRandom.current().nextLong(1_000_000_000L, 9_999_999_999L));
        Mockito.when(dictAi.entry(Mockito.anyString())).thenAnswer(inv -> entryJson(inv.getArgument(0), false));
        // nghĩa Việt có sẵn: mở mục không gọi dịch Gemini (client giả trả null)
        jdbc.update("INSERT INTO dict_meanings (entry_key, term, reading, meaning_vi, status, source) VALUES (?,?,?,?, 'MACHINE','SEED') "
                + "ON CONFLICT (entry_key) DO NOTHING", "w:" + id, "糞", "くそ", "phân");
        aiUp();
    }

    // ------------------------------------------------------------------ giả lập

    /** Từ khoá so theo cả từ (không phân biệt hoa thường): "Nguyễn" không chứa từ "ngu". */
    static Signal signalFor(String text) {
        List<Span> spans = new ArrayList<>();
        java.util.Set<String> hit = new java.util.HashSet<>();
        for (String w : List.of("chó", "ngu", "vãi")) {
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("(?iu)(?<!\\p{L})" + w + "(?!\\p{L})").matcher(text);
            if (m.find()) {
                hit.add(w);
                spans.add(new Span(w, m.start(), m.end(), w.equals("ngu") ? 0.95 : 0.99));
            }
        }
        if (hit.contains("chó")) return new Signal(2, List.of(0.02, 0.08, 0.9), 0.9, spans, true, false);
        if (hit.contains("ngu")) return new Signal(1, List.of(0.3, 0.6, 0.1), 0.6, spans, true, false);
        if (hit.contains("vãi")) return new Signal(0, List.of(0.85, 0.1, 0.05), 0.85, spans, true, false);
        return new Signal(0, List.of(0.98, 0.01, 0.01), 0.98, List.of(), true, false);
    }

    private void aiUp() {
        Mockito.doAnswer(inv -> {
            List<String> texts = inv.getArgument(0);
            return texts.stream().map(ModerationIT::signalFor).toList();
        }).when(modAi).check(Mockito.anyList());
    }

    private void aiDown() {
        Mockito.doThrow(new AiServiceClient.AiServiceException("ai-service tắt", 0, null)).when(modAi).check(Mockito.anyList());
    }

    private JsonNode entryJson(String wid, boolean vulgar) throws Exception {
        ObjectNode e = (ObjectNode) json.readTree("""
                {"id":"%s","key":"w:%s","kind":"word","headKanji":"糞","headKana":"くそ","reading":"くそ","readingOriginal":"くそ",
                 "hanViet":"PHẨN","hanVietChars":[{"char":"糞","reading":"PHẨN"}],"jlpt":null,"common":true,
                 "senses":[{"pos":["n"],"gloss":["feces"],"posText":["noun"],"misc":[]}],"glossShort":"feces",
                 "examples":[],"kanjiChars":[{"char":"糞","hanViet":"PHẨN","meaningEn":"excrement"}],"relatedSameReading":[]}
                """.formatted(wid, wid));
        if (vulgar) ((ArrayNode) e.path("senses").get(0).path("misc")).add("vulg");
        return e;
    }

    private JsonNode comment(String token, String key, String content, int expectStatus) throws Exception {
        return read(call(post("/api/dictionary/entries/{key}/comments", key), token, Map.of("content", content))
                .andExpect(status().is(expectStatus)));
    }

    private JsonNode list(String token, String key) throws Exception {
        return read(call(get("/api/dictionary/entries/{key}/comments", key), token, null).andExpect(status().isOk()));
    }

    private JsonNode queue(String admin, String status) throws Exception {
        return read(call(get("/api/admin/moderation").param("status", status).param("size", "50"), admin, null).andExpect(status().isOk()));
    }

    private static JsonNode find(JsonNode page, long id) {
        for (JsonNode it : page.get("items")) if (it.get("id").asLong() == id) return it;
        return null;
    }

    private JsonNode publicDeck(String token) throws Exception {
        return read(call(post("/api/decks"), token, Map.of("title", "Bộ " + id, "level", "N5", "visibility", "public",
                "cards", List.of(Map.of("term", "猫", "meaning", "mèo")))).andExpect(status().isCreated()));
    }

    // ------------------------------------------------------------------ bình luận từ điển

    @Test
    void clean_comment_publishes_without_moderation_info() throws Exception {
        String key = "w:" + id;
        String alice = newUser();
        String bob = newUser();
        JsonNode c = comment(alice, key, "Từ này hay dùng trong văn nói", 201);
        assertTrue(c.path("moderation").isMissingNode() || c.get("moderation").isNull());
        assertEquals("CLEAN", jdbc.queryForObject("SELECT mod_status FROM dict_comments WHERE id = ?", String.class, c.get("id").asLong()));
        assertEquals(1, list(bob, key).get("total").asInt());
        Mockito.verify(modAi).check(List.of("Từ này hay dùng trong văn nói"));
    }

    @Test
    void flagged_comment_is_masked_for_others_until_admin_ignores() throws Exception {
        String key = "w:" + id;
        String alice = newUser();
        String bob = newUser();
        String admin = newStaff(Role.ADMIN);
        JsonNode c = comment(alice, key, "Giải thích ngu thế", 201);
        long cid = c.get("id").asLong();
        assertEquals("FLAGGED", c.get("moderation").get("status").asText());
        assertEquals("ngu", c.get("moderation").get("spans").get(0).asText());
        assertEquals("Giải thích ngu thế", c.get("content").asText(), "chủ thấy nguyên văn");
        assertTrue(c.get("moderation").get("message").asText().contains("quản trị viên"));

        JsonNode bobView = list(bob, key).get("items").get(0);
        assertEquals("Giải thích n∗∗ thế", bobView.get("content").asText());
        assertTrue(bobView.get("moderation").get("masked").asBoolean());
        assertEquals(0, bobView.get("moderation").get("spans").size(), "người khác không thấy danh sách từ");

        // hàng chờ admin + badge
        JsonNode q = queue(admin, "OPEN");
        JsonNode item = find(q, cid);
        assertNotNull(item);
        assertEquals("comment", item.get("kind").asText());
        assertEquals(1, item.get("label").asInt());
        assertEquals(key, item.get("target").get("key").asText());
        assertEquals("Giải thích ngu thế", item.get("content").asText());
        JsonNode stats = read(call(get("/api/admin/stats").param("days", "7"), admin, null));
        assertTrue(stats.get("openModeration").asLong() >= 1);

        // bỏ qua → nguyên văn cho mọi người, rời hàng chờ
        JsonNode done = read(call(post("/api/admin/moderation/comment/{id}/ignore", cid), admin, null).andExpect(status().isOk()));
        assertEquals("REVIEWED", done.get("status").asText());
        assertEquals("Giải thích ngu thế", list(bob, key).get("items").get(0).get("content").asText());
        assertNull(find(queue(admin, "OPEN"), cid));
        assertNotNull(find(queue(admin, "REVIEWED"), cid));
    }

    @Test
    void hate_comment_on_normal_entry_is_blocked_only_owner_sees_and_can_resend() throws Exception {
        String key = "w:" + id;
        String alice = newUser();
        String bob = newUser();
        JsonNode c = comment(alice, key, "Thằng chó nào viết nghĩa này", 201);
        long cid = c.get("id").asLong();
        assertEquals("BLOCKED", c.get("moderation").get("status").asText());
        assertTrue(c.get("moderation").get("message").asText().contains("chưa được đăng"));
        assertEquals(0, list(bob, key).get("total").asInt(), "người khác không thấy");
        assertEquals(1, list(alice, key).get("total").asInt(), "chủ vẫn thấy");
        JsonNode entry = read(call(get("/api/dictionary/entries/{key}", key), bob, null).andExpect(status().isOk()));
        assertEquals(0, entry.get("commentCount").asInt());
        call(post("/api/dictionary/comments/{id}/helpful", cid), bob, null).andExpect(status().isNotFound());
        call(post("/api/dictionary/comments/{id}/reports", cid), bob, Map.of("reason", "SPAM")).andExpect(status().isNotFound());

        // chủ sửa lại cho sạch → chấm lại → công khai
        JsonNode edited = read(call(patch("/api/dictionary/comments/{id}", cid), alice, Map.of("content", "Nghĩa này chưa đúng lắm"))
                .andExpect(status().isOk()));
        assertTrue(edited.path("moderation").isMissingNode() || edited.get("moderation").isNull());
        assertEquals(1, list(bob, key).get("total").asInt());
    }

    @Test
    void admin_restore_publishes_blocked_comment_and_notifies_author() throws Exception {
        String key = "w:" + id;
        String alice = newUser();
        String bob = newUser();
        String admin = newStaff(Role.ADMIN);
        long cid = comment(alice, key, "chó má", 201).get("id").asLong();
        call(post("/api/admin/moderation/comment/{id}/restore", cid), admin, null).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REVIEWED"));
        assertEquals(1, list(bob, key).get("total").asInt());
        assertEquals("chó má", list(bob, key).get("items").get(0).get("content").asText(), "khôi phục = nguyên văn, không che");
        JsonNode feed = read(call(get("/api/notifications"), alice, null));
        assertEquals("MOD_COMMENT_RESTORED", feed.get("items").get(0).get("type").asText());
        // khôi phục lần 2 → 409 (không còn BLOCKED)
        call(post("/api/admin/moderation/comment/{id}/restore", cid), admin, null).andExpect(status().isConflict());
        assertTrue(read(call(get("/api/admin/audit-logs").param("targetType", "MODERATION"), admin, null)).get("items").size() >= 1);
    }

    @Test
    void sensitive_entry_turns_block_into_flag_and_admin_toggle_overrides() throws Exception {
        String key = "w:" + id;
        Mockito.when(dictAi.entry(id)).thenAnswer(inv -> entryJson(id, true));   // JMdict vulg
        String alice = newUser();
        String bob = newUser();
        String admin = newStaff(Role.ADMIN);
        JsonNode c = comment(alice, key, "Từ này nghĩa là chó, chửi thề", 201);
        assertEquals("FLAGGED", c.get("moderation").get("status").asText(), "mục từ tục: chỉ gắn cờ");
        assertEquals(1, list(bob, key).get("total").asInt());
        JsonNode info = read(call(get("/api/admin/dictionary/entries/{key}/sensitive", key), admin, null));
        assertTrue(info.get("value").asBoolean());
        assertEquals("jmdict", info.get("source").asText());
        assertTrue(read(call(get("/api/admin/dictionary/entries/{key}", key), admin, null)).get("sensitive").get("value").asBoolean());

        // admin tắt nhạy cảm → bình luận thù ghét tiếp theo bị chặn
        JsonNode set = read(call(put("/api/admin/dictionary/entries/{key}/sensitive", key), admin,
                Map.of("sensitive", false, "note", "từ bình thường")).andExpect(status().isOk()));
        assertFalse(set.get("value").asBoolean());
        assertEquals("admin", set.get("source").asText());
        JsonNode c2 = comment(alice, key, "đồ chó", 201);
        assertEquals("BLOCKED", c2.get("moderation").get("status").asText());
        assertEquals(1, list(bob, key).get("total").asInt());
        JsonNode audit = read(call(get("/api/admin/audit-logs").param("targetType", "DICTIONARY"), admin, null));
        boolean seen = false;
        for (JsonNode r : audit.get("items")) if ("DICT_SENSITIVE".equals(r.get("action").asText())) seen = true;
        assertTrue(seen);
    }

    @Test
    void ai_down_leaves_pending_then_rescan_blocks_late_and_notifies() throws Exception {
        String key = "w:" + id;
        String alice = newUser();
        String bob = newUser();
        String admin = newStaff(Role.ADMIN);
        aiDown();
        JsonNode c = comment(alice, key, "lũ chó", 201);
        long cid = c.get("id").asLong();
        assertEquals("PENDING", c.get("moderation").get("status").asText());
        assertEquals(1, list(bob, key).get("total").asInt(), "chưa kiểm: vẫn đăng tạm");
        JsonNode counts = read(call(get("/api/admin/moderation/counts"), admin, null));
        assertTrue(counts.get("pending").asLong() >= 1);

        // vẫn lỗi → quét không chấm được gì
        assertEquals(0, read(call(post("/api/admin/moderation/rescan"), admin, null)).get("scanned").asInt());
        aiUp();
        JsonNode r = read(call(post("/api/admin/moderation/rescan"), admin, null).andExpect(status().isOk()));
        assertTrue(r.get("scanned").asInt() >= 1);
        assertEquals("BLOCKED", jdbc.queryForObject("SELECT mod_status FROM dict_comments WHERE id = ?", String.class, cid));
        assertEquals(0, list(bob, key).get("total").asInt(), "chặn muộn: người khác hết thấy");
        JsonNode feed = read(call(get("/api/notifications"), alice, null));
        assertEquals("MOD_COMMENT_BLOCKED", feed.get("items").get(0).get("type").asText());
    }

    @Test
    void three_blocks_in_a_day_lock_comments_until_admin_unlocks() throws Exception {
        String key = "w:" + id;
        String aliceEmail = newEmail();
        String alice = newUser(aliceEmail);
        Long aliceId = userId(aliceEmail);
        String admin = newStaff(Role.ADMIN);
        String owner = newUser();
        String deckId = publicDeck(owner).get("id").asText();
        for (int i = 0; i < 3; i++) comment(alice, key, "chó " + i, 201);
        JsonNode err = read(call(post("/api/dictionary/entries/{key}/comments", key), alice, Map.of("content", "bình thường"))
                .andExpect(status().isTooManyRequests()));
        assertEquals("COMMENT_LOCKED", err.get("code").asText());
        call(put("/api/library/decks/" + deckId + "/rating"), alice, Map.of("stars", 5, "comment", "hay"))
                .andExpect(status().isTooManyRequests());
        call(put("/api/library/decks/" + deckId + "/rating"), alice, Map.of("stars", 5)).andExpect(status().isOk());   // chỉ sao vẫn được
        JsonNode feed = read(call(get("/api/notifications"), alice, null));
        assertEquals("MOD_COMMENT_LOCKED", feed.get("items").get(0).get("type").asText());

        JsonNode detail = read(call(get("/api/admin/users/{id}", aliceId), admin, null));
        assertFalse(detail.get("commentLockedUntil").isNull());
        assertEquals(3, detail.get("moderationBlocked30d").asLong());
        JsonNode q = queue(admin, "BLOCKED");
        assertEquals(3, find(q, q.get("items").get(0).get("id").asLong()).get("author").get("blocked24h").asLong());

        read(call(patch("/api/admin/users/{id}", aliceId), admin, Map.of("commentLocked", false)).andExpect(status().isOk()));
        assertTrue(read(call(get("/api/admin/users/{id}", aliceId), admin, null)).get("commentLockedUntil").isNull());
        comment(alice, key, "bình thường", 201);
    }

    @Test
    void profile_name_with_hate_words_is_rejected() throws Exception {
        String alice = newUser();
        JsonNode err = read(call(put("/api/auth/profile"), alice, Map.of("fullName", "Thằng chó")).andExpect(status().isBadRequest()));
        assertEquals("NAME_REJECTED", err.get("code").asText());
        call(put("/api/auth/profile"), alice, Map.of("fullName", "Đồ ngu")).andExpect(status().isBadRequest());
        call(put("/api/auth/profile"), alice, Map.of("fullName", "Nguyễn Văn A")).andExpect(status().isOk())
                .andExpect(jsonPath("$.fullName").value("Nguyễn Văn A"));
        aiDown();
        call(put("/api/auth/profile"), alice, Map.of("fullName", "Trần B")).andExpect(status().isOk());
    }

    @Test
    void rating_comment_is_screened_like_dictionary_comments() throws Exception {
        String owner = newUser();
        String alice = newUser();
        String bob = newUser();
        String admin = newStaff(Role.ADMIN);
        String deckId = publicDeck(owner).get("id").asText();
        JsonNode r = read(call(put("/api/library/decks/" + deckId + "/rating"), alice, Map.of("stars", 4, "comment", "Bộ này ngu quá"))
                .andExpect(status().isOk()));
        assertEquals("FLAGGED", r.get("moderation").get("status").asText());
        JsonNode bobList = read(call(get("/api/library/decks/" + deckId + "/ratings"), bob, null));
        assertEquals("Bộ này n∗∗ quá", bobList.get("items").get(0).get("comment").asText());
        assertEquals("Bộ này ngu quá", read(call(get("/api/library/decks/" + deckId + "/ratings"), alice, null))
                .get("items").get(0).get("comment").asText());

        // chặn: sao vẫn tính, người khác không thấy bình luận
        JsonNode b = read(call(put("/api/library/decks/" + deckId + "/rating"), bob, Map.of("stars", 1, "comment", "chủ bộ là chó"))
                .andExpect(status().isOk()));
        assertEquals("BLOCKED", b.get("moderation").get("status").asText());
        assertEquals(2, b.get("ratingsCount").asLong());
        JsonNode aliceList = read(call(get("/api/library/decks/" + deckId + "/ratings"), alice, null));
        assertEquals(1, aliceList.get("items").size(), "đánh giá bị chặn của người khác không hiện");
        JsonNode q = queue(admin, "BLOCKED");
        boolean rating = false;
        for (JsonNode it : q.get("items")) if ("rating".equals(it.get("kind").asText()) && deckId.equals(it.get("target").get("key").asText())) rating = true;
        assertTrue(rating);
        // gửi lại không kèm bình luận → sạch
        call(put("/api/library/decks/" + deckId + "/rating"), bob, Map.of("stars", 2)).andExpect(status().isOk());
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM deck_ratings WHERE deck_id = ? AND mod_status = 'BLOCKED'", Long.class, deckId));
    }

    @Test
    void admin_hide_and_delete_from_queue_are_audited() throws Exception {
        String key = "w:" + id;
        String alice = newUser();
        String bob = newUser();
        String admin = newStaff(Role.ADMIN);
        long c1 = comment(alice, key, "vãi cả nghĩa", 201).get("id").asLong();   // FLAGGED nhờ từ đánh dấu rất chắc
        long c2 = comment(alice, key, "ngu người", 201).get("id").asLong();
        JsonNode hidden = read(call(post("/api/admin/moderation/comment/{id}/hide", c1), admin, Map.of("note", "xúc phạm"))
                .andExpect(status().isOk()));
        assertTrue(hidden.get("hidden").asBoolean());
        assertEquals("REVIEWED", hidden.get("status").asText());
        assertEquals(1, list(bob, key).get("total").asInt());
        call(delete("/api/admin/moderation/comment/{id}", c2), admin, null).andExpect(status().isNoContent());
        assertEquals(0, list(bob, key).get("total").asInt());
        JsonNode audit = read(call(get("/api/admin/audit-logs").param("targetType", "MODERATION"), admin, null));
        int hide = 0, del = 0;
        for (JsonNode r : audit.get("items")) {
            if ("MOD_HIDE".equals(r.get("action").asText())) hide++;
            if ("MOD_DELETE".equals(r.get("action").asText())) del++;
        }
        assertTrue(hide >= 1 && del >= 1);
        call(post("/api/admin/moderation/comment/{id}/ignore", 999_999_999L), admin, null).andExpect(status().isNotFound());
        call(get("/api/admin/moderation").param("status", "XYZ"), admin, null).andExpect(status().isBadRequest());
        call(get("/api/admin/moderation"), alice, null).andExpect(status().isForbidden());
    }

    @Test
    void mnemonic_gets_ai_label_only() throws Exception {
        String alice = newUser();
        JsonNode m = read(call(post("/api/kanji/mnemonics"), alice, Map.of("kanji", "食", "mnemonicVi", "Con chó ăn cơm"))
                .andExpect(status().isCreated()));
        assertEquals(2, m.get("modLabel").asInt());
        assertEquals("PENDING", m.get("status").asText(), "AI không tự từ chối mẹo");
        String admin = newStaff(Role.ADMIN);
        JsonNode page = read(call(get("/api/admin/mnemonics").param("status", "PENDING").param("q", "Con chó"), admin, null));
        JsonNode it = page.get("items").get(0);
        assertEquals(2, it.get("modLabel").asInt());
        assertEquals("chó", it.get("modSpans").get(0).asText());
    }

    @Test
    void housekeeping_purges_blocked_comments_older_than_30_days() throws Exception {
        String key = "w:" + id;
        String alice = newUser();
        long cid = comment(alice, key, "chó", 201).get("id").asLong();
        jdbc.update("UPDATE dict_comments SET mod_at = now() - interval '31 days' WHERE id = ?", cid);
        housekeeping.nightly();
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM dict_comments WHERE id = ?", Long.class, cid));
    }
}
