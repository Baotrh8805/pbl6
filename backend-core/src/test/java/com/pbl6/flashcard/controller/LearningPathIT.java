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

    // ---------- sửa bản nháp, kích hoạt, xoá ----------

    private static final String BASE = "/api/learning-paths/";

    /** Tạo lộ trình và đợi bản nháp; trả về nội dung bản nháp. */
    private JsonNode draftPath(String token, String days, String title) throws Exception {
        String id = read(postPath(token, TEXT, days, title).andExpect(status().isAccepted())).get("id").asText();
        JsonNode draft = awaitDraft(token, id);
        assertEquals("DRAFT", draft.get("status").asText(), draft.toString());
        return draft;
    }

    private JsonNode activate(String token, String id, Map<String, Object> body) throws Exception {
        return read(call(post(BASE + id + "/activate"), token, body).andExpect(status().isCreated()));
    }

    private static JsonNode deckByTitle(JsonNode decks, String title) {
        for (JsonNode d : decks) if (title.equals(d.get("title").asText())) return d;
        throw new AssertionError("không thấy bộ thẻ " + title + " trong " + decks);
    }

    @Test
    void draft_edit_then_activate() throws Exception {
        // Chương 2: mẫu ngữ pháp đứng TRƯỚC từ vựng trong tài liệu -> bộ thẻ vẫn vocab trước, grammar sau
        List<AiDtos.Item> list = new ArrayList<>();
        int pos = 0;
        for (int i = 0; i < 12; i++) list.add(vocab(++pos, "語" + pos, 1, false));
        list.add(vocab(++pos, "疑" + pos, 1, true));
        list.add(grammar(++pos, "〜ます", 2));
        for (int i = 0; i < 7; i++) list.add(vocab(++pos, "語" + pos, 2, false));
        stubAnalyze(list, Map.of("vocab", 20, "grammar", 1, "chaptersDetected", true, "chapters", List.of(
                Map.of("index", 1, "title", "第1課 あいさつ"), Map.of("index", 2, "title", "第2課 かいもの"))));
        String token = newUser();
        JsonNode draft = draftPath(token, "10", "Minna");
        String id = draft.get("id").asText();
        String jobId = draft.get("jobId").asText();
        String c1 = draft.get("chapters").get(0).get("id").asText();
        String c2 = draft.get("chapters").get(1).get("id").asText();

        // Thẻ của chương 1 (cả item bỏ chọn), theo vị trí tài liệu
        JsonNode items1 = read(call(get(BASE + id + "/chapters/" + c1 + "/items"), token, null).andExpect(status().isOk()));
        assertEquals(13, items1.size());
        assertEquals("語1", items1.get(0).get("term").asText());
        assertFalse(items1.get(12).get("selected").asBoolean());

        // Bỏ chọn 語1 -> chương 1 còn 11 thẻ
        JsonNode all = read(call(patch(BASE + id + "/items"), token,
                List.of(Map.of("id", items1.get(0).get("id").asText(), "selected", false))).andExpect(status().isOk()));
        assertEquals(21, all.size());
        JsonNode after = read(call(get(BASE + id), token, null).andExpect(status().isOk()));
        assertEquals(11, after.get("chapters").get(0).get("cardCount").asInt());

        // Đổi tên chương 2
        JsonNode renamed = read(call(patch(BASE + id + "/chapters/" + c2), token, Map.of("title", "  Mua sắm ")).andExpect(status().isOk()));
        assertEquals("Mua sắm", renamed.get("chapters").get(1).get("title").asText());
        call(patch(BASE + id + "/chapters/" + c2), token, Map.of("title", " ")).andExpect(status().isBadRequest());

        // 4 ngày: allocate([11, 8], 4) -> 1–2, 3–4
        JsonNode four = read(call(patch(BASE + id), token, Map.of("totalDays", 4)).andExpect(status().isOk()));
        assertEquals(4, four.get("totalDays").asInt());
        assertEquals(2, four.get("chapters").get(0).get("dayTo").asInt());
        assertEquals(3, four.get("chapters").get(1).get("dayFrom").asInt());
        assertEquals(4, four.get("chapters").get(1).get("dayTo").asInt());

        JsonNode active = activate(token, id, Map.of("startDate", "2026-11-01"));
        assertEquals("ACTIVE", active.get("status").asText());
        assertEquals("2026-11-01", active.get("startDate").asText());
        assertTrue(active.has("activatedAt"));
        String folderId = active.get("folderId").asText();
        JsonNode ch = active.get("chapters");
        assertEquals(2, ch.size());
        assertEquals(11, ch.get(0).get("cardCount").asInt());
        assertEquals(8, ch.get(1).get("cardCount").asInt());
        String d1 = ch.get(0).get("deckId").asText();
        String d2 = ch.get(1).get("deckId").asText();

        JsonNode folder = read(call(get("/api/folders/" + folderId), token, null).andExpect(status().isOk()));
        assertEquals("Minna", folder.get("title").asText());
        assertTrue(folder.get("metadata").asText().contains("\"learningPathId\":\"" + id + "\""), folder.toString());
        assertEquals("N5", folder.get("level").asText());

        JsonNode decks = read(call(get("/api/decks").param("folderId", folderId), token, null).andExpect(status().isOk()));
        assertEquals(2, decks.size());
        JsonNode deck1 = deckByTitle(decks, "第1課 あいさつ");
        JsonNode deck2 = deckByTitle(decks, "Mua sắm");
        assertEquals(d1, deck1.get("id").asText());
        assertEquals(d2, deck2.get("id").asText());
        for (JsonNode d : decks) {
            assertEquals("goi", d.get("category").asText());
            assertEquals("N5", d.get("level").asText());
        }
        assertTrue(deck1.get("description").asText().startsWith("Chương 1"), deck1.get("description").asText());
        assertEquals("Chương 2 của lộ trình Minna", deck2.get("description").asText());
        assertEquals(11, deck1.get("cards").size());
        assertEquals("語2", deck1.get("cards").get(0).get("term").asText());
        JsonNode cards2 = deck2.get("cards");
        assertEquals(8, cards2.size());
        for (int i = 0; i < 7; i++) {
            assertEquals("語" + (15 + i), cards2.get(i).get("term").asText());
            assertEquals("vocab", cards2.get(i).get("kind").asText());
        }
        assertEquals("〜ます", cards2.get(7).get("term").asText());
        assertEquals("grammar", cards2.get(7).get("kind").asText());

        // Job ghi nhận bộ thẻ đã tạo
        JsonNode job = read(call(get("/api/extractions/" + jobId), token, null).andExpect(status().isOk()));
        List<String> deckIds = new ArrayList<>();
        job.get("deckIds").forEach(n -> deckIds.add(n.asText()));
        assertTrue(deckIds.containsAll(List.of(d1, d2)), job.toString());

        // Ngày 2: chương 1 (1–2, perDay ceil(11/2) = 6) -> thẻ 7..11
        JsonNode day2 = read(call(get(BASE + id).param("date", "2026-11-02"), token, null).andExpect(status().isOk()));
        assertEquals(2, day2.get("today").get("dayIndex").asInt());
        assertEquals("during", day2.get("today").get("state").asText());
        JsonNode task = day2.get("today").get("tasks").get(0);
        assertEquals(d1, task.get("deckId").asText());
        assertEquals(7, task.get("fromPos").asInt());
        assertEquals(11, task.get("toPos").asInt());

        // Sau khi kích hoạt: không sửa chương nữa, nhưng đổi số ngày tính lại dải trên số thẻ đã chốt
        JsonNode five = read(call(patch(BASE + id), token, Map.of("totalDays", 5, "title", "Minna mới")).andExpect(status().isOk()));
        assertEquals("Minna mới", five.get("title").asText());
        assertEquals(5, five.get("chapters").get(1).get("dayTo").asInt());

        call(delete(BASE + id), token, null).andExpect(status().isNoContent());
        call(get(BASE + id), token, null).andExpect(status().isNotFound());
        call(get("/api/extractions/" + jobId), token, null).andExpect(status().isNotFound());
        call(get("/api/decks/" + d1), token, null).andExpect(status().isOk());
        call(get("/api/folders/" + folderId), token, null).andExpect(status().isOk());
    }

    @Test
    void merge_up_moves_items_and_renumbers() throws Exception {
        List<AiDtos.Item> list = new ArrayList<>();
        for (int i = 1; i <= 6; i++) list.add(vocab(i, "語" + i, (i + 1) / 2, false));
        stubAnalyze(list, Map.of("vocab", 6, "grammar", 0, "chaptersDetected", true, "chapters", List.of(
                Map.of("index", 1, "title", "Bài 1"), Map.of("index", 2, "title", "Bài 2"),
                Map.of("index", 3, "title", "Bài 3"))));
        String token = newUser();
        JsonNode draft = draftPath(token, "6", null);
        String id = draft.get("id").asText();
        JsonNode ch = draft.get("chapters");
        assertEquals(3, ch.size());
        String c1 = ch.get(0).get("id").asText();
        String c2 = ch.get(1).get("id").asText();
        String c3 = ch.get(2).get("id").asText();

        JsonNode merged = read(call(post(BASE + id + "/chapters/" + c2 + "/merge-up"), token, null).andExpect(status().isOk()));
        JsonNode mc = merged.get("chapters");
        assertEquals(2, mc.size());
        assertEquals(c1, mc.get(0).get("id").asText());
        assertEquals(1, mc.get(0).get("position").asInt());
        assertEquals(4, mc.get(0).get("cardCount").asInt());
        assertEquals(c3, mc.get(1).get("id").asText());
        assertEquals(2, mc.get(1).get("position").asInt());
        assertEquals(2, mc.get(1).get("cardCount").asInt());
        JsonNode items1 = read(call(get(BASE + id + "/chapters/" + c1 + "/items"), token, null).andExpect(status().isOk()));
        assertEquals(4, items1.size());
        assertEquals("語4", items1.get(3).get("term").asText());

        call(post(BASE + id + "/chapters/" + c2 + "/merge-up"), token, null).andExpect(status().isNotFound());
        JsonNode first = read(call(post(BASE + id + "/chapters/" + c1 + "/merge-up"), token, null)
                .andExpect(status().isBadRequest()));
        assertEquals("Chương đầu tiên không có chương trước để gộp.", first.get("message").asText(), first.toString());
    }

    @Test
    void conflicts_and_privacy_write() throws Exception {
        String token = newUser();
        JsonNode draft = draftPath(token, "10", null);
        String id = draft.get("id").asText();
        String c1 = draft.get("chapters").get(0).get("id").asText();

        String stranger = newUser();
        call(patch(BASE + id), stranger, Map.of("title", "x")).andExpect(status().isNotFound());
        call(patch(BASE + id + "/chapters/" + c1), stranger, Map.of("title", "x")).andExpect(status().isNotFound());
        call(post(BASE + id + "/activate"), stranger, Map.of()).andExpect(status().isNotFound());
        call(delete(BASE + id), stranger, null).andExpect(status().isNotFound());
        call(get(BASE + id + "/chapters/" + c1 + "/items"), stranger, null).andExpect(status().isNotFound());
        // Chương của lộ trình khác -> 404
        call(patch(BASE + id + "/chapters/" + java.util.UUID.randomUUID()), token, Map.of("title", "x"))
                .andExpect(status().isNotFound());

        activate(token, id, Map.of());
        JsonNode again = read(call(post(BASE + id + "/activate"), token, Map.of()).andExpect(status().isConflict()));
        assertEquals("Chỉ sửa được khi lộ trình đang ở bước xem trước.", again.get("message").asText(), again.toString());
        call(patch(BASE + id + "/chapters/" + c1), token, Map.of("title", "x")).andExpect(status().isConflict());
        call(post(BASE + id + "/chapters/" + c1 + "/merge-up"), token, null).andExpect(status().isConflict());
        call(patch(BASE + id + "/items"), token, List.of()).andExpect(status().isConflict());
        call(delete(BASE + id), stranger, null).andExpect(status().isNotFound());
        call(get(BASE + id), token, null).andExpect(status().isOk());

        // Đang xử lý -> 409
        String other = newUser();
        java.util.concurrent.CountDownLatch gate = new java.util.concurrent.CountDownLatch(1);
        AiDtos.AnalyzeResult result = new AiDtos.AnalyzeResult(chapterItems(), Map.of("chaptersDetected", false), false);
        Mockito.doAnswer(inv -> {
            gate.await(10, java.util.concurrent.TimeUnit.SECONDS);
            return result;
        }).when(ai).analyze(anyString(), any(), any());
        String busy = read(postPath(other, TEXT, "5", null).andExpect(status().isAccepted())).get("id").asText();
        try {
            JsonNode res = read(call(patch(BASE + busy), other, Map.of("title", "x")).andExpect(status().isConflict()));
            assertEquals("Lộ trình đang được xử lý.", res.get("message").asText(), res.toString());
            call(post(BASE + busy + "/activate"), other, Map.of()).andExpect(status().isConflict());
        } finally {
            gate.countDown();
        }
        assertEquals("DRAFT", awaitDraft(other, busy).get("status").asText());

        // Lỗi -> 400 khi sửa
        Mockito.reset(ai);
        stubAi();
        Mockito.when(ai.analyze(anyString(), any(), any()))
                .thenThrow(new AiServiceClient.AiServiceException("Không kết nối được dịch vụ AI (phân tích từ vựng)."));
        String third = newUser();
        String failed = read(postPath(third, TEXT, "5", null).andExpect(status().isAccepted())).get("id").asText();
        assertEquals("FAILED", awaitDraft(third, failed).get("status").asText());
        JsonNode res = read(call(patch(BASE + failed), third, Map.of("title", "x")).andExpect(status().isBadRequest()));
        assertEquals("Lộ trình đã lỗi, hãy tạo lại.", res.get("message").asText(), res.toString());
        call(delete(BASE + failed), third, null).andExpect(status().isNoContent());
    }

    @Test
    void activate_without_selected_cards_is_rejected_and_empty_chapters_dropped() throws Exception {
        String token = newUser();
        JsonNode draft = draftPath(token, "10", null);
        String id = draft.get("id").asText();
        String c1 = draft.get("chapters").get(0).get("id").asText();
        String c2 = draft.get("chapters").get(1).get("id").asText();

        // Bỏ chọn hết chương 1 -> kích hoạt chỉ còn chương 2, position 1
        JsonNode items1 = read(call(get(BASE + id + "/chapters/" + c1 + "/items"), token, null).andExpect(status().isOk()));
        List<Map<String, Object>> off = new ArrayList<>();
        items1.forEach(i -> off.add(Map.of("id", i.get("id").asText(), "selected", false)));
        call(patch(BASE + id + "/items"), token, off).andExpect(status().isOk());

        JsonNode active = activate(token, id, Map.of("totalDays", 3));
        JsonNode ch = active.get("chapters");
        assertEquals(1, ch.size());
        assertEquals(c2, ch.get(0).get("id").asText());
        assertEquals(1, ch.get(0).get("position").asInt());
        assertEquals(1, ch.get(0).get("dayFrom").asInt());
        assertEquals(3, ch.get(0).get("dayTo").asInt());
        // item của chương bị bỏ vẫn gắn vào chương còn lại
        assertEquals(21, read(call(get(BASE + id + "/chapters/" + c2 + "/items"), token, null)
                .andExpect(status().isOk())).size());

        // Không còn thẻ chọn nào -> 400
        String other = newUser();
        JsonNode d2 = draftPath(other, "5", null);
        String id2 = d2.get("id").asText();
        List<Map<String, Object>> none = new ArrayList<>();
        for (JsonNode c : d2.get("chapters")) {
            read(call(get(BASE + id2 + "/chapters/" + c.get("id").asText() + "/items"), other, null))
                    .forEach(i -> none.add(Map.of("id", i.get("id").asText(), "selected", false)));
        }
        call(patch(BASE + id2 + "/items"), other, none).andExpect(status().isOk());
        JsonNode res = read(call(post(BASE + id2 + "/activate"), other, Map.of()).andExpect(status().isBadRequest()));
        assertEquals("Chưa chọn thẻ nào để tạo lộ trình.", res.get("message").asText(), res.toString());
        assertEquals("DRAFT", read(call(get(BASE + id2), other, null)).get("status").asText());
        assertEquals(2, read(call(get(BASE + id2), other, null)).get("chapters").size());
    }

    @Test
    void deleting_deck_or_folder_keeps_path_readable() throws Exception {
        String token = newUser();
        String id = draftPath(token, "10", null).get("id").asText();
        JsonNode active = activate(token, id, Map.of("startDate", "2026-11-01"));
        String d1 = active.get("chapters").get(0).get("deckId").asText();
        String folderId = active.get("folderId").asText();

        call(delete("/api/decks/" + d1), token, null).andExpect(status().isNoContent());
        JsonNode p = read(call(get(BASE + id).param("date", "2026-11-01"), token, null).andExpect(status().isOk()));
        JsonNode c1 = p.get("chapters").get(0);
        assertTrue(c1.path("deckId").isMissingNode() || c1.get("deckId").isNull(), c1.toString());
        assertTrue(c1.get("deckDeleted").asBoolean());
        assertFalse(p.get("chapters").get(1).get("deckDeleted").asBoolean());
        assertEquals(0, p.get("today").get("tasks").size(), p.toString()); // ngày 1 chỉ có chương 1

        call(delete("/api/folders/" + folderId), token, null).andExpect(status().isNoContent());
        JsonNode p2 = read(call(get(BASE + id), token, null).andExpect(status().isOk()));
        assertFalse(p2.has("folderId"));
        assertEquals("ACTIVE", p2.get("status").asText());
    }

    @Test
    void folder_name_conflict_gets_suffix() throws Exception {
        String token = newUser();
        call(post("/api/folders"), token, Map.of("title", "minna", "accessType", "private")).andExpect(status().isCreated());
        String id = draftPath(token, "10", "Minna").get("id").asText();
        String folderId = activate(token, id, Map.of()).get("folderId").asText();
        JsonNode folder = read(call(get("/api/folders/" + folderId), token, null).andExpect(status().isOk()));
        assertEquals("Minna (2)", folder.get("title").asText());
    }

    @Test
    void extraction_delete_refuses_path_job() throws Exception {
        String token = newUser();
        String jobId = draftPath(token, "5", null).get("jobId").asText();
        call(delete("/api/extractions/" + jobId), token, null).andExpect(status().isConflict());
    }

    @Test
    void extraction_endpoints_refuse_path_job_but_path_items_patch_works() throws Exception {
        String token = newUser();
        JsonNode draft = draftPath(token, "5", null);
        String id = draft.get("id").asText();
        String jobId = draft.get("jobId").asText();
        String c1 = draft.get("chapters").get(0).get("id").asText();
        String itemId = read(call(get(BASE + id + "/chapters/" + c1 + "/items"), token, null)
                .andExpect(status().isOk())).get(0).get("id").asText();
        String ext = "/api/extractions/" + jobId;
        String msg = "Lượt này thuộc một lộ trình học, hãy thao tác từ trang lộ trình.";

        JsonNode res = read(call(post(ext + "/rerun"), token, null).andExpect(status().isConflict()));
        assertEquals(msg, res.get("message").asText(), res.toString());
        call(put(ext + "/text"), token, Map.of("text", "第1課\nあ。")).andExpect(status().isConflict());
        call(post(ext + "/enrich"), token, null).andExpect(status().isConflict());
        call(patch(ext + "/items"), token, List.of(Map.of("id", itemId, "selected", false)))
                .andExpect(status().isConflict());
        call(post(ext + "/decks"), token, Map.of("vocab", Map.of("title", "x"))).andExpect(status().isConflict());

        // Bản nháp còn nguyên 2 chương; sửa item qua lộ trình vẫn chạy
        call(patch(BASE + id + "/items"), token, List.of(Map.of("id", itemId, "selected", false)))
                .andExpect(status().isOk());
        JsonNode after = read(call(get(BASE + id), token, null).andExpect(status().isOk()));
        assertEquals(2, after.get("chapters").size());
        assertEquals(11, after.get("chapters").get(0).get("cardCount").asInt());
    }

    @Test
    void draft_folds_chapters_without_items() throws Exception {
        List<AiDtos.Item> list = new ArrayList<>();
        for (int i = 1; i <= 4; i++) list.add(vocab(i, "語" + i, i <= 2 ? 1 : 3, false));
        stubAnalyze(list, Map.of("vocab", 4, "grammar", 0, "chaptersDetected", true, "chapters", List.of(
                Map.of("index", 1, "title", "Bài 1"), Map.of("index", 2, "title", "Bài 2"),
                Map.of("index", 3, "title", "Bài 3"))));
        String token = newUser();
        JsonNode ch = draftPath(token, "4", null).get("chapters");
        assertEquals(2, ch.size(), ch.toString());
        assertEquals("Bài 1", ch.get(0).get("title").asText());
        assertEquals("Bài 3", ch.get(1).get("title").asText());
        assertEquals(1, ch.get(0).get("position").asInt());
        assertEquals(2, ch.get(1).get("position").asInt());
        assertEquals(2, ch.get(1).get("cardCount").asInt());
    }

    @Test
    void active_total_days_change_skips_deleted_deck_chapters() throws Exception {
        String token = newUser();
        String id = draftPath(token, "10", null).get("id").asText();
        JsonNode active = activate(token, id, Map.of("startDate", "2026-11-01"));
        String d1 = active.get("chapters").get(0).get("deckId").asText();
        call(delete("/api/decks/" + d1), token, null).andExpect(status().isNoContent());

        JsonNode four = read(call(patch(BASE + id), token, Map.of("totalDays", 4)).andExpect(status().isOk()));
        JsonNode c1 = four.get("chapters").get(0);
        JsonNode c2 = four.get("chapters").get(1);
        // chương mất bộ thẻ giữ dải cũ (1–6), không chiếm ngày; chương còn lại dùng hết 4 ngày
        assertEquals(1, c1.get("dayFrom").asInt());
        assertEquals(6, c1.get("dayTo").asInt());
        assertEquals(1, c2.get("dayFrom").asInt());
        assertEquals(4, c2.get("dayTo").asInt());
    }

    @Test
    void listener_never_breaks_job() throws Exception {
        // stats.chapters sai kiểu -> buildDraft ném -> lộ trình FAILED, job vẫn DONE
        stubAnalyze(chapterItems(), Map.of("vocab", 20, "grammar", 1, "chaptersDetected", true, "chapters", "oops"));
        String token = newUser();
        JsonNode created = read(postPath(token, TEXT, "5", null).andExpect(status().isAccepted()));
        JsonNode failed = awaitDraft(token, created.get("id").asText());
        assertEquals("FAILED", failed.get("status").asText());
        assertEquals("Không dựng được lộ trình từ kết quả bóc tách.", failed.get("errorMessage").asText());
        JsonNode job = read(call(get("/api/extractions/" + created.get("jobId").asText()), token, null)
                .andExpect(status().isOk()));
        assertEquals("DONE", job.get("status").asText());
    }
}
