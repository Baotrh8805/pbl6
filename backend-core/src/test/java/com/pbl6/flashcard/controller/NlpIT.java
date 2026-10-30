package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.service.AiServiceClient;
import com.pbl6.flashcard.service.dictionary.DictionaryStore;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Proxy /api/nlp (USER) sang ai-service giả lập: trả nguyên JSON, kiểm tham số trước khi gọi (400, không gọi ai-service), cache GET,
 * đổi lỗi ai-service thành 503 / 404. Cache sống suốt context (dùng chung giữa các test) nên mỗi test dùng tham số riêng.
 */
class NlpIT extends IntegrationTest {

    @MockitoBean
    AiServiceClient ai;

    @Autowired
    DictionaryStore store;

    @BeforeEach
    void resetAi() {
        Mockito.reset(ai);
    }

    private JsonNode node(String rawJson) throws Exception {
        return json.readTree(rawJson);
    }

    @Test
    void endpoints_pass_ai_service_json_through_unchanged() throws Exception {
        String user = newUser();
        JsonNode graph = node("""
                {"reading":"NHẬT","nodes":[{"id":"r:NHẬT","type":"reading","label":"NHẬT"},
                {"id":"k:日","type":"kanji","label":"日","hanViet":"NHẬT"}],"edges":[{"source":"r:NHẬT","target":"k:日"}]}""");
        Mockito.when(ai.hanVietGraph("nhật", "N5", 30)).thenReturn(graph);
        JsonNode got = read(call(get("/api/nlp/han-viet-graph").param("reading", "  nhật ").param("level", "N5"), user, null)
                .andExpect(status().isOk()));
        assertEquals(graph, got, "nguyên văn JSON của ai-service");

        JsonNode suggest = node("{\"query\":\"nh\",\"items\":[{\"reading\":\"NHẬT\",\"count\":3,\"kanji\":[\"日\"]}]}");
        Mockito.when(ai.hanVietSuggest("nh", 5)).thenReturn(suggest);
        assertEquals(suggest, read(call(get("/api/nlp/han-viet-suggest").param("q", "nh").param("limit", "5"), user, null)
                .andExpect(status().isOk())));

        JsonNode cards = node("{\"items\":[{\"kanji\":\"水\",\"hanViet\":\"THUỶ\",\"radical\":null,\"on\":[],\"kun\":[]}]}");
        Mockito.when(ai.kanjiCards(List.of("水", "火"), "N4")).thenReturn(cards);
        assertEquals(cards, read(call(post("/api/nlp/kanji-cards"), user, Map.of("kanji", List.of("水", "火"), "userLevel", "N4"))
                .andExpect(status().isOk())));
        // userLevel rỗng = không gửi
        Mockito.when(ai.kanjiCards(List.of("木"), null)).thenReturn(cards);
        call(post("/api/nlp/kanji-cards"), user, Map.of("kanji", List.of("木"), "userLevel", "")).andExpect(status().isOk());
        Mockito.verify(ai).kanjiCards(List.of("木"), null);

        JsonNode table = node("{\"items\":[{\"no\":85,\"char\":\"⽔\",\"unified\":\"水\",\"strokes\":4,\"nameVi\":\"Thuỷ\"}]}");
        Mockito.when(ai.radicals()).thenReturn(table);
        assertEquals(table, read(call(get("/api/nlp/radicals"), user, null).andExpect(status().isOk())));

        JsonNode byRadical = node("{\"radical\":{\"no\":85},\"levels\":[\"N5\",\"N4\"],\"items\":[{\"kanji\":\"水\",\"level\":\"N5\"}]}");
        Mockito.when(ai.radicalKanji(85, List.of("N5", "N4"))).thenReturn(byRadical);
        assertEquals(byRadical, read(call(get("/api/nlp/radicals/85/kanji").param("levels", "N5,N4"), user, null)
                .andExpect(status().isOk())));
        // Dạng lặp + trùng -> cùng danh sách đã bỏ trùng (và trúng cache của lần trên)
        call(get("/api/nlp/radicals/85/kanji").param("levels", "N5").param("levels", "N4").param("levels", "N5"), user, null)
                .andExpect(status().isOk());
        Mockito.verify(ai, Mockito.times(1)).radicalKanji(85, List.of("N5", "N4"));

        JsonNode radicalCards = node("{\"items\":[{\"kanji\":\"河\",\"mnemonicVi\":null}],\"groups\":[],\"reason\":null}");
        Mockito.when(ai.radicalCards(List.of("河"), false)).thenReturn(radicalCards);
        // Nguyên văn trừ mẹo nhớ: chữ chưa có mẹo đã duyệt nhận câu mẫu (hợp đồng đợt 2 §4, xem radical_cards_use_approved_...)
        assertEquals(node("{\"items\":[{\"kanji\":\"河\",\"mnemonicVi\":\"Chữ 河: viết lại ba lần và đọc to nghĩa để nhớ mặt chữ.\","
                        + "\"mnemonicSource\":\"template\"}],\"groups\":[],\"reason\":null}"),
                read(call(post("/api/nlp/radicals/cards"), user,
                        Map.of("kanji", List.of("河"), "withMnemonic", true)).andExpect(status().isOk())));
        // Mẹo nhớ Gemini chưa qua kiểm duyệt: luôn gửi withMnemonic=false
        Mockito.verify(ai).radicalCards(List.of("河"), false);
        Mockito.verify(ai, Mockito.never()).radicalCards(anyList(), eq(true));
    }

