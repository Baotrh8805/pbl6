package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.dto.extraction.AiDtos;
import com.pbl6.flashcard.model.AppSetting;
import com.pbl6.flashcard.model.ExtractionItem;
import com.pbl6.flashcard.model.ExtractionJob;
import com.pbl6.flashcard.model.KnowledgeSource;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.repository.AppSettingRepository;
import com.pbl6.flashcard.repository.ExtractionItemRepository;
import com.pbl6.flashcard.repository.ExtractionJobRepository;
import com.pbl6.flashcard.repository.KnowledgeSourceRepository;
import com.pbl6.flashcard.service.AiServiceClient;
import com.pbl6.flashcard.service.ContentAiClient;
import com.pbl6.flashcard.service.KnowledgeSourceService;
import com.pbl6.flashcard.service.SettingsService;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockPart;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Cảnh báo mâu thuẫn (hợp đồng đợt 2 §5, F2) với ai-service giả lập: cảnh báo lúc phân tích được lưu + trả ra (noteVi, luôn là mảng),
 * tham chiếu của nguồn chuẩn ACTIVE + ngưỡng cấu hình gửi kèm lúc phân tích (không lưu vào options), kiểm tra lại cho bóc tách và lộ
 * trình chỉ đánh giá lại trường còn khai báo của tài liệu (giữ level / grammar), job cũ trước F2, lỗi / quyền / job bị chạy lại giữa
 * chừng. DB dùng chung giữa các test nên nguồn chuẩn tạo trong test bị xoá ở cuối test và mọi khẳng định về references là "có chứa",
 * không phải "bằng".
 */
class ConflictIT extends IntegrationTest {

    @MockitoBean
    AiServiceClient ai;

    @MockitoBean
    ContentAiClient contentAi;

    @Autowired
    ExtractionItemRepository items;

    @Autowired
    ExtractionJobRepository jobs;

    @Autowired
    KnowledgeSourceRepository sources;

    @Autowired
    KnowledgeSourceService knowledge;

    @Autowired
    AppSettingRepository appSettings;

    @Autowired
    JdbcTemplate jdbc;

    private static final String TEXT = "学校で勉強します。";

    private static Map<String, Object> readingConflict() {
        Map<String, Object> c = new LinkedHashMap<>();
        c.put("field", "reading");
        c.put("document", "がくこう");
        c.put("reference", "がっこう");
        c.put("source", "jlpt_list");
        c.put("confidence", 0.9);
        c.put("note_vi", "Tài liệu đọc 「がくこう」 nhưng danh sách JLPT ghi 「がっこう」.");
        return c;
    }

    private static List<AiDtos.Item> analyzedItems(Integer chapterOfLast) {
        return List.of(
                new AiDtos.Item("vocab", 1, "学校", "学校", "がくこう", List.of(Map.of("kanji", "学校", "kana", "がくこう")),
                        "HỌC HIỆU", "名詞", "school", null, "N5", 1.0, List.of("jlpt_list:N5"), 1, TEXT, null, false, 1,
                        List.of(readingConflict()), "がくこう", "school"),
                new AiDtos.Item("vocab", 2, "勉強", "勉強し", "べんきょう", null, "MIỄN CƯỜNG", "名詞", "study", "học", "N5",
                        1.0, List.of("jlpt_list:N5"), 1, TEXT, null, false, 1, List.of(), null, null),
                // ai-service cũ: không có conflicts / doc* (hàm dựng 18 tham số)
                new AiDtos.Item("grammar", 3, "〜ます", null, null, null, null, "文法", null, "thể lịch sự", "N5", 1.0,
                        List.of(), 1, TEXT, null, false, chapterOfLast));
    }

    private void stubAnalyze(Map<String, Object> stats) {
        Mockito.when(ai.analyze(anyString(), any(), any()))
                .thenReturn(new AiDtos.AnalyzeResult(analyzedItems(1), stats, false));
    }

