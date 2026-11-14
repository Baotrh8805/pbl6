package com.pbl6.flashcard.service.moderation;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.config.CodedStatusException;
import com.pbl6.flashcard.dto.moderation.ModerationDtos.Info;
import com.pbl6.flashcard.dto.moderation.ModerationDtos.RescanResponse;
import com.pbl6.flashcard.dto.moderation.ModerationDtos.Screening;
import com.pbl6.flashcard.dto.moderation.ModerationDtos.Sensitive;
import com.pbl6.flashcard.dto.moderation.ModerationDtos.Signal;
import com.pbl6.flashcard.dto.moderation.ModerationDtos.Span;
import com.pbl6.flashcard.dto.moderation.ModerationDtos.Verdict;
import com.pbl6.flashcard.model.Notification;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.repository.UserRepository;
import com.pbl6.flashcard.service.AiServiceClient;
import com.pbl6.flashcard.service.NotificationService;
import com.pbl6.flashcard.service.dictionary.DictionaryKeys;
import com.pbl6.flashcard.service.dictionary.DictionaryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Kiểm duyệt văn bản người dùng (spec 2026-10-27 đêm §3–§5): gọi ai-service đồng bộ, áp {@link ModerationPolicy}, ghi mod_* qua
 * {@link ModerationStore}; ai-service lỗi → PENDING và {@link #rescan} (job 5 phút) chấm lại. Khoá bình luận mềm 24 giờ sau 3 lần bị
 * chặn. "Mục từ nhạy cảm" = công tắc admin, không có thì nhãn JMdict vulg / X / derog / sens / sl của bất kỳ nghĩa nào.
 */
@Service
public class ModerationService {

    private static final Logger log = LoggerFactory.getLogger(ModerationService.class);
    public static final Set<String> SENSITIVE_MISC = Set.of("vulg", "X", "derog", "sens", "sl");
    public static final String CODE_LOCKED = "COMMENT_LOCKED";
    public static final String CODE_NAME = "NAME_REJECTED";
    static final long WARN_EVERY_MS = 60_000;
    private static final DateTimeFormatter LOCK_FMT = DateTimeFormatter.ofPattern("HH:mm dd/MM");

    private final ModerationAiClient ai;
    private final ModerationStore store;
    private final UserRepository users;
    private final NotificationService notifications;
    private final DictionaryService dictionary;
    private final boolean enabled;
    private final ZoneId zone;
    private volatile long lastWarn;

    public ModerationService(ModerationAiClient ai, ModerationStore store, UserRepository users, NotificationService notifications,
                             DictionaryService dictionary, @Value("${app.moderation.enabled:true}") boolean enabled,
                             @Value("${app.learning-path.zone:Asia/Ho_Chi_Minh}") String zone) {
        this.ai = ai;
        this.store = store;
        this.users = users;
        this.notifications = notifications;
        this.dictionary = dictionary;
        this.enabled = enabled;
        this.zone = ZoneId.of(zone);
    }

    public boolean enabled() { return enabled; }

    public ModerationStore store() { return store; }

    // ------------------------------------------------------------------ chấm

    /** Chấm một văn bản; tắt → CLEAN; ai-service lỗi / quá 3 s → PENDING (WARN gộp mỗi phút). */
    public Screening screen(String text, boolean sensitive) {
        if (!enabled || text == null || text.isBlank()) return Screening.clean();
        try {
            Signal s = ai.check(List.of(text)).get(0);
            return of(s, sensitive);
        } catch (AiServiceClient.AiServiceException e) {
            long now = System.currentTimeMillis();
            if (now - lastWarn > WARN_EVERY_MS) {
                lastWarn = now;
                log.warn("Kiểm duyệt AI không dùng được, bình luận để PENDING chờ quét lại: {}", e.getMessage());
            }
            return Screening.pending();
        }
    }

    static Screening of(Signal s, boolean sensitive) {
        Verdict v = ModerationPolicy.decide(s, sensitive);
        List<Span> spans = s.spans() == null ? List.of() : s.spans();
        return new Screening(v.name(), v.name(), s.label(), s.score(), spans);
    }

    /** Tên hiển thị: BLOCKED hoặc FLAGGED → 400 NAME_REJECTED (không lưu); PENDING (AI lỗi) → cho qua. */
    public void requireAcceptableName(String fullName) {
        Screening s = screen(fullName, false);
        if (s.blocked() || s.flagged()) {
            String words = s.words().isEmpty() ? "" : ": " + String.join(", ", s.words());
            throw new CodedStatusException(HttpStatus.BAD_REQUEST, CODE_NAME, "Tên hiển thị có từ không phù hợp" + words + ".");
        }
    }

    // ------------------------------------------------------------------ khoá bình luận mềm

    /** 429 COMMENT_LOCKED khi người dùng đang bị khoá bình luận (3 lần bị AI chặn / 24 giờ). */
    public void requireNotLocked(long uid) {
        Instant until = users.findById(uid).map(User::getCommentLockedUntil).orElse(null);
        if (until != null && until.isAfter(Instant.now())) {
            throw new CodedStatusException(HttpStatus.TOO_MANY_REQUESTS, CODE_LOCKED, "Bạn tạm thời không thể bình luận tới "
                    + LOCK_FMT.format(until.atZone(zone)) + " (bị AI chặn " + ModerationPolicy.LOCK_AFTER + " lần trong 24 giờ).");
        }
    }

    /** Gọi sau mỗi lần một bình luận của uid bị BLOCKED: đủ 3 lần trong 24 giờ → khoá 24 giờ + thông báo (chỉ khoá một lần). */
    @Transactional
    public void afterBlocked(long uid, Instant now) {
        long n = store.countBlockedSince(uid, now.minus(ModerationPolicy.LOCK_WINDOW));
        if (n < ModerationPolicy.LOCK_AFTER) return;
        User u = users.findById(uid).orElse(null);
        if (u == null) return;
        if (u.getCommentLockedUntil() != null && u.getCommentLockedUntil().isAfter(now)) return;
        Instant until = now.plus(ModerationPolicy.LOCK_FOR).truncatedTo(ChronoUnit.MICROS);
        u.setCommentLockedUntil(until);
        users.save(u);
        notifications.notify(uid, Notification.MOD_COMMENT_LOCKED, Map.of("until", until.toString(), "blocked", n));
    }

    // ------------------------------------------------------------------ mục từ nhạy cảm

    public boolean isSensitiveEntry(DictionaryKeys.Key key) {
        Optional<ModerationStore.SensitiveRow> o = store.sensitive(key.raw());
        if (o.isPresent()) return o.get().sensitive();
        return jmdictSensitive(key);
    }

    public Sensitive sensitiveInfo(DictionaryKeys.Key key) {
        Optional<ModerationStore.SensitiveRow> o = store.sensitive(key.raw());
        if (o.isPresent()) return new Sensitive(o.get().sensitive(), "admin", o.get().note());
        boolean jm = jmdictSensitive(key);
        return new Sensitive(jm, jm ? "jmdict" : "none", null);
    }

    /** Nhãn JMdict của bất kỳ nghĩa nào thuộc SENSITIVE_MISC; chữ Hán / mục không mở được → false. */
    public boolean jmdictSensitive(DictionaryKeys.Key key) {
        if (key.kind() == DictionaryKeys.Kind.KANJI) return false;
        try {
            JsonNode e = dictionary.layered(key, false);
            for (JsonNode s : e.path("senses")) {
                for (JsonNode m : s.path("misc")) {
                    if (SENSITIVE_MISC.contains(m.asText())) return true;
                }
            }
        } catch (RuntimeException ex) {
            log.debug("Không đọc được nhãn JMdict của {}: {}", key.raw(), ex.getMessage());
        }
        return false;
    }

    // ------------------------------------------------------------------ hiển thị

    /** Phần người học thấy; người khác: BLOCKED không bao giờ tới đây (đã lọc), FLAGGED bị che từ. */
    public Info infoFor(String status, String spansJson, boolean owner, boolean staff) {
        if (status == null || Screening.CLEAN.equals(status) || Screening.REVIEWED.equals(status)) return null;
        List<Span> spans = store.parseSpans(spansJson);
        List<String> words = spans.stream().map(Span::word).distinct().toList();
        boolean masked = Screening.FLAGGED.equals(status) && !owner && !staff && !spans.isEmpty();
        if (!owner && !staff) return masked ? new Info(status, true, List.of(), null) : null;
        return new Info(status, false, words, ModerationPolicy.message(status, words));
    }

    /** Nội dung cho người xem: FLAGGED + không phải chủ / staff → bản che từ. */
    public String contentFor(String content, String status, String spansJson, boolean owner, boolean staff) {
        if (!Screening.FLAGGED.equals(status) || owner || staff) return content;
        return ModerationPolicy.mask(content, store.parseSpans(spansJson));
    }

    // ------------------------------------------------------------------ quét lại

    /** Chấm lại tối đa limit dòng PENDING (cũ nhất trước); BLOCKED muộn → thông báo tác giả + đếm khoá. */
    @Transactional
    public RescanResponse rescan(int limit) {
        int scanned = 0;
        if (enabled) {
            Map<String, Boolean> sensitiveCache = new HashMap<>();
            for (ModerationStore.Row r : store.byStatus(List.of(Screening.PENDING), Math.max(1, Math.min(limit, 200)))) {
                boolean sensitive = false;
                if (ModerationStore.KIND_COMMENT.equals(r.kind())) {
                    DictionaryKeys.Key key = DictionaryKeys.tryParse(r.targetKey());
                    sensitive = key != null && sensitiveCache.computeIfAbsent(r.targetKey(), k -> isSensitiveEntry(key));
                }
                Screening s = screen(r.content(), sensitive);
                if (Screening.PENDING.equals(s.status())) break;   // ai-service vẫn lỗi: để lượt sau
                store.apply(r.kind(), r.id(), s);
                scanned++;
                if (s.blocked()) {
                    Map<String, Object> p = new HashMap<>();
                    p.put("kind", r.kind());
                    p.put("id", r.id());
                    p.put(ModerationStore.KIND_COMMENT.equals(r.kind()) ? "entryKey" : "deckId", r.targetKey());
                    p.put("words", String.join(", ", s.words()));
                    notifications.notify(r.userId(), Notification.MOD_COMMENT_BLOCKED, p);
                    afterBlocked(r.userId(), Instant.now());
                }
            }
        }
        return new RescanResponse(scanned, store.counts().pending());
    }
}
