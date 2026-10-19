package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.dto.deck.QuizAttemptDtos.AttemptState;
import com.pbl6.flashcard.dto.extraction.ExtractionItemResponse;
import com.pbl6.flashcard.dto.extraction.ExtractionRequests.ItemPatch;
import com.pbl6.flashcard.dto.learningpath.LearningPathRequests;
import com.pbl6.flashcard.dto.learningpath.LearningPathResponse;
import com.pbl6.flashcard.dto.learningpath.SessionResponse;
import com.pbl6.flashcard.dto.learningpath.TodaySummaryResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import com.pbl6.flashcard.security.CustomUserDetails;
import com.pbl6.flashcard.service.InsightService;
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

/**
 * Lộ trình học tập: tài liệu + số ngày -> chương -> bộ thẻ -> lịch học theo thẻ. Mọi endpoint đọc / ghi nhận ?date=YYYY-MM-DD
 * (ngày của máy khách, LP-11) để "hôm nay" trong response đúng múi giờ người dùng; thiếu thì lấy theo app.learning-path.zone.
 */
@RestController
@RequestMapping("/api/learning-paths")
@Validated
public class LearningPathController {

    private final LearningPathService service;
    // Lộ trình bổ khuyết đi qua InsightService (tính thẻ yếu rồi gọi LearningPathService.remedial trong cùng giao dịch)
    private final InsightService insights;

    public LearningPathController(LearningPathService service, InsightService insights) {
        this.service = service;
        this.insights = insights;
    }

    private static Long uid(CustomUserDetails me) {
        return me.getUser().getId();
    }

    /**
     * multipart: file HOẶC text, days (1–365), title?, startDate? (ISO), options? (JSON), dailyCap? (5–200, mặc định theo cấu hình),
     * studyDays? (7 ký tự 0/1 cho T2..CN, mặc định cả tuần). 202: đang bóc tách.
     */
    @PostMapping(consumes = "multipart/form-data")
    public ResponseEntity<LearningPathResponse> create(@AuthenticationPrincipal CustomUserDetails me,
                                                       @RequestPart(value = "file", required = false) MultipartFile file,
                                                       @RequestPart(value = "text", required = false) String text,
                                                       @RequestPart("days") String days,
                                                       @RequestPart(value = "title", required = false) String title,
                                                       @RequestPart(value = "startDate", required = false) String startDate,
                                                       @RequestPart(value = "options", required = false) String options,
                                                       @RequestPart(value = "dailyCap", required = false) String dailyCap,
                                                       @RequestPart(value = "studyDays", required = false) String studyDays) {
        int totalDays;
        try {
            totalDays = Integer.parseInt(days.trim());
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Số ngày học không hợp lệ.");
        }
        Integer cap = null;
        if (dailyCap != null && !dailyCap.isBlank()) {
            try {
                cap = Integer.parseInt(dailyCap.trim());
            } catch (NumberFormatException e) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Trần thẻ mỗi ngày không hợp lệ.");
            }
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
                .body(service.create(me.getUser(), data, filename, text, totalDays, title, start, options, cap,
                        studyDays != null && !studyDays.isBlank() ? studyDays.trim() : null));
    }

    @GetMapping
    public List<LearningPathResponse> list(@AuthenticationPrincipal CustomUserDetails me,
                                           @RequestParam(required = false)
                                           @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return service.list(uid(me), service.today(date));
    }

    /** Tổng quan / sidebar: "hôm nay" của mọi lộ trình đang học, một truy vấn batch. */
    @GetMapping("/today-summary")
    public List<TodaySummaryResponse> todaySummary(@AuthenticationPrincipal CustomUserDetails me,
                                                   @RequestParam(required = false)
                                                   @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return service.todaySummary(uid(me), service.today(date));
    }

    @GetMapping("/{id}")
    public LearningPathResponse get(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id,
                                    @RequestParam(required = false)
                                    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return service.get(uid(me), id, service.today(date));
    }

    /** {title?, totalDays?, startDate?, dailyCap?, studyDays?, reminder?}: DRAFT hoặc ACTIVE (đổi khung lịch -> xếp lại thẻ chưa học). */
    @PatchMapping("/{id}")
    public LearningPathResponse patch(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id,
                                      @Valid @RequestBody LearningPathRequests.Patch req,
                                      @RequestParam(required = false)
                                      @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return service.patch(uid(me), id, req, service.today(date));
    }

    @PatchMapping("/{id}/chapters/{cid}")
    public LearningPathResponse patchChapter(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id,
                                             @PathVariable UUID cid,
                                             @Valid @RequestBody LearningPathRequests.ChapterPatch req,
                                             @RequestParam(required = false)
                                             @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return service.patchChapter(uid(me), id, cid, req, service.today(date));
    }

    @PostMapping("/{id}/chapters/{cid}/merge-up")
    public LearningPathResponse mergeUp(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id,
                                        @PathVariable UUID cid,
                                        @RequestParam(required = false)
                                        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return service.mergeUp(uid(me), id, cid, service.today(date));
    }

    /** ?date= được nhận cho đồng nhất với các endpoint ghi khác; response là danh sách item nên không phụ thuộc ngày. */
    @PatchMapping("/{id}/items")
    public List<ExtractionItemResponse> patchItems(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id,
                                                   @RequestBody @Size(max = 1000) List<@Valid ItemPatch> patches,
                                                   @RequestParam(required = false)
                                                   @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return service.patchItems(uid(me), id, patches);
    }

