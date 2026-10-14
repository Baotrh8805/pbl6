package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.dto.extraction.AiDtos;
import com.pbl6.flashcard.service.AiServiceClient;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.mock.web.MockPart;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Lộ trình học tập với ai-service giả lập: tạo -> job chạy nền -> bản nháp chương + lịch ngày. */
class LearningPathIT extends IntegrationTest {

    @MockitoBean
    private AiServiceClient ai;

    private static final String TEXT = "第1課 あいさつ\nこんにちは。\n第2課 かいもの\nりんごを買います。";

    private static AiDtos.Item vocab(int pos, String term, Integer chapter, boolean suspect) {
        return new AiDtos.Item("vocab", pos, term, term, null, null, null, "名詞", "en", "vi", "N5", 1.0,
                List.of(), 1, null, null, suspect, chapter);
    }

    private static AiDtos.Item grammar(int pos, String term, Integer chapter) {
        return new AiDtos.Item("grammar", pos, term, null, null, null, null, "文法", null, "vi", "N5", 1.0,
                List.of(), 1, null, null, false, chapter);
    }

    /** Chương 1: 12 từ chọn + 1 từ suspect; chương 2: 7 từ + 1 ngữ pháp. */
    private static List<AiDtos.Item> chapterItems() {
        List<AiDtos.Item> out = new ArrayList<>();
        int pos = 0;
        for (int i = 0; i < 12; i++) out.add(vocab(++pos, "語" + pos, 1, false));
        out.add(vocab(++pos, "疑" + pos, 1, true));
        for (int i = 0; i < 7; i++) out.add(vocab(++pos, "語" + pos, 2, false));
        out.add(grammar(++pos, "〜ます", 2));
        return out;
    }

    private void stubAnalyze(List<AiDtos.Item> items, Map<String, Object> stats) {
        Mockito.when(ai.analyze(anyString(), any(), any())).thenReturn(new AiDtos.AnalyzeResult(items, stats, false));
    }

    @BeforeEach
    void stubAi() {
        Mockito.reset(ai);
        Mockito.when(ai.extractText(any(), any(), any(), any())).thenAnswer(inv -> {
            byte[] data = inv.getArgument(0);
            String text = data != null ? new String(data, StandardCharsets.UTF_8) : inv.getArgument(2);
            return new AiDtos.TextResult(text, Map.of("engine", "text", "sourceType", "text", "pages", 1),
                    List.of(Map.of("text", text, "page", 1)));
        });
        stubAnalyze(chapterItems(), Map.of("vocab", 20, "grammar", 1, "chaptersDetected", true,
                "chapters", List.of(
                        Map.of("index", 1, "title", "第1課 あいさつ", "vocab", 13, "grammar", 0),
                        Map.of("index", 2, "title", "第2課 かいもの", "vocab", 7, "grammar", 1))));
        Mockito.when(ai.enrich(any())).thenReturn(new AiDtos.EnrichResult(true, List.of(), null));
    }

    private ResultActions postPath(String token, String text, String days, String title) throws Exception {
        MockMultipartHttpServletRequestBuilder req = multipart("/api/learning-paths");
        if (text != null) req.part(new MockPart("text", text.getBytes(StandardCharsets.UTF_8)));
        if (days != null) req.part(new MockPart("days", days.getBytes(StandardCharsets.UTF_8)));
        if (title != null) req.part(new MockPart("title", title.getBytes(StandardCharsets.UTF_8)));
        return call(req, token, null);
    }

