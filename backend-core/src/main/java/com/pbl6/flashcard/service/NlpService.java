package com.pbl6.flashcard.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.pbl6.flashcard.model.KanjiMnemonic;
import com.pbl6.flashcard.repository.KanjiMnemonicRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;

/**
 * Proxy tra cứu NLP (/api/nlp, USER) sang ai-service: bản đồ Hán-Việt (F1), thẻ chữ Hán (C5), bộ thủ (C4). Trả nguyên JSON của
 * ai-service (frontend tự parse như dữ liệu không đáng tin); việc của backend là kiểm tham số trước khi gọi, đổi lỗi ai-service
 * thành mã HTTP và cache các GET. Dữ liệu là từ điển tĩnh, giống nhau cho mọi người nên cache dùng chung, không theo user.
 * Ngoại lệ duy nhất: thẻ bộ thủ được điền mẹo nhớ đã duyệt / câu mẫu (xem {@link #radicalCards}).
 */
@Service
public class NlpService {

    /** Cùng giới hạn với kanji_info_router / radical_router của ai-service: chặn ở đây để trả 400 thay vì 422 từ ai-service. */
    public static final int MAX_QUERY_CHARS = 32;
    public static final int MAX_GRAPH_LIMIT = 100;
    public static final int MAX_SUGGEST_LIMIT = 50;
    public static final int RADICAL_COUNT = 214;
    private static final Set<String> LEVELS = Set.of("N5", "N4", "N3", "N2", "N1");

    static final Duration CACHE_TTL = Duration.ofMinutes(10);
    static final int CACHE_MAX_ENTRIES = 500;

    private final AiServiceClient ai;
    private final KanjiMnemonicRepository mnemonics;
    private final TtlCache<String, JsonNode> cache =
            new TtlCache<>(CACHE_TTL.toMillis(), CACHE_MAX_ENTRIES, System::currentTimeMillis);

    public NlpService(AiServiceClient ai, KanjiMnemonicRepository mnemonics) {
        this.ai = ai;
        this.mnemonics = mnemonics;
    }

    public JsonNode hanVietGraph(String reading, String level, Integer limit) {
        String r = query("reading", reading);
        String lv = level(level, "level");
        int n = limit(limit, 30, MAX_GRAPH_LIMIT);
        return cached("graph|" + r + "|" + lv + "|" + n, () -> ai.hanVietGraph(r, lv, n));
    }

    public JsonNode hanVietSuggest(String q, Integer limit) {
        String query = query("q", q);
        int n = limit(limit, 10, MAX_SUGGEST_LIMIT);
        return cached("suggest|" + query + "|" + n, () -> ai.hanVietSuggest(query, n));
    }

    /** POST: không cache (lô chữ khác nhau gần như mỗi lần). */
    public JsonNode kanjiCards(List<String> kanji, String userLevel) {
        String lv = level(userLevel, "userLevel");
        return upstream(() -> ai.kanjiCards(kanji, lv));
    }

    public JsonNode radicals() {
        return cached("radicals", ai::radicals);
    }

