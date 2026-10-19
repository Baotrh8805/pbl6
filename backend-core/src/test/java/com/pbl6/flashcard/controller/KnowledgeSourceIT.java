package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.dto.extraction.AiDtos;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.repository.KnowledgeSourceRepository;
import com.pbl6.flashcard.service.AiServiceClient;
import com.pbl6.flashcard.service.ContentAiClient;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.mock.web.MockPart;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Admin Panel > Nguồn tri thức chuẩn (hợp đồng đợt 2 §5, G4) với ai-service giả lập: tải lên (văn bản / file) trích entries bố cục
 * danh sách, kiểm đầu vào (2 MB, 20 trang, loại / cấp / tiêu đề), danh sách + lọc, chi tiết, phiên bản mới, lưu trữ / dùng lại,
 * xoá (SUPER_ADMIN), mỗi thao tác ghi đúng một dòng audit, phân quyền USER / ADMIN / SUPER_ADMIN.
 */
class KnowledgeSourceIT extends IntegrationTest {

    @MockitoBean
    AiServiceClient ai;

    /** Cùng bộ mock với các IT nội dung khác để dùng chung context Spring đã cache. */
    @MockitoBean
    ContentAiClient contentAi;

    @Autowired
    KnowledgeSourceRepository repo;

    private static final String LIST = "学校 がっこう school\n先生 せんせい giáo viên\n";

    private record Account(String email, String token) {}

    private Account admin() throws Exception {
        String email = newEmail();
        return new Account(email, newStaff(Role.ADMIN, email));
    }

    private static AiDtos.Item item(String term, String reading, String meaningEn, String meaningVi, String docReading,
                                    String docMeaningEn, boolean suspect) {
        return new AiDtos.Item("vocab", 0, term, term, reading, null, null, "句", meaningEn, meaningVi, "N4", 0.9,
                List.of("jlpt_list:N4"), 1, null, null, suspect, null, List.of(), docReading, docMeaningEn);
    }

    private void stubAnalyze(List<AiDtos.Item> items) {
        Mockito.when(ai.analyze(anyString(), any(), any())).thenReturn(new AiDtos.AnalyzeResult(items, Map.of(), false));
    }

    @BeforeEach
    void stubAi() {
        Mockito.reset(ai, contentAi);
        Mockito.when(ai.extractText(any(), any(), any(), any(), any())).thenAnswer(inv -> {
            byte[] data = inv.getArgument(0);
            String text = data != null ? new String(data, StandardCharsets.UTF_8) : inv.getArgument(2);
            return new AiDtos.TextResult(text, Map.of("engine", "text", "pages", 1), List.of());
        });
        stubAnalyze(List.of(
                item("学校", "がっこう", "school", null, "がっこう", "school", false),
                item("学校", "がくこう", "school", null, "がくこう", "school", false), // trùng term -> giữ lần đầu
                item("先生", "せんせ", "teacher", "giáo viên", "せんせい", null, false), // cách đọc tài liệu khai, không phải Sudachi
                item("雑音x", "ざつおん", "noise", null, "ざつおん", "noise", true)));  // OCR nghi sai -> không làm mục chuẩn
    }

    private ResultActions upload(String token, String text, String title, String kind, String level) throws Exception {
        return send(multipart("/api/admin/knowledge-sources"), token, null, text, title, kind, level);
    }

    private ResultActions send(MockMultipartHttpServletRequestBuilder req, String token, MockMultipartFile file, String text,
                               String title, String kind, String level) throws Exception {
        if (file != null) req.file(file);
        if (text != null) req.part(new MockPart("text", text.getBytes(StandardCharsets.UTF_8)));
        if (title != null) req.part(new MockPart("title", title.getBytes(StandardCharsets.UTF_8)));
        if (kind != null) req.part(new MockPart("kind", kind.getBytes(StandardCharsets.UTF_8)));
        if (level != null) req.part(new MockPart("level", level.getBytes(StandardCharsets.UTF_8)));
        return call(req, token, null);
    }

