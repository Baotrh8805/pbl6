package com.pbl6.flashcard.service.dictionary;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.pbl6.flashcard.dto.dictionary.DictDtos;
import com.pbl6.flashcard.security.DictionaryRateLimiter;
import com.pbl6.flashcard.service.AiServiceClient;
import com.pbl6.flashcard.service.SettingsService;
import com.pbl6.flashcard.service.TtlCache;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.Supplier;

/**
 * Từ điển cho người học (spec docs/Plan/specs/2026-10-26-tu-dien-design.md §5–§6, D14–D29).
 * <p>
 * Gộp bốn lớp: gốc (ai-service: JMdict, ví dụ Tatoeba, thẻ chữ Hán) → ghi đè của admin (dict_overrides, áp NGAY từ DB, không chờ
 * đồng bộ sang ai-service) → nghĩa tiếng Việt (dict_meanings, dict_example_vi) → cộng đồng (bình luận, sổ tay). Mục chưa có nghĩa
 * Việt được dịch bằng Gemini lúc mở (có trần theo giờ, D26), lưu vĩnh viễn; người học không thấy nhãn "máy dịch" (D23) — viState
 * chỉ cho frontend biết đang hiện nghĩa Anh vì sao (EN_ONLY: chưa dịch được / tắt, LIMIT: hết lượt, AI_DOWN: AI lỗi).
 */
@Service
public class DictionaryService {

    private static final Logger log = LoggerFactory.getLogger(DictionaryService.class);
    public static final int MAX_QUERY = 64;
    public static final int MAX_PAGE_SIZE = 50;
    public static final int MAX_PAGE = 25;
    public static final int HISTORY_KEEP = 300;
    public static final int MAX_USER_EXAMPLES = 3;
    private static final Duration TRANSLATE_WAIT = Duration.ofSeconds(35);
    private static final Duration CACHE_TTL = Duration.ofMinutes(10);

    private final DictionaryAiClient ai;
    private final DictionaryStore store;
    private final DictionaryRateLimiter limiter;
    private final SettingsService settings;
    private final ObjectMapper json;
    private final TtlCache<String, JsonNode> baseCache = new TtlCache<>(CACHE_TTL.toMillis(), 2000, System::currentTimeMillis);
    private final TtlCache<String, JsonNode> searchCache = new TtlCache<>(CACHE_TTL.toMillis(), 2000, System::currentTimeMillis);
    private final Map<String, CompletableFuture<JsonNode>> inflight = new ConcurrentHashMap<>();

    public DictionaryService(DictionaryAiClient ai, DictionaryStore store, DictionaryRateLimiter limiter, SettingsService settings,
                             ObjectMapper json) {
        this.ai = ai;
        this.store = store;
        this.limiter = limiter;
        this.settings = settings;
        this.json = json;
    }

    /** Admin sửa ghi đè → quên dữ liệu gốc đã cache (cache chứa bản ai-service có thể đã áp ghi đè cũ). */
    public void invalidate() {
        baseCache.clear();
        searchCache.clear();
    }

    // ================================================================== tìm kiếm

