package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.model.KanjiMnemonic;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.repository.KanjiMnemonicRepository;
import com.pbl6.flashcard.service.AiServiceClient;
import com.pbl6.flashcard.service.ContentAiClient;
import com.pbl6.flashcard.service.MnemonicService;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.ResultActions;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyList;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Mẹo nhớ chữ Hán + kiểm duyệt (hợp đồng đợt 2 §4): sinh mẹo qua ai-service giả lập, tự viết, ai thấy mẹo nào, duyệt thay mẹo cũ,
 * từ chối cần lý do, 409 khi không còn PENDING, audit + thông báo tác giả, phân quyền USER / staff. DB dùng chung giữa các test
 * (partial unique index theo chữ) nên mỗi test dùng chữ riêng.
 */
class MnemonicIT extends IntegrationTest {

    @MockitoBean
    ContentAiClient contentAi;

    /** Bảng bộ thủ cho tên bộ trong hàng chờ duyệt (NlpService.radicals()). */
    @MockitoBean
    AiServiceClient ai;

    @Autowired
    KanjiMnemonicRepository repo;

    @Autowired
    MnemonicService service;

    private record Account(String email, String token, Long id) {}

    private Account user() throws Exception {
        String email = newEmail();
        return new Account(email, newUser(email), userId(email));
    }

    private Account admin() throws Exception {
        String email = newEmail();
        return new Account(email, newStaff(Role.ADMIN, email), userId(email));
    }

    @BeforeEach
    void stubAi() throws Exception {
        Mockito.reset(contentAi, ai);
        Mockito.when(ai.radicals()).thenReturn(json.readTree("""
                {"items":[{"no":85,"char":"⽔","unified":"水","strokes":4,"nameVi":"thủy","meaningVi":"nước"}]}"""));
    }

    private JsonNode cards(String raw) throws Exception {
        return json.readTree(raw);
    }

    private JsonNode mnemonics(String token, String ch) throws Exception {
        return read(call(get("/api/kanji/{ch}/mnemonics", ch), token, null).andExpect(status().isOk()));
    }

    private String create(String token, String ch, String text) throws Exception {
        return read(call(post("/api/kanji/mnemonics"), token, Map.of("kanji", ch, "mnemonicVi", text))
                .andExpect(status().isCreated())).get("id").asText();
    }

    private ResultActions approve(String token, String id, Object body) throws Exception {
        return call(post("/api/admin/mnemonics/" + id + "/approve"), token, body);
    }

    private ResultActions reject(String token, String id, Object body) throws Exception {
        return call(post("/api/admin/mnemonics/" + id + "/reject"), token, body);
    }

    private List<JsonNode> audits(String adminToken, String targetId) throws Exception {
        JsonNode p = read(call(get("/api/admin/audit-logs").param("targetType", "MNEMONIC").param("size", "100"), adminToken, null)
                .andExpect(status().isOk()));
        List<JsonNode> out = new ArrayList<>();
        for (JsonNode r : p.get("items")) if (r.get("targetId").asText().equals(targetId)) out.add(r);
        return out;
    }

