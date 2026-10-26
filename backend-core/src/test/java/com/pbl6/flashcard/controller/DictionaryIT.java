package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.service.AiServiceClient;
import com.pbl6.flashcard.service.dictionary.DictionaryAiClient;
import com.pbl6.flashcard.service.dictionary.DictionaryOverridePublisher;
import com.pbl6.flashcard.service.dictionary.DictionarySeedLoader;
import com.pbl6.flashcard.service.dictionary.DictionaryService;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Từ điển (spec docs/Plan/specs/2026-10-26-tu-dien-design.md): tra cứu, gộp lớp (gốc + ghi đè + nghĩa Việt), dịch lúc tra với trần
 * theo giờ, bình luận, báo cáo, sổ tay, lịch sử, phân quyền, hàng chờ admin, áp đề xuất, hoàn tác, seed. ai-service giả lập bằng
 * {@link DictionaryAiClient}; DB dùng chung giữa các test nên mỗi test dùng id mục riêng.
 */
class DictionaryIT extends IntegrationTest {

    @MockitoBean
    DictionaryAiClient ai;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    DictionaryService dictionary;

    @Autowired
    DictionarySeedLoader seed;

    @Autowired
    DictionaryOverridePublisher publisher;

    private String id;

    @BeforeEach
    void setUp() {
        Mockito.reset(ai);
        dictionary.invalidate();
        id = String.valueOf(ThreadLocalRandom.current().nextLong(1_000_000_000L, 9_999_999_999L));
        Mockito.when(ai.entry(id)).thenAnswer(inv -> entryJson(id, "食べる", "たべる", "to eat"));
    }

    @AfterEach
    void resetLimit() {
        jdbc.update("UPDATE app_settings SET value = '30' WHERE key = 'dictionary_ai_hourly_limit'");
    }

    private JsonNode entryJson(String wid, String kanji, String kana, String gloss) throws Exception {
        return json.readTree("""
                {"id":"%s","key":"w:%s","kind":"word","headKanji":"%s","headKana":"%s","reading":"%s","readingOriginal":"%s",
                 "hanViet":"THỰC","hanVietChars":[{"char":"食","reading":"THỰC"}],"jlpt":"N5","common":true,
                 "senses":[{"pos":["v1"],"gloss":["%s"],"posText":["Ichidan verb"]}],"glossShort":"%s",
                 "examples":[{"id":"ex1-%s","jpn":"ご飯を食べる。","eng":"I eat rice.","hidden":false},
                             {"id":"ex2-%s","jpn":"パンを食べる。","eng":"I eat bread.","hidden":false}],
                 "kanjiChars":[{"char":"食","hanViet":"THỰC","meaningEn":"eat"}],"relatedSameReading":[]}
                """.formatted(wid, wid, kanji, kana, kana, kana, gloss, gloss, wid, wid));
    }

    private JsonNode translated(String key, String meaning, String exId, String exVi) throws Exception {
        String ex = exId == null ? "" : "{\"id\":\"%s\",\"vi\":\"%s\"}".formatted(exId, exVi);
        return json.readTree("{\"items\":[{\"ref\":\"%s\",\"meaningVi\":%s,\"examples\":[%s]}],\"model\":\"gemini-test\"}"
                .formatted(key, meaning == null ? "null" : "\"" + meaning + "\"", ex));
    }

    private JsonNode entry(String token, String key) throws Exception {
        return read(call(get("/api/dictionary/entries/{key}", key), token, null).andExpect(status().isOk()));
    }

    // ------------------------------------------------------------------ tra cứu + dịch lúc tra

