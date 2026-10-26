package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.dto.deck.CloneRequest;
import com.pbl6.flashcard.dto.deck.DeckRequest;
import com.pbl6.flashcard.dto.deck.DeckRequest.Card;
import com.pbl6.flashcard.dto.deck.DeckResponse;
import com.pbl6.flashcard.dto.deck.DeckResponse.CardResponse;
import com.pbl6.flashcard.dto.deck.DistractorsResponse;
import com.pbl6.flashcard.dto.deck.QuizCapabilitiesResponse;
import com.pbl6.flashcard.dto.deck.ShareMemberResponse;
import com.pbl6.flashcard.dto.deck.ShareRequest;
import com.pbl6.flashcard.security.AiRateLimiter;
import com.pbl6.flashcard.security.CustomUserDetails;
import com.pbl6.flashcard.service.DeckService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/** HTTP <-> DeckService. User id lấy thẳng từ principal (JwtAuthenticationFilter đã nạp), không query lại. */
@RestController
@RequestMapping("/api/decks")
@Validated // để @Valid trên phần tử List<@Valid Card> (endpoint batch) thực sự chạy
public class DeckController {

    private final DeckService deckService;
    private final AiRateLimiter aiLimiter;

    private final com.pbl6.flashcard.service.DeckShareLinkService shareLinks;
    private final com.pbl6.flashcard.service.DeckExportService exports;

    public DeckController(DeckService deckService, AiRateLimiter aiLimiter,
                          com.pbl6.flashcard.service.DeckShareLinkService shareLinks,
                          com.pbl6.flashcard.service.DeckExportService exports) {
        this.shareLinks = shareLinks;
        this.exports = exports;
        this.aiLimiter = aiLimiter;
        this.deckService = deckService;
    }

    private static Long uid(CustomUserDetails principal) {
        return principal.getUser().getId();
    }

    /** folderId != null: chỉ lấy bộ thẻ trong thư mục đó (đã lọc theo quyền sở hữu). */
    @GetMapping
    public List<DeckResponse> listDecks(@AuthenticationPrincipal CustomUserDetails me,
                                        @RequestParam(required = false) UUID folderId) {
        return deckService.list(uid(me), folderId);
    }

    @GetMapping("/{deckId}")
    public DeckResponse getDeck(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String deckId) {
        return deckService.get(uid(me), deckId);
    }

    @PostMapping
    public ResponseEntity<DeckResponse> createDeck(@AuthenticationPrincipal CustomUserDetails me,
                                                   @Valid @RequestBody DeckRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(deckService.create(uid(me), req));
    }

    @PutMapping("/{deckId}")
    public DeckResponse updateDeck(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String deckId,
                                   @Valid @RequestBody DeckRequest req) {
        return deckService.update(uid(me), deckId, req);
    }

    @DeleteMapping("/{deckId}")
    public ResponseEntity<Void> deleteDeck(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String deckId) {
        deckService.delete(uid(me), deckId);
        return ResponseEntity.noContent().build();
    }

    /** Lưu bản sao bộ thẻ (Thư viện/được chia sẻ) về tài khoản. Body tuỳ chọn: {"folderId": "..."}. */
    @PostMapping("/{deckId}/clone")
    public ResponseEntity<DeckResponse> cloneDeck(@AuthenticationPrincipal CustomUserDetails me,
                                                  @PathVariable String deckId,
                                                  @RequestBody(required = false) CloneRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(deckService.cloneDeck(uid(me), deckId, req != null ? req.folderId() : null));
    }

    @GetMapping("/{deckId}/shares")
    public List<ShareMemberResponse> shares(@AuthenticationPrincipal CustomUserDetails me,
                                            @PathVariable String deckId) {
        return deckService.shares(uid(me), deckId);
    }

    /** Thêm hoặc đổi quyền người được chia sẻ; trả danh sách sau khi đổi. */
    @PutMapping("/{deckId}/shares")
    public List<ShareMemberResponse> share(@AuthenticationPrincipal CustomUserDetails me,
                                           @PathVariable String deckId, @Valid @RequestBody ShareRequest req) {
        return deckService.share(uid(me), deckId, req);
    }

    @DeleteMapping("/{deckId}/shares/{userId}")
    public ResponseEntity<Void> unshare(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String deckId,
                                        @PathVariable Long userId) {
        deckService.unshare(uid(me), deckId, userId);
        return ResponseEntity.noContent().build();
    }

    // ---------- link chia sẻ (D9) + xuất bộ thẻ (UC-29), kế hoạch 2026-10-26 B1 / B2 ----------