    @Test
    void generate_stores_pending_and_skips_kanji_with_own_pending() throws Exception {
        Account u = user();
        Mockito.when(contentAi.radicalCardsWithMnemonic(List.of("海", "河"))).thenReturn(cards("""
                {"items":[
                  {"kanji":"海","hanViet":"HẢI","radical":{"no":85,"char":"水","nameVi":"thủy"},
                   "mnemonicVi":"Nước biển mênh mông: HẢI","mnemonicSource":"gemini"},
                  {"kanji":"河","hanViet":"HÀ","radical":null,"mnemonicVi":"Chữ 河 đọc Hán-Việt là HÀ.","mnemonicSource":"template"},
                  {"kanji":"湖","mnemonicVi":"không được hỏi","mnemonicSource":"gemini"}
                ],"groups":[],"reason":"quota"}"""));
        // trùng, không phải chữ Hán, nhiều chữ -> bỏ qua trước khi gọi ai-service
        JsonNode res = read(call(post("/api/kanji/mnemonics/generate"), u.token,
                Map.of("kanji", List.of("海", " 河", "海", "x", "海河", "々"))).andExpect(status().isOk()));
        Mockito.verify(contentAi).radicalCardsWithMnemonic(List.of("海", "河"));
        assertEquals("quota", res.get("reason").asText());
        assertEquals(2, res.get("items").size(), "chữ ai-service trả về nhưng không được hỏi bị bỏ");
        JsonNode sea = res.get("items").get(0);
        assertEquals("海", sea.get("kanji").asText());
        assertEquals("AI", sea.get("source").asText());
        assertEquals("PENDING", sea.get("status").asText());
        assertEquals("TEMPLATE", res.get("items").get(1).get("source").asText());

        KanjiMnemonic stored = repo.findById(UUID.fromString(sea.get("id").asText())).orElseThrow();
        assertEquals(85, stored.getRadicalNo());
        assertEquals("gemini", stored.getGeneratedModel());
        assertEquals(u.id, stored.getCreatedBy());
        assertNull(repo.findById(UUID.fromString(res.get("items").get(1).get("id").asText())).orElseThrow().getGeneratedModel());

        // 海 đã có mẹo PENDING của mình -> chỉ hỏi 湖
        Mockito.when(contentAi.radicalCardsWithMnemonic(List.of("湖"))).thenReturn(cards("""
                {"items":[{"kanji":"湖","radical":{"no":85},"mnemonicVi":"Hồ nước: HỒ","mnemonicSource":"gemini"}],"reason":null}"""));
        JsonNode second = read(call(post("/api/kanji/mnemonics/generate"), u.token, Map.of("kanji", List.of("海", "湖")))
                .andExpect(status().isOk()));
        assertEquals(1, second.get("items").size());
        assertFalse(second.has("reason"), "reason null bị bỏ (NON_NULL)");
        // Mọi chữ đều đang chờ duyệt -> không gọi ai-service, không tạo gì
        Mockito.clearInvocations(contentAi);
        JsonNode none = read(call(post("/api/kanji/mnemonics/generate"), u.token, Map.of("kanji", List.of("海", "湖")))
                .andExpect(status().isOk()));
        assertEquals(0, none.get("items").size());
        Mockito.verifyNoInteractions(contentAi);

        // Người khác không bị ảnh hưởng bởi mẹo PENDING của u
        Account other = user();
        Mockito.when(contentAi.radicalCardsWithMnemonic(List.of("海"))).thenReturn(cards("""
                {"items":[{"kanji":"海","mnemonicVi":"Biển: HẢI","mnemonicSource":"template"}],"reason":"no_key"}"""));
        assertEquals(1, read(call(post("/api/kanji/mnemonics/generate"), other.token, Map.of("kanji", List.of("海")))
                .andExpect(status().isOk())).get("items").size());
    }

    @Test
    void generate_validates_body_and_maps_ai_errors() throws Exception {
        Account u = user();
        call(post("/api/kanji/mnemonics/generate"), u.token, Map.of("kanji", List.of())).andExpect(status().isBadRequest());
        List<String> many = new ArrayList<>();
        for (int i = 0; i < 31; i++) many.add(String.valueOf((char) (0x4E00 + i)));
        call(post("/api/kanji/mnemonics/generate"), u.token, Map.of("kanji", many)).andExpect(status().isBadRequest());
        call(post("/api/kanji/mnemonics/generate"), u.token, Map.of("kanji", List.of("水水水水水"))).andExpect(status().isBadRequest());
        Mockito.verifyNoInteractions(contentAi);

        Mockito.when(contentAi.radicalCardsWithMnemonic(anyList()))
                .thenThrow(new AiServiceClient.AiServiceException("Không kết nối được dịch vụ AI (sinh mẹo nhớ bộ thủ)."));
        call(post("/api/kanji/mnemonics/generate"), u.token, Map.of("kanji", List.of("泉"))).andExpect(status().isServiceUnavailable());
        assertTrue(repo.findByCreatedByAndKanjiOrderByCreatedAtDescIdAsc(u.id, "泉").isEmpty(), "lỗi ai-service không lưu gì");
    }

