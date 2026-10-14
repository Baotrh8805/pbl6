package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.dto.deck.DeckResponse;
import com.pbl6.flashcard.dto.extraction.ExtractionItemResponse;
import com.pbl6.flashcard.dto.extraction.ExtractionJobResponse;
import com.pbl6.flashcard.dto.extraction.ExtractionRequests.CreateDecks;
import com.pbl6.flashcard.dto.extraction.ExtractionRequests.ItemPatch;
import com.pbl6.flashcard.dto.extraction.ExtractionRequests.TextUpdate;
import com.pbl6.flashcard.security.CustomUserDetails;
import com.pbl6.flashcard.service.ExtractionService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

/** Bóc tách tài liệu tiếng Nhật -> duyệt từ vựng/ngữ pháp -> tạo bộ thẻ. Xem docs/EXTRACTION.md. */
@RestController
@RequestMapping("/api/extractions")
@Validated
public class ExtractionController {

    private final ExtractionService service;

    public ExtractionController(ExtractionService service) {
        this.service = service;
    }

    private static Long uid(CustomUserDetails me) {
        return me.getUser().getId();
    }

    /** multipart: file HOẶC text, kèm options (chuỗi JSON, tuỳ chọn). 202: job đã xếp hàng, client poll GET /{id}. */
    @PostMapping(consumes = "multipart/form-data")
    public ResponseEntity<ExtractionJobResponse> create(@AuthenticationPrincipal CustomUserDetails me,
                                                        @RequestPart(value = "file", required = false) MultipartFile file,
                                                        @RequestPart(value = "text", required = false) String text,
                                                        @RequestPart(value = "options", required = false) String options) {
        byte[] data = null;
        String filename = null;
        if (file != null && !file.isEmpty()) {
            try {
                data = file.getBytes();
            } catch (IOException e) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Không đọc được file tải lên.");
            }
            filename = file.getOriginalFilename();
        }
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(service.create(me.getUser(), data, filename, text, options));
    }

    @GetMapping
    public List<ExtractionJobResponse> list(@AuthenticationPrincipal CustomUserDetails me) {
        return service.list(uid(me));
    }

    @GetMapping("/{id}")
    public ExtractionJobResponse get(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id,
                                     @RequestParam(defaultValue = "false") boolean includeText) {
        return service.get(uid(me), id, includeText);
    }

    @PutMapping("/{id}/text")
    public ResponseEntity<ExtractionJobResponse> updateText(@AuthenticationPrincipal CustomUserDetails me,
                                                            @PathVariable UUID id, @Valid @RequestBody TextUpdate body) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(service.updateText(uid(me), id, body.text()));
    }

    @PostMapping("/{id}/rerun")
    public ResponseEntity<ExtractionJobResponse> rerun(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(service.rerun(uid(me), id));
    }

    /** Chạy lại riêng bước dịch nghĩa VN khi Gemini hết quota / lỗi (không phân tích lại, không tính hạn mức ngày). */
    @PostMapping("/{id}/enrich")
    public ResponseEntity<ExtractionJobResponse> reEnrich(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(service.reEnrich(uid(me), id));
    }

    @GetMapping("/{id}/items")
    public List<ExtractionItemResponse> items(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id,
                                              @RequestParam(required = false) @Pattern(regexp = "vocab|grammar") String kind,
                                              @RequestParam(required = false) @Pattern(regexp = "N[1-5]|unknown") String level,
                                              @RequestParam(required = false) Boolean selected) {
        return service.items(uid(me), id, kind, level, selected);
    }

    @PatchMapping("/{id}/items")
    public List<ExtractionItemResponse> patchItems(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id,
                                                   @RequestBody @Size(max = 1000) List<@Valid ItemPatch> patches) {
        return service.patchItems(uid(me), id, patches);
    }

    @PostMapping("/{id}/decks")
    public ResponseEntity<List<DeckResponse>> createDecks(@AuthenticationPrincipal CustomUserDetails me,
                                                          @PathVariable UUID id, @Valid @RequestBody CreateDecks body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.createDecks(uid(me), id, body));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id) {
        service.delete(uid(me), id);
        return ResponseEntity.noContent().build();
    }
}