    @Test
    void search_overlays_vietnamese_meaning_and_admin_reading() throws Exception {
        String token = newUser();
        jdbc.update("INSERT INTO dict_meanings (entry_key, term, reading, meaning_vi, status, source) VALUES (?,?,?,?, 'MACHINE','SEED')",
                "w:" + id, "食べる", "たべる", "ăn; dùng bữa");
        jdbc.update("INSERT INTO dict_overrides (entry_key, field, sub_key, value) VALUES (?, 'reading', '', 'たべるる')", "w:" + id);
        Mockito.when(ai.search(eq("たべる"), eq("ja"), anyInt(), anyInt())).thenReturn(json.readTree("""
                {"items":[{"id":"%s","key":"w:%s","headKanji":"食べる","headKana":"たべる","reading":"たべる","glossShort":"to eat",
                 "common":true,"jlpt":"N5","nExamples":2}],"total":1}""".formatted(id, id)));
        JsonNode r = read(call(get("/api/dictionary/search").param("q", "たべる"), token, null).andExpect(status().isOk()));
        assertEquals("ja", r.get("modeUsed").asText());
        assertEquals("ăn; dùng bữa", r.get("items").get(0).get("meaningVi").asText());
        assertEquals("たべるる", r.get("items").get(0).get("reading").asText());
        call(get("/api/dictionary/search").param("q", " "), token, null).andExpect(status().isBadRequest());
        call(get("/api/dictionary/search").param("q", "a").param("mode", "fr"), token, null).andExpect(status().isBadRequest());
    }

    @Test
    void search_vietnamese_finds_saved_meanings_first() throws Exception {
        String token = newUser();
        String word = "xyzviet" + id;
        jdbc.update("INSERT INTO dict_meanings (entry_key, term, reading, meaning_vi, status, source) VALUES (?,?,?,?, 'VERIFIED','ADMIN')",
                "w:" + id, "食べる", "たべる", "ăn " + word);
        Mockito.when(ai.entries(List.of(id))).thenReturn(json.readTree("{\"items\":[" + entryJson(id, "食べる", "たべる", "to eat") + "]}"));
        Mockito.when(ai.search(eq(word), eq("en"), anyInt(), anyInt())).thenReturn(json.readTree("{\"items\":[],\"total\":0}"));
        JsonNode r = read(call(get("/api/dictionary/search").param("q", word), token, null).andExpect(status().isOk()));
        assertEquals("vi+en", r.get("modeUsed").asText());
        assertEquals("w:" + id, r.get("items").get(0).get("key").asText());
        assertEquals("ăn " + word, r.get("items").get(0).get("meaningVi").asText());
    }

    @Test
    void entry_translates_once_then_reuses_and_records_history() throws Exception {
        String token = newUser();
        String key = "w:" + id;
        Mockito.when(ai.translate(anyList())).thenReturn(translated(key, "ăn; dùng bữa", "ex1-" + id, "Tôi ăn cơm."));
        JsonNode e = entry(token, key);
        assertEquals("ăn; dùng bữa", e.get("meaningVi").asText());
        assertEquals("OK", e.get("viState").asText());
        assertEquals("Tôi ăn cơm.", e.get("examples").get(0).get("vi").asText());
        assertEquals(29, e.get("aiLeft").asInt());
        // bản dịch được lưu: lần mở sau không gọi lại AI, không tốn lượt
        JsonNode again = entry(token, key);
        assertEquals("ăn; dùng bữa", again.get("meaningVi").asText());
        Mockito.verify(ai, Mockito.times(1)).translate(anyList());
        assertEquals("MACHINE", jdbc.queryForObject("SELECT status FROM dict_meanings WHERE entry_key = ?", String.class, key));
        assertEquals("GEMINI", jdbc.queryForObject("SELECT source FROM dict_meanings WHERE entry_key = ?", String.class, key));
        // lịch sử: một dòng (trùng trong 1 giờ không ghi thêm)
        JsonNode h = read(call(get("/api/dictionary/history"), token, null).andExpect(status().isOk()));
        assertEquals(1, h.get("items").size());
        assertEquals(key, h.get("items").get(0).get("key").asText());
    }

