package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.dto.nlp.NlpRequests;
import com.pbl6.flashcard.service.NlpService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Tra cứu chữ Hán cho người học (USER, như mọi API học tập): proxy sang ai-service, trả nguyên JSON của ai-service (xem
 * ai-service/app/api/kanji_info_router.py, radical_router.py). Tham số kiểm ở {@link NlpService}; ai-service không chạy -> 503.
 * POST chỉ là truy vấn theo lô (không tạo gì) nên trả 200.
 */
@RestController
@RequestMapping("/api/nlp")
public class NlpController {

    private final NlpService service;

    public NlpController(NlpService service) {
        this.service = service;
    }

    /** ?reading= âm Hán-Việt (có / không dấu, ≤ 32 ký tự), level N5..N1 (tuỳ chọn), limit 1..100 (mặc định 30). */
    @GetMapping("/han-viet-graph")
    public JsonNode hanVietGraph(@RequestParam(required = false) String reading,
                                 @RequestParam(required = false) String level,
                                 @RequestParam(required = false) Integer limit) {
        return service.hanVietGraph(reading, level, limit);
    }

    /** ?q= tiền tố âm (≤ 32 ký tự), limit 1..50 (mặc định 10). */
    @GetMapping("/han-viet-suggest")
    public JsonNode hanVietSuggest(@RequestParam(required = false) String q,
                                   @RequestParam(required = false) Integer limit) {
        return service.hanVietSuggest(q, limit);
    }

    /** Sơ đồ chữ Hán (spec 2026-10-30): ?q= chữ Hán hoặc âm Hán-Việt (≤ 32 ký tự), mode structure | compounds | word (trống = tự chọn), k = chữ chọn trong từ. */
    @GetMapping("/kanji-diagram")
    public JsonNode kanjiDiagram(@RequestParam(required = false) String q, @RequestParam(required = false) String mode,
                                 @RequestParam(required = false) String k) {
        return service.kanjiDiagram(q, mode, k);
    }

    /** {kanji: [≤ 200 chữ], userLevel?: N5..N1}. */
    @PostMapping("/kanji-cards")
    public JsonNode kanjiCards(@Valid @RequestBody NlpRequests.KanjiCards body) {
        return service.kanjiCards(body.kanji(), body.userLevel());
    }

    @GetMapping("/radicals")
    public JsonNode radicals() {
        return service.radicals();
    }

    /** no 1..214; ?levels=N5,N4 hoặc lặp ?levels=N5&levels=N4; rỗng = mọi cấp. */
    @GetMapping("/radicals/{no}/kanji")
    public JsonNode radicalKanji(@PathVariable int no, @RequestParam(required = false) List<String> levels) {
        return service.radicalKanji(no, levels);
    }

    /**
     * {kanji: [≤ 200 chữ], withMnemonic}: withMnemonic bị bỏ qua; mnemonicVi = mẹo đã duyệt (mnemonicSource "approved") hoặc
     * câu mẫu ("template"), xem NlpService#radicalCards.
     */
    @PostMapping("/radicals/cards")
    public JsonNode radicalCards(@Valid @RequestBody NlpRequests.RadicalCards body) {
        return service.radicalCards(body.kanji());
    }
}