    private MockMultipartHttpServletRequestBuilder put(String id) {
        return multipart(org.springframework.http.HttpMethod.PUT, "/api/admin/knowledge-sources/" + id);
    }

    private List<JsonNode> audits(String adminToken, String targetId) throws Exception {
        JsonNode p = read(call(get("/api/admin/audit-logs").param("targetType", "KNOWLEDGE_SOURCE").param("size", "100"),
                adminToken, null).andExpect(status().isOk()));
        List<JsonNode> out = new ArrayList<>();
        for (JsonNode r : p.get("items")) if (r.get("targetId").asText().equals(targetId)) out.add(r);
        return out;
    }

    private static String unique(String prefix) {
        return prefix + " " + UUID.randomUUID().toString().substring(0, 8);
    }

    @Test
    void upload_text_extracts_list_entries_and_audits() throws Exception {
        Account a = admin();
        String title = unique("Từ vựng N5 chính thức");
        JsonNode d = read(upload(a.token, LIST, "  " + title + "  ", "VOCAB", "N5").andExpect(status().isCreated()));
        String id = d.get("id").asText();
        assertEquals(title, d.get("title").asText());
        assertEquals("VOCAB", d.get("kind").asText());
        assertEquals("N5", d.get("level").asText());
        assertEquals(1, d.get("version").asInt());
        assertEquals("ACTIVE", d.get("status").asText());
        assertEquals(2, d.get("entryCount").asInt());
        assertEquals(a.email, d.get("uploadedByEmail").asText());
        assertEquals(LIST, d.get("contentPreview").asText());
        assertFalse(d.has("sourceName"), "văn bản dán không có tên file");
        JsonNode e0 = d.get("entries").get(0);
        assertEquals("学校", e0.get("term").asText());
        assertEquals("がっこう", e0.get("reading").asText());
        assertEquals("school", e0.get("meaning").asText(), "không có nghĩa VI thì lấy nghĩa EN tài liệu in sẵn");
        assertEquals("N5", e0.get("level").asText(), "cấp = cấp quản trị khai cho nguồn, không phải cấp ai-service đoán");
        JsonNode e1 = d.get("entries").get(1);
        assertEquals("せんせい", e1.get("reading").asText());
        assertEquals("giáo viên", e1.get("meaning").asText());

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> options = ArgumentCaptor.forClass(Map.class);
        Mockito.verify(ai).analyze(org.mockito.ArgumentMatchers.eq(LIST), any(), options.capture());
        assertEquals("list", options.getValue().get("extractMode"));
        assertEquals(false, options.getValue().get("splitChapters"));
        assertEquals(false, options.getValue().get("warnConflicts"));
        Mockito.verify(ai).extractText(org.mockito.ArgumentMatchers.isNull(), org.mockito.ArgumentMatchers.isNull(),
                org.mockito.ArgumentMatchers.eq(LIST), org.mockito.ArgumentMatchers.eq("auto"), org.mockito.ArgumentMatchers.isNull());

        List<JsonNode> logs = audits(a.token, id);
        assertEquals(1, logs.size());
        assertEquals("KNOWLEDGE_UPLOAD", logs.get(0).get("action").asText());
        assertEquals(2, logs.get(0).get("detail").get("entryCount").asInt());

        // chi tiết đọc lại giống response tạo; danh sách lọc theo q / kind / status
        JsonNode again = read(call(get("/api/admin/knowledge-sources/" + id), a.token, null).andExpect(status().isOk()));
        assertEquals(2, again.get("entries").size());
        JsonNode page = read(call(get("/api/admin/knowledge-sources").param("q", title.substring(title.length() - 8).toUpperCase()).param("kind", "VOCAB")
                .param("status", "ACTIVE"), a.token, null).andExpect(status().isOk()));
        assertEquals(1, page.get("total").asInt());
        JsonNode row = page.get("items").get(0);
        assertEquals(id, row.get("id").asText());
        assertEquals(2, row.get("entryCount").asInt());
        assertEquals(a.email, row.get("uploadedByEmail").asText());
        assertFalse(row.has("entries"), "danh sách không kèm entries / nội dung");
        assertFalse(row.has("contentPreview"));
        assertEquals(0, read(call(get("/api/admin/knowledge-sources").param("q", title).param("kind", "KANJI"), a.token, null)
                .andExpect(status().isOk())).get("total").asInt());
        assertEquals(1, read(call(get("/api/admin/knowledge-sources").param("q", a.email), a.token, null)
                .andExpect(status().isOk())).get("total").asInt(), "q khớp email người tải");
        call(get("/api/admin/knowledge-sources").param("kind", "BAD"), a.token, null).andExpect(status().isBadRequest());
    }