    @Test
    void entry_falls_back_to_english_when_no_key_limit_or_disabled() throws Exception {
        String token = newUser();
        String key = "w:" + id;
        Mockito.when(ai.translate(anyList())).thenThrow(new AiServiceClient.AiServiceException("no_api_key", 503, null));
        JsonNode e = entry(token, key);
        assertTrue(e.get("meaningVi").isNull());
        assertEquals("EN_ONLY", e.get("viState").asText());
        assertEquals("to eat", e.get("glossShort").asText());

        // trần = 0: không gọi AI
        Mockito.reset(ai);
        Mockito.when(ai.entry(id)).thenAnswer(inv -> entryJson(id, "食べる", "たべる", "to eat"));
        jdbc.update("UPDATE app_settings SET value = '0' WHERE key = 'dictionary_ai_hourly_limit'");
        assertEquals("EN_ONLY", entry(token, key).get("viState").asText());
        Mockito.verify(ai, Mockito.never()).translate(anyList());

        // trần = 1: lượt đầu bị lỗi AI vẫn tính, lượt sau hết lượt
        jdbc.update("UPDATE app_settings SET value = '1' WHERE key = 'dictionary_ai_hourly_limit'");
        String other = newUser();
        Mockito.when(ai.translate(anyList())).thenThrow(new AiServiceClient.AiServiceException("aiOverloaded", 503, null, true));
        assertEquals("AI_DOWN", entry(other, key).get("viState").asText());
        assertEquals("LIMIT", entry(other, key).get("viState").asText());
    }

    @Test
    void hidden_example_is_filtered_for_learner_but_not_admin() throws Exception {
        String token = newUser();
        String admin = newStaff(Role.ADMIN);
        String key = "w:" + id;
        jdbc.update("INSERT INTO dict_meanings (entry_key, term, reading, meaning_vi, status, source) VALUES (?,?,?,?, 'MACHINE','SEED')",
                key, "食べる", "たべる", "ăn");
        call(put("/api/admin/dictionary/entries/{key}/overrides", key), admin,
                Map.of("field", "example_hidden", "subKey", "ex2-" + id, "value", "true")).andExpect(status().isOk());
        JsonNode e = entry(token, key);
        assertEquals(1, e.get("examples").size());
        JsonNode adminView = read(call(get("/api/admin/dictionary/entries/{key}", key), admin, null).andExpect(status().isOk()));
        assertEquals(2, adminView.get("examples").size());
        assertTrue(adminView.get("examples").get(1).get("hidden").asBoolean());
    }

    // ------------------------------------------------------------------ bình luận

    @Test
    void comments_crud_helpful_and_hiding() throws Exception {
        String key = "w:" + id;
        String alice = newUser();
        String bob = newUser();
        String admin = newStaff(Role.ADMIN);
        JsonNode c = read(call(post("/api/dictionary/entries/{key}/comments", key), alice, Map.of("content", "Mẹo: 食 = ăn"))
                .andExpect(status().isCreated()));
        long cid = c.get("id").asLong();
        assertTrue(c.get("mine").asBoolean());
        assertFalse(c.get("displayName").asText().contains("@"));
        call(post("/api/dictionary/entries/{key}/comments", key), alice, Map.of("content", "   ")).andExpect(status().isBadRequest());
        // tự đánh dấu hữu ích → 409; người khác bật / tắt
        call(post("/api/dictionary/comments/{id}/helpful", cid), alice, null).andExpect(status().isConflict());
        call(post("/api/dictionary/comments/{id}/helpful", cid), bob, null).andExpect(status().isOk())
                .andExpect(jsonPath("$.helpfulCount").value(1)).andExpect(jsonPath("$.votedByMe").value(true));
        call(post("/api/dictionary/comments/{id}/helpful", cid), bob, null).andExpect(jsonPath("$.helpfulCount").value(0));
        // sửa / xoá chỉ chủ
        call(patch("/api/dictionary/comments/{id}", cid), bob, Map.of("content", "hack")).andExpect(status().isForbidden());
        call(patch("/api/dictionary/comments/{id}", cid), alice, Map.of("content", "Đã sửa")).andExpect(status().isOk())
                .andExpect(jsonPath("$.content").value("Đã sửa"));
        // admin ẩn: người khác không thấy, chủ thấy với hidden=true và không sửa được
        call(post("/api/admin/dictionary/comments/{id}/hide", cid), admin, Map.of("note", "spam")).andExpect(status().isNoContent());
        JsonNode bobList = read(call(get("/api/dictionary/entries/{key}/comments", key), bob, null));
        assertEquals(0, bobList.get("total").asInt());
        JsonNode aliceList = read(call(get("/api/dictionary/entries/{key}/comments", key), alice, null));
        assertTrue(aliceList.get("items").get(0).get("hidden").asBoolean());
        call(patch("/api/dictionary/comments/{id}", cid), alice, Map.of("content", "x")).andExpect(status().isConflict());
        JsonNode feed = read(call(get("/api/notifications"), alice, null));
        assertEquals("DICT_COMMENT_HIDDEN", feed.get("items").get(0).get("type").asText());
        call(delete("/api/dictionary/comments/{id}", cid), alice, null).andExpect(status().isNoContent());
    }