    @GetMapping("/{id}/chapters/{cid}/items")
    public List<ExtractionItemResponse> chapterItems(@AuthenticationPrincipal CustomUserDetails me,
                                                     @PathVariable UUID id, @PathVariable UUID cid) {
        return service.chapterItems(uid(me), id, cid);
    }

    /** {startDate?, totalDays?, dailyCap?, studyDays?}. 201: thư mục + bộ thẻ mỗi chương + lịch theo thẻ đã tạo, lộ trình ACTIVE. */
    @PostMapping("/{id}/activate")
    public ResponseEntity<LearningPathResponse> activate(@AuthenticationPrincipal CustomUserDetails me,
                                                         @PathVariable UUID id,
                                                         @Valid @RequestBody(required = false) LearningPathRequests.Activate req,
                                                         @RequestParam(required = false)
                                                         @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.activate(uid(me), id, req, service.today(date)));
    }

    /**
     * Lộ trình bổ khuyết từ điểm yếu (spec §3.8): {days 3..30, groupBy level|kind|kanji|deck, title?}. 201 lộ trình ACTIVE
     * (source_type remedial, không có job, không tốn lượt hạn mức) với thư mục "Bổ khuyết dd/MM/yyyy" + một bộ thẻ clone mỗi
     * nhóm; 409 khi chưa đủ 8 thẻ yếu (xem GET /api/insights/weaknesses.canRemedial).
     */
    @PostMapping("/remedial")
    public ResponseEntity<LearningPathResponse> remedial(@AuthenticationPrincipal CustomUserDetails me,
                                                         @Valid @RequestBody LearningPathRequests.Remedial req,
                                                         @RequestParam(required = false)
                                                         @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return ResponseEntity.status(HttpStatus.CREATED).body(insights.remedial(uid(me), req, service.today(date)));
    }

    /** Phiên học hợp nhất: kind=today|catchup|due|chapter (&chapterId=). 409 nếu lộ trình không ACTIVE. */
    @GetMapping("/{id}/session")
    public SessionResponse session(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id,
                                   @RequestParam(defaultValue = "today") String kind,
                                   @RequestParam(required = false) UUID chapterId,
                                   @RequestParam(required = false)
                                   @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return service.session(uid(me), id, kind, chapterId, service.today(date));
    }

    /** {extend:boolean}: cân lại lịch khi học trễ (xem LearningPathService.rebalance). 200 lộ trình đầy đủ; 409 nếu không ACTIVE. */
    @PostMapping("/{id}/rebalance")
    public LearningPathResponse rebalance(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id,
                                          @RequestBody(required = false) LearningPathRequests.Rebalance req,
                                          @RequestParam(required = false)
                                          @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return service.rebalance(uid(me), id, req, service.today(date));
    }

    /**
     * LP-6: lộ trình FAILED chạy lại từ bước ANALYZE trên văn bản đã trích (không OCR lại, KHÔNG tốn lượt hạn mức). 202 lộ trình
     * PROCESSING (client poll như lúc tạo); 400 nếu job không còn văn bản ("Hãy tạo lại"); 409 nếu không FAILED.
     */
    @PostMapping("/{id}/retry")
    public ResponseEntity<LearningPathResponse> retry(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id,
                                                      @RequestParam(required = false)
                                                      @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(service.retry(uid(me), id, service.today(date)));
    }

    /**
     * LP-6: dịch lại nghĩa tiếng Việt cho item của lộ trình (DRAFT / ACTIVE) qua bước ENRICH của worker; cách nhau ≥ 5 phút (429 như
     * bóc tách). 202 lộ trình đầy đủ, trạng thái lộ trình không đổi; 409 nếu PROCESSING / FAILED hoặc job đang chạy.
     */
    @PostMapping("/{id}/enrich")
    public ResponseEntity<LearningPathResponse> enrich(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id,
                                                       @RequestParam(required = false)
                                                       @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(service.enrich(uid(me), id, service.today(date)));
    }

    /**
     * Bài kiểm tra cuối chương: mở lượt quiz exam trên bộ thẻ của chương (min(10, số thẻ) câu; đang có lượt mở thì trả lại lượt
     * đó). Nộp đạt ≥ learning_path_quiz_pass_pct → chương "passed" (qua QuizSubmittedEvent). 409 nếu lộ trình không ACTIVE hoặc bộ
     * thẻ của chương đã bị xoá; 404 chương của lộ trình khác.
     */
    @PostMapping("/{id}/chapters/{cid}/quiz")
    public AttemptState chapterQuiz(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id,
                                    @PathVariable UUID cid) {
        return service.chapterQuiz(uid(me), id, cid);
    }

    /** Chốt hoàn thành: chỉ khi đã học hết thẻ của lộ trình (409 nếu chưa); gọi lại không đổi completedAt. 200 lộ trình đầy đủ. */
    @PostMapping("/{id}/complete")
    public LearningPathResponse complete(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id,
                                         @RequestParam(required = false)
                                         @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return service.complete(uid(me), id, service.today(date));
    }

    /** Xoá kế hoạch (chương + lịch thẻ); job bóc tách giữ ở CANCELLED (hạn mức); thư mục / bộ thẻ / lịch ôn giữ nguyên. 409 khi PROCESSING. */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id) {
        service.delete(uid(me), id);
        return ResponseEntity.noContent().build();
    }
}
