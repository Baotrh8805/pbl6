package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.dto.admin.AdminPage;
import com.pbl6.flashcard.dto.deck.DeckRequest;
import com.pbl6.flashcard.dto.library.MyReportResponse;
import com.pbl6.flashcard.dto.library.DeckRatingsResponse;
import com.pbl6.flashcard.dto.library.LibraryDeckResponse;
import com.pbl6.flashcard.dto.library.RatingRequest;
import com.pbl6.flashcard.dto.library.ReportRequest;
import com.pbl6.flashcard.service.ReportService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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
    private final ReportService reportService;

    public LibraryController(LibraryService libraryService, ReportService reportService) {
        this.libraryService = libraryService;
        this.reportService = reportService;
    }

    /** Báo cáo bộ thẻ public vi phạm (UC-41): một báo cáo đang mở mỗi người mỗi bộ thẻ. */
    @PostMapping("/decks/{deckId}/reports")
    public ResponseEntity<java.util.Map<String, Object>> report(@AuthenticationPrincipal CustomUserDetails me,
                                                                @PathVariable String deckId,
                                                                @Valid @RequestBody ReportRequest req) {
        var r = reportService.create(me.getUser(), deckId, req);
        return ResponseEntity.status(HttpStatus.CREATED).body(java.util.Map.of("id", r.getId(), "status", r.getStatus()));
    }

    /** Báo cáo của chính người gọi; deckId + status=OPEN để biết nút "Báo cáo" đã thành "Đã báo cáo" chưa. */
    @GetMapping("/reports")
    public AdminPage<MyReportResponse> myReports(@AuthenticationPrincipal CustomUserDetails me,
                                                 @RequestParam(required = false) @Size(max = 255) String deckId,
                                                 @RequestParam(required = false) @Pattern(regexp = "OPEN|RESOLVED|DISMISSED") String status,
                                                 @RequestParam(defaultValue = "0") @Min(0) @Max(10_000) int page,
                                                 @RequestParam(defaultValue = "10") @Min(1) @Max(50) int size) {
        return reportService.mine(me.getUser(), deckId, status, page, size);
    }

    /** Rút lại báo cáo còn OPEN của chính mình: 404 không phải của mình, 409 đã được xử lý. */
    @DeleteMapping("/reports/{id}")
    public ResponseEntity<Void> withdrawReport(@AuthenticationPrincipal CustomUserDetails me, @PathVariable Long id) {
        reportService.withdraw(me.getUser(), id);
        return ResponseEntity.noContent().build();
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
        return libraryService.rate(me.getUser().getId(), deckId, req.stars(), req.comment());
    }

    @DeleteMapping("/decks/{deckId}/rating")
    public LibraryDeckResponse.Rating deleteRating(@AuthenticationPrincipal CustomUserDetails me,
                                                   @PathVariable String deckId) {
        return libraryService.deleteMyRating(me.getUser().getId(), deckId);
    }

    @GetMapping("/decks/{deckId}/ratings")
    public DeckRatingsResponse ratings(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String deckId,
                                       @RequestParam(defaultValue = "0") @Min(0) @Max(10_000) int page,
                                       @RequestParam(defaultValue = "10") @Min(1) @Max(50) int size) {
        return libraryService.ratings(me.getUser().getId(), deckId, page, size);
    }
}