    /** {token | null}: link chia sẻ hiện tại của bộ (chỉ chủ). */
    @GetMapping("/{deckId}/share-link")
    public com.pbl6.flashcard.service.DeckShareLinkService.ShareLink shareLink(@AuthenticationPrincipal CustomUserDetails me,
                                                                            @PathVariable String deckId) {
        return shareLinks.get(uid(me), deckId);
    }

    /** Tạo link mới (có rồi thì đổi token, link cũ hết hiệu lực). */
    @PostMapping("/{deckId}/share-link")
    public com.pbl6.flashcard.service.DeckShareLinkService.ShareLink rotateShareLink(@AuthenticationPrincipal CustomUserDetails me,
                                                                                  @PathVariable String deckId) {
        return shareLinks.rotate(uid(me), deckId);
    }

    @DeleteMapping("/{deckId}/share-link")
    public ResponseEntity<Void> revokeShareLink(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String deckId) {
        shareLinks.revoke(uid(me), deckId);
        return ResponseEntity.noContent().build();
    }

    /** Mở link /d/<token>: nhận quyền xem, trả {deckId, access}. Token sai / đã thu hồi = 404. */
    @PostMapping("/share-link/{token}/accept")
    public com.pbl6.flashcard.service.DeckShareLinkService.Accepted acceptShareLink(@AuthenticationPrincipal CustomUserDetails me,
                                                                                 @PathVariable String token) {
        return shareLinks.accept(uid(me), token);
    }

    /** Tệp CSV (Excel) hoặc TSV cho Anki; tên tệp ASCII + filename* UTF-8. */
    @GetMapping("/{deckId}/export")
    public ResponseEntity<byte[]> export(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String deckId,
                                         @RequestParam(defaultValue = "csv") String format) {
        com.pbl6.flashcard.service.DeckExportService.Export e = exports.exportFor(uid(me), deckId, format);
        return ResponseEntity.ok()
                .header(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION,
                        org.springframework.http.ContentDisposition.attachment().filename(e.fileName(), java.nio.charset.StandardCharsets.UTF_8)
                                .build().toString())
                .contentType(org.springframework.http.MediaType.parseMediaType(e.contentType()))
                .body(e.body());
    }

    @PostMapping("/{deckId}/cards")
    public ResponseEntity<CardResponse> addCard(@AuthenticationPrincipal CustomUserDetails me,
                                                @PathVariable String deckId, @Valid @RequestBody Card req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(deckService.addCards(uid(me), deckId, List.of(req)).get(0));
    }

    @PostMapping("/{deckId}/cards/batch")
    public ResponseEntity<List<CardResponse>> addCardsBatch(@AuthenticationPrincipal CustomUserDetails me,
                                                            @PathVariable String deckId,
                                                            @RequestBody @Size(max = 1000) List<@Valid Card> reqList) {
        return ResponseEntity.status(HttpStatus.CREATED).body(deckService.addCards(uid(me), deckId, reqList));
    }

    @PutMapping("/{deckId}/cards/{cardId}")
    public CardResponse updateCard(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String deckId,
                                   @PathVariable String cardId, @Valid @RequestBody Card req) {
        return deckService.updateCard(uid(me), deckId, cardId, req);
    }

    @DeleteMapping("/{deckId}/cards/{cardId}")
    public ResponseEntity<Void> deleteCard(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String deckId,
                                           @PathVariable String cardId) {
        deckService.deleteCard(uid(me), deckId, cardId);
        return ResponseEntity.noContent().build();
    }

    /** Số thẻ ra được câu hỏi từng loại (meaning, kanjiLookalike, homophone, reading, conjugation); ai xem được bộ thẻ đều gọi được. */
    @GetMapping("/{deckId}/quiz-capabilities")
    public QuizCapabilitiesResponse quizCapabilities(@AuthenticationPrincipal CustomUserDetails me,
                                                     @PathVariable String deckId) {
        return deckService.quizCapabilities(uid(me), deckId);
    }

    /**
     * Sinh (lại) phương án nhiễu chữ giống hình / từ đồng âm cho thẻ từ vựng của bộ (EDITOR+). Không body. Chỉ cập nhật dữ liệu
     * thẻ có sẵn, không tạo tài nguyên mới nên trả 200; ai-service tắt -> 503.
     */
    @PostMapping("/{deckId}/distractors")
    public DistractorsResponse generateDistractors(@AuthenticationPrincipal CustomUserDetails me,
                                                   @PathVariable String deckId) {
        aiLimiter.checkDeckAi(uid(me)); // gọi ai-service cho cả bộ thẻ (tới 3 phút), đốt quota dùng chung
        return deckService.generateDistractors(uid(me), deckId);
    }
}
