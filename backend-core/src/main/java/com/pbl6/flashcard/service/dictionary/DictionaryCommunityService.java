package com.pbl6.flashcard.service.dictionary;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.dto.dictionary.DictDtos;
import com.pbl6.flashcard.dto.moderation.ModerationDtos;
import com.pbl6.flashcard.security.DictionaryRateLimiter;
import com.pbl6.flashcard.security.ReportRateLimiter;
import com.pbl6.flashcard.service.moderation.ModerationService;
import com.pbl6.flashcard.service.moderation.ModerationStore;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Set;

/**
 * Bình luận (D19) và báo cáo (D20, D29) phía người học (spec 2026-10-26 §6.4). Bình luận phẳng, có "Hữu ích"; báo cáo mục ghi trường
 * sai + đề xuất sửa + giá trị hiện tại (server chụp lúc gửi), admin xử lý ở {@link AdminDictionaryService}.
 */
@Service
public class DictionaryCommunityService {

    public static final int DAILY_COMMENT_CAP = 200;
    private static final Set<String> KANJI_FIELDS = Set.of("han_viet", "kanji_meaning", "meaning_vi", "other");

    private final DictionaryStore store;
    private final DictionaryService dictionary;
    private final DictionaryRateLimiter limiter;
    private final ReportRateLimiter reportLimiter;
    private final ModerationService moderation;

    public DictionaryCommunityService(DictionaryStore store, DictionaryService dictionary, DictionaryRateLimiter limiter,
                                      ReportRateLimiter reportLimiter, ModerationService moderation) {
        this.store = store;
        this.dictionary = dictionary;
        this.limiter = limiter;
        this.reportLimiter = reportLimiter;
        this.moderation = moderation;
    }

    // ------------------------------------------------------------ bình luận

    public DictDtos.CommentPage comments(long uid, String rawKey, String sort, int page, int size) {
        String key = DictionaryKeys.parse(rawKey).raw();
        int p = Math.max(0, page);
        int s = Math.max(1, Math.min(size, 50));
        List<DictDtos.Comment> items = store.comments(key, uid, sort, p, s).stream().map(c -> toDto(c, uid)).toList();
        return new DictDtos.CommentPage(items, store.countComments(key, uid), p, s);
    }

