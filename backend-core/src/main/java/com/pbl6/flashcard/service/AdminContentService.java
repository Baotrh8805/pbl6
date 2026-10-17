package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.admin.*;
import com.pbl6.flashcard.dto.admin.AdminDeckResponse.Detail;
import com.pbl6.flashcard.dto.admin.AdminDeckResponse.Row;
import com.pbl6.flashcard.dto.deck.DeckResponse.CardResponse;
import com.pbl6.flashcard.model.Deck;
import com.pbl6.flashcard.model.DeckRating;
import com.pbl6.flashcard.model.ExtractionJob;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.repository.*;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Admin Panel > Nội dung: bộ thẻ, bình luận, job bóc tách. Thao tác ghi: ADMIN (controller) + audit cùng transaction. */
@Service
public class AdminContentService {

    private static final String DECK_NOT_FOUND = "Không tìm thấy bộ thẻ.";

    private final DeckRepository decks;
    private final DeckRatingRepository ratings;
    private final ExtractionJobRepository jobs;
    private final ContentReportRepository reports;
    private final DeckService deckService;
    private final ExtractionService extractionService;
    private final AuditService audit;

    public AdminContentService(DeckRepository decks, DeckRatingRepository ratings, ExtractionJobRepository jobs,
                               ContentReportRepository reports, DeckService deckService,
                               ExtractionService extractionService, AuditService audit) {
        this.decks = decks;
        this.ratings = ratings;
        this.jobs = jobs;
        this.reports = reports;
        this.deckService = deckService;
        this.extractionService = extractionService;
        this.audit = audit;
    }

    // ---------- bộ thẻ ----------

    @Transactional(readOnly = true)
    public AdminPage<Row> listDecks(String q, String visibility, Boolean official, Boolean featured, Long ownerId, int page, int size) {
        Page<DeckRepository.AdminDeckRow> p = decks.searchAdmin(AdminUserService.likePattern(q),
                visibility == null ? "" : visibility, official, featured, ownerId, PageRequest.of(page, size));
        return AdminPage.of(p, p.getContent().stream().map(Row::of).toList());
    }

    /** Thẻ chỉ hiện khi bộ thẻ public hoặc đang bị báo cáo: bộ private là tài liệu cá nhân. */
    @Transactional(readOnly = true)
    public Detail deck(String id) {
        Row row = Row.of(decks.findAdminRow(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, DECK_NOT_FOUND)));
        boolean showCards = Deck.PUBLIC.equals(row.visibility()) || row.openReports() > 0;
        List<CardResponse> cards = showCards
                ? decks.findById(id).orElseThrow().getCards().stream().map(CardResponse::of).toList()
                : null;
        return Detail.of(row, cards);
    }

    /** Gỡ khỏi Thư viện = private. Trả true nếu có thay đổi (ReportService dùng lại). */
    @Transactional
    public boolean unpublish(User actor, String deckId) {
        Deck deck = lockedDeck(deckId);
        if (Deck.PRIVATE.equals(deck.getVisibility())) return false;
        deck.setVisibility(Deck.PRIVATE);
        decks.save(deck);
        audit.log(actor.getId(), "DECK_UNPUBLISH", "DECK", deckId, AuditService.diff("visibility", Deck.PUBLIC, Deck.PRIVATE));
        return true;
    }

    @Transactional
    public Row setFlags(User actor, String deckId, DeckFlagsRequest req) {
        Deck deck = lockedDeck(deckId);
        Map<String, Object> changes = new HashMap<>();
        if (req.official() != null && req.official() != deck.isOfficial()) {
            changes.putAll(AuditService.diff("official", deck.isOfficial(), req.official()));
            deck.setOfficial(req.official());
        }
        if (req.featured() != null && req.featured() != deck.isFeatured()) {
            changes.putAll(AuditService.diff("featured", deck.isFeatured(), req.featured()));
            // DB chỉ cho một bộ thẻ nổi bật (uq_decks_single_featured): gắn mới = bỏ cờ của bộ cũ
            if (req.featured()) decks.clearFeatured();
            deck.setFeatured(req.featured());
        }
        if (!changes.isEmpty()) {
            decks.save(deck);
            audit.log(actor.getId(), "DECK_FLAGS", "DECK", deckId, changes);
        }
        return Row.of(decks.findAdminRow(deckId).orElseThrow());
    }

    @Transactional
    public void deleteDeck(User actor, String deckId) {
        Deck deck = lockedDeck(deckId);
        audit.log(actor.getId(), "DECK_DELETE", "DECK", deckId,
                Map.of("title", deck.getTitle(), "ownerId", deck.getOwnerId(), "visibility", deck.getVisibility()));
        deckService.deleteDeck(deck);
    }

    private Deck lockedDeck(String deckId) {
        return decks.findByIdForUpdate(deckId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, DECK_NOT_FOUND));
    }

    // ---------- bình luận ----------

    @Transactional(readOnly = true)
    public AdminPage<AdminRatingResponse> listRatings(String deckId, String q, int page, int size) {
        Page<DeckRatingRepository.AdminRow> p = ratings.searchAdmin(deckId == null ? "" : deckId,
                AdminUserService.likePattern(q), PageRequest.of(page, size));
        return AdminPage.of(p, p.getContent().stream().map(AdminRatingResponse::of).toList());
    }

    /** Xoá bình luận, giữ sao. Trả true nếu có thay đổi (ReportService dùng lại). */
    @Transactional
    public boolean clearComment(User actor, Long ratingId) {
        DeckRating r = ratings.findById(ratingId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy đánh giá."));
        if (r.getComment() == null) return false;
        audit.log(actor.getId(), "RATING_CLEAR_COMMENT", "RATING", String.valueOf(ratingId),
                Map.of("deckId", r.getDeckId(), "comment", r.getComment()));
        r.setComment(null);
        ratings.save(r);
        return true;
    }

    // ---------- job bóc tách ----------

    @Transactional(readOnly = true)
    public AdminPage<AdminExtractionResponse> listExtractions(String status, Long userId, int page, int size) {
        Page<ExtractionJob> p = jobs.searchAdmin(status, userId, PageRequest.of(page, size));
        Map<Long, String> emails = audit.emailsOf(p.getContent().stream().map(ExtractionJob::getUserId).distinct().toList());
        return AdminPage.of(p, p.getContent().stream().map(j -> AdminExtractionResponse.of(j, emails.get(j.getUserId()))).toList());
    }

    @Transactional
    public void deleteExtraction(User actor, UUID id) {
        ExtractionJob job = jobs.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy lượt bóc tách."));
        extractionService.deleteJob(job);
        audit.log(actor.getId(), "EXTRACTION_DELETE", "EXTRACTION", id.toString(),
                Map.of("userId", job.getUserId(), "status", job.getStatus()));
    }
}
