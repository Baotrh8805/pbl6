package com.pbl6.flashcard.service.dictionary;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.pbl6.flashcard.dto.admin.AdminPage;
import com.pbl6.flashcard.dto.dictionary.DictDtos;
import com.pbl6.flashcard.model.Notification;
import com.pbl6.flashcard.security.AiRateLimiter;
import com.pbl6.flashcard.service.AuditService;
import com.pbl6.flashcard.service.NotificationService;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Quản lý từ điển gốc cho ADMIN và SUPER_ADMIN (D21: sửa trực tiếp, có audit + lịch sử + hoàn tác; spec 2026-10-26 §8).
 * <p>
 * Định tuyến khi sửa / áp đề xuất: meaning_vi → dict_meanings (đã kiểm), example_vi → dict_example_vi, các trường gốc (reading,
 * han_viet, meaning_en, kanji_meaning, câu ví dụ) → dict_overrides rồi đẩy sang ai-service sau commit. Hán-Việt luôn ghi ở khoá
 * chữ k:&lt;chữ&gt; (đúng cho mọi từ chứa chữ đó), dù báo cáo đến từ trang từ vựng.
 */
@Service
public class AdminDictionaryService {

    public static final String AUDIT_TARGET = "DICTIONARY";
    private static final Map<String, Integer> GROUPS = Map.of("reported", 1, "en_only", 2, "machine", 3, "verified", 4);
    private static final String[] GROUP_NAMES = {"", "reported", "en_only", "machine", "verified"};

    private final DictionaryStore store;
    private final DictionaryService dictionary;
    private final DictionaryAiClient ai;
    private final DictionaryOverridePublisher publisher;
    private final AuditService audit;
    private final NotificationService notifications;
    private final AiRateLimiter aiLimiter;
    private final ApplicationEventPublisher events;
    private final ObjectMapper json;
    private final com.pbl6.flashcard.service.moderation.ModerationService moderation;

    public AdminDictionaryService(DictionaryStore store, DictionaryService dictionary, DictionaryAiClient ai,
                                  DictionaryOverridePublisher publisher, AuditService audit, NotificationService notifications,
                                  AiRateLimiter aiLimiter, ApplicationEventPublisher events, ObjectMapper json,
                                  com.pbl6.flashcard.service.moderation.ModerationService moderation) {
        this.moderation = moderation;
        this.store = store;
        this.dictionary = dictionary;
        this.ai = ai;
        this.publisher = publisher;
        this.audit = audit;
        this.notifications = notifications;
        this.aiLimiter = aiLimiter;
        this.events = events;
        this.json = json;
    }

    // ================================================================== hàng chờ (D16)

    public AdminPage<DictDtos.QueueRow> queue(String group, String level, String kind, String q, int page, int size) {
        List<Integer> groups = group == null || group.isBlank() || "pending".equals(group) ? List.of(1, 2, 3)
                : "all".equals(group) ? List.of(1, 2, 3, 4) : List.of(groupOf(group));
        int p = Math.max(0, page);
        int s = Math.max(1, Math.min(size, 50));
        List<DictionaryStore.QueueRow> rows = store.queue(groups, level, kind, q, p, s);
        Map<String, JsonNode> heads = heads(rows.stream().map(DictionaryStore.QueueRow::entryKey).toList());
        List<DictDtos.QueueRow> items = rows.stream().map(r -> {
            JsonNode h = heads.get(r.entryKey());
            DictionaryKeys.Key k = DictionaryKeys.tryParse(r.entryKey());
            String headKanji = h != null ? DictionaryService.text(h, "headKanji", null) : (k != null && k.kind() == DictionaryKeys.Kind.KANJI
                    ? k.kanji() : r.term());
            String headKana = h != null ? DictionaryService.text(h, "headKana", null) : r.reading();
            String gloss = h != null ? DictionaryService.text(h, "glossShort", null) : null;
            return new DictDtos.QueueRow(r.entryKey(), GROUP_NAMES[r.grp()], r.openReports(), r.lastReportAt(), r.lookups30d(),
                    r.term(), r.reading(), r.level(), r.meaningVi(), r.status(), r.source(), r.updatedAt(), headKanji, headKana, gloss);
        }).toList();
        return new AdminPage<>(items, store.queueCount(groups, level, kind, q), p, s);
    }