    /**
     * Thêm bình luận rồi kiểm duyệt AI đồng bộ (spec 2026-10-27 đêm §4): BLOCKED vẫn trả 201 với moderation.status = BLOCKED (chỉ chủ
     * thấy, sửa gửi lại được); FLAGGED đăng + chờ admin; ai-service lỗi → PENDING (job quét lại). Đang bị khoá bình luận → 429.
     */
    @Transactional
    public DictDtos.Comment addComment(long uid, String rawKey, String content) {
        DictionaryKeys.Key key = DictionaryKeys.parse(rawKey);
        String text = clean(content);
        moderation.requireNotLocked(uid);
        if (store.commentsToday(uid) >= DAILY_COMMENT_CAP) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Bạn đã bình luận quá nhiều hôm nay.");
        }
        limiter.checkComment(uid);
        long id = store.insertComment(key.raw(), uid, text);
        screen(uid, id, key, text);
        return toDto(store.comment(id, uid).orElseThrow(), uid);
    }

    /** Sửa = chấm lại từ đầu (bình luận AI chặn sửa được để gửi lại; admin ẩn thì vẫn 409). */
    @Transactional
    public DictDtos.Comment editComment(long uid, long id, String content) {
        DictionaryStore.Comment c = own(uid, id);
        if (c.hiddenAt() != null) throw new ResponseStatusException(HttpStatus.CONFLICT, "Bình luận đã bị ẩn, không sửa được.");
        String text = clean(content);
        moderation.requireNotLocked(uid);
        store.updateComment(id, text);
        screen(uid, id, DictionaryKeys.parse(c.entryKey()), text);
        return toDto(store.comment(id, uid).orElseThrow(), uid);
    }

    private void screen(long uid, long id, DictionaryKeys.Key key, String text) {
        ModerationDtos.Screening s = moderation.screen(text, moderation.isSensitiveEntry(key));
        moderation.store().apply(ModerationStore.KIND_COMMENT, id, s);
        if (s.blocked()) moderation.afterBlocked(uid, Instant.now());
    }

    @Transactional
    public void deleteComment(long uid, long id) {
        own(uid, id);
        store.deleteComment(id);
    }

    @Transactional
    public DictDtos.HelpfulResponse toggleHelpful(long uid, long id) {
        DictionaryStore.Comment c = store.comment(id, uid)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy bình luận."));
        if (c.invisibleToOthers()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy bình luận.");
        if (c.userId() == uid) throw new ResponseStatusException(HttpStatus.CONFLICT, "Không thể đánh dấu hữu ích cho bình luận của mình.");
        int n = store.toggleVote(id, uid);
        boolean voted = store.comment(id, uid).map(DictionaryStore.Comment::votedByMe).orElse(false);
        return new DictDtos.HelpfulResponse(n, voted);
    }

    private DictionaryStore.Comment own(long uid, long id) {
        DictionaryStore.Comment c = store.comment(id, uid)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy bình luận."));
        if (c.userId() != uid) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bạn chỉ sửa / xoá được bình luận của mình.");
        return c;
    }

    private static String clean(String content) {
        String t = content == null ? "" : content.strip();
        if (t.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nội dung bình luận trống.");
        if (t.length() > 1000) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bình luận tối đa 1000 ký tự.");
        return t;
    }

    /** Người khác: FLAGGED → bản che từ + {masked}; chủ: nguyên văn + {status, spans, message}. */
    DictDtos.Comment toDto(DictionaryStore.Comment c, long viewer) {
        boolean mine = c.userId() == viewer;
        return new DictDtos.Comment(c.id(), c.entryKey(), c.userId(), c.displayName(),
                moderation.contentFor(c.content(), c.modStatus(), c.modSpans(), mine, false), c.helpfulCount(), c.votedByMe(),
                mine, c.hiddenAt() != null, c.createdAt(), c.updatedAt(), moderation.infoFor(c.modStatus(), c.modSpans(), mine, false));
    }

    // ------------------------------------------------------------ báo cáo

    @Transactional
    public DictDtos.Report reportEntry(long uid, String rawKey, DictDtos.EntryReportRequest req) {
        DictionaryKeys.Key key = DictionaryKeys.parse(rawKey);
        String field = req.field();
        String sub = req.subKey() == null || req.subKey().isBlank() ? null : req.subKey().strip();
        String proposed = blankToNull(req.proposedValue());
        String note = blankToNull(req.note());
        if (key.kind() == DictionaryKeys.Kind.KANJI && !KANJI_FIELDS.contains(field)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Trường này không áp dụng cho chữ Hán.");
        }
        if (key.kind() != DictionaryKeys.Kind.KANJI && "kanji_meaning".equals(field)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nghĩa của chữ Hán báo ở trang chữ Hán.");
        }
        if ("other".equals(field) && note == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Hãy ghi rõ chỗ sai.");
        }
        if (!"other".equals(field) && proposed == null && note == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Hãy nhập đề xuất sửa hoặc ghi chú.");
        }
        JsonNode e = dictionary.layered(key, false);
        String current = currentValue(key, e, field, sub);
        if (store.openEntryReportExists(uid, key.raw(), field, sub)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Bạn đã báo lỗi này, admin đang xem.");
        }
        reportLimiter.check(uid);
        long id = store.insertReport("ENTRY", key.raw(), null, field, sub, current, proposed, null, note, uid);
        return toDto(store.report(id).orElseThrow(), termOf(e, key));
    }

    /** Giá trị hiện tại của trường bị báo (kiểm subKey bắt buộc theo trường). */
    static String currentValue(DictionaryKeys.Key key, JsonNode e, String field, String sub) {
        switch (field) {
            case "reading": return DictionaryService.text(e, "reading", null);
            case "meaning_vi": return DictionaryService.text(e, "meaningVi", null);
            case "meaning_en": return DictionaryService.text(e, key.kind() == DictionaryKeys.Kind.KANJI ? "meaningEn" : "glossShort", null);
            case "kanji_meaning": return DictionaryService.text(e, "meaningEn", null);
            case "han_viet": {
                if (key.kind() == DictionaryKeys.Kind.KANJI) return DictionaryService.text(e, "hanViet", null);
                if (sub == null || sub.codePointCount(0, sub.length()) != 1 || !DictionaryKeys.isKanji(sub.codePointAt(0))) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Chọn chữ Hán có âm Hán-Việt sai.");
                }
                for (JsonNode c : e.path("hanVietChars")) {
                    if (sub.equals(c.path("char").asText())) return DictionaryService.text(c, "reading", null);
                }
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Chữ Hán này không có trong từ.");
            }
            case "example":
            case "example_vi": {
                if (sub == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Chọn câu ví dụ bị sai.");
                for (JsonNode x : e.path("examples")) {
                    if (sub.equals(x.path("id").asText())) {
                        return DictionaryService.text(x, "example".equals(field) ? "jpn" : "vi", null);
                    }
                }
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Không tìm thấy câu ví dụ.");
            }
            default: return null;
        }
    }

    @Transactional
    public DictDtos.Report reportComment(long uid, long commentId, DictDtos.CommentReportRequest req) {
        DictionaryStore.Comment c = store.comment(commentId, uid)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy bình luận."));
        if (c.invisibleToOthers()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy bình luận.");
        if (c.userId() == uid) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Không thể báo cáo bình luận của mình.");
        if (store.openCommentReportExists(uid, commentId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Bạn đã báo cáo bình luận này.");
        }
        reportLimiter.check(uid);
        long id = store.insertReport("COMMENT", c.entryKey(), commentId, null, null, c.content(), null, req.reason(),
                blankToNull(req.note()), uid);
        return toDto(store.report(id).orElseThrow(), null);
    }

    /**
     * Báo bản dịch sai ở tab Dịch (V40): chỉ bản đã nằm trong bộ nhớ dịch chung (bản thiếu / lỗi không được lưu, không có gì để
     * sửa). Câu gốc lưu kèm báo cáo (người học tự gửi, giao diện nói rõ); bộ nhớ dịch vẫn không gắn tài khoản.
     */
    @Transactional
    public DictDtos.Report reportTranslation(long uid, DictDtos.TranslateReportRequest req) {
        String text = DictionaryService.normalizeText(req.text());
        if (text.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nhập câu cần báo.");
        String proposed = blankToNull(req.proposedValue());
        String note = blankToNull(req.note());
        if (proposed == null && note == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Hãy nhập bản dịch đúng hoặc ghi rõ chỗ sai.");
        }
        String hash = DictionaryService.textHash(req.direction(), text);
        String current = store.textTranslation(hash).map(t -> dictionary.cachedTranslation(t.result())).orElse(null);
        if (current == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Bản dịch này không còn trong bộ nhớ dịch, hãy dịch lại rồi báo.");
        }
        if (store.openTextReportExists(uid, hash)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Bạn đã báo bản dịch này, admin đang xem.");
        }
        reportLimiter.check(uid);
        long id = store.insertTextReport(hash, req.direction(), text, current, proposed, note, uid);
        return toDto(store.report(id).orElseThrow(), null);
    }

    public DictDtos.ReportPage myReports(long uid, int page, int size) {
        int p = Math.max(0, page);
        int s = Math.max(1, Math.min(size, 50));
        List<DictDtos.Report> items = store.reportsByReporter(uid, p, s).stream().map(r -> toDto(r, null)).toList();
        return new DictDtos.ReportPage(items, store.countReportsByReporter(uid), p, s);
    }

    static DictDtos.Report toDto(DictionaryStore.Report r, String term) {
        return new DictDtos.Report(r.id(), r.kind(), r.entryKey(), term, r.commentId(), r.commentContent(), r.field(), r.subKey(),
                r.currentValue(), r.proposedValue(), r.reason(), r.note(), r.reporterId(), r.reporterEmail(), r.status(), r.action(),
                r.resolutionNote(), r.resolvedAt(), r.createdAt(), r.sourceText());
    }

    static String termOf(JsonNode e, DictionaryKeys.Key key) {
        if (key.kind() == DictionaryKeys.Kind.KANJI) return key.kanji();
        return DictionaryService.text(e, "headKanji", DictionaryService.text(e, "headKana", null));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }
}
