package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.dto.practice.PracticeDtos.KanjiScoreRequest;
import com.pbl6.flashcard.dto.practice.PracticeDtos.LogEntry;
import com.pbl6.flashcard.dto.practice.PracticeDtos.PitchScoreRequest;
import com.pbl6.flashcard.dto.practice.PracticeDtos.PronunciationRequest;
import com.pbl6.flashcard.dto.practice.PracticeDtos.StatsResponse;
import com.pbl6.flashcard.security.CustomUserDetails;
import com.pbl6.flashcard.service.PracticeService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Luyện tập (hợp đồng đợt 2 §2, USER như mọi API học tập — staff 403 ở SecurityConfig): viết Kanji, trọng âm, phát âm, thống kê.
 * Các route chấm điểm trả nguyên JSON của ai-service (xem kanji_dtw_router.py, audio_praat_router.py) và ghi một dòng
 * practice_logs; ai-service không chạy → 503, chưa có dữ liệu cho chữ / từ → 404.
 */
@RestController
@RequestMapping("/api/practice")
@Validated // để @Min/@Max trên ?days= thực sự chạy
public class PracticeController {

    private final PracticeService service;

    public PracticeController(PracticeService service) {
        this.service = service;
    }

    private static Long uid(CustomUserDetails me) {
        return me.getUser().getId();
    }

    /** {kanji, strokeCount, strokes:[[[x,y]…]…]} — nét chuẩn KanjiVG trong hộp 0..1, theo thứ tự viết. */
    @GetMapping("/kanji/{ch}/strokes")
    public JsonNode strokes(@PathVariable String ch) {
        return service.strokes(ch);
    }

    /** {kanji, cardId?, strokes:[[{x,y,t?}]]} (≤ 40 nét, ≤ 500 điểm/nét); ghi log write. */
    @PostMapping("/kanji/score")
    public JsonNode scoreKanji(@AuthenticationPrincipal CustomUserDetails me, @Valid @RequestBody KanjiScoreRequest body) {
        return service.scoreKanji(uid(me), body);
    }

    /** ?word=&reading= (≤ 64 ký tự) → {word, reading, accentType, moras:[{mora, level:"H"|"L"}]}. */
    @GetMapping("/pitch/reference")
    public JsonNode pitchReference(@RequestParam(required = false) String word,
                                   @RequestParam(required = false) String reading) {
        return service.pitchReference(word, reading);
    }

    /** {cardId?, word, reading, accentType?, contour:[{t, f0|null}]} (≤ 2000 điểm); ghi log pitch. */
    @PostMapping("/pitch/score")
    public JsonNode scorePitch(@AuthenticationPrincipal CustomUserDetails me, @Valid @RequestBody PitchScoreRequest body) {
        return service.scorePitch(uid(me), body);
    }

    /** {cardId?, term, target, transcript, score} — điểm trình duyệt tự chấm; 201 + dòng nhật ký vừa ghi. */
    @PostMapping("/pronunciation")
    @ResponseStatus(HttpStatus.CREATED)
    public LogEntry pronunciation(@AuthenticationPrincipal CustomUserDetails me,
                                  @Valid @RequestBody PronunciationRequest body) {
        return service.pronunciation(uid(me), body);
    }

    /** ?days= cửa sổ 1–365 (mặc định 30). */
    @GetMapping("/stats")
    public StatsResponse stats(@AuthenticationPrincipal CustomUserDetails me,
                               @RequestParam(defaultValue = "30") @Min(1) @Max(365) int days) {
        return service.stats(uid(me), days);
    }
}
