package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.dto.admin.AdminPage;
import com.pbl6.flashcard.dto.moderation.ModerationDtos;
import com.pbl6.flashcard.security.CustomUserDetails;
import com.pbl6.flashcard.service.moderation.AdminModerationService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.core.annotation.AuthenticationPrincipal;

/**
 * Kiểm duyệt AI (spec 2026-10-27 đêm §6.3), ROLE_ADMIN (SecurityConfig: /api/admin/**). kind = comment (bình luận từ điển) |
 * rating (bình luận đánh giá bộ thẻ).
 */
@RestController
@RequestMapping("/api/admin")
public class AdminModerationController {

    private final AdminModerationService service;

    public AdminModerationController(AdminModerationService service) {
        this.service = service;
    }

    /** status: OPEN (mặc định = FLAGGED + BLOCKED) | FLAGGED | BLOCKED | PENDING | REVIEWED | CLEAN | ALL; kind: comment | rating | ALL. */
    @GetMapping("/moderation")
    public AdminPage<ModerationDtos.QueueItem> queue(@RequestParam(required = false) String status,
                                                     @RequestParam(required = false) String kind,
                                                     @RequestParam(required = false) String q,
                                                     @RequestParam(defaultValue = "0") int page,
                                                     @RequestParam(defaultValue = "20") int size) {
        return service.queue(status, kind, q, page, size);
    }

    @GetMapping("/moderation/counts")
    public ModerationDtos.Counts counts() {
        return service.counts();
    }

    @PostMapping("/moderation/{kind}/{id}/ignore")
    public ModerationDtos.QueueItem ignore(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String kind, @PathVariable long id) {
        return service.ignore(me.getUser(), kind, id);
    }

    @PostMapping("/moderation/{kind}/{id}/restore")
    public ModerationDtos.QueueItem restore(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String kind, @PathVariable long id) {
        return service.restore(me.getUser(), kind, id);
    }

    @PostMapping("/moderation/{kind}/{id}/hide")
    public ModerationDtos.QueueItem hide(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String kind, @PathVariable long id,
                                         @RequestBody(required = false) @Valid ModerationDtos.NoteRequest body) {
        return service.hide(me.getUser(), kind, id, body == null ? null : body.note());
    }

    @DeleteMapping("/moderation/{kind}/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String kind, @PathVariable long id) {
        service.delete(me.getUser(), kind, id);
    }

    @PostMapping("/moderation/rescan")
    public ModerationDtos.RescanResponse rescan(@AuthenticationPrincipal CustomUserDetails me) {
        return service.rescan(me.getUser());
    }

    @GetMapping("/dictionary/entries/{key}/sensitive")
    public ModerationDtos.Sensitive sensitive(@PathVariable String key) {
        return service.sensitive(key);
    }

    @PutMapping("/dictionary/entries/{key}/sensitive")
    public ModerationDtos.Sensitive setSensitive(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String key,
                                                 @Valid @RequestBody ModerationDtos.SensitiveRequest body) {
        return service.setSensitive(me.getUser(), key, body.sensitive(), body.note());
    }
}
