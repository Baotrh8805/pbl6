package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.dto.extraction.AiDtos;
import com.pbl6.flashcard.service.AiServiceClient;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.isNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Luồng bóc tách với ai-service giả lập: job chạy nền -> poll -> duyệt item -> tạo bộ thẻ. */
class ExtractionIT extends IntegrationTest {

    @MockitoBean
    private AiServiceClient ai;

    private static final String TEXT = "毎日漢字を勉強します。";

    @BeforeEach
    void stubAi() {
        Mockito.reset(ai);
        Mockito.when(ai.extractText(any(), any(), any(), any())).thenAnswer(inv -> {
            byte[] data = inv.getArgument(0);
            String text = data != null ? new String(data, StandardCharsets.UTF_8) : inv.getArgument(2);
            // lines như OCR Tesseract trả: một dòng conf thấp để kiểm tra textMeta.lowLines
            return new AiDtos.TextResult(text, Map.of("engine", "text", "sourceType", "text", "pages", 1),
                    List.of(Map.of("text", text, "page", 1, "lines", List.of(
                            Map.of("text", "漢字を勉強します", "conf", 0.91),
                            Map.of("text", "難解", "conf", 0.42)))));
        });
        Mockito.when(ai.analyze(anyString(), any(), any())).thenReturn(new AiDtos.AnalyzeResult(List.of(
                new AiDtos.Item("vocab", 1, "漢字", "漢字", "かんじ",
                        List.of(Map.of("kanji", "漢", "kana", "かん"), Map.of("kanji", "字", "kana", "じ")),
                        "HÁN TỰ", "名詞", "kanji", null, "N4", 1.0, List.of("jlpt_list:N4"), 1, TEXT, null, null, null),
                new AiDtos.Item("vocab", 2, "勉強", "勉強し", "べんきょう", null, "MIỄN CƯỜNG", "名詞",
                        "study", null, "N5", 0.5, List.of("jlpt_list:N5", "jlpt_list:N4"), 2, TEXT, null, false, null),
                new AiDtos.Item("vocab", 3, "難解", "難解", "なんかい", null, null, "形状詞",
                        null, null, null, 0.0, List.of(), 1, null, null, true, null),
                new AiDtos.Item("grammar", 4, "〜ます", null, null, null, null, "文法", null,
                        "thể lịch sự", "N5", 1.0, List.of("grammar_catalog:N5"), 3, TEXT, null, false, null)),
                Map.of("vocab", 3, "grammar", 1), false));
        Mockito.when(ai.enrich(any())).thenAnswer(inv -> {
            AiDtos.EnrichRequest req = inv.getArgument(0);
            List<AiDtos.EnrichOutput> out = req.items().stream()
                    .filter(i -> "漢字".equals(i.term()))
                    .map(i -> new AiDtos.EnrichOutput(i.ref(), "chữ Hán", "Mỗi ngày tôi học chữ Hán."))
                    .toList();
            return new AiDtos.EnrichResult(true, out, null);
        });
    }

    private ResultActions postText(String token, String text, String options) throws Exception {
        MockMultipartHttpServletRequestBuilder req = multipart("/api/extractions");
        if (text != null) req.part(new org.springframework.mock.web.MockPart("text", text.getBytes(StandardCharsets.UTF_8)));
        if (options != null) req.part(new org.springframework.mock.web.MockPart("options", options.getBytes(StandardCharsets.UTF_8)));
        return call(req, token, null);
    }

    private JsonNode awaitTerminal(String token, String id) throws Exception {
        for (int i = 0; i < 100; i++) {
            JsonNode job = read(call(get("/api/extractions/" + id).param("includeText", "true"), token, null)
                    .andExpect(status().isOk()));
            String status = job.get("status").asText();
            if ("DONE".equals(status) || "FAILED".equals(status)) return job;
            Thread.sleep(100);
        }
        throw new AssertionError("job không kết thúc sau 10 giây");
    }

    @Test
    void job_created_via_api_has_splitChapters_false_by_default() throws Exception {
        String token = newUser();
        JsonNode job = read(postText(token, TEXT, null).andExpect(status().isAccepted()));
        assertEquals(false, job.get("options").get("splitChapters").asBoolean(true));
    }