    public ObjectNode search(String rawQ, String mode, int page, int size) {
        String q = rawQ == null ? "" : rawQ.strip();
        if (q.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nhập từ cần tra.");
        if (q.length() > MAX_QUERY) q = q.substring(0, MAX_QUERY);
        int p = Math.max(0, Math.min(page, MAX_PAGE));
        int s = Math.max(1, Math.min(size, MAX_PAGE_SIZE));
        String m = mode == null || mode.isBlank() ? "auto" : mode;
        if (!Set.of("auto", "ja", "en", "vi").contains(m)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "mode không hợp lệ.");
        if ("auto".equals(m)) m = DictionaryKeys.hasJapanese(q) ? "ja" : "vi+en";

        ArrayNode items = json.createArrayNode();
        long total;
        JsonNode deinflected = null;
        if ("ja".equals(m) || "en".equals(m)) {
            JsonNode res = aiSearch(q, m, s, p * s);
            res.path("items").forEach(items::add);
            total = res.path("total").asLong(items.size());
            // ai-service đưa dạng chia về dạng gốc khi q không trùng dạng viết nào (食べました → 食べる): chuyển tiếp để giao diện ghi chú
            if (res.path("deinflected").isObject()) deinflected = res.get("deinflected");
        } else {
            // Việt trước (nghĩa đã lưu), rồi Anh (gloss JMdict); trùng khoá bỏ
            Set<String> seen = new LinkedHashSet<>();
            List<String> viKeys = new ArrayList<>();
            if (p == 0) {
                for (DictionaryStore.Meaning mn : store.searchVi(q, 30)) {
                    if (seen.add(mn.entryKey())) viKeys.add(mn.entryKey());
                }
                summaries(viKeys).forEach(items::add);
            }
            long en = 0;
            if (!"vi".equals(m)) {
                try {
                    JsonNode res = aiSearch(q, "en", s, p * s);
                    en = res.path("total").asLong();
                    for (JsonNode it : res.path("items")) {
                        if (seen.add(it.path("key").asText())) items.add(it);
                    }
                } catch (ResponseStatusException e) {
                    if (viKeys.isEmpty()) throw e;   // có kết quả Việt thì vẫn trả, thiếu phần Anh
                }
            }
            total = viKeys.size() + en;
        }
        overlaySummaries(items);
        ObjectNode out = json.createObjectNode();
        out.set("items", items);
        out.put("total", total);
        out.put("page", p);
        out.put("size", s);
        out.put("modeUsed", m);
        if (deinflected != null) out.set("deinflected", deinflected);
        return out;
    }

    /**
     * Tab Câu: câu ví dụ chứa cụm q (Nhật đúng chuỗi, Anh từ đầu một từ, Việt dịch sẵn có / không dấu), câu ngắn trước. Mỗi câu:
     * {id, jpn, eng, vi, words[{key, form, head}]}; áp ghi đè câu của admin (sửa câu, ẩn — ẩn ở bất kỳ mục nào là ẩn ở đây), bản
     * dịch đã lưu (admin / Gemini) thắng bản dịch sẵn.
     */
    public ObjectNode sentences(String rawQ, int page, int size) {
        String q = rawQ == null ? "" : rawQ.strip();
        if (q.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nhập cụm từ cần tìm.");
        if (q.length() > MAX_QUERY) q = q.substring(0, MAX_QUERY);
        int p = Math.max(0, Math.min(page, MAX_PAGE));
        int s = Math.max(1, Math.min(size, MAX_PAGE_SIZE));
        String qq = q;
        JsonNode res = searchCache.get("sent|" + s + "|" + p * s + "|" + q, () -> upstream(() -> ai.sentences(qq, s, p * s)));
        List<String> ids = new ArrayList<>();
        res.path("items").forEach(it -> ids.add(it.path("id").asText()));
        Map<String, String> saved = store.exampleViByIds(ids);
        Map<String, Map<String, String>> ov = new HashMap<>();
        for (DictionaryStore.Override o : store.exampleOverridesByIds(ids)) {
            ov.computeIfAbsent(o.subKey(), k -> new HashMap<>()).merge(o.field(), o.value(),
                    (a, b) -> "example_hidden".equals(o.field()) && "true".equalsIgnoreCase(a) ? a : b);
        }
        ArrayNode items = json.createArrayNode();
        int hidden = 0;
        for (JsonNode it : res.path("items")) {
            ObjectNode x = ((ObjectNode) it).deepCopy();
            String id = x.path("id").asText();
            Map<String, String> o = ov.getOrDefault(id, Map.of());
            if ("true".equalsIgnoreCase(o.get("example_hidden"))) {
                hidden++;
                continue;
            }
            if (o.containsKey("example_jpn")) x.put("jpn", o.get("example_jpn"));
            if (o.containsKey("example_eng")) x.put("eng", o.get("example_eng"));
            String seed = o.containsKey("example_jpn") ? null : text(x, "viSeed", null);
            x.remove("viSeed");
            x.put("vi", saved.getOrDefault(id, seed));
            items.add(x);
        }
        ObjectNode out = json.createObjectNode();
        out.set("items", items);
        out.put("total", Math.max(0, res.path("total").asLong(items.size()) - hidden));
        out.put("page", p);
        out.put("size", s);
        return out;
    }

    private JsonNode aiSearch(String q, String mode, int limit, int offset) {
        return searchCache.get(mode + "|" + limit + "|" + offset + "|" + q, () -> upstream(() -> ai.search(q, mode, limit, offset)));
    }

    /** Tóm tắt (như item tìm kiếm) cho một danh sách khoá, giữ thứ tự; mục ai-service không có thì bỏ. */
    public List<ObjectNode> summaries(List<String> keys) {
        List<String> ids = keys.stream().map(DictionaryKeys::tryParse).filter(k -> k != null && k.kind() == DictionaryKeys.Kind.WORD)
                .map(DictionaryKeys.Key::wordId).distinct().toList();
        Map<String, JsonNode> byKey = new LinkedHashMap<>();
        for (int i = 0; i < ids.size(); i += MAX_PAGE_SIZE) {
            List<String> chunk = ids.subList(i, Math.min(ids.size(), i + MAX_PAGE_SIZE));
            try {
                upstream(() -> ai.entries(chunk)).path("items").forEach(e -> byKey.put(e.path("key").asText(), e));
            } catch (RuntimeException e) {
                log.warn("Từ điển: không lấy được tóm tắt mục từ ({})", e.getMessage());
            }
        }
        Map<String, DictionaryStore.Meaning> meanings = store.meanings(keys);
        List<ObjectNode> out = new ArrayList<>();
        for (String raw : keys) {
            DictionaryKeys.Key k = DictionaryKeys.tryParse(raw);
            if (k == null) continue;
            ObjectNode s = json.createObjectNode();
            s.put("key", raw);
            switch (k.kind()) {
                case WORD -> {
                    JsonNode e = byKey.get(raw);
                    s.put("kind", "word");
                    s.put("id", k.wordId());
                    // ai-service không trả được (tắt / mục đã bỏ khỏi JMdict): vẫn giữ khoá để sổ tay / lịch sử không mất dòng
                    if (e != null) copy(e, s, "id", "headKanji", "headKana", "reading", "glossShort", "common", "jlpt", "nExamples");
                    else s.put("unavailable", true);
                }
                case KANJI -> {
                    s.put("kind", "kanji");
                    s.put("headKanji", k.kanji());
                }
                case JLPT -> {
                    DictionaryStore.Meaning mn = meanings.get(raw);
                    s.put("kind", "word");
                    s.put("headKanji", DictionaryKeys.hasJapanese(k.value()) && k.value().codePoints().anyMatch(DictionaryKeys::isKanji)
                            ? k.value() : null);
                    s.put("headKana", k.reading());
                    s.put("reading", k.reading());
                    if (mn != null) s.put("jlpt", mn.level());
                }
            }
            out.add(s);
        }
        return out;
    }

    /** Áp nghĩa Việt + ghi đè (cách đọc, gloss) lên các item tóm tắt. */
    private void overlaySummaries(ArrayNode items) {
        List<String> keys = new ArrayList<>();
        items.forEach(i -> keys.add(i.path("key").asText()));
        Map<String, DictionaryStore.Meaning> meanings = store.meanings(keys);
        Map<String, List<DictionaryStore.Override>> ovs = store.overridesFor(keys);
        for (JsonNode n : items) {
            ObjectNode it = (ObjectNode) n;
            String key = it.path("key").asText();
            DictionaryStore.Meaning mn = meanings.get(key);
            it.put("meaningVi", mn != null ? mn.meaningVi() : null);
            for (DictionaryStore.Override o : ovs.getOrDefault(key, List.of())) {
                if ("reading".equals(o.field())) it.put("reading", o.value());
                if ("meaning_en".equals(o.field())) it.put("glossShort", o.value());
            }
        }
    }

    // ================================================================== mục từ

    /** Dữ liệu gốc (đã có ghi đè do ai-service áp nếu đã đồng bộ), cache 10 phút. 404 khi không có. */
    JsonNode base(DictionaryKeys.Key key) {
        return switch (key.kind()) {
            case WORD -> baseCache.get(key.raw(), () -> upstream(() -> ai.entry(key.wordId())));
            case KANJI -> baseCache.get(key.raw(), () -> upstream(() -> ai.kanji(key.kanji())));
            case JLPT -> jlptBase(key);
        };
    }

    private JsonNode jlptBase(DictionaryKeys.Key key) {
        DictionaryStore.Meaning mn = store.meaning(key.raw())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không có mục từ."));
        ObjectNode e = json.createObjectNode();
        e.put("key", key.raw());
        e.put("kind", "word");
        String term = key.value();
        boolean kanji = term.codePoints().anyMatch(DictionaryKeys::isKanji);
        e.put("headKanji", kanji ? term : null);
        e.put("headKana", key.reading());
        e.put("reading", key.reading());
        e.put("readingOriginal", key.reading());
        e.put("jlpt", mn.level());
        e.put("common", true);
        e.set("senses", json.createArrayNode());
        e.set("examples", json.createArrayNode());
        ArrayNode chars = json.createArrayNode();
        term.codePoints().filter(DictionaryKeys::isKanji).distinct().forEach(cp -> {
            ObjectNode c = json.createObjectNode();
            c.put("char", new String(Character.toChars(cp)));
            chars.add(c);
        });
        e.set("kanjiChars", chars);
        e.set("hanVietChars", json.createArrayNode());
        e.set("relatedSameReading", json.createArrayNode());
        e.put("jlptOnly", true);
        return e;
    }

    /**
     * Mục từ đầy đủ cho người học: các lớp đã gộp, ví dụ ẩn đã lọc, dịch lúc tra nếu thiếu nghĩa Việt, ghi lịch sử tra.
     */
    public ObjectNode entry(long uid, String rawKey, String query) {
        DictionaryKeys.Key key = DictionaryKeys.parse(rawKey);
        if (key.kind() == DictionaryKeys.Kind.JLPT) {
            // từ JLPT có thể đã có trong JMdict bản mới: chuyển sang mục JMdict nếu tìm được
            Optional<String> real = resolveJlpt(key);
            if (real.isPresent()) key = DictionaryKeys.parse(real.get());
        }
        ObjectNode e = layered(key, false);
        String state = ensureTranslated(uid, key, e, null);
        e = layered(key, false);
        e.put("viState", e.hasNonNull("meaningVi") ? "OK" : state);
        if (!rawKey.equals(key.raw())) e.put("redirectFrom", rawKey);
        String term = text(e, "headKanji", text(e, "headKana", key.kanji()));
        if (term != null && key.isWord()) e.set("userExamples", userExamples(uid, term));
        else e.set("userExamples", json.createArrayNode());
        e.put("commentCount", store.countVisibleComments(key.raw()));
        Optional<DictionaryStore.Favorite> fav = store.favorite(uid, key.raw());
        ObjectNode f = json.createObjectNode();
        f.put("saved", fav.isPresent());
        f.put("note", fav.map(DictionaryStore.Favorite::note).orElse(null));
        e.set("favorite", f);
        e.put("aiLeft", limiter.aiLeft(uid));
        e.put("aiLimit", limiter.aiLimit());
        store.recordLookup(uid, key.raw(), query, HISTORY_KEEP);
        return e;
    }

    private Optional<String> resolveJlpt(DictionaryKeys.Key key) {
        try {
            JsonNode r = ai.key(key.value(), key.reading());
            String k = r.path("key").asText(null);
            return k == null || k.isBlank() ? Optional.empty() : Optional.of(k);
        } catch (RuntimeException e) {
            return Optional.empty();
        }
    }

    /**
     * Gộp các lớp lên bản sao của dữ liệu gốc. includeHidden: admin thấy cả ví dụ bị ẩn (cờ hidden), người học thì không.
     */
    public ObjectNode layered(DictionaryKeys.Key key, boolean includeHidden) {
        ObjectNode e = base(key).deepCopy();
        e.put("key", key.raw());
        List<String> keys = new ArrayList<>();
        keys.add(key.raw());
        List<String> chars = new ArrayList<>();
        e.path("kanjiChars").forEach(c -> chars.add(c.path("char").asText()));
        if (key.kind() == DictionaryKeys.Kind.KANJI) chars.add(key.kanji());
        chars.forEach(c -> keys.add(DictionaryKeys.kanjiKey(c)));
        Map<String, List<DictionaryStore.Override>> ovs = store.overridesFor(keys);
        Map<String, DictionaryStore.Meaning> meanings = store.meanings(keys);

        // ghi đè của chính mục
        for (DictionaryStore.Override o : ovs.getOrDefault(key.raw(), List.of())) {
            switch (o.field()) {
                case "reading" -> { e.put("reading", o.value()); e.put("readingOverridden", true); }
                case "meaning_en" -> { e.put("glossShort", o.value()); e.put("glossOverridden", true); }
                case "han_viet" -> { if (key.kind() == DictionaryKeys.Kind.KANJI) { e.put("hanViet", upper(o.value())); e.put("hanVietOverridden", true); } }
                case "kanji_meaning" -> { if (key.kind() == DictionaryKeys.Kind.KANJI) { e.put("meaningEn", o.value()); e.put("meaningEnOverridden", true); } }
                default -> { }
            }
        }
        // Hán-Việt theo từng chữ (ghi đè ở khoá k:<chữ>) → dựng lại hanViet của từ
        if (e.has("hanVietChars")) {
            List<String> parts = new ArrayList<>();
            for (JsonNode c : e.path("hanVietChars")) {
                String ch = c.path("char").asText();
                String fixed = overrideOf(ovs, DictionaryKeys.kanjiKey(ch), "han_viet");
                if (fixed != null) ((ObjectNode) c).put("reading", upper(fixed));
                String r = c.path("reading").asText(null);
                if (r != null && !r.isBlank()) parts.add(r);
            }
            if (!parts.isEmpty()) e.put("hanViet", String.join(" ", parts));
        }
        for (JsonNode c : e.path("kanjiChars")) {
            ObjectNode co = (ObjectNode) c;
            String ck = DictionaryKeys.kanjiKey(co.path("char").asText());
            String hv = overrideOf(ovs, ck, "han_viet");
            if (hv != null) co.put("hanViet", upper(hv));
            String km = overrideOf(ovs, ck, "kanji_meaning");
            if (km != null) co.put("meaningEn", km);
            DictionaryStore.Meaning cm = meanings.get(ck);
            co.put("meaningVi", cm != null ? cm.meaningVi() : null);
        }
        // ví dụ: ghi đè câu, ẩn, bản dịch Việt
        Map<String, DictionaryStore.ExampleVi> exVi = store.examplesVi(key.raw());
        ArrayNode examples = json.createArrayNode();
        for (JsonNode x : e.path("examples")) {
            ObjectNode xo = (ObjectNode) x;
            String id = xo.path("id").asText();
            String jpn = overrideOfSub(ovs, key.raw(), "example_jpn", id);
            if (jpn != null) xo.put("jpn", jpn);
            String eng = overrideOfSub(ovs, key.raw(), "example_eng", id);
            if (eng != null) xo.put("eng", eng);
            String hidden = overrideOfSub(ovs, key.raw(), "example_hidden", id);
            if (hidden != null) xo.put("hidden", "true".equalsIgnoreCase(hidden));
            DictionaryStore.ExampleVi v = exVi.get(id);
            // bản admin / Gemini đã lưu thắng; không có thì bản dịch sẵn của ai-service (example_vi.csv, câu gốc chưa bị sửa)
            String seed = jpn == null ? text(xo, "viSeed", null) : null;
            xo.remove("viSeed");
            xo.put("vi", v != null ? v.textVi() : seed);
            if (includeHidden || !xo.path("hidden").asBoolean(false)) examples.add(xo);
        }
        e.set("examples", examples);
        DictionaryStore.Meaning mn = meanings.get(key.raw());
        e.put("meaningVi", mn != null ? mn.meaningVi() : null);
        return e;
    }

    private static String overrideOf(Map<String, List<DictionaryStore.Override>> ovs, String key, String field) {
        return overrideOfSub(ovs, key, field, "");
    }

    private static String overrideOfSub(Map<String, List<DictionaryStore.Override>> ovs, String key, String field, String sub) {
        for (DictionaryStore.Override o : ovs.getOrDefault(key, List.of())) {
            if (o.field().equals(field) && o.subKey().equals(sub)) return o.value();
        }
        return null;
    }

    private ArrayNode userExamples(long uid, String term) {
        ArrayNode out = json.createArrayNode();
        try {
            for (Map<String, Object> r : store.userExamples(uid, term, MAX_USER_EXAMPLES)) {
                ObjectNode x = json.createObjectNode();
                String jpn = String.valueOf(r.get("jpn"));
                x.put("id", "u:" + sha1(jpn).substring(0, 12));
                x.put("jpn", jpn);
                x.put("vi", r.get("vi") == null ? null : String.valueOf(r.get("vi")));
                x.put("source", r.get("source") == null ? null : String.valueOf(r.get("source")));
                out.add(x);
            }
        } catch (RuntimeException e) {
            log.debug("Từ điển: không lấy được câu từ tài liệu của người học", e);
        }
        return out;
    }

    // ================================================================== dịch lúc tra (D15, D26)

    /** Người học bấm "Dịch ví dụ": dịch các câu đã chọn còn thiếu bản Việt (1 lượt hạn mức). */
    public ObjectNode translateExamples(long uid, String rawKey, List<String> exampleIds) {
        DictionaryKeys.Key key = DictionaryKeys.parse(rawKey);
        if (key.kind() != DictionaryKeys.Kind.WORD) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mục này không có câu ví dụ để dịch.");
        }
        ObjectNode e = layered(key, false);
        String state = ensureTranslated(uid, key, e, exampleIds);
        ObjectNode fresh = layered(key, false);
        ObjectNode out = json.createObjectNode();
        out.put("state", state);
        out.set("examples", fresh.path("examples"));
        out.put("meaningVi", text(fresh, "meaningVi", null));
        out.put("aiLeft", limiter.aiLeft(uid));
        if ("LIMIT".equals(state)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Bạn đã dùng hết lượt dịch AI trong giờ này.");
        }
        if ("AI_DOWN".equals(state) || "EN_ONLY".equals(state)) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Chưa dịch được lúc này, vui lòng thử lại sau.");
        }
        return out;
    }

