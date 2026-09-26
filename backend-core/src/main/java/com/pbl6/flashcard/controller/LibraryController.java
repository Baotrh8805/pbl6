package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.dto.deck.DeckRequest;
import com.pbl6.flashcard.dto.library.LibraryDeckResponse;
import com.pbl6.flashcard.dto.library.RatingRequest;
import com.pbl6.flashcard.security.CustomUserDetails;
import com.pbl6.flashcard.service.LibraryService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

/** Thư viện cộng đồng (bộ thẻ public). Cần đăng nhập như mọi /api/**. */
@RestController
@RequestMapping("/api/library")
@Validated
public class LibraryController {

    private final LibraryService libraryService;

    public LibraryController(LibraryService libraryService) {
        this.libraryService = libraryService;
    }

    @GetMapping("/decks")
    public LibraryDeckResponse.Page list(
            @AuthenticationPrincipal CustomUserDetails me,
            @RequestParam(required = false) @Size(max = 100) String q,
            @RequestParam(required = false) @Pattern(regexp = "N[1-5]") String level,
            @RequestParam(required = false) @Pattern(regexp = DeckRequest.CATEGORIES) String category,
            @RequestParam(required = false) @Pattern(regexp = "all|popular|official|community") String tab,
            @RequestParam(required = false) @Pattern(regexp = "downloads|rating|cards") String sort,
            @RequestParam(defaultValue = "0") @Min(0) @Max(10_000) int page,
            @RequestParam(defaultValue = "12") @Min(1) @Max(50) int size) {
        return libraryService.list(me.getUser().getId(),
                new LibraryService.Query(q, level, category, tab, sort, page, size));
    }

    @PutMapping("/decks/{deckId}/rating")
    public LibraryDeckResponse.Rating rate(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String deckId,
                                           @Valid @RequestBody RatingRequest req) {
        return libraryService.rate(me.getUser().getId(), deckId, req.stars());
    }
}
