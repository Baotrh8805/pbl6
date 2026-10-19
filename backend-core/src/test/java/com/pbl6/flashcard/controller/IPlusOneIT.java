package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.dto.extraction.AiDtos;
import com.pbl6.flashcard.model.ExtractionJob;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.repository.ExtractionJobRepository;
import com.pbl6.flashcard.service.AiServiceClient;
import com.pbl6.flashcard.service.ContentAiClient;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockPart;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Câu ví dụ i+1 (hợp đồng đợt 2 §9, C6) với ai-service giả lập: knownLemmas = term các thẻ mình đã ôn chắc (reps ≥ 2 hoặc interval
 * ≥ 7, không lấy của người khác), trình độ của lượt + tham số gửi đúng, từ đích -> itemId của job, lượt không còn văn bản -> 409, áp
 * câu làm ví dụ (phải nằm trong văn bản, xoá bản dịch cũ), chỉ chủ lượt, job của lộ trình chỉ áp được khi bản nháp.
 */
class IPlusOneIT extends IntegrationTest {

    @MockitoBean
    AiServiceClient ai;

    @MockitoBean
    ContentAiClient contentAi;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    ExtractionJobRepository jobs;

    private static final String S1 = "毎日漢字を勉強します。";
    private static final String S2 = "学校へ行きます。";
    private static final String TEXT = S1 + "\n" + S2;

    @BeforeEach
    void stubAi() throws Exception {
        Mockito.reset(ai, contentAi);
        Mockito.when(ai.extractText(any(), any(), any(), any(), any())).thenAnswer(inv ->
                new AiDtos.TextResult(inv.getArgument(2), Map.of("engine", "text", "pages", 1), List.of()));
        Mockito.when(ai.analyze(anyString(), any(), any())).thenReturn(new AiDtos.AnalyzeResult(List.of(
                new AiDtos.Item("vocab", 1, "毎日", "毎日", "まいにち", null, null, "名詞", "every day", "mỗi ngày", "N5", 1.0,
                        List.of(), 1, S1, null, false, null),
                new AiDtos.Item("vocab", 2, "漢字", "漢字", "かんじ", null, "HÁN TỰ", "名詞", "kanji", "chữ Hán", "N4", 1.0,
                        List.of(), 1, "漢字が好きです。", "Tôi thích chữ Hán.", false, null),
                new AiDtos.Item("vocab", 3, "勉強", "勉強し", "べんきょう", null, null, "名詞", "study", "học", "N5", 1.0,
                        List.of(), 1, S1, null, false, null)), Map.of("vocab", 3), false));
        Mockito.when(ai.enrich(any())).thenReturn(new AiDtos.EnrichResult(true, List.of(), null));
        Mockito.when(contentAi.iPlusOne(anyString(), anyList(), any(), anyBoolean(), anyInt())).thenReturn(json.readTree("""
                {"items":[
                  {"sentence":"毎日漢字を勉強します。","target":{"lemma":"漢字","surface":"漢字","reading":"かんじ","level":"N4",
                   "meaningEn":"kanji","readingSegments":[{"text":"漢","reading":"かん"},{"text":"字","reading":"じ"}]},
                   "unknownCount":1,"knownCount":2,"length":11,"score":0.81},
                  {"sentence":"学校へ行きます。","target":{"lemma":"行く","surface":"行き","reading":"いく","level":"N5",
                   "meaningEn":"to go","readingSegments":null},"unknownCount":1,"knownCount":1,"length":8,"score":0.7}
                ],"stats":{"sentences":2,"kept":2}}"""));
    }

    private record Learner(String email, String token, Long id) {}

    private Learner learner() throws Exception {
        String email = newEmail();
        return new Learner(email, newUser(email), userId(email));
    }

    private String doneJob(String token) throws Exception {
        MockMultipartHttpServletRequestBuilder req = multipart("/api/extractions");
        req.part(new MockPart("text", TEXT.getBytes(StandardCharsets.UTF_8)));
        req.part(new MockPart("options", "{\"userLevel\":\"N4\"}".getBytes(StandardCharsets.UTF_8)));
        String id = read(call(req, token, null).andExpect(status().isAccepted())).get("id").asText();
        for (int i = 0; i < 100; i++) {
            JsonNode job = read(call(get("/api/extractions/" + id), token, null).andExpect(status().isOk()));
            if ("DONE".equals(job.get("status").asText())) return id;
            assertNotEquals("FAILED", job.get("status").asText());
            Thread.sleep(100);
        }
        throw new AssertionError("job không xong sau 10 giây");
    }

