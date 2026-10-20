package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.config.AsyncConfig;
import com.pbl6.flashcard.dto.extraction.AiDtos;
import com.pbl6.flashcard.model.LearningPath;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.service.AiServiceClient;
import com.pbl6.flashcard.service.LearningPathService;
import com.pbl6.flashcard.service.SettingsService;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.mock.web.MockPart;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import com.pbl6.flashcard.repository.LearningPathRepository;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Lộ trình học tập với ai-service giả lập: tạo -> job chạy nền -> bản nháp chương + lịch ngày. */
class LearningPathIT extends IntegrationTest {

    @MockitoBean
    private AiServiceClient ai;

    /**
     * Spy trên executor của worker (không spy ExtractionWorker: bean ấy là proxy @Async, stub trên target chỉ ném trong thread nền).
     * Stub submit() ném RejectedExecutionException = "hàng đợi đầy" ngay ở thread web, đúng nhánh dispatch → 429. Mockito reset sau
     * mỗi test (MockReset.AFTER) nên các test khác dùng executor thật.
     */
    @MockitoSpyBean(name = AsyncConfig.EXTRACTION_EXECUTOR)
    private ThreadPoolTaskExecutor extractionExecutor;

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
        Mockito.when(ai.extractText(any(), any(), any(), any(), any())).thenAnswer(inv -> {
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
        // LP-01: bản xem trước = lịch sau kích hoạt (plan 2.0, IT-01): 20 thẻ / 10 ngày -> {3, 2, 2, 2, 3, 2, 2, 2, 2},
        // chương 1 ngày 1–5, chương 2 ngày 6–9 (ngày 10 thành ngày ôn)
        assertEquals(1, c1.get("dayFrom").asInt());
        assertEquals(5, c1.get("dayTo").asInt());
        assertEquals(6, c2.get("dayFrom").asInt());
        assertEquals(9, c2.get("dayTo").asInt());
        assertEquals(3, c1.get("perDay").asInt());
        assertEquals(2, c2.get("perDay").asInt());
        assertFalse(c1.get("deckDeleted").asBoolean());

        JsonNode days = draft.get("days");
        assertEquals(10, days.size());
        assertEquals(1, days.get(0).get("dayIndex").asInt());
        assertEquals(c1.get("id").asText(), days.get(0).get("tasks").get(0).get("chapterId").asText());
        assertEquals(1, days.get(0).get("tasks").get(0).get("fromPos").asInt());
        assertEquals(3, days.get(0).get("tasks").get(0).get("toPos").asInt());
        assertEquals(3, days.get(0).get("tasks").get(0).get("count").asInt());
        assertFalse(days.get(0).get("tasks").get(0).has("cardIds")); // thẻ chưa tồn tại
        assertEquals(c2.get("id").asText(), days.get(6).get("tasks").get(0).get("chapterId").asText());
        assertEquals(0, days.get(9).get("tasks").size());
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

        // > 14 ngày: mỗi tuần một chương, tên theo dải ngày của lịch xem trước (= lịch sau kích hoạt): 6 thẻ / 20 ngày dồn về
        // đầu (quota kẹp 1), đuôi 1 thẻ của chương đang học được học nốt trong ngày -> 2, 2 rồi 1 + 1
        String id2 = read(postPath(token, TEXT, "20", null).andExpect(status().isAccepted())).get("id").asText();
        JsonNode weeks = awaitDraft(token, id2).get("chapters");
        assertEquals(3, weeks.size());
        assertEquals("Tuần 1 (ngày 1)", weeks.get(0).get("title").asText());
        assertEquals("Tuần 2 (ngày 2)", weeks.get(1).get("title").asText());
        assertEquals("Tuần 3 (ngày 3–4)", weeks.get(2).get("title").asText());
        // tên đã ghi xuống DB lúc dựng bản nháp, không chỉ ở response
        assertEquals("Tuần 3 (ngày 3–4)", jdbc.queryForObject("SELECT title FROM learning_path_chapters WHERE path_id = ? "
                + "AND position = 3", String.class, UUID.fromString(id2)));
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
            int from = c.get("dayFrom").asInt();
            int to = c.get("dayTo").asInt();
            String expected = "Tuần " + (i + 1) + " (ngày " + (from == to ? from : from + "–" + to) + ")";
            assertEquals(expected, c.get("title").asText()); // tên chương khớp dải ngày tính sống
        }
        // 4 thẻ / 20 ngày theo plan 2.0: dồn về đầu, mỗi chương một ngày
        assertEquals(1, chapters.get(0).get("dayFrom").asInt());
        assertEquals(3, chapters.get(2).get("dayTo").asInt());
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

    /** Dải ngày của chương dạng "3" / "3–4" (cùng cách viết với tên chương tự sinh). */
    private static String rangeText(JsonNode chapter) {
        int from = chapter.get("dayFrom").asInt();
        int to = chapter.get("dayTo").asInt();
        return from == to ? String.valueOf(from) : from + "–" + to;
    }

    /** Chương rút gọn để so bản nháp với lộ trình đã kích hoạt: id, vị trí, tên, dải ngày, số thẻ, thẻ/ngày. */
    private static List<String> chapterPlan(JsonNode path) {
        List<String> out = new ArrayList<>();
        for (JsonNode c : path.get("chapters")) {
            out.add(c.get("id").asText() + " #" + c.get("position").asInt() + " " + c.get("title").asText() + " ["
                    + rangeText(c) + "] " + c.get("cardCount").asInt() + " thẻ " + c.get("perDay").asInt() + "/ngày");
        }
        return out;
    }

    /** Việc từng ngày rút gọn: ngày lịch + mỗi task (chương, dải vị trí trong bộ, số thẻ). */
    private static List<String> dayPlan(JsonNode path) {
        List<String> out = new ArrayList<>();
        for (JsonNode d : path.get("days")) {
            StringBuilder sb = new StringBuilder(d.get("dayIndex").asInt() + " " + d.get("date").asText() + ":");
            for (JsonNode t : d.get("tasks")) {
                sb.append(' ').append(t.get("chapterId").asText()).append('[').append(t.get("fromPos").asInt()).append('-')
                        .append(t.get("toPos").asInt()).append(" #").append(t.get("count").asInt()).append(']');
            }
            out.add(sb.toString());
        }
        return out;
    }

    /** Như {@link #dayPlan} nhưng chương ghi bằng tên thay cho id: so hai thời điểm khi chương có thể đã được tạo lại với id mới. */
    private static List<String> dayPlanByTitle(JsonNode path) {
        List<String> out = dayPlan(path);
        for (JsonNode c : path.get("chapters")) {
            String chapterId = c.get("id").asText();
            String title = c.get("title").asText();
            out.replaceAll(line -> line.replace(chapterId, title));
        }
        return out;
    }

    /**
     * LP-01: bản xem trước người dùng duyệt phải là lịch họ nhận sau "Tạo lộ trình". Trước đây bản nháp dựng bằng allocate 1.0 (rải
     * thẻ khắp số ngày: 3 bài ít thẻ / 120 ngày thành "Ngày 1–35, 36–83, 84–120", ngày giữa trống) còn kích hoạt dùng plan 2.0
     * (quota kẹp 1, dồn về đầu: mọi thẻ trong ngày 1–19); lộ trình dày 12 ngày cũng lệch từng ngày.
     */
    @Test
    void draft_preview_is_the_schedule_activation_writes() throws Exception { // LP-01
        List<AiDtos.Item> list = new ArrayList<>();
        int pos = 0;
        int[] sizes = {6, 8, 6};
        for (int ch = 1; ch <= 3; ch++) {
            for (int i = 0; i < sizes[ch - 1]; i++) list.add(vocab(++pos, "語" + pos, ch, false));
        }
        list.add(grammar(++pos, "〜ます", 3)); // trọng số 1.2: bản nháp và kích hoạt phải cùng trọng số
        stubAnalyze(list, Map.of("vocab", 20, "grammar", 1, "chaptersDetected", true, "chapters", List.of(
                Map.of("index", 1, "title", "Bài 1"), Map.of("index", 2, "title", "Bài 2"), Map.of("index", 3, "title", "Bài 3"))));
        String token = newUser();
        for (String days : new String[]{"120", "12"}) {
            JsonNode draft = draftPath(token, days, "Ba bài " + days);
            String id = draft.get("id").asText();
            JsonNode active = activate(token, id, Map.of("startDate", draft.get("startDate").asText()));
            assertEquals(chapterPlan(draft), chapterPlan(active), days + " ngày");
            assertEquals(dayPlan(draft), dayPlan(active), days + " ngày");
            assertEquals(draft.get("overCap").asBoolean(), active.has("overflow"), days + " ngày");
            if ("120".equals(days)) {
                // 21 thẻ / 120 ngày: 1 thẻ/ngày, đuôi 1 thẻ của chương 1, 2 học nốt trong ngày -> 1–5, 6–12, 13–19
                JsonNode ch = draft.get("chapters");
                assertEquals("1–5", rangeText(ch.get(0)), ch.toString());
                assertEquals("6–12", rangeText(ch.get(1)), ch.toString());
                assertEquals("13–19", rangeText(ch.get(2)), ch.toString());
                for (int d = 19; d < 120; d++) assertEquals(0, draft.get("days").get(d).get("tasks").size(), "ngày " + (d + 1));
            }
        }
    }

    /**
     * LP-08: không nhận ra chương -> chương "Ngày N" tự sinh; tên phải đi theo dải ngày khi đổi số ngày (trước đây chốt lúc tạo:
     * lộ trình 3 ngày có chương "Ngày 10" nằm ở ngày 3), cả trong DB để bộ thẻ khi kích hoạt mang đúng tên người dùng thấy. Tên
     * người dùng tự đặt và tiêu đề lấy từ tài liệu không bị đụng.
     */
    @Test
    void day_titles_follow_ranges_when_draft_days_change() throws Exception { // LP-08
        List<AiDtos.Item> eight = new ArrayList<>();
        for (int i = 1; i <= 8; i++) eight.add(vocab(i, "語" + i, null, false));
        stubAnalyze(eight, Map.of("vocab", 8, "grammar", 0, "chaptersDetected", false));
        String token = newUser();
        JsonNode draft = draftPath(token, "10", null);
        String id = draft.get("id").asText();
        JsonNode ch = draft.get("chapters");
        assertEquals(8, ch.size());
        for (JsonNode c : ch) assertEquals("Ngày " + rangeText(c), c.get("title").asText(), ch.toString());
        assertEquals("Ngày 8", ch.get(7).get("title").asText()); // 8 thẻ / 10 ngày: một thẻ mỗi ngày 1..8
        String renamed = ch.get(1).get("id").asText();
        call(patch(BASE + id + "/chapters/" + renamed), token, Map.of("title", "Chào hỏi")).andExpect(status().isOk());

        // Chương người dùng tự đặt tên giữ nguyên thẻ của nó; chương tự sinh hai bên chia lại theo xô ngày (chi tiết: kịch bản A ở
        // renamed_chapter_keeps_its_cards_and_longer_path_restores_day_chapters). Tên chương tự sinh khớp dải, không trùng nhau
        JsonNode three = read(call(patch(BASE + id), token, Map.of("totalDays", 3)).andExpect(status().isOk()));
        JsonNode ch3 = three.get("chapters");
        assertEquals(List.of("Ngày 1", "Chào hỏi", "Ngày 1–2", "Ngày 3"), chapterTitles(three));
        assertEquals(8, assertDayChapters(ch3, false, renamed, "Chào hỏi"));
        assertEquals(renamed, ch3.get(1).get("id").asText());
        assertEquals(1, ch3.get(1).get("cardCount").asInt());
        assertEquals("Ngày 3", ch3.get(3).get("title").asText()); // trước đây "Ngày 10"
        assertEquals("Ngày 3", jdbc.queryForObject("SELECT title FROM learning_path_chapters WHERE id = ?", String.class,
                UUID.fromString(ch3.get(3).get("id").asText())));
        assertEquals(4, chapterRows(id));

        // Kích hoạt với số ngày khác: tên chốt theo đúng lịch nhận được, không hai chương cùng dải, bộ thẻ mang đúng tên chương
        JsonNode active = activate(token, id, Map.of("totalDays", 2));
        assertEquals(List.of("Ngày 1", "Chào hỏi", "Ngày 1–2"), chapterTitles(active));
        assertEquals(8, assertDayChapters(active.get("chapters"), false, renamed, "Chào hỏi"));
        for (JsonNode c : active.get("chapters")) {
            JsonNode deck = read(call(get("/api/decks/" + c.get("deckId").asText()), token, null).andExpect(status().isOk()));
            assertEquals(c.get("title").asText(), deck.get("title").asText());
        }

        // Tiêu đề lấy từ tài liệu ("Ngày 5" của giáo trình) giữ nguyên dù chương nằm ở ngày 1
        stubAnalyze(List.of(vocab(1, "語1", 1, false), vocab(2, "語2", 1, false)), Map.of("vocab", 2, "grammar", 0,
                "chaptersDetected", true, "chapters", List.of(Map.of("index", 1, "title", "Ngày 5"))));
        JsonNode detected = draftPath(token, "4", null);
        assertEquals("Ngày 5", detected.get("chapters").get(0).get("title").asText());
        JsonNode detected2 = read(call(patch(BASE + detected.get("id").asText()), token, Map.of("totalDays", 2))
                .andExpect(status().isOk()));
        assertEquals("Ngày 5", detected2.get("chapters").get(0).get("title").asText());
    }

    /**
     * LP-08: chương tự sinh mang đúng tên theo dải ngày ("Ngày a–b", hoặc "Tuần N (ngày a–b)" theo position khi weeks), không hai
     * chương tự sinh nào cùng dải (cùng tên / bộ thẻ trùng tên khi kích hoạt); chương keepId giữ nguyên keepTitle. Trả tổng số thẻ.
     */
    private static int assertDayChapters(JsonNode chapters, boolean weeks, String keepId, String keepTitle) {
        java.util.Set<String> titles = new java.util.HashSet<>();
        java.util.Set<String> ranges = new java.util.HashSet<>();
        int total = 0;
        for (JsonNode c : chapters) {
            total += c.get("cardCount").asInt();
            boolean kept = c.get("id").asText().equals(keepId);
            String expected = kept ? keepTitle
                    : weeks ? "Tuần " + c.get("position").asInt() + " (ngày " + rangeText(c) + ")" : "Ngày " + rangeText(c);
            assertEquals(expected, c.get("title").asText(), chapters.toString());
            assertTrue(titles.add(expected), "trùng tên chương: " + chapters);
            if (!kept) assertTrue(ranges.add(rangeText(c)), "hai chương tự sinh cùng dải: " + chapters);
        }
        return total;
    }

    /** Số dòng learning_path_chapters của lộ trình (chương thừa phải bị xoá thật, không chỉ ẩn khỏi response). */
    private int chapterRows(String pathId) {
        return jdbc.queryForObject("SELECT count(*) FROM learning_path_chapters WHERE path_id = ?", Integer.class,
                UUID.fromString(pathId));
    }

    /**
     * LP-08: bản nháp không nhận ra chương rút 10 → 3 ngày từng giữ 10 chương tự sinh thành "Ngày 1" ×3, "Ngày 2" ×4, "Ngày 3" ×3,
     * kích hoạt tạo 10 bộ thẻ trùng tên. Giờ đổi số ngày chia lại chương từ toàn bộ item như lúc dựng: đúng một chương mỗi ngày
     * (mỗi tuần khi > 14 ngày), kéo dài lại vẫn ra đủ chương, không mất / đảo thẻ nào, bộ thẻ tên duy nhất.
     */
    @Test
    void changing_draft_days_regroups_auto_day_chapters() throws Exception { // LP-08
        List<AiDtos.Item> twenty = new ArrayList<>();
        for (int i = 1; i <= 20; i++) twenty.add(vocab(i, "語" + i, null, false));
        stubAnalyze(twenty, Map.of("vocab", 20, "grammar", 0, "chaptersDetected", false));
        String token = newUser();
        JsonNode draft = draftPath(token, "10", null);
        String id = draft.get("id").asText();
        String jobId = draft.get("jobId").asText();
        JsonNode ch10 = draft.get("chapters");
        assertEquals(List.of("Ngày 1", "Ngày 2", "Ngày 3", "Ngày 4", "Ngày 5", "Ngày 6", "Ngày 7", "Ngày 8", "Ngày 9", "Ngày 10"),
                chapterTitles(draft));
        assertEquals(20, assertDayChapters(ch10, false, null, null));

        JsonNode three = read(call(patch(BASE + id), token, Map.of("totalDays", 3)).andExpect(status().isOk()));
        JsonNode ch3 = three.get("chapters");
        assertEquals(List.of("Ngày 1", "Ngày 2", "Ngày 3"), chapterTitles(three));
        assertEquals(20, assertDayChapters(ch3, false, null, null));
        int[] sizes = {7, 7, 6}; // chia đều như lúc dựng, chương đầu lớn hơn
        for (int i = 0; i < 3; i++) {
            assertEquals(sizes[i], ch3.get(i).get("cardCount").asInt(), ch3.toString());
            assertEquals(i + 1, ch3.get(i).get("dayFrom").asInt());
            assertEquals(i + 1, ch3.get(i).get("dayTo").asInt());
            assertEquals(ch10.get(i).get("id").asText(), ch3.get(i).get("id").asText()); // giữ id các chương đầu
        }
        // chương thừa bị xoá thật; mọi item gắn vào chương còn sống, theo đúng thứ tự tài liệu
        assertEquals(3, chapterRows(id));
        assertEquals(Integer.valueOf(0), jdbc.queryForObject("SELECT count(*) FROM extraction_items i WHERE i.job_id = ? AND NOT "
                + "EXISTS (SELECT 1 FROM learning_path_chapters c WHERE c.id = i.chapter_id)", Integer.class, UUID.fromString(jobId)));
        List<String> terms = new ArrayList<>();
        for (JsonNode c : ch3) {
            read(call(get(BASE + id + "/chapters/" + c.get("id").asText() + "/items"), token, null).andExpect(status().isOk()))
                    .forEach(i -> terms.add(i.get("term").asText()));
        }
        List<String> expectedTerms = new ArrayList<>();
        for (int i = 1; i <= 20; i++) expectedTerms.add("語" + i);
        assertEquals(expectedTerms, terms);

        // Kéo dài lại: lại đủ một chương mỗi ngày (không kẹt ở 3 chương "Ngày 1–4", "Ngày 4–7"...)
        JsonNode ten = read(call(patch(BASE + id), token, Map.of("totalDays", 10)).andExpect(status().isOk()));
        assertEquals(chapterTitles(draft), chapterTitles(ten));
        assertEquals(20, assertDayChapters(ten.get("chapters"), false, null, null));

        // > 14 ngày: mỗi tuần một chương, tên theo dải ngày tính sống
        JsonNode weeks = read(call(patch(BASE + id), token, Map.of("totalDays", 21)).andExpect(status().isOk()));
        assertEquals(3, weeks.get("chapters").size(), weeks.get("chapters").toString());
        assertEquals(20, assertDayChapters(weeks.get("chapters"), true, null, null));
        assertEquals(3, chapterRows(id));

        // Kích hoạt: chương = bản xem trước, mỗi chương một bộ thẻ mang đúng tên chương, tên bộ thẻ không trùng, đủ 20 thẻ
        JsonNode active = activate(token, id, Map.of());
        assertEquals(chapterTitles(weeks), chapterTitles(active));
        java.util.Set<String> deckTitles = new java.util.HashSet<>();
        int cards = 0;
        for (JsonNode c : active.get("chapters")) {
            JsonNode deck = read(call(get("/api/decks/" + c.get("deckId").asText()), token, null).andExpect(status().isOk()));
            assertEquals(c.get("title").asText(), deck.get("title").asText());
            assertTrue(deckTitles.add(deck.get("title").asText()), "bộ thẻ trùng tên: " + active.get("chapters"));
            cards += deck.get("cards").size();
        }
        assertEquals(20, cards);
    }

    /**
     * Bố cục bản nháp KHÔNG kèm id, đọc mục qua API như client: mỗi chương "tên [dải ngày] số thẻ: mục…" (mục bỏ chọn có dấu "-")
     * — để so hai thời điểm khi chương có thể đã bị xoá rồi tạo lại với id mới.
     */
    private List<String> layout(String token, JsonNode path) throws Exception {
        List<String> out = new ArrayList<>();
        String id = path.get("id").asText();
        for (JsonNode c : path.get("chapters")) {
            StringBuilder sb = new StringBuilder(c.get("title").asText() + " [" + rangeText(c) + "] "
                    + c.get("cardCount").asInt() + ":");
            for (JsonNode i : read(call(get(BASE + id + "/chapters/" + c.get("id").asText() + "/items"), token, null)
                    .andExpect(status().isOk()))) {
                sb.append(' ').append(i.get("selected").asBoolean() ? "" : "-").append(i.get("term").asText());
            }
            out.add(sb.toString());
        }
        return out;
    }

    /** id item theo term, gom qua mọi chương của bản nháp. */
    private Map<String, String> itemIdsByTerm(String token, JsonNode path) throws Exception {
        Map<String, String> out = new HashMap<>();
        String id = path.get("id").asText();
        for (JsonNode c : path.get("chapters")) {
            read(call(get(BASE + id + "/chapters/" + c.get("id").asText() + "/items"), token, null).andExpect(status().isOk()))
                    .forEach(i -> out.put(i.get("term").asText(), i.get("id").asText()));
        }
        return out;
    }

    /** Không item nào của job trỏ tới chương đã xoá (chương thừa phải xoá thật và item của nó phải sang chương còn sống). */
    private void assertNoOrphanItems(String jobId) {
        assertEquals(Integer.valueOf(0), jdbc.queryForObject("SELECT count(*) FROM extraction_items i WHERE i.job_id = ? AND NOT "
                + "EXISTS (SELECT 1 FROM learning_path_chapters c WHERE c.id = i.chapter_id)", Integer.class, UUID.fromString(jobId)));
    }

    /**
     * LP-01 + LP-08, kịch bản B: chương "Ngày N" là xô ngày của các thẻ ĐANG chọn (hàm thuần của thẻ chọn, số ngày, trần), nên bỏ
     * tick rồi tick lại trả đúng bố cục cũ. Trước đây PATCH /items chỉ gộp chứ không chia lại: bỏ tick 語4, 語6 gộp hai chương, tick
     * lại vẫn còn ít hơn 8 chương và một chương "Ngày a–b". Bản xem trước luôn = lộ trình kích hoạt tạo ra.
     */
    @Test
    void untick_then_retick_round_trips_day_chapters() throws Exception { // LP-01, LP-08
        // 16 từ xen kẽ N5 / N3 (trọng số 1.0 / 1.5 với người học chưa đặt trình độ = N5), 8 ngày: 8 chương 2 thẻ
        List<AiDtos.Item> list = new ArrayList<>();
        for (int i = 1; i <= 16; i++) {
            list.add(new AiDtos.Item("vocab", i, "語" + i, "語" + i, null, null, null, "名詞", "en", "vi", i % 2 == 1 ? "N5" : "N3",
                    1.0, List.of(), 1, null, null, false, null));
        }
        stubAnalyze(list, Map.of("vocab", 16, "grammar", 0, "chaptersDetected", false));
        String token = newUser();
        JsonNode draft = draftPath(token, "8", null);
        String id = draft.get("id").asText();
        String jobId = draft.get("jobId").asText();
        List<String> original = layout(token, draft);
        assertEquals(List.of("Ngày 1 [1] 2: 語1 語2", "Ngày 2 [2] 2: 語3 語4", "Ngày 3 [3] 2: 語5 語6", "Ngày 4 [4] 2: 語7 語8",
                "Ngày 5 [5] 2: 語9 語10", "Ngày 6 [6] 2: 語11 語12", "Ngày 7 [7] 2: 語13 語14", "Ngày 8 [8] 2: 語15 語16"), original);
        Map<String, String> itemIds = itemIdsByTerm(token, draft);
        List<Map<String, Object>> untick = List.of(Map.of("id", itemIds.get("語4"), "selected", false),
                Map.of("id", itemIds.get("語6"), "selected", false));
        List<Map<String, Object>> retick = List.of(Map.of("id", itemIds.get("語4"), "selected", true),
                Map.of("id", itemIds.get("語6"), "selected", true));

        // 14 thẻ chọn vẫn 8 xô ngày: {1, 2}, {3, 5}, {7, 8}, …, {15}, {16} — 語4 / 語6 bỏ chọn đi theo thẻ chọn đứng trước (語3 / 語5).
        // Hai xô cuối một thẻ rơi cùng ngày 7 -> gộp (như kích hoạt sẽ làm), chương 8 bị xoá thật
        assertEquals(16, read(call(patch(BASE + id + "/items"), token, untick).andExpect(status().isOk())).size());
        JsonNode p1 = read(call(get(BASE + id), token, null).andExpect(status().isOk()));
        List<String> unticked = layout(token, p1);
        assertEquals(List.of("Ngày 1 [1] 2: 語1 語2", "Ngày 2 [2] 2: 語3 -語4 語5 -語6", "Ngày 3 [3] 2: 語7 語8",
                "Ngày 4 [4] 2: 語9 語10", "Ngày 5 [5] 2: 語11 語12", "Ngày 6 [6] 2: 語13 語14", "Ngày 7 [7] 2: 語15 語16"), unticked);
        assertEquals(14, assertDayChapters(p1.get("chapters"), false, null, null));
        assertEquals(7, chapterRows(id));
        assertNoOrphanItems(jobId);

        // Tick lại: đúng 8 chương lúc dựng (trước đây vẫn còn chương gộp "Ngày a–b"); 7 chương đầu giữ nguyên id, chương 8 tạo lại
        call(patch(BASE + id + "/items"), token, retick).andExpect(status().isOk());
        JsonNode p2 = read(call(get(BASE + id), token, null).andExpect(status().isOk()));
        assertEquals(original, layout(token, p2));
        assertEquals(chapterPlan(draft).subList(0, 7), chapterPlan(p2).subList(0, 7));
        assertEquals(dayPlanByTitle(draft), dayPlanByTitle(p2));
        assertEquals(8, chapterRows(id));

        // Hàm thuần: bỏ tick lần nữa ra đúng bố cục lần trước; kích hoạt tạo đúng bản xem trước (chương, dải ngày, việc từng ngày)
        call(patch(BASE + id + "/items"), token, untick).andExpect(status().isOk());
        JsonNode preview = read(call(get(BASE + id), token, null).andExpect(status().isOk()));
        assertEquals(unticked, layout(token, preview));
        assertEquals(chapterPlan(p1), chapterPlan(preview));
        JsonNode active = activate(token, id, Map.of());
        assertEquals(chapterPlan(preview), chapterPlan(active));
        assertEquals(dayPlan(preview), dayPlan(active));
    }

    /**
     * LP-08, kịch bản A: chương người dùng đặt tên riêng giữ đúng thẻ của nó — không bao giờ tự nhận thêm thẻ hay bị gộp đi — và
     * kéo dài lại số ngày trả lại một chương tự sinh mỗi ngày. Trước đây rút 10 → 3 ngày nhồi 語3 vào "Chào hỏi", còn PATCH 10 ngày
     * bỏ qua bước chia lại vì có chương đặt tên riêng: vẫn 4 chương, kích hoạt tạo 4 bộ thẻ và "Chào hỏi" chứa từ của chương khác.
     */
    @Test
    void renamed_chapter_keeps_its_cards_and_longer_path_restores_day_chapters() throws Exception { // LP-08
        List<AiDtos.Item> eight = new ArrayList<>();
        for (int i = 1; i <= 8; i++) eight.add(vocab(i, "語" + i, null, false));
        stubAnalyze(eight, Map.of("vocab", 8, "grammar", 0, "chaptersDetected", false));
        String token = newUser();
        JsonNode draft = draftPath(token, "10", null);
        String id = draft.get("id").asText();
        String renamed = draft.get("chapters").get(1).get("id").asText();
        JsonNode named = read(call(patch(BASE + id + "/chapters/" + renamed), token, Map.of("title", "Chào hỏi"))
                .andExpect(status().isOk()));
        List<String> tenDays = List.of("Ngày 1 [1] 1: 語1", "Chào hỏi [2] 1: 語2", "Ngày 3 [3] 1: 語3", "Ngày 4 [4] 1: 語4",
                "Ngày 5 [5] 1: 語5", "Ngày 6 [6] 1: 語6", "Ngày 7 [7] 1: 語7", "Ngày 8 [8] 1: 語8");
        assertEquals(tenDays, layout(token, named)); // đặt tên riêng không xê dịch gì

        // 3 ngày: xô chuẩn {1, 2, 3}, {4, 5, 6}, {7, 8}; "Chào hỏi" giữ đúng 語2 nên xô đầu bị cắt đôi, 語1 / 語2 / 語3 cùng ở ngày 1.
        // 語3 không được nhồi vào "Chào hỏi" (lấn chương người dùng), ghép thẳng với "Ngày 1" thì đảo thứ tự tài liệu -> nhập với
        // chương tự sinh kế nó thành "Ngày 1–2"; tên chương tự sinh vẫn không trùng nhau
        JsonNode three = read(call(patch(BASE + id), token, Map.of("totalDays", 3)).andExpect(status().isOk()));
        assertEquals(List.of("Ngày 1 [1] 1: 語1", "Chào hỏi [1] 1: 語2", "Ngày 1–2 [1–2] 4: 語3 語4 語5 語6",
                "Ngày 3 [3] 2: 語7 語8"), layout(token, three));
        assertEquals(renamed, three.get("chapters").get(1).get("id").asText());
        assertEquals(8, assertDayChapters(three.get("chapters"), false, renamed, "Chào hỏi"));
        assertEquals(4, chapterRows(id));
        assertNoOrphanItems(draft.get("jobId").asText());

        // Kéo dài lại: đủ một chương mỗi ngày như trước khi rút (trước đây kẹt ở 4 chương)
        JsonNode ten = read(call(patch(BASE + id), token, Map.of("totalDays", 10)).andExpect(status().isOk()));
        assertEquals(tenDays, layout(token, ten));
        assertEquals(8, chapterRows(id));

        // Bỏ tick 語8: 7 thẻ chọn còn 7 xô — chương cuối biến mất, 語8 (bỏ chọn) theo 語7; tick lại thì chương ấy trở về
        String w8 = itemIdsByTerm(token, ten).get("語8");
        call(patch(BASE + id + "/items"), token, List.of(Map.of("id", w8, "selected", false))).andExpect(status().isOk());
        JsonNode seven = read(call(get(BASE + id), token, null).andExpect(status().isOk()));
        assertEquals(List.of("Ngày 1 [1] 1: 語1", "Chào hỏi [2] 1: 語2", "Ngày 3 [3] 1: 語3", "Ngày 4 [4] 1: 語4",
                "Ngày 5 [5] 1: 語5", "Ngày 6 [6] 1: 語6", "Ngày 7 [7] 1: 語7 -語8"), layout(token, seven));
        assertEquals(7, chapterRows(id));
        call(patch(BASE + id + "/items"), token, List.of(Map.of("id", w8, "selected", true))).andExpect(status().isOk());
        JsonNode preview = read(call(get(BASE + id), token, null).andExpect(status().isOk()));
        assertEquals(tenDays, layout(token, preview));

        // Kích hoạt: đúng bản xem trước, cả id (không chia lại gì nữa); 8 bộ thẻ, "Chào hỏi" chỉ có 語2
        JsonNode active = activate(token, id, Map.of());
        assertEquals(chapterPlan(preview), chapterPlan(active));
        assertEquals(dayPlan(preview), dayPlan(active));
        assertEquals(8, active.get("chapters").size());
        JsonNode greet = active.get("chapters").get(1);
        assertEquals("Chào hỏi", greet.get("title").asText());
        JsonNode cards = read(call(get("/api/decks/" + greet.get("deckId").asText()), token, null).andExpect(status().isOk()))
                .get("cards");
        assertEquals(1, cards.size(), cards.toString());
        assertEquals("語2", cards.get(0).get("term").asText());
    }

    /** id chương theo thứ tự hiển thị. */
    private static List<String> chapterIds(JsonNode path) {
        List<String> out = new ArrayList<>();
        path.get("chapters").forEach(c -> out.add(c.get("id").asText()));
        return out;
    }

    /**
     * LP-01 + LP-08: bố cục là hàm thuần nên ghi lại với cùng đầu vào không đổi gì, kể cả id chương. Trước đây chương của mỗi run
     * nhận xô theo chỉ số TRƯỚC khi gộp: sau một lần gộp bỏ chương giữa run (kịch bản A rút còn 3 ngày, "Ngày 1–2" nuốt chương kế
     * nó), mọi lần ghi sau đó (đổi tên chương khác, sửa nghĩa một từ, kích hoạt) lại xoá chương cuối run và tạo chương mới id mới:
     * kích hoạt khác bản xem trước, thẻ chương ở client (key = id) đóng lại sau mỗi cú click, đổi tên chương ấy giữa chừng thành 404.
     */
    @Test
    void day_chapter_ids_stay_stable_when_layout_inputs_do_not_change() throws Exception { // LP-01, LP-08
        List<AiDtos.Item> eight = new ArrayList<>();
        for (int i = 1; i <= 8; i++) eight.add(vocab(i, "語" + i, null, false));
        stubAnalyze(eight, Map.of("vocab", 8, "grammar", 0, "chaptersDetected", false));
        String token = newUser();
        JsonNode draft = draftPath(token, "10", null);
        String id = draft.get("id").asText();
        String renamed = draft.get("chapters").get(1).get("id").asText();
        call(patch(BASE + id + "/chapters/" + renamed), token, Map.of("title", "Chào hỏi")).andExpect(status().isOk());
        JsonNode three = read(call(patch(BASE + id), token, Map.of("totalDays", 3)).andExpect(status().isOk()));
        List<String> layout3 = List.of("Ngày 1 [1] 1: 語1", "Chào hỏi [1] 1: 語2", "Ngày 1–2 [1–2] 4: 語3 語4 語5 語6",
                "Ngày 3 [3] 2: 語7 語8");
        assertEquals(layout3, layout(token, three));
        List<String> ids = chapterIds(three);

        // Đổi tên chương người dùng (vẫn là chương tên riêng), sửa nghĩa một từ, đặt lại đúng số ngày: bố cục và id giữ nguyên
        JsonNode renamedAgain = read(call(patch(BASE + id + "/chapters/" + renamed), token, Map.of("title", "Lời chào"))
                .andExpect(status().isOk()));
        assertEquals(ids, chapterIds(renamedAgain));
        String w5 = itemIdsByTerm(token, three).get("語5");
        call(patch(BASE + id + "/items"), token, List.of(Map.of("id", w5, "meaningVi", "nghĩa mới")))
                .andExpect(status().isOk());
        JsonNode afterItems = read(call(get(BASE + id), token, null).andExpect(status().isOk()));
        assertEquals(ids, chapterIds(afterItems));
        assertEquals(layout3.stream().map(l -> l.replace("Chào hỏi", "Lời chào")).toList(), layout(token, afterItems));
        assertEquals(4, chapterRows(id));

        // Bỏ tick 語8 khi chương cuối đang mở: chương cuối vẫn là chương ấy (cùng id), không bị xoá rồi tạo lại
        String w8 = itemIdsByTerm(token, afterItems).get("語8");
        call(patch(BASE + id + "/items"), token, List.of(Map.of("id", w8, "selected", false))).andExpect(status().isOk());
        JsonNode unticked = read(call(get(BASE + id), token, null).andExpect(status().isOk()));
        List<String> untickedIds = chapterIds(unticked);
        assertEquals(ids.subList(0, untickedIds.size()), untickedIds, unticked.get("chapters").toString());
        call(patch(BASE + id + "/items"), token, List.of(Map.of("id", w8, "selected", true))).andExpect(status().isOk());
        JsonNode preview = read(call(get(BASE + id), token, null).andExpect(status().isOk()));
        assertEquals(ids, chapterIds(preview));

        // Kích hoạt không đổi body: đúng bản xem trước, cả id chương và việc từng ngày
        JsonNode active = activate(token, id, Map.of());
        assertEquals(chapterPlan(preview), chapterPlan(active));
        assertEquals(dayPlan(preview), dayPlan(active));
    }

    /** Dựng tay bố cục cũ (trước khi bố cục thành hàm thuần, gộp tay vào "Ngày N" được phép): chương from gộp vào chương into. */
    private void legacyMerge(String pathId, String into, String from, String title) {
        UUID target = UUID.fromString(into);
        UUID gone = UUID.fromString(from);
        int pos = jdbc.queryForObject("SELECT position FROM learning_path_chapters WHERE id = ?", Integer.class, gone);
        jdbc.update("UPDATE extraction_items SET chapter_id = ? WHERE chapter_id = ?", target, gone);
        jdbc.update("DELETE FROM learning_path_chapters WHERE id = ?", gone);
        jdbc.update("UPDATE learning_path_chapters SET position = position - 1 WHERE path_id = ? AND position > ?",
                UUID.fromString(pathId), pos);
        jdbc.update("UPDATE learning_path_chapters SET title = ? WHERE id = ?", title, target);
    }

    /**
     * Phiên bản (xmin) của mọi dòng mà việc chia lại chương có thể chạm tới — lộ trình, chương, item, job — để chứng minh "không ghi
     * gì": mọi UPDATE (kể cả ghi lại đúng giá trị cũ) đổi xmin của dòng, INSERT / DELETE đổi danh sách, còn khoá dòng
     * (SELECT ... FOR UPDATE) thì không đổi gì.
     */
    private List<String> rowVersions(String pathId, String jobId) {
        UUID p = UUID.fromString(pathId);
        UUID j = UUID.fromString(jobId);
        List<String> out = new ArrayList<>();
        out.addAll(jdbc.queryForList("SELECT 'path ' || id || ' ' || xmin::text FROM learning_paths WHERE id = ?",
                String.class, p));
        out.addAll(jdbc.queryForList("SELECT 'chapter ' || id || ' ' || xmin::text FROM learning_path_chapters "
                + "WHERE path_id = ? ORDER BY id", String.class, p));
        out.addAll(jdbc.queryForList("SELECT 'item ' || id || ' ' || xmin::text FROM extraction_items WHERE job_id = ? ORDER BY id",
                String.class, j));
        out.addAll(jdbc.queryForList("SELECT 'job ' || id || ' ' || xmin::text FROM extraction_jobs WHERE id = ?",
                String.class, j));
        return out;
    }

    /**
     * LP-01 + LP-08: bản nháp lưu từ trước khi bố cục "Ngày N" thành hàm thuần (vd. "Ngày 3" đã gộp tay vào "Ngày 2") — GET chỉ
     * đồng bộ tên nên vẫn hiện cấu trúc cũ, còn kích hoạt chia lại: bản xem trước khác lộ trình nhận được. Chuẩn hoá lười, theo
     * chủ (không quét lúc khởi động: DB dùng chung cả nhóm): GET của chủ đưa bản nháp về đúng bố cục (giữ id các chương còn lại),
     * GET lần hai không ghi gì, kích hoạt = bản xem trước. Không ghi khi: job đang chạy, người khác / staff mở (404 / 403), hay chủ
     * mở bản nháp KHÁC của mình; nhiều GET song song chỉ chia lại một lần.
     */
    @Test
    void legacy_day_chapter_drafts_are_relaid_out_when_the_owner_opens_them() throws Exception { // LP-01, LP-08
        List<AiDtos.Item> six = new ArrayList<>();
        for (int i = 1; i <= 6; i++) six.add(vocab(i, "語" + i, null, false));
        stubAnalyze(six, Map.of("vocab", 6, "grammar", 0, "chaptersDetected", false));
        String token = newUser();
        JsonNode draft = draftPath(token, "6", null);
        String id = draft.get("id").asText();
        String jobId = draft.get("jobId").asText();
        List<String> original = layout(token, draft);
        List<String> ids = chapterIds(draft);

        // Bản nháp thứ hai cũng mang bố cục cũ nhưng job đang dịch lại nghĩa: worker ghi item -> để nguyên
        JsonNode busy = draftPath(token, "6", null);
        String busyId = busy.get("id").asText();
        String busyJob = busy.get("jobId").asText();
        List<String> busyIds = chapterIds(busy);
        legacyMerge(busyId, busyIds.get(0), busyIds.get(1), "Ngày 1–2");
        jdbc.update("UPDATE extraction_jobs SET status = 'RUNNING' WHERE id = ?", UUID.fromString(busyJob));

        // Người dùng khác cũng có một bản nháp bố cục cũ
        String otherToken = newUser();
        JsonNode otherDraft = draftPath(otherToken, "6", null);
        String otherId = otherDraft.get("id").asText();
        String otherJob = otherDraft.get("jobId").asText();
        List<String> otherIds = chapterIds(otherDraft);
        legacyMerge(otherId, otherIds.get(1), otherIds.get(2), "Ngày 2–3");

        legacyMerge(id, ids.get(1), ids.get(2), "Ngày 2–3");
        assertEquals(5, chapterRows(id));
        List<String> legacy = rowVersions(id, jobId);
        List<String> busyBefore = rowVersions(busyId, busyJob);
        List<String> otherBefore = rowVersions(otherId, otherJob);

        // Người khác / staff mở: 404 / 403 như trước, bản nháp không bị chạm
        call(get(BASE + id), otherToken, null).andExpect(status().isNotFound());
        call(get(BASE + id), newStaff(Role.ADMIN), null).andExpect(status().isForbidden());
        assertEquals(legacy, rowVersions(id, jobId));

        // Job đang chạy: GET chỉ đọc, bản nháp giữ nguyên bố cục cũ
        JsonNode busyRead = read(call(get(BASE + busyId), token, null).andExpect(status().isOk()));
        assertEquals(5, busyRead.get("chapters").size(), busyRead.get("chapters").toString());
        assertEquals(busyBefore, rowVersions(busyId, busyJob));

        // Chủ mở: về đúng bố cục lúc dựng; chương bị gộp đi không còn, các chương còn lại giữ id, chương thiếu tạo mới ở cuối
        JsonNode fixed = read(call(get(BASE + id), token, null).andExpect(status().isOk()));
        assertEquals(original, layout(token, fixed));
        List<String> kept = new ArrayList<>(ids);
        kept.remove(2);
        assertEquals(kept, chapterIds(fixed).subList(0, 5));
        assertEquals(6, chapterRows(id));
        assertNoOrphanItems(jobId);
        // ... chỉ bản nháp đang mở: bản nháp của người khác (và bản đang chạy job) không bị ghi gì
        assertEquals(otherBefore, rowVersions(otherId, otherJob));
        assertEquals(busyBefore, rowVersions(busyId, busyJob));

        // GET lần hai: bố cục đã đúng nên không ghi dòng nào
        List<String> settled = rowVersions(id, jobId);
        JsonNode again = read(call(get(BASE + id), token, null).andExpect(status().isOk()));
        assertEquals(settled, rowVersions(id, jobId));
        assertEquals(chapterPlan(fixed), chapterPlan(again));

        // Kích hoạt không đổi body: đúng bản xem trước người dùng thấy
        JsonNode active = activate(token, id, Map.of());
        assertEquals(chapterPlan(again), chapterPlan(active));
        assertEquals(dayPlan(again), dayPlan(active));

        // Người kia mở bản nháp của họ bằng bốn GET cùng lúc: tất cả 200 với cùng một bố cục đúng, chia lại đúng một lần (không
        // thừa chương, không item mồ côi)
        CountDownLatch ready = new CountDownLatch(4);
        CountDownLatch go = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(4);
        List<JsonNode> reads = new ArrayList<>();
        try {
            List<Future<MvcResult>> futures = new ArrayList<>();
            for (int i = 0; i < 4; i++) {
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    assertTrue(go.await(10, TimeUnit.SECONDS), "hiệu lệnh xuất phát không tới");
                    return call(get(BASE + otherId), otherToken, null).andReturn();
                }));
            }
            assertTrue(ready.await(10, TimeUnit.SECONDS));
            go.countDown();
            for (Future<MvcResult> f : futures) {
                MvcResult r = f.get(60, TimeUnit.SECONDS);
                assertEquals(200, r.getResponse().getStatus(), r.getResponse().getContentAsString());
                reads.add(json.readTree(r.getResponse().getContentAsString()));
            }
        } finally {
            pool.shutdownNow();
        }
        for (JsonNode r : reads) assertEquals(chapterPlan(reads.get(0)), chapterPlan(r));
        assertEquals(original, layout(otherToken, reads.get(0)));
        assertEquals(6, chapterRows(otherId));
        assertNoOrphanItems(otherJob);
        jdbc.update("UPDATE extraction_jobs SET status = 'DONE' WHERE id = ?", UUID.fromString(busyJob));
    }

    /** Kết quả của {@link #getWhileLocked}: doneUnderLock = GET đã trả lời khi test còn giữ khoá dòng lộ trình. */
    private record LockedGet(boolean doneUnderLock, JsonNode body) {}

    /**
     * GET /{id} ở thread khác trong lúc test giữ khoá dòng lộ trình (SELECT ... FOR UPDATE — như kích hoạt hay PATCH đang chạy)
     * trong transaction của mình; chờ GET tối đa waitMs rồi mới commit nhả khoá, sau đó lấy response (phải 200).
     */
    private LockedGet getWhileLocked(String token, Long uid, String id, long waitMs) throws Exception {
        ExecutorService single = Executors.newSingleThreadExecutor();
        try {
            boolean[] done = new boolean[1];
            Future<MvcResult> pending = new TransactionTemplate(txm).execute(s -> {
                assertTrue(pathRepo.lockByIdAndUserId(UUID.fromString(id), uid).isPresent());
                Future<MvcResult> f = single.submit(() -> call(get(BASE + id), token, null).andReturn());
                try {
                    f.get(waitMs, TimeUnit.MILLISECONDS);
                    done[0] = true;
                } catch (TimeoutException e) {
                    // GET đang chờ khoá: commit của transaction này nhả nó
                } catch (InterruptedException | ExecutionException e) {
                    throw new IllegalStateException(e);
                }
                return f;
            });
            MvcResult r = pending.get(60, TimeUnit.SECONDS);
            assertEquals(200, r.getResponse().getStatus(), r.getResponse().getContentAsString());
            return new LockedGet(done[0], json.readTree(r.getResponse().getContentAsString()));
        } finally {
            single.shutdownNow();
        }
    }

    /**
     * LP-01 + LP-08 + LP-13: GET chỉ khoá dòng và chia lại khi bố cục ĐANG LƯU khác bố cục đúng (bản nháp cũ, một lần). Bản nháp đã
     * đúng — vừa dựng, sau mỗi lối ghi (fitDayChapters), sau GET đầu đã chuẩn hoá — là trường hợp thường: GET chỉ đọc như mọi GET,
     * không ghi, không xếp hàng sau lối ghi đang giữ khoá. Trước đây điều kiện chỉ là "nháp chương Ngày N, job đã xong": trang lộ
     * trình gọi lại GET sau mỗi thao tác sửa và poll mỗi 2 s sau "Dịch lại nghĩa" (cả khi job đã xong), mỗi lần là một giao dịch
     * ghi SELECT ... FOR UPDATE + chia lại toàn bộ, và GET đứng chờ suốt lúc kích hoạt giữ khoá.
     */
    @Test
    void settled_day_chapter_drafts_are_read_without_the_row_lock() throws Exception { // LP-01, LP-08, LP-13
        List<AiDtos.Item> six = new ArrayList<>();
        for (int i = 1; i <= 6; i++) six.add(vocab(i, "語" + i, null, false));
        stubAnalyze(six, Map.of("vocab", 6, "grammar", 0, "chaptersDetected", false));
        String email = newEmail();
        String token = newUser(email);
        Long uid = userId(email);
        JsonNode draft = draftPath(token, "6", null);
        String id = draft.get("id").asText();
        String jobId = draft.get("jobId").asText();

        // Vừa dựng (draftByDays): GET trả lời ngay khi khoá còn giữ, cùng bố cục, không dòng nào bị ghi
        List<String> built = rowVersions(id, jobId);
        LockedGet fresh = getWhileLocked(token, uid, id, 10_000);
        assertTrue(fresh.doneUnderLock(), "GET bản nháp đã đúng bố cục không được chờ khoá dòng");
        assertEquals(chapterPlan(draft), chapterPlan(fresh.body()));
        assertEquals(built, rowVersions(id, jobId));

        // Sau lối ghi (bỏ chọn một thẻ, rút số ngày — fitDayChapters đã chia lại): vẫn chỉ đọc
        Map<String, String> itemIds = itemIdsByTerm(token, draft);
        call(patch(BASE + id + "/items"), token, List.of(Map.of("id", itemIds.get("語2"), "selected", false)))
                .andExpect(status().isOk());
        JsonNode edited = read(call(patch(BASE + id), token, Map.of("totalDays", 4)).andExpect(status().isOk()));
        List<String> saved = rowVersions(id, jobId);
        LockedGet afterEdit = getWhileLocked(token, uid, id, 10_000);
        assertTrue(afterEdit.doneUnderLock(), "GET sau lối ghi không được chờ khoá dòng");
        assertEquals(chapterPlan(edited), chapterPlan(afterEdit.body()));
        assertEquals(saved, rowVersions(id, jobId));

        // Bản nháp bố cục cũ thì vẫn khoá: GET chờ lối ghi đang giữ khoá (chưa xong sau 500 ms), nhả khoá rồi mới chia lại
        JsonNode legacyDraft = draftPath(token, "6", null);
        String legacyId = legacyDraft.get("id").asText();
        List<String> original = layout(token, legacyDraft);
        List<String> ids = chapterIds(legacyDraft);
        legacyMerge(legacyId, ids.get(1), ids.get(2), "Ngày 2–3");
        LockedGet stale = getWhileLocked(token, uid, legacyId, 500);
        assertFalse(stale.doneUnderLock(), "GET bản nháp bố cục cũ phải khoá dòng để chia lại");
        assertEquals(original, layout(token, stale.body()));
        assertEquals(6, chapterRows(legacyId));
        assertNoOrphanItems(legacyDraft.get("jobId").asText());

        // ... và chỉ một lần: GET sau đó đã thấy bố cục đúng nên không chờ khoá nữa
        List<String> relaid = rowVersions(legacyId, legacyDraft.get("jobId").asText());
        LockedGet settled = getWhileLocked(token, uid, legacyId, 10_000);
        assertTrue(settled.doneUnderLock(), "GET sau khi đã chuẩn hoá không được chờ khoá dòng");
        assertEquals(chapterPlan(stale.body()), chapterPlan(settled.body()));
        assertEquals(relaid, rowVersions(legacyId, legacyDraft.get("jobId").asText()));
    }

    /**
     * Bản nháp không nhận ra chương: chương "Ngày N" là xô ngày tính lại từ thẻ đang chọn / số ngày / trần, gộp vào nó sẽ bị chia
     * lại ngay (nút gộp vô tác dụng) → 400 kèm cách làm. Gộp vào chương đã đặt tên riêng thì giữ được, chương "Ngày N" phía sau chia
     * lại; đặt lại tên dạng "Ngày N" thì chương ấy thành tự sinh và cả bản nháp về đúng bố cục lúc dựng.
     */
    @Test
    void merge_up_on_day_chapters_needs_a_named_chapter() throws Exception { // LP-08
        List<AiDtos.Item> six = new ArrayList<>();
        for (int i = 1; i <= 6; i++) six.add(vocab(i, "語" + i, null, false));
        stubAnalyze(six, Map.of("vocab", 6, "grammar", 0, "chaptersDetected", false));
        String token = newUser();
        JsonNode draft = draftPath(token, "6", null);
        String id = draft.get("id").asText();
        String c1 = draft.get("chapters").get(0).get("id").asText();
        String c2 = draft.get("chapters").get(1).get("id").asText();
        List<String> original = layout(token, draft);
        assertEquals(List.of("Ngày 1 [1] 1: 語1", "Ngày 2 [2] 1: 語2", "Ngày 3 [3] 1: 語3", "Ngày 4 [4] 1: 語4",
                "Ngày 5 [5] 1: 語5", "Ngày 6 [6] 1: 語6"), original);

        JsonNode refused = read(call(post(BASE + id + "/chapters/" + c2 + "/merge-up"), token, null)
                .andExpect(status().isBadRequest()));
        assertEquals("Chương trước được chia tự động theo ngày nên không gộp vào được. Hãy đặt tên riêng cho chương trước rồi gộp, "
                + "hoặc giảm số ngày học.", refused.get("message").asText(), refused.toString());
        assertEquals(6, chapterRows(id));

        call(patch(BASE + id + "/chapters/" + c1), token, Map.of("title", "Chào hỏi")).andExpect(status().isOk());
        JsonNode merged = read(call(post(BASE + id + "/chapters/" + c2 + "/merge-up"), token, null).andExpect(status().isOk()));
        // "Chào hỏi" học trọn trong ngày 1 (đuôi một thẻ của chương đang học không để sang ngày sau) nên các chương sau lùi một ngày
        assertEquals(List.of("Chào hỏi [1] 2: 語1 語2", "Ngày 2 [2] 1: 語3", "Ngày 3 [3] 1: 語4", "Ngày 4 [4] 1: 語5",
                "Ngày 5 [5] 1: 語6"), layout(token, merged));
        assertEquals(5, chapterRows(id));

        // Tên dạng tự sinh: chương lại theo lịch, bản nháp về đúng 6 chương lúc dựng
        JsonNode back = read(call(patch(BASE + id + "/chapters/" + c1), token, Map.of("title", "Ngày 1")).andExpect(status().isOk()));
        assertEquals(original, layout(token, back));
        assertEquals(6, chapterRows(id));
        assertNoOrphanItems(draft.get("jobId").asText());
    }

    /**
     * LP-08: hạ trần làm tràn lịch dồn hai chương kề vào một ngày -> gộp; nâng trần lại phải tách ra như cũ (trước đây PATCH trần
     * chỉ gộp, không chia lại: chương "Ngày 1–2" ở lại vĩnh viễn, chỉ đổi số ngày đi rồi về mới gỡ được).
     */
    @Test
    void raising_cap_back_restores_one_chapter_per_day() throws Exception { // LP-08
        List<AiDtos.Item> fifteen = new ArrayList<>();
        for (int i = 1; i <= 15; i++) fifteen.add(vocab(i, "語" + i, null, false));
        stubAnalyze(fifteen, Map.of("vocab", 15, "grammar", 0, "chaptersDetected", false));
        String token = newUser();
        JsonNode draft = draftPath(token, "5", null);
        String id = draft.get("id").asText();
        assertEquals(List.of("Ngày 1", "Ngày 2", "Ngày 3", "Ngày 4", "Ngày 5"), chapterTitles(draft));

        JsonNode low = read(call(patch(BASE + id), token, Map.of("dailyCap", 6)).andExpect(status().isOk()));
        assertTrue(low.get("chapters").size() < 5, "trần thấp phải dồn hai chương vào một ngày: " + low.get("chapters"));
        assertEquals(15, assertDayChapters(low.get("chapters"), false, null, null));

        JsonNode back = read(call(patch(BASE + id), token, Map.of("dailyCap", 50)).andExpect(status().isOk()));
        assertEquals(chapterTitles(draft), chapterTitles(back));
        assertEquals(15, assertDayChapters(back.get("chapters"), false, null, null));
        assertEquals(5, chapterRows(id));
    }

    /**
     * LP-02: thẻ của ngày sau đã học trước ("Học chương" ngay ngày 1) không còn là việc "mới" của ngày đó — tải của nó đã nằm ở
     * hạn ôn thật. Trước đây forecast[ngày 2] = {newCount 2, ôn 12, load 14} trong khi today(ngày 2).newCount = 0: đếm đúp.
     */
    @Test
    void forecast_does_not_count_cards_learned_ahead_as_new() throws Exception { // LP-02
        String token = newUser();
        String id = draftPath(token, "10", null).get("id").asText();
        LocalDate start = LocalDate.now(ZONE);
        JsonNode active = activate(token, id, Map.of("startDate", start.toString()));
        String c1 = active.get("chapters").get(0).get("id").asText();
        JsonNode day1 = pathOn(token, id, start.toString());
        assertEquals(2, day1.get("forecast").get(1).get("newCount").asInt()); // ngày 2 xếp 2 thẻ của chương 1 (IT-01)

        // Học hết chương 1 (12 thẻ, gồm thẻ của ngày 1..5) ngay ngày 1, chấm "Tốt" -> đến hạn ngày mai
        JsonNode chapter = read(call(get(BASE + id + "/session").param("kind", "chapter").param("chapterId", c1)
                .param("date", start.toString()), token, null).andExpect(status().isOk()));
        assertEquals(12, chapter.get("cards").size());
        for (JsonNode c : chapter.get("cards")) review(token, c.get("cardId").asText(), "good");

        JsonNode p2 = pathOn(token, id, start.plusDays(1).toString());
        assertEquals(0, p2.get("today").get("newCount").asInt());
        int due = p2.get("today").get("dueCount").asInt();
        assertEquals(12, due);
        JsonNode f2 = p2.get("forecast").get(1);
        assertEquals(2, f2.get("dayIndex").asInt());
        assertEquals(0, f2.get("newCount").asInt(), f2.toString());
        assertEquals(0.0, f2.get("newWeight").asDouble(), 1e-9);
        assertEquals(due, f2.get("predictedReviews").asDouble(), 1e-9); // chỉ hạn ôn thật, không còn thẻ chưa học nào ở ngày 1
        assertEquals(due, f2.get("load").asDouble(), 1e-9);
        // ngày đã qua giữ lịch sử; từ hôm nay trở đi cột "mới" = thẻ chưa học = today.newCount của từng ngày
        assertEquals(3, p2.get("forecast").get(0).get("newCount").asInt());
        int fresh = 0;
        for (int d = 2; d <= 10; d++) fresh += p2.get("forecast").get(d - 1).get("newCount").asInt();
        assertEquals(8, fresh); // chỉ 8 thẻ của chương 2
        for (int d = 1; d <= 10; d++) {
            JsonNode p = pathOn(token, id, start.plusDays(d - 1).toString());
            assertEquals(p.get("today").get("newCount").asInt(), p.get("forecast").get(d - 1).get("newCount").asInt(),
                    "ngày " + d);
        }
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

        // Hạn mức ngày dùng chung với bóc tách (app_settings mặc định: 5 lượt)
        String other = newUser();
        for (int i = 0; i < 4; i++) postExtraction(other).andExpect(status().isAccepted());
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

        // Ngày 2 (2.0: việc = thẻ xếp cho ngày đó; 19 thẻ / 4 ngày tất định -> {5, 6, 5, 3}, ngày 1 lấy 5 thẻ đầu): chương 1
        // còn đang học, dải vị trí 1.0 (fromPos/toPos) khớp đúng cardIds nên client cũ học qua ?range= vẫn ra đúng thẻ
        JsonNode day2 = read(call(get(BASE + id).param("date", "2026-11-02"), token, null).andExpect(status().isOk()));
        assertEquals(2, day2.get("today").get("dayIndex").asInt());
        assertEquals("during", day2.get("today").get("state").asText());
        JsonNode task = day2.get("today").get("tasks").get(0);
        assertEquals(d1, task.get("deckId").asText());
        int count = task.get("count").asInt();
        assertEquals(count, task.get("cardIds").size());
        assertEquals(6, count, task.toString());
        assertEquals(6, task.get("fromPos").asInt());
        assertEquals(11, task.get("toPos").asInt());
        assertEquals(count, day2.get("today").get("newCount").asInt());

        // Sau khi kích hoạt: không sửa chương nữa, nhưng đổi số ngày tính lại dải trên số thẻ đã chốt
        JsonNode five = read(call(patch(BASE + id), token, Map.of("totalDays", 5, "title", "Minna mới")).andExpect(status().isOk()));
        assertEquals("Minna mới", five.get("title").asText());
        assertEquals(5, five.get("chapters").get(1).get("dayTo").asInt());

        call(delete(BASE + id), token, null).andExpect(status().isNoContent());
        call(get(BASE + id), token, null).andExpect(status().isNotFound());
        // LP-10: dòng job giữ lại (CANCELLED) để lượt hạn mức không bị hoàn, chỉ văn bản + item bị xoá
        JsonNode cancelled = read(call(get("/api/extractions/" + jobId), token, null).andExpect(status().isOk()));
        assertEquals("CANCELLED", cancelled.get("status").asText(), cancelled.toString());
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
        // Chương không tồn tại, và chương THẬT của một lộ trình khác của chính mình -> 404: ownedChapter lọc theo pathId chứ không
        // chỉ theo quyền sở hữu lộ trình (không thì sửa / gộp / đọc chương của bản nháp này được qua id lộ trình kia)
        call(patch(BASE + id + "/chapters/" + java.util.UUID.randomUUID()), token, Map.of("title", "x"))
                .andExpect(status().isNotFound());
        String cx = draftPath(token, "5", null).get("chapters").get(0).get("id").asText();
        call(patch(BASE + id + "/chapters/" + cx), token, Map.of("title", "x")).andExpect(status().isNotFound());
        call(post(BASE + id + "/chapters/" + cx + "/merge-up"), token, null).andExpect(status().isNotFound());
        call(get(BASE + id + "/chapters/" + cx + "/items"), token, null).andExpect(status().isNotFound());
        assertEquals(2, read(call(get(BASE + id), token, null)).get("chapters").size());

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
        JsonNode draft = draftPath(token, "5", null);
        String id = draft.get("id").asText();
        String jobId = draft.get("jobId").asText();
        JsonNode owned = read(call(delete("/api/extractions/" + jobId), token, null).andExpect(status().isConflict()));
        assertEquals("Lượt này thuộc một lộ trình học, hãy xoá lộ trình.", owned.get("message").asText(), owned.toString());

        // LP-10: xoá lộ trình để lại job CANCELLED mồ côi. Trong 24 giờ dòng ấy vẫn tính vào hạn mức ngày nên không xoá được (xoá rồi
        // tạo lại là lách hạn mức); qua 24 giờ chủ sở hữu (và Admin Panel, cùng deleteJob) xoá được, không phải chờ housekeeping 90 ngày
        call(delete(BASE + id), token, null).andExpect(status().isNoContent());
        JsonNode fresh = read(call(delete("/api/extractions/" + jobId), token, null).andExpect(status().isConflict()));
        assertTrue(fresh.get("message").asText().contains("24 giờ"), fresh.toString());
        jdbc.update("UPDATE extraction_jobs SET created_at = created_at - interval '25 hours' WHERE id = ?", UUID.fromString(jobId));
        call(delete("/api/extractions/" + jobId), token, null).andExpect(status().isNoContent());
        call(get("/api/extractions/" + jobId), token, null).andExpect(status().isNotFound());
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
    void active_total_days_change_replans_remaining_cards_and_deleted_deck_chapter_has_no_range() throws Exception {
        String token = newUser();
        String id = draftPath(token, "10", null).get("id").asText();
        JsonNode active = activate(token, id, Map.of("startDate", "2026-11-01"));
        String d1 = active.get("chapters").get(0).get("deckId").asText();
        call(delete("/api/decks/" + d1), token, null).andExpect(status().isNoContent());
        // stub mặc định cho mọi thẻ cùng một nghĩa "vi" (-> không ra được bài kiểm tra): cho chương 2 nghĩa riêng từng thẻ
        // để mẫu số chaptersTotal bên dưới chỉ phản ánh việc chương 1 mất bộ thẻ
        jdbc.update("UPDATE flashcards SET meaning = 'nghĩa ' || id WHERE deck_id = ?",
                active.get("chapters").get(1).get("deckId").asText());

        JsonNode four = read(call(patch(BASE + id).param("date", "2026-11-01"), token, Map.of("totalDays", 4))
                .andExpect(status().isOk()));
        JsonNode c1 = four.get("chapters").get(0);
        JsonNode c2 = four.get("chapters").get(1);
        // chương mất bộ thẻ không còn thẻ trong lịch (CASCADE): không có dải ngày, không chiếm ngày; chương còn lại dùng hết 4 ngày
        assertTrue(c1.get("deckDeleted").asBoolean());
        assertEquals(0, c1.get("cardCount").asInt());
        assertFalse(c1.has("dayFrom"), c1.toString());
        assertFalse(c1.has("dayTo"), c1.toString());
        assertEquals("empty", c1.get("state").asText()); // spec §7: hết thẻ mà chưa qua quiz -> "trống", không phải "open" (nợ)
        assertEquals(8, c2.get("cardCount").asInt());
        assertEquals(1, c2.get("dayFrom").asInt());
        assertEquals(4, c2.get("dayTo").asInt());
        assertEquals("current", c2.get("state").asText());
        assertEquals(4, four.get("days").size());
        for (JsonNode d : four.get("days")) {
            assertEquals(1, d.get("tasks").size(), d.toString());
            assertEquals(c2.get("id").asText(), d.get("tasks").get(0).get("chapterId").asText());
        }
        assertEquals(8, four.get("completion").get("total").asInt());
        // chương mất bộ thẻ ("empty", không có bài kiểm tra) không vào mẫu số "N/M chương đã qua kiểm tra"
        assertEquals(1, four.get("completion").get("chaptersTotal").asInt(), four.get("completion").toString());
    }

    @Test
    void listener_never_breaks_job() throws Exception {
        // stats.chapters sai kiểu -> buildDraft ném -> lộ trình FAILED, job vẫn DONE
        stubAnalyze(chapterItems(), Map.of("vocab", 20, "grammar", 1, "chaptersDetected", true, "chapters", "oops"));
        String email = newEmail();
        String token = newUser(email);
        Long uid = userId(email);
        JsonNode created = read(postPath(token, TEXT, "5", null).andExpect(status().isAccepted()));
        String id = created.get("id").asText();
        String jobId = created.get("jobId").asText();
        JsonNode failed = awaitDraft(token, id);
        assertEquals("FAILED", failed.get("status").asText());
        assertEquals("Không dựng được lộ trình từ kết quả bóc tách.", failed.get("errorMessage").asText());
        JsonNode job = read(call(get("/api/extractions/" + jobId), token, null).andExpect(status().isOk()));
        assertEquals("DONE", job.get("status").asText());

        // LP-6: job DONE còn item nhưng dựng nháp lỗi -> "Chạy lại" vẫn đi qua ANALYZE trên job DONE: item cũ bị thay (21, không
        // nhân đôi), không tạo job mới; stats hợp lệ thì bản nháp dựng được
        int jobsBefore = jobCount(uid);
        stubAi();
        assertEquals("PROCESSING", read(call(post(BASE + id + "/retry"), token, null).andExpect(status().isAccepted()))
                .get("status").asText());
        JsonNode draft = awaitDraft(token, id);
        assertEquals("DRAFT", draft.get("status").asText(), draft.toString());
        assertEquals(2, draft.get("chapters").size());
        assertEquals(12, draft.get("chapters").get(0).get("cardCount").asInt());
        assertEquals(8, draft.get("chapters").get(1).get("cardCount").asInt());
        assertEquals(Integer.valueOf(21), jdbc.queryForObject("SELECT count(*) FROM extraction_items WHERE job_id = ?",
                Integer.class, UUID.fromString(jobId)));
        assertEquals(jobsBefore, jobCount(uid), "chạy lại không tạo job mới");
    }

    // ---------- 2.0: lịch theo thẻ, phiên học hợp nhất, cân lại lịch, danh sách batch ----------

    @Autowired
    JdbcTemplate jdbc;

    private static final ZoneId ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private ResultActions postPathParts(String token, Map<String, String> parts) throws Exception {
        MockMultipartHttpServletRequestBuilder req = multipart("/api/learning-paths");
        parts.forEach((k, v) -> req.part(new MockPart(k, v.getBytes(StandardCharsets.UTF_8))));
        return call(req, token, null);
    }

    private JsonNode pathOn(String token, String id, String date) throws Exception {
        return read(call(get(BASE + id).param("date", date), token, null).andExpect(status().isOk()));
    }

    private JsonNode session(String token, String id, String kind, String date) throws Exception {
        return read(call(get(BASE + id + "/session").param("kind", kind).param("date", date), token, null)
                .andExpect(status().isOk()));
    }

    private void review(String token, String cardId, String grade) throws Exception {
        call(post("/api/reviews"), token, Map.of("cardId", cardId, "grade", grade, "cram", false))
                .andExpect(status().isOk());
    }

    /** Thẻ xếp cho ngày dayIndex theo days[] của GET /{id}. */
    private static List<String> cardIdsOfDay(JsonNode path, int dayIndex) {
        List<String> out = new ArrayList<>();
        for (JsonNode d : path.get("days")) {
            if (d.get("dayIndex").asInt() != dayIndex) continue;
            for (JsonNode t : d.get("tasks")) t.get("cardIds").forEach(c -> out.add(c.asText()));
        }
        return out;
    }

    private int scheduledDay(String pathId, String cardId) {
        return jdbc.queryForObject("SELECT scheduled_day FROM learning_path_cards WHERE path_id = ? AND card_id = ?",
                Integer.class, UUID.fromString(pathId), cardId);
    }

    private int cardRows(String pathId) {
        return jdbc.queryForObject("SELECT count(*) FROM learning_path_cards WHERE path_id = ?", Integer.class,
                UUID.fromString(pathId));
    }

    /**
     * Ghim hạn ôn (reviews.due_at) của một thẻ về một thời điểm cố định: POST /api/reviews đặt due_at = now (thật) + khoảng ôn, nên
     * mọi khẳng định "đến hạn ngày X" với ngày cố định phải đi qua đây để không phụ thuộc ngày chạy test. Thẻ của lộ trình chỉ thuộc
     * một người dùng (vừa tạo) nên lọc theo card_id là đủ.
     */
    private void pinDue(String cardId, String isoInstant) {
        jdbc.update("UPDATE reviews SET due_at = ? WHERE card_id = ?",
                OffsetDateTime.ofInstant(Instant.parse(isoInstant), ZoneOffset.UTC), cardId);
    }

    /** dueCount của GET /{id}, /today-summary, /session?kind=today và GET / phải là cùng một con số cho cùng một ngày. */
    private void assertDue(String token, String id, String date, int expected) throws Exception {
        assertEquals(expected, pathOn(token, id, date).get("today").get("dueCount").asInt(), "GET /{id} " + date);
        JsonNode summary = read(call(get(BASE + "today-summary").param("date", date), token, null).andExpect(status().isOk()));
        assertEquals(expected, summary.get(0).get("dueCount").asInt(), "today-summary " + date);
        assertEquals(expected, session(token, id, "today", date).get("counts").get("due").asInt(), "session " + date);
        JsonNode list = read(call(get("/api/learning-paths").param("date", date), token, null).andExpect(status().isOk()));
        assertEquals(expected, list.get(0).get("today").get("dueCount").asInt(), "GET / " + date);
    }

    @Test
    void activation_writes_cards_with_seq_day_weight_and_chapter_ranges() throws Exception { // IT-01
        String token = newUser();
        JsonNode draft = draftPath(token, "10", "Thẻ");
        String id = draft.get("id").asText();
        assertEquals(50, draft.get("dailyCap").asInt()); // learning_path_daily_cap_default (V20)
        assertEquals("1111111", draft.get("studyDays").asText());
        assertTrue(draft.get("reminder").asBoolean());
        assertEquals(3, draft.get("suggestedDays").asInt(), draft.toString()); // 20.2 trọng số / trần 50: sàn 3 ngày đã vừa
        assertFalse(draft.get("overCap").asBoolean()); // 20 thẻ / 10 ngày / trần 50

        JsonNode active = read(call(post(BASE + id + "/activate").param("date", "2026-11-01"), token,
                Map.of("startDate", "2026-11-01")).andExpect(status().isCreated()));
        assertFalse(active.has("overflow"));
        assertFalse(active.has("suggestedDays"));
        JsonNode ch = active.get("chapters");
        assertEquals(12, ch.get(0).get("cardCount").asInt());
        assertEquals(8, ch.get(1).get("cardCount").asInt());
        assertEquals(1, ch.get(0).get("dayFrom").asInt());
        // 20 thẻ / 10 ngày (quota 2), tất định: {3, 2, 2, 2, 3, 2, 2, 2, 2} — đuôi 1 thẻ của chương 1 được học nốt trong ngày 5
        // nên lịch kết thúc ở ngày 9 (ngày 10 thành ngày ôn); số cụ thể ghim lại để một thay đổi phân bố không lọt qua
        int lastDay = ch.get(1).get("dayTo").asInt();
        assertEquals(9, lastDay, ch.toString());
        assertEquals(5, ch.get(0).get("dayTo").asInt());   // 3+2+2+2 rồi 2 + đuôi 1 thẻ học nốt
        assertEquals(6, ch.get(1).get("dayFrom").asInt()); // chương 1 ≥ q/2 và ngày 5 đã đầy -> chương 2 sang ngày mới
        assertEquals("current", ch.get(0).get("state").asText());
        assertEquals("locked", ch.get(1).get("state").asText());
        assertEquals(0, ch.get(0).get("learned").asInt());
        assertEquals(0, ch.get(0).get("mastered").asInt());
        assertEquals(7, ch.get(1).get("vocabCount").asInt());
        assertEquals(1, ch.get(1).get("grammarCount").asInt());

        JsonNode completion = active.get("completion");
        assertEquals(20, completion.get("total").asInt());
        assertEquals(0, completion.get("learned").asInt());
        assertEquals(0, completion.get("learnedPct").asInt());
        // stub mặc định cho mọi thẻ cùng một nghĩa "vi" -> không chương nào phát được bài kiểm tra (cần ≥ 2
        // nghĩa khác nhau) nên chưa chương nào vào mẫu số "N/M chương đã qua kiểm tra" (xem chapters_total_leaves_out_...)
        assertEquals(0, completion.get("chaptersTotal").asInt(), completion.toString());
        assertEquals(0, completion.get("chaptersPassed").asInt());
        assertFalse(completion.get("done").asBoolean());

        JsonNode today = active.get("today");
        assertEquals("2026-11-01", today.get("date").asText());
        assertEquals(1, today.get("dayIndex").asInt());
        assertEquals("during", today.get("state").asText());
        assertEquals(0, today.get("dueCount").asInt());
        assertEquals(0, today.get("behindCount").asInt());
        assertEquals(3, today.get("newCount").asInt());
        JsonNode task = today.get("tasks").get(0);
        assertEquals(ch.get(0).get("deckId").asText(), task.get("deckId").asText());
        assertEquals(today.get("newCount").asInt(), task.get("count").asInt());
        assertEquals(task.get("count").asInt(), task.get("cardIds").size());
        assertEquals(1, task.get("fromPos").asInt());
        assertEquals(task.get("count").asInt(), task.get("toPos").asInt());

        JsonNode days = active.get("days");
        assertEquals(10, days.size());
        assertEquals("2026-11-01", days.get(0).get("date").asText());
        assertEquals("2026-11-10", days.get(9).get("date").asText());
        int sum = 0;
        for (JsonNode d : days) {
            int idx = d.get("dayIndex").asInt();
            assertEquals(idx <= lastDay, !d.get("tasks").isEmpty(), "ngày " + idx + ": " + d);
            for (JsonNode t : d.get("tasks")) sum += t.get("count").asInt();
        }
        assertEquals(20, sum);

        JsonNode forecast = active.get("forecast");
        assertEquals(10, forecast.size());
        assertEquals(today.get("newCount").asInt(), forecast.get(0).get("newCount").asInt());
        assertEquals(0.0, forecast.get(0).get("predictedReviews").asDouble(), 1e-9);
        assertEquals(0.9 * today.get("newCount").asInt(), forecast.get(1).get("predictedReviews").asDouble(), 1e-9);
        assertFalse(forecast.get(1).get("overCap").asBoolean());

        UUID pid = UUID.fromString(id);
        assertEquals(20, cardRows(id));
        assertEquals(Integer.valueOf(20), jdbc.queryForObject(
                "SELECT count(DISTINCT seq) FROM learning_path_cards WHERE path_id = ? AND seq BETWEEN 1 AND 20", Integer.class, pid));
        assertEquals(Integer.valueOf(0), jdbc.queryForObject(
                "SELECT count(*) FROM learning_path_cards WHERE path_id = ? AND scheduled_day NOT BETWEEN 1 AND 10", Integer.class, pid));
        // ngày không giảm theo seq
        assertEquals(Integer.valueOf(0), jdbc.queryForObject("SELECT count(*) FROM (SELECT scheduled_day - lag(scheduled_day) "
                + "OVER (ORDER BY seq) AS d FROM learning_path_cards WHERE path_id = ?) t WHERE d < 0", Integer.class, pid));
        // trọng số: người học N5, thẻ N5 -> 1.0; ngữ pháp +0.2
        assertEquals(1.2, jdbc.queryForObject("SELECT c.weight FROM learning_path_cards c JOIN flashcards f ON f.id = c.card_id "
                + "WHERE c.path_id = ? AND f.kind = 'grammar'", Double.class, pid), 1e-9);
        assertEquals(Integer.valueOf(19), jdbc.queryForObject(
                "SELECT count(*) FROM learning_path_cards WHERE path_id = ? AND weight = 1.0", Integer.class, pid));
        // seq: chương 1 (12 thẻ) đứng trước chương 2
        assertEquals(Integer.valueOf(12), jdbc.queryForObject(
                "SELECT max(seq) FROM learning_path_cards WHERE path_id = ? AND chapter_id = ?", Integer.class, pid,
                UUID.fromString(ch.get(0).get("id").asText())));
    }

    @Test
    void session_today_has_only_new_cards_then_due_cards_next_day() throws Exception { // IT-02
        String token = newUser();
        String id = draftPath(token, "10", null).get("id").asText();
        LocalDate start = LocalDate.now(ZONE);
        activate(token, id, Map.of("startDate", start.toString()));

        JsonNode s1 = session(token, id, "today", start.toString());
        assertEquals("today", s1.get("kind").asText());
        assertEquals(1, s1.get("dayIndex").asInt());
        assertEquals("during", s1.get("state").asText());
        int n1 = s1.get("counts").get("new").asInt();
        assertEquals(3, n1, s1.toString()); // 20 thẻ / 10 ngày: ngày 1 nhận 3 (xem IT-01)
        assertEquals(0, s1.get("counts").get("due").asInt());
        assertEquals(0, s1.get("counts").get("catchup").asInt());
        assertEquals(n1, s1.get("counts").get("total").asInt());
        assertEquals(n1, s1.get("cards").size());
        for (JsonNode c : s1.get("cards")) assertEquals("new", c.get("mode").asText());
        JsonNode first = s1.get("cards").get(0);
        assertEquals("語1", first.get("term").asText());
        assertEquals("第1課 あいさつ", first.get("chapterTitle").asText());
        assertEquals("vocab", first.get("kind").asText());
        assertEquals("N5", first.get("level").asText());
        assertTrue(first.hasNonNull("deckId") && first.hasNonNull("chapterId") && first.hasNonNull("meaning"), first.toString());

        // chấm 3 thẻ "Tốt" -> khoảng ôn 1 ngày -> đến hạn ngày mai
        List<String> graded = new ArrayList<>();
        for (int i = 0; i < 3; i++) {
            String cid = s1.get("cards").get(i).get("cardId").asText();
            review(token, cid, "good");
            graded.add(cid);
        }
        // vẫn hôm nay: 3 thẻ vừa chấm rời nhóm mới, chưa đến hạn nên không vào nhóm đến hạn
        JsonNode s1b = session(token, id, "today", start.toString());
        assertEquals(n1 - 3, s1b.get("counts").get("new").asInt());
        assertEquals(0, s1b.get("counts").get("due").asInt());

        String tomorrow = start.plusDays(1).toString();
        JsonNode s2 = session(token, id, "today", tomorrow);
        assertEquals(2, s2.get("dayIndex").asInt());
        JsonNode counts = s2.get("counts");
        assertEquals(3, counts.get("due").asInt());
        assertEquals(n1 - 3, counts.get("catchup").asInt());
        int n2 = counts.get("new").asInt();
        assertEquals(2, n2, s2.toString()); // ngày 2 nhận 2
        assertEquals(3 + (n1 - 3) + n2, counts.get("total").asInt());
        JsonNode cards = s2.get("cards");
        for (int i = 0; i < 3; i++) {
            assertEquals("due", cards.get(i).get("mode").asText());
            assertTrue(graded.contains(cards.get(i).get("cardId").asText()));
        }
        for (int i = 3; i < cards.size(); i++) assertEquals("new", cards.get(i).get("mode").asText());

        JsonNode p2 = pathOn(token, id, tomorrow);
        assertEquals(3, p2.get("today").get("dueCount").asInt());
        assertEquals(n1 - 3, p2.get("today").get("behindCount").asInt());
        assertEquals(n2, p2.get("today").get("newCount").asInt());
        assertEquals(3, p2.get("chapters").get(0).get("learned").asInt());
        assertEquals(0, p2.get("chapters").get(0).get("mastered").asInt());
        assertEquals(3, p2.get("completion").get("learned").asInt());
        assertEquals(15, p2.get("completion").get("learnedPct").asInt());
        // dự báo: thẻ đã học dùng lịch thật (3 đến hạn ngày 2) + dự báo k = 1 của thẻ chưa học ngày 1
        assertEquals(3 + 0.9 * (n1 - 3), p2.get("forecast").get(1).get("predictedReviews").asDouble(), 1e-9);

        assertEquals(3, session(token, id, "due", tomorrow).get("cards").size());
        JsonNode catchup = session(token, id, "catchup", tomorrow);
        assertEquals(n1 - 3, catchup.get("counts").get("catchup").asInt());
        assertEquals(n1 - 3, catchup.get("cards").size());
        String c1 = p2.get("chapters").get(0).get("id").asText();
        JsonNode chapter = read(call(get(BASE + id + "/session").param("kind", "chapter").param("chapterId", c1)
                .param("date", tomorrow), token, null).andExpect(status().isOk()));
        assertEquals(12, chapter.get("cards").size());
        assertEquals(9, chapter.get("counts").get("new").asInt());
        assertEquals(3, chapter.get("counts").get("due").asInt());
        call(get(BASE + id + "/session").param("kind", "chapter"), token, null).andExpect(status().isBadRequest());
        call(get(BASE + id + "/session").param("kind", "bogus"), token, null).andExpect(status().isBadRequest());
        // trước ngày bắt đầu: chỉ thẻ đến hạn (chưa có) -> rỗng
        JsonNode before = session(token, id, "today", start.minusDays(1).toString());
        assertEquals("before", before.get("state").asText());
        assertEquals(0, before.get("cards").size());

        // chưa kích hoạt -> 409; người lạ -> 404
        String draft = draftPath(token, "5", null).get("id").asText();
        call(get(BASE + draft + "/session"), token, null).andExpect(status().isConflict());
        call(post(BASE + draft + "/rebalance"), token, Map.of("extend", false)).andExpect(status().isConflict());
        String stranger = newUser();
        call(get(BASE + id + "/session"), stranger, null).andExpect(status().isNotFound());
        call(post(BASE + id + "/rebalance"), stranger, Map.of("extend", false)).andExpect(status().isNotFound());
    }

    @Test
    void catchup_lists_overdue_and_rebalance_moves_them_keeping_learned_days() throws Exception { // S-04 qua API
        String token = newUser();
        String id = draftPath(token, "10", null).get("id").asText();
        activate(token, id, Map.of("startDate", "2026-11-01"));
        JsonNode p1 = pathOn(token, id, "2026-11-01");
        List<String> day1 = cardIdsOfDay(p1, 1);
        assertTrue(day1.size() >= 2, p1.toString());
        int firstFour = 0;
        for (int d = 1; d <= 4; d++) firstFour += cardIdsOfDay(p1, d).size();
        review(token, day1.get(0), "good");
        review(token, day1.get(1), "good");
        // SrsService đặt due_at = now (thật) + 1 ngày; ghim về 17:00 +07 ngày 4/11 để test không phụ thuộc ngày chạy
        pinDue(day1.get(0), "2026-11-04T10:00:00Z");
        pinDue(day1.get(1), "2026-11-04T10:00:00Z");

        JsonNode catchup = session(token, id, "catchup", "2026-11-05");
        assertEquals(firstFour - 2, catchup.get("counts").get("catchup").asInt());
        assertEquals(firstFour - 2, catchup.get("cards").size());
        for (JsonNode c : catchup.get("cards")) assertEquals("new", c.get("mode").asText());
        JsonNode p5 = pathOn(token, id, "2026-11-05");
        assertEquals(firstFour - 2, p5.get("today").get("behindCount").asInt());
        assertEquals(2, p5.get("today").get("dueCount").asInt()); // đến hạn 4/11 -> vẫn đến hạn (quá hạn) ngày 5/11
        assertEquals(0, pathOn(token, id, "2026-11-03").get("today").get("dueCount").asInt()); // chưa tới 4/11
        assertEquals("current", p5.get("chapters").get(0).get("state").asText());

        JsonNode r = read(call(post(BASE + id + "/rebalance").param("date", "2026-11-05"), token, Map.of("extend", false))
                .andExpect(status().isOk()));
        assertTrue(r.has("lastRebalancedAt"));
        assertEquals(10, r.get("totalDays").asInt());
        assertEquals(0, r.get("today").get("behindCount").asInt());
        assertTrue(r.get("today").get("newCount").asInt() > 0);
        assertEquals(1, r.get("chapters").get(0).get("dayFrom").asInt()); // thẻ đã học ghim ở ngày 1
        assertEquals(10, r.get("chapters").get(1).get("dayTo").asInt());
        assertEquals(1, scheduledDay(id, day1.get(0)));
        assertEquals(1, scheduledDay(id, day1.get(1)));
        UUID pid = UUID.fromString(id);
        assertEquals(Integer.valueOf(5), jdbc.queryForObject("SELECT min(scheduled_day) FROM learning_path_cards "
                + "WHERE path_id = ? AND card_id NOT IN (?, ?)", Integer.class, pid, day1.get(0), day1.get(1)));
        assertEquals(Integer.valueOf(10), jdbc.queryForObject(
                "SELECT max(scheduled_day) FROM learning_path_cards WHERE path_id = ?", Integer.class, pid));
        assertEquals(2, cardIdsOfDay(r, 1).size());
        for (int d = 2; d <= 4; d++) assertEquals(0, cardIdsOfDay(r, d).size(), "ngày " + d);
        for (int d = 5; d <= 10; d++) assertFalse(cardIdsOfDay(r, d).isEmpty(), "ngày " + d);

        // không còn nợ -> kéo dài không đổi gì
        JsonNode again = read(call(post(BASE + id + "/rebalance").param("date", "2026-11-05"), token, Map.of("extend", true))
                .andExpect(status().isOk()));
        assertEquals(10, again.get("totalDays").asInt());
        assertEquals(r.get("days"), again.get("days"));

        // qua ngày cuối mà còn nợ, kéo dài: tổng số ngày tăng, không thẻ nào trước hôm nay
        JsonNode ext = read(call(post(BASE + id + "/rebalance").param("date", "2026-11-12"), token, Map.of("extend", true))
                .andExpect(status().isOk()));
        assertTrue(ext.get("totalDays").asInt() >= 12, ext.get("totalDays").toString());
        assertEquals(0, ext.get("today").get("behindCount").asInt());
        assertEquals("during", ext.get("today").get("state").asText());
        assertEquals(Integer.valueOf(12), jdbc.queryForObject("SELECT min(scheduled_day) FROM learning_path_cards "
                + "WHERE path_id = ? AND card_id NOT IN (?, ?)", Integer.class, pid, day1.get(0), day1.get(1)));
        // total_days mới = ngày cuối thật sự của lịch (daysUsed), không hơn không kém
        assertEquals(Integer.valueOf(ext.get("totalDays").asInt()), jdbc.queryForObject(
                "SELECT max(scheduled_day) FROM learning_path_cards WHERE path_id = ?", Integer.class, pid));
        assertEquals(ext.get("totalDays").asInt(), ext.get("days").size());
    }

    @Test
    void patch_on_active_replans_only_unlearned_cards_and_validates_settings() throws Exception {
        String token = newUser();
        String id = draftPath(token, "10", null).get("id").asText();
        activate(token, id, Map.of("startDate", "2026-11-01")); // chủ nhật
        JsonNode p1 = pathOn(token, id, "2026-11-01");
        List<String> day1 = cardIdsOfDay(p1, 1);
        review(token, day1.get(0), "good");
        review(token, day1.get(1), "good");

        // Nghỉ cuối tuần + trần + nhắc: ngày học 1 dời sang thứ 2 (2/11); chủ nhật 1/11 là trước ngày học 1; thứ 7 7/11 là ngày nghỉ
        JsonNode p = read(call(patch(BASE + id).param("date", "2026-11-01"), token,
                Map.of("studyDays", "1111100", "dailyCap", 20, "reminder", false)).andExpect(status().isOk()));
        assertEquals("1111100", p.get("studyDays").asText());
        assertEquals(20, p.get("dailyCap").asInt());
        assertFalse(p.get("reminder").asBoolean());
        assertEquals("2026-11-02", p.get("days").get(0).get("date").asText());
        assertEquals("2026-11-06", p.get("days").get(4).get("date").asText());
        assertEquals("2026-11-09", p.get("days").get(5).get("date").asText());
        assertEquals("before", p.get("today").get("state").asText());
        JsonNode sat = pathOn(token, id, "2026-11-07");
        assertEquals("rest", sat.get("today").get("state").asText());
        assertEquals(5, sat.get("today").get("dayIndex").asInt());
        assertEquals(0, sat.get("today").get("newCount").asInt());
        assertEquals(0, sat.get("today").get("tasks").size());
        assertEquals(1, scheduledDay(id, day1.get(0)));

        // Rút còn 4 ngày từ ngày 1: thẻ đã học giữ ngày 1, mọi thẻ còn lại nằm trong 1..4
        JsonNode four = read(call(patch(BASE + id).param("date", "2026-11-02"), token, Map.of("totalDays", 4))
                .andExpect(status().isOk()));
        assertEquals(4, four.get("totalDays").asInt());
        assertEquals(4, four.get("days").size());
        assertEquals(1, four.get("chapters").get(0).get("dayFrom").asInt());
        assertEquals(4, four.get("chapters").get(1).get("dayTo").asInt());
        UUID pid = UUID.fromString(id);
        assertEquals(Integer.valueOf(4), jdbc.queryForObject(
                "SELECT max(scheduled_day) FROM learning_path_cards WHERE path_id = ?", Integer.class, pid));
        assertEquals(1, scheduledDay(id, day1.get(0)));
        assertEquals(1, scheduledDay(id, day1.get(1)));
        int sum = 0;
        for (int d = 1; d <= 4; d++) sum += cardIdsOfDay(four, d).size();
        assertEquals(20, sum);

        // Đổi khung giữa chừng (thứ 4 4/11 = ngày học 3): thẻ chưa học không bị xếp vào ngày đã qua
        JsonNode six = read(call(patch(BASE + id).param("date", "2026-11-04"), token, Map.of("totalDays", 6))
                .andExpect(status().isOk()));
        assertEquals(6, six.get("totalDays").asInt());
        assertEquals(3, six.get("today").get("dayIndex").asInt());
        assertEquals(2, cardIdsOfDay(six, 1).size());
        assertEquals(0, cardIdsOfDay(six, 2).size());
        assertEquals(0, six.get("today").get("behindCount").asInt());
        assertTrue(six.get("today").get("newCount").asInt() > 0);

        // Đổi tên không đụng lịch
        JsonNode renamed = read(call(patch(BASE + id).param("date", "2026-11-04"), token, Map.of("title", "Tên mới"))
                .andExpect(status().isOk()));
        assertEquals(six.get("days"), renamed.get("days"));

        // Kiểm tra đầu vào
        call(patch(BASE + id), token, Map.of("studyDays", "0000000")).andExpect(status().isBadRequest());
        call(patch(BASE + id), token, Map.of("studyDays", "11")).andExpect(status().isBadRequest());
        call(patch(BASE + id), token, Map.of("dailyCap", 3)).andExpect(status().isBadRequest());
        call(patch(BASE + id), token, Map.of("dailyCap", 201)).andExpect(status().isBadRequest());
        // ACTIVE: số ngày mới không được nhỏ hơn ngày học đang đứng (thứ 4 4/11 = ngày 3) — không âm thầm ghi đè bằng chỉ số hôm nay
        JsonNode tooShort = read(call(patch(BASE + id).param("date", "2026-11-04"), token, Map.of("totalDays", 2))
                .andExpect(status().isBadRequest()));
        assertEquals("Số ngày không thể nhỏ hơn ngày học hiện tại (3).", tooShort.get("message").asText(), tooShort.toString());
        // thứ 7 7/11 là ngày nghỉ sau ngày 5 -> ngày học hiện tại là 6
        JsonNode restShort = read(call(patch(BASE + id).param("date", "2026-11-07"), token, Map.of("totalDays", 5))
                .andExpect(status().isBadRequest()));
        assertEquals("Số ngày không thể nhỏ hơn ngày học hiện tại (6).", restShort.get("message").asText(), restShort.toString());
        JsonNode unchanged = read(call(get(BASE + id), token, null));
        assertEquals("1111100", unchanged.get("studyDays").asText());
        assertEquals(6, unchanged.get("totalDays").asInt());
        assertEquals(six.get("days"), unchanged.get("days"));
    }

    @Test
    void deleting_a_card_removes_it_from_session_without_error() throws Exception { // IT-01 (xoá thẻ)
        String token = newUser();
        String id = draftPath(token, "10", null).get("id").asText();
        activate(token, id, Map.of("startDate", "2026-11-01"));
        JsonNode p1 = pathOn(token, id, "2026-11-01");
        JsonNode task = p1.get("today").get("tasks").get(0);
        String deckId = task.get("deckId").asText();
        String cardId = task.get("cardIds").get(0).asText();
        int before = p1.get("today").get("newCount").asInt();

        call(delete("/api/decks/" + deckId + "/cards/" + cardId), token, null).andExpect(status().isNoContent());
        JsonNode s = session(token, id, "today", "2026-11-01");
        assertEquals(before - 1, s.get("counts").get("new").asInt());
        for (JsonNode c : s.get("cards")) assertNotEquals(cardId, c.get("cardId").asText());
        JsonNode p = pathOn(token, id, "2026-11-01");
        assertEquals(11, p.get("chapters").get(0).get("cardCount").asInt());
        assertEquals(19, p.get("completion").get("total").asInt());
        assertEquals(before - 1, p.get("today").get("newCount").asInt());
        assertEquals(19, cardRows(id));
    }

    @Autowired
    LearningPathRepository pathRepo;

    @Autowired
    PlatformTransactionManager txm;

    @Test
    void activate_concurrent_single_folder() throws Exception { // LP-13
        String token = newUser();
        String id = draftPath(token, "10", "Đồng thời").get("id").asText();
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch go = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<MvcResult>> futures = new ArrayList<>();
            for (int i = 0; i < 2; i++) {
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    assertTrue(go.await(10, TimeUnit.SECONDS), "hiệu lệnh xuất phát không tới");
                    return call(post(BASE + id + "/activate"), token, Map.of()).andReturn();
                }));
            }
            assertTrue(ready.await(10, TimeUnit.SECONDS));
            go.countDown();
            List<Integer> statuses = new ArrayList<>();
            for (Future<MvcResult> f : futures) {
                MvcResult r = f.get(60, TimeUnit.SECONDS);
                statuses.add(r.getResponse().getStatus());
                if (r.getResponse().getStatus() == 409) {
                    // đúng xung đột "không còn DRAFT" (đọc dòng sau khi request kia commit), không phải 4xx nào khác
                    assertEquals("Chỉ sửa được khi lộ trình đang ở bước xem trước.",
                            json.readTree(r.getResponse().getContentAsString()).get("message").asText());
                }
            }
            Collections.sort(statuses);
            assertEquals(List.of(201, 409), statuses, statuses.toString());
        } finally {
            pool.shutdownNow();
        }
        JsonNode folders = read(call(get("/api/folders"), token, null).andExpect(status().isOk()));
        int n = 0;
        for (JsonNode f : folders) if (f.get("title").asText().startsWith("Đồng thời")) n++;
        assertEquals(1, n, folders.toString());
        JsonNode p = read(call(get(BASE + id), token, null).andExpect(status().isOk()));
        assertEquals("ACTIVE", p.get("status").asText());
        JsonNode decks = read(call(get("/api/decks").param("folderId", p.get("folderId").asText()), token, null)
                .andExpect(status().isOk()));
        assertEquals(2, decks.size());
        assertEquals(20, cardRows(id));

        // Chứng minh chính khoá dòng xếp hàng (không phải B tình cờ chạy sau khi A commit): test giữ SELECT ... FOR UPDATE trên một
        // bản nháp khác trong transaction của mình -> activate ở thread khác đứng chờ (chưa xong sau 500 ms), commit xong mới
        // chạy tiếp và thành công
        String email = newEmail();
        String token2 = newUser(email);
        Long uid = userId(email);
        String id2 = draftPath(token2, "10", "Khoá dòng").get("id").asText();
        ExecutorService single = Executors.newSingleThreadExecutor();
        try {
            Future<Integer> blocked = new TransactionTemplate(txm).execute(s -> {
                assertTrue(pathRepo.lockByIdAndUserId(UUID.fromString(id2), uid).isPresent());
                Future<Integer> f = single.submit(() ->
                        call(post(BASE + id2 + "/activate"), token2, Map.of()).andReturn().getResponse().getStatus());
                try {
                    Thread.sleep(500);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                assertFalse(f.isDone(), "activate phải chờ khoá dòng của lộ trình");
                return f;
            });
            assertEquals(201, blocked.get(10, TimeUnit.SECONDS).intValue());
        } finally {
            single.shutdownNow();
        }
        assertEquals("ACTIVE", read(call(get(BASE + id2), token2, null)).get("status").asText());
    }

    @Test
    void list_and_today_summary_batch_counts() throws Exception { // LP-7, LP-16
        String token = newUser();
        String id = draftPath(token, "10", "Batch").get("id").asText();
        activate(token, id, Map.of("startDate", "2026-11-01"));
        String draftId = draftPath(token, "5", "Nháp").get("id").asText();
        JsonNode full = pathOn(token, id, "2026-11-02");
        int n1 = cardIdsOfDay(full, 1).size();
        int n2 = cardIdsOfDay(full, 2).size();

        JsonNode list = read(call(get("/api/learning-paths").param("date", "2026-11-02"), token, null).andExpect(status().isOk()));
        assertEquals(2, list.size());
        JsonNode draft = list.get(0); // mới nhất trước
        assertEquals(draftId, draft.get("id").asText());
        assertFalse(draft.has("today"));
        assertFalse(draft.has("completion"));
        assertEquals("DONE", draft.get("job").get("status").asText());
        JsonNode active = list.get(1);
        assertEquals(id, active.get("id").asText());
        assertFalse(active.has("chapters"));
        assertFalse(active.has("days"));
        assertFalse(active.has("forecast"));
        JsonNode today = active.get("today");
        assertEquals(2, today.get("dayIndex").asInt());
        assertEquals("during", today.get("state").asText());
        assertEquals(n2, today.get("newCount").asInt());
        assertEquals(0, today.get("dueCount").asInt());
        assertEquals(n1, today.get("behindCount").asInt());
        JsonNode task = today.get("tasks").get(0);
        assertEquals(n2, task.get("count").asInt());
        assertEquals(n2, task.get("cardIds").size());
        assertEquals(task.get("fromPos").asInt() + n2 - 1, task.get("toPos").asInt());
        assertEquals(20, active.get("completion").get("total").asInt());

        JsonNode summary = read(call(get("/api/learning-paths/today-summary").param("date", "2026-11-02"), token, null)
                .andExpect(status().isOk()));
        assertEquals(1, summary.size());
        JsonNode s = summary.get(0);
        assertEquals(id, s.get("pathId").asText());
        assertEquals("Batch", s.get("title").asText());
        assertEquals(2, s.get("dayIndex").asInt());
        assertEquals(10, s.get("totalDays").asInt());
        assertEquals("during", s.get("state").asText());
        assertEquals(n2, s.get("newCount").asInt());
        assertEquals(0, s.get("dueCount").asInt());
        assertEquals(n1, s.get("behindCount").asInt());
        assertEquals("1111111", s.get("studyDays").asText());
        assertEquals(50, s.get("dailyCap").asInt());

        JsonNode before = read(call(get("/api/learning-paths/today-summary").param("date", "2026-10-31"), token, null)).get(0);
        assertEquals("before", before.get("state").asText());
        assertEquals(0, before.get("dayIndex").asInt());
        assertEquals(0, before.get("newCount").asInt());
        assertEquals(0, before.get("behindCount").asInt());
        JsonNode after = read(call(get("/api/learning-paths/today-summary").param("date", "2026-11-20"), token, null)).get(0);
        assertEquals("after", after.get("state").asText());
        assertEquals(20, after.get("dayIndex").asInt());
        assertEquals(20, after.get("behindCount").asInt());
        assertEquals(0, after.get("newCount").asInt());
        assertEquals(0, read(call(get("/api/learning-paths/today-summary"), newUser(), null).andExpect(status().isOk())).size());
    }

    @Test
    void create_accepts_daily_cap_and_study_days_and_validates_them() throws Exception {
        String token = newUser();
        JsonNode created = read(postPathParts(token, Map.of("text", TEXT, "days", "7", "dailyCap", "20", "studyDays", "1111100",
                "startDate", "2026-11-06")).andExpect(status().isAccepted()));
        assertEquals(20, created.get("dailyCap").asInt());
        assertEquals("1111100", created.get("studyDays").asText());
        assertTrue(created.get("reminder").asBoolean());

        // §3.5: days[].date của BẢN NHÁP đi qua dateForDay theo studyDays y như lúc ACTIVE — 6/11 là thứ 6, ngày 2 là thứ 2 9/11,
        // không phải thứ 7 7/11; kích hoạt xong các ngày không được nhảy chỗ
        String id = created.get("id").asText();
        JsonNode draft = awaitDraft(token, id);
        assertEquals("DRAFT", draft.get("status").asText(), draft.toString());
        List<String> draftDates = new ArrayList<>();
        draft.get("days").forEach(d -> draftDates.add(d.get("date").asText()));
        assertEquals(List.of("2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-16"),
                draftDates);
        JsonNode sat = read(call(patch(BASE + id), token, Map.of("startDate", "2026-11-07")).andExpect(status().isOk()));
        assertEquals("2026-11-09", sat.get("days").get(0).get("date").asText()); // bắt đầu thứ 7 -> ngày 1 là thứ 2 kế tiếp
        JsonNode active = activate(token, id, Map.of("startDate", "2026-11-06"));
        List<String> activeDates = new ArrayList<>();
        active.get("days").forEach(d -> activeDates.add(d.get("date").asText()));
        assertEquals(draftDates, activeDates);

        postPathParts(token, Map.of("text", TEXT, "days", "7", "dailyCap", "3")).andExpect(status().isBadRequest());
        postPathParts(token, Map.of("text", TEXT, "days", "7", "dailyCap", "abc")).andExpect(status().isBadRequest());
        postPathParts(token, Map.of("text", TEXT, "days", "7", "studyDays", "0000000")).andExpect(status().isBadRequest());
        postPathParts(token, Map.of("text", TEXT, "days", "7", "studyDays", "1234567")).andExpect(status().isBadRequest());
        // Lỗi kiểm tra đầu vào không tốn lượt hạn mức (5 lượt / ngày): còn tạo được đúng 4 lộ trình nữa
        for (int i = 0; i < 4; i++) postPath(token, TEXT, "5", null).andExpect(status().isAccepted());
        postPath(token, TEXT, "5", null).andExpect(status().isTooManyRequests());
    }

    @Test
    void replan_past_day_365_is_a_business_error_not_500() throws Exception {
        // total_days có CHECK ≤ 365 (V13): xếp lại / kéo dài quá mốc đó phải là 409 trước khi ghi, không phải vỡ ở flush
        String token = newUser();
        String id = draftPath(token, "365", null).get("id").asText();
        activate(token, id, Map.of("startDate", "2026-11-01"));
        String day366 = LocalDate.of(2026, 11, 1).plusDays(365).toString();
        JsonNode res = read(call(post(BASE + id + "/rebalance").param("date", day366), token, Map.of("extend", false))
                .andExpect(status().isConflict()));
        assertTrue(res.get("message").asText().contains("365"), res.toString());
        call(post(BASE + id + "/rebalance").param("date", day366), token, Map.of("extend", true)).andExpect(status().isConflict());
        call(patch(BASE + id).param("date", day366), token, Map.of("dailyCap", 20)).andExpect(status().isConflict());
        // không ghi dở: trần, số ngày, lịch thẻ y nguyên
        JsonNode p = pathOn(token, id, day366);
        assertEquals(365, p.get("totalDays").asInt());
        assertEquals(50, p.get("dailyCap").asInt());
        assertEquals("after", p.get("today").get("state").asText());
        assertFalse(p.has("lastRebalancedAt"));
        assertEquals(Integer.valueOf(0), jdbc.queryForObject(
                "SELECT count(*) FROM learning_path_cards WHERE path_id = ? AND scheduled_day > 365", Integer.class, UUID.fromString(id)));
        // kéo dài trong giới hạn vẫn chạy: ngày 300 còn 20 thẻ nợ -> dồn vào các ngày 300.., total_days giữ 365
        String day300 = LocalDate.of(2026, 11, 1).plusDays(299).toString();
        JsonNode ok = read(call(post(BASE + id + "/rebalance").param("date", day300), token, Map.of("extend", true))
                .andExpect(status().isOk()));
        assertEquals(365, ok.get("totalDays").asInt());
        assertEquals(0, ok.get("today").get("behindCount").asInt());
    }

    @Test
    void due_boundary_is_start_of_next_day_in_zone() throws Exception {
        // "đến hạn trong ngày" = due_at < 00:00 ngày kế tiếp theo Asia/Ho_Chi_Minh, cùng một mốc ở cả bốn nơi đếm
        String token = newUser();
        String id = draftPath(token, "10", null).get("id").asText();
        activate(token, id, Map.of("startDate", "2026-11-01"));
        JsonNode p1 = pathOn(token, id, "2026-11-01");
        String cid = cardIdsOfDay(p1, 1).get(0);
        String c1 = p1.get("chapters").get(0).get("id").asText();
        review(token, cid, "good");

        pinDue(cid, "2026-11-02T16:59:59Z"); // 23:59:59 +07 ngày 2/11 -> đến hạn ngày 2/11
        assertDue(token, id, "2026-11-02", 1);
        JsonNode s = session(token, id, "today", "2026-11-02");
        assertEquals("due", s.get("cards").get(0).get("mode").asText());
        assertEquals(cid, s.get("cards").get(0).get("cardId").asText());

        pinDue(cid, "2026-11-02T17:00:00Z"); // 00:00 +07 ngày 3/11 -> chưa đến hạn ngày 2/11, đến hạn ngày 3/11
        assertDue(token, id, "2026-11-02", 0);
        assertDue(token, id, "2026-11-03", 1);
        JsonNode chapter = read(call(get(BASE + id + "/session").param("kind", "chapter").param("chapterId", c1)
                .param("date", "2026-11-02"), token, null).andExpect(status().isOk()));
        JsonNode learned = null;
        for (JsonNode c : chapter.get("cards")) if (cid.equals(c.get("cardId").asText())) learned = c;
        assertNotNull(learned, chapter.toString());
        assertEquals("cram", learned.get("mode").asText()); // đã ôn, chưa đến hạn -> luyện (chỉ ghi log)
        assertEquals(0, chapter.get("counts").get("due").asInt());
        // dự báo ngày 3 = 0.9 × thẻ mới ngày 2 + 1 thẻ đến hạn thật (rơi đúng ngày 3, không phải ngày 2)
        JsonNode f = pathOn(token, id, "2026-11-02").get("forecast");
        assertEquals(0.9 * f.get(1).get("newCount").asInt() + 1, f.get(2).get("predictedReviews").asDouble(), 1e-9);
        // ngày 2: thẻ đã học (lịch thật) không còn được dự báo -> chỉ (thẻ mới ngày 1 − 1) × 0.9, và không có đến hạn thật
        assertEquals(0.9 * (f.get(0).get("newCount").asInt() - 1), f.get(1).get("predictedReviews").asDouble(), 1e-9);
    }

    @Test
    void overflow_flag_and_draft_overcap_follow_the_plan() throws Exception { // S-02 + §3.6 qua API
        String token = newUser();
        String id = read(postPathParts(token, Map.of("text", TEXT, "days", "1", "dailyCap", "10")).andExpect(status().isAccepted()))
                .get("id").asText();
        JsonNode draft = awaitDraft(token, id);
        assertEquals("DRAFT", draft.get("status").asText(), draft.toString());
        assertTrue(draft.get("overCap").asBoolean(), draft.toString()); // 20 thẻ / 1 ngày / trần 10
        assertEquals(7, draft.get("suggestedDays").asInt(), draft.toString());

        JsonNode active = read(call(post(BASE + id + "/activate").param("date", "2026-11-01"), token,
                Map.of("startDate", "2026-11-01")).andExpect(status().isCreated()));
        assertTrue(active.get("overflow").asBoolean(), active.toString()); // vẫn kích hoạt, UI cảnh báo
        assertEquals(20, active.get("today").get("newCount").asInt());
        assertTrue(active.get("forecast").get(0).get("overCap").asBoolean());

        JsonNode seven = read(call(patch(BASE + id).param("date", "2026-11-01"), token, Map.of("totalDays", 7))
                .andExpect(status().isOk()));
        assertFalse(seven.has("overflow"), seven.toString());
        for (JsonNode f : seven.get("forecast")) assertFalse(f.get("overCap").asBoolean(), f.toString());
        UUID pid = UUID.fromString(id);
        assertEquals(Integer.valueOf(7), jdbc.queryForObject(
                "SELECT max(scheduled_day) FROM learning_path_cards WHERE path_id = ?", Integer.class, pid));

        JsonNode one = read(call(patch(BASE + id).param("date", "2026-11-01"), token, Map.of("totalDays", 1))
                .andExpect(status().isOk()));
        assertTrue(one.get("overflow").asBoolean(), one.toString());
        assertEquals(1, one.get("totalDays").asInt());

        // Áp dụng gợi ý ở bản nháp rồi kích hoạt: không bao giờ cảnh báo (§3.6)
        String other = newUser();
        String id2 = read(postPathParts(other, Map.of("text", TEXT, "days", "1", "dailyCap", "10")).andExpect(status().isAccepted()))
                .get("id").asText();
        int suggested = awaitDraft(other, id2).get("suggestedDays").asInt();
        JsonNode applied = read(call(patch(BASE + id2), other, Map.of("totalDays", suggested)).andExpect(status().isOk()));
        assertFalse(applied.get("overCap").asBoolean(), applied.toString());
        assertEquals(suggested, applied.get("suggestedDays").asInt());
        JsonNode a2 = activate(other, id2, Map.of("startDate", "2026-11-01"));
        assertFalse(a2.has("overflow"), a2.toString());
        for (JsonNode f : a2.get("forecast")) assertFalse(f.get("overCap").asBoolean(), f.toString());
    }

    @Test
    void rest_and_after_day_sessions() throws Exception {
        String token = newUser();
        String id = read(postPathParts(token, Map.of("text", TEXT, "days", "6", "studyDays", "1111100")).andExpect(status().isAccepted()))
                .get("id").asText();
        assertEquals("DRAFT", awaitDraft(token, id).get("status").asText());
        // /today-summary chỉ gồm lộ trình ACTIVE: người chỉ có bản nháp nhận []
        assertEquals(0, read(call(get(BASE + "today-summary"), token, null).andExpect(status().isOk())).size());
        activate(token, id, Map.of("startDate", "2026-11-02")); // thứ 2: ngày 1..5 = 2–6/11, ngày 6 = thứ 2 9/11
        JsonNode p = pathOn(token, id, "2026-11-02");
        assertEquals("2026-11-06", p.get("days").get(4).get("date").asText());
        assertEquals("2026-11-09", p.get("days").get(5).get("date").asText());
        int firstFive = 0;
        for (int d = 1; d <= 5; d++) firstFive += cardIdsOfDay(p, d).size();
        String cid = cardIdsOfDay(p, 1).get(0);
        review(token, cid, "good");
        pinDue(cid, "2026-11-07T03:00:00Z"); // 10:00 +07 thứ 7 7/11 (ngày nghỉ)

        // ngày nghỉ: phiên chỉ có thẻ đến hạn; nợ tính cả ngày học 5 vừa trôi qua
        JsonNode rest = session(token, id, "today", "2026-11-07");
        assertEquals("rest", rest.get("state").asText());
        assertEquals(5, rest.get("dayIndex").asInt());
        JsonNode rc = rest.get("counts");
        assertEquals(0, rc.get("new").asInt());
        assertEquals(1, rc.get("due").asInt());
        assertEquals(0, rc.get("catchup").asInt());
        assertEquals(1, rc.get("total").asInt());
        assertEquals(cid, rest.get("cards").get(0).get("cardId").asText());
        assertEquals("due", rest.get("cards").get(0).get("mode").asText());
        JsonNode sat = pathOn(token, id, "2026-11-07").get("today");
        assertEquals("rest", sat.get("state").asText());
        assertEquals(0, sat.get("newCount").asInt());
        assertEquals(1, sat.get("dueCount").asInt());
        assertEquals(firstFive - 1, sat.get("behindCount").asInt());
        assertEquals(0, sat.get("tasks").size());
        JsonNode summary = read(call(get(BASE + "today-summary").param("date", "2026-11-07"), token, null).andExpect(status().isOk()));
        assertEquals(1, summary.size());
        assertEquals("rest", summary.get(0).get("state").asText());
        assertEquals(5, summary.get(0).get("dayIndex").asInt());
        assertEquals(0, summary.get(0).get("newCount").asInt());
        assertEquals(1, summary.get(0).get("dueCount").asInt());
        assertEquals(firstFive - 1, summary.get(0).get("behindCount").asInt());
        assertEquals(firstFive - 1, session(token, id, "catchup", "2026-11-07").get("cards").size());

        // qua ngày cuối (thứ 3 10/11 = ngày 7 > 6): đến hạn + nợ, không có thẻ mới
        JsonNode after = session(token, id, "today", "2026-11-10");
        assertEquals("after", after.get("state").asText());
        assertEquals(7, after.get("dayIndex").asInt());
        JsonNode ac = after.get("counts");
        assertEquals(0, ac.get("new").asInt());
        assertEquals(1, ac.get("due").asInt());
        assertEquals(19, ac.get("catchup").asInt());
        assertEquals(20, ac.get("total").asInt());
        assertEquals("due", after.get("cards").get(0).get("mode").asText());
        for (int i = 1; i < 20; i++) assertEquals("new", after.get("cards").get(i).get("mode").asText());
    }

    @Test
    void today_session_caps_catchup_but_keeps_new_cards() throws Exception {
        // room = dailyCap − đến hạn − mới hôm nay; nợ bị cắt về room, thẻ mới của hôm nay không bao giờ bị bỏ
        String token = newUser();
        String id = read(postPathParts(token, Map.of("text", TEXT, "days", "20", "dailyCap", "5")).andExpect(status().isAccepted()))
                .get("id").asText();
        assertEquals("DRAFT", awaitDraft(token, id).get("status").asText());
        activate(token, id, Map.of("startDate", "2026-11-01"));
        JsonNode p = pathOn(token, id, "2026-11-10");
        List<String> fresh = cardIdsOfDay(p, 10);
        int behind = 0;
        for (int d = 1; d <= 9; d++) behind += cardIdsOfDay(p, d).size();
        assertTrue(!fresh.isEmpty() && behind > 5 - fresh.size(), "ngày 10 phải có thẻ mới và nợ vượt chỗ trống: mới "
                + fresh.size() + ", nợ " + behind);
        assertEquals(behind, p.get("today").get("behindCount").asInt());

        JsonNode s = session(token, id, "today", "2026-11-10");
        JsonNode c = s.get("counts");
        assertEquals(fresh.size(), c.get("new").asInt());
        assertEquals(0, c.get("due").asInt());
        assertEquals(Math.min(behind, 5 - fresh.size()), c.get("catchup").asInt());
        assertEquals(c.get("new").asInt() + c.get("catchup").asInt(), c.get("total").asInt());
        assertEquals(c.get("total").asInt(), s.get("cards").size());
        List<String> tail = new ArrayList<>();
        for (int i = 0; i < s.get("cards").size(); i++) {
            assertEquals("new", s.get("cards").get(i).get("mode").asText());
            if (i >= c.get("catchup").asInt()) tail.add(s.get("cards").get(i).get("cardId").asText());
        }
        assertEquals(fresh, tail); // phần cuối phiên là đúng các thẻ xếp cho ngày 10, theo seq
        assertEquals(behind, session(token, id, "catchup", "2026-11-10").get("cards").size()); // kind=catchup: không cắt
    }

    @Test
    void patch_start_date_on_active_replans_from_new_start() throws Exception {
        String token = newUser();
        String id = draftPath(token, "10", null).get("id").asText();
        activate(token, id, Map.of("startDate", "2026-11-01"));
        List<String> day1 = cardIdsOfDay(pathOn(token, id, "2026-11-01"), 1);
        review(token, day1.get(0), "good");
        review(token, day1.get(1), "good");
        UUID pid = UUID.fromString(id);

        // Dời ngày bắt đầu về sau: hôm nay (1/11) thành "trước ngày học 1" -> xếp lại từ ngày 1; thẻ đã học vẫn ngày 1
        JsonNode later = read(call(patch(BASE + id).param("date", "2026-11-01"), token, Map.of("startDate", "2026-11-03"))
                .andExpect(status().isOk()));
        assertEquals("2026-11-03", later.get("startDate").asText());
        assertEquals("2026-11-03", later.get("days").get(0).get("date").asText());
        assertEquals("before", later.get("today").get("state").asText());
        assertEquals(1, scheduledDay(id, day1.get(0)));
        assertEquals(1, scheduledDay(id, day1.get(1)));
        assertEquals(Integer.valueOf(0), jdbc.queryForObject(
                "SELECT count(*) FROM learning_path_cards WHERE path_id = ? AND scheduled_day NOT BETWEEN 1 AND 10", Integer.class, pid));
        int sum = 0;
        for (int d = 1; d <= 10; d++) sum += cardIdsOfDay(later, d).size();
        assertEquals(20, sum);

        // Kéo ngày bắt đầu về trước: 1/11 thành ngày 8 theo startDate MỚI -> thẻ chưa học chỉ từ ngày 8 (không vào quá khứ),
        // thẻ đã học giữ ngày 1, total_days không đổi
        JsonNode earlier = read(call(patch(BASE + id).param("date", "2026-11-01"), token, Map.of("startDate", "2026-10-25"))
                .andExpect(status().isOk()));
        assertEquals(8, earlier.get("today").get("dayIndex").asInt());
        assertEquals("during", earlier.get("today").get("state").asText());
        assertEquals(0, earlier.get("today").get("behindCount").asInt());
        assertEquals(10, earlier.get("totalDays").asInt());
        assertFalse(earlier.has("overflow"));
        assertEquals(Integer.valueOf(8), jdbc.queryForObject("SELECT min(scheduled_day) FROM learning_path_cards "
                + "WHERE path_id = ? AND card_id NOT IN (?, ?)", Integer.class, pid, day1.get(0), day1.get(1)));
        assertEquals(Integer.valueOf(10), jdbc.queryForObject(
                "SELECT max(scheduled_day) FROM learning_path_cards WHERE path_id = ?", Integer.class, pid));
        assertEquals(1, scheduledDay(id, day1.get(0)));
        assertEquals(1, scheduledDay(id, day1.get(1)));
        assertEquals(2, cardIdsOfDay(earlier, 1).size());
        for (int d = 2; d <= 7; d++) assertEquals(0, cardIdsOfDay(earlier, d).size(), "ngày " + d);
        assertEquals(18, cardIdsOfDay(earlier, 8).size() + cardIdsOfDay(earlier, 9).size() + cardIdsOfDay(earlier, 10).size());
    }

    @Test
    void delete_while_processing_is_409_and_delete_keeps_cancelled_job() throws Exception { // LP-10
        String token = newUser();
        CountDownLatch gate = new CountDownLatch(1);
        AiDtos.AnalyzeResult result = new AiDtos.AnalyzeResult(chapterItems(), Map.of("chaptersDetected", false), false);
        Mockito.doAnswer(inv -> {
            gate.await(10, TimeUnit.SECONDS);
            return result;
        }).when(ai).analyze(anyString(), any(), any());
        JsonNode created = read(postPath(token, TEXT, "5", null).andExpect(status().isAccepted()));
        String id = created.get("id").asText();
        String jobId = created.get("jobId").asText();
        try {
            // worker đang ghi vào job -> không xoá dưới chân nó
            JsonNode res = read(call(delete(BASE + id), token, null).andExpect(status().isConflict()));
            assertEquals("Đang xử lý, hãy chờ xong rồi xoá.", res.get("message").asText(), res.toString());
        } finally {
            gate.countDown();
        }
        assertEquals("DRAFT", awaitDraft(token, id).get("status").asText());
        UUID jid = UUID.fromString(jobId);
        assertTrue(jdbc.queryForObject("SELECT count(*) FROM extraction_items WHERE job_id = ?", Integer.class, jid) > 0);
        assertNotNull(jdbc.queryForObject("SELECT extracted_text FROM extraction_jobs WHERE id = ?", String.class, jid));

        call(delete(BASE + id), token, null).andExpect(status().isNoContent());
        call(get(BASE + id), token, null).andExpect(status().isNotFound());
        // dòng job giữ lại ở CANCELLED (hạn mức đếm theo job nên không được hoàn lượt); văn bản + item đã xoá
        assertEquals("CANCELLED", jdbc.queryForObject("SELECT status FROM extraction_jobs WHERE id = ?", String.class, jid));
        assertNull(jdbc.queryForObject("SELECT extracted_text FROM extraction_jobs WHERE id = ?", String.class, jid));
        assertEquals(Integer.valueOf(0), jdbc.queryForObject("SELECT count(*) FROM extraction_items WHERE job_id = ?", Integer.class, jid));
        JsonNode viaApi = read(call(get("/api/extractions/" + jobId), token, null).andExpect(status().isOk()));
        assertEquals("CANCELLED", viaApi.get("status").asText());
        // lượt đã dùng vẫn tính: 5 lượt / 24 giờ -> còn đúng 4
        for (int i = 0; i < 4; i++) postPath(token, TEXT, "5", null).andExpect(status().isAccepted());
        postPath(token, TEXT, "5", null).andExpect(status().isTooManyRequests());
    }
    // ---------- 2.0 phần B: chạy lại / dịch lại (LP-6), kiểm tra chương (D4), hoàn thành, thông báo (§4.4) ----------

    /** Từ vựng với nghĩa VI tuỳ ý (null = chưa có nghĩa VI, chờ bước dịch) — nghĩa khác nhau mới sinh được 4 lựa chọn quiz. */
    private static AiDtos.Item vocabVi(int pos, String term, Integer chapter, String meaningVi) {
        return new AiDtos.Item("vocab", pos, term, term, null, null, null, "名詞", "en", meaningVi, "N5", 1.0,
                List.of(), 1, null, null, false, chapter);
    }

    private JsonNode notifications(String token) throws Exception {
        return read(call(get("/api/notifications"), token, null).andExpect(status().isOk())).get("items");
    }

    private List<JsonNode> notificationsOf(String token, String type) throws Exception {
        List<JsonNode> out = new ArrayList<>();
        for (JsonNode n : notifications(token)) if (type.equals(n.get("type").asText())) out.add(n);
        return out;
    }

    private int jobCount(Long uid) {
        return jdbc.queryForObject("SELECT count(*) FROM extraction_jobs WHERE user_id = ?", Integer.class, uid);
    }

    @Test
    void retry_failed_path_reruns_analyze_without_consuming_quota() throws Exception { // IT-03, LP-6
        Mockito.when(ai.analyze(anyString(), any(), any()))
                .thenThrow(new AiServiceClient.AiServiceException("Không kết nối được dịch vụ AI (phân tích từ vựng)."));
        String email = newEmail();
        String token = newUser(email);
        Long uid = userId(email);
        JsonNode created = read(postPath(token, TEXT, "5", "Thử lại").andExpect(status().isAccepted()));
        String id = created.get("id").asText();
        assertEquals("FAILED", awaitDraft(token, id).get("status").asText());
        List<JsonNode> failedNotes = notificationsOf(token, "LEARNING_PATH_FAILED");
        assertEquals(1, failedNotes.size(), notifications(token).toString());
        JsonNode failedPayload = failedNotes.get(0).get("payload");
        assertEquals(id, failedPayload.get("pathId").asText());
        assertEquals("Thử lại", failedPayload.get("title").asText());
        assertTrue(failedPayload.get("reason").asText().contains("dịch vụ AI"), failedPayload.toString());
        assertEquals(0, notificationsOf(token, "LEARNING_PATH_READY").size());
        int jobsBefore = jobCount(uid);

        // FAILED nhưng job đã mất văn bản (housekeeping) -> 400, trạng thái không đổi
        String other = newUser();
        JsonNode c2 = read(postPath(other, TEXT, "5", null).andExpect(status().isAccepted()));
        String id2 = c2.get("id").asText();
        assertEquals("FAILED", awaitDraft(other, id2).get("status").asText());
        jdbc.update("UPDATE extraction_jobs SET extracted_text = NULL WHERE id = ?", UUID.fromString(c2.get("jobId").asText()));
        JsonNode noText = read(call(post(BASE + id2 + "/retry"), other, null).andExpect(status().isBadRequest()));
        assertEquals("Hãy tạo lại lộ trình với tài liệu mới.", noText.get("message").asText(), noText.toString());
        assertEquals("FAILED", read(call(get(BASE + id2), other, null)).get("status").asText());
        call(post(BASE + id + "/retry"), other, null).andExpect(status().isNotFound());

        // Hàng đợi worker đầy (executor ném RejectedExecutionException lúc đẩy job): 429, lộ trình về FAILED kèm lý do — không kẹt
        // PROCESSING mà không có worker nào chạy — job cũng FAILED; sau đó chạy lại vẫn được
        Mockito.doThrow(new RejectedExecutionException("đầy")).when(extractionExecutor).submit(any(Callable.class));
        JsonNode busy = read(call(post(BASE + id + "/retry"), token, null).andExpect(status().isTooManyRequests()));
        assertEquals("Hệ thống đang bận, vui lòng thử lại sau ít phút.", busy.get("message").asText(), busy.toString());
        JsonNode stuck = read(call(get(BASE + id), token, null).andExpect(status().isOk()));
        assertEquals("FAILED", stuck.get("status").asText(), stuck.toString());
        assertEquals("Hệ thống đang bận, vui lòng thử lại sau ít phút.", stuck.get("errorMessage").asText());
        assertEquals("FAILED", stuck.get("job").get("status").asText());
        Mockito.doCallRealMethod().when(extractionExecutor).submit(any(Callable.class));

        // ai-service hồi phục -> chạy lại chỉ bước ANALYZE trên văn bản đã trích, không tạo job mới
        Mockito.reset(ai);
        stubAi();
        JsonNode retried = read(call(post(BASE + id + "/retry").param("date", "2026-11-01"), token, null)
                .andExpect(status().isAccepted()));
        assertEquals("PROCESSING", retried.get("status").asText());
        assertFalse(retried.has("errorMessage"), retried.toString());
        JsonNode draft = awaitDraft(token, id);
        assertEquals("DRAFT", draft.get("status").asText(), draft.toString());
        assertEquals(2, draft.get("chapters").size());
        assertEquals(12, draft.get("chapters").get(0).get("cardCount").asInt());
        assertEquals("DONE", draft.get("job").get("status").asText());
        assertFalse(draft.has("errorMessage"));
        assertEquals(jobsBefore, jobCount(uid), "chạy lại không tạo job mới");
        Mockito.verify(ai, Mockito.never()).extractText(any(), any(), any(), any(), any());
        List<JsonNode> ready = notificationsOf(token, "LEARNING_PATH_READY");
        assertEquals(1, ready.size());
        assertEquals(id, ready.get(0).get("payload").get("pathId").asText());
        assertEquals("Thử lại", ready.get(0).get("payload").get("title").asText());
        assertEquals(2, ready.get(0).get("payload").get("chapters").asInt());
        // không còn FAILED -> 409; bản nháp kích hoạt được như thường
        JsonNode res = read(call(post(BASE + id + "/retry"), token, null).andExpect(status().isConflict()));
        assertEquals("Chỉ chạy lại được lộ trình đã lỗi.", res.get("message").asText(), res.toString());
        assertEquals("ACTIVE", activate(token, id, Map.of("startDate", "2026-11-01")).get("status").asText());
        // lượt hạn mức (5 / 24 giờ): lần tạo đầu tốn 1, chạy lại không tốn -> còn đúng 4
        for (int i = 0; i < 4; i++) postPath(token, TEXT, "5", null).andExpect(status().isAccepted());
        postPath(token, TEXT, "5", null).andExpect(status().isTooManyRequests());
    }

    private JsonNode awaitEnriched(String token, String id) throws Exception {
        for (int i = 0; i < 100; i++) {
            JsonNode path = read(call(get(BASE + id), token, null).andExpect(status().isOk()));
            JsonNode job = path.get("job");
            if ("DONE".equals(job.get("status").asText()) && job.get("stats").has("enrichedAt")) return path;
            Thread.sleep(100);
        }
        throw new AssertionError("dịch lại nghĩa không xong sau 10 giây");
    }

    @Test
    void enrich_retranslates_items_without_changing_status_and_throttles() throws Exception { // LP-6
        // ANALYZE trả item chưa có nghĩa VI, ENRICH lần đầu hết quota -> bản nháp mang enrichReason
        List<AiDtos.Item> list = new ArrayList<>();
        int pos = 0;
        for (int i = 0; i < 12; i++) list.add(vocabVi(++pos, "語" + pos, 1, null));
        for (int i = 0; i < 8; i++) list.add(vocabVi(++pos, "語" + pos, 2, null));
        stubAnalyze(list, Map.of("vocab", 20, "grammar", 0, "chaptersDetected", true, "chapters", List.of(
                Map.of("index", 1, "title", "Bài 1"), Map.of("index", 2, "title", "Bài 2"))));
        Mockito.doReturn(new AiDtos.EnrichResult(false, List.of(), "quota")).when(ai).enrich(any());
        String token = newUser();
        JsonNode draft = draftPath(token, "10", null);
        String id = draft.get("id").asText();
        String c1 = draft.get("chapters").get(0).get("id").asText();
        assertEquals("quota", draft.get("job").get("stats").get("enrichReason").asText(), draft.toString());
        assertTrue(read(call(get(BASE + id + "/chapters/" + c1 + "/items"), token, null)).get(0).get("meaningVi").isNull());

        call(post(BASE + id + "/enrich"), newUser(), null).andExpect(status().isNotFound());
        Mockito.doAnswer(inv -> {
            AiDtos.EnrichRequest req = inv.getArgument(0);
            return new AiDtos.EnrichResult(true, req.items().stream()
                    .map(i -> new AiDtos.EnrichOutput(i.ref(), "nghĩa " + i.term(), null)).toList(), null);
        }).when(ai).enrich(any());
        JsonNode res = read(call(post(BASE + id + "/enrich").param("date", "2026-11-01"), token, null)
                .andExpect(status().isAccepted()));
        assertEquals("DRAFT", res.get("status").asText()); // trạng thái lộ trình không đổi, job chạy nền
        assertEquals(2, res.get("chapters").size());
        JsonNode after = awaitEnriched(token, id);
        assertEquals("DRAFT", after.get("status").asText());
        assertTrue(after.get("job").get("stats").get("enriched").asBoolean());
        assertFalse(after.get("job").get("stats").has("enrichReason"));
        JsonNode items = read(call(get(BASE + id + "/chapters/" + c1 + "/items"), token, null));
        assertEquals("nghĩa 語1", items.get(0).get("meaningVi").asText());
        // trong 5 phút -> 429 như bóc tách thường
        call(post(BASE + id + "/enrich"), token, null).andExpect(status().isTooManyRequests());
        UUID jid = UUID.fromString(draft.get("jobId").asText());
        String c2 = draft.get("chapters").get(1).get("id").asText();

        // Trong lúc worker đang dịch lại (job RUNNING, lộ trình vẫn DRAFT): kích hoạt / sửa item / gộp chương / xoá đều 409 — worker
        // ghi item và job bằng UPDATE cả dòng nên ghi chen vào lúc này là ghi đè nhau (job kẹt RUNNING, sửa tay bị trả về bản cũ,
        // CANCELLED thành DONE). Xong rồi thì mọi thao tác chạy như thường.
        jdbc.update("UPDATE extraction_jobs SET stats = stats - 'enrichedAt' WHERE id = ?", jid);
        jdbc.update("UPDATE extraction_items SET meaning_vi = NULL WHERE job_id = ?", jid);
        CountDownLatch gate = new CountDownLatch(1);
        Mockito.doAnswer(inv -> {
            gate.await(10, TimeUnit.SECONDS);
            AiDtos.EnrichRequest req = inv.getArgument(0);
            return new AiDtos.EnrichResult(true, req.items().stream()
                    .map(i -> new AiDtos.EnrichOutput(i.ref(), "nghĩa " + i.term(), null)).toList(), null);
        }).when(ai).enrich(any());
        call(post(BASE + id + "/enrich"), token, null).andExpect(status().isAccepted());
        try {
            JsonNode busy = read(call(post(BASE + id + "/activate"), token, Map.of()).andExpect(status().isConflict()));
            assertEquals("Đang dịch lại nghĩa, hãy chờ xong.", busy.get("message").asText(), busy.toString());
            call(patch(BASE + id + "/items"), token, List.of()).andExpect(status().isConflict());
            call(post(BASE + id + "/chapters/" + c2 + "/merge-up"), token, null).andExpect(status().isConflict());
            JsonNode del = read(call(delete(BASE + id), token, null).andExpect(status().isConflict()));
            assertEquals("Đang dịch lại nghĩa, hãy chờ xong rồi xoá.", del.get("message").asText(), del.toString());
            assertEquals("DRAFT", read(call(get(BASE + id), token, null)).get("status").asText());
        } finally {
            gate.countDown();
        }
        assertEquals("DRAFT", awaitEnriched(token, id).get("status").asText());
        assertEquals("nghĩa 語1", read(call(get(BASE + id + "/chapters/" + c1 + "/items"), token, null)).get(0).get("meaningVi").asText());
        assertEquals(2, read(call(get(BASE + id), token, null)).get("chapters").size());

        // Lần dịch lại bị ngắt (khởi động lại giữa chừng -> failUnfinished): job FAILED nhưng lộ trình vẫn DRAFT và item còn nguyên ->
        // "Dịch lại nghĩa" vẫn nhận (lộ trình không FAILED nên không có đường "Chạy lại"), worker ghi lại DONE
        jdbc.update("UPDATE extraction_jobs SET status = 'FAILED', error_message = 'Máy chủ đã khởi động lại trong lúc xử lý. Hãy chạy lại.', "
                + "stats = stats - 'enrichedAt' WHERE id = ?", jid);
        assertEquals("FAILED", read(call(get(BASE + id), token, null)).get("job").get("status").asText());
        call(post(BASE + id + "/enrich"), token, null).andExpect(status().isAccepted());
        JsonNode recovered = awaitEnriched(token, id);
        assertEquals("DRAFT", recovered.get("status").asText());
        assertEquals("DONE", recovered.get("job").get("status").asText());
        assertFalse(recovered.get("job").hasNonNull("errorMessage"), recovered.get("job").toString()); // JobSummary ghi null tường minh

        // ACTIVE vẫn dịch lại được (qua cooldown), trạng thái giữ ACTIVE và response vẫn là lộ trình đầy đủ; chỉ item được dịch lại,
        // thẻ đã tạo lúc kích hoạt giữ nguyên nghĩa. Kích hoạt sau các lượt dịch lại: job vẫn DONE, deck_ids ghi nhận 2 bộ thẻ
        JsonNode active = activate(token, id, Map.of("startDate", "2026-11-01"));
        String deck1 = active.get("chapters").get(0).get("deckId").asText();
        JsonNode jobAfter = read(call(get("/api/extractions/" + jid), token, null).andExpect(status().isOk()));
        assertEquals("DONE", jobAfter.get("status").asText(), jobAfter.toString());
        assertEquals(2, jobAfter.get("deckIds").size(), jobAfter.toString());
        JsonNode cardsBefore = read(call(get("/api/decks/" + deck1), token, null).andExpect(status().isOk())).get("cards");
        assertEquals("nghĩa 語1", cardsBefore.get(0).get("meaning").asText().lines().findFirst().orElse(""));
        jdbc.update("UPDATE extraction_jobs SET stats = stats - 'enrichedAt' WHERE id = ?", jid);
        jdbc.update("UPDATE extraction_items SET meaning_vi = NULL WHERE job_id = ?", jid);
        Mockito.doAnswer(inv -> {
            AiDtos.EnrichRequest req = inv.getArgument(0);
            return new AiDtos.EnrichResult(true, req.items().stream()
                    .map(i -> new AiDtos.EnrichOutput(i.ref(), "nghĩa mới " + i.term(), null)).toList(), null);
        }).when(ai).enrich(any());
        JsonNode act = read(call(post(BASE + id + "/enrich").param("date", "2026-11-01"), token, null)
                .andExpect(status().isAccepted()));
        assertEquals("ACTIVE", act.get("status").asText());
        assertEquals("during", act.get("today").get("state").asText());
        assertEquals("ACTIVE", awaitEnriched(token, id).get("status").asText());
        assertEquals("nghĩa mới 語1", read(call(get(BASE + id + "/chapters/" + c1 + "/items"), token, null)).get(0).get("meaningVi").asText());
        assertEquals(cardsBefore, read(call(get("/api/decks/" + deck1), token, null)).get("cards"), "thẻ đã tạo không bị viết lại");

        // lộ trình không còn job (learning_paths.job_id SET NULL khi dòng job mất) -> 400
        jdbc.update("UPDATE learning_paths SET job_id = NULL WHERE id = ?", UUID.fromString(id));
        JsonNode noJob = read(call(post(BASE + id + "/enrich"), token, null).andExpect(status().isBadRequest()));
        assertEquals("Dữ liệu bóc tách của lộ trình không còn.", noJob.get("message").asText(), noJob.toString());

        // FAILED -> 409
        Mockito.when(ai.analyze(anyString(), any(), any())).thenThrow(new AiServiceClient.AiServiceException("lỗi"));
        String other = newUser();
        String failed = read(postPath(other, TEXT, "5", null).andExpect(status().isAccepted())).get("id").asText();
        assertEquals("FAILED", awaitDraft(other, failed).get("status").asText());
        JsonNode conflict = read(call(post(BASE + failed + "/enrich"), other, null).andExpect(status().isConflict()));
        assertEquals("Chỉ dịch lại được khi lộ trình ở bản nháp hoặc đang học.", conflict.get("message").asText());
    }

    /**
     * Đang "Dịch lại nghĩa" (job RUNNING, bản nháp vẫn DRAFT): mọi thao tác đổi cấu trúc chương chờ job xong theo MỘT quy tắc cho cả
     * bản nháp nhận ra chương lẫn không — đổi số ngày / trần, đổi tên chương, gộp, chọn thẻ, kích hoạt → 409 và không lưu gì; tên
     * lộ trình / ngày bắt đầu / ngày học trong tuần vẫn sửa được. Trước đây bản không nhận ra chương 409 còn bản nhận ra chương nhận
     * cùng PATCH số ngày, trong khi ô nhập ở client vẫn giữ số vừa gõ.
     */
    @Test
    void draft_structure_edits_wait_for_enrich_on_both_draft_kinds() throws Exception { // LP-6, LP-08
        String token = newUser();
        String busy = "Đang dịch lại nghĩa, hãy chờ xong.";
        for (boolean detected : new boolean[]{true, false}) {
            if (!detected) {
                List<AiDtos.Item> six = new ArrayList<>();
                for (int i = 1; i <= 6; i++) six.add(vocab(i, "語" + i, null, false));
                stubAnalyze(six, Map.of("vocab", 6, "grammar", 0, "chaptersDetected", false));
            }
            JsonNode draft = draftPath(token, "6", null);
            assertEquals(detected, draft.get("chaptersDetected").asBoolean());
            String id = draft.get("id").asText();
            UUID jid = UUID.fromString(draft.get("jobId").asText());
            String c1 = draft.get("chapters").get(0).get("id").asText();
            String c2 = draft.get("chapters").get(1).get("id").asText();
            String item = read(call(get(BASE + id + "/chapters/" + c1 + "/items"), token, null).andExpect(status().isOk()))
                    .get(0).get("id").asText();
            List<String> before = layout(token, draft);

            jdbc.update("UPDATE extraction_jobs SET status = 'RUNNING' WHERE id = ?", jid);
            try {
                for (Map<String, Object> body : List.of(Map.<String, Object>of("totalDays", 3), Map.<String, Object>of("dailyCap", 20),
                        Map.<String, Object>of("title", "Không lưu", "totalDays", 3))) {
                    JsonNode res = read(call(patch(BASE + id), token, body).andExpect(status().isConflict()));
                    assertEquals(busy, res.get("message").asText(), detected + " " + body);
                }
                JsonNode rename = read(call(patch(BASE + id + "/chapters/" + c1), token, Map.of("title", "Chào hỏi"))
                        .andExpect(status().isConflict()));
                assertEquals(busy, rename.get("message").asText(), rename.toString());
                call(post(BASE + id + "/chapters/" + c2 + "/merge-up"), token, null).andExpect(status().isConflict());
                call(patch(BASE + id + "/items"), token, List.of(Map.of("id", item, "selected", false)))
                        .andExpect(status().isConflict());
                call(post(BASE + id + "/activate"), token, Map.of()).andExpect(status().isConflict());
                // ngoài cấu trúc chương: vẫn lưu, bố cục không đổi
                JsonNode ok = read(call(patch(BASE + id), token, Map.of("title", "Đổi tên", "startDate", "2026-12-01",
                        "studyDays", "1111100")).andExpect(status().isOk()));
                assertEquals("Đổi tên", ok.get("title").asText());
                assertEquals(6, ok.get("totalDays").asInt());
                assertEquals(before, layout(token, ok), "detected=" + detected);
            } finally {
                jdbc.update("UPDATE extraction_jobs SET status = 'DONE' WHERE id = ?", jid);
            }

            // job xong -> sửa như thường
            assertEquals(3, read(call(patch(BASE + id), token, Map.of("totalDays", 3)).andExpect(status().isOk()))
                    .get("totalDays").asInt());
            call(patch(BASE + id + "/chapters/" + c1), token, Map.of("title", "Chào hỏi")).andExpect(status().isOk());
        }
    }

    /** Đáp án đúng của mỗi thẻ trong bộ = dòng đầu nội dung (QuizService.headline), đọc qua API bộ thẻ như người dùng. */
    private Map<String, String> correctAnswers(String token, String deckId) throws Exception {
        Map<String, String> out = new HashMap<>();
        for (JsonNode c : read(call(get("/api/decks/" + deckId), token, null).andExpect(status().isOk())).get("cards")) {
            out.put(c.get("id").asText(), c.get("meaning").asText().lines().findFirst().orElse(""));
        }
        return out;
    }

    private JsonNode openChapterQuiz(String token, String id, String cid) throws Exception {
        return read(call(post(BASE + id + "/chapters/" + cid + "/quiz"), token, null).andExpect(status().isOk()));
    }

    /** Nộp bài với đúng `right` câu đầu đúng, các câu còn lại chọn sai; trả kết quả chấm. */
    private JsonNode submitQuiz(String token, JsonNode paper, int right) throws Exception {
        Map<String, String> correct = correctAnswers(token, paper.get("deckId").asText());
        Map<String, String> answers = new HashMap<>();
        int i = 0;
        for (JsonNode q : paper.get("questions")) {
            String cardId = q.get("cardId").asText();
            String ok = correct.get(cardId);
            String wrong = null;
            for (JsonNode o : q.get("options")) if (!o.asText().equals(ok)) wrong = o.asText();
            assertNotNull(wrong, q.toString());
            answers.put(cardId, i++ < right ? ok : wrong);
        }
        return read(call(post("/api/quiz-attempts/" + paper.get("attemptId").asText() + "/submit"), token,
                Map.of("answers", answers)).andExpect(status().isOk()));
    }

    @Test
    void chapter_quiz_pass_marks_chapter_passed_and_notifies() throws Exception { // IT-04, D4
        List<AiDtos.Item> list = new ArrayList<>();
        int pos = 0;
        for (int i = 0; i < 12; i++) list.add(vocabVi(++pos, "語" + pos, 1, "nghĩa " + pos));
        for (int i = 0; i < 8; i++) list.add(vocabVi(++pos, "語" + pos, 2, "nghĩa " + pos));
        stubAnalyze(list, Map.of("vocab", 20, "grammar", 0, "chaptersDetected", true, "chapters", List.of(
                Map.of("index", 1, "title", "Bài 1"), Map.of("index", 2, "title", "Bài 2"))));
        String token = newUser();
        JsonNode draft = draftPath(token, "10", "Kiểm tra");
        String id = draft.get("id").asText();
        String c1 = draft.get("chapters").get(0).get("id").asText();
        String c2 = draft.get("chapters").get(1).get("id").asText();
        call(post(BASE + id + "/chapters/" + c1 + "/quiz"), token, null).andExpect(status().isConflict()); // chưa ACTIVE
        JsonNode active = activate(token, id, Map.of("startDate", "2026-11-01"));
        String deck1 = active.get("chapters").get(0).get("deckId").asText();
        String deck2 = active.get("chapters").get(1).get("deckId").asText();
        call(post(BASE + id + "/chapters/" + UUID.randomUUID() + "/quiz"), token, null).andExpect(status().isNotFound());
        call(post(BASE + id + "/chapters/" + c1 + "/quiz"), newUser(), null).andExpect(status().isNotFound());
        // chương thật của một lộ trình KHÁC của chính mình (bản nháp, chưa qua được requireActive) đi qua id lộ trình ACTIVE -> 404
        String cx = draftPath(token, "5", null).get("chapters").get(0).get("id").asText();
        call(post(BASE + id + "/chapters/" + cx + "/quiz"), token, null).andExpect(status().isNotFound());

        // 5/10: chưa qua, điểm tốt nhất 50
        JsonNode paper = openChapterQuiz(token, id, c1);
        assertEquals("exam", paper.get("mode").asText());
        assertFalse(paper.get("resumed").asBoolean());
        assertEquals(deck1, paper.get("deckId").asText());
        assertEquals(10, paper.get("questions").size()); // min(10, 12 thẻ)
        JsonNode same = openChapterQuiz(token, id, c1); // đang có lượt mở -> trả lại đúng lượt đó
        assertTrue(same.get("resumed").asBoolean());
        assertEquals(paper.get("attemptId"), same.get("attemptId"));
        JsonNode half = submitQuiz(token, paper, 5);
        assertEquals(5, half.get("score").asInt());
        assertEquals(10, half.get("total").asInt());
        JsonNode p = pathOn(token, id, "2026-11-01");
        JsonNode ch1 = p.get("chapters").get(0);
        assertEquals(50, ch1.get("quizBestPct").asInt(), ch1.toString());
        assertFalse(ch1.has("quizPassedAt"));
        assertEquals("current", ch1.get("state").asText()); // D4: không qua cũng không chặn gì
        // đủ cho "Chưa đạt 80% — Làm lại": điểm cao nhất + chưa qua + ngưỡng hiện hành
        assertEquals(80, p.get("quizPassPct").asInt(), p.toString());
        assertEquals(0, p.get("completion").get("chaptersPassed").asInt());
        assertEquals(0, notificationsOf(token, "LEARNING_PATH_CHAPTER_PASSED").size());
        List<JsonNode> retry = notificationsOf(token, "LEARNING_PATH_CHAPTER_RETRY");
        assertEquals(1, retry.size());
        JsonNode retryPayload = retry.get(0).get("payload");
        assertEquals(id, retryPayload.get("pathId").asText());
        assertEquals("Kiểm tra", retryPayload.get("pathTitle").asText());
        assertEquals(c1, retryPayload.get("chapterId").asText());
        assertEquals("Bài 1", retryPayload.get("chapterTitle").asText());
        assertEquals(50, retryPayload.get("pct").asInt());
        assertEquals(80, retryPayload.get("passPct").asInt());
        // danh sách không kèm chương nên cũng không kèm ngưỡng
        for (JsonNode row : read(call(get("/api/learning-paths"), token, null).andExpect(status().isOk()))) {
            assertFalse(row.has("quizPassPct"), row.toString());
        }

        // exam mở qua POST /api/quiz-attempts với 1 câu trên bộ của chương: 1/1 = 100 % nhưng không đủ cỡ đề min(10, số thẻ) -> bỏ qua
        JsonNode tiny = read(call(post("/api/quiz-attempts"), token, Map.of("deckId", deck1, "size", 1, "mode", "exam"))
                .andExpect(status().isOk()));
        assertEquals(1, tiny.get("questions").size());
        assertEquals(1, submitQuiz(token, tiny, 1).get("score").asInt());
        ch1 = pathOn(token, id, "2026-11-01").get("chapters").get(0);
        assertEquals(50, ch1.get("quizBestPct").asInt(), ch1.toString());
        assertFalse(ch1.has("quizPassedAt"));
        assertEquals(0, notificationsOf(token, "LEARNING_PATH_CHAPTER_PASSED").size());

        // 9/10 ≥ 80 % (learning_path_quiz_pass_pct) -> qua chương + thông báo
        JsonNode nine = submitQuiz(token, openChapterQuiz(token, id, c1), 9);
        assertEquals(9, nine.get("score").asInt());
        p = pathOn(token, id, "2026-11-01");
        ch1 = p.get("chapters").get(0);
        assertEquals(90, ch1.get("quizBestPct").asInt());
        assertTrue(ch1.has("quizPassedAt"), ch1.toString());
        assertEquals("passed", ch1.get("state").asText());
        assertEquals(1, p.get("completion").get("chaptersPassed").asInt());
        List<JsonNode> passed = notificationsOf(token, "LEARNING_PATH_CHAPTER_PASSED");
        assertEquals(1, passed.size());
        JsonNode payload = passed.get(0).get("payload");
        assertEquals(id, payload.get("pathId").asText());
        assertEquals("Kiểm tra", payload.get("pathTitle").asText());
        assertEquals(c1, payload.get("chapterId").asText());
        assertEquals("Bài 1", payload.get("chapterTitle").asText());
        assertEquals(90, payload.get("pct").asInt());

        // 3/10 sau đó: điểm tốt nhất và mốc qua chương giữ nguyên, không thông báo lại
        String passedAt = ch1.get("quizPassedAt").asText();
        submitQuiz(token, openChapterQuiz(token, id, c1), 3);
        ch1 = pathOn(token, id, "2026-11-01").get("chapters").get(0);
        assertEquals(90, ch1.get("quizBestPct").asInt());
        assertEquals(passedAt, ch1.get("quizPassedAt").asText());
        assertEquals(1, notificationsOf(token, "LEARNING_PATH_CHAPTER_PASSED").size());
        // nhắc làm lại chỉ một lần, ở lượt trượt đầu tiên; qua rồi trượt lại cũng không nhắc
        assertEquals(1, notificationsOf(token, "LEARNING_PATH_CHAPTER_RETRY").size());

        // exam trên bộ thẻ không thuộc lộ trình nào: listener không đụng chương nào, không thông báo (lỗi ở đó chỉ ra log)
        JsonNode outside = read(call(post("/api/quiz-attempts"), token, Map.of("deckId", "n5-core", "size", 5, "mode", "exam"))
                .andExpect(status().isOk()));
        assertEquals(5, submitQuiz(token, outside, 5).get("score").asInt());
        p = pathOn(token, id, "2026-11-01");
        assertEquals(90, p.get("chapters").get(0).get("quizBestPct").asInt());
        assertEquals(passedAt, p.get("chapters").get(0).get("quizPassedAt").asText());
        assertFalse(p.get("chapters").get(1).has("quizBestPct"), p.toString());
        assertEquals(1, notificationsOf(token, "LEARNING_PATH_CHAPTER_PASSED").size());

        // practice trên bộ của chương 2 (ngoài lộ trình, lộ đáp án từng câu) không phải bài kiểm tra chương
        JsonNode practice = read(call(post("/api/quiz-attempts"), token, Map.of("deckId", deck2, "size", 8, "mode", "practice"))
                .andExpect(status().isOk()));
        Map<String, String> correct2 = correctAnswers(token, deck2);
        for (JsonNode q : practice.get("questions")) {
            call(put("/api/quiz-attempts/" + practice.get("attemptId").asText() + "/answers/" + q.get("cardId").asText()), token,
                    Map.of("option", correct2.get(q.get("cardId").asText()))).andExpect(status().isOk());
        }
        call(post("/api/quiz-attempts/" + practice.get("attemptId").asText() + "/submit"), token, Map.of()).andExpect(status().isOk());
        JsonNode ch2 = pathOn(token, id, "2026-11-01").get("chapters").get(1);
        assertFalse(ch2.has("quizBestPct"), ch2.toString());
        assertFalse(ch2.has("quizPassedAt"));
        assertEquals(1, notificationsOf(token, "LEARNING_PATH_CHAPTER_PASSED").size());

        // chương 2 (8 thẻ): đề min(10, 8) = 8 câu. Bỏ dở với 7/8 đáp án đã lưu rồi hết giờ: lượt được đóng lúc đọc lại
        // (closeExpiredAttempts) cũng đi qua QuizSubmittedEvent -> 88 % -> qua chương + thông báo
        JsonNode paper2 = openChapterQuiz(token, id, c2);
        assertEquals(8, paper2.get("questions").size(), paper2.toString());
        String attempt2 = paper2.get("attemptId").asText();
        Map<String, String> correct2b = correctAnswers(token, deck2);
        int saved = 0;
        for (JsonNode q : paper2.get("questions")) {
            if (saved++ == 7) break;
            String cid = q.get("cardId").asText();
            call(put("/api/quiz-attempts/" + attempt2 + "/answers/" + cid), token, Map.of("option", correct2b.get(cid)))
                    .andExpect(status().isOk());
        }
        jdbc.update("UPDATE quiz_attempts SET expires_at = ? WHERE id = ?",
                OffsetDateTime.now(ZoneOffset.UTC).minusSeconds(1), UUID.fromString(attempt2));
        JsonNode closed = read(call(get("/api/quiz-attempts/" + attempt2), token, null).andExpect(status().isOk()));
        assertTrue(closed.get("finished").asBoolean(), closed.toString());
        assertTrue(closed.get("expired").asBoolean());
        assertEquals(7, closed.get("score").asInt());
        assertEquals(8, closed.get("total").asInt());
        p = pathOn(token, id, "2026-11-01");
        ch2 = p.get("chapters").get(1);
        assertEquals(88, ch2.get("quizBestPct").asInt(), ch2.toString());
        assertTrue(ch2.has("quizPassedAt"));
        assertEquals("passed", ch2.get("state").asText());
        assertEquals(2, p.get("completion").get("chaptersPassed").asInt());
        List<JsonNode> passed2 = notificationsOf(token, "LEARNING_PATH_CHAPTER_PASSED");
        assertEquals(2, passed2.size());
        JsonNode payload2 = null;
        for (JsonNode n : passed2) if (c2.equals(n.get("payload").get("chapterId").asText())) payload2 = n.get("payload");
        assertNotNull(payload2, passed2.toString());
        assertEquals(88, payload2.get("pct").asInt());
        assertEquals("Bài 2", payload2.get("chapterTitle").asText());
        assertEquals(1, notificationsOf(token, "LEARNING_PATH_CHAPTER_RETRY").size()); // chương 2 qua ngay lượt đầu

        // xoá từng thẻ của chương 2 khỏi bộ (bộ thẻ còn): chương hết thẻ trong lịch -> không còn gì để kiểm tra, "passed" giữ nguyên
        for (String cid : jdbc.queryForList("SELECT card_id FROM learning_path_cards WHERE path_id = ? AND chapter_id = ?",
                String.class, UUID.fromString(id), UUID.fromString(c2))) {
            call(delete("/api/decks/" + deck2 + "/cards/" + cid), token, null).andExpect(status().isNoContent());
        }
        JsonNode empty = read(call(post(BASE + id + "/chapters/" + c2 + "/quiz"), token, null).andExpect(status().isConflict()));
        assertEquals("Chương không còn thẻ nào để kiểm tra.", empty.get("message").asText(), empty.toString());
        ch2 = pathOn(token, id, "2026-11-01").get("chapters").get(1);
        assertEquals(0, ch2.get("cardCount").asInt());
        assertEquals("passed", ch2.get("state").asText());

        // bộ thẻ của chương bị xoá -> 409
        call(delete("/api/decks/" + deck2), token, null).andExpect(status().isNoContent());
        JsonNode gone = read(call(post(BASE + id + "/chapters/" + c2 + "/quiz"), token, null).andExpect(status().isConflict()));
        assertEquals("Bộ thẻ của chương đã bị xoá, không thể kiểm tra.", gone.get("message").asText());
    }

    /** Hai chương có nghĩa tiếng Việt khác nhau (12 + 8 thẻ) để quiz dựng được đề; trả bản nháp. */
    private JsonNode quizDraft(String token, String title) throws Exception {
        List<AiDtos.Item> list = new ArrayList<>();
        int pos = 0;
        for (int i = 0; i < 12; i++) list.add(vocabVi(++pos, "語" + pos, 1, "nghĩa " + pos));
        for (int i = 0; i < 8; i++) list.add(vocabVi(++pos, "語" + pos, 2, "nghĩa " + pos));
        stubAnalyze(list, Map.of("vocab", 20, "grammar", 0, "chaptersDetected", true, "chapters", List.of(
                Map.of("index", 1, "title", "Bài 1"), Map.of("index", 2, "title", "Bài 2"))));
        return draftPath(token, "10", title);
    }

    @Test
    void chapter_quiz_below_threshold_only_labels_retry() throws Exception { // D4: chỉ gắn nhãn, không chặn chương sau
        String key = SettingsService.KEY_LP_QUIZ_PASS;
        String saved = jdbc.queryForObject("SELECT value FROM app_settings WHERE key = ?", String.class, key);
        // ngưỡng lấy từ Admin > Cấu hình lúc chấm và lúc đọc: 95 % thì 9/10 vẫn chưa qua
        jdbc.update("UPDATE app_settings SET value = '95' WHERE key = ?", key);
        try {
            String token = newUser();
            String id = quizDraft(token, "Ngưỡng").get("id").asText();
            JsonNode active = activate(token, id, Map.of("startDate", "2026-11-01"));
            String c1 = active.get("chapters").get(0).get("id").asText();
            String c2 = active.get("chapters").get(1).get("id").asText();
            JsonNode fresh = pathOn(token, id, "2026-11-01");
            assertEquals(95, fresh.get("quizPassPct").asInt(), fresh.toString());
            assertFalse(fresh.get("chapters").get(0).has("quizBestPct")); // chưa làm -> client không hiện "Chưa đạt"

            submitQuiz(token, openChapterQuiz(token, id, c1), 9);
            JsonNode p = pathOn(token, id, "2026-11-01");
            JsonNode ch1 = p.get("chapters").get(0);
            assertEquals(90, ch1.get("quizBestPct").asInt(), ch1.toString());
            assertFalse(ch1.has("quizPassedAt"));
            assertEquals("current", ch1.get("state").asText());
            assertEquals(95, p.get("quizPassPct").asInt());
            assertEquals(0, p.get("completion").get("chaptersPassed").asInt());
            List<JsonNode> retry = notificationsOf(token, "LEARNING_PATH_CHAPTER_RETRY");
            assertEquals(1, retry.size());
            assertEquals(90, retry.get(0).get("payload").get("pct").asInt());
            assertEquals(95, retry.get(0).get("payload").get("passPct").asInt());

            // trượt không chặn gì: chương sau (chưa tới ngày) vẫn học được theo phiên chương và vẫn mở được bài kiểm tra
            assertEquals("locked", p.get("chapters").get(1).get("state").asText()); // theo lịch, không phải vì trượt
            JsonNode next = read(call(get(BASE + id + "/session").param("kind", "chapter").param("chapterId", c2)
                    .param("date", "2026-11-01"), token, null).andExpect(status().isOk()));
            assertEquals(8, next.get("cards").size(), next.toString());
            assertEquals(8, openChapterQuiz(token, id, c2).get("questions").size());

            // trượt lần hai (thấp hơn): điểm cao nhất giữ 90, không nhắc lại
            submitQuiz(token, openChapterQuiz(token, id, c1), 4);
            ch1 = pathOn(token, id, "2026-11-01").get("chapters").get(0);
            assertEquals(90, ch1.get("quizBestPct").asInt());
            assertFalse(ch1.has("quizPassedAt"));
            assertEquals(1, notificationsOf(token, "LEARNING_PATH_CHAPTER_RETRY").size());

            // "Làm lại" = cùng POST /quiz: 10/10 -> qua chương
            submitQuiz(token, openChapterQuiz(token, id, c1), 10);
            ch1 = pathOn(token, id, "2026-11-01").get("chapters").get(0);
            assertEquals(100, ch1.get("quizBestPct").asInt());
            assertTrue(ch1.has("quizPassedAt"), ch1.toString());
            assertEquals("passed", ch1.get("state").asText());
            assertEquals(1, notificationsOf(token, "LEARNING_PATH_CHAPTER_PASSED").size());
            assertEquals(1, notificationsOf(token, "LEARNING_PATH_CHAPTER_RETRY").size());
        } finally {
            jdbc.update("UPDATE app_settings SET value = ? WHERE key = ?", saved, key);
        }
    }

    @Test
    void chapter_without_cards_is_empty_until_passed() throws Exception { // spec §7: hết thẻ -> passed nếu đã qua, không thì "trống"
        String token = newUser();
        String id = quizDraft(token, null).get("id").asText();
        JsonNode active = activate(token, id, Map.of("startDate", "2026-11-01"));
        String c1 = active.get("chapters").get(0).get("id").asText();
        String c2 = active.get("chapters").get(1).get("id").asText();
        String deck1 = active.get("chapters").get(0).get("deckId").asText();
        UUID pid = UUID.fromString(id);
        // xoá từng thẻ của chương 1 khỏi bộ (bộ thẻ còn, chưa làm quiz): lịch mất hết thẻ của chương (CASCADE)
        for (String cid : jdbc.queryForList("SELECT card_id FROM learning_path_cards WHERE path_id = ? AND chapter_id = ?",
                String.class, pid, UUID.fromString(c1))) {
            call(delete("/api/decks/" + deck1 + "/cards/" + cid), token, null).andExpect(status().isNoContent());
        }
        // trước ngày bắt đầu, trong kỳ, sau ngày cuối: luôn "empty" — trước đây rơi về "open" như một chương còn nợ thẻ
        for (String date : List.of("2026-10-25", "2026-11-01", "2026-12-31")) {
            JsonNode ch = pathOn(token, id, date).get("chapters").get(0);
            assertEquals(0, ch.get("cardCount").asInt(), ch.toString());
            assertFalse(ch.get("deckDeleted").asBoolean());
            assertFalse(ch.has("dayFrom"), ch.toString());
            assertEquals("empty", ch.get("state").asText(), date + " " + ch);
        }
        JsonNode p = pathOn(token, id, "2026-11-01");
        // xoá thẻ không xếp lại lịch: chương còn thẻ giữ trạng thái theo dải ngày của nó (chưa tới ngày -> locked)
        assertEquals("locked", p.get("chapters").get(1).get("state").asText(), p.toString());
        JsonNode refused = read(call(post(BASE + id + "/chapters/" + c1 + "/quiz"), token, null).andExpect(status().isConflict()));
        assertEquals("Chương không còn thẻ nào để kiểm tra.", refused.get("message").asText());
        // chương "empty" bị /quiz từ chối nên không vào mẫu số: trước đây 2 -> "0/2 chương đã qua kiểm tra" không bao giờ tới 2/2
        JsonNode comp = p.get("completion");
        assertEquals(0, comp.get("chaptersPassed").asInt(), comp.toString());
        assertEquals(1, comp.get("chaptersTotal").asInt(), comp.toString());
        assertEquals(8, comp.get("total").asInt());
        assertFalse(comp.get("done").asBoolean());

        // chương đã qua quiz rồi mới hết thẻ: giữ "passed" (không thành "empty")
        submitQuiz(token, openChapterQuiz(token, id, c2), 8);
        JsonNode afterPass = pathOn(token, id, "2026-11-01").get("completion");
        assertEquals("1/1", afterPass.get("chaptersPassed").asInt() + "/" + afterPass.get("chaptersTotal").asInt(),
                "chương còn kiểm tra được đã qua hết -> M/M: " + afterPass);
        String deck2 = p.get("chapters").get(1).get("deckId").asText();
        call(delete("/api/decks/" + deck2), token, null).andExpect(status().isNoContent());
        JsonNode gone = pathOn(token, id, "2026-11-01");
        JsonNode ch2 = gone.get("chapters").get(1);
        assertEquals(0, ch2.get("cardCount").asInt());
        assertEquals("passed", ch2.get("state").asText(), ch2.toString());
        // chương đã qua vẫn đếm dù hết thẻ (chaptersPassed ≤ chaptersTotal); done tính theo thẻ, không đổi vì số chương: không còn
        // thẻ nào -> chưa xong, và today-summary nói cùng một điều
        JsonNode compGone = gone.get("completion");
        assertEquals(1, compGone.get("chaptersPassed").asInt(), compGone.toString());
        assertEquals(1, compGone.get("chaptersTotal").asInt(), compGone.toString());
        assertEquals(0, compGone.get("total").asInt());
        assertFalse(compGone.get("done").asBoolean());
        JsonNode summary = null;
        for (JsonNode s : read(call(get(BASE + "today-summary").param("date", "2026-11-01"), token, null)
                .andExpect(status().isOk()))) {
            if (id.equals(s.get("pathId").asText())) summary = s;
        }
        assertNotNull(summary);
        assertEquals(compGone.get("done").asBoolean(), summary.get("done").asBoolean(), summary.toString());
    }

    /**
     * Lượt practice đang mở trên bộ của chương (trang Quiz, mở tới 24 giờ) không được chiếm chỗ bài kiểm tra chương. Trước đây
     * POST /quiz trả lại nguyên lượt đó (mode practice, resumed, timeLimitSeconds 0) — làm đúng 10/10 mà chương không qua, không
     * thông báo PASSED / RETRY. Giờ: lượt practice bị nộp thay như khi hết hạn (chấm các câu đã làm, có dòng quiz_results — tab
     * khác đồng bộ lại thấy đúng điểm đó), bài kiểm tra là lượt exam mới; mở lại thì nối lại đúng lượt exam đó; qua ngưỡng -> nhãn
     * chương + thông báo. Exam ít câu (mở từ trang Quiz) cũng không phải bài kiểm tra: bị đóng có chấm như hết giờ rồi phát đề mới
     * đủ cỡ.
     */
    @Test
    void open_practice_attempt_does_not_hijack_the_chapter_quiz() throws Exception {
        String token = newUser();
        String id = quizDraft(token, "Luyện tập").get("id").asText();
        JsonNode active = activate(token, id, Map.of("startDate", "2026-11-01"));
        String c1 = active.get("chapters").get(0).get("id").asText();
        String deck1 = active.get("chapters").get(0).get("deckId").asText();
        Map<String, String> correct = correctAnswers(token, deck1);

        JsonNode practice = read(call(post("/api/quiz-attempts"), token,
                Map.of("deckId", deck1, "size", 10, "mode", "practice")).andExpect(status().isOk()));
        assertEquals("practice", practice.get("mode").asText());
        String practiceId = practice.get("attemptId").asText();
        String answered = practice.get("questions").get(0).get("cardId").asText();
        String unanswered = practice.get("questions").get(1).get("cardId").asText();
        call(put("/api/quiz-attempts/" + practiceId + "/answers/" + answered), token, Map.of("option", correct.get(answered)))
                .andExpect(status().isOk());

        JsonNode paper = openChapterQuiz(token, id, c1);
        assertEquals("exam", paper.get("mode").asText(), paper.toString());
        assertFalse(paper.get("resumed").asBoolean());
        assertNotEquals(practiceId, paper.get("attemptId").asText());
        assertEquals(deck1, paper.get("deckId").asText());
        assertEquals(10, paper.get("questions").size());
        assertTrue(paper.get("timeLimitSeconds").asInt() > 0, paper.toString());

        // lượt practice đã nộp thay như hết hạn: 1 câu đúng / 10 (câu chưa làm tính sai), điểm tab khác thấy khi đồng bộ lại
        // (GET) chính là dòng quiz_results trong lịch sử; trả lời tiếp -> 409. Chế độ practice nên không gắn nhãn chương.
        JsonNode old = read(call(get("/api/quiz-attempts/" + practiceId), token, null).andExpect(status().isOk()));
        assertTrue(old.get("finished").asBoolean(), old.toString());
        assertFalse(old.get("expired").asBoolean());
        assertEquals("1/10", old.get("score").asInt() + "/" + old.get("total").asInt(), old.toString());
        Map<String, Object> result = jdbc.queryForMap("SELECT score, total, mode FROM quiz_results WHERE attempt_id = ?",
                UUID.fromString(practiceId));
        assertEquals("1/10/practice", result.get("score") + "/" + result.get("total") + "/" + result.get("mode"));
        call(put("/api/quiz-attempts/" + practiceId + "/answers/" + unanswered), token,
                Map.of("option", correct.get(unanswered))).andExpect(status().isConflict());
        assertFalse(pathOn(token, id, "2026-11-01").get("chapters").get(0).has("quizBestPct"));

        // bấm lại "Kiểm tra chương" (rời trang giữa chừng): nối lại đúng bài kiểm tra, không tạo lượt mới
        JsonNode same = openChapterQuiz(token, id, c1);
        assertEquals("exam", same.get("mode").asText());
        assertTrue(same.get("resumed").asBoolean());
        assertEquals(paper.get("attemptId"), same.get("attemptId"));

        // 10/10 -> qua chương + thông báo PASSED
        assertEquals(10, submitQuiz(token, paper, 10).get("score").asInt());
        JsonNode p = pathOn(token, id, "2026-11-01");
        JsonNode ch1 = p.get("chapters").get(0);
        assertEquals(100, ch1.get("quizBestPct").asInt(), ch1.toString());
        assertTrue(ch1.has("quizPassedAt"), ch1.toString());
        assertEquals("passed", ch1.get("state").asText());
        assertEquals(1, p.get("completion").get("chaptersPassed").asInt());
        List<JsonNode> passed = notificationsOf(token, "LEARNING_PATH_CHAPTER_PASSED");
        assertEquals(1, passed.size());
        assertEquals(c1, passed.get(0).get("payload").get("chapterId").asText());
        assertEquals(100, passed.get(0).get("payload").get("pct").asInt());

        // exam 2 câu mở từ trang Quiz rồi bấm "Kiểm tra chương": không nối lại lượt đó (nộp ra không được tính cho chương) mà đóng
        // có chấm (lượt exam đã mở luôn có kết quả) và phát đề đủ 10 câu
        JsonNode tiny = read(call(post("/api/quiz-attempts"), token, Map.of("deckId", deck1, "size", 2, "mode", "exam"))
                .andExpect(status().isOk()));
        String tinyId = tiny.get("attemptId").asText();
        String tinyCard = tiny.get("questions").get(0).get("cardId").asText();
        call(put("/api/quiz-attempts/" + tinyId + "/answers/" + tinyCard), token, Map.of("option", correct.get(tinyCard)))
                .andExpect(status().isOk());
        JsonNode next = openChapterQuiz(token, id, c1);
        assertEquals("exam", next.get("mode").asText());
        assertFalse(next.get("resumed").asBoolean());
        assertNotEquals(tinyId, next.get("attemptId").asText());
        assertEquals(10, next.get("questions").size());
        JsonNode tinyAfter = read(call(get("/api/quiz-attempts/" + tinyId), token, null).andExpect(status().isOk()));
        assertTrue(tinyAfter.get("finished").asBoolean());
        assertEquals(1, tinyAfter.get("score").asInt());
        assertEquals(2, tinyAfter.get("total").asInt());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM quiz_results WHERE attempt_id = ?", Integer.class,
                UUID.fromString(tinyId)));
        assertEquals(1, notificationsOf(token, "LEARNING_PATH_CHAPTER_PASSED").size(), "lượt 2 câu không gắn nhãn chương");
        assertEquals(0, notificationsOf(token, "LEARNING_PATH_CHAPTER_RETRY").size());
    }

    /**
     * completion.chaptersTotal chỉ đếm chương có bài kiểm tra tính được: bộ thẻ phải ra đủ min(10, số thẻ) câu nghĩa. Trước đây
     * mọi chương không "empty" đều đếm — chương mọi thẻ cùng một nghĩa, chương chỉ còn 1 thẻ (lộ trình ôn điểm yếu gom theo kanji /
     * bộ / cấp độ) không bao giờ phát được đề (attemptId null) nên "N/M chương đã qua kiểm tra" kẹt dưới M/M dù đã qua mọi chương
     * còn lại. GET /{id} và danh sách (nạp batch) cùng một số.
     */
    @Test
    void chapters_total_leaves_out_chapters_whose_deck_cannot_build_a_full_quiz() throws Exception {
        String token = newUser();
        String id = quizDraft(token, "Không ra đề").get("id").asText();
        JsonNode active = activate(token, id, Map.of("startDate", "2026-11-01"));
        String c1 = active.get("chapters").get(0).get("id").asText();
        String c2 = active.get("chapters").get(1).get("id").asText();
        String deck2 = active.get("chapters").get(1).get("deckId").asText();
        assertEquals("0/2", chapterRatio(token, id));

        // mọi thẻ chương 2 cùng một dòng nghĩa chính (dòng sau khác nhau không tính): không có phương án sai -> không phát được đề
        jdbc.update("UPDATE flashcards SET meaning = 'cùng nghĩa' || chr(10) || 'ghi chú ' || id WHERE deck_id = ?", deck2);
        JsonNode p = pathOn(token, id, "2026-11-01");
        JsonNode ch2 = p.get("chapters").get(1);
        assertEquals("locked", ch2.get("state").asText(), ch2.toString()); // còn đủ 8 thẻ: không phải "empty"
        assertEquals(8, ch2.get("cardCount").asInt());
        assertFalse(openChapterQuiz(token, id, c2).hasNonNull("attemptId"));
        assertEquals("0/1", chapterRatio(token, id));

        // qua chương còn lại -> M/M tới được
        submitQuiz(token, openChapterQuiz(token, id, c1), 10);
        assertEquals("1/1", chapterRatio(token, id));

        // nghĩa khác nhau trở lại -> chương 2 lại có bài kiểm tra, lại vào mẫu số
        jdbc.update("UPDATE flashcards SET meaning = 'nghĩa ' || id WHERE deck_id = ?", deck2);
        assertEquals("1/2", chapterRatio(token, id));

        // chỉ còn 1 thẻ (như chương 1 thẻ của lộ trình ôn điểm yếu): 1 nghĩa -> không có đề, ra khỏi mẫu số
        List<String> left = jdbc.queryForList("SELECT card_id FROM learning_path_cards WHERE path_id = ? AND chapter_id = ?",
                String.class, UUID.fromString(id), UUID.fromString(c2));
        for (String cardId : left.subList(1, left.size())) {
            call(delete("/api/decks/" + deck2 + "/cards/" + cardId), token, null).andExpect(status().isNoContent());
        }
        assertEquals(1, pathOn(token, id, "2026-11-01").get("chapters").get(1).get("cardCount").asInt());
        assertFalse(openChapterQuiz(token, id, c2).hasNonNull("attemptId"));
        assertEquals("1/1", chapterRatio(token, id));
    }

    /** "chaptersPassed/chaptersTotal" của GET /{id}; danh sách (nạp batch) phải nói cùng một số. */
    private String chapterRatio(String token, String id) throws Exception {
        JsonNode comp = pathOn(token, id, "2026-11-01").get("completion");
        String ratio = comp.get("chaptersPassed").asInt() + "/" + comp.get("chaptersTotal").asInt();
        boolean listed = false;
        for (JsonNode row : read(call(get("/api/learning-paths").param("date", "2026-11-01"), token, null)
                .andExpect(status().isOk()))) {
            if (!id.equals(row.get("id").asText())) continue;
            listed = true;
            JsonNode c = row.get("completion");
            assertEquals(ratio, c.get("chaptersPassed").asInt() + "/" + c.get("chaptersTotal").asInt(), row.toString());
        }
        assertTrue(listed);
        return ratio;
    }

    /**
     * Đề mới cũng thiếu câu thì bài kiểm tra chương không đóng lượt đang mở. Bộ 3 thẻ (3 nghĩa) có câu nghĩa của một thẻ bị admin
     * ẩn: phương án câu nghĩa luôn là đủ 3 nghĩa nên sinh lại vẫn trùng câu đã ẩn -> đề chỉ 2 câu (< min(10, 3)). Trước đây mỗi lần
     * bấm "Kiểm tra chương" lại chấm dở bài 2 câu đang làm (thêm một dòng lịch sử) rồi phát một bài 2 câu khác; giờ trả lại đúng
     * lượt đang làm. Lượt luyện tập đang mở cũng giữ nguyên — không nộp thay khi đề thay thế cũng không tính cho chương.
     */
    @Test
    void chapter_quiz_keeps_the_open_attempt_when_a_new_paper_would_be_short_too() throws Exception {
        String token = newUser();
        String id = quizDraft(token, "Đề thiếu câu").get("id").asText();
        JsonNode active = activate(token, id, Map.of("startDate", "2026-11-01"));
        String c2 = active.get("chapters").get(1).get("id").asText();
        String deck2 = active.get("chapters").get(1).get("deckId").asText();
        List<String> cards2 = jdbc.queryForList("SELECT card_id FROM learning_path_cards WHERE path_id = ? AND chapter_id = ?",
                String.class, UUID.fromString(id), UUID.fromString(c2));
        for (String cardId : cards2.subList(3, cards2.size())) {
            call(delete("/api/decks/" + deck2 + "/cards/" + cardId), token, null).andExpect(status().isNoContent());
        }
        JsonNode full = openChapterQuiz(token, id, c2);
        assertEquals(3, full.get("questions").size(), full.toString());
        submitQuiz(token, full, 1);
        String hiddenCard = full.get("questions").get(0).get("cardId").asText();
        assertTrue(jdbc.update("UPDATE quiz_questions SET status = 'HIDDEN' WHERE card_id = ? AND kind = 'MEANING'",
                hiddenCard) > 0);

        JsonNode shortPaper = openChapterQuiz(token, id, c2);
        assertEquals("exam", shortPaper.get("mode").asText());
        assertEquals(2, shortPaper.get("questions").size(), shortPaper.toString());
        String shortId = shortPaper.get("attemptId").asText();
        Map<String, String> correct = correctAnswers(token, deck2);
        String first = shortPaper.get("questions").get(0).get("cardId").asText();
        call(put("/api/quiz-attempts/" + shortId + "/answers/" + first), token, Map.of("option", correct.get(first)))
                .andExpect(status().isOk());

        // bấm lại (hai lần): vẫn đúng lượt đang làm, giữ đáp án, không chấm, không thêm dòng lịch sử
        for (int i = 0; i < 2; i++) {
            JsonNode again = openChapterQuiz(token, id, c2);
            assertTrue(again.get("resumed").asBoolean(), again.toString());
            assertEquals(shortId, again.get("attemptId").asText());
            assertFalse(again.get("finished").asBoolean());
            assertEquals(correct.get(first), again.get("questions").get(0).get("chosen").asText());
        }
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM quiz_results WHERE attempt_id = ?", Integer.class,
                UUID.fromString(shortId)));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM quiz_results WHERE deck_id = ?", Integer.class, deck2));
        submitQuiz(token, shortPaper, 2);

        // lượt luyện tập trên bộ đó: đề thay thế cũng chỉ 2 câu -> không nộp thay, trả lại nguyên lượt luyện tập (trang lộ trình báo
        // "đang có lượt luyện tập dở"), làm tiếp được
        JsonNode practice = read(call(post("/api/quiz-attempts"), token,
                Map.of("deckId", deck2, "size", 10, "mode", "practice")).andExpect(status().isOk()));
        String practiceId = practice.get("attemptId").asText();
        String p1 = practice.get("questions").get(0).get("cardId").asText();
        String p2 = practice.get("questions").get(1).get("cardId").asText();
        call(put("/api/quiz-attempts/" + practiceId + "/answers/" + p1), token, Map.of("option", correct.get(p1)))
                .andExpect(status().isOk());
        JsonNode kept = openChapterQuiz(token, id, c2);
        assertEquals("practice", kept.get("mode").asText(), kept.toString());
        assertTrue(kept.get("resumed").asBoolean());
        assertEquals(practiceId, kept.get("attemptId").asText());
        call(put("/api/quiz-attempts/" + practiceId + "/answers/" + p2), token, Map.of("option", correct.get(p2)))
                .andExpect(status().isOk());
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM quiz_results WHERE attempt_id = ?", Integer.class,
                UUID.fromString(practiceId)));
    }

    @Test
    void complete_requires_every_card_learned_and_auto_completes_after_last_day() throws Exception {
        String token = newUser();
        String id = draftPath(token, "3", "Xong").get("id").asText();
        activate(token, id, Map.of("startDate", "2026-11-01"));
        call(post(BASE + id + "/complete"), newUser(), null).andExpect(status().isNotFound());
        JsonNode early = read(call(post(BASE + id + "/complete").param("date", "2026-11-03"), token, null)
                .andExpect(status().isConflict()));
        assertEquals("Chưa học hết thẻ của lộ trình (còn 20 thẻ chưa học).", early.get("message").asText(), early.toString());
        UUID pid = UUID.fromString(id);
        List<String> all = jdbc.queryForList("SELECT card_id FROM learning_path_cards WHERE path_id = ? ORDER BY seq", String.class, pid);
        assertEquals(20, all.size());
        // học hết, gửi kèm thời gian phản xạ + lộ trình (E1): review_logs ghi reaction_ms / path_id
        for (String cid : all) {
            call(post("/api/reviews"), token, Map.of("cardId", cid, "grade", "good", "reactionMs", 1500, "pathId", id))
                    .andExpect(status().isOk());
        }
        assertEquals(Integer.valueOf(20), jdbc.queryForObject(
                "SELECT count(*) FROM review_logs WHERE path_id = ? AND reaction_ms = 1500", Integer.class, pid));
        JsonNode p = pathOn(token, id, "2026-11-03");
        assertEquals(100, p.get("completion").get("learnedPct").asInt());
        assertTrue(p.get("completion").get("done").asBoolean());
        assertFalse(p.has("completedAt"), "GET không tự chốt (đọc không có tác dụng phụ)");
        for (JsonNode c : p.get("chapters")) assertEquals("review", c.get("state").asText(), c.toString());

        JsonNode done = read(call(post(BASE + id + "/complete").param("date", "2026-11-03"), token, null).andExpect(status().isOk()));
        assertEquals("ACTIVE", done.get("status").asText());
        assertTrue(done.has("completedAt"), done.toString());
        assertTrue(done.get("completion").get("done").asBoolean());
        assertEquals(3, done.get("today").get("dayIndex").asInt());
        String at = done.get("completedAt").asText();
        // lần chốt trả mốc trong RAM, mọi lần đọc sau trả mốc từ DB (timestamptz, micro giây): server làm tròn xuống micro giây
        // khi đặt nên hai chuỗi giống hệt (trước đây …05.5059365Z rồi …05.505937Z)
        assertEquals(at, pathOn(token, id, "2026-11-03").get("completedAt").asText());
        JsonNode again = read(call(post(BASE + id + "/complete").param("date", "2026-11-04"), token, null).andExpect(status().isOk()));
        assertEquals(at, again.get("completedAt").asText(), "gọi lại không đổi mốc");
        assertEquals(at, pathOn(token, id, "2026-11-04").get("completedAt").asText());
        List<JsonNode> notes = notificationsOf(token, "LEARNING_PATH_COMPLETED");
        assertEquals(1, notes.size());
        assertEquals(id, notes.get(0).get("payload").get("pathId").asText());
        assertEquals("Xong", notes.get(0).get("payload").get("title").asText());
        assertTrue(read(call(get("/api/learning-paths"), token, null)).get(0).has("completedAt"));
        // đã chốt rồi thì xoá hết bộ thẻ (lịch thẻ mất theo CASCADE) cũng không làm POST /complete thành 409: vẫn cùng completedAt
        for (JsonNode c : done.get("chapters")) {
            call(delete("/api/decks/" + c.get("deckId").asText()), token, null).andExpect(status().isNoContent());
        }
        JsonNode still = read(call(post(BASE + id + "/complete").param("date", "2026-11-04"), token, null).andExpect(status().isOk()));
        assertEquals(again.get("completedAt").asText(), still.get("completedAt").asText());
        assertEquals(0, still.get("completion").get("total").asInt());
        assertTrue(still.get("completion").get("done").asBoolean());
        assertEquals(1, notificationsOf(token, "LEARNING_PATH_COMPLETED").size());
        String draftId = draftPath(token, "5", null).get("id").asText();
        call(post(BASE + draftId + "/complete"), token, null).andExpect(status().isConflict());

        // tự chốt (spec §4.1): học hết + qua ngày cuối -> thao tác ghi kế tiếp (PATCH ở ACTIVE, cân lại lịch) đặt completedAt; trong
        // kỳ thì không, và đã chốt thì lối ghi sau không thông báo lần hai
        String id2 = draftPath(token, "2", "Tự xong").get("id").asText();
        activate(token, id2, Map.of("startDate", "2026-11-01"));
        for (String cid : jdbc.queryForList("SELECT card_id FROM learning_path_cards WHERE path_id = ?", String.class,
                UUID.fromString(id2))) {
            review(token, cid, "good");
        }
        assertFalse(pathOn(token, id2, "2026-11-05").has("completedAt"));
        JsonNode within = read(call(post(BASE + id2 + "/rebalance").param("date", "2026-11-02"), token, Map.of("extend", false))
                .andExpect(status().isOk()));
        assertFalse(within.has("completedAt"), "còn trong kỳ học: không tự chốt");
        JsonNode auto = read(call(patch(BASE + id2).param("date", "2026-11-05"), token, Map.of("title", "Tự xong rồi"))
                .andExpect(status().isOk()));
        assertEquals("after", auto.get("today").get("state").asText());
        assertEquals("Tự xong rồi", auto.get("title").asText());
        assertTrue(auto.has("completedAt"), auto.toString());
        assertEquals(2, notificationsOf(token, "LEARNING_PATH_COMPLETED").size());
        JsonNode later = read(call(post(BASE + id2 + "/rebalance").param("date", "2026-11-06"), token, Map.of("extend", false))
                .andExpect(status().isOk()));
        // auto trả mốc trong RAM, later đọc lại từ DB: cùng một chuỗi (mốc đã làm tròn micro giây lúc tự chốt)
        assertEquals(auto.get("completedAt").asText(), later.get("completedAt").asText());
        assertEquals(2, notificationsOf(token, "LEARNING_PATH_COMPLETED").size());

        // Người khác: lộ trình không còn thẻ nào (bộ thẻ xoá trước khi chốt) -> 409, không chốt; còn một thẻ chưa học thì qua ngày
        // cuối lối ghi cũng không tự chốt
        String other = newUser();
        String id0 = draftPath(other, "2", "Trống").get("id").asText();
        JsonNode a0 = activate(other, id0, Map.of("startDate", "2026-11-01"));
        for (JsonNode c : a0.get("chapters")) {
            call(delete("/api/decks/" + c.get("deckId").asText()), other, null).andExpect(status().isNoContent());
        }
        JsonNode none = read(call(post(BASE + id0 + "/complete").param("date", "2026-11-05"), other, null)
                .andExpect(status().isConflict()));
        assertEquals("Lộ trình không còn thẻ nào để hoàn thành.", none.get("message").asText(), none.toString());
        assertFalse(pathOn(other, id0, "2026-11-05").has("completedAt"));
        String id3 = draftPath(other, "2", "Dở").get("id").asText();
        activate(other, id3, Map.of("startDate", "2026-11-01"));
        List<String> all3 = jdbc.queryForList("SELECT card_id FROM learning_path_cards WHERE path_id = ? ORDER BY seq",
                String.class, UUID.fromString(id3));
        for (int i = 1; i < all3.size(); i++) review(other, all3.get(i), "good"); // chừa thẻ đầu
        JsonNode notYet = read(call(patch(BASE + id3).param("date", "2026-11-05"), other, Map.of("title", "Dở dang"))
                .andExpect(status().isOk()));
        assertEquals("after", notYet.get("today").get("state").asText());
        assertEquals(1, notYet.get("today").get("behindCount").asInt());
        assertFalse(notYet.has("completedAt"), notYet.toString());
        assertFalse(notYet.get("completion").get("done").asBoolean());
        assertEquals(0, notificationsOf(other, "LEARNING_PATH_COMPLETED").size());
    }

    /**
     * LP-10: lộ trình đã xong vẫn ACTIVE nên vẫn có dòng /today-summary (người dùng còn thấy nó), nhưng mang done (học hết thẻ
     * hoặc đã chốt) + completedAt (chỉ khi đã chốt) và xếp sau lộ trình còn học — kể cả khi nó mới tạo hơn (thứ tự gốc là mới
     * tạo trước), để widget không trình bày nó như lộ trình đang học.
     */
    @Test
    void today_summary_flags_completed_paths_and_sorts_them_last() throws Exception {
        String token = newUser();
        String learning = draftPath(token, "3", "Đang học").get("id").asText();
        activate(token, learning, Map.of("startDate", "2026-11-01"));
        String finished = draftPath(token, "3", "Đã xong").get("id").asText();
        activate(token, finished, Map.of("startDate", "2026-11-01"));

        JsonNode start = read(call(get(BASE + "today-summary").param("date", "2026-11-03"), token, null).andExpect(status().isOk()));
        assertEquals(2, start.size());
        assertEquals(finished, start.get(0).get("pathId").asText(), "chưa xong: giữ thứ tự mới tạo trước");
        for (JsonNode s : start) {
            assertFalse(s.get("done").asBoolean(), s.toString());
            assertFalse(s.has("completedAt"), "chưa chốt: completedAt bị bỏ (NON_NULL) " + s);
        }

        // học hết thẻ nhưng chưa chốt: done = true (cùng quy tắc completion.done), chưa có completedAt, đã xuống cuối danh sách
        for (String cid : jdbc.queryForList("SELECT card_id FROM learning_path_cards WHERE path_id = ?", String.class,
                UUID.fromString(finished))) {
            review(token, cid, "good");
        }
        JsonNode learned = read(call(get(BASE + "today-summary").param("date", "2026-11-03"), token, null).andExpect(status().isOk()));
        assertEquals(2, learned.size());
        assertEquals(learning, learned.get(0).get("pathId").asText(), learned.toString());
        assertFalse(learned.get(0).get("done").asBoolean());
        assertEquals(finished, learned.get(1).get("pathId").asText());
        assertTrue(learned.get(1).get("done").asBoolean(), learned.toString());
        assertFalse(learned.get(1).has("completedAt"), learned.toString());
        assertEquals(0, learned.get(1).get("newCount").asInt());
        assertEquals(0, learned.get(1).get("behindCount").asInt());

        // chốt hoàn thành: vẫn trong danh sách (status vẫn ACTIVE), completedAt khớp GET /{id}, vẫn xếp cuối
        call(post(BASE + finished + "/complete").param("date", "2026-11-03"), token, null).andExpect(status().isOk());
        JsonNode after = read(call(get(BASE + "today-summary").param("date", "2026-11-03"), token, null).andExpect(status().isOk()));
        assertEquals(2, after.size());
        assertEquals(learning, after.get(0).get("pathId").asText(), after.toString());
        assertFalse(after.get(0).get("done").asBoolean());
        assertFalse(after.get(0).has("completedAt"));
        JsonNode done = after.get(1);
        assertEquals(finished, done.get("pathId").asText());
        assertEquals("Đã xong", done.get("title").asText());
        assertTrue(done.get("done").asBoolean(), done.toString());
        assertTrue(done.has("completedAt"), done.toString());
        assertEquals(pathOn(token, finished, "2026-11-03").get("completedAt").asText(), done.get("completedAt").asText());

        // đã chốt rồi thì xoá hết bộ thẻ (không còn dòng lịch nào) vẫn là done nhờ completedAt
        for (JsonNode c : pathOn(token, finished, "2026-11-03").get("chapters")) {
            call(delete("/api/decks/" + c.get("deckId").asText()), token, null).andExpect(status().isNoContent());
        }
        JsonNode emptied = read(call(get(BASE + "today-summary").param("date", "2026-11-03"), token, null)).get(1);
        assertEquals(finished, emptied.get("pathId").asText());
        assertTrue(emptied.get("done").asBoolean(), emptied.toString());
        assertTrue(emptied.has("completedAt"));
    }

    @Autowired
    LearningPathService pathService;

    @Test
    void restart_marks_processing_paths_failed_and_notifies() throws Exception { // §4.4: mọi lần FAILED đều có thông báo
        String email = newEmail();
        String token = newUser(email);
        Long uid = userId(email);
        LearningPath stuck = bare(uid, "Dở dang", LearningPath.PROCESSING);
        LearningPath fine = bare(uid, "Đang học", LearningPath.ACTIVE);
        String message = "Máy chủ đã khởi động lại trong lúc xử lý. Hãy tạo lại lộ trình.";

        pathService.failOrphans(); // như ApplicationReadyEvent sau khi khởi động lại: worker trong RAM đã mất

        JsonNode failed = read(call(get(BASE + stuck.getId()), token, null).andExpect(status().isOk()));
        assertEquals("FAILED", failed.get("status").asText(), failed.toString());
        assertEquals(message, failed.get("errorMessage").asText());
        assertEquals("ACTIVE", pathRepo.findById(fine.getId()).orElseThrow().getStatus());
        List<JsonNode> notes = notificationsOf(token, "LEARNING_PATH_FAILED");
        assertEquals(1, notes.size(), notifications(token).toString());
        JsonNode payload = notes.get(0).get("payload");
        assertEquals(stuck.getId().toString(), payload.get("pathId").asText());
        assertEquals("Dở dang", payload.get("title").asText());
        assertEquals(message, payload.get("reason").asText());
    }

    /** Lộ trình chèn thẳng qua repository (không job, không chương): đủ để kiểm trạng thái / thông báo. */
    private LearningPath bare(Long uid, String title, String status) {
        LearningPath p = new LearningPath();
        p.setId(UUID.randomUUID());
        p.setUserId(uid);
        p.setTitle(title);
        p.setSourceType("text");
        p.setStatus(status);
        p.setTotalDays(5);
        p.setStartDate(LocalDate.of(2026, 11, 1));
        p.setCreatedAt(Instant.now());
        return pathRepo.save(p);
    }

    // ---------- lộ trình bổ khuyết (§3.8, IT-06) ----------

    /** Bộ thẻ riêng (POST /api/decks); trả id thẻ theo thứ tự trong bộ. */
    private List<String> ownDeck(String token, String title, List<Map<String, Object>> cards) throws Exception {
        JsonNode d = read(call(post("/api/decks"), token, Map.of("title", title, "level", "N5", "cards", cards))
                .andExpect(status().isCreated()));
        List<String> ids = new ArrayList<>();
        d.get("cards").forEach(c -> ids.add(c.get("id").asText()));
        return ids;
    }

    private static Map<String, Object> plainCard(String term, String level) {
        Map<String, Object> m = new HashMap<>();
        m.put("term", term);
        m.put("reading", "よみ");
        m.put("meaning", "nghĩa " + term);
        m.put("hanViet", "HV");
        if (level != null) m.put("level", level);
        return m;
    }

    /** Ba lần "again" trong 14 ngày = thẻ "hay quên" (InsightService) — tín hiệu duy nhất, không cần chỉnh DB. */
    private void makeWeak(String token, List<String> cardIds) throws Exception {
        for (String id : cardIds) {
            for (int i = 0; i < 3; i++) review(token, id, "again");
        }
    }

    private static List<String> chapterTitles(JsonNode path) {
        List<String> out = new ArrayList<>();
        path.get("chapters").forEach(c -> out.add(c.get("title").asText()));
        return out;
    }

    @Test
    void remedial_needs_eight_weak_cards_and_validates_input() throws Exception {
        String token = newUser();
        Map<String, Object> ok = Map.of("days", 5, "groupBy", "kanji");
        call(post(BASE + "remedial"), token, ok).andExpect(status().isConflict()); // chưa có thẻ yếu nào

        List<Map<String, Object>> seven = new ArrayList<>();
        for (String t : List.of("水", "火", "金", "木", "土", "日", "月")) seven.add(plainCard(t + "曜", "N5"));
        makeWeak(token, ownDeck(token, "Bảy thẻ", seven));
        JsonNode res = read(call(post(BASE + "remedial"), token, ok).andExpect(status().isConflict()));
        assertTrue(res.get("message").asText().contains("hiện có 7"), res.toString());

        call(post(BASE + "remedial"), token, Map.of("days", 2, "groupBy", "kanji")).andExpect(status().isBadRequest());
        call(post(BASE + "remedial"), token, Map.of("days", 31, "groupBy", "kanji")).andExpect(status().isBadRequest());
        call(post(BASE + "remedial"), token, Map.of("days", 5, "groupBy", "tag")).andExpect(status().isBadRequest());
        call(post(BASE + "remedial"), token, Map.of("days", 5)).andExpect(status().isBadRequest());
        call(post(BASE + "remedial"), token, Map.of("groupBy", "kanji")).andExpect(status().isBadRequest());
        call(post(BASE + "remedial"), token, Map.of("days", 5, "groupBy", "kanji", "title", "x".repeat(101)))
                .andExpect(status().isBadRequest());
        call(post(BASE + "remedial"), null, ok).andExpect(status().isUnauthorized());
        assertEquals(0, read(call(get("/api/learning-paths"), token, null).andExpect(status().isOk())).size(),
                "409 / 400 không để lại lộ trình nào");
        JsonNode folders = read(call(get("/api/folders"), token, null).andExpect(status().isOk()));
        for (JsonNode f : folders) assertFalse(f.get("title").asText().startsWith("Bổ khuyết"), folders.toString());
    }

    @Test
    void remedial_from_twelve_weak_cards_groups_by_kanji_and_studies_like_a_normal_path() throws Exception { // IT-06
        String token = newUser();
        // 水 ×2, 8 chữ Hán một thẻ, 2 thẻ kana (không có chữ Hán -> "Khác"); 山 / 川 cấp N4
        List<String> terms = List.of("水曜日", "水道", "火山", "金魚", "木曜日", "土", "日本", "月", "山", "川", "ひらがな", "カタカナ");
        List<Map<String, Object>> cards = new ArrayList<>();
        for (String t : terms) cards.add(plainCard(t, t.equals("山") || t.equals("川") ? "N4" : "N5"));
        List<String> originals = ownDeck(token, "Gốc", cards);
        makeWeak(token, originals);
        assertEquals(12, read(call(get("/api/insights/weaknesses"), token, null).andExpect(status().isOk()))
                .get("total").asInt());

        String day = "2026-11-02";
        JsonNode path = read(call(post(BASE + "remedial").param("date", day), token, Map.of("days", 5, "groupBy", "kanji"))
                .andExpect(status().isCreated()));
        String id = path.get("id").asText();
        assertEquals("ACTIVE", path.get("status").asText(), path.toString());
        assertEquals("remedial", path.get("sourceType").asText());
        assertEquals("Điểm yếu", path.get("sourceName").asText());
        assertEquals("Bổ khuyết 02/11/2026", path.get("title").asText());
        assertEquals(5, path.get("totalDays").asInt());
        assertEquals(day, path.get("startDate").asText());
        assertEquals(50, path.get("dailyCap").asInt()); // learning_path_daily_cap_default
        assertEquals("1111111", path.get("studyDays").asText());
        assertTrue(path.has("activatedAt"));
        assertFalse(path.has("jobId"), "bổ khuyết không có job bóc tách");
        assertFalse(path.has("job"));

        // Chương = nhóm: đông trước, hoà theo chữ, "Khác" luôn cuối
        assertEquals(List.of("Chữ 水", "Chữ 土", "Chữ 山", "Chữ 川", "Chữ 日", "Chữ 月", "Chữ 木", "Chữ 火", "Chữ 金", "Khác"),
                chapterTitles(path));
        JsonNode chapters = path.get("chapters");
        int total = 0;
        for (JsonNode c : chapters) {
            assertTrue(c.hasNonNull("deckId"), c.toString());
            total += c.get("cardCount").asInt();
        }
        assertEquals(12, total);
        assertEquals(2, chapters.get(0).get("cardCount").asInt());
        assertEquals(2, chapters.get(9).get("cardCount").asInt());
        assertEquals(12, cardRows(id));
        assertEquals(1, chapters.get(0).get("dayFrom").asInt());
        assertEquals(5, chapters.get(9).get("dayTo").asInt(), "12 thẻ trải hết 5 ngày");

        // Thư mục "Bổ khuyết dd/MM/yyyy" + mỗi chương một bộ thẻ CLONE (thẻ gốc giữ nguyên lịch SRS)
        String folderId = path.get("folderId").asText();
        JsonNode folder = read(call(get("/api/folders/" + folderId), token, null).andExpect(status().isOk()));
        assertEquals("Bổ khuyết 02/11/2026", folder.get("title").asText());
        assertTrue(folder.get("metadata").asText().contains("\"learningPathId\":\"" + id + "\""), folder.toString());
        JsonNode decks = read(call(get("/api/decks").param("folderId", folderId), token, null).andExpect(status().isOk()));
        assertEquals(10, decks.size());
        String d1 = chapters.get(0).get("deckId").asText();
        JsonNode deck1 = read(call(get("/api/decks/" + d1), token, null).andExpect(status().isOk()));
        assertEquals("Chữ 水", deck1.get("title").asText());
        assertEquals("kanji", deck1.get("category").asText());
        assertEquals("N5", deck1.get("level").asText());
        assertEquals("Chương 1 của lộ trình Bổ khuyết 02/11/2026", deck1.get("description").asText());
        assertEquals(2, deck1.get("cards").size());
        JsonNode clone = deck1.get("cards").get(0);
        assertEquals("水曜日", clone.get("term").asText());
        assertEquals("よみ", clone.get("reading").asText());
        assertEquals("nghĩa 水曜日", clone.get("meaning").asText());
        assertEquals("HV", clone.get("hanViet").asText());
        assertEquals("N5", clone.get("level").asText());
        assertFalse(originals.contains(clone.get("id").asText()), "thẻ mới, không dùng lại thẻ gốc");
        assertEquals("N4", read(call(get("/api/decks/" + chapters.get(2).get("deckId").asText()), token, null))
                .get("level").asText(), "chương 山 chỉ có thẻ N4");

        // Phiên hôm nay chạy như lộ trình thường: chỉ thẻ mới (clone) của ngày 1, bắt đầu từ chương 1
        int todayNew = path.get("today").get("newCount").asInt();
        assertTrue(todayNew > 0, path.toString());
        JsonNode s = session(token, id, "today", day);
        assertEquals("during", s.get("state").asText());
        assertEquals(1, s.get("dayIndex").asInt());
        assertEquals(todayNew, s.get("counts").get("new").asInt());
        assertEquals(0, s.get("counts").get("due").asInt(), "thẻ gốc đến hạn không thuộc lộ trình");
        for (JsonNode c : s.get("cards")) {
            assertEquals("new", c.get("mode").asText());
            assertFalse(originals.contains(c.get("cardId").asText()));
        }
        assertEquals("水曜日", s.get("cards").get(0).get("term").asText());
        String learned = s.get("cards").get(0).get("cardId").asText();
        call(post("/api/reviews"), token, Map.of("cardId", learned, "grade", "good", "pathId", id)).andExpect(status().isOk());
        assertEquals(todayNew - 1, session(token, id, "today", day).get("counts").get("new").asInt());

        // Lộ trình thứ hai cùng ngày: gom theo cấp, tên tuỳ chọn; thư mục trùng tên được đánh số
        JsonNode byLevel = read(call(post(BASE + "remedial").param("date", day), token,
                Map.of("days", 3, "groupBy", "level", "title", "  Ôn N4  ")).andExpect(status().isCreated()));
        assertEquals("Ôn N4", byLevel.get("title").asText());
        assertEquals(List.of("N5", "N4"), chapterTitles(byLevel));
        assertEquals(10, byLevel.get("chapters").get(0).get("cardCount").asInt());
        assertEquals(2, byLevel.get("chapters").get(1).get("cardCount").asInt());
        JsonNode folder2 = read(call(get("/api/folders/" + byLevel.get("folderId").asText()), token, null)
                .andExpect(status().isOk()));
        assertEquals("Bổ khuyết 02/11/2026 (2)", folder2.get("title").asText());

        // Xoá như lộ trình thường: lịch theo thẻ mất (CASCADE), thư mục + bộ thẻ còn
        call(delete(BASE + id), token, null).andExpect(status().isNoContent());
        call(get(BASE + id), token, null).andExpect(status().isNotFound());
        assertEquals(0, cardRows(id));
        call(get("/api/decks/" + d1), token, null).andExpect(status().isOk());
        call(get("/api/folders/" + folderId), token, null).andExpect(status().isOk());
        JsonNode list = read(call(get("/api/learning-paths"), token, null).andExpect(status().isOk()));
        assertEquals(1, list.size());
        assertEquals(byLevel.get("id").asText(), list.get(0).get("id").asText());
    }

    /** Lịch SRS của người dùng (thẻ, ease, khoảng ôn, hạn ôn, số lần) — để so trước / sau khi tạo lộ trình bổ khuyết. */
    private List<Map<String, Object>> srsSnapshot(Long uid) {
        return jdbc.queryForList("SELECT card_id, ease, interval_days, due_at, reps FROM reviews WHERE user_id = ? ORDER BY card_id",
                uid);
    }

    /** Chủ đề (category) của bộ thẻ từng chương, theo thứ tự chương. */
    private List<String> chapterCategories(String token, JsonNode path) throws Exception {
        List<String> out = new ArrayList<>();
        for (JsonNode c : path.get("chapters")) {
            out.add(read(call(get("/api/decks/" + c.get("deckId").asText()), token, null).andExpect(status().isOk()))
                    .get("category").asText());
        }
        return out;
    }

    @Test
    void remedial_groups_by_source_deck_or_kind_with_matching_categories_and_leaves_original_srs_untouched() throws Exception {
        String email = newEmail();
        String token = newUser(email);
        Long uid = userId(email);
        // Bộ từ vựng 6 thẻ + bộ ngữ pháp 4 thẻ, đều yếu
        List<Map<String, Object>> vocab = new ArrayList<>();
        for (String t : List.of("水", "火", "金", "木", "土", "日")) vocab.add(plainCard(t + "曜", "N5"));
        vocab.get(0).put("pos", "名詞");
        List<Map<String, Object>> grammar = new ArrayList<>();
        for (String t : List.of("〜ている", "〜てから", "〜たい", "〜ながら")) {
            Map<String, Object> g = plainCard(t, "N5");
            g.put("kind", "grammar");
            grammar.add(g);
        }
        List<String> originals = new ArrayList<>(ownDeck(token, "Từ vựng gốc", vocab));
        originals.addAll(ownDeck(token, "Mẫu câu gốc", grammar));
        jdbc.update("UPDATE flashcards SET distractors = CAST(? AS jsonb) WHERE id = ?",
                "{\"kanjiLookalike\":[{\"term\":\"氷曜\"}],\"homophones\":[]}", originals.get(0));
        makeWeak(token, originals);
        List<Map<String, Object>> before = srsSnapshot(uid);
        assertEquals(10, before.size());

        // Theo bộ nguồn: chương = tên bộ gốc (đông trước); bộ toàn ngữ pháp -> bunpou, còn lại goi
        JsonNode byDeck = read(call(post(BASE + "remedial"), token, Map.of("days", 3, "groupBy", "deck"))
                .andExpect(status().isCreated()));
        assertEquals(List.of("Từ vựng gốc", "Mẫu câu gốc"), chapterTitles(byDeck), byDeck.toString());
        assertEquals(6, byDeck.get("chapters").get(0).get("cardCount").asInt());
        assertEquals(4, byDeck.get("chapters").get(1).get("cardCount").asInt());
        assertEquals(List.of("goi", "bunpou"), chapterCategories(token, byDeck));
        JsonNode grammarClone = read(call(get("/api/decks/" + byDeck.get("chapters").get(1).get("deckId").asText()), token, null))
                .get("cards").get(0);
        assertEquals("grammar", grammarClone.get("kind").asText(), "clone giữ loại thẻ");
        // Clone giữ từ loại + phương án nhiễu quiz (như nhân bản bộ thẻ): bộ bổ khuyết ra được các loại câu như thẻ gốc
        String vocabDeck = byDeck.get("chapters").get(0).get("deckId").asText();
        JsonNode water = null;
        for (JsonNode c : read(call(get("/api/decks/" + vocabDeck), token, null)).get("cards")) {
            if ("水曜".equals(c.get("term").asText())) water = c;
        }
        assertNotNull(water);
        assertEquals("名詞", water.get("pos").asText());
        assertEquals(1, read(call(get("/api/decks/" + vocabDeck + "/quiz-capabilities"), token, null)
                .andExpect(status().isOk())).get("kanjiLookalike").asInt());

        // Theo loại: "Từ vựng" / "Ngữ pháp"
        JsonNode byKind = read(call(post(BASE + "remedial"), token, Map.of("days", 3, "groupBy", "kind"))
                .andExpect(status().isCreated()));
        assertEquals(List.of("Từ vựng", "Ngữ pháp"), chapterTitles(byKind), byKind.toString());
        assertEquals(List.of("goi", "bunpou"), chapterCategories(token, byKind));

        // Thẻ gốc: lịch SRS y nguyên, không thêm dòng reviews nào (bản clone chưa học)
        assertEquals(before, srsSnapshot(uid));
    }
}