    @Test
    void text_job_runs_to_done_then_builds_decks_in_level_order() throws Exception {
        String token = newUser();
        JsonNode job = read(postText(token, TEXT, "{\"userLevel\":\"N4\",\"levelFilter\":\"all\"}")
                .andExpect(status().isAccepted()));
        assertEquals("text", job.get("sourceType").asText());
        assertEquals("N4", job.get("options").get("userLevel").asText());
        assertEquals("vi", job.get("options").get("meaningLang").asText()); // mặc định được điền
        String id = job.get("id").asText();

        JsonNode done = awaitTerminal(token, id);
        assertEquals("DONE", done.get("status").asText(), done.toString());
        assertEquals("DONE", done.get("stage").asText());
        assertEquals(TEXT, done.get("extractedText").asText());
        assertTrue(done.get("stats").get("enriched").asBoolean());
        assertFalse(done.get("textMeta").has("blocks")); // blocks chỉ dùng nội bộ
        JsonNode lowLines = done.get("textMeta").get("lowLines"); // chỉ dòng conf < 0.75
        assertEquals(1, lowLines.size());
        assertEquals("難解", lowLines.get(0).get("text").asText());
        assertEquals(0.42, lowLines.get(0).get("conf").asDouble(), 1e-9);

        JsonNode items = read(call(get("/api/extractions/" + id + "/items"), token, null).andExpect(status().isOk()));
        assertEquals(4, items.size());
        JsonNode kanji = items.get(0);
        assertEquals("漢字", kanji.get("term").asText());
        assertEquals("chữ Hán", kanji.get("meaningVi").asText()); // từ bước enrich
        assertEquals(2, kanji.get("readingSegments").size());
        assertTrue(items.get(1).get("meaningVi").isNull()); // enrich bỏ qua -> giữ nghĩa EN
        assertTrue(items.get(2).get("level").isNull());
        assertTrue(items.get(1).get("selected").asBoolean());
        assertFalse(items.get(2).get("selected").asBoolean()); // ai-service đánh dấu suspect -> bỏ chọn sẵn

        // Lọc theo cấp "unknown" và theo loại
        assertEquals(1, read(call(get("/api/extractions/" + id + "/items").param("level", "unknown"), token, null)).size());
        assertEquals(1, read(call(get("/api/extractions/" + id + "/items").param("kind", "grammar"), token, null)).size());

        // Bỏ chọn từ chưa rõ cấp, sửa nghĩa + cấp của 勉強
        String unknownId = items.get(2).get("id").asText();
        String benkyoId = items.get(1).get("id").asText();
        JsonNode patched = read(call(patch("/api/extractions/" + id + "/items"), token, List.of(
                Map.of("id", unknownId, "selected", false),
                Map.of("id", benkyoId, "meaningVi", "học", "level", "N4")))
                .andExpect(status().isOk()));
        assertEquals(4, patched.size());
        assertFalse(patched.get(2).get("selected").asBoolean());
        assertEquals("N4", patched.get(1).get("level").asText());
        assertEquals("user", patched.get(1).get("levelSources").get(0).asText());

        JsonNode decks = read(call(post("/api/extractions/" + id + "/decks"), token, Map.of(
                "vocab", Map.of("title", "Từ vựng bài 1"),
                "grammar", Map.of("title", "Ngữ pháp bài 1")))
                .andExpect(status().isCreated()));
        assertEquals(2, decks.size());
        JsonNode vocab = decks.get(0);
        assertEquals("goi", vocab.get("category").asText());
        assertEquals("N4", vocab.get("level").asText()); // cấp phổ biến nhất trong thẻ được chọn
        assertEquals(2, vocab.get("cards").size()); // từ bỏ chọn không vào bộ thẻ
        // N4 cả hai -> theo tần suất giảm dần: 勉強 (2) trước 漢字 (1)
        assertEquals("勉強", vocab.get("cards").get(0).get("term").asText());
        assertEquals("học\nHán-Việt: MIỄN CƯỜNG\n" + TEXT, vocab.get("cards").get(0).get("meaning").asText());
        JsonNode kanjiCard = vocab.get("cards").get(1);
        assertEquals("N4", kanjiCard.get("level").asText());
        assertEquals("vocab", kanjiCard.get("kind").asText());
        assertEquals("HÁN TỰ", kanjiCard.get("hanViet").asText());
        assertEquals("かん", kanjiCard.get("readingSegments").get(0).get("kana").asText());
        assertEquals("bunpou", decks.get(1).get("category").asText());
        assertEquals("grammar", decks.get(1).get("cards").get(0).get("kind").asText());

        JsonNode after = read(call(get("/api/extractions/" + id), token, null));
        assertEquals(2, after.get("deckIds").size());
        assertFalse(after.has("extractedText"));

        // Bộ thẻ sinh ra nằm trong "Bộ thẻ của tôi" và giữ metadata khi sửa (PUT không gửi level/segments)
        String deckId = vocab.get("id").asText();
        call(put("/api/decks/" + deckId), token, Map.of("title", "Đổi tên", "level", "N4",
                "cards", List.of(Map.of("id", kanjiCard.get("id").asText(), "term", "漢字", "meaning", "chữ Hán"))))
                .andExpect(status().isOk());
        JsonNode kept = read(call(get("/api/decks/" + deckId), token, null)).get("cards").get(0);
        assertEquals("HÁN TỰ", kept.get("hanViet").asText());
        assertEquals(2, kept.get("readingSegments").size());

        // Lịch sử + xoá: xoá job không xoá bộ thẻ
        assertEquals(1, read(call(get("/api/extractions"), token, null)).size());
        call(delete("/api/extractions/" + id), token, null).andExpect(status().isNoContent());
        call(get("/api/extractions/" + id), token, null).andExpect(status().isNotFound());
        call(get("/api/decks/" + deckId), token, null).andExpect(status().isOk());
    }