    /**
     * Mục quản trị thắng từ điển ở 0.95, nên chỉ được chứa cái tài liệu nguồn TỰ GHI: danh sách chỉ có cột nghĩa ("明日 ngày mai")
     * thì cách đọc Sudachi đoán (あした) và gloss JMdict (tomorrow) không được lưu — nếu lưu, mọi tài liệu ghi 明日（あす） bị báo sai.
     */
    @Test
    void entries_keep_only_values_the_document_declared() throws Exception {
        Account a = admin();
        stubAnalyze(List.of(
                item("明日", "あした", "tomorrow", null, null, null, false),   // không khai gì: chỉ còn term + cấp nguồn
                item("今日", "きょう", "today", "hôm nay", null, null, false), // nghĩa VI in sẵn, cách đọc đoán
                item("昨日", "きのう", "yesterday", null, "きのう", "yesterday", false))); // khai đủ
        String text = String.join("\n", "明日 ngày mai", "今日 hôm nay", "昨日 きのう yesterday");
        JsonNode d = read(upload(a.token, text, unique("Chỉ nghĩa"), "VOCAB", "N5").andExpect(status().isCreated()));
        assertEquals(3, d.get("entryCount").asInt());
        JsonNode tomorrow = d.get("entries").get(0);
        assertEquals("明日", tomorrow.get("term").asText());
        assertFalse(tomorrow.has("reading"), "cách đọc Sudachi đoán không thành cách đọc chuẩn");
        assertFalse(tomorrow.has("meaning"), "gloss từ điển không thành nghĩa chuẩn");
        assertEquals("N5", tomorrow.get("level").asText());
        JsonNode today = d.get("entries").get(1);
        assertFalse(today.has("reading"));
        assertEquals("hôm nay", today.get("meaning").asText());
        JsonNode yesterday = d.get("entries").get(2);
        assertEquals("きのう", yesterday.get("reading").asText());
        assertEquals("yesterday", yesterday.get("meaning").asText());
    }

