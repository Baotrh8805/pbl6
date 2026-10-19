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

    public DeckController(DeckService deckService) {
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
        return deckService.generateDistractors(uid(me), deckId);
    }
}
