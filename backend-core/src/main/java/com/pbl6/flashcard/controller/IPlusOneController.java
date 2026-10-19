package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.dto.extraction.ExtractionItemResponse;
import com.pbl6.flashcard.dto.extraction.IPlusOneDtos;
import com.pbl6.flashcard.security.CustomUserDetails;
import com.pbl6.flashcard.service.IPlusOneService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Câu ví dụ i+1 (C6, hợp đồng đợt 2 §9) trên văn bản của một lượt bóc tách. Controller riêng để không cùng sửa ExtractionController
 * với các làn khác; chỉ chủ lượt bóc tách (người khác 404), USER như mọi API học tập.
 */
@RestController
@RequestMapping("/api/extractions/{id}/i-plus-one")
@Validated
public class IPlusOneController {

    private final IPlusOneService service;

    public IPlusOneController(IPlusOneService service) {
        this.service = service;
    }

    /** Câu i+1 xếp theo điểm giảm dần; 409 khi lượt không còn văn bản tài liệu; ai-service tắt -> 503. */
    @GetMapping
    public IPlusOneDtos.Response find(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id,
                                      @RequestParam(defaultValue = "true") boolean assumeLevelKnown,
                                      @RequestParam(defaultValue = "50") @Min(1) @Max(200) int limit) {
        return service.find(me.getUser(), id, assumeLevelKnown, limit);
    }

    /** {itemId, sentence}: câu (nằm trong văn bản của lượt) thành example của item; trả item đã cập nhật. */
    @PostMapping("/apply")
    public ExtractionItemResponse apply(@AuthenticationPrincipal CustomUserDetails me, @PathVariable UUID id,
                                        @Valid @RequestBody IPlusOneDtos.ApplyRequest body) {
        return service.apply(me.getUser().getId(), id, body.itemId(), body.sentence());
    }
}