    private ResultActions postExtraction(String token) throws Exception {
        MockMultipartHttpServletRequestBuilder req = multipart("/api/extractions");
        req.part(new MockPart("text", TEXT.getBytes(StandardCharsets.UTF_8)));
        return call(req, token, null);
    }

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
    void text_path_runs_to_draft() throws Exception {
        String token = newUser();
        JsonNode created = read(postPath(token, TEXT, "10", "  Minna bài 1-2  ").andExpect(status().isAccepted()));
        assertEquals("PROCESSING", created.get("status").asText());
        assertEquals("Minna bài 1-2", created.get("title").asText());
        assertEquals(10, created.get("totalDays").asInt());
        assertEquals("text", created.get("sourceType").asText());
        String id = created.get("id").asText();
        String jobId = created.get("jobId").asText();

        JsonNode job = read(call(get("/api/extractions/" + jobId), token, null).andExpect(status().isOk()));
        assertTrue(job.get("options").get("splitChapters").asBoolean());

        JsonNode draft = awaitDraft(token, id);
        assertEquals("DRAFT", draft.get("status").asText(), draft.toString());
        assertTrue(draft.get("chaptersDetected").asBoolean());
        assertEquals("DONE", draft.get("job").get("status").asText());
        assertTrue(draft.get("job").get("stats").get("chaptersDetected").asBoolean());

        JsonNode chapters = draft.get("chapters");
        assertEquals(2, chapters.size());
        JsonNode c1 = chapters.get(0);
        JsonNode c2 = chapters.get(1);
        assertEquals("第1課 あいさつ", c1.get("title").asText());
        assertEquals("第2課 かいもの", c2.get("title").asText());
        assertEquals(12, c1.get("cardCount").asInt()); // từ suspect bị bỏ chọn -> không đếm
        assertEquals(12, c1.get("vocabCount").asInt());
        assertEquals(0, c1.get("grammarCount").asInt());
        assertEquals(8, c2.get("cardCount").asInt());
        assertEquals(7, c2.get("vocabCount").asInt());
        assertEquals(1, c2.get("grammarCount").asInt());
        // allocate([12, 8], 10) -> 6 ngày + 4 ngày
        assertEquals(1, c1.get("dayFrom").asInt());
        assertEquals(6, c1.get("dayTo").asInt());
        assertEquals(7, c2.get("dayFrom").asInt());
        assertEquals(10, c2.get("dayTo").asInt());
        assertEquals(2, c1.get("perDay").asInt());
        assertEquals(2, c2.get("perDay").asInt());
        assertFalse(c1.get("deckDeleted").asBoolean());

        JsonNode days = draft.get("days");
        assertEquals(10, days.size());
        assertEquals(1, days.get(0).get("dayIndex").asInt());
        assertEquals(c1.get("id").asText(), days.get(0).get("tasks").get(0).get("chapterId").asText());
        assertEquals(1, days.get(0).get("tasks").get(0).get("fromPos").asInt());
        assertEquals(2, days.get(0).get("tasks").get(0).get("toPos").asInt());
        assertEquals(c2.get("id").asText(), days.get(6).get("tasks").get(0).get("chapterId").asText());
        assertFalse(draft.has("today")); // chỉ ACTIVE mới có "Hôm nay"

        // Job của lộ trình không hiện trong lịch sử bóc tách
        JsonNode extractions = read(call(get("/api/extractions"), token, null).andExpect(status().isOk()));
        for (JsonNode j : extractions) assertNotEquals(jobId, j.get("id").asText());

        JsonNode list = read(call(get("/api/learning-paths"), token, null).andExpect(status().isOk()));
        assertEquals(1, list.size());
        assertEquals(id, list.get(0).get("id").asText());
        assertFalse(list.get(0).has("chapters"));
        assertFalse(list.get(0).has("days"));
    }

    @Test
    void fallback_splits_by_days_when_no_chapters() throws Exception {
        List<AiDtos.Item> six = new ArrayList<>();
        for (int i = 1; i <= 6; i++) six.add(vocab(i, "語" + i, null, false));
        stubAnalyze(six, Map.of("vocab", 6, "grammar", 0, "chaptersDetected", false));
        String token = newUser();

        String id = read(postPath(token, TEXT, "3", null).andExpect(status().isAccepted())).get("id").asText();
        JsonNode draft = awaitDraft(token, id);
        assertEquals("DRAFT", draft.get("status").asText(), draft.toString());
        assertFalse(draft.get("chaptersDetected").asBoolean());
        JsonNode chapters = draft.get("chapters");
        assertEquals(3, chapters.size());
        for (int i = 0; i < 3; i++) {
            assertEquals("Ngày " + (i + 1), chapters.get(i).get("title").asText());
            assertEquals(2, chapters.get(i).get("cardCount").asInt());
            assertEquals(i + 1, chapters.get(i).get("dayFrom").asInt());
        }

        String id2 = read(postPath(token, TEXT, "20", null).andExpect(status().isAccepted())).get("id").asText();
        JsonNode weeks = awaitDraft(token, id2).get("chapters");
        assertEquals(3, weeks.size());
        assertEquals("Tuần 1 (ngày 1–7)", weeks.get(0).get("title").asText());
        assertEquals("Tuần 2 (ngày 8–14)", weeks.get(1).get("title").asText());
        assertEquals("Tuần 3 (ngày 15–20)", weeks.get(2).get("title").asText());
    }

