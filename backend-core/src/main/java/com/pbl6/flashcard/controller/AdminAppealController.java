package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.dto.admin.AdminPage;
import com.pbl6.flashcard.dto.admin.AppealResolveRequest;
import com.pbl6.flashcard.dto.admin.AppealResponse;
import com.pbl6.flashcard.dto.admin.DismissRequest;
import com.pbl6.flashcard.security.CustomUserDetails;
import com.pbl6.flashcard.service.AppealService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

/** Admin Panel > Khiếu nại tài khoản (ADMIN trở lên; hợp đồng API đợt 2 §6). Gửi khiếu nại: POST /api/auth/appeals. */
@RestController
@RequestMapping("/api/admin/appeals")
@Validated
public class AdminAppealController {

    private final AppealService service;

    public AdminAppealController(AppealService service) {
        this.service = service;
    }

    @GetMapping
    public AdminPage<AppealResponse> list(@RequestParam(defaultValue = "OPEN") @Pattern(regexp = "OPEN|RESOLVED|DISMISSED") String status,
                                          @RequestParam(defaultValue = "0") @Min(0) int page,
                                          @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return service.list(status, page, size);
    }

    @PostMapping("/{id}/resolve")
    public AppealResponse resolve(@AuthenticationPrincipal CustomUserDetails me, @PathVariable Long id,
                                  @Valid @RequestBody AppealResolveRequest body) {
        return service.resolve(me.getUser(), id, body);
    }

    /** Body tuỳ chọn ({note?}): không gửi body cũng được. */
    @PostMapping("/{id}/dismiss")
    public AppealResponse dismiss(@AuthenticationPrincipal CustomUserDetails me, @PathVariable Long id,
                                  @Valid @RequestBody(required = false) DismissRequest body) {
        return service.dismiss(me.getUser(), id, body == null ? null : body.note());
    }
}