    @Test
    void upload_file_and_input_validation() throws Exception {
        Account a = admin();
        String title = unique("Kanji N4");
        MockMultipartFile file = new MockMultipartFile("file", "kanji.txt", "text/plain", LIST.getBytes(StandardCharsets.UTF_8));
        JsonNode d = read(send(multipart("/api/admin/knowledge-sources"), a.token, file, null, title, "KANJI", null)
                .andExpect(status().isCreated()));
        assertEquals("kanji.txt", d.get("sourceName").asText());
        assertFalse(d.has("level"));
        assertFalse(d.get("entries").get(0).has("level"), "nguồn không khai cấp -> mục không có cấp");

        long before = repo.count();
        upload(a.token, LIST, null, "VOCAB", null).andExpect(status().isBadRequest());               // thiếu tiêu đề
        upload(a.token, LIST, "x".repeat(201), "VOCAB", null).andExpect(status().isBadRequest());     // tiêu đề quá dài
        upload(a.token, LIST, "T", "WORDS", null).andExpect(status().isBadRequest());                 // loại lạ
        upload(a.token, LIST, "T", "VOCAB", "N6").andExpect(status().isBadRequest());                 // cấp lạ
        upload(a.token, null, "T", "VOCAB", null).andExpect(status().isBadRequest());                 // không có nội dung
        send(multipart("/api/admin/knowledge-sources"), a.token, file, LIST, "T", "VOCAB", null)
                .andExpect(status().isBadRequest());                                                  // cả file lẫn text
        byte[] big = new byte[2 * 1024 * 1024 + 1];
        Arrays.fill(big, (byte) 'a');
        send(multipart("/api/admin/knowledge-sources"), a.token,
                new MockMultipartFile("file", "big.txt", "text/plain", big), null, "T", "VOCAB", null)
                .andExpect(status().isPayloadTooLarge());
        send(multipart("/api/admin/knowledge-sources"), a.token,
                new MockMultipartFile("file", "fake.pdf", "application/pdf", "not a pdf".getBytes(StandardCharsets.UTF_8)),
                null, "T", "VOCAB", null).andExpect(status().isBadRequest());                        // sai magic bytes

        // quá 20 trang (ai-service đếm trang) -> 400, không phân tích
        Mockito.clearInvocations(ai);
        Mockito.when(ai.extractText(any(), any(), any(), any(), any()))
                .thenReturn(new AiDtos.TextResult(LIST, Map.of("engine", "pdf-text", "pages", 21), List.of()));
        upload(a.token, LIST, "T", "VOCAB", null).andExpect(status().isBadRequest());
        Mockito.verify(ai, Mockito.never()).analyze(org.mockito.ArgumentMatchers.eq(LIST), any(), any());

        // không trích được mục nào: 400 với VOCAB, OTHER (tài liệu tham khảo tự do) vẫn nhận
        Mockito.when(ai.extractText(any(), any(), any(), any(), any()))
                .thenReturn(new AiDtos.TextResult(LIST, Map.of("engine", "text", "pages", 1), List.of()));
        stubAnalyze(List.of(item("雑音", "ざつおん", null, null, null, null, true)));
        upload(a.token, LIST, "T", "VOCAB", null).andExpect(status().isBadRequest());
        JsonNode otherKind = read(upload(a.token, LIST, unique("Ghi chú"), "OTHER", null).andExpect(status().isCreated()));
        assertEquals(0, otherKind.get("entryCount").asInt());
        assertEquals(0, otherKind.get("entries").size());

        // ai-service tắt -> 503, không lưu gì
        Mockito.when(ai.extractText(any(), any(), any(), any(), any()))
                .thenThrow(new AiServiceClient.AiServiceException("Không kết nối được dịch vụ AI."));
        upload(a.token, LIST, "T", "VOCAB", null).andExpect(status().isServiceUnavailable());
        assertEquals(before + 1, repo.count(), "chỉ nguồn OTHER hợp lệ được lưu");
    }