    // ------------------------------------------------------------------ báo cáo + admin

    @Test
    void entry_report_validation_duplicates_and_apply_meaning() throws Exception {
        String key = "w:" + id;
        String user = newUser();
        String admin = newStaff(Role.ADMIN);
        jdbc.update("INSERT INTO dict_meanings (entry_key, term, reading, meaning_vi, status, source) VALUES (?,?,?,?, 'MACHINE','SEED')",
                key, "食べる", "たべる", "uống");
        call(post("/api/dictionary/entries/{key}/reports", key), user, Map.of("field", "other")).andExpect(status().isBadRequest());
        call(post("/api/dictionary/entries/{key}/reports", key), user, Map.of("field", "han_viet", "proposedValue", "THỰC"))
                .andExpect(status().isBadRequest());   // thiếu chữ
        JsonNode r = read(call(post("/api/dictionary/entries/{key}/reports", key), user,
                Map.of("field", "meaning_vi", "proposedValue", "ăn; dùng bữa", "note", "sai nghĩa")).andExpect(status().isCreated()));
        assertEquals("uống", r.get("currentValue").asText());
        call(post("/api/dictionary/entries/{key}/reports", key), user, Map.of("field", "meaning_vi", "proposedValue", "ăn"))
                .andExpect(status().isConflict());

        // hàng chờ: mục bị báo cáo đứng trước nghĩa máy chưa kiểm
        JsonNode q = read(call(get("/api/admin/dictionary/queue").param("q", key), admin, null).andExpect(status().isOk()));
        assertEquals("reported", q.get("items").get(0).get("group").asText());
        JsonNode pending = read(call(get("/api/admin/dictionary/queue").param("size", "1"), admin, null));
        assertEquals("reported", pending.get("items").get(0).get("group").asText());

        long rid = r.get("id").asLong();
        JsonNode after = read(call(post("/api/admin/dictionary/reports/{id}/apply", rid), admin, null).andExpect(status().isOk()));
        assertEquals("ăn; dùng bữa", after.get("meaningVi").asText());
        assertEquals("VERIFIED", jdbc.queryForObject("SELECT status FROM dict_meanings WHERE entry_key = ?", String.class, key));
        assertEquals("RESOLVED", jdbc.queryForObject("SELECT status FROM dict_reports WHERE id = ?", String.class, rid));
        call(post("/api/admin/dictionary/reports/{id}/apply", rid), admin, null).andExpect(status().isConflict());
        JsonNode feed = read(call(get("/api/notifications"), user, null));
        assertEquals("DICT_REPORT_RESOLVED", feed.get("items").get(0).get("type").asText());
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM admin_audit_logs WHERE action = 'DICT_REPORT_APPLY' AND target_id = ?",
                Integer.class, key));
        // người học thấy nghĩa mới, không gọi AI
        assertEquals("ăn; dùng bữa", entry(user, key).get("meaningVi").asText());
        Mockito.verify(ai, Mockito.never()).translate(anyList());

        // hoàn tác về "uống", lịch sử thêm dòng mới
        long hid = jdbc.queryForObject("SELECT MAX(id) FROM dict_edit_history WHERE entry_key = ? AND field = 'meaning_vi'", Long.class, key);
        JsonNode reverted = read(call(post("/api/admin/dictionary/history/{id}/revert", hid), admin, null).andExpect(status().isOk()));
        assertEquals("uống", reverted.get("meaningVi").asText());
        assertEquals(2, jdbc.queryForObject("SELECT COUNT(*) FROM dict_edit_history WHERE entry_key = ?", Integer.class, key));
    }

    @Test
    void han_viet_report_on_word_is_applied_to_kanji_key_and_pushed() throws Exception {
        String key = "w:" + id;
        String user = newUser();
        String admin = newStaff(Role.ADMIN);
        jdbc.update("INSERT INTO dict_meanings (entry_key, term, reading, meaning_vi, status, source) VALUES (?,?,?,?, 'MACHINE','SEED')",
                key, "食べる", "たべる", "ăn");
        JsonNode r = read(call(post("/api/dictionary/entries/{key}/reports", key), user,
                Map.of("field", "han_viet", "subKey", "食", "proposedValue", "thử")).andExpect(status().isCreated()));
        assertEquals("THỰC", r.get("currentValue").asText());
        call(post("/api/admin/dictionary/reports/{id}/apply", r.get("id").asLong()), admin, null).andExpect(status().isOk());
        assertEquals("thử", jdbc.queryForObject("SELECT value FROM dict_overrides WHERE entry_key = 'k:食' AND field = 'han_viet'",
                String.class));
        JsonNode e = entry(user, key);
        assertEquals("THỬ", e.get("hanViet").asText());
        assertEquals("THỬ", e.get("kanjiChars").get(0).get("hanViet").asText());
        // đẩy sang ai-service: toàn bộ ghi đè + phiên bản
        Mockito.when(ai.pushOverrides(anyLong(), anyList())).thenReturn(json.readTree("{\"version\":1,\"count\":1}"));
        publisher.push(true);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Map<String, Object>>> items = ArgumentCaptor.forClass(List.class);
        Mockito.verify(ai).pushOverrides(anyLong(), items.capture());
        assertTrue(items.getValue().stream().anyMatch(m -> "k:食".equals(m.get("key")) && "han_viet".equals(m.get("field"))));
        jdbc.update("DELETE FROM dict_overrides WHERE entry_key = 'k:食'");
        dictionary.invalidate();
    }

    @Test
    void comment_report_resolved_by_hiding() throws Exception {
        String key = "w:" + id;
        String alice = newUser();
        String bob = newUser();
        String admin = newStaff(Role.ADMIN);
        long cid = read(call(post("/api/dictionary/entries/{key}/comments", key), alice, Map.of("content", "quảng cáo")))
                .get("id").asLong();
        call(post("/api/dictionary/comments/{id}/reports", cid), alice, Map.of("reason", "SPAM")).andExpect(status().isBadRequest());
        long rid = read(call(post("/api/dictionary/comments/{id}/reports", cid), bob, Map.of("reason", "SPAM"))
                .andExpect(status().isCreated())).get("id").asLong();
        call(post("/api/dictionary/comments/{id}/reports", cid), bob, Map.of("reason", "SPAM")).andExpect(status().isConflict());
        JsonNode list = read(call(get("/api/admin/dictionary/reports").param("kind", "COMMENT").param("q", key), admin, null));
        assertEquals(rid, list.get("items").get(0).get("id").asLong());
        call(post("/api/admin/dictionary/reports/{id}/resolve", rid), admin, Map.of("note", "spam")).andExpect(status().isOk())
                .andExpect(jsonPath("$.action").value("COMMENT_HIDDEN"));
        assertNotNull(jdbc.queryForObject("SELECT hidden_at FROM dict_comments WHERE id = ?", Object.class, cid));
    }

    // ------------------------------------------------------------------ sổ tay, phân quyền, seed

    @Test
    void favorites_roundtrip() throws Exception {
        String token = newUser();
        String key = "w:" + id;
        Mockito.when(ai.entries(List.of(id))).thenReturn(json.readTree("{\"items\":[" + entryJson(id, "食べる", "たべる", "to eat") + "]}"));
        call(put("/api/dictionary/favorites/{key}", key), token, Map.of("note", "hay dùng")).andExpect(status().isOk())
                .andExpect(jsonPath("$.saved").value(true));
        JsonNode favs = read(call(get("/api/dictionary/favorites"), token, null).andExpect(status().isOk()));
        assertEquals(1, favs.get("total").asInt());
        assertEquals("hay dùng", favs.get("items").get(0).get("note").asText());
        assertEquals("食べる", favs.get("items").get(0).get("headKanji").asText());
        call(delete("/api/dictionary/favorites/{key}", key), token, null).andExpect(status().isNoContent());
        call(put("/api/dictionary/favorites/{key}", "bad key"), token, null).andExpect(status().isBadRequest());
    }

    @Test
    void staff_cannot_use_learner_api_and_user_cannot_use_admin_api() throws Exception {
        String admin = newStaff(Role.ADMIN);
        String user = newUser();
        call(get("/api/dictionary/search").param("q", "x"), admin, null).andExpect(status().isForbidden());
        call(get("/api/admin/dictionary/queue"), user, null).andExpect(status().isForbidden());
        call(post("/api/admin/dictionary/sync-ai"), user, null).andExpect(status().isForbidden());
        call(get("/api/admin/dictionary/stats"), admin, null).andExpect(status().isOk());
        String superAdmin = newStaff(Role.SUPER_ADMIN);
        call(get("/api/admin/dictionary/queue"), superAdmin, null).andExpect(status().isOk());
    }

    @Test
    void seed_loader_inserts_once_and_never_overwrites() throws Exception {
        String k1 = "w:" + id;
        String k2 = "w:jlpt:試験語" + id.substring(0, 4) + "|しけんご";
        String csv = "entry_key,expression,reading,level,meaning_vi,meaning_en,source,generated_at\n"
                + k1 + ",食べる,たべる,N5,\"ăn, dùng bữa\",to eat,claude,2026-10-26\n"
                + k2 + ",試験語,しけんご,N3,từ thử,test,claude,2026-10-26\n"
                + "bad-key,x,x,,y,y,c,d\n";
        ByteArrayResource res = new ByteArrayResource(csv.getBytes(StandardCharsets.UTF_8)) {
            @Override
            public String getFilename() { return "seed.csv"; }
        };
        jdbc.update("DELETE FROM dict_meanings WHERE source = 'SEED'");
        assertEquals(2, seed.load(List.of(res)));
        assertEquals("ăn, dùng bữa", jdbc.queryForObject("SELECT meaning_vi FROM dict_meanings WHERE entry_key = ?", String.class, k1));
        assertEquals("N3", jdbc.queryForObject("SELECT level FROM dict_meanings WHERE entry_key = ?", String.class, k2));
        // đủ rồi → bỏ qua; admin sửa một dòng → nạp lại không đè
        assertEquals(0, seed.load(List.of(res)));
        jdbc.update("UPDATE dict_meanings SET meaning_vi = 'admin', source = 'ADMIN', status = 'VERIFIED' WHERE entry_key = ?", k1);
        assertEquals(0, seed.load(List.of(res)));
        assertEquals("admin", jdbc.queryForObject("SELECT meaning_vi FROM dict_meanings WHERE entry_key = ?", String.class, k1));
        // mục w:jlpt: mở được từ dữ liệu seed, có nghĩa Việt
        Mockito.when(ai.key(anyString(), any())).thenReturn(json.readTree("{\"key\":null}"));
        JsonNode e = entry(newUser(), k2);
        assertEquals("từ thử", e.get("meaningVi").asText());
        assertEquals("OK", e.get("viState").asText());
    }
}
