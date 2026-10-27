package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.dto.admin.AdminPage;
import com.pbl6.flashcard.dto.admin.AdminUserPatch;
import com.pbl6.flashcard.dto.admin.AdminUserResponse.Detail;
import com.pbl6.flashcard.dto.admin.AdminUserResponse.Row;
import com.pbl6.flashcard.dto.admin.RoleRequest;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.security.CustomUserDetails;
import com.pbl6.flashcard.service.AdminUserService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

/** Admin Panel > Người dùng. ADMIN: đọc + khoá / premium / hạn mức / thu hồi phiên; SUPER_ADMIN: thêm đổi vai trò. */
@RestController
@RequestMapping("/api/admin/users")
@Validated
public class AdminUserController {

    private final AdminUserService service;

    public AdminUserController(AdminUserService service) {
        this.service = service;
    }

    @GetMapping
    public AdminPage<Row> list(@RequestParam(required = false) @Size(max = 100) String q,
                               @RequestParam(required = false) Role role,
                               @RequestParam(required = false) Boolean premium,
                               @RequestParam(required = false) Boolean locked,
                               @RequestParam(required = false) Boolean verified,
                               @RequestParam(defaultValue = "0") @Min(0) int page,
                               @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return service.list(q, role, premium, locked, verified, page, size);
    }

    @GetMapping("/{id}")
    public Detail detail(@PathVariable Long id) {
        return service.detail(id);
    }

    @PatchMapping("/{id}")
    public Detail patch(@AuthenticationPrincipal CustomUserDetails me, @PathVariable Long id,
                        @Valid @RequestBody AdminUserPatch body) {
        return service.patch(me.getUser(), id, body);
    }

    @PutMapping("/{id}/role")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public Detail changeRole(@AuthenticationPrincipal CustomUserDetails me, @PathVariable Long id,
                             @Valid @RequestBody RoleRequest body) {
        return service.changeRole(me.getUser(), id, body.role());
    }

    @PostMapping("/{id}/revoke-sessions")
    public ResponseEntity<Void> revokeSessions(@AuthenticationPrincipal CustomUserDetails me, @PathVariable Long id) {
        service.revokeSessions(me.getUser(), id);
        return ResponseEntity.noContent().build();
    }

    /** Hợp đồng API đợt 2 §3: trả chi tiết người dùng; audit USER_VERIFY_EMAIL. */
    @PostMapping("/{id}/verify-email")
    public Detail verifyEmail(@AuthenticationPrincipal CustomUserDetails me, @PathVariable Long id) {
        return service.verifyEmail(me.getUser(), id);
    }
}