    @Test
    void update_archive_activate_delete_with_audit_and_permissions() throws Exception {
        Account a = admin();
        String superToken = newStaff(Role.SUPER_ADMIN);
        String id = read(upload(a.token, LIST, unique("Ngữ pháp"), "GRAMMAR", "N4").andExpect(status().isCreated()))
                .get("id").asText();

        // PUT = phiên bản mới trên cùng id
        stubAnalyze(List.of(item("〜ために", null, "in order to", "để", null, null, false)));
        String newTitle = unique("Ngữ pháp v2");
        JsonNode v2 = read(send(put(id), a.token, null, "〜ために: để\n", newTitle, "GRAMMAR", "N3").andExpect(status().isOk()));
        assertEquals(id, v2.get("id").asText());
        assertEquals(2, v2.get("version").asInt());
        assertEquals(newTitle, v2.get("title").asText());
        assertEquals("N3", v2.get("level").asText());
        assertEquals(1, v2.get("entryCount").asInt());
        assertEquals("〜ために", v2.get("entries").get(0).get("term").asText());
        assertEquals("N3", v2.get("entries").get(0).get("level").asText());
        assertEquals("ACTIVE", v2.get("status").asText());
        send(put(UUID.randomUUID().toString()), a.token, null, LIST, "T", "VOCAB", null).andExpect(status().isNotFound());

        // lưu trữ / dùng lại; lặp lại trạng thái hiện có -> 409, không audit
        JsonNode archived = read(call(post("/api/admin/knowledge-sources/" + id + "/archive"), a.token, null)
                .andExpect(status().isOk()));
        assertEquals("ARCHIVED", archived.get("status").asText());
        assertEquals(2, archived.get("version").asInt());
        call(post("/api/admin/knowledge-sources/" + id + "/archive"), a.token, null).andExpect(status().isConflict());
        assertEquals(1, read(call(get("/api/admin/knowledge-sources").param("q", newTitle).param("status", "ARCHIVED"),
                a.token, null).andExpect(status().isOk())).get("total").asInt());
        assertEquals("ACTIVE", read(call(post("/api/admin/knowledge-sources/" + id + "/activate"), a.token, null)
                .andExpect(status().isOk())).get("status").asText());
        call(post("/api/admin/knowledge-sources/" + id + "/activate"), a.token, null).andExpect(status().isConflict());

        // xoá hẳn: ADMIN 403, SUPER_ADMIN 204
        call(delete("/api/admin/knowledge-sources/" + id), a.token, null).andExpect(status().isForbidden());
        call(delete("/api/admin/knowledge-sources/" + id), superToken, null).andExpect(status().isNoContent());
        call(get("/api/admin/knowledge-sources/" + id), a.token, null).andExpect(status().isNotFound());
        call(delete("/api/admin/knowledge-sources/" + id), superToken, null).andExpect(status().isNotFound());
        call(post("/api/admin/knowledge-sources/" + id + "/archive"), a.token, null).andExpect(status().isNotFound());
        call(get("/api/admin/knowledge-sources/not-a-uuid"), a.token, null).andExpect(status().isBadRequest());

        List<String> actions = new ArrayList<>(audits(a.token, id).stream().map(l -> l.get("action").asText()).toList());
        java.util.Collections.sort(actions);
        assertEquals(List.of("KNOWLEDGE_ACTIVATE", "KNOWLEDGE_ARCHIVE", "KNOWLEDGE_DELETE", "KNOWLEDGE_UPDATE",
                "KNOWLEDGE_UPLOAD"), actions, "mỗi thao tác ghi thành công đúng một dòng audit");
        JsonNode update = audits(a.token, id).stream().filter(l -> "KNOWLEDGE_UPDATE".equals(l.get("action").asText()))
                .findFirst().orElseThrow();
        assertEquals(1, update.get("detail").get("version").get("before").asInt());
        assertEquals(2, update.get("detail").get("version").get("after").asInt());
        assertEquals("N4", update.get("detail").get("level").get("before").asText());
        JsonNode deleted = audits(a.token, id).stream().filter(l -> "KNOWLEDGE_DELETE".equals(l.get("action").asText()))
                .findFirst().orElseThrow();
        assertEquals(newTitle, deleted.get("detail").get("title").asText(), "audit xoá giữ tiêu đề để còn tra được");
    }

    @Test
    void learners_and_anonymous_are_rejected() throws Exception {
        String user = newUser();
        call(get("/api/admin/knowledge-sources"), user, null).andExpect(status().isForbidden());
        upload(user, LIST, "T", "VOCAB", null).andExpect(status().isForbidden());
        call(post("/api/admin/knowledge-sources/" + UUID.randomUUID() + "/archive"), user, null).andExpect(status().isForbidden());
        call(delete("/api/admin/knowledge-sources/" + UUID.randomUUID()), user, null).andExpect(status().isForbidden());
        call(get("/api/admin/knowledge-sources"), null, null).andExpect(status().isUnauthorized());
        Mockito.verifyNoInteractions(ai);
    }
}
