package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.dto.insights.FrictionResponse;
import com.pbl6.flashcard.dto.insights.NextItem;
import com.pbl6.flashcard.dto.insights.WeaknessResponse;
import com.pbl6.flashcard.security.CustomUserDetails;
import com.pbl6.flashcard.service.InsightService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

/**
 * Insights của người học (spec §4.2, USER): điểm yếu (F1), thẻ phản xạ chậm (F4), "học gì tiếp" (F3). Chỉ đọc; lộ trình bổ khuyết
 * tạo ở POST /api/learning-paths/remedial.
 */
@RestController
@RequestMapping("/api/insights")
@Validated
public class InsightController {

    private final InsightService service;

    public InsightController(InsightService service) {
        this.service = service;
    }

    private static Long uid(CustomUserDetails me) {
        return me.getUser().getId();
    }

    /** ?days= cửa sổ (1–365, mặc định 30) cho "ma sát" và "sai quiz"; "hay quên" theo lần again luôn xét tối đa 14 ngày. */
    @GetMapping("/weaknesses")
    public WeaknessResponse weaknesses(@AuthenticationPrincipal CustomUserDetails me,
                                       @RequestParam(defaultValue = "30") @Min(1) @Max(365) int days) {
        return service.weaknesses(uid(me), days);
    }

    @GetMapping("/friction")
    public FrictionResponse friction(@AuthenticationPrincipal CustomUserDetails me) {
        return service.friction(uid(me));
    }

    /** ?date= ngày của máy khách (như /api/learning-paths) để "hôm nay" của lộ trình đúng múi giờ người dùng. */
    @GetMapping("/next")
    public List<NextItem> next(@AuthenticationPrincipal CustomUserDetails me,
                               @RequestParam(required = false)
                               @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return service.next(uid(me), service.today(date));
    }
}