    private static int groupOf(String g) {
        Integer v = GROUPS.get(g);
        if (v == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "group không hợp lệ.");
        return v;
    }

    private Map<String, JsonNode> heads(List<String> keys) {
        Map<String, JsonNode> out = new HashMap<>();
        dictionary.summaries(keys).forEach(s -> out.put(s.path("key").asText(), s));
        return out;
    }

    public ObjectNode search(String q, String mode, int page, int size) {
        return dictionary.search(q, mode, page, size);
    }

    // ================================================================== chi tiết mục

    public ObjectNode entry(String rawKey) {
        DictionaryKeys.Key key = DictionaryKeys.parse(rawKey);
        ObjectNode e;
        try {
            e = dictionary.layered(key, true);
        } catch (ResponseStatusException ex) {
            if (ex.getStatusCode() != HttpStatus.NOT_FOUND) throw ex;
            e = json.createObjectNode();
            e.put("key", key.raw());
            e.put("missing", true);
        }
        ObjectNode admin = json.createObjectNode();
        store.meaning(key.raw()).ifPresentOrElse(m -> {
            admin.put("meaningVi", m.meaningVi());
            admin.put("status", m.status());
            admin.put("source", m.source());
            admin.put("model", m.model());
            admin.put("updatedAt", str(m.updatedAt()));
            admin.put("verifiedAt", str(m.verifiedAt()));
            admin.put("term", m.term());
            admin.put("reading", m.reading());
            admin.put("level", m.level());
        }, () -> admin.putNull("meaningVi"));
        ArrayNode ovs = json.createArrayNode();
        List<String> overrideKeys = new ArrayList<>();
        overrideKeys.add(key.raw());
        e.path("kanjiChars").forEach(c -> overrideKeys.add(DictionaryKeys.kanjiKey(c.path("char").asText())));
        store.overridesFor(overrideKeys).values().forEach(list -> list.forEach(o -> ovs.add(json.valueToTree(Map.of(
                "entryKey", o.entryKey(), "field", o.field(), "subKey", o.subKey(), "value", o.value(), "createdAt", str(o.createdAt()))))));
        admin.set("overrides", ovs);
        admin.set("history", json.valueToTree(store.history(key.raw(), 50).stream().map(AdminDictionaryService::toDto).toList()));
        admin.set("openReports", json.valueToTree(store.openEntryReports(key.raw()).stream()
                .map(r -> DictionaryCommunityService.toDto(r, DictionaryCommunityService.termOf(json.createObjectNode(), key))).toList()));
        admin.set("comments", json.valueToTree(store.adminComments(null, null, key.raw(), 0, 20).stream()
                .map(this::toDto).toList()));
        // V38: mục từ nhạy cảm (công tắc admin hoặc nhãn JMdict) — bình luận thù ghét ở mục này chỉ gắn cờ, không chặn
        e.set("sensitive", json.valueToTree(moderation.sensitiveInfo(key)));
        e.set("admin", admin);
        return e;
    }

    // ================================================================== sửa nghĩa Việt

    @Transactional
    public ObjectNode setMeaning(Long actor, String rawKey, String value, String reason, Long reportId) {
        DictionaryKeys.Key key = DictionaryKeys.parse(rawKey);
        String v = required(value, 1000, "Nghĩa tiếng Việt");
        String old = store.meaning(key.raw()).map(DictionaryStore.Meaning::meaningVi).orElse(null);
        JsonNode head = headOf(key);
        store.upsertAdminMeaning(key.raw(), DictionaryService.text(head, "headKanji", DictionaryService.text(head, "headKana", key.kanji())),
                DictionaryService.text(head, "headKana", null), v, actor);
        store.addHistory(key.raw(), "meaning_vi", "", old, v, actor, reportId, reason);
        audit.log(actor, "DICT_EDIT", AUDIT_TARGET, key.raw(), detail("meaning_vi", old, v));
        return entry(key.raw());
    }

