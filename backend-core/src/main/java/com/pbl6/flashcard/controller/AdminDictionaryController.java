package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.pbl6.flashcard.dto.admin.AdminPage;
import com.pbl6.flashcard.dto.dictionary.DictDtos;
import com.pbl6.flashcard.security.CustomUserDetails;
import com.pbl6.flashcard.service.dictionary.AdminDictionaryService;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.ZoneId;

/**
 * Quản lý từ điển gốc (spec 2026-10-26 §8.3). /api/admin/** cần ROLE_ADMIN (SUPER_ADMIN qua RoleHierarchy); cả hai bậc sửa trực
 * tiếp (D21). Mọi thao tác ghi có audit target DICTIONARY và dòng dict_edit_history (hoàn tác được).
 */
@RestController
@RequestMapping("/api/admin/dictionary")
@Validated
public class AdminDictionaryController {

    private static final ZoneId VN = ZoneId.of("Asia/Ho_Chi_Minh");
    private final AdminDictionaryService service;

    public AdminDictionaryController(AdminDictionaryService service) {
        this.service = service;
    }

    private static Long actor(CustomUserDetails me) {
        return me.getUser().getId();
    }

    /** group: pending (mặc định: reported + en_only + machine) | reported | en_only | machine | verified | all. */
    @GetMapping("/queue")
    public AdminPage<DictDtos.QueueRow> queue(@RequestParam(required = false) String group, @RequestParam(required = false) String level,
                                              @RequestParam(required = false) String kind, @RequestParam(required = false) String q,
                                              @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return service.queue(group, level, kind, q, page, size);
    }

    @GetMapping("/search")
    public ObjectNode search(@RequestParam String q, @RequestParam(defaultValue = "auto") String mode,
                             @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return service.search(q, mode, page, size);
    }

    @GetMapping("/entries/{key}")
    public ObjectNode entry(@PathVariable String key) {
        return service.entry(key);
    }

    @PutMapping("/entries/{key}/meaning-vi")
    public ObjectNode setMeaning(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String key,
                                 @Valid @RequestBody DictDtos.MeaningRequest body) {
        return service.setMeaning(actor(me), key, body.value(), body.reason(), null);
    }

    @PostMapping("/entries/{key}/verify")
    public ObjectNode verify(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String key) {
        return service.verify(actor(me), key);
    }

    @PostMapping("/entries/{key}/retranslate")
    public ObjectNode retranslate(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String key) {
        return service.retranslate(actor(me), key);
    }

    /** value rỗng / null = bỏ ghi đè (về dữ liệu gốc). */
    @PutMapping("/entries/{key}/overrides")
    public ObjectNode putOverride(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String key,
                                  @Valid @RequestBody DictDtos.OverrideRequest body) {
        return service.putOverride(actor(me), key, body, null);
    }

    @PutMapping("/entries/{key}/examples/{exampleId}/vi")
    public ObjectNode setExampleVi(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String key,
                                   @PathVariable String exampleId, @Valid @RequestBody DictDtos.ExampleViRequest body) {
        return service.setExampleVi(actor(me), key, exampleId, body.value(), body.reason(), null);
    }

    @PostMapping("/history/{id}/revert")
    public ObjectNode revert(@AuthenticationPrincipal CustomUserDetails me, @PathVariable long id) {
        return service.revert(actor(me), id);
    }

    @GetMapping("/history")
    public AdminPage<DictDtos.History> history(@RequestParam(required = false) Long actorId,
                                               @RequestParam(required = false) String field,
                                               @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                               @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                               @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "30") int size) {
        return service.history(actorId, field, from == null ? null : from.atStartOfDay(VN).toInstant(),
                to == null ? null : to.plusDays(1).atStartOfDay(VN).toInstant(), page, size);
    }

    // ------------------------------------------------------------ báo cáo (cũng hiện ở /admin/reports, tab Từ điển)

    @GetMapping("/reports")
    public AdminPage<DictDtos.Report> reports(@RequestParam(required = false) String kind,
                                              @RequestParam(defaultValue = "OPEN") String status,
                                              @RequestParam(required = false) String q,
                                              @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return service.reports(kind, "ALL".equals(status) ? null : status, q, page, size);
    }

    @PostMapping("/reports/{id}/apply")
    public ObjectNode apply(@AuthenticationPrincipal CustomUserDetails me, @PathVariable long id) {
        return service.applyReport(actor(me), id);
    }

    @PostMapping("/reports/{id}/resolve")
    public DictDtos.Report resolve(@AuthenticationPrincipal CustomUserDetails me, @PathVariable long id,
                                   @RequestParam(required = false) String action,
                                   @Valid @RequestBody(required = false) DictDtos.NoteRequest body) {
        return service.resolveReport(actor(me), id, body == null ? null : body.note(), action);
    }

    @PostMapping("/reports/{id}/dismiss")
    public DictDtos.Report dismiss(@AuthenticationPrincipal CustomUserDetails me, @PathVariable long id,
                                   @Valid @RequestBody DictDtos.RequiredNoteRequest body) {
        return service.dismissReport(actor(me), id, body.note());
    }

    // ------------------------------------------------------------ bình luận

    @GetMapping("/comments")
    public AdminPage<DictDtos.AdminComment> comments(@RequestParam(required = false) String q,
                                                     @RequestParam(required = false) Boolean hidden,
                                                     @RequestParam(required = false) String entryKey,
                                                     @RequestParam(defaultValue = "0") int page,
                                                     @RequestParam(defaultValue = "20") int size) {
        return service.comments(q, hidden, entryKey, page, size);
    }

    @PostMapping("/comments/{id}/hide")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void hide(@AuthenticationPrincipal CustomUserDetails me, @PathVariable long id,
                     @Valid @RequestBody DictDtos.RequiredNoteRequest body) {
        service.hideComment(actor(me), id, body.note());
    }

    @PostMapping("/comments/{id}/unhide")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unhide(@AuthenticationPrincipal CustomUserDetails me, @PathVariable long id) {
        service.unhideComment(actor(me), id);
    }

    @DeleteMapping("/comments/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteComment(@AuthenticationPrincipal CustomUserDetails me, @PathVariable long id) {
        service.deleteComment(actor(me), id);
    }

    // ------------------------------------------------------------ đồng bộ + thống kê

    @PostMapping("/sync-ai")
    public DictDtos.SyncResponse sync(@AuthenticationPrincipal CustomUserDetails me) {
        return service.sync(actor(me));
    }

    @GetMapping("/stats")
    public DictDtos.DictStats stats() {
        return service.stats();
    }
}