    @Test
    void edited_text_reruns_analysis_and_ai_failure_marks_job_failed() throws Exception {
        String token = newUser();
        String id = read(postText(token, TEXT, null)).get("id").asText();
        assertEquals("DONE", awaitTerminal(token, id).get("status").asText());

        Mockito.when(ai.analyze(anyString(), any(), any()))
                .thenThrow(new AiServiceClient.AiServiceException("Không kết nối được dịch vụ AI (phân tích từ vựng)."));
        call(put("/api/extractions/" + id + "/text"), token, Map.of("text", "新しい文章。")).andExpect(status().isAccepted());
        JsonNode failed = awaitTerminal(token, id);
        assertEquals("FAILED", failed.get("status").asText());
        assertEquals("新しい文章。", failed.get("extractedText").asText());
        assertTrue(failed.get("errorMessage").asText().contains("dịch vụ AI"));
        // Chưa hoàn tất -> không tạo được bộ thẻ
        call(post("/api/extractions/" + id + "/decks"), token, Map.of("vocab", Map.of("title", "x")))
                .andExpect(status().isBadRequest());

        stubAi();
        call(post("/api/extractions/" + id + "/rerun"), token, null).andExpect(status().isAccepted());
        JsonNode done = awaitTerminal(token, id);
        assertEquals("DONE", done.get("status").asText());
        assertTrue(done.get("errorMessage") == null || done.get("errorMessage").isNull());
        // stubAi() đã reset mock trước khi chạy lại: chạy lại chỉ gọi ANALYZE, không gọi lại bước TEXT
        Mockito.verify(ai, Mockito.never()).extractText(any(), any(), any(), any());
    }

    @Test
    void file_upload_validates_extension_and_magic_bytes() throws Exception {
        String token = newUser();
        call(multipart("/api/extractions").file(new MockMultipartFile("file", "a.exe", null, new byte[]{1, 2})), token, null)
                .andExpect(status().isBadRequest());
        // Đuôi .pdf nhưng nội dung không phải PDF
        call(multipart("/api/extractions").file(new MockMultipartFile("file", "a.pdf", null, "hello".getBytes())), token, null)
                .andExpect(status().isBadRequest());
        // Không file, không text
        postText(token, null, null).andExpect(status().isBadRequest());
        // Cả hai
        call(multipart("/api/extractions").file(new MockMultipartFile("file", "a.txt", null, TEXT.getBytes(StandardCharsets.UTF_8)))
                .part(new org.springframework.mock.web.MockPart("text", TEXT.getBytes(StandardCharsets.UTF_8))), token, null)
                .andExpect(status().isBadRequest());
        // options sai
        postText(token, TEXT, "{\"userLevel\":\"N9\"}").andExpect(status().isBadRequest());

        JsonNode job = read(call(multipart("/api/extractions")
                .file(new MockMultipartFile("file", "bai1.txt", null, TEXT.getBytes(StandardCharsets.UTF_8))), token, null)
                .andExpect(status().isAccepted()));
        assertEquals("txt", job.get("sourceType").asText());
        assertEquals("bai1.txt", job.get("sourceName").asText());
        assertEquals("DONE", awaitTerminal(token, job.get("id").asText()).get("status").asText());
    }

    @Test
    void jobs_are_private_and_daily_limit_applies() throws Exception {
        String owner = newUser();
        String other = newUser();
        String id = read(postText(owner, TEXT, null)).get("id").asText();
        call(get("/api/extractions/" + id), other, null).andExpect(status().isNotFound());
        call(get("/api/extractions/" + id + "/items"), other, null).andExpect(status().isNotFound());
        call(delete("/api/extractions/" + id), other, null).andExpect(status().isNotFound());

        postText(owner, TEXT, null).andExpect(status().isAccepted());
        postText(owner, TEXT, null).andExpect(status().isAccepted());
        postText(owner, TEXT, null).andExpect(status().isTooManyRequests()); // app.extraction.daily-limit.free=3
        // Người khác không bị tính chung
        postText(other, TEXT, null).andExpect(status().isAccepted());
    }

