package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
        jdbc.update("UPDATE app_settings SET value = '20' WHERE key = 'dictionary_translate_hourly_limit'");
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
    void example_seed_translation_is_used_until_admin_or_gemini_text_exists() throws Exception {
        String token = newUser();
        jdbc.update("INSERT INTO dict_meanings (entry_key, term, reading, meaning_vi, status, source) VALUES (?,?,?,?, 'MACHINE','SEED')",
                "w:" + id, "食べる", "たべる", "ăn");
        ObjectNode base = (ObjectNode) entryJson(id, "食べる", "たべる", "to eat");
        ((ObjectNode) base.path("examples").get(0)).put("viSeed", "Tôi ăn cơm.");
        ((ObjectNode) base.path("examples").get(1)).put("viSeed", "Tôi ăn bánh mì.");
        Mockito.when(ai.entry(id)).thenReturn(base);

        JsonNode e = entry(token, "w:" + id);
        assertEquals("Tôi ăn cơm.", e.get("examples").get(0).get("vi").asText());
        assertTrue(e.get("examples").get(0).path("viSeed").isMissingNode(), "viSeed không lộ ra client");
        Mockito.verify(ai, Mockito.never()).translate(Mockito.any());   // câu đã có bản dịch sẵn: không gọi AI

        // admin sửa bản dịch câu 1, sửa câu Nhật của câu 2 (bản dịch sẵn không còn khớp → bỏ)
        jdbc.update("INSERT INTO dict_example_vi (entry_key, example_id, text_vi, status, source) VALUES (?,?,?, 'VERIFIED','ADMIN')",
                "w:" + id, "ex1-" + id, "Tôi đang ăn cơm.");
        jdbc.update("INSERT INTO dict_overrides (entry_key, field, sub_key, value) VALUES (?, 'example_jpn', ?, 'パンを二つ食べる。')",
                "w:" + id, "ex2-" + id);
        dictionary.invalidate();
        JsonNode e2 = entry(token, "w:" + id);
        assertEquals("Tôi đang ăn cơm.", e2.get("examples").get(0).get("vi").asText());
        assertTrue(e2.get("examples").get(1).get("vi").isNull());
    }

    @Test
    void handwriting_proxies_strokes_and_maps_errors() throws Exception {
        String token = newUser();
        Mockito.when(ai.handwriting(Mockito.anyList())).thenReturn(json.readTree("{\"candidates\":[{\"char\":\"十\",\"score\":0.01}]}"));
        var body = java.util.Map.of("strokes", java.util.List.of(
                java.util.List.of(java.util.Map.of("x", 0.0, "y", 0.5), java.util.Map.of("x", 1.0, "y", 0.5)),
                java.util.List.of(java.util.Map.of("x", 0.5, "y", 0.0), java.util.Map.of("x", 0.5, "y", 1.0))));
        JsonNode r = read(call(post("/api/dictionary/handwriting"), token, body).andExpect(status().isOk()));
        assertEquals("十", r.get("candidates").get(0).get("char").asText());
        Mockito.verify(ai).handwriting(Mockito.argThat(s -> s.size() == 2 && s.get(1).get(1).get("y") == 1.0));

        call(post("/api/dictionary/handwriting"), token, java.util.Map.of("strokes", java.util.List.of())).andExpect(status().isBadRequest());
        Mockito.when(ai.handwriting(Mockito.anyList()))
                .thenThrow(new com.pbl6.flashcard.service.AiServiceClient.AiServiceException("ai-service 503: handwritingUnavailable", 503, null));
        JsonNode err = read(call(post("/api/dictionary/handwriting"), token, body).andExpect(status().isServiceUnavailable()));
        assertTrue(err.get("message").asText().contains("KanjiVG"), err.toString());
    }

    @Test
    void sentences_tab_overlays_saved_translations_and_hides_hidden_examples() throws Exception {
        String token = newUser();
        String a = "sa-" + id, b = "sb-" + id, c = "sc-" + id;
        Mockito.when(ai.sentences(eq("食べ"), anyInt(), anyInt())).thenReturn(json.readTree("""
                {"items":[
                  {"id":"%s","jpn":"ご飯を食べる。","eng":"I eat rice.","viSeed":"Tôi ăn cơm.","words":[{"key":"w:%s","form":"食べる","head":"食べる"}]},
                  {"id":"%s","jpn":"パンを食べた。","eng":"I ate bread.","viSeed":"Tôi đã ăn bánh mì.","words":[]},
                  {"id":"%s","jpn":"よく食べる。","eng":"He eats a lot.","viSeed":null,"words":[]}],
                 "total":3}""".formatted(a, id, b, c)));
        jdbc.update("INSERT INTO dict_example_vi (entry_key, example_id, text_vi, status, source) VALUES (?,?,?, 'VERIFIED','ADMIN')",
                "w:999" + id, b, "Tôi ăn bánh mì rồi.");
        jdbc.update("INSERT INTO dict_overrides (entry_key, field, sub_key, value) VALUES (?, 'example_hidden', ?, 'true')", "w:1" + id, c);

        JsonNode r = read(call(get("/api/dictionary/sentences").param("q", "食べ"), token, null).andExpect(status().isOk()));
        assertEquals(2, r.get("items").size());
        assertEquals(2, r.get("total").asLong(), "câu bị ẩn không tính");
        assertEquals("Tôi ăn cơm.", r.get("items").get(0).get("vi").asText());
        assertEquals("w:" + id, r.get("items").get(0).get("words").get(0).get("key").asText());
        assertEquals("Tôi ăn bánh mì rồi.", r.get("items").get(1).get("vi").asText(), "bản admin thắng bản dịch sẵn");
        assertTrue(r.get("items").get(1).path("viSeed").isMissingNode());
        call(get("/api/dictionary/sentences").param("q", "  "), token, null).andExpect(status().isBadRequest());
    }


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
        assertTrue(r.path("deinflected").isMissingNode(), "tìm đúng dạng viết: không có ghi chú dạng gốc");

        // dạng đã chia: ai-service trả kèm deinflected → chuyển tiếp nguyên vẹn
        Mockito.when(ai.search(eq("食べました"), eq("ja"), anyInt(), anyInt())).thenReturn(json.readTree("""
                {"items":[{"id":"%s","key":"w:%s","headKanji":"食べる","headKana":"たべる","reading":"たべる","glossShort":"to eat",
                 "common":true,"jlpt":"N5","nExamples":2}],"total":1,"deinflected":{"query":"食べました","lemmas":["食べる"]}}""".formatted(id, id)));
        JsonNode conj = read(call(get("/api/dictionary/search").param("q", "食べました"), token, null).andExpect(status().isOk()));
        assertEquals("食べる", conj.get("deinflected").get("lemmas").get(0).asText());
        assertEquals("食べました", conj.get("deinflected").get("query").asText());
        assertEquals("ăn; dùng bữa", conj.get("items").get(0).get("meaningVi").asText());
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
        assertEquals(30, e.get("aiLeft").asInt(), "không có khoá AI: không tính lượt");

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

    // ------------------------------------------------------------------ dịch câu (tab Dịch, spec 2026-10-28, D33)

    /** Kết quả ai-service cho ご飯を食べました。: cụm thứ ba có mục từ điển key (để kiểm dictVi áp lúc đọc). */
    private JsonNode aiTranslation(String key) throws Exception {
        return json.readTree("""
                {"direction":"ja-vi","source":"ご飯を食べました。","translation":"Tôi đã ăn cơm.","literal":"cơm / (tân ngữ) / đã ăn",
                 "alternatives":[],"notes":null,"reading":null,"romaji":null,"readingAgrees":null,
                 "tokens":[{"i":0,"surface":"ご飯","lemma":"ご飯","reading":"ごはん","romaji":"gohan","rubies":null,"key":null,"jlpt":"N3",
                            "pos":"名詞","posVi":"danh từ","particle":false,"symbol":false,"glossEn":"cooked rice","meaning":"cơm"},
                           {"i":1,"surface":"を","lemma":"を","reading":"を","romaji":"o","rubies":null,"key":null,"jlpt":null,
                            "pos":"助詞","posVi":"trợ từ","particle":true,"symbol":false,"glossEn":null,"meaning":"trợ từ chỉ tân ngữ"},
                           {"i":2,"surface":"食べました","lemma":"食べる","reading":"たべました","romaji":"tabemashita","rubies":null,
                            "key":"%s","jlpt":"N5","pos":"動詞","posVi":"động từ","particle":false,"symbol":false,"glossEn":"to eat","meaning":"đã ăn"},
                           {"i":3,"surface":"。","lemma":null,"reading":null,"romaji":null,"rubies":null,"key":null,"jlpt":null,
                            "pos":"補助記号","posVi":"dấu","particle":false,"symbol":true,"glossEn":null,"meaning":null}],
                 "model":"gemini-test","reason":null}
                """.formatted(key));
    }

    /** ai-service không dịch được (reason) nhưng vẫn trả phân tích câu Nhật. */
    private JsonNode aiFailure(String text, String direction, String reason) throws Exception {
        String tokens = "ja-vi".equals(direction)
                ? "[{\"i\":0,\"surface\":\"%s\",\"lemma\":\"%s\",\"reading\":null,\"key\":null,\"symbol\":false,\"meaning\":null}]".formatted(text, text)
                : "[]";
        return json.readTree("""
                {"direction":"%s","source":"%s","translation":null,"literal":null,"alternatives":[],"notes":null,"reading":null,
                 "romaji":null,"readingAgrees":null,"tokens":%s,"model":null,"reason":"%s"}
                """.formatted(direction, text, tokens, reason));
    }

    private JsonNode translate(String token, String text) throws Exception {
        return read(call(post("/api/dictionary/translate"), token, Map.of("text", text)).andExpect(status().isOk()));
    }

    @Test
    void translate_text_calls_ai_once_then_serves_cache_and_overlays_dictionary_meaning() throws Exception {
        String token = newUser();
        String key = "w:" + id;
        jdbc.update("INSERT INTO dict_meanings (entry_key, term, reading, meaning_vi, status, source) VALUES (?,?,?,?, 'MACHINE','SEED')",
                key, "食べる", "たべる", "ăn; dùng bữa");
        Mockito.when(ai.translateText(eq("ご飯を食べました。"), eq("ja-vi"), eq(true))).thenReturn(aiTranslation(key));

        JsonNode r = translate(token, "  ご飯を食べました。 ");   // khoảng trắng hai đầu bị cắt, câu trùng bộ nhớ dịch
        assertEquals("OK", r.get("state").asText());
        assertEquals("ja-vi", r.get("direction").asText());
        assertEquals("Tôi đã ăn cơm.", r.get("translation").asText());
        assertEquals("cơm / (tân ngữ) / đã ăn", r.get("literal").asText());
        assertFalse(r.get("cached").asBoolean());
        assertEquals(19, r.get("aiLeft").asInt());
        assertEquals(20, r.get("aiLimit").asInt());
        assertEquals("gemini-test", r.get("model").asText());
        assertTrue(r.path("reason").isMissingNode(), "reason là chuyện giữa backend và ai-service");
        JsonNode eat = r.get("tokens").get(2);
        assertEquals("đã ăn", eat.get("meaning").asText(), "nghĩa theo ngữ cảnh của AI");
        assertEquals("ăn; dùng bữa", eat.get("dictVi").asText(), "nghĩa Việt của từ điển áp theo khoá");
        assertTrue(r.get("tokens").get(0).get("dictVi").isNull(), "cụm không có mục từ điển");

        // lần hai (cả người khác): bộ nhớ dịch, không gọi AI, không tốn lượt; nghĩa từ điển mới áp lúc đọc
        jdbc.update("UPDATE dict_meanings SET meaning_vi = 'ăn' WHERE entry_key = ?", key);
        JsonNode again = translate(newUser(), "ご飯を食べました。");
        assertTrue(again.get("cached").asBoolean());
        assertEquals("Tôi đã ăn cơm.", again.get("translation").asText());
        assertEquals("ăn", again.get("tokens").get(2).get("dictVi").asText());
        assertEquals(20, again.get("aiLeft").asInt(), "lượt của người thứ hai còn nguyên");
        Mockito.verify(ai, Mockito.times(1)).translateText(anyString(), anyString(), anyBoolean());
        assertEquals(1, jdbc.queryForObject("SELECT hit_count FROM dict_text_translations WHERE direction = 'ja-vi'", Integer.class));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM dict_text_translations WHERE source_text = ?", Integer.class, "ご飯を食べました。"), "DB dùng chung giữa các test: chỉ đếm câu của test này");
    }

    @Test
    void translate_text_states_off_limit_and_ai_down() throws Exception {
        String token = newUser();
        // không có khoá AI → OFF, hoàn lượt, vẫn có phân tích câu
        Mockito.when(ai.translateText(eq("ご飯"), eq("ja-vi"), eq(true))).thenReturn(aiFailure("ご飯", "ja-vi", "no_api_key"));
        JsonNode r = translate(token, "ご飯");
        assertEquals("OFF", r.get("state").asText());
        assertTrue(r.get("translation").isNull());
        assertEquals(1, r.get("tokens").size());
        assertEquals(20, r.get("aiLeft").asInt(), "không có khoá AI: không tính lượt");
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM dict_text_translations WHERE source_text = ?", Integer.class, "ご飯"), "không cache kết quả thiếu bản dịch");

        // admin tắt (trần 0) → OFF, chỉ hỏi ai-service phần phân tích (withAi=false)
        jdbc.update("UPDATE app_settings SET value = '0' WHERE key = 'dictionary_translate_hourly_limit'");
        Mockito.when(ai.translateText(eq("ご飯"), eq("ja-vi"), eq(false))).thenReturn(aiFailure("ご飯", "ja-vi", "skipped"));
        r = translate(token, "ご飯");
        assertEquals("OFF", r.get("state").asText());
        assertEquals(0, r.get("aiLimit").asInt());
        Mockito.verify(ai, Mockito.times(1)).translateText(eq("ご飯"), eq("ja-vi"), eq(false));

        // trần 1: AI quá tải → AI_DOWN (lượt vẫn tính), lượt sau LIMIT (chỉ phân tích)
        jdbc.update("UPDATE app_settings SET value = '1' WHERE key = 'dictionary_translate_hourly_limit'");
        String other = newUser();
        Mockito.when(ai.translateText(eq("学校"), eq("ja-vi"), eq(true))).thenReturn(aiFailure("学校", "ja-vi", "aiOverloaded"));
        Mockito.when(ai.translateText(eq("学校"), eq("ja-vi"), eq(false))).thenReturn(aiFailure("学校", "ja-vi", "skipped"));
        assertEquals("AI_DOWN", translate(other, "学校").get("state").asText());
        JsonNode lim = translate(other, "学校");
        assertEquals("LIMIT", lim.get("state").asText());
        assertEquals(0, lim.get("aiLeft").asInt());
        assertEquals(1, lim.get("tokens").size(), "hết lượt vẫn có phân tích câu");
        Mockito.verify(ai, Mockito.times(1)).translateText(eq("学校"), eq("ja-vi"), eq(false));

        // Việt → Nhật tự nhận hướng; hướng gửi tay được tôn trọng
        Mockito.when(ai.translateText(eq("Tôi ăn cơm."), eq("vi-ja"), anyBoolean())).thenReturn(aiFailure("Tôi ăn cơm.", "vi-ja", "skipped"));
        assertEquals("vi-ja", translate(other, "Tôi ăn cơm.").get("direction").asText());
        Mockito.when(ai.translateText(eq("学校"), eq("vi-ja"), anyBoolean())).thenReturn(aiFailure("学校", "vi-ja", "skipped"));
        JsonNode forced = read(call(post("/api/dictionary/translate"), other, Map.of("text", "学校", "direction", "vi-ja"))
                .andExpect(status().isOk()));
        assertEquals("vi-ja", forced.get("direction").asText());
    }

    @Test
    void translate_text_validation_ai_service_down_and_burst_limit() throws Exception {
        String token = newUser();
        call(post("/api/dictionary/translate"), token, Map.of("text", "   ")).andExpect(status().isBadRequest());
        call(post("/api/dictionary/translate"), token, Map.of("text", "x".repeat(1001))).andExpect(status().isBadRequest());
        call(post("/api/dictionary/translate"), token, Map.of("text", "x", "direction", "en-vi")).andExpect(status().isBadRequest());
        call(post("/api/dictionary/translate"), null, Map.of("text", "ご飯")).andExpect(status().isUnauthorized());

        // ai-service tắt → 503 và lượt được hoàn
        Mockito.when(ai.translateText(anyString(), anyString(), anyBoolean()))
                .thenThrow(new AiServiceClient.AiServiceException("Không kết nối được dịch vụ AI"));
        call(post("/api/dictionary/translate"), token, Map.of("text", "ご飯")).andExpect(status().isServiceUnavailable());
        Mockito.reset(ai);
        Mockito.when(ai.translateText(eq("ご飯"), eq("ja-vi"), eq(true))).thenReturn(aiFailure("ご飯", "ja-vi", "no_api_key"));
        assertEquals(20, translate(token, "ご飯").get("aiLeft").asInt(), "lời gọi hỏng không tốn lượt");

        // chống dồn 10 / phút (tính cả lượt 503 và trúng cache): đã gọi 2 lần hợp lệ → 8 lần nữa ok, lần 11 bị 429
        for (int i = 0; i < 8; i++) translate(token, "ご飯");
        call(post("/api/dictionary/translate"), token, Map.of("text", "ご飯")).andExpect(status().isTooManyRequests());
    }
    // ------------------------------------------------------------------ báo bản dịch sai (V40)

    @Test
    void translation_report_apply_and_retranslate() throws Exception {
        String user = newUser();
        String admin = newStaff(Role.ADMIN);
        String src = "ご飯を食べました。" + id;   // câu riêng của test: bộ nhớ dịch dùng chung giữa các test
        Mockito.when(ai.translateText(eq(src), eq("ja-vi"), eq(true))).thenReturn(aiTranslation("w:" + id));
        assertEquals("OK", translate(user, src).get("state").asText());

        // chưa dịch / chưa vào bộ nhớ -> 404; thiếu cả đề xuất lẫn ghi chú -> 400; hướng auto không nhận
        call(post("/api/dictionary/translate/reports"), user, Map.of("text", "学校", "direction", "ja-vi", "note", "sai"))
                .andExpect(status().isNotFound());
        call(post("/api/dictionary/translate/reports"), user, Map.of("text", src, "direction", "ja-vi")).andExpect(status().isBadRequest());
        call(post("/api/dictionary/translate/reports"), user, Map.of("text", src, "direction", "auto", "note", "sai"))
                .andExpect(status().isBadRequest());
        call(post("/api/dictionary/translate/reports"), null, Map.of("text", src, "direction", "ja-vi", "note", "sai"))
                .andExpect(status().isUnauthorized());

        JsonNode r = read(call(post("/api/dictionary/translate/reports"), user,
                Map.of("text", "  " + src, "direction", "ja-vi", "proposedValue", "Tôi đã ăn cơm rồi.", "note", "thiếu 'rồi'"))
                .andExpect(status().isCreated()));
        assertEquals("TEXT", r.get("kind").asText());
        assertEquals("ja-vi", r.get("field").asText());
        assertEquals(src, r.get("sourceText").asText(), "câu gốc đã chuẩn hoá đi kèm báo cáo");
        assertEquals("Tôi đã ăn cơm.", r.get("currentValue").asText());
        call(post("/api/dictionary/translate/reports"), user, Map.of("text", src, "direction", "ja-vi", "note", "lần nữa"))
                .andExpect(status().isConflict());

        // admin thấy ở bộ lọc TEXT; báo cáo TEXT không lọt vào hàng chờ mục từ
        JsonNode list = read(call(get("/api/admin/dictionary/reports").param("kind", "TEXT"), admin, null).andExpect(status().isOk()));
        assertTrue(list.get("total").asInt() >= 1);
        long rid = r.get("id").asLong();
        JsonNode applied = read(call(post("/api/admin/dictionary/reports/{id}/apply", rid), admin, null).andExpect(status().isOk()));
        assertEquals("Tôi đã ăn cơm rồi.", applied.get("translation").asText());
        assertEquals("RESOLVED", jdbc.queryForObject("SELECT status FROM dict_reports WHERE id = ?", String.class, rid));
        JsonNode feed = read(call(get("/api/notifications"), user, null));
        assertEquals("TEXT", feed.get("items").get(0).get("payload").get("kind").asText());

        // người học (cả người khác) nhận bản đã sửa từ bộ nhớ, không gọi AI lại
        JsonNode fixed = translate(newUser(), src);
        assertTrue(fixed.get("cached").asBoolean());
        assertTrue(fixed.get("edited").asBoolean());
        assertEquals("Tôi đã ăn cơm rồi.", fixed.get("translation").asText());
        assertEquals("admin", fixed.get("model").asText());
        Mockito.verify(ai, Mockito.times(1)).translateText(eq(src), eq("ja-vi"), eq(true));

        // báo tiếp -> admin xoá khỏi bộ nhớ -> lượt sau dịch lại bằng AI
        long rid2 = read(call(post("/api/dictionary/translate/reports"), user, Map.of("text", src, "direction", "ja-vi", "note", "vẫn sai"))
                .andExpect(status().isCreated())).get("id").asLong();
        call(post("/api/admin/dictionary/reports/{id}/resolve", rid2).param("action", "retranslate"), admin, null).andExpect(status().isOk())
                .andExpect(jsonPath("$.action").value("CACHE_CLEARED"));
        JsonNode again = translate(user, src);
        assertFalse(again.get("cached").asBoolean());
        Mockito.verify(ai, Mockito.times(2)).translateText(eq(src), eq("ja-vi"), eq(true));
    }

    @Test
    void translation_report_vi_ja_cannot_be_hand_applied() throws Exception {
        String user = newUser();
        String admin = newStaff(Role.ADMIN);
        String src = "Tôi ăn cơm " + id + ".";
        Mockito.when(ai.translateText(eq(src), eq("vi-ja"), eq(true))).thenReturn(json.readTree("""
                {"direction":"vi-ja","source":"%s","translation":"ご飯を食べます。","literal":null,"alternatives":[],"notes":null,
                 "reading":"ごはんをたべます。","romaji":"gohan o tabemasu.","readingAgrees":true,"tokens":[],"model":"gemini-test","reason":null}
                """.formatted(src)));
        assertEquals("OK", translate(user, src).get("state").asText());
        long rid = read(call(post("/api/dictionary/translate/reports"), user,
                Map.of("text", src, "direction", "vi-ja", "proposedValue", "ご飯を食べています。")).andExpect(status().isCreated())).get("id").asLong();
        call(post("/api/admin/dictionary/reports/{id}/apply", rid), admin, null).andExpect(status().isBadRequest());
        call(post("/api/admin/dictionary/reports/{id}/dismiss", rid), admin, Map.of("note", "bản dịch đúng")).andExpect(status().isOk());
        assertEquals("DISMISSED", jdbc.queryForObject("SELECT status FROM dict_reports WHERE id = ?", String.class, rid));
    }
}