    /**
     * Dịch nghĩa Việt (và vài câu ví dụ đầu) khi còn thiếu; wantedExamples != null: chỉ dịch các câu đó. Trả trạng thái:
     * OK (đủ / vừa dịch xong), EN_ONLY (tắt dịch, không có khoá AI, mục không dịch được), LIMIT (hết lượt), AI_DOWN (AI lỗi).
     */
    String ensureTranslated(long uid, DictionaryKeys.Key key, ObjectNode e, List<String> wantedExamples) {
        if (key.kind() == DictionaryKeys.Kind.JLPT) return e.hasNonNull("meaningVi") ? "OK" : "EN_ONLY";
        boolean needMeaning = !e.hasNonNull("meaningVi") && wantedExamples == null;
        List<JsonNode> exTargets = new ArrayList<>();
        int quota = wantedExamples != null ? 10 : (needMeaning ? Math.max(0, settings.dictionaryExamplesTranslate()) : 0);
        for (JsonNode x : e.path("examples")) {
            if (exTargets.size() >= quota) break;
            if (x.hasNonNull("vi")) continue;
            if (wantedExamples != null && !wantedExamples.contains(x.path("id").asText())) continue;
            exTargets.add(x);
        }
        if (!needMeaning && exTargets.isEmpty()) return "OK";
        if (limiter.aiLimit() == 0) return "EN_ONLY";
        String flight = key.raw() + "|" + needMeaning + "|" + exTargets.stream().map(x -> x.path("id").asText()).toList();
        CompletableFuture<JsonNode> running = inflight.get(flight);
        JsonNode res;
        boolean acquired = false;
        try {
            if (running == null) {
                if (!limiter.tryAcquireAi(uid)) return "LIMIT";
                acquired = true;
                CompletableFuture<JsonNode> mine = new CompletableFuture<>();
                running = inflight.putIfAbsent(flight, mine);
                if (running == null) {
                    running = mine;
                    try {
                        mine.complete(ai.translate(List.of(translateItem(key, e, needMeaning, exTargets))));
                    } catch (RuntimeException ex) {
                        mine.completeExceptionally(ex);
                    } finally {
                        inflight.remove(flight);
                    }
                }
            }
            res = running.get(TRANSLATE_WAIT.toMillis(), TimeUnit.MILLISECONDS);
        } catch (ExecutionException ex) {
            Throwable c = ex.getCause();
            if (c instanceof AiServiceClient.AiServiceException ae && ae.status() == 503
                    && String.valueOf(ae.getMessage()).contains("no_api_key")) {
                if (acquired) limiter.refundAi(uid);
                return "EN_ONLY";
            }
            log.warn("Từ điển: dịch {} thất bại: {}", key.raw(), c == null ? ex.getMessage() : c.getMessage());
            return "AI_DOWN";
        } catch (TimeoutException | InterruptedException ex) {
            if (ex instanceof InterruptedException) Thread.currentThread().interrupt();
            return "AI_DOWN";
        }
        String model = res.path("model").asText(null);
        String term = text(e, "headKanji", text(e, "headKana", key.kanji()));
        for (JsonNode it : res.path("items")) {
            String mv = it.path("meaningVi").asText(null);
            if (needMeaning && mv != null && !mv.isBlank()) {
                store.insertMachineMeaning(key.raw(), term, text(e, "headKana", null), text(e, "jlpt", null), mv.strip(), "GEMINI",
                        model);
            }
            for (JsonNode x : it.path("examples")) {
                String vi = x.path("vi").asText(null);
                if (vi != null && !vi.isBlank()) store.insertMachineExample(key.raw(), x.path("id").asText(), vi.strip(), model);
            }
        }
        return "OK";
    }