    @Test
    void learners_see_only_approved_and_their_own() throws Exception {
        Account author = user();
        Account other = user();
        Account admin = admin();
        String id = create(author.token, "森", "  Ba cây thành rừng: SÂM  ");

        JsonNode mine = mnemonics(author.token, "森");
        assertEquals("森", mine.get("kanji").asText());
        assertTrue(mine.get("approved").isNull(), "approved luôn có mặt, null khi chưa có mẹo công khai");
        assertEquals(1, mine.get("mine").size());
        assertEquals("Ba cây thành rừng: SÂM", mine.get("mine").get(0).get("mnemonicVi").asText());
        assertEquals("USER", mine.get("mine").get(0).get("source").asText());
        assertEquals("PENDING", mine.get("mine").get(0).get("status").asText());

        JsonNode theirs = mnemonics(other.token, "森");
        assertTrue(theirs.get("approved").isNull(), "mẹo PENDING của người khác không lộ");
        assertEquals(0, theirs.get("mine").size());

        approve(admin.token, id, Map.of("note", "Hay")).andExpect(status().isOk());
        JsonNode after = mnemonics(other.token, "森");
        assertEquals(id, after.get("approved").get("id").asText());
        assertEquals("Ba cây thành rừng: SÂM", after.get("approved").get("mnemonicVi").asText());
        assertEquals("USER", after.get("approved").get("source").asText());
        assertEquals("APPROVED", mnemonics(author.token, "森").get("mine").get(0).get("status").asText());
        assertEquals("Hay", mnemonics(author.token, "森").get("mine").get(0).get("reviewNote").asText());
    }

    @Test
    void create_validates_and_caps_pending_per_kanji() throws Exception {
        Account u = user();
        call(post("/api/kanji/mnemonics"), u.token, Map.of("kanji", "ab", "mnemonicVi", "x")).andExpect(status().isBadRequest());
        call(post("/api/kanji/mnemonics"), u.token, Map.of("kanji", "々", "mnemonicVi", "x")).andExpect(status().isBadRequest());
        call(post("/api/kanji/mnemonics"), u.token, Map.of("kanji", "竹", "mnemonicVi", "   ")).andExpect(status().isBadRequest());
        call(post("/api/kanji/mnemonics"), u.token, Map.of("kanji", "竹", "mnemonicVi", "a".repeat(301)))
                .andExpect(status().isBadRequest());
        call(get("/api/kanji/{ch}/mnemonics", "abc"), u.token, null).andExpect(status().isBadRequest());

        for (int i = 0; i < 3; i++) create(u.token, "竹", "Mẹo " + i);
        call(post("/api/kanji/mnemonics"), u.token, Map.of("kanji", "竹", "mnemonicVi", "Mẹo 4")).andExpect(status().isConflict());
        // Giới hạn tính theo người: người khác vẫn gửi được
        create(user().token, "竹", "Của người khác");
    }

    /** ai-service giả: mỗi chữ được hỏi một mẹo mẫu. */
    private void stubTemplateCards() {
        Mockito.when(contentAi.radicalCardsWithMnemonic(anyList())).thenAnswer(inv -> {
            List<String> asked = inv.getArgument(0);
            List<Map<String, Object>> items = asked.stream()
                    .map(ch -> Map.<String, Object>of("kanji", ch, "mnemonicVi", "Mẹo mẫu " + ch, "mnemonicSource", "template"))
                    .toList();
            return json.valueToTree(Map.of("items", items));
        });
    }

    /** Chữ CJK riêng cho từng test (DB dùng chung; chỉ mẹo PENDING của chính người đó mới bị bỏ qua). */
    private static String han(int base, int i) {
        return new String(Character.toChars(base + i));
    }

    @Test
    void generate_is_rate_limited_per_user() throws Exception {
        stubTemplateCards();
        Account u = user();
        for (int i = 0; i < 10; i++) {
            call(post("/api/kanji/mnemonics/generate"), u.token, Map.of("kanji", List.of(han(0x5100, i))))
                    .andExpect(status().isOk());
        }
        call(post("/api/kanji/mnemonics/generate"), u.token, Map.of("kanji", List.of(han(0x5100, 10))))
                .andExpect(status().isTooManyRequests());
        Mockito.verify(contentAi, Mockito.times(10)).radicalCardsWithMnemonic(anyList());
        // lượt không cần gọi ai-service (mọi chữ đã có mẹo chờ duyệt) không bị chặn và không tính
        assertEquals(0, read(call(post("/api/kanji/mnemonics/generate"), u.token, Map.of("kanji", List.of(han(0x5100, 0))))
                .andExpect(status().isOk())).get("items").size());
        // đếm theo người: người khác vẫn sinh được
        call(post("/api/kanji/mnemonics/generate"), user().token, Map.of("kanji", List.of(han(0x5100, 10))))
                .andExpect(status().isOk());
    }

