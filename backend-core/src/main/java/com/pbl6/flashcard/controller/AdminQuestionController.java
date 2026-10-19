package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.dto.admin.AdminPage;
import com.pbl6.flashcard.dto.admin.AdminQuestionDtos.Detail;
import com.pbl6.flashcard.dto.admin.AdminQuestionDtos.Flag;
import com.pbl6.flashcard.dto.admin.AdminQuestionDtos.Patch;
import com.pbl6.flashcard.dto.admin.AdminQuestionDtos.ResolveFlagRequest;
import com.pbl6.flashcard.dto.admin.AdminQuestionDtos.Row;
import com.pbl6.flashcard.security.CustomUserDetails;
import com.pbl6.flashcard.service.QuestionBankService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/** Admin Panel > Ngân hàng câu hỏi (G3, hợp đồng đợt 2 §1.3; ADMIN trở lên). Mọi thao tác ghi có một dòng audit (target QUESTION). */
@RestController
@RequestMapping("/api/admin")
@Validated
public class AdminQuestionController {

    private final QuestionBankService service;

    public AdminQuestionController(QuestionBankService service) {
        this.service = service;
    }

    /** flagged = true: chỉ câu đang có báo lỗi OPEN, nhiều báo lỗi nhất trước. Tham số vắng = không lọc. */
    @GetMapping("/questions")
    public AdminPage<Row> list(@RequestParam(required = false) @Size(max = 255) String deckId,
                               @RequestParam(required = false)
                               @Pattern(regexp = "MEANING|READING|KANJI_LOOKALIKE|HOMOPHONE|CONJUGATION") String kind,
                               @RequestParam(defaultValue = "false") boolean flagged,
                               @RequestParam(required = false) @Pattern(regexp = "ACTIVE|HIDDEN") String status,
                               @RequestParam(required = false) @Size(max = 100) String q,
                               @RequestParam(defaultValue = "0") @Min(0) int page,
                               @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return service.list(deckId, kind, flagged, status, q, page, size);
    }

    @GetMapping("/questions/{id}")
    public Detail detail(@PathVariable UUID id) {
        return service.detail(id);
    }

    /** Sửa prompt / options / correct (trường vắng = giữ nguyên); correct ∈ options khi options không rỗng. Audit QUESTION_EDIT. */
    @PatchMapping("/questions/{id}")
    public Detail patch(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id,
                        @Valid @RequestBody Patch body) {
        return service.patch(me.getUser(), id, body);
    }

    /** Ẩn câu khỏi mọi lượt làm mới (audit QUESTION_HIDE). */
    @PostMapping("/questions/{id}/hide")
    public Detail hide(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id) {
        return service.setHidden(me.getUser(), id, true);
    }

    @PostMapping("/questions/{id}/unhide")
    public Detail unhide(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id) {
        return service.setHidden(me.getUser(), id, false);
    }

    /** Đóng một báo lỗi (audit QUESTION_FLAG_RESOLVE); 409 khi báo lỗi không còn OPEN. Body tuỳ chọn {note}. */
    @PostMapping("/question-flags/{id}/resolve")
    public Flag resolve(@AuthenticationPrincipal CustomUserDetails me, @PathVariable Long id,
                        @Valid @RequestBody(required = false) ResolveFlagRequest body) {
        return service.resolve(me.getUser(), id, body == null ? null : body.note());
    }
}