    @Test
    void radical_cards_use_approved_mnemonic_else_template() throws Exception {
        String author = newUser();
        String learner = newUser();
        String admin = newStaff(Role.ADMIN);
        String id = read(call(post("/api/kanji/mnemonics"), author, Map.of("kanji", "畑", "mnemonicVi", "Ruộng khô có lửa: ĐIỀN"))
                .andExpect(status().isCreated())).get("id").asText();
        JsonNode upstream = node("""
                {"items":[
                  {"kanji":"畑","hanViet":null,"radical":{"no":102,"char":"田","nameVi":"điền","meaningVi":"ruộng"},
                   "meaningEn":"field","mnemonicVi":null,"mnemonicSource":null},
                  {"kanji":"海","hanViet":"HẢI","radical":{"no":85,"char":"水","nameVi":"thủy","meaningVi":"nước, sông"},
                   "meaningEn":"sea; ocean","mnemonicVi":null,"mnemonicSource":null},
                  {"kanji":"湖","hanViet":"HỒ","radical":null,"mnemonicVi":"Mẫu của ai-service","mnemonicSource":"template"},
                  {"kanji":"池","hanViet":"TRÌ","radical":null,"mnemonicVi":"Gemini chưa duyệt","mnemonicSource":"gemini"}
                ],"groups":[{"radical":null,"kanji":["湖"]}],"reason":null}""");
        JsonNode original = upstream.deepCopy();
        Mockito.when(ai.radicalCards(List.of("畑", "海", "湖", "池"), false)).thenReturn(upstream);
        Map<String, Object> body = Map.of("kanji", List.of("畑", "海", "湖", "池"));

        // Mẹo còn PENDING không lộ ra thẻ công khai
        JsonNode pending = read(call(post("/api/nlp/radicals/cards"), learner, body).andExpect(status().isOk()));
        assertEquals("template", pending.at("/items/0/mnemonicSource").asText());
        assertEquals("Chữ 畑 có bộ Điền (ruộng), nghĩa tiếng Anh \"field\": thấy ruộng là nhớ chữ 畑.",
                pending.at("/items/0/mnemonicVi").asText());

        call(post("/api/admin/mnemonics/" + id + "/approve"), admin, null).andExpect(status().isOk());
        JsonNode res = read(call(post("/api/nlp/radicals/cards"), learner, body).andExpect(status().isOk()));
        assertEquals("Ruộng khô có lửa: ĐIỀN", res.at("/items/0/mnemonicVi").asText());
        assertEquals("approved", res.at("/items/0/mnemonicSource").asText());
        assertEquals("Chữ 海 có bộ Thủy (nước), âm Hán-Việt HẢI, nghĩa tiếng Anh \"sea\": thấy nước là nhớ HẢI.",
                res.at("/items/1/mnemonicVi").asText());
        assertEquals("template", res.at("/items/1/mnemonicSource").asText());
        // Câu mẫu ai-service tự điền thì giữ; mẹo Gemini chưa duyệt (không bao giờ được hỏi) thì thay bằng câu mẫu
        assertEquals("Mẫu của ai-service", res.at("/items/2/mnemonicVi").asText());
        assertEquals("TRÌ là âm của chữ 池 — gắn TRÌ với hình chữ để nhớ.", res.at("/items/3/mnemonicVi").asText());
        assertEquals("template", res.at("/items/3/mnemonicSource").asText());
        // Phần còn lại nguyên văn; JSON gốc (có thể nằm trong cache / mock) không bị sửa
        assertEquals(original.get("groups"), res.get("groups"));
        assertEquals(102, res.at("/items/0/radical/no").asInt());
        assertEquals(original, upstream);
        Mockito.verify(ai, Mockito.never()).radicalCards(anyList(), eq(true));
    }