    @Test
    void pending_mnemonics_are_capped_per_user() throws Exception {
        stubTemplateCards();
        Account u = user();
        List<KanjiMnemonic> rows = new ArrayList<>();
        for (int i = 0; i < 48; i++) {
            rows.add(new KanjiMnemonic(han(0x5200, i), null, "Mẹo " + i, KanjiMnemonic.SOURCE_USER, null, u.id));
        }
        repo.saveAll(rows);
        // 48 chờ duyệt: lô 3 chữ vượt trần 50 -> 409, không gọi ai-service
        call(post("/api/kanji/mnemonics/generate"), u.token,
                Map.of("kanji", List.of(han(0x5200, 100), han(0x5200, 101), han(0x5200, 102))))
                .andExpect(status().isConflict());
        Mockito.verifyNoInteractions(contentAi);
        assertEquals(1, read(call(post("/api/kanji/mnemonics/generate"), u.token, Map.of("kanji", List.of(han(0x5200, 100))))
                .andExpect(status().isOk())).get("items").size(), "vừa đủ chỗ: 49");
        create(u.token, han(0x5200, 101), "Mẹo thứ 50");
        call(post("/api/kanji/mnemonics"), u.token, Map.of("kanji", han(0x5200, 102), "mnemonicVi", "Mẹo 51"))
                .andExpect(status().isConflict());
        call(post("/api/kanji/mnemonics/generate"), u.token, Map.of("kanji", List.of(han(0x5200, 103))))
                .andExpect(status().isConflict());
        assertEquals(50, repo.countByCreatedByAndStatus(u.id, KanjiMnemonic.PENDING));
        // mẹo đã được xử lý không còn tính vào trần
        reject(admin().token, rows.get(0).getId().toString(), Map.of("note", "Trùng")).andExpect(status().isOk());
        create(u.token, han(0x5200, 102), "Có chỗ lại");
    }

    @Test
    void approve_replaces_previous_approved_atomically() throws Exception {
        Account author = user();
        Account admin = admin();
        String first = create(author.token, "林", "Hai cây: LÂM");
        String second = create(author.token, "林", "Rừng thưa: LÂM");
        approve(admin.token, first, null).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"));

        JsonNode res = read(approve(admin.token, second, Map.of()).andExpect(status().isOk()));
        assertEquals("APPROVED", res.get("status").asText());
        assertEquals(admin.email, res.get("reviewedByEmail").asText());
        assertEquals(author.email, res.get("authorEmail").asText());

        KanjiMnemonic old = repo.findById(UUID.fromString(first)).orElseThrow();
        assertEquals(KanjiMnemonic.REJECTED, old.getStatus());
        assertEquals("Thay bằng mẹo mới", old.getReviewNote());
        assertEquals(second, mnemonics(author.token, "林").get("approved").get("id").asText());
        assertEquals(1, repo.findByKanjiInAndStatus(List.of("林"), KanjiMnemonic.APPROVED).size());

        // Đúng một dòng audit cho lần duyệt thứ hai, ghi lại mẹo bị thay
        List<JsonNode> logs = audits(admin.token, second);
        assertEquals(1, logs.size());
        assertEquals("MNEMONIC_APPROVE", logs.get(0).get("action").asText());
        assertEquals(first, logs.get(0).get("detail").get("replacedId").asText());
        assertEquals(1, audits(admin.token, first).size(), "mẹo cũ chỉ có dòng audit của lần duyệt của nó");
    }