    @Transactional
    public ObjectNode verify(Long actor, String rawKey) {
        DictionaryKeys.Key key = DictionaryKeys.parse(rawKey);
        DictionaryStore.Meaning m = store.meaning(key.raw())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Mục chưa có nghĩa tiếng Việt để xác nhận."));
        if (DictionaryStore.VERIFIED.equals(m.status())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Nghĩa này đã được xác nhận.");
        }
        store.verify(key.raw(), actor);
        store.addHistory(key.raw(), "meaning_vi_verify", "", m.status(), DictionaryStore.VERIFIED, actor, null, null);
        audit.log(actor, "DICT_VERIFY", AUDIT_TARGET, key.raw(), Map.of("meaningVi", cut(m.meaningVi())));
        return entry(key.raw());
    }

    /** Dịch lại bằng Gemini (không tính trần người học; trần AI chung của admin 20 / giờ). Nghĩa đã kiểm không bị đè (409). */
    @Transactional
    public ObjectNode retranslate(Long actor, String rawKey) {
        DictionaryKeys.Key key = DictionaryKeys.parse(rawKey);
        if (key.kind() == DictionaryKeys.Kind.JLPT) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mục này không dịch lại được.");
        DictionaryStore.Meaning m = store.meaning(key.raw()).orElse(null);
        if (m != null && DictionaryStore.VERIFIED.equals(m.status())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Nghĩa đã được kiểm; sửa tay thay vì dịch lại.");
        }
        aiLimiter.checkDeckAi(actor);
        ObjectNode e = dictionary.layered(key, true);
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("ref", key.raw());
        item.put("kind", key.kind() == DictionaryKeys.Kind.KANJI ? "kanji" : "word");
        String hk = DictionaryService.text(e, "headKanji", null);
        String rd = DictionaryService.text(e, "reading", DictionaryService.text(e, "headKana", ""));
        item.put("forms", key.kind() == DictionaryKeys.Kind.KANJI ? key.kanji() : (hk != null ? hk + "【" + rd + "】" : rd));
        item.put("glossEn", DictionaryService.text(e, key.kind() == DictionaryKeys.Kind.KANJI ? "meaningEn" : "glossShort", null));
        JsonNode res;
        try {
            res = ai.translate(List.of(item));
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Không dịch được lúc này: " + ex.getMessage());
        }
        String mv = res.path("items").path(0).path("meaningVi").asText(null);
        if (mv == null || mv.isBlank()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "AI không trả được nghĩa hợp lệ.");
        String model = res.path("model").asText(null);
        String old = m == null ? null : m.meaningVi();
        if (m == null) {
            store.insertMachineMeaning(key.raw(), hk != null ? hk : (key.kanji() != null ? key.kanji() : rd), rd,
                    DictionaryService.text(e, "jlpt", null), mv.strip(), "GEMINI", model);
        } else {
            store.replaceMachineMeaning(key.raw(), mv.strip(), model);
        }
        store.addHistory(key.raw(), "meaning_vi", "", old, mv.strip(), actor, null, "Dịch lại bằng AI");
        audit.log(actor, "DICT_RETRANSLATE", AUDIT_TARGET, key.raw(), detail("meaning_vi", old, mv.strip()));
        return entry(key.raw());
    }

    // ================================================================== ghi đè dữ liệu gốc