    public JsonNode radicalKanji(int no, List<String> levels) {
        if (no < 1 || no > RADICAL_COUNT) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Số bộ thủ phải từ 1 đến " + RADICAL_COUNT + ".");
        }
        List<String> lv = levels(levels);
        return cached("radk|" + no + "|" + String.join(",", lv), () -> ai.radicalKanji(no, lv));
    }

    /**
     * Thẻ bộ thủ công khai (hợp đồng đợt 2 §4). ai-service luôn gọi với withMnemonic=false: mẹo Gemini phải qua kiểm duyệt
     * trước khi hiện, và tắt thì ai-service không gọi Gemini cho mỗi lượt xem (không tốn quota). mnemonicVi của từng thẻ là mẹo
     * APPROVED của chữ đó nếu có (mnemonicSource "approved"), không thì câu mẫu dựng từ chính thẻ ("template", xem
     * {@link MnemonicTemplate}). Sinh / gửi mẹo mới đi qua /api/kanji/mnemonics (MnemonicService), không qua đây.
     */
    public JsonNode radicalCards(List<String> kanji) {
        return withPublicMnemonics(upstream(() -> ai.radicalCards(kanji, false)));
    }

    /** Chép JSON của ai-service rồi điền mẹo; response không đúng dạng {items: [...]} thì trả nguyên văn như mọi proxy khác. */
    private JsonNode withPublicMnemonics(JsonNode res) {
        if (!(res instanceof ObjectNode obj) || !res.path("items").isArray() || res.path("items").isEmpty()) return res;
        ObjectNode out = obj.deepCopy();
        Set<String> chars = new HashSet<>();
        for (JsonNode card : out.path("items")) {
            String ch = text(card.get("kanji"));
            if (ch != null) chars.add(ch);
        }
        Map<String, String> approved = new HashMap<>();
        if (!chars.isEmpty()) {
            for (KanjiMnemonic m : mnemonics.findByKanjiInAndStatus(chars, KanjiMnemonic.APPROVED)) {
                approved.put(m.getKanji(), m.getMnemonicVi());
            }
        }
        for (JsonNode node : out.path("items")) {
            String ch = text(node.get("kanji"));
            if (!(node instanceof ObjectNode card) || ch == null) continue;
            String approvedText = approved.get(ch);
            if (approvedText != null) {
                card.put("mnemonicVi", approvedText);
                card.put("mnemonicSource", "approved");
                continue;
            }
            if (text(card.get("mnemonicVi")) != null && "template".equals(text(card.get("mnemonicSource")))) continue;
            JsonNode radical = card.path("radical");
            card.put("mnemonicVi", MnemonicTemplate.of(ch, text(radical.get("nameVi")), text(radical.get("meaningVi")),
                    text(card.get("hanViet")), text(card.get("meaningEn"))));
            card.put("mnemonicSource", "template");
        }
        return out;
    }

    /** Chuỗi khác rỗng của một nút JSON; null / không phải chuỗi / rỗng -> null. */
    private static String text(JsonNode node) {
        return node != null && node.isTextual() && !node.asText().isBlank() ? node.asText() : null;
    }

    // ---------- kiểm tham số ----------

    private static String query(String name, String value) {
        String v = value == null ? "" : value.trim();
        if (v.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Thiếu tham số " + name + ".");
        if (v.length() > MAX_QUERY_CHARS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, name + " tối đa " + MAX_QUERY_CHARS + " ký tự.");
        }
        return v;
    }

    /** Chuỗi rỗng = không lọc (như ai-service); giá trị ngoài N5..N1 -> 400 thay vì âm thầm bỏ lọc. */
    private static String level(String value, String name) {
        if (value == null || value.isBlank()) return null;
        String v = value.trim();
        if (!LEVELS.contains(v)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, name + " không hợp lệ: " + v + " (chỉ nhận N5..N1).");
        }
        return v;
    }

    /** Nhận cả dạng lặp (?levels=N5&levels=N4) lẫn gộp dấu phẩy ("N5,N4"); bỏ trùng, giữ thứ tự. */
    private static List<String> levels(List<String> values) {
        List<String> out = new ArrayList<>();
        for (String raw : values != null ? values : List.<String>of()) {
            for (String part : (raw == null ? "" : raw).split(",")) {
                String lv = level(part, "levels");
                if (lv != null && !out.contains(lv)) out.add(lv);
            }
        }
        return out;
    }

    private static int limit(Integer value, int fallback, int max) {
        if (value == null) return fallback;
        if (value < 1 || value > max) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "limit phải từ 1 đến " + max + ".");
        }
        return value;
    }

    // ---------- gọi ai-service ----------

    private JsonNode cached(String key, Supplier<JsonNode> call) {
        return cache.get(key, () -> upstream(call));
    }

    /**
     * Lỗi tham số từ ai-service (400 / 422) -> 400, không có dữ liệu (404) -> 404; còn lại (không kết nối được, timeout, 5xx, sai
     * X-Internal-Key) -> 503. Không bao giờ chuyển 401 / 403 của ai-service ra ngoài: frontend coi 401 là hết phiên đăng nhập.
     * Dùng chung cho service khác gọi ai-service khi người dùng đang chờ trên trang (MnemonicService).
     */
    static JsonNode upstream(Supplier<JsonNode> call) {
        try {
            return call.get();
        } catch (AiServiceClient.AiServiceException e) {
            int status = e.status();
            if (status == 400) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
            if (status == 422) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tham số gửi dịch vụ AI không hợp lệ.");
            }
            if (status == 404) throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage());
            if (status == 401 || status == 403) {
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                        "Dịch vụ AI tạm thời không khả dụng, vui lòng thử lại sau.");
            }
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, e.getMessage());
        }
    }
}