    @Test
    void reEnrich_translates_missing_meanings_only_and_throttles() throws Exception {
        String token = newUser();
        // ANALYZE trả 1 item đã có nghĩa VI từ tài liệu, 1 item chưa có; ENRICH lần đầu hết quota
        Mockito.when(ai.analyze(anyString(), any(), any())).thenReturn(new AiDtos.AnalyzeResult(List.of(
                new AiDtos.Item("vocab", 1, "銀行口座", "銀行口座", "ぎんこうこうざ", null, null, "名詞",
                        "bank account", "tài khoản ngân hàng", "N2", 0.8, List.of("phrase:口座"), 1, null, null, false, null),
                new AiDtos.Item("vocab", 2, "漢字", "漢字", "かんじ", null, "HÁN TỰ", "名詞",
                        "kanji", null, "N4", 1.0, List.of("jlpt_list:N4"), 1, null, null, false, null)),
                Map.of("vocab", 2, "grammar", 0, "layout", "list"), false));
        Mockito.doReturn(new AiDtos.EnrichResult(false, List.of(), "quota")).when(ai).enrich(any());
        String id = read(postText(token, "銀行口座\tbank account\n漢字\tkanji\n", null)).get("id").asText();
        JsonNode done = awaitTerminal(token, id);
        assertEquals("DONE", done.get("status").asText());
        assertFalse(done.get("stats").get("enriched").asBoolean());
        assertEquals("quota", done.get("stats").get("enrichReason").asText());
        assertEquals("list", done.get("stats").get("layout").asText());

        // Dịch lại: chỉ item thiếu nghĩa VI được gửi, nghĩa VI từ tài liệu giữ nguyên
        Mockito.doAnswer(inv -> {   // doAnswer: when(ai.enrich(any())) sẽ gọi stub cũ với tham số null
            AiDtos.EnrichRequest req = inv.getArgument(0);
            assertEquals(1, req.items().size());
            assertEquals("漢字", req.items().get(0).term());
            return new AiDtos.EnrichResult(true, List.of(new AiDtos.EnrichOutput(req.items().get(0).ref(), "chữ Hán", null)), null);
        }).when(ai).enrich(any());
        call(post("/api/extractions/" + id + "/enrich"), token, null).andExpect(status().isAccepted());
        JsonNode after = awaitTerminal(token, id);
        assertTrue(after.get("stats").get("enriched").asBoolean());
        assertTrue(after.get("stats").has("enrichedAt"));
        assertFalse(after.get("stats").has("enrichReason")); // dịch lại thành công -> xoá lý do lỗi cũ
        JsonNode items = read(call(get("/api/extractions/" + id + "/items"), token, null));
        assertEquals("tài khoản ngân hàng", items.get(0).get("meaningVi").asText());
        assertEquals("chữ Hán", items.get(1).get("meaningVi").asText());

        // Gọi lại trong 5 phút -> 429; job khác người -> 404
        call(post("/api/extractions/" + id + "/enrich"), token, null).andExpect(status().isTooManyRequests());
        call(post("/api/extractions/" + id + "/enrich"), newUser(), null).andExpect(status().isNotFound());
    }

    @Test
    void reEnrich_rejects_running_and_throttles() throws Exception {
        // job chưa DONE (FAILED do analyze lỗi) -> 400; options extractMode được lưu và validate
        String token = newUser();
        Mockito.when(ai.analyze(anyString(), any(), any()))
                .thenThrow(new AiServiceClient.AiServiceException("lỗi"));
        JsonNode job = read(postText(token, TEXT, "{\"extractMode\":\"list\"}").andExpect(status().isAccepted()));
        assertEquals("list", job.get("options").get("extractMode").asText());
        String id = job.get("id").asText();
        assertEquals("FAILED", awaitTerminal(token, id).get("status").asText());
        call(post("/api/extractions/" + id + "/enrich"), token, null).andExpect(status().isBadRequest());
        postText(token, TEXT, "{\"extractMode\":\"words\"}").andExpect(status().isBadRequest());
    }

    @Test
    void reEnrich_conflicts_while_job_is_running() throws Exception {
        String token = newUser();
        java.util.concurrent.CountDownLatch gate = new java.util.concurrent.CountDownLatch(1);
        Mockito.doAnswer(inv -> {
            gate.await(10, java.util.concurrent.TimeUnit.SECONDS);
            return new AiDtos.AnalyzeResult(List.of(), Map.of("vocab", 0, "grammar", 0), false);
        }).when(ai).analyze(anyString(), any(), any());
        String id = read(postText(token, TEXT, null)).get("id").asText();
        try {
            // job đang QUEUED/RUNNING (worker kẹt ở analyze) -> 409, không tạo lượt chạy mới
            call(post("/api/extractions/" + id + "/enrich"), token, null).andExpect(status().isConflict());
        } finally {
            gate.countDown();
        }
        assertEquals("DONE", awaitTerminal(token, id).get("status").asText());
    }
}
