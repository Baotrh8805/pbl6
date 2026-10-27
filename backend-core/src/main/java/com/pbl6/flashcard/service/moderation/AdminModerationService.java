package com.pbl6.flashcard.service.moderation;

import com.pbl6.flashcard.dto.admin.AdminPage;
import com.pbl6.flashcard.dto.moderation.ModerationDtos.Author;
import com.pbl6.flashcard.dto.moderation.ModerationDtos.Counts;
import com.pbl6.flashcard.dto.moderation.ModerationDtos.QueueItem;
import com.pbl6.flashcard.dto.moderation.ModerationDtos.RescanResponse;
import com.pbl6.flashcard.dto.moderation.ModerationDtos.Screening;
import com.pbl6.flashcard.dto.moderation.ModerationDtos.Sensitive;
import com.pbl6.flashcard.dto.moderation.ModerationDtos.Target;
import com.pbl6.flashcard.model.Notification;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.service.AdminContentService;
import com.pbl6.flashcard.service.AuditService;
import com.pbl6.flashcard.service.NotificationService;
import com.pbl6.flashcard.service.dictionary.AdminDictionaryService;
import com.pbl6.flashcard.service.dictionary.DictionaryKeys;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Hàng chờ kiểm duyệt AI của admin (spec 2026-10-27 đêm §6.3): bỏ qua / ẩn / khôi phục / xoá, quét lại, công tắc mục từ nhạy cảm.
 * Ẩn / xoá dùng lại {@link AdminDictionaryService#hideComment} / {@link AdminContentService#clearComment} (đã audit + thông báo).
 */
@Service
public class AdminModerationService {

    public static final String AUDIT_TARGET = "MODERATION";
    private static final List<String> OPEN = List.of(Screening.FLAGGED, Screening.BLOCKED);

    private final ModerationService moderation;
    private final ModerationStore store;
    private final AuditService audit;
    private final NotificationService notifications;
    private final AdminDictionaryService dictionary;
    private final AdminContentService content;

    public AdminModerationService(ModerationService moderation, ModerationStore store, AuditService audit,
                                  NotificationService notifications, AdminDictionaryService dictionary, AdminContentService content) {
        this.moderation = moderation;
        this.store = store;
        this.audit = audit;
        this.notifications = notifications;
        this.dictionary = dictionary;
        this.content = content;
    }

    // ------------------------------------------------------------------ hàng chờ

    static List<String> statuses(String status) {
        String s = status == null ? "" : status.trim().toUpperCase(Locale.ROOT);
        return switch (s) {
            case "", "OPEN" -> OPEN;
            case "ALL" -> List.of(Screening.PENDING, Screening.CLEAN, Screening.FLAGGED, Screening.BLOCKED, Screening.REVIEWED);
            case Screening.FLAGGED, Screening.BLOCKED, Screening.PENDING, Screening.REVIEWED, Screening.CLEAN -> List.of(s);
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "status không hợp lệ.");
        };
    }

    @Transactional(readOnly = true)
    public AdminPage<QueueItem> queue(String status, String kind, String q, int page, int size) {
        List<String> st = statuses(status);
        String k = kind == null || kind.isBlank() || "ALL".equalsIgnoreCase(kind) ? null : ModerationStore.normalizeKind(kind);
        int p = Math.max(0, page);
        int s = Math.max(1, Math.min(size, 100));
        List<ModerationStore.Row> rows = store.queue(st, k, q, p, s);
        Instant since = Instant.now().minus(ModerationPolicy.LOCK_WINDOW);
        Map<Long, Long> blocked = new HashMap<>();
        Map<String, Boolean> sensitive = new HashMap<>();
        List<QueueItem> items = new ArrayList<>(rows.size());
        for (ModerationStore.Row r : rows) {
            long b = blocked.computeIfAbsent(r.userId(), uid -> store.countBlockedSince(uid, since));
            Boolean sens = null;
            if (ModerationStore.KIND_COMMENT.equals(r.kind())) {
                DictionaryKeys.Key key = DictionaryKeys.tryParse(r.targetKey());
                if (key != null) sens = sensitive.computeIfAbsent(r.targetKey(), x -> moderation.isSensitiveEntry(key));
            }
            items.add(toItem(r, b, sens));
        }
        return new AdminPage<>(items, store.queueCount(st, k, q), p, s);
    }

    private QueueItem toItem(ModerationStore.Row r, long blocked24h, Boolean sensitive) {
        return new QueueItem(r.kind(), r.id(), r.content(), store.parseSpans(r.spansJson()), r.label(), r.score(), r.status(),
                r.verdict(), new Author(r.userId(), r.email(), r.displayName(), blocked24h, r.commentLockedUntil()),
                new Target(r.targetKey(), r.targetTitle(), sensitive), r.createdAt(), r.hiddenAt() != null);
    }

    public Counts counts() {
        ModerationStore.Counts c = store.counts();
        return new Counts(c.open(), c.flagged(), c.blocked(), c.pending());
    }

    private ModerationStore.Row find(String kind, long id) {
        return store.find(ModerationStore.normalizeKind(kind), id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy bình luận."));
    }

    private static Map<String, Object> detail(ModerationStore.Row r) {
        Map<String, Object> m = new HashMap<>();
        m.put("kind", r.kind());
        m.put("status", r.status());
        m.put("verdict", r.verdict());
        m.put(ModerationStore.KIND_COMMENT.equals(r.kind()) ? "entryKey" : "deckId", r.targetKey());
        return m;
    }

    // ------------------------------------------------------------------ xử lý

    /** Bỏ qua: nội dung hiện nguyên văn cho mọi người (FLAGGED / BLOCKED / PENDING → REVIEWED). BLOCKED thì dùng khôi phục. */
    @Transactional
    public QueueItem ignore(User actor, String kind, long id) {
        ModerationStore.Row r = find(kind, id);
        if (Screening.BLOCKED.equals(r.status())) return restore(actor, kind, id);
        store.review(r.kind(), id, actor.getId(), "IGNORE");
        audit.log(actor.getId(), "MOD_IGNORE", AUDIT_TARGET, r.kind() + ":" + id, detail(r));
        return toItem(find(kind, id), 0, null);
    }

    /** Khôi phục bình luận AI đã chặn: công khai + thông báo tác giả. */
    @Transactional
    public QueueItem restore(User actor, String kind, long id) {
        ModerationStore.Row r = find(kind, id);
        if (!Screening.BLOCKED.equals(r.status())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Bình luận này không bị AI chặn.");
        }
        store.review(r.kind(), id, actor.getId(), "RESTORE");
        audit.log(actor.getId(), "MOD_RESTORE", AUDIT_TARGET, r.kind() + ":" + id, detail(r));
        Map<String, Object> p = new HashMap<>();
        p.put("kind", r.kind());
        p.put("id", id);
        p.put(ModerationStore.KIND_COMMENT.equals(r.kind()) ? "entryKey" : "deckId", r.targetKey());
        notifications.notify(r.userId(), Notification.MOD_COMMENT_RESTORED, p);
        return toItem(find(kind, id), 0, null);
    }

    /** Ẩn: bình luận từ điển → hideComment (ghi chú bắt buộc); đánh giá → xoá trắng bình luận, giữ sao. */
    @Transactional
    public QueueItem hide(User actor, String kind, long id, String note) {
        ModerationStore.Row r = find(kind, id);
        if (ModerationStore.KIND_COMMENT.equals(r.kind())) {
            dictionary.hideComment(actor.getId(), id, note == null || note.isBlank() ? "Vi phạm quy tắc cộng đồng (AI gắn cờ)" : note);
        } else {
            content.clearComment(actor, id);
        }
        store.review(r.kind(), id, actor.getId(), "HIDE");
        audit.log(actor.getId(), "MOD_HIDE", AUDIT_TARGET, r.kind() + ":" + id, detail(r));
        return toItem(find(kind, id), 0, null);
    }

    @Transactional
    public void delete(User actor, String kind, long id) {
        ModerationStore.Row r = find(kind, id);
        audit.log(actor.getId(), "MOD_DELETE", AUDIT_TARGET, r.kind() + ":" + id, detail(r));
        if (ModerationStore.KIND_COMMENT.equals(r.kind())) dictionary.deleteComment(actor.getId(), id);
        else content.clearComment(actor, id);
    }

    @Transactional
    public RescanResponse rescan(User actor) {
        RescanResponse r = moderation.rescan(200);
        audit.log(actor.getId(), "MOD_RESCAN", AUDIT_TARGET, "-", Map.of("scanned", r.scanned(), "pending", r.pending()));
        return r;
    }

    // ------------------------------------------------------------------ mục từ nhạy cảm

    public Sensitive sensitive(String rawKey) {
        return moderation.sensitiveInfo(DictionaryKeys.parse(rawKey));
    }

    @Transactional
    public Sensitive setSensitive(User actor, String rawKey, boolean sensitive, String note) {
        DictionaryKeys.Key key = DictionaryKeys.parse(rawKey);
        String n = note == null || note.isBlank() ? null : note.strip();
        store.setSensitive(key.raw(), sensitive, actor.getId(), n);
        Map<String, Object> d = new HashMap<>();
        d.put("entryKey", key.raw());
        d.put("sensitive", sensitive);
        d.put("note", n);
        audit.log(actor.getId(), "DICT_SENSITIVE", AdminDictionaryService.AUDIT_TARGET, key.raw(), d);
        return moderation.sensitiveInfo(key);
    }
}