    @Test
    void invalid_params_are_rejected_before_calling_ai_service() throws Exception {
        String user = newUser();
        // han-viet-graph: thiếu / rỗng / quá 32 ký tự, cấp lạ, limit ngoài 1..100, limit không phải số
        call(get("/api/nlp/han-viet-graph"), user, null).andExpect(status().isBadRequest());
        call(get("/api/nlp/han-viet-graph").param("reading", "   "), user, null).andExpect(status().isBadRequest());
        call(get("/api/nlp/han-viet-graph").param("reading", "a".repeat(33)), user, null).andExpect(status().isBadRequest());
        call(get("/api/nlp/han-viet-graph").param("reading", "thuy").param("level", "N6"), user, null)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("level")));
        call(get("/api/nlp/han-viet-graph").param("reading", "thuy").param("limit", "0"), user, null)
                .andExpect(status().isBadRequest());
        call(get("/api/nlp/han-viet-graph").param("reading", "thuy").param("limit", "101"), user, null)
                .andExpect(status().isBadRequest());
        call(get("/api/nlp/han-viet-graph").param("reading", "thuy").param("limit", "x"), user, null)
                .andExpect(status().isBadRequest());
        // han-viet-suggest: q bắt buộc, limit 1..50
        call(get("/api/nlp/han-viet-suggest"), user, null).andExpect(status().isBadRequest());
        call(get("/api/nlp/han-viet-suggest").param("q", "th").param("limit", "51"), user, null)
                .andExpect(status().isBadRequest());
        // kanji-cards: thiếu kanji, quá 200 chữ, phần tử rỗng / quá dài, userLevel lạ, body không phải JSON
        call(post("/api/nlp/kanji-cards"), user, Map.of()).andExpect(status().isBadRequest());
        call(post("/api/nlp/kanji-cards"), user, Map.of("kanji", Collections.nCopies(201, "水")))
                .andExpect(status().isBadRequest());
        call(post("/api/nlp/kanji-cards"), user, Map.of("kanji", List.of(""))).andExpect(status().isBadRequest());
        call(post("/api/nlp/kanji-cards"), user, Map.of("kanji", List.of("水".repeat(5)))).andExpect(status().isBadRequest());
        call(post("/api/nlp/kanji-cards"), user, Map.of("kanji", List.of("水"), "userLevel", "N0"))
                .andExpect(status().isBadRequest());
        call(post("/api/nlp/kanji-cards"), user, "không phải JSON").andExpect(status().isBadRequest());
        // radicals/{no}/kanji: số bộ 1..214, levels lạ
        call(get("/api/nlp/radicals/0/kanji"), user, null).andExpect(status().isBadRequest());
        call(get("/api/nlp/radicals/215/kanji"), user, null).andExpect(status().isBadRequest());
        call(get("/api/nlp/radicals/abc/kanji"), user, null).andExpect(status().isBadRequest());
        call(get("/api/nlp/radicals/85/kanji").param("levels", "N5,N9"), user, null).andExpect(status().isBadRequest());
        // radicals/cards: quá 200 chữ
        call(post("/api/nlp/radicals/cards"), user, Map.of("kanji", Collections.nCopies(201, "水")))
                .andExpect(status().isBadRequest());

        Mockito.verifyNoInteractions(ai);
    }

    @Test
    void get_results_are_cached_and_errors_are_not() throws Exception {
        String user = newUser();
        JsonNode first = node("{\"query\":\"cache-a\",\"items\":[]}");
        Mockito.when(ai.hanVietSuggest("cache-a", 10)).thenReturn(first);
        for (int i = 0; i < 3; i++) {
            assertEquals(first, read(call(get("/api/nlp/han-viet-suggest").param("q", "cache-a"), user, null)
                    .andExpect(status().isOk())));
        }
        Mockito.verify(ai, Mockito.times(1)).hanVietSuggest("cache-a", 10);
        // Tham số khác = khoá khác (limit mặc định 10 khác limit 11)
        Mockito.when(ai.hanVietSuggest("cache-a", 11)).thenReturn(first);
        call(get("/api/nlp/han-viet-suggest").param("q", "cache-a").param("limit", "11"), user, null).andExpect(status().isOk());
        Mockito.verify(ai, Mockito.times(1)).hanVietSuggest("cache-a", 11);

        // Lỗi không vào cache: lần sau gọi lại ai-service
        Mockito.when(ai.hanVietGraph(eq("cache-b"), isNull(), anyInt()))
                .thenThrow(new AiServiceClient.AiServiceException("Không kết nối được dịch vụ AI (tra đồ thị Hán-Việt)."))
                .thenReturn(node("{\"nodes\":[],\"edges\":[]}"));
        call(get("/api/nlp/han-viet-graph").param("reading", "cache-b"), user, null).andExpect(status().isServiceUnavailable());
        call(get("/api/nlp/han-viet-graph").param("reading", "cache-b"), user, null).andExpect(status().isOk());
        call(get("/api/nlp/han-viet-graph").param("reading", "cache-b"), user, null).andExpect(status().isOk());
        Mockito.verify(ai, Mockito.times(2)).hanVietGraph(eq("cache-b"), isNull(), anyInt());

        // POST không cache
        Mockito.when(ai.kanjiCards(List.of("雨"), null)).thenReturn(node("{\"items\":[]}"));
        call(post("/api/nlp/kanji-cards"), user, Map.of("kanji", List.of("雨"))).andExpect(status().isOk());
        call(post("/api/nlp/kanji-cards"), user, Map.of("kanji", List.of("雨"))).andExpect(status().isOk());
        Mockito.verify(ai, Mockito.times(2)).kanjiCards(List.of("雨"), null);
    }

    @Test
    void ai_service_errors_map_to_http_status() throws Exception {
        String user = newUser();
        // Không kết nối được / timeout / 5xx -> 503 với thông điệp của AiServiceClient. (Không dùng /radicals: khoá cache cố định,
        // test khác có thể đã cache kết quả thành công.)
        Mockito.when(ai.hanVietSuggest("err-a", 10)).thenThrow(new AiServiceClient.AiServiceException(
                "Không kết nối được dịch vụ AI (gợi ý âm Hán-Việt). Hãy chắc ai-service đang chạy."));
        call(get("/api/nlp/han-viet-suggest").param("q", "err-a"), user, null).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.message", containsString("dịch vụ AI")));
        Mockito.when(ai.radicalCards(anyList(), anyBoolean()))
                .thenThrow(new AiServiceClient.AiServiceException("Dịch vụ AI gặp lỗi.", 500, null));
        call(post("/api/nlp/radicals/cards"), user, Map.of("kanji", List.of("河"))).andExpect(status().isServiceUnavailable());
        // ai-service không có dữ liệu bộ (404) -> 404 với detail của ai-service
        Mockito.when(ai.radicalKanji(eq(7), anyList()))
                .thenThrow(new AiServiceClient.AiServiceException("Không có bộ thủ số 7", 404, null));
        call(get("/api/nlp/radicals/7/kanji"), user, null).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Không có bộ thủ số 7"));
        // ai-service từ chối tham số -> 400; sai X-Internal-Key (401) không lộ ra thành 401 (frontend sẽ đăng xuất) mà là 503
        Mockito.when(ai.kanjiCards(eq(List.of("風")), any()))
                .thenThrow(new AiServiceClient.AiServiceException("userLevel không hợp lệ", 400, null));
        call(post("/api/nlp/kanji-cards"), user, Map.of("kanji", List.of("風"))).andExpect(status().isBadRequest());
        Mockito.when(ai.kanjiCards(eq(List.of("雪")), any()))
                .thenThrow(new AiServiceClient.AiServiceException("Invalid internal key", 401, null));
        call(post("/api/nlp/kanji-cards"), user, Map.of("kanji", List.of("雪"))).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.message", containsString("không khả dụng")));
        // 422 (FastAPI từ chối kiểu tham số) -> 400 với thông điệp tiếng Việt, không lộ chi tiết tiếng Anh của ai-service
        Mockito.when(ai.kanjiCards(eq(List.of("霧")), any()))
                .thenThrow(new AiServiceClient.AiServiceException("value is not a valid list", 422, null));
        call(post("/api/nlp/kanji-cards"), user, Map.of("kanji", List.of("霧"))).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Tham số gửi dịch vụ AI không hợp lệ."));
        // 403 cũng là lỗi cấu hình khoá nội bộ -> 503 như 401, không chuyển nguyên văn ra ngoài
        Mockito.when(ai.kanjiCards(eq(List.of("雷")), any()))
                .thenThrow(new AiServiceClient.AiServiceException("Forbidden", 403, null));
        call(post("/api/nlp/kanji-cards"), user, Map.of("kanji", List.of("雷"))).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.message", containsString("không khả dụng")));
    }

    /**
     * Sơ đồ chữ Hán (spec 2026-10-30 D3 / D4): proxy GET /api/nlp/kanji-diagram, kiểm q / mode trước khi gọi, ghép meaningVi từ
     * dict_meanings cho mọi node chữ (k:X), node từ (key w:…), detail (chữ tâm, công thức, phonOf, từ ghép, ứng viên) bằng một
     * truy vấn, rồi cache 10 phút theo q|mode. Không gọi Gemini khi thiếu nghĩa (meaningVi null).
     */
    @Test
    void kanji_diagram_validates_fills_meaning_vi_and_caches() throws Exception {
        String user = newUser();
        // nghĩa có sẵn trong dict_meanings (seed / đã dịch khi tra từ điển); không cần actor như bản admin
        store.insertMachineMeaning("k:時", "時", null, null, "thời gian, giờ", "SEED", null);
        store.insertMachineMeaning("k:日", "日", null, null, "mặt trời, ngày", "SEED", null);
        store.insertMachineMeaning("w:1315920", "時間", "じかん", "N5", "thời gian", "SEED", null);
        store.insertMachineMeaning("w:jlpt:時計|とけい", "時計", "とけい", "N5", "đồng hồ", "SEED", null);
        JsonNode payload = node("""
                {"query":"時","mode":"structure","center":"k:時","candidates":[{"kanji":"日","hanViet":"NHẬT"}],
                 "nodes":[{"id":"k:時","type":"center","label":"時"},{"id":"k:日","type":"component","label":"日","role":"radical"},
                          {"id":"k:寺","type":"component","label":"寺","role":"phon"},
                          {"id":"w:時間","type":"word","label":"時間","key":"w:1315920"},
                          {"id":"w:時計","type":"word","label":"時計","key":"w:jlpt:時計|とけい"},
                          {"id":"w:時代","type":"word","label":"時代","key":null}],
                 "edges":[{"from":"k:日","to":"k:時","type":"radical"}],
                 "detail":{"kanji":"時","formula":[{"part":"日","role":"radical"},{"part":"寺","role":"phon"}],
                           "phonOf":[{"kanji":"日"}],"compounds":[{"term":"時間","key":"w:1315920"},{"term":"時代","key":null}]},
                 "stats":{"kanji":3,"words":3,"parts":true,"jmdict":false}}""");
        Mockito.when(ai.kanjiDiagram("時", "structure")).thenReturn(payload);

        JsonNode got = read(call(get("/api/nlp/kanji-diagram").param("q", " 時 "), user, null).andExpect(status().isOk()));
        assertEquals("k:時", got.path("center").asText());
        assertEquals("thời gian, giờ", got.path("nodes").get(0).path("meaningVi").asText());
        assertEquals("mặt trời, ngày", got.path("nodes").get(1).path("meaningVi").asText());
        assertTrue(got.path("nodes").get(2).path("meaningVi").isNull(), "chưa ai tra 寺 → null, không gọi Gemini");
        assertEquals("thời gian", got.path("nodes").get(3).path("meaningVi").asText());
        assertEquals("đồng hồ", got.path("nodes").get(4).path("meaningVi").asText(), "khoá JLPT không có trong JMdict");
        assertTrue(got.path("nodes").get(5).path("meaningVi").isNull());
        assertEquals("thời gian, giờ", got.path("detail").path("meaningVi").asText());
        assertEquals("mặt trời, ngày", got.path("detail").path("formula").get(0).path("meaningVi").asText());
        assertTrue(got.path("detail").path("formula").get(1).path("meaningVi").isNull());
        assertEquals("mặt trời, ngày", got.path("detail").path("phonOf").get(0).path("meaningVi").asText());
        assertEquals("thời gian", got.path("detail").path("compounds").get(0).path("meaningVi").asText());
        assertEquals("mặt trời, ngày", got.path("candidates").get(0).path("meaningVi").asText());
        assertEquals(payload.path("edges"), got.path("edges"), "phần còn lại giữ nguyên văn");

        // cache theo q|mode: cùng tham số không gọi lại ai-service; mode khác = khoá khác
        call(get("/api/nlp/kanji-diagram").param("q", "時").param("mode", ""), user, null).andExpect(status().isOk());
        Mockito.verify(ai, Mockito.times(1)).kanjiDiagram("時", "structure");
        Mockito.when(ai.kanjiDiagram("時", "compounds")).thenReturn(payload);
        call(get("/api/nlp/kanji-diagram").param("q", "時").param("mode", "compounds"), user, null).andExpect(status().isOk());
        Mockito.verify(ai, Mockito.times(1)).kanjiDiagram("時", "compounds");

        // kiểm tham số trước khi gọi: thiếu q, q quá 32 ký tự, mode lạ
        call(get("/api/nlp/kanji-diagram"), user, null).andExpect(status().isBadRequest());
        call(get("/api/nlp/kanji-diagram").param("q", "x".repeat(33)), user, null).andExpect(status().isBadRequest());
        call(get("/api/nlp/kanji-diagram").param("q", "寺").param("mode", "tree"), user, null).andExpect(status().isBadRequest());
        Mockito.verify(ai, Mockito.never()).kanjiDiagram(eq("寺"), any());

        // payload không có detail (âm nhiều chữ): chỉ ghép ứng viên, không ném lỗi
        JsonNode cands = node("{\"query\":\"THANH\",\"mode\":\"structure\",\"center\":null,\"candidates\":[{\"kanji\":\"日\"}],"
                + "\"nodes\":[],\"edges\":[],\"detail\":null,\"stats\":{\"kanji\":0,\"words\":0,\"parts\":true,\"jmdict\":false}}");
        Mockito.when(ai.kanjiDiagram("THANH", "structure")).thenReturn(cands);
        JsonNode c = read(call(get("/api/nlp/kanji-diagram").param("q", "THANH"), user, null).andExpect(status().isOk()));
        assertEquals("mặt trời, ngày", c.path("candidates").get(0).path("meaningVi").asText());
        assertTrue(c.path("detail").isNull());
    }

    @Test
    void staff_is_forbidden_and_anonymous_unauthorized() throws Exception {
        for (Role role : new Role[] {Role.ADMIN, Role.SUPER_ADMIN}) {
            String staff = newStaff(role);
            call(get("/api/nlp/radicals"), staff, null).andExpect(status().isForbidden());
            call(get("/api/nlp/han-viet-graph").param("reading", "thuy"), staff, null).andExpect(status().isForbidden());
            call(post("/api/nlp/kanji-cards"), staff, Map.of("kanji", List.of("水"))).andExpect(status().isForbidden());
        }
        call(get("/api/nlp/radicals"), null, null).andExpect(status().isUnauthorized());
        call(post("/api/nlp/radicals/cards"), null, Map.of("kanji", List.of("水"))).andExpect(status().isUnauthorized());
        Mockito.verifyNoInteractions(ai);
    }
}
