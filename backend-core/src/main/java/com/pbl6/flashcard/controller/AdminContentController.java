package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.dto.admin.*;
import com.pbl6.flashcard.dto.admin.AdminDeckResponse.Detail;
import com.pbl6.flashcard.dto.admin.AdminDeckResponse.Row;
import com.pbl6.flashcard.security.CustomUserDetails;
import com.pbl6.flashcard.service.AdminContentService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/** Admin Panel > Nội dung. Đọc: mọi staff; ghi: ADMIN. */
@RestController
@RequestMapping("/api/admin")
@Validated
public class AdminContentController {

    private final AdminContentService service;

    public AdminContentController(AdminContentService service) {
        this.service = service;
    }

    @GetMapping("/decks")
    public AdminPage<Row> decks(@RequestParam(required = false) @Size(max = 100) String q,
                                @RequestParam(required = false) @Pattern(regexp = "private|public") String visibility,
                                @RequestParam(required = false) Boolean official,
                                @RequestParam(required = false) Boolean featured,
                                @RequestParam(required = false) Long ownerId,
                                @RequestParam(defaultValue = "0") @Min(0) int page,
                                @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return service.listDecks(q, visibility, official, featured, ownerId, page, size);
    }

    @GetMapping("/decks/{id}")
    public Detail deck(@PathVariable String id) {
        return service.deck(id);
    }

    @PostMapping("/decks/{id}/unpublish")
    @PreAuthorize("hasRole('ADMIN')")
    public Detail unpublish(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String id) {
        service.unpublish(me.getUser(), id);
        return service.deck(id);
    }

    @PatchMapping("/decks/{id}/flags")
    @PreAuthorize("hasRole('ADMIN')")
    public Row flags(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String id,
                     @Valid @RequestBody DeckFlagsRequest body) {
        return service.setFlags(me.getUser(), id, body);
    }

    @DeleteMapping("/decks/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> deleteDeck(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String id) {
        service.deleteDeck(me.getUser(), id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/ratings")
    public AdminPage<AdminRatingResponse> ratings(@RequestParam(required = false) @Size(max = 255) String deckId,
                                                  @RequestParam(required = false) @Size(max = 100) String q,
                                                  @RequestParam(defaultValue = "0") @Min(0) int page,
                                                  @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return service.listRatings(deckId, q, page, size);
    }

    @DeleteMapping("/ratings/{id}/comment")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> clearComment(@AuthenticationPrincipal CustomUserDetails me, @PathVariable Long id) {
        service.clearComment(me.getUser(), id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/extractions")
    public AdminPage<AdminExtractionResponse> extractions(
            @RequestParam(required = false) @Pattern(regexp = "QUEUED|RUNNING|DONE|FAILED|CANCELLED") String status,
            @RequestParam(required = false) Long userId,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return service.listExtractions(status, userId, page, size);
    }

    @DeleteMapping("/extractions/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> deleteExtraction(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id) {
        service.deleteExtraction(me.getUser(), id);
        return ResponseEntity.noContent().build();
    }
}