    @BeforeEach
    void stubAi() {
        Mockito.reset(ai, contentAi);
        Mockito.when(ai.extractText(any(), any(), any(), any(), any())).thenAnswer(inv -> {
            String text = inv.getArgument(2);
            return new AiDtos.TextResult(text, Map.of("engine", "text", "sourceType", "text", "pages", 1), List.of());
        });
        stubAnalyze(Map.of("vocab", 2, "grammar", 1, "conflicts", 1,
                "conflictsByField", Map.of("reading", 1, "furigana", 0, "meaning", 0, "level", 0, "grammar", 0)));
        Mockito.when(ai.enrich(any())).thenReturn(new AiDtos.EnrichResult(true, List.of(), null));
    }

    // ---------- trợ giúp ----------

    private ResultActions postText(String token) throws Exception {
        MockMultipartHttpServletRequestBuilder req = multipart("/api/extractions");
        req.part(new MockPart("text", TEXT.getBytes(StandardCharsets.UTF_8)));
        return call(req, token, null);
    }

    private JsonNode awaitDone(String token, String id) throws Exception {
        for (int i = 0; i < 100; i++) {
            JsonNode job = read(call(get("/api/extractions/" + id), token, null).andExpect(status().isOk()));
            String s = job.get("status").asText();
            if ("DONE".equals(s) || "FAILED".equals(s)) return job;
            Thread.sleep(100);
        }
        throw new AssertionError("job không kết thúc sau 10 giây");
    }

    private String doneJob(String token) throws Exception {
        String id = read(postText(token).andExpect(status().isAccepted())).get("id").asText();
        assertEquals("DONE", awaitDone(token, id).get("status").asText());
        return id;
    }

    private JsonNode itemByTerm(String token, String jobId, String term) throws Exception {
        for (JsonNode i : read(call(get("/api/extractions/" + jobId + "/items"), token, null).andExpect(status().isOk()))) {
            if (term.equals(i.get("term").asText())) return i;
        }
        throw new AssertionError("không có item " + term);
    }

    private UUID source(String kind, String status, String level, List<Map<String, Object>> entries) {
        KnowledgeSource k = new KnowledgeSource();
        k.setId(UUID.randomUUID());
        k.setTitle("Nguồn IT");
        k.setKind(kind);
        k.setLevel(level);
        k.setStatus(status);
        k.setEntries(entries);
        Instant now = Instant.now();
        k.setCreatedAt(now);
        k.setUpdatedAt(now);
        sources.save(k);
        return k.getId();
    }

    private static Map<String, Object> entry(String term, String reading, String meaning, String level) {
        Map<String, Object> e = new LinkedHashMap<>();
        e.put("term", term);
        if (reading != null) e.put("reading", reading);
        if (meaning != null) e.put("meaning", meaning);
        if (level != null) e.put("level", level);
        return e;
    }

    private static String unique(String prefix) {
        return prefix + UUID.randomUUID().toString().substring(0, 8);
    }

