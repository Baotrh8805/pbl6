package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.dto.extraction.ExtractionItemResponse;
import com.pbl6.flashcard.dto.extraction.ExtractionRequests.ItemPatch;
import com.pbl6.flashcard.dto.learningpath.LearningPathRequests;
import com.pbl6.flashcard.dto.learningpath.LearningPathResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import com.pbl6.flashcard.security.CustomUserDetails;
import com.pbl6.flashcard.service.LearningPathService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.UUID;

/** Lộ trình học tập: tài liệu + số ngày -> chương -> bộ thẻ -> lịch học theo ngày. */
@RestController
@RequestMapping("/api/learning-paths")
@Validated
public class LearningPathController {

    private final LearningPathService service;

    public LearningPathController(LearningPathService service) {
        this.service = service;
    }

    private static Long uid(CustomUserDetails me) {
        return me.getUser().getId();
    }

    /** multipart: file HOẶC text, days (1–365), title?, startDate? (ISO), options? (JSON). 202: đang bóc tách. */
    @PostMapping(consumes = "multipart/form-data")
    public ResponseEntity<LearningPathResponse> create(@AuthenticationPrincipal CustomUserDetails me,
                                                       @RequestPart(value = "file", required = false) MultipartFile file,
                                                       @RequestPart(value = "text", required = false) String text,
                                                       @RequestPart("days") String days,
                                                       @RequestPart(value = "title", required = false) String title,
                                                       @RequestPart(value = "startDate", required = false) String startDate,
                                                       @RequestPart(value = "options", required = false) String options) {
        int totalDays;
        try {
            totalDays = Integer.parseInt(days.trim());
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Số ngày học không hợp lệ.");
        }
        LocalDate start = null;
        if (startDate != null && !startDate.isBlank()) {
            try {
                start = LocalDate.parse(startDate.trim());
            } catch (DateTimeParseException e) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ngày bắt đầu không hợp lệ.");
            }
        }
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
                .body(service.create(me.getUser(), data, filename, text, totalDays, title, start, options));
    }

    @GetMapping
    public List<LearningPathResponse> list(@AuthenticationPrincipal CustomUserDetails me,
                                           @RequestParam(required = false)
                                           @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return service.list(uid(me), service.today(date));
    }

    @GetMapping("/{id}")
    public LearningPathResponse get(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id,
                                    @RequestParam(required = false)
                                    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return service.get(uid(me), id, service.today(date));
    }

    /** {title?, totalDays?, startDate?}: DRAFT hoặc ACTIVE (đổi số ngày -> chia lại dải). */
    @PatchMapping("/{id}")
    public LearningPathResponse patch(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id,
                                      @Valid @RequestBody LearningPathRequests.Patch req) {
        return service.patch(uid(me), id, req);
    }

    @PatchMapping("/{id}/chapters/{cid}")
    public LearningPathResponse patchChapter(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id,
                                             @PathVariable UUID cid,
                                             @Valid @RequestBody LearningPathRequests.ChapterPatch req) {
        return service.patchChapter(uid(me), id, cid, req);
    }

    @PostMapping("/{id}/chapters/{cid}/merge-up")
    public LearningPathResponse mergeUp(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id,
                                        @PathVariable UUID cid) {
        return service.mergeUp(uid(me), id, cid);
    }

    @PatchMapping("/{id}/items")
    public List<ExtractionItemResponse> patchItems(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id,
                                                   @RequestBody @Size(max = 1000) List<@Valid ItemPatch> patches) {
        return service.patchItems(uid(me), id, patches);
    }

    @GetMapping("/{id}/chapters/{cid}/items")
    public List<ExtractionItemResponse> chapterItems(@AuthenticationPrincipal CustomUserDetails me,
                                                     @PathVariable UUID id, @PathVariable UUID cid) {
        return service.chapterItems(uid(me), id, cid);
    }

    /** {startDate?, totalDays?}. 201: thư mục + bộ thẻ mỗi chương đã tạo, lộ trình ACTIVE. */
    @PostMapping("/{id}/activate")
    public ResponseEntity<LearningPathResponse> activate(@AuthenticationPrincipal CustomUserDetails me,
                                                         @PathVariable UUID id,
                                                         @Valid @RequestBody(required = false) LearningPathRequests.Activate req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.activate(uid(me), id, req));
    }

    /** Xoá kế hoạch + job bóc tách ẩn; thư mục / bộ thẻ / lịch ôn giữ nguyên. */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id) {
        service.delete(uid(me), id);
        return ResponseEntity.noContent().build();
    }
}