    private Map<String, Object> translateItem(DictionaryKeys.Key key, JsonNode e, boolean needMeaning, List<JsonNode> examples) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("ref", key.raw());
        if (key.kind() == DictionaryKeys.Kind.KANJI) {
            item.put("kind", "kanji");
            item.put("forms", key.kanji());
            item.put("glossEn", text(e, "meaningEn", null));
        } else {
            item.put("kind", "word");
            String hk = text(e, "headKanji", null);
            String rd = text(e, "reading", text(e, "headKana", ""));
            item.put("forms", hk != null ? hk + "【" + rd + "】" : rd);
            List<String> glosses = new ArrayList<>();
            List<String> pos = new ArrayList<>();
            int n = 0;
            for (JsonNode s : e.path("senses")) {
                if (n++ >= 4) break;
                List<String> g = new ArrayList<>();
                s.path("gloss").forEach(x -> g.add(x.asText()));
                if (!g.isEmpty()) glosses.add(String.join(", ", g));
                if (pos.isEmpty()) s.path("pos").forEach(x -> pos.add(x.asText()));
            }
            item.put("glossEn", glosses.isEmpty() ? text(e, "glossShort", null) : DictionaryStore.cut(String.join("; ", glosses), 1000));
            item.put("pos", pos.size() > 10 ? pos.subList(0, 10) : pos);
            List<Map<String, Object>> exs = new ArrayList<>();
            for (JsonNode x : examples) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("id", x.path("id").asText());
                m.put("jpn", DictionaryStore.cut(x.path("jpn").asText(), 500));
                if (x.hasNonNull("eng")) m.put("eng", DictionaryStore.cut(x.path("eng").asText(), 500));
                exs.add(m);
            }
            item.put("examples", exs);
        }
        item.put("needMeaning", needMeaning);
        return item;
    }

    // ================================================================== dịch câu (tab Dịch, spec 2026-10-28-dich-cau-design, D33)

    public static final int TRANSLATE_TEXT_MAX = 1000;
    private static final Set<String> TRANSLATE_DIRECTIONS = Set.of("auto", "ja-vi", "vi-ja");

    /**
     * Dịch câu / đoạn Nhật ↔ Việt. Bản dịch luôn do Gemini dịch CẢ đoạn ở ai-service (không bao giờ ghép nghĩa từng từ); phần phân
     * tích câu Nhật (cụm từ, cách đọc, bậc JLPT, nghĩa theo ngữ cảnh) luôn có. Bộ nhớ dịch theo hash (hướng + câu đã gộp khoảng
     * trắng): câu lặp không gọi AI, không tốn lượt, không gắn người dùng. Trần giờ riêng {@code dictionary_translate_hourly_limit}
     * (D33) + chống dồn 10 / phút. state cho biết vì sao không có bản AI: OK | OFF (admin tắt hoặc không có khoá AI) | LIMIT (hết
     * lượt) | AI_DOWN (AI lỗi / quá tải, lượt vẫn tính như dịch lúc tra) | BUSY (dịch quá nhanh, không gọi ai-service) | UNAVAILABLE
     * (ai-service không tới được / quá giờ). Khi không có bản Gemini, ai-service trả bản **dịch máy offline** (D34, {@code engine}
     * "offline") — không lưu vào bộ nhớ dịch chung để lần sau Gemini dịch lại. Không bao giờ ném lỗi vì dịch vụ phía sau (D34):
     * người học luôn nhận 200 kèm state; chỉ 400 khi văn bản rỗng / quá dài / hướng lạ (giao diện đã chặn trước). Nghĩa Việt của
     * từ điển (dict_meanings) áp lên từng cụm lúc đọc ({@code dictVi}) để bản cache không giữ nghĩa cũ.
     */
    public ObjectNode translateText(long uid, String rawText, String rawDirection) {
        String text = normalizeText(rawText);
        if (text.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nhập câu cần dịch.");
        if (text.length() > TRANSLATE_TEXT_MAX) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Văn bản tối đa " + TRANSLATE_TEXT_MAX + " ký tự, hãy chia nhỏ.");
        }
        String dir = rawDirection == null || rawDirection.isBlank() ? "auto" : rawDirection;
        if (!TRANSLATE_DIRECTIONS.contains(dir)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Hướng dịch không hợp lệ.");
        if ("auto".equals(dir)) dir = DictionaryKeys.hasJapanese(text) ? "ja-vi" : "vi-ja";
        String hash = sha256(dir + "\n" + text);
        ObjectNode out = store.textTranslation(hash).map(c -> parseCached(c.result())).orElse(null);
        boolean fromCache = out != null;
        String state = "OK";
        // dịch quá nhanh: câu đã có trong bộ nhớ dịch vẫn trả (không tốn gì), câu mới thì BUSY, không gọi ai-service
        if (!limiter.tryTranslateBurst(uid) && !fromCache) return unavailable(uid, text, dir, "BUSY");
        if (fromCache) {
            store.touchTextTranslation(hash);
        } else {
            boolean withAi = true;
            boolean acquired = false;
            if (limiter.translateLimit() == 0) {
                withAi = false;
                state = "OFF";
            } else if (limiter.tryAcquireTranslate(uid)) {
                acquired = true;
            } else {
                withAi = false;
                state = "LIMIT";
            }
            JsonNode res;
            try {
                res = translateUpstream(hash, text, dir, withAi);
            } catch (RuntimeException ex) {
                if (acquired) limiter.refundTranslate(uid);   // không tới được ai-service: không có gì để tính lượt
                log.warn("Dịch câu: ai-service không trả lời ({})", ex.getMessage());
                return unavailable(uid, text, dir, "UNAVAILABLE");
            }
            if (res == null || !res.isObject()) {
                if (acquired) limiter.refundTranslate(uid);
                return unavailable(uid, text, dir, "UNAVAILABLE");
            }
            out = ((ObjectNode) res).deepCopy();
            String reason = text(out, "reason", null);
            out.remove("reason");   // chuyện giữa backend và ai-service: không lưu vào bộ nhớ dịch, không trả client
            if (withAi) {
                // chỉ bản Gemini vào bộ nhớ dịch chung; bản offline (D34) không lưu để lần sau Gemini dịch lại
                if (reason == null && out.hasNonNull("translation") && !"offline".equals(text(out, "engine", null))) {
                    store.insertTextTranslation(hash, dir, text, out.toString(), text(out, "model", null));
                } else if ("no_api_key".equals(reason)) {
                    limiter.refundTranslate(uid);
                    state = "OFF";
                } else {
                    state = "AI_DOWN";
                }
            }
        }
        out.remove("reason");   // bản cache cũ (nếu có) cũng không lộ
        if (!out.hasNonNull("engine") && out.hasNonNull("translation")) out.put("engine", "ai");   // bản cache trước D34
        overlayTokenMeanings(out.path("tokens"));
        out.put("state", state);
        out.put("cached", fromCache);
        out.put("aiLeft", limiter.translateLeft(uid));
        out.put("aiLimit", limiter.translateLimit());
        return out;
    }

    /** Không có gì từ ai-service (sập / quá giờ / dịch quá nhanh): vẫn 200, khung rỗng + state để giao diện nói nhẹ nhàng (D34). */
    private ObjectNode unavailable(long uid, String text, String dir, String state) {
        ObjectNode out = json.createObjectNode();
        out.put("direction", dir);
        out.put("source", text);
        out.putNull("translation");
        out.putNull("literal");
        out.putArray("alternatives");
        out.putNull("notes");
        out.putNull("reading");
        out.putNull("romaji");
        out.putNull("readingAgrees");
        out.putArray("tokens");
        out.putNull("model");
        out.putNull("engine");
        out.put("state", state);
        out.put("cached", false);
        out.put("aiLeft", limiter.translateLeft(uid));
        out.put("aiLimit", limiter.translateLimit());
        return out;
    }

    /** Gộp khoảng trắng để cùng một câu gõ khác vài dấu cách vẫn trúng bộ nhớ dịch; không đổi chữ (giữ nguyên dấu câu Nhật). */
    static String normalizeText(String raw) {
        if (raw == null) return "";
        String s = raw.replace("\r\n", "\n").replace('\r', '\n').replaceAll("[ \\t\\u3000]+", " ");
        s = s.replaceAll(" *\\n *", "\n").replaceAll("\\n{3,}", "\n\n");
        return s.strip();
    }

    private ObjectNode parseCached(String result) {
        try {
            JsonNode n = json.readTree(result);
            return n.isObject() ? (ObjectNode) n : null;
        } catch (java.io.IOException e) {
            return null;   // dòng hỏng: coi như chưa có, dịch lại
        }
    }

    /** Gọi ai-service; cùng câu đang dịch (hai tab / hai người) chỉ gọi Gemini một lần, như ensureTranslated. */
    private JsonNode translateUpstream(String hash, String text, String dir, boolean withAi) {
        if (!withAi) return upstream(() -> ai.translateText(text, dir, false));
        String flight = "tt|" + hash;
        CompletableFuture<JsonNode> running = inflight.get(flight);
        if (running == null) {
            CompletableFuture<JsonNode> mine = new CompletableFuture<>();
            running = inflight.putIfAbsent(flight, mine);
            if (running == null) {
                running = mine;
                try {
                    mine.complete(upstream(() -> ai.translateText(text, dir, true)));
                } catch (RuntimeException ex) {
                    mine.completeExceptionally(ex);
                } finally {
                    inflight.remove(flight);
                }
            }
        }
        try {
            return running.get(TRANSLATE_WAIT.toMillis(), TimeUnit.MILLISECONDS);
        } catch (ExecutionException ex) {
            if (ex.getCause() instanceof RuntimeException re) throw re;
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Dịch vụ dịch tạm thời không khả dụng, vui lòng thử lại sau.");
        } catch (TimeoutException | InterruptedException ex) {
            if (ex instanceof InterruptedException) Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Dịch vụ dịch không phản hồi kịp, vui lòng thử lại sau.");
        }
    }

    /** dictVi cho từng cụm có mục từ điển (nghĩa đã lưu: dịch sẵn / Gemini / admin) — lớp dưới nghĩa theo ngữ cảnh của AI. */
    private void overlayTokenMeanings(JsonNode tokens) {
        if (!tokens.isArray()) return;
        List<String> keys = new ArrayList<>();
        tokens.forEach(t -> { if (t.hasNonNull("key")) keys.add(t.get("key").asText()); });
        Map<String, DictionaryStore.Meaning> meanings = store.meanings(keys);
        for (JsonNode t : tokens) {
            DictionaryStore.Meaning mn = t.hasNonNull("key") ? meanings.get(t.get("key").asText()) : null;
            ((ObjectNode) t).put("dictVi", mn != null ? mn.meaningVi() : null);
        }
    }

    // ================================================================== tách câu, sổ tay, lịch sử

    /**
     * Vẽ chữ Hán để tra (cải tiến 26/10): chuyển nét sang ai-service nhận dạng, trả {candidates: [{char, score}]} (giống nhất trước).
     * Toạ độ NaN / vô hạn → 400; ai-service thiếu dữ liệu nét → 503 kèm lời nhắc.
     */
    public JsonNode handwriting(long uid, List<List<com.pbl6.flashcard.dto.dictionary.DictDtos.HwPoint>> strokes) {
        limiter.checkHandwriting(uid);
        List<List<Map<String, Double>>> body = new ArrayList<>(strokes.size());
        for (var s : strokes) {
            if (s == null || s.isEmpty() || s.size() > 500) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nét vẽ không hợp lệ.");
            List<Map<String, Double>> pts = new ArrayList<>(s.size());
            for (var p : s) {
                if (p == null || !Double.isFinite(p.x()) || !Double.isFinite(p.y())) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nét vẽ không hợp lệ.");
                }
                pts.add(Map.of("x", p.x(), "y", p.y()));
            }
            body.add(pts);
        }
        try {
            return ai.handwriting(body);
        } catch (AiServiceClient.AiServiceException e) {
            if (e.status() == 503 && String.valueOf(e.getMessage()).contains("handwritingUnavailable")) {
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                        "Máy chủ chưa có dữ liệu nét chữ Hán (KanjiVG) nên chưa vẽ để tra được.");
            }
            if (e.status() == 400 || e.status() == 422) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nét vẽ không hợp lệ.");
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Dịch vụ nhận dạng chữ tạm thời không khả dụng.");
        }
    }

    public JsonNode tokenize(long uid, String text) {
        limiter.checkTokenize(uid);
        return upstream(() -> ai.tokenize(text));
    }

    public DictDtos.AiStats stats(long uid) {
        return new DictDtos.AiStats(limiter.aiLeft(uid), limiter.aiLimit());
    }

    public ObjectNode putFavorite(long uid, String rawKey, String note) {
        DictionaryKeys.Key key = DictionaryKeys.parse(rawKey);
        store.putFavorite(uid, key.raw(), note == null || note.isBlank() ? null : note.strip());
        ObjectNode f = json.createObjectNode();
        f.put("saved", true);
        f.put("note", store.favorite(uid, key.raw()).map(DictionaryStore.Favorite::note).orElse(null));
        return f;
    }

    public void removeFavorite(long uid, String rawKey) {
        store.removeFavorite(uid, DictionaryKeys.parse(rawKey).raw());
    }

    public ObjectNode favorites(long uid, int page, int size) {
        int p = Math.max(0, page);
        int s = Math.max(1, Math.min(size, MAX_PAGE_SIZE));
        List<DictionaryStore.Favorite> favs = store.favorites(uid, p, s);
        List<ObjectNode> sums = summaries(favs.stream().map(DictionaryStore.Favorite::entryKey).toList());
        ArrayNode items = json.createArrayNode();
        sums.forEach(items::add);
        overlaySummaries(items);
        Map<String, DictionaryStore.Favorite> byKey = new LinkedHashMap<>();
        favs.forEach(f -> byKey.put(f.entryKey(), f));
        for (JsonNode n : items) {
            DictionaryStore.Favorite f = byKey.get(n.path("key").asText());
            ((ObjectNode) n).put("note", f == null ? null : f.note());
            ((ObjectNode) n).put("savedAt", f == null ? null : f.createdAt().toString());
        }
        ObjectNode out = json.createObjectNode();
        out.set("items", items);
        out.put("total", store.countFavorites(uid));
        out.put("page", p);
        out.put("size", s);
        return out;
    }

    public ObjectNode history(long uid, int size) {
        int s = Math.max(1, Math.min(size, 100));
        List<DictionaryStore.Lookup> rows = store.history(uid, s);
        ArrayNode items = json.createArrayNode();
        summaries(rows.stream().map(DictionaryStore.Lookup::entryKey).toList()).forEach(items::add);
        overlaySummaries(items);
        Map<String, DictionaryStore.Lookup> byKey = new LinkedHashMap<>();
        rows.forEach(r -> byKey.put(r.entryKey(), r));
        for (JsonNode n : items) {
            DictionaryStore.Lookup l = byKey.get(n.path("key").asText());
            ((ObjectNode) n).put("lookedUpAt", l == null ? null : l.lastAt().toString());
        }
        ObjectNode out = json.createObjectNode();
        out.set("items", items);
        return out;
    }

    public void clearHistory(long uid) {
        store.clearHistory(uid);
    }

    // ================================================================== tiện ích

    /** Lỗi ai-service → mã HTTP có câu tiếng Việt (như NlpService.upstream). */
    static JsonNode upstream(Supplier<JsonNode> call) {
        try {
            JsonNode r = call.get();
            if (r == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Không có mục từ.");
            return r;
        } catch (AiServiceClient.AiServiceException e) {
            int status = e.status();
            if (status == 404) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Không có mục từ.");
            if (status == 400 || status == 422) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Từ cần tra không hợp lệ.");
            if (status == 503 && String.valueOf(e.getMessage()).contains("dictUnavailable")) {
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                        "Từ điển chưa có dữ liệu trên máy chủ (cần dựng lại dữ liệu JMdict cho ai-service).");
            }
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Dịch vụ từ điển tạm thời không khả dụng, vui lòng thử lại sau.");
        }
    }

    static String text(JsonNode n, String field, String fallback) {
        JsonNode v = n.get(field);
        return v == null || v.isNull() || v.asText().isBlank() ? fallback : v.asText();
    }

    private static void copy(JsonNode from, ObjectNode to, String... fields) {
        for (String f : fields) if (from.has(f)) to.set(f, from.get(f));
    }

    private static String upper(String s) {
        return s == null ? null : s.strip().toUpperCase(java.util.Locale.ROOT);
    }

    private static String sha256(String s) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String sha1(String s) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-1").digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