    private String setSetting(String key, String value) {
        AppSetting s = appSettings.findById(key).orElseThrow();
        String old = s.getValue();
        s.setValue(value);
        appSettings.save(s);
        return old;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> refs(Map<String, Object> options) {
        return (List<Map<String, Object>>) options.get("references");
    }

    private static boolean hasTerm(List<Map<String, Object>> refs, String term) {
        return refs.stream().anyMatch(r -> term.equals(r.get("term")));
    }

    /** ai-service /extract/conflicts giả: cảnh báo nghĩa cho đúng term được chỉ định, mọi item khác []. */
    private void stubRecheck(String termWithConflict, String sourceId) {
        Mockito.when(contentAi.conflicts(anyList(), anyList(), anyDouble())).thenAnswer(inv -> {
            List<Map<String, Object>> req = inv.getArgument(0);
            List<Map<String, Object>> out = new ArrayList<>();
            for (Map<String, Object> it : req) {
                List<Map<String, Object>> found = new ArrayList<>();
                if (termWithConflict.equals(it.get("term"))) {
                    Map<String, Object> c = new LinkedHashMap<>();
                    c.put("field", "meaning");
                    c.put("document", "học");
                    c.put("reference", "nghiên cứu");
                    c.put("source", "admin:" + sourceId);
                    c.put("confidence", 0.95);
                    c.put("note_vi", "Nghĩa không trùng mục quản trị.");
                    found.add(c);
                }
                out.add(Map.of("ref", it.get("ref"), "conflicts", found));
            }
            return json.valueToTree(Map.of("items", out, "stats", Map.of("items", req.size())));
        });
    }

    // ---------- phân tích ----------

    @Test
    void analyze_conflicts_are_persisted_and_exposed_with_active_references() throws Exception {
        String active = unique("参照");
        String archived = unique("保管");
        String other = unique("他");
        UUID activeId = source(KnowledgeSource.KIND_VOCAB, KnowledgeSource.ACTIVE, "N4",
                List.of(entry(active, "さんしょう", "tham chiếu", null)));
        UUID archivedId = source(KnowledgeSource.KIND_VOCAB, KnowledgeSource.ARCHIVED, null, List.of(entry(archived, null, null, null)));
        UUID otherId = source(KnowledgeSource.KIND_OTHER, KnowledgeSource.ACTIVE, null, List.of(entry(other, null, null, null)));
        try {
            String token = newUser();
            String id = doneJob(token);

            @SuppressWarnings("unchecked")
            ArgumentCaptor<Map<String, Object>> options = ArgumentCaptor.forClass(Map.class);
            Mockito.verify(ai).analyze(anyString(), any(), options.capture());
            List<Map<String, Object>> sent = refs(options.getValue());
            Map<String, Object> mine = sent.stream().filter(r -> active.equals(r.get("term"))).findFirst().orElseThrow();
            assertEquals("さんしょう", mine.get("reading"));
            assertEquals("tham chiếu", mine.get("meaning"));
            assertEquals("N4", mine.get("level"), "mục không ghi cấp lấy cấp khai cho cả nguồn");
            assertEquals(activeId.toString(), mine.get("sourceId"));
            assertFalse(hasTerm(sent, archived), "nguồn ARCHIVED không làm tham chiếu");
            assertFalse(hasTerm(sent, other), "nguồn OTHER không làm tham chiếu");
            assertEquals(0.7, ((Number) options.getValue().get("conflictMinConfidence")).doubleValue(), 1e-9,
                    "ngưỡng seed contradiction_alert_threshold");

            JsonNode job = read(call(get("/api/extractions/" + id), token, null).andExpect(status().isOk()));
            assertEquals(0.7, job.get("options").get("conflictMinConfidence").asDouble(), 1e-9);
            assertFalse(job.get("options").has("references"), "tham chiếu không lưu vào options (trả về mỗi lần poll)");
            assertEquals(1, job.get("stats").get("conflicts").asInt());
            assertEquals(1, job.get("stats").get("conflictsByField").get("reading").asInt());

            JsonNode school = itemByTerm(token, id, "学校");
            assertEquals(1, school.get("conflicts").size());
            JsonNode c = school.get("conflicts").get(0);
            assertEquals("reading", c.get("field").asText());
            assertEquals("がくこう", c.get("document").asText());
            assertEquals("がっこう", c.get("reference").asText());
            assertEquals("jlpt_list", c.get("source").asText());
            assertEquals(0.9, c.get("confidence").asDouble(), 1e-9);
            assertTrue(c.get("noteVi").asText().startsWith("Tài liệu đọc"));
            assertFalse(c.has("note_vi"), "khoá Python được đổi thành noteVi");
            assertTrue(itemByTerm(token, id, "勉強").get("conflicts").isArray());
            assertEquals(0, itemByTerm(token, id, "勉強").get("conflicts").size());
            JsonNode grammar = itemByTerm(token, id, "〜ます");
            assertTrue(grammar.get("conflicts").isArray(), "ai-service cũ không trả conflicts -> vẫn là mảng");
            assertEquals(0, grammar.get("conflicts").size());

            ExtractionItem stored = items.findById(UUID.fromString(school.get("id").asText())).orElseThrow();
            assertEquals("がくこう", stored.getDocReading());
            assertEquals("school", stored.getDocMeaningEn());
        } finally {
            sources.deleteAllById(List.of(activeId, archivedId, otherId));
        }
    }

    @Test
    void analysis_references_are_not_truncated_newest_first_and_skip_blank_terms() {
        List<Map<String, Object>> many = new ArrayList<>();
        many.add(entry("  ", "x", null, null)); // term rỗng: ai-service đòi term khác rỗng -> bỏ
        String first = unique("首");
        many.add(entry(first, null, null, "N2"));
        for (int i = 0; i < 2100; i++) many.add(entry(unique("語"), null, null, null));
        UUID id = source(KnowledgeSource.KIND_GRAMMAR, KnowledgeSource.ACTIVE, "N3", many);
        try {
            List<Map<String, Object>> refs = knowledge.activeReferences();
            assertEquals(2101, refs.stream().filter(r -> id.toString().equals(r.get("sourceId"))).count(),
                    "không cắt ở 2000 mục: nguồn thứ 4 trở đi vẫn được dùng");
            assertEquals(first, refs.get(0).get("term"), "nguồn mới sửa trước, giữ thứ tự trong nguồn");
            assertEquals("N2", refs.get(0).get("level"), "cấp riêng của mục thắng cấp của nguồn");
            assertEquals("N3", refs.get(1).get("level"));
            assertFalse(refs.get(0).containsKey("reading"), "trường trống không gửi");
        } finally {
            sources.deleteById(id);
        }
    }

    @Test
    void recheck_references_are_filtered_to_item_terms() {
        String term = unique("学");
        String other = unique("他");
        UUID id = source(KnowledgeSource.KIND_GRAMMAR, KnowledgeSource.ACTIVE, null, List.of(
                entry("〜" + term, null, "mẫu", null),   // khoá bỏ ～ / 〜 như _ref_key của ai-service
                entry(term + "　", null, "dư khoảng trắng", null),
                entry(other, null, "không liên quan", null)));
        try {
            List<Map<String, Object>> refs = knowledge.referencesFor(List.of(term, "  "));
            List<Map<String, Object>> mine = refs.stream().filter(r -> id.toString().equals(r.get("sourceId"))).toList();
            assertEquals(2, mine.size(), "chỉ mục trùng khoá term của item, không lấy mục khác");
            assertFalse(hasTerm(refs, other));
            assertTrue(knowledge.referencesFor(List.of()).isEmpty(), "không có term -> không truy vấn");
        } finally {
            sources.deleteById(id);
        }
    }

    // ---------- kiểm tra lại ----------

    private static Map<String, Object> levelConflict() {
        Map<String, Object> c = new LinkedHashMap<>();
        c.put("field", "level");
        c.put("document", "N1");
        c.put("reference", "N5");
        c.put("source", "jlpt_list");
        c.put("confidence", 0.6);
        c.put("noteVi", "Tài liệu xếp N1 nhưng danh sách JLPT xếp N5 (lệch 4 cấp).");
        return c;
    }

    private UUID itemIdByTerm(String jobId, String term) {
        return jdbc.queryForObject("SELECT id FROM extraction_items WHERE job_id = ? AND term = ?", UUID.class,
                UUID.fromString(jobId), term);
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> capturedRecheckItems() {
        ArgumentCaptor<List<Map<String, Object>>> sentItems = ArgumentCaptor.forClass(List.class);
        Mockito.verify(contentAi).conflicts(sentItems.capture(), anyList(), anyDouble());
        return sentItems.getValue();
    }

    private static Map<String, Object> sentItem(List<Map<String, Object>> sent, String term) {
        return sent.stream().filter(i -> term.equals(i.get("term"))).findFirst().orElseThrow();
    }

    /**
     * Job phân tích bởi pipeline có F2: chỉ đánh giá lại trường còn khai báo của tài liệu (gửi doc* = null tường minh, không gửi
     * meaningVi), item không còn gì để đánh giá thì không gửi, cảnh báo level / grammar lúc phân tích được giữ.
     */
    @Test
    void recheck_extraction_reevaluates_only_declared_fields_and_keeps_the_rest() throws Exception {
        String token = newUser();
        String id = doneJob(token);
        String unrelated = unique("無関係");
        UUID sourceId = source(KnowledgeSource.KIND_VOCAB, KnowledgeSource.ACTIVE, null,
                List.of(entry("学校", null, "nghiên cứu", null), entry(unrelated, null, "không liên quan", null)));
        // 勉強: tài liệu chỉ in nghĩa EN, có cảnh báo cấp lúc phân tích (kiểm tra lại không đánh giá lại được level)
        jdbc.update("UPDATE extraction_items SET doc_meaning_en = 'study', conflicts = CAST(? AS jsonb) WHERE id = ?",
                json.writeValueAsString(List.of(levelConflict())), itemIdByTerm(id, "勉強"));
        String old = setSetting(SettingsService.KEY_CONTRADICTION_ALERT, "0.55");
        try {
            stubRecheck("学校", sourceId.toString());
            JsonNode job = read(call(post("/api/extractions/" + id + "/recheck-conflicts"), token, null)
                    .andExpect(status().isOk()));
            assertEquals(id, job.get("id").asText());
            assertEquals("DONE", job.get("status").asText());
            assertEquals(2, job.get("stats").get("conflicts").asInt(), "meaning mới của 学校 + level giữ lại của 勉強");
            assertEquals(1, job.get("stats").get("conflictsByField").get("meaning").asInt());
            assertEquals(1, job.get("stats").get("conflictsByField").get("level").asInt(), "cảnh báo cấp không bị reset về 0");
            assertEquals(0, job.get("stats").get("conflictsByField").get("reading").asInt(), "đủ năm trường, kể cả 0");
            assertEquals(5, job.get("stats").get("conflictsByField").size());
            assertTrue(job.get("stats").has("conflictsCheckedAt"));
            assertEquals(2, job.get("stats").get("vocab").asInt(), "các khoá stats khác giữ nguyên");

            @SuppressWarnings("unchecked")
            ArgumentCaptor<List<Map<String, Object>>> sentItems = ArgumentCaptor.forClass(List.class);
            @SuppressWarnings("unchecked")
            ArgumentCaptor<List<Map<String, Object>>> sentRefs = ArgumentCaptor.forClass(List.class);
            ArgumentCaptor<Double> minConf = ArgumentCaptor.forClass(Double.class);
            Mockito.verify(contentAi).conflicts(sentItems.capture(), sentRefs.capture(), minConf.capture());
            assertEquals(0.55, minConf.getValue(), 1e-9, "ngưỡng đọc lúc bấm kiểm tra lại");
            assertTrue(sentRefs.getValue().stream().anyMatch(r -> "学校".equals(r.get("term"))
                    && sourceId.toString().equals(r.get("sourceId"))), "mục trùng term của item được gửi");
            assertFalse(hasTerm(sentRefs.getValue(), unrelated), "mục không trùng term nào của job không gửi");
            assertEquals(2, sentItems.getValue().size(), "mẫu ngữ pháp (cần docLevel) không gửi");
            Map<String, Object> school = sentItem(sentItems.getValue(), "学校");
            assertEquals("がくこう", school.get("docReading"), "khai báo của tài liệu đã lưu được gửi");
            assertEquals("school", school.get("docMeaningEn"));
            assertEquals("vocab", school.get("kind"));
            assertFalse(school.containsKey("meaningVi"), "meaningVi có thể do Gemini viết: lúc phân tích ai-service chưa thấy nó");
            Map<String, Object> study = sentItem(sentItems.getValue(), "勉強");
            assertTrue(study.containsKey("docReading"), "job F2: luôn gửi khoá");
            assertNull(study.get("docReading"), "tài liệu không khai cách đọc -> null, Sudachi không bị đổ cho tài liệu");
            assertEquals("study", study.get("docMeaningEn"));

            JsonNode sc = itemByTerm(token, id, "学校").get("conflicts");
            assertEquals(1, sc.size(), "reading được đánh giá lại: cảnh báo cũ thay bằng kết quả mới");
            assertEquals("meaning", sc.get(0).get("field").asText());
            assertEquals("admin:" + sourceId, sc.get(0).get("source").asText());
            assertEquals("Nghĩa không trùng mục quản trị.", sc.get(0).get("noteVi").asText());
            JsonNode st = itemByTerm(token, id, "勉強").get("conflicts");
            assertEquals(1, st.size());
            assertEquals("level", st.get(0).get("field").asText(), "level không đánh giá lại được -> giữ nguyên");
        } finally {
            setSetting(SettingsService.KEY_CONTRADICTION_ALERT, old);
            sources.deleteById(sourceId);
        }
    }

    /** Job F2 mà không item nào còn khai báo của tài liệu: không gọi ai-service, mọi cảnh báo lúc phân tích giữ nguyên. */
    @Test
    void recheck_without_declarations_keeps_analysis_warnings_and_skips_ai_service() throws Exception {
        String token = newUser();
        String id = doneJob(token);
        jdbc.update("UPDATE extraction_items SET doc_reading = NULL, doc_meaning_en = NULL WHERE job_id = ?", UUID.fromString(id));
        JsonNode job = read(call(post("/api/extractions/" + id + "/recheck-conflicts"), token, null).andExpect(status().isOk()));
        Mockito.verifyNoInteractions(contentAi);
        assertEquals(1, job.get("stats").get("conflicts").asInt());
        assertEquals(1, job.get("stats").get("conflictsByField").get("reading").asInt());
        assertTrue(job.get("stats").has("conflictsCheckedAt"));
        assertEquals("reading", itemByTerm(token, id, "学校").get("conflicts").get(0).get("field").asText());
    }

    /**
     * Job tạo trước F2 (options chưa có conflictMinConfidence, item chưa lưu doc*): reading / meaningVi của thẻ được coi là của tài
     * liệu như ai-service quy ước. Phân tích lại job đó gửi + ghi ngưỡng cấu hình, nên lần kiểm tra lại sau đi theo luật F2.
     */
    @Test
    void recheck_legacy_job_uses_card_values_and_rerun_upgrades_it() throws Exception {
        String token = newUser();
        String id = doneJob(token);
        UUID jobId = UUID.fromString(id);
        jdbc.update("UPDATE extraction_jobs SET options = options - 'conflictMinConfidence' WHERE id = ?", jobId);
        jdbc.update("UPDATE extraction_items SET doc_reading = NULL, doc_meaning_en = NULL WHERE job_id = ?", jobId);

        stubRecheck("勉強", "x");
        JsonNode job = read(call(post("/api/extractions/" + id + "/recheck-conflicts"), token, null).andExpect(status().isOk()));
        assertEquals(1, job.get("stats").get("conflictsByField").get("meaning").asInt());
        List<Map<String, Object>> sent = capturedRecheckItems();
        assertEquals(2, sent.size(), "mọi từ vựng, không gửi mẫu ngữ pháp");
        Map<String, Object> study = sentItem(sent, "勉強");
        assertFalse(study.containsKey("docReading"), "job cũ: không gửi khoá -> reading của thẻ là của tài liệu");
        assertFalse(study.containsKey("docMeaningEn"));
        assertEquals("べんきょう", study.get("reading"));
        assertEquals("học", study.get("meaningVi"));
        assertEquals(0, itemByTerm(token, id, "学校").get("conflicts").size(), "reading đánh giá lại: cảnh báo cũ bị thay");
        assertEquals("meaning", itemByTerm(token, id, "勉強").get("conflicts").get(0).get("field").asText());

        // Chạy lại job cũ: ai-service nhận ngưỡng cấu hình (không rơi về mặc định 0.6 của nó) và job được ghi ngưỡng đó
        String oldThreshold = setSetting(SettingsService.KEY_CONTRADICTION_ALERT, "0.8");
        try {
            Mockito.clearInvocations(ai);
            call(post("/api/extractions/" + id + "/rerun"), token, null).andExpect(status().isAccepted());
            JsonNode rerun = awaitDone(token, id);
            assertEquals("DONE", rerun.get("status").asText());
            @SuppressWarnings("unchecked")
            ArgumentCaptor<Map<String, Object>> options = ArgumentCaptor.forClass(Map.class);
            Mockito.verify(ai).analyze(anyString(), any(), options.capture());
            assertEquals(0.8, ((Number) options.getValue().get("conflictMinConfidence")).doubleValue(), 1e-9);
            assertEquals(0.8, rerun.get("options").get("conflictMinConfidence").asDouble(), 1e-9);
        } finally {
            setSetting(SettingsService.KEY_CONTRADICTION_ALERT, oldThreshold);
        }
        Mockito.clearInvocations(contentAi);
        stubRecheck("勉強", "x");
        call(post("/api/extractions/" + id + "/recheck-conflicts"), token, null).andExpect(status().isOk());
        assertEquals(List.of("学校"), capturedRecheckItems().stream().map(i -> i.get("term")).toList(),
                "sau khi chạy lại: chỉ item còn khai báo của tài liệu được gửi");
    }

    @Test
    void recheck_errors_leave_data_untouched() throws Exception {
        String token = newUser();
        String id = doneJob(token);
        UUID jobId = UUID.fromString(id);

        // người khác / không tồn tại -> 404; staff -> 403
        call(post("/api/extractions/" + id + "/recheck-conflicts"), newUser(), null).andExpect(status().isNotFound());
        call(post("/api/extractions/" + UUID.randomUUID() + "/recheck-conflicts"), token, null).andExpect(status().isNotFound());
        call(post("/api/extractions/" + id + "/recheck-conflicts"), newStaff(Role.ADMIN), null).andExpect(status().isForbidden());
        call(post("/api/extractions/" + id + "/recheck-conflicts"), null, null).andExpect(status().isUnauthorized());

        // ai-service tắt -> 503, cảnh báo cũ còn nguyên
        Mockito.when(contentAi.conflicts(anyList(), anyList(), anyDouble()))
                .thenThrow(new AiServiceClient.AiServiceException("Không kết nối được dịch vụ AI."));
        call(post("/api/extractions/" + id + "/recheck-conflicts"), token, null).andExpect(status().isServiceUnavailable());
        assertEquals(1, itemByTerm(token, id, "学校").get("conflicts").size());

        // job đang chạy -> 409, không gọi ai-service
        ExtractionJob job = jobs.findById(jobId).orElseThrow();
        job.setStatus(ExtractionJob.RUNNING);
        jobs.save(job);
        Mockito.clearInvocations(contentAi);
        call(post("/api/extractions/" + id + "/recheck-conflicts"), token, null).andExpect(status().isConflict());
        Mockito.verifyNoInteractions(contentAi);
        job = jobs.findById(jobId).orElseThrow();
        job.setStatus(ExtractionJob.DONE);
        jobs.save(job);

        // job bị chạy lại trong lúc chờ ai-service (item mang id mới) -> 409, không dán kết quả cũ, stats không đổi
        Mockito.doAnswer(inv -> {
            List<Map<String, Object>> req = inv.getArgument(0);
            // mô phỏng worker vừa thay item: một item của job biến mất trước khi kết quả quay về
            jdbc.update("DELETE FROM extraction_items WHERE job_id = ? AND term = ?", jobId, "勉強");
            List<Map<String, Object>> out = new ArrayList<>();
            for (Map<String, Object> it : req) out.add(Map.of("ref", it.get("ref"), "conflicts", List.of()));
            return json.valueToTree(Map.of("items", out));
        }).when(contentAi).conflicts(anyList(), anyList(), anyDouble()); // doAnswer: stub cũ đang ném lỗi
        call(post("/api/extractions/" + id + "/recheck-conflicts"), token, null).andExpect(status().isConflict());
        assertFalse(jobs.findById(jobId).orElseThrow().getStats().containsKey("conflictsCheckedAt"));
        assertEquals(1, itemByTerm(token, id, "学校").get("conflicts").size(), "rollback: item còn lại giữ cảnh báo cũ");
    }

    // ---------- lộ trình ----------

    private JsonNode awaitDraft(String token, String id) throws Exception {
        for (int i = 0; i < 100; i++) {
            JsonNode path = read(call(get("/api/learning-paths/" + id), token, null).andExpect(status().isOk()));
            String s = path.get("status").asText();
            if ("DRAFT".equals(s) || "FAILED".equals(s)) return path;
            Thread.sleep(100);
        }
        throw new AssertionError("lộ trình không ra bản nháp sau 10 giây");
    }

    @Test
    void recheck_learning_path_updates_its_job() throws Exception {
        String token = newUser();
        MockMultipartHttpServletRequestBuilder req = multipart("/api/learning-paths");
        req.part(new MockPart("text", TEXT.getBytes(StandardCharsets.UTF_8)));
        req.part(new MockPart("days", "2".getBytes(StandardCharsets.UTF_8)));
        String pathId = read(call(req, token, null).andExpect(status().isAccepted())).get("id").asText();
        JsonNode draft = awaitDraft(token, pathId);
        assertEquals("DRAFT", draft.get("status").asText());
        String jobId = draft.get("jobId").asText();

        // job của lộ trình chỉ thao tác qua trang lộ trình
        call(post("/api/extractions/" + jobId + "/recheck-conflicts"), token, null).andExpect(status().isConflict());
        call(post("/api/learning-paths/" + pathId + "/recheck-conflicts"), newUser(), null).andExpect(status().isNotFound());

        stubRecheck("学校", "x");
        JsonNode path = read(call(post("/api/learning-paths/" + pathId + "/recheck-conflicts").param("date", "2026-10-19"),
                token, null).andExpect(status().isOk()));
        assertEquals(pathId, path.get("id").asText());
        assertEquals("DRAFT", path.get("status").asText(), "kiểm tra lại không đổi trạng thái lộ trình");
        assertEquals(1, path.get("job").get("stats").get("conflicts").asInt());
        assertEquals(1, path.get("job").get("stats").get("conflictsByField").get("meaning").asInt());

        boolean seen = false;
        for (JsonNode ch : path.get("chapters")) {
            for (JsonNode it : read(call(get("/api/learning-paths/" + pathId + "/chapters/" + ch.get("id").asText() + "/items"),
                    token, null).andExpect(status().isOk()))) {
                assertTrue(it.get("conflicts").isArray());
                if ("学校".equals(it.get("term").asText())) {
                    seen = true;
                    assertEquals("meaning", it.get("conflicts").get(0).get("field").asText());
                }
            }
        }
        assertTrue(seen);
    }
}
