package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.dto.admin.AdminPage;
import com.pbl6.flashcard.dto.admin.DismissRequest;
import com.pbl6.flashcard.dto.admin.ReportResponse;
import com.pbl6.flashcard.dto.admin.ResolveRequest;
import com.pbl6.flashcard.security.CustomUserDetails;
import com.pbl6.flashcard.service.ReportService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

/** Admin Panel > Báo cáo (ADMIN trở lên). */
@RestController
@RequestMapping("/api/admin/reports")
@Validated
public class AdminReportController {

    private final ReportService service;

    public AdminReportController(ReportService service) {
        this.service = service;
    }

    @GetMapping
    public AdminPage<ReportResponse> list(@RequestParam(defaultValue = "OPEN") @Pattern(regexp = "OPEN|RESOLVED|DISMISSED") String status,
                                          @RequestParam(required = false) @Size(max = 255) String deckId,
                                          @RequestParam(defaultValue = "0") @Min(0) int page,
                                          @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return service.list(status, deckId, page, size);
    }

    @PostMapping("/{id}/resolve")
    public ReportResponse resolve(@AuthenticationPrincipal CustomUserDetails me, @PathVariable Long id,
                                  @Valid @RequestBody ResolveRequest body) {
        return service.resolve(me.getUser(), id, body);
    }

    @PostMapping("/{id}/dismiss")
    public ReportResponse dismiss(@AuthenticationPrincipal CustomUserDetails me, @PathVariable Long id,
                                  @Valid @RequestBody DismissRequest body) {
        return service.dismiss(me.getUser(), id, body);
    }
}
