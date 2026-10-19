package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.dto.admin.AdminPage;
import com.pbl6.flashcard.dto.mnemonic.MnemonicDtos;
import com.pbl6.flashcard.security.CustomUserDetails;
import com.pbl6.flashcard.service.MnemonicService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * Admin Panel > Mẹo nhớ (G2, ADMIN trở lên): duyệt / từ chối / sửa mẹo PENDING. Duyệt mẹo mới tự hạ mẹo đã duyệt cũ của chữ;
 * mỗi thao tác ghi một dòng audit (target MNEMONIC) và báo tác giả (MNEMONIC_REVIEWED); mẹo không còn PENDING -> 409.
 */
@RestController
@RequestMapping("/api/admin/mnemonics")
@Validated
public class AdminMnemonicController {

    private final MnemonicService service;

    public AdminMnemonicController(MnemonicService service) {
        this.service = service;
    }

    /** q khớp chữ, nội dung mẹo hoặc email tác giả. */
    @GetMapping
    public AdminPage<MnemonicDtos.AdminItem> list(
            @RequestParam(defaultValue = "PENDING") @Pattern(regexp = "PENDING|APPROVED|REJECTED") String status,
            @RequestParam(required = false) @Size(max = 100) String q,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return service.list(status, q, page, size);
    }

    @PatchMapping("/{id}")
    public MnemonicDtos.AdminItem edit(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id,
                                       @Valid @RequestBody MnemonicDtos.EditRequest body) {
        return service.edit(me.getUser(), id, body.mnemonicVi());
    }

    /** Body {note?} tuỳ chọn (có thể bỏ trống hẳn). */
    @PostMapping("/{id}/approve")
    public MnemonicDtos.AdminItem approve(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id,
                                          @Valid @RequestBody(required = false) MnemonicDtos.ReviewRequest body) {
        return service.approve(me.getUser(), id, body == null ? null : body.note());
    }

    /** {note} bắt buộc (400 khi thiếu / rỗng): người học cần biết vì sao mẹo bị từ chối. */
    @PostMapping("/{id}/reject")
    public MnemonicDtos.AdminItem reject(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id,
                                         @Valid @RequestBody(required = false) MnemonicDtos.ReviewRequest body) {
        return service.reject(me.getUser(), id, body == null ? null : body.note());
    }
}