    @Transactional
    public ObjectNode putOverride(Long actor, String rawKey, DictDtos.OverrideRequest req, Long reportId) {
        DictionaryKeys.Key key = DictionaryKeys.parse(rawKey);
        String field = req.field();
        String sub = req.subKey() == null ? "" : req.subKey().strip();
        validateOverride(key, field, sub);
        String value = req.value() == null || req.value().isBlank() ? null : req.value().strip();
        if (value != null && value.length() > 2000) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Giá trị quá dài.");
        if ("example_hidden".equals(field) && value != null && !Objects.equals(value, "true") && !Objects.equals(value, "false")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "example_hidden chỉ nhận true / false.");
        }
        String old = store.overrideValue(key.raw(), field, sub).orElse(null);
        if (Objects.equals(old, value)) return entry(key.raw());
        if (value == null) store.removeOverride(key.raw(), field, sub);
        else store.putOverride(key.raw(), field, sub, value, actor);
        store.addHistory(key.raw(), field, sub, old, value, actor, reportId, req.reason());
        audit.log(actor, "DICT_EDIT", AUDIT_TARGET, key.raw(), detail(field + (sub.isEmpty() ? "" : "#" + sub), old, value));
        overridesChanged(key.raw());
        return entry(key.raw());
    }

    private static void validateOverride(DictionaryKeys.Key key, String field, String sub) {
        boolean kanji = key.kind() == DictionaryKeys.Kind.KANJI;
        switch (field) {
            case "han_viet", "kanji_meaning" -> {
                if (!kanji) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Âm Hán-Việt / nghĩa chữ sửa ở khoá chữ Hán (k:<chữ>).");
            }
            case "reading", "meaning_en" -> {
                if (kanji) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Trường này chỉ áp dụng cho từ vựng.");
            }
            case "example_jpn", "example_eng", "example_hidden" -> {
                if (key.kind() != DictionaryKeys.Kind.WORD || sub.isEmpty()) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cần chọn câu ví dụ (subKey) của mục JMdict.");
                }
            }
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Trường không hợp lệ.");
        }
        if (key.kind() == DictionaryKeys.Kind.JLPT && !"meaning_en".equals(field) && !"reading".equals(field)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Trường không hợp lệ cho mục này.");
        }
    }

    @Transactional
    public ObjectNode setExampleVi(Long actor, String rawKey, String exampleId, String value, String reason, Long reportId) {
        DictionaryKeys.Key key = DictionaryKeys.parse(rawKey);
        if (exampleId == null || exampleId.isBlank() || exampleId.length() > 40) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Câu ví dụ không hợp lệ.");
        }
        String v = value == null || value.isBlank() ? null : value.strip();
        if (v != null && v.length() > 1000) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bản dịch tối đa 1000 ký tự.");
        DictionaryStore.ExampleVi cur = store.examplesVi(key.raw()).get(exampleId);
        String old = cur == null ? null : cur.textVi();
        if (Objects.equals(old, v)) return entry(key.raw());
        if (v == null) store.deleteExampleVi(key.raw(), exampleId);
        else store.upsertAdminExample(key.raw(), exampleId, v, actor);
        store.addHistory(key.raw(), "example_vi", exampleId, old, v, actor, reportId, reason);
        audit.log(actor, "DICT_EDIT", AUDIT_TARGET, key.raw(), detail("example_vi#" + exampleId, old, v));
        return entry(key.raw());
    }

    /** Hoàn tác một dòng lịch sử: ghi lại old_value bằng đúng cơ chế sửa (sinh dòng lịch sử mới, không xoá lịch sử cũ). */
    @Transactional
    public ObjectNode revert(Long actor, long historyId) {
        DictionaryStore.History h = store.historyRow(historyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy dòng lịch sử."));
        String reason = "Hoàn tác #" + historyId;
        ObjectNode out = switch (h.field()) {
            case "meaning_vi" -> {
                if (h.oldValue() == null) {
                    String cur = store.meaning(h.entryKey()).map(DictionaryStore.Meaning::meaningVi).orElse(null);
                    store.deleteMeaning(h.entryKey());
                    store.addHistory(h.entryKey(), "meaning_vi", "", cur, null, actor, null, reason);
                    yield entry(h.entryKey());
                }
                yield setMeaning(actor, h.entryKey(), h.oldValue(), reason, null);
            }
            case "example_vi" -> setExampleVi(actor, h.entryKey(), h.subKey(), h.oldValue(), reason, null);
            case "meaning_vi_verify" -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Không hoàn tác thao tác xác nhận.");
            default -> putOverride(actor, h.entryKey(), new DictDtos.OverrideRequest(h.field(), h.subKey(), h.oldValue(), reason), null);
        };
        audit.log(actor, "DICT_REVERT", AUDIT_TARGET, h.entryKey(), Map.of("historyId", historyId, "field", h.field()));
        return out;
    }

    private void overridesChanged(String key) {
        dictionary.invalidate();
        events.publishEvent(new DictionaryOverridePublisher.DictOverrideChangedEvent(key));
    }

    // ================================================================== báo cáo

    public AdminPage<DictDtos.Report> reports(String kind, String status, String q, int page, int size) {
        int p = Math.max(0, page);
        int s = Math.max(1, Math.min(size, 50));
        List<DictionaryStore.Report> rows = store.reports(blank(kind), blank(status), q, p, s);
        Map<String, JsonNode> heads = heads(rows.stream().map(DictionaryStore.Report::entryKey).distinct().toList());
        List<DictDtos.Report> items = rows.stream().map(r -> {
            JsonNode h = heads.get(r.entryKey());
            String term = h == null ? null : DictionaryService.text(h, "headKanji", DictionaryService.text(h, "headKana", null));
            return DictionaryCommunityService.toDto(r, term);
        }).toList();
        return new AdminPage<>(items, store.countReports(blank(kind), blank(status), q), p, s);
    }

    /** Áp đề xuất của báo cáo vào đúng lớp dữ liệu rồi đóng báo cáo (RESOLVED / APPLIED), báo người gửi. */
    @Transactional
    public ObjectNode applyReport(Long actor, long id) {
        DictionaryStore.Report r = openReport(id);
        if ("TEXT".equals(r.kind())) return applyTextReport(actor, r);
        if (!"ENTRY".equals(r.kind()) || r.proposedValue() == null || "other".equals(r.field())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Báo cáo này không có đề xuất áp dụng được.");
        }
        DictionaryKeys.Key key = DictionaryKeys.parse(r.entryKey());
        String v = r.proposedValue();
        switch (r.field()) {
            case "meaning_vi" -> setMeaning(actor, key.raw(), v, "Áp đề xuất báo cáo #" + id, id);
            case "example_vi" -> setExampleVi(actor, key.raw(), r.subKey(), v, "Áp đề xuất báo cáo #" + id, id);
            case "reading", "meaning_en" -> putOverride(actor, key.raw(), new DictDtos.OverrideRequest(r.field(), "", v,
                    "Áp đề xuất báo cáo #" + id), id);
            case "han_viet" -> putOverride(actor, DictionaryKeys.kanjiKey(key.kind() == DictionaryKeys.Kind.KANJI ? key.kanji() : r.subKey()),
                    new DictDtos.OverrideRequest("han_viet", "", v, "Áp đề xuất báo cáo #" + id), id);
            case "kanji_meaning" -> putOverride(actor, key.raw(), new DictDtos.OverrideRequest("kanji_meaning", "", v,
                    "Áp đề xuất báo cáo #" + id), id);
            case "example" -> putOverride(actor, key.raw(), new DictDtos.OverrideRequest("example_jpn", r.subKey(), v,
                    "Áp đề xuất báo cáo #" + id), id);
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Trường không áp dụng được.");
        }
        close(actor, r, "RESOLVED", "APPLIED", null, "DICT_REPORT_APPLY");
        return entry(key.raw());
    }

    /**
     * Báo bản dịch sai (TEXT, V40), chỉ Nhật → Việt: thay bản dịch trong bộ nhớ dịch bằng đề xuất, gắn {@code edited}; bỏ phương án
     * khác / ghi chú của AI (viết cho bản cũ). Việt → Nhật không sửa tay (cách đọc, romaji, phân tích câu đi theo câu Nhật) → xoá
     * khỏi bộ nhớ để dịch lại.
     */
    private ObjectNode applyTextReport(Long actor, DictionaryStore.Report r) {
        if (!"ja-vi".equals(r.field()) || r.proposedValue() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Chỉ áp được bản sửa Nhật → Việt có đề xuất; hãy xoá khỏi bộ nhớ dịch để dịch lại.");
        }
        ObjectNode result = store.textTranslation(r.entryKey()).map(t -> {
            try {
                JsonNode n = json.readTree(t.result());
                return n.isObject() ? (ObjectNode) n : null;
            } catch (java.io.IOException e) {
                return null;
            }
        }).orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Bản dịch đã không còn trong bộ nhớ dịch."));
        result.put("translation", r.proposedValue());
        result.putArray("alternatives");
        result.putNull("notes");
        result.put("edited", true);
        result.put("model", "admin");
        store.updateTextTranslation(r.entryKey(), result.toString());
        close(actor, r, "RESOLVED", "APPLIED", null, "DICT_REPORT_APPLY");
        return result;
    }

    /**
     * ENTRY: đánh dấu đã sửa tay (EDITED). COMMENT: action hide (mặc định) | delete — server ẩn / xoá bình luận luôn. TEXT (V40):
     * xoá bản dịch khỏi bộ nhớ dịch (CACHE_CLEARED), lượt dịch sau gọi AI lại.
     */
    @Transactional
    public DictDtos.Report resolveReport(Long actor, long id, String note, String action) {
        DictionaryStore.Report r = openReport(id);
        String act;
        if ("COMMENT".equals(r.kind())) {
            if (r.commentId() == null) throw new ResponseStatusException(HttpStatus.CONFLICT, "Bình luận đã bị xoá.");
            if ("delete".equals(action)) {
                act = "COMMENT_DELETED";
                store.deleteComment(r.commentId());
                audit.log(actor, "DICT_COMMENT_DELETE", AUDIT_TARGET, "comment:" + r.commentId(), Map.of("reportId", id));
            } else {
                act = "COMMENT_HIDDEN";
                hideComment(actor, r.commentId(), note == null ? "Vi phạm quy tắc cộng đồng" : note);
            }
        } else if ("TEXT".equals(r.kind())) {
            act = "CACHE_CLEARED";
            store.deleteTextTranslation(r.entryKey());
        } else {
            act = "EDITED";
        }
        close(actor, r, "RESOLVED", act, note, "DICT_REPORT_RESOLVE");
        return DictionaryCommunityService.toDto(store.report(id).orElseThrow(), null);
    }

    @Transactional
    public DictDtos.Report dismissReport(Long actor, long id, String note) {
        DictionaryStore.Report r = openReport(id);
        close(actor, r, "DISMISSED", "DISMISSED", required(note, 500, "Ghi chú"), "DICT_REPORT_DISMISS");
        return DictionaryCommunityService.toDto(store.report(id).orElseThrow(), null);
    }

    private DictionaryStore.Report openReport(long id) {
        DictionaryStore.Report r = store.report(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy báo cáo."));
        if (!"OPEN".equals(r.status())) throw new ResponseStatusException(HttpStatus.CONFLICT, "Báo cáo đã được xử lý.");
        return r;
    }

    private void close(Long actor, DictionaryStore.Report r, String status, String action, String note, String auditAction) {
        if (store.closeReport(r.id(), status, action, note, actor) == 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Báo cáo đã được xử lý.");
        }
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("reportId", r.id());
        d.put("kind", r.kind());
        d.put("field", r.field());
        d.put("action", action);
        audit.log(actor, auditAction, AUDIT_TARGET, r.entryKey(), d);
        if (r.reporterId() != null) {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("reportId", r.id());
            payload.put("entryKey", r.entryKey());
            payload.put("kind", r.kind());
            payload.put("field", r.field());
            payload.put("action", action);
            payload.put("status", status);
            if (note != null) payload.put("note", note);
            notifications.notify(r.reporterId(), Notification.DICT_REPORT_RESOLVED, payload);
        }
    }

    // ================================================================== bình luận

    public AdminPage<DictDtos.AdminComment> comments(String q, Boolean hidden, String entryKey, int page, int size) {
        int p = Math.max(0, page);
        int s = Math.max(1, Math.min(size, 50));
        return new AdminPage<>(store.adminComments(q, hidden, entryKey, p, s).stream().map(this::toDto).toList(),
                store.adminCommentCount(q, hidden, entryKey), p, s);
    }

    @Transactional
    public void hideComment(Long actor, long id, String note) {
        DictionaryStore.Comment c = store.comment(id, -1).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                "Không tìm thấy bình luận."));
        if (c.hiddenAt() != null) throw new ResponseStatusException(HttpStatus.CONFLICT, "Bình luận đã bị ẩn.");
        String n = required(note, 300, "Lý do ẩn");
        store.hideComment(id, actor, n);
        audit.log(actor, "DICT_COMMENT_HIDE", AUDIT_TARGET, "comment:" + id, Map.of("entryKey", c.entryKey(), "note", n));
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("commentId", id);
        payload.put("entryKey", c.entryKey());
        payload.put("note", n);
        notifications.notify(c.userId(), Notification.DICT_COMMENT_HIDDEN, payload);
    }

    @Transactional
    public void unhideComment(Long actor, long id) {
        DictionaryStore.Comment c = store.comment(id, -1).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                "Không tìm thấy bình luận."));
        if (c.hiddenAt() == null) throw new ResponseStatusException(HttpStatus.CONFLICT, "Bình luận đang hiện.");
        store.unhideComment(id);
        audit.log(actor, "DICT_COMMENT_UNHIDE", AUDIT_TARGET, "comment:" + id, Map.of("entryKey", c.entryKey()));
    }

    @Transactional
    public void deleteComment(Long actor, long id) {
        DictionaryStore.Comment c = store.comment(id, -1).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                "Không tìm thấy bình luận."));
        store.deleteComment(id);
        audit.log(actor, "DICT_COMMENT_DELETE", AUDIT_TARGET, "comment:" + id, Map.of("entryKey", c.entryKey(), "content", cut(c.content())));
    }

    // ================================================================== lịch sử, đồng bộ, thống kê

    public AdminPage<DictDtos.History> history(Long actor, String field, Instant from, Instant to, int page, int size) {
        int p = Math.max(0, page);
        int s = Math.max(1, Math.min(size, 100));
        return new AdminPage<>(store.historyPage(actor, field, from, to, p, s).stream().map(AdminDictionaryService::toDto).toList(),
                store.historyCount(actor, field, from, to), p, s);
    }

    public DictDtos.SyncResponse sync(Long actor) {
        DictDtos.SyncResponse r = publisher.syncNow();
        audit.log(actor, "DICT_SYNC_AI", AUDIT_TARGET, "overrides", Map.of("backendVersion", r.backendVersion(), "ok", r.ok()));
        return r;
    }

    public DictDtos.DictStats stats() {
        Instant week = Instant.now().minus(7, ChronoUnit.DAYS);
        return new DictDtos.DictStats(store.countMeanings(null), store.countMeanings(DictionaryStore.VERIFIED),
                store.countMeanings(DictionaryStore.MACHINE), store.lookupsSince(week), store.commentsSince(week),
                store.countOpenReports());
    }

    public long countOpenReports() {
        return store.countOpenReports();
    }

    // ================================================================== tiện ích

    private JsonNode headOf(DictionaryKeys.Key key) {
        try {
            return dictionary.base(key);
        } catch (ResponseStatusException e) {
            return json.createObjectNode();
        }
    }

    static DictDtos.History toDto(DictionaryStore.History h) {
        return new DictDtos.History(h.id(), h.entryKey(), h.field(), h.subKey(), h.oldValue(), h.newValue(), h.actorId(), h.actorEmail(),
                h.reportId(), h.reason(), h.createdAt());
    }

    DictDtos.AdminComment toDto(DictionaryStore.AdminComment c) {
        return new DictDtos.AdminComment(c.id(), c.entryKey(), c.userId(), c.displayName(), c.email(), c.content(), c.helpfulCount(),
                c.hiddenAt() != null, c.hiddenNote(), c.createdAt(), c.modStatus(),
                moderation.store().parseSpans(c.modSpans()).stream().map(com.pbl6.flashcard.dto.moderation.ModerationDtos.Span::word).distinct().toList());
    }

    private static Map<String, Object> detail(String field, String old, String now) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("field", field);
        d.put("old", cut(old));
        d.put("new", cut(now));
        return d;
    }

    private static String cut(String s) {
        return DictionaryStore.cut(s, 500);
    }

    private static String str(Instant i) {
        return i == null ? null : i.toString();
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }

    private static String required(String s, int max, String name) {
        String v = s == null ? "" : s.strip();
        if (v.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, name + " không được trống.");
        if (v.length() > max) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, name + " tối đa " + max + " ký tự.");
        return v;
    }
}