    @Test
    void reject_requires_note_and_notifies_author() throws Exception {
        Account author = user();
        Account admin = admin();
        String id = create(author.token, "松", "Cây thông: TÙNG");
        reject(admin.token, id, null).andExpect(status().isBadRequest());
        reject(admin.token, id, Map.of("note", "   ")).andExpect(status().isBadRequest());
        reject(admin.token, id, Map.of("note", "x".repeat(501))).andExpect(status().isBadRequest());
        assertEquals(KanjiMnemonic.PENDING, repo.findById(UUID.fromString(id)).orElseThrow().getStatus());
        assertEquals(0, audits(admin.token, id).size());

        JsonNode res = read(reject(admin.token, id, Map.of("note", " Sai âm Hán-Việt ")).andExpect(status().isOk()));
        assertEquals("REJECTED", res.get("status").asText());
        assertEquals("Sai âm Hán-Việt", res.get("reviewNote").asText());
        assertNotNull(res.get("reviewedAt"));
        List<JsonNode> logs = audits(admin.token, id);
        assertEquals(1, logs.size());
        assertEquals("MNEMONIC_REJECT", logs.get(0).get("action").asText());

        JsonNode feed = read(call(get("/api/notifications"), author.token, null).andExpect(status().isOk()));
        JsonNode n = feed.get("items").get(0);
        assertEquals("MNEMONIC_REVIEWED", n.get("type").asText());
        assertEquals("松", n.get("payload").get("kanji").asText());
        assertEquals("REJECTED", n.get("payload").get("status").asText());
        assertEquals("Sai âm Hán-Việt", n.get("payload").get("note").asText());
        assertEquals(1, feed.get("unread").asLong());

        // Duyệt cũng báo tác giả (note null bị bỏ khỏi payload)
        String other = create(author.token, "松", "Thông xanh: TÙNG");
        approve(admin.token, other, null).andExpect(status().isOk());
        JsonNode latest = read(call(get("/api/notifications"), author.token, null)).get("items").get(0);
        assertEquals("APPROVED", latest.get("payload").get("status").asText());
        assertFalse(latest.get("payload").has("note"));
    }

    @Test
    void only_pending_can_be_edited_or_reviewed() throws Exception {
        Account author = user();
        Account admin = admin();
        String id = create(author.token, "桜", "Hoa anh đào: ANH");

        JsonNode edited = read(call(patch("/api/admin/mnemonics/" + id), admin.token, Map.of("mnemonicVi", " Cây anh đào: ANH "))
                .andExpect(status().isOk()));
        assertEquals("Cây anh đào: ANH", edited.get("mnemonicVi").asText());
        assertEquals("PENDING", edited.get("status").asText());
        List<JsonNode> logs = audits(admin.token, id);
        assertEquals(1, logs.size());
        assertEquals("MNEMONIC_EDIT", logs.get(0).get("action").asText());
        assertEquals("Hoa anh đào: ANH", logs.get(0).get("detail").get("mnemonicVi").get("before").asText());
        call(patch("/api/admin/mnemonics/" + id), admin.token, Map.of("mnemonicVi", "")).andExpect(status().isBadRequest());

        approve(admin.token, id, null).andExpect(status().isOk());
        approve(admin.token, id, null).andExpect(status().isConflict());
        reject(admin.token, id, Map.of("note", "muộn")).andExpect(status().isConflict());
        call(patch("/api/admin/mnemonics/" + id), admin.token, Map.of("mnemonicVi", "Sửa sau duyệt")).andExpect(status().isConflict());
        assertEquals(2, audits(admin.token, id).size(), "thao tác bị 409 không ghi audit");
        assertEquals("Cây anh đào: ANH", repo.findById(UUID.fromString(id)).orElseThrow().getMnemonicVi());

        String missing = UUID.randomUUID().toString();
        approve(admin.token, missing, null).andExpect(status().isNotFound());
        reject(admin.token, missing, Map.of("note", "x")).andExpect(status().isNotFound());
        call(patch("/api/admin/mnemonics/" + missing), admin.token, Map.of("mnemonicVi", "x")).andExpect(status().isNotFound());
        approve(admin.token, "khong-phai-uuid", null).andExpect(status().isBadRequest());
    }