    /** Bộ thẻ của người học + bản ghi ôn tập (reps, interval) đặt thẳng trong DB cho từng term. */
    private void studied(Learner l, Map<String, int[]> progress) throws Exception {
        List<Map<String, Object>> cards = progress.keySet().stream()
                .map(t -> Map.<String, Object>of("term", t, "meaning", "nghĩa " + t)).toList();
        JsonNode deck = read(call(post("/api/decks"), l.token, Map.of("title", "Thẻ IT", "level", "N5", "cards", cards))
                .andExpect(status().isCreated()));
        for (JsonNode c : deck.get("cards")) {
            int[] p = progress.get(c.get("term").asText());
            jdbc.update("INSERT INTO reviews (user_id, card_id, reps, interval_days, ease, due_at) VALUES (?, ?, ?, ?, 2.5, now())",
                    l.id, c.get("id").asText(), p[0], p[1]);
        }
    }

    private String itemId(String token, String jobId, String term) throws Exception {
        for (JsonNode i : read(call(get("/api/extractions/" + jobId + "/items"), token, null).andExpect(status().isOk()))) {
            if (term.equals(i.get("term").asText())) return i.get("id").asText();
        }
        throw new AssertionError("không có item " + term);
    }

    @Test
    void finds_sentences_with_known_lemmas_from_own_studied_cards() throws Exception {
        Learner me = learner();
        studied(me, Map.of("学校", new int[]{2, 1}, "先生", new int[]{1, 7}, "勉強", new int[]{1, 1}));
        Learner other = learner();
        studied(other, Map.of("毎日", new int[]{9, 30}));
        String jobId = doneJob(me.token);

        JsonNode res = read(call(get("/api/extractions/" + jobId + "/i-plus-one"), me.token, null).andExpect(status().isOk()));
        assertEquals(2, res.get("knownCount").asInt(), "reps ≥ 2 hoặc interval ≥ 7; thẻ mới học 1 lần không tính");
        JsonNode first = res.get("items").get(0);
        assertEquals(S1, first.get("sentence").asText());
        assertEquals("漢字", first.get("target").get("lemma").asText());
        assertEquals("かんじ", first.get("target").get("reading").asText());
        assertEquals(2, first.get("target").get("readingSegments").size());
        assertEquals(1, first.get("unknownCount").asInt());
        assertEquals(2, first.get("knownCount").asInt());
        assertEquals(11, first.get("length").asInt());
        assertEquals(0.81, first.get("score").asDouble(), 1e-9);
        assertEquals(itemId(me.token, jobId, "漢字"), first.get("itemId").asText(), "từ đích -> item của job");
        JsonNode second = res.get("items").get(1);
        assertTrue(second.has("itemId"), "itemId luôn có mặt");
        assertTrue(second.get("itemId").isNull(), "từ đích không có trong danh sách bóc tách");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<String>> known = ArgumentCaptor.forClass(List.class);
        Mockito.verify(contentAi).iPlusOne(eq(TEXT), known.capture(), eq("N4"), eq(true), eq(50));
        assertEquals(Set.of("学校", "先生"), new HashSet<>(known.getValue()), "không lấy thẻ của người khác");

        call(get("/api/extractions/" + jobId + "/i-plus-one").param("assumeLevelKnown", "false").param("limit", "10"),
                me.token, null).andExpect(status().isOk());
        Mockito.verify(contentAi).iPlusOne(eq(TEXT), anyList(), eq("N4"), eq(false), eq(10));
    }

    @Test
    void find_errors() throws Exception {
        Learner me = learner();
        String jobId = doneJob(me.token);
        String url = "/api/extractions/" + jobId + "/i-plus-one";
        call(get(url).param("limit", "0"), me.token, null).andExpect(status().isBadRequest());
        call(get(url).param("limit", "201"), me.token, null).andExpect(status().isBadRequest());
        call(get(url), newUser(), null).andExpect(status().isNotFound());
        call(get("/api/extractions/" + UUID.randomUUID() + "/i-plus-one"), me.token, null).andExpect(status().isNotFound());
        call(get(url), newStaff(Role.ADMIN), null).andExpect(status().isForbidden());
        call(get(url), null, null).andExpect(status().isUnauthorized());

        Mockito.when(contentAi.iPlusOne(anyString(), anyList(), any(), anyBoolean(), anyInt()))
                .thenThrow(new AiServiceClient.AiServiceException("Không kết nối được dịch vụ AI."));
        call(get(url), me.token, null).andExpect(status().isServiceUnavailable());

        // văn bản đã bị dọn (job lộ trình cũ / housekeeping) -> 409, không gọi ai-service
        jdbc.update("UPDATE extraction_jobs SET extracted_text = NULL WHERE id = ?", UUID.fromString(jobId));
        Mockito.clearInvocations(contentAi);
        call(get(url), me.token, null).andExpect(status().isConflict());
        call(post(url + "/apply"), me.token, Map.of("itemId", itemId(me.token, jobId, "漢字"), "sentence", S1))
                .andExpect(status().isConflict());
        Mockito.verifyNoInteractions(contentAi);
    }

