package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.admin.AdminPage;
import com.pbl6.flashcard.dto.admin.DismissRequest;
import com.pbl6.flashcard.dto.admin.ReportResponse;
import com.pbl6.flashcard.dto.admin.ResolveRequest;
import com.pbl6.flashcard.dto.library.MyReportResponse;
import com.pbl6.flashcard.dto.library.ReportRequest;
import com.pbl6.flashcard.model.ContentReport;
import com.pbl6.flashcard.model.Deck;
import com.pbl6.flashcard.model.DeckRating;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.repository.ContentReportRepository;
import com.pbl6.flashcard.repository.DeckRatingRepository;
import com.pbl6.flashcard.repository.DeckRepository;
import com.pbl6.flashcard.security.ReportRateLimiter;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/** Báo cáo bộ thẻ public: người học gửi, ADMIN resolve / dismiss (atomic bằng UPDATE ... WHERE status = 'OPEN'). */
@Service
public class ReportService {

    private static final String NOT_FOUND = "Không tìm thấy báo cáo.";

    private final ContentReportRepository reports;
    private final DeckRepository decks;
    private final DeckRatingRepository ratings;
    private final ReportRateLimiter rateLimiter;
    private final AdminContentService content;
    private final AuditService audit;

    public ReportService(ContentReportRepository reports, DeckRepository decks, DeckRatingRepository ratings,
                         ReportRateLimiter rateLimiter, AdminContentService content, AuditService audit,
                         NotificationService notifications) {
        this.notifications = notifications;
        this.reports = reports;
        this.decks = decks;
        this.ratings = ratings;
        this.rateLimiter = rateLimiter;
        this.content = content;
        this.audit = audit;
    }

    private final NotificationService notifications;

    /** Báo cho người báo cáo biết kết quả (G3); deckTitle null nếu bộ thẻ đã bị xoá. */
    private void notifyReporter(ContentReport r, String status, String action, String note) {
        Map<String, Object> p = new HashMap<>();
        p.put("deckId", r.getDeckId());
        p.put("deckTitle", decks.findById(r.getDeckId()).map(Deck::getTitle).orElse(null));
        p.put("status", status);
        p.put("action", action);
        p.put("note", note);
        notifications.notify(r.getReporterId(), com.pbl6.flashcard.model.Notification.REPORT_RESOLVED, p);
    }

    // ---------- người học ----------

    /** Không @Transactional: lỗi unique (đã có báo cáo OPEN) phải bắt ngay tại save(), không đợi commit. */
    public ContentReport create(User reporter, String deckId, ReportRequest req) {
        String detail = req.detail() == null || req.detail().isBlank() ? null : req.detail().trim();
        if (req.reason() == ReportRequest.Reason.OTHER && detail == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Hãy mô tả lý do báo cáo.");
        }
        Deck deck = decks.findById(deckId).filter(Deck::isPublic)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy bộ thẻ."));
        if (reporter.getId().equals(deck.getOwnerId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Không thể báo cáo bộ thẻ của chính bạn.");
        }
        rateLimiter.check(reporter.getId());

        ContentReport r = new ContentReport();
        r.setDeckId(deckId);
        r.setReporterId(reporter.getId());
        r.setReason(req.reason().name());
        r.setDetail(detail);
        try {
            return reports.save(r);
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Bạn đã báo cáo bộ thẻ này, đang chờ xử lý.");
        }
    }

    /** "Báo cáo của tôi": cũng dùng để biết đã có báo cáo OPEN cho một bộ thẻ chưa (deckId + status=OPEN). */
    @Transactional(readOnly = true)
    public AdminPage<MyReportResponse> mine(User reporter, String deckId, String status, int page, int size) {
        Page<ContentReport> p = reports.findMine(reporter.getId(), deckId, status, PageRequest.of(page, size));
        List<String> deckIds = p.getContent().stream().map(ContentReport::getDeckId).distinct().toList();
        Map<String, Deck> deckById = decks.findAllById(deckIds).stream().collect(Collectors.toMap(Deck::getId, d -> d));
        return AdminPage.of(p, p.getContent().stream().map(r -> {
            Deck d = deckById.get(r.getDeckId());
            return MyReportResponse.of(r, d == null ? null : d.getTitle(), d != null && d.isPublic());
        }).toList());
    }

    /** Rút lại báo cáo còn OPEN (xoá hẳn: admin chưa xem thì không cần dấu vết). */
    @Transactional
    public void withdraw(User reporter, Long id) {
        if (reports.withdraw(id, reporter.getId()) > 0) return;
        boolean mineButClosed = reports.findById(id).filter(r -> r.getReporterId().equals(reporter.getId())).isPresent();
        if (mineButClosed) throw new ResponseStatusException(HttpStatus.CONFLICT, "Báo cáo đã được xử lý, không thể rút lại.");
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, NOT_FOUND);
    }