    @Test
    void fallback_splits_only_selected_items_so_titles_match_ranges() throws Exception {
        List<AiDtos.Item> six = new ArrayList<>();
        for (int i = 1; i <= 6; i++) six.add(vocab(i, "語" + i, null, i <= 2)); // 2 item đầu suspect -> bỏ chọn
        stubAnalyze(six, Map.of("vocab", 6, "grammar", 0, "chaptersDetected", false));
        String token = newUser();

        String id = read(postPath(token, TEXT, "20", null).andExpect(status().isAccepted())).get("id").asText();
        JsonNode draft = awaitDraft(token, id);
        assertEquals("DRAFT", draft.get("status").asText(), draft.toString());
        JsonNode chapters = draft.get("chapters");
        assertEquals(3, chapters.size()); // 4 item chọn, k = min(3, 4)
        int[] cards = {2, 1, 1};
        for (int i = 0; i < 3; i++) {
            JsonNode c = chapters.get(i);
            assertEquals(cards[i], c.get("cardCount").asInt());
            String expected = "Tuần " + (i + 1) + " (ngày " + c.get("dayFrom").asInt() + "–" + c.get("dayTo").asInt() + ")";
            assertEquals(expected, c.get("title").asText()); // tên chương khớp dải ngày tính sống
        }
        assertEquals(1, chapters.get(0).get("dayFrom").asInt());
        assertEquals(20, chapters.get(2).get("dayTo").asInt());
    }

    @Test
    void fallback_with_no_selected_items_keeps_one_chapter_draft() throws Exception {
        List<AiDtos.Item> two = List.of(vocab(1, "疑1", null, true), vocab(2, "疑2", null, true));
        stubAnalyze(two, Map.of("vocab", 2, "grammar", 0, "chaptersDetected", false));
        String token = newUser();

        String id = read(postPath(token, TEXT, "5", null).andExpect(status().isAccepted())).get("id").asText();
        JsonNode draft = awaitDraft(token, id);
        assertEquals("DRAFT", draft.get("status").asText(), draft.toString());
        assertEquals(1, draft.get("chapters").size());
        assertEquals("Ngày 1", draft.get("chapters").get(0).get("title").asText());
        assertEquals(0, draft.get("chapters").get(0).get("cardCount").asInt());
    }

    @Test
    void ai_failure_marks_path_failed_and_limit_is_shared() throws Exception {
        Mockito.when(ai.analyze(anyString(), any(), any()))
                .thenThrow(new AiServiceClient.AiServiceException("Không kết nối được dịch vụ AI (phân tích từ vựng)."));
        String token = newUser();
        String id = read(postPath(token, TEXT, "5", null).andExpect(status().isAccepted())).get("id").asText();
        JsonNode failed = awaitDraft(token, id);
        assertEquals("FAILED", failed.get("status").asText());
        assertTrue(failed.get("errorMessage").asText().contains("dịch vụ AI"), failed.toString());

        // Hạn mức ngày dùng chung với bóc tách (test: 3 lượt)
        String other = newUser();
        postExtraction(other).andExpect(status().isAccepted());
        postExtraction(other).andExpect(status().isAccepted());
        postPath(other, TEXT, "5", null).andExpect(status().isAccepted());
        postPath(other, TEXT, "5", null).andExpect(status().isTooManyRequests());
    }

    @Test
    void validation_and_privacy_read() throws Exception {
        String token = newUser();
        postPath(token, TEXT, "0", null).andExpect(status().isBadRequest());
        postPath(token, TEXT, "366", null).andExpect(status().isBadRequest());
        postPath(token, TEXT, "abc", null).andExpect(status().isBadRequest());
        postPath(token, TEXT, null, null).andExpect(status().isBadRequest());
        // Không gửi tài liệu
        postPath(token, null, "5", null).andExpect(status().isBadRequest());

        String id = read(postPath(token, TEXT, "5", null).andExpect(status().isAccepted())).get("id").asText();
        String stranger = newUser();
        call(get("/api/learning-paths/" + id), stranger, null).andExpect(status().isNotFound());
        assertEquals(0, read(call(get("/api/learning-paths"), stranger, null).andExpect(status().isOk())).size());
    }
}