    @Test
    void apply_sets_example_from_document_sentence() throws Exception {
        Learner me = learner();
        String jobId = doneJob(me.token);
        String kanji = itemId(me.token, jobId, "漢字");
        String url = "/api/extractions/" + jobId + "/i-plus-one/apply";

        JsonNode item = read(call(post(url), me.token, Map.of("itemId", kanji, "sentence", "  " + S1 + " "))
                .andExpect(status().isOk()));
        assertEquals(kanji, item.get("id").asText());
        assertEquals(S1, item.get("example").asText());
        assertTrue(item.get("exampleVi") == null || item.get("exampleVi").isNull(), "bản dịch của câu cũ bị xoá");
        assertTrue(item.get("conflicts").isArray());
        JsonNode reread = read(call(get("/api/extractions/" + jobId + "/items"), me.token, null).andExpect(status().isOk()));
        for (JsonNode i : reread) if (kanji.equals(i.get("id").asText())) assertEquals(S1, i.get("example").asText());

        call(post(url), me.token, Map.of("itemId", kanji, "sentence", "東京へ行きます。")).andExpect(status().isBadRequest());
        call(post(url), me.token, Map.of("itemId", kanji, "sentence", "  ")).andExpect(status().isBadRequest());
        call(post(url), me.token, Map.of("itemId", kanji, "sentence", "あ".repeat(501))).andExpect(status().isBadRequest());
        call(post(url), me.token, Map.of("sentence", S1)).andExpect(status().isBadRequest());
        call(post(url), me.token, Map.of("itemId", UUID.randomUUID().toString(), "sentence", S1))
                .andExpect(status().isBadRequest());
        // item của lượt khác của chính mình cũng không được
        String otherJob = doneJob(me.token);
        call(post(url), me.token, Map.of("itemId", itemId(me.token, otherJob, "漢字"), "sentence", S1))
                .andExpect(status().isBadRequest());
        call(post(url), newUser(), Map.of("itemId", kanji, "sentence", S1)).andExpect(status().isNotFound());

        ExtractionJob job = jobs.findById(UUID.fromString(jobId)).orElseThrow();
        job.setStatus(ExtractionJob.RUNNING);
        jobs.save(job);
        call(post(url), me.token, Map.of("itemId", kanji, "sentence", S2)).andExpect(status().isConflict());
        job = jobs.findById(UUID.fromString(jobId)).orElseThrow();
        job.setStatus(ExtractionJob.DONE);
        jobs.save(job);
    }

    /**
     * Job của lộ trình: áp câu theo đúng luật sửa item của lộ trình — được khi bản nháp, 409 khi đã kích hoạt (bộ thẻ chương dựng từ
     * item lúc kích hoạt, sửa item lúc đó không đổi thẻ nào). Tìm câu vẫn được (chỉ đọc).
     */
    @Test
    void apply_on_learning_path_job_requires_draft() throws Exception {
        Learner me = learner();
        MockMultipartHttpServletRequestBuilder req = multipart("/api/learning-paths");
        req.part(new MockPart("text", TEXT.getBytes(StandardCharsets.UTF_8)));
        req.part(new MockPart("days", "2".getBytes(StandardCharsets.UTF_8)));
        String pathId = read(call(req, me.token, null).andExpect(status().isAccepted())).get("id").asText();
        JsonNode path = null;
        for (int i = 0; i < 100; i++) {
            path = read(call(get("/api/learning-paths/" + pathId), me.token, null).andExpect(status().isOk()));
            if (!"PROCESSING".equals(path.get("status").asText())) break;
            Thread.sleep(100);
        }
        assertEquals("DRAFT", path.get("status").asText());
        String jobId = path.get("jobId").asText();
        String kanji = itemId(me.token, jobId, "漢字");
        String url = "/api/extractions/" + jobId + "/i-plus-one";

        call(get(url), me.token, null).andExpect(status().isOk());
        assertEquals(S1, read(call(post(url + "/apply"), me.token, Map.of("itemId", kanji, "sentence", S1))
                .andExpect(status().isOk())).get("example").asText(), "bản nháp: sửa item được");

        jdbc.update("UPDATE learning_paths SET status = 'ACTIVE' WHERE id = ?", UUID.fromString(pathId));
        call(post(url + "/apply"), me.token, Map.of("itemId", kanji, "sentence", S2)).andExpect(status().isConflict());
        for (JsonNode i : read(call(get("/api/extractions/" + jobId + "/items"), me.token, null).andExpect(status().isOk()))) {
            if (kanji.equals(i.get("id").asText())) assertEquals(S1, i.get("example").asText(), "lộ trình đã kích hoạt: không đổi item");
        }
        call(get(url), me.token, null).andExpect(status().isOk());
        call(post(url + "/apply"), learner().token, Map.of("itemId", kanji, "sentence", S2)).andExpect(status().isNotFound());
    }
}