    @Test
    void admin_list_filters_and_shows_radical_and_emails() throws Exception {
        Account author = user();
        Account admin = admin();
        Mockito.when(contentAi.radicalCardsWithMnemonic(List.of("泳"))).thenReturn(cards("""
                {"items":[{"kanji":"泳","radical":{"no":85,"char":"水","nameVi":"thủy"},
                "mnemonicVi":"Bơi trong nước: VỊNH","mnemonicSource":"gemini"}],"reason":null}"""));
        String generated = read(call(post("/api/kanji/mnemonics/generate"), author.token, Map.of("kanji", List.of("泳")))
                .andExpect(status().isOk())).get("items").get(0).get("id").asText();
        // Mẹo tự viết mượn số bộ của mẹo đã sinh cho cùng chữ
        String own = create(author.token, "泳", "Vịnh là bơi");

        long pendingBefore = service.countPending();
        JsonNode page = read(call(get("/api/admin/mnemonics").param("q", "泳"), admin.token, null).andExpect(status().isOk()));
        assertEquals(2, page.get("total").asLong());
        assertEquals(0, page.get("page").asInt());
        JsonNode row = page.get("items").get(1);   // mới nhất trước: mẹo tự viết ở đầu
        assertEquals(generated, row.get("id").asText());
        assertEquals(85, row.get("radical").get("no").asInt());
        assertEquals("水", row.get("radical").get("char").asText());
        assertEquals("thủy", row.get("radical").get("nameVi").asText());
        assertEquals(author.email, row.get("authorEmail").asText());
        assertEquals("gemini", row.get("generatedModel").asText());
        assertEquals("AI", row.get("source").asText());
        assertFalse(row.has("reviewedByEmail"));
        assertEquals(own, page.get("items").get(0).get("id").asText());
        assertEquals(85, page.get("items").get(0).get("radical").get("no").asInt());

        // q theo email tác giả / nội dung; trạng thái khác PENDING
        assertEquals(2, read(call(get("/api/admin/mnemonics").param("q", author.email.toUpperCase()), admin.token, null))
                .get("total").asLong());
        assertEquals(1, read(call(get("/api/admin/mnemonics").param("q", "bơi trong"), admin.token, null)).get("total").asLong());
        approve(admin.token, own, null).andExpect(status().isOk());
        assertEquals(pendingBefore - 1, service.countPending());
        JsonNode approved = read(call(get("/api/admin/mnemonics").param("status", "APPROVED").param("q", "泳"), admin.token, null));
        assertEquals(1, approved.get("total").asLong());
        assertEquals(admin.email, approved.get("items").get(0).get("reviewedByEmail").asText());
        call(get("/api/admin/mnemonics").param("status", "ALL"), admin.token, null).andExpect(status().isBadRequest());
        call(get("/api/admin/mnemonics").param("size", "101"), admin.token, null).andExpect(status().isBadRequest());
    }

    @Test
    void roles_are_enforced() throws Exception {
        Account u = user();
        String id = create(u.token, "梅", "Hoa mai: MAI");
        // USER không vào được trang admin
        call(get("/api/admin/mnemonics"), u.token, null).andExpect(status().isForbidden());
        approve(u.token, id, null).andExpect(status().isForbidden());
        reject(u.token, id, Map.of("note", "x")).andExpect(status().isForbidden());
        call(patch("/api/admin/mnemonics/" + id), u.token, Map.of("mnemonicVi", "x")).andExpect(status().isForbidden());
        // Staff không dùng API học tập
        for (Role role : new Role[] {Role.ADMIN, Role.SUPER_ADMIN}) {
            String staff = newStaff(role);
            call(get("/api/kanji/{ch}/mnemonics", "梅"), staff, null).andExpect(status().isForbidden());
            call(post("/api/kanji/mnemonics"), staff, Map.of("kanji", "梅", "mnemonicVi", "x")).andExpect(status().isForbidden());
            call(post("/api/kanji/mnemonics/generate"), staff, Map.of("kanji", List.of("梅"))).andExpect(status().isForbidden());
        }
        // SUPER_ADMIN duyệt được (RoleHierarchy)
        approve(newStaff(Role.SUPER_ADMIN), id, null).andExpect(status().isOk());
        call(get("/api/kanji/{ch}/mnemonics", "梅"), null, null).andExpect(status().isUnauthorized());
        call(get("/api/admin/mnemonics"), null, null).andExpect(status().isUnauthorized());
        Mockito.verifyNoInteractions(contentAi);
    }
}