    // ---------- admin ----------

    @Transactional(readOnly = true)
    public AdminPage<ReportResponse> list(String status, String deckId, int page, int size) {
        Page<ContentReport> p = reports.search(status, deckId, PageRequest.of(page, size));
        return AdminPage.of(p, toResponses(p.getContent()));
    }

    public long countOpen() {
        return reports.countByStatus(ContentReport.OPEN);
    }

    @Transactional
    public ReportResponse resolve(User actor, Long id, ResolveRequest req) {
        ContentReport r = reports.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, NOT_FOUND));
        DeckRating rating = null;
        if (req.action() == ResolveRequest.Action.CLEAR_COMMENT) {
            if (req.ratingId() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Chọn bình luận cần xoá.");
            }
            rating = ratings.findById(req.ratingId()).filter(x -> x.getDeckId().equals(r.getDeckId()))
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bình luận không thuộc bộ thẻ bị báo cáo."));
        }
        close(r, ContentReport.RESOLVED, req.action().name(), req.note(), actor);
        switch (req.action()) {
            case UNPUBLISH_DECK -> content.unpublish(actor, r.getDeckId());
            case CLEAR_COMMENT -> content.clearComment(actor, rating.getId());
            case NONE -> { }
        }
        Map<String, Object> detail = new HashMap<>();
        detail.put("action", req.action().name());
        detail.put("note", req.note());
        audit.log(actor.getId(), "REPORT_RESOLVE", "REPORT", String.valueOf(id), detail);
        notifyReporter(r, ContentReport.RESOLVED, req.action().name(), req.note());
        return toResponses(List.of(reports.findById(id).orElseThrow())).get(0);
    }

    @Transactional
    public ReportResponse dismiss(User actor, Long id, DismissRequest req) {
        ContentReport r = reports.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, NOT_FOUND));
        close(r, ContentReport.DISMISSED, null, req.note(), actor);
        Map<String, Object> detail = new HashMap<>();
        detail.put("note", req.note());
        audit.log(actor.getId(), "REPORT_DISMISS", "REPORT", String.valueOf(id), detail);
        notifyReporter(r, ContentReport.DISMISSED, null, req.note());
        return toResponses(List.of(reports.findById(id).orElseThrow())).get(0);
    }

    /** Đóng báo cáo chỉ khi còn OPEN (một câu UPDATE): hai admin cùng xử lý thì người sau nhận 409. */
    private void close(ContentReport r, String status, String action, String note, User actor) {
        String trimmed = note == null || note.isBlank() ? null : note.trim();
        int n = reports.close(r.getId(), status, action, trimmed, actor.getId(), Instant.now());
        if (n == 0) throw new ResponseStatusException(HttpStatus.CONFLICT, "Báo cáo đã được xử lý.");
    }

    private List<ReportResponse> toResponses(List<ContentReport> rows) {
        if (rows.isEmpty()) return List.of();
        List<String> deckIds = rows.stream().map(ContentReport::getDeckId).distinct().toList();
        Map<String, Deck> deckById = decks.findAllById(deckIds).stream().collect(Collectors.toMap(Deck::getId, d -> d));
        Map<String, Long> open = reports.countOpenByDeckIds(deckIds).stream()
                .collect(Collectors.toMap(ContentReportRepository.DeckCount::getDeckId, ContentReportRepository.DeckCount::getN));
        Map<Long, String> emails = audit.emailsOf(rows.stream()
                .flatMap(r -> Stream.of(r.getReporterId(), r.getResolvedBy())).filter(Objects::nonNull).distinct().toList());
        return rows.stream().map(r -> {
            Deck d = deckById.get(r.getDeckId());
            return ReportResponse.of(r, d == null ? null : d.getTitle(), d == null ? null : d.getVisibility(),
                    emails.get(r.getReporterId()), r.getResolvedBy() == null ? null : emails.get(r.getResolvedBy()),
                    open.getOrDefault(r.getDeckId(), 0L));
        }).toList();
    }
}
