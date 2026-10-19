package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.dto.extraction.ExtractionJobResponse;
import com.pbl6.flashcard.dto.learningpath.LearningPathResponse;
import com.pbl6.flashcard.security.CustomUserDetails;
import com.pbl6.flashcard.service.ConflictService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.UUID;

/**
 * "Kiểm tra lại mâu thuẫn" (F2, hợp đồng đợt 2 §5) cho bóc tách thường và lộ trình học: chạy lại ai-service /extract/conflicts trên
 * item hiện tại với tham chiếu của nguồn tri thức chuẩn ACTIVE. Controller riêng (không thêm vào ExtractionController /
 * LearningPathController) để các làn đợt 2 không cùng sửa một tệp; USER như mọi API học tập.
 */
@RestController
@RequestMapping("/api")
public class ConflictController {

    private final ConflictService service;

    public ConflictController(ConflictService service) {
        this.service = service;
    }

    /** 200 job (stats.conflicts / conflictsByField mới); 404 job người khác; 409 job đang chạy hoặc thuộc lộ trình. */
    @PostMapping("/extractions/{id}/recheck-conflicts")
    public ExtractionJobResponse recheckExtraction(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id) {
        return service.recheckExtraction(me.getUser().getId(), id);
    }

    /** 200 lộ trình đầy đủ (?date= như mọi endpoint lộ trình); 409 khi đang xử lý / lộ trình bổ khuyết (không có tài liệu). */
    @PostMapping("/learning-paths/{id}/recheck-conflicts")
    public LearningPathResponse recheckPath(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id,
                                            @RequestParam(required = false)
                                            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return service.recheckPath(me.getUser().getId(), id, date);
    }
}
