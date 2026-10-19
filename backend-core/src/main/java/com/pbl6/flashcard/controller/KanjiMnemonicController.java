package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.dto.mnemonic.MnemonicDtos;
import com.pbl6.flashcard.security.CustomUserDetails;
import com.pbl6.flashcard.service.MnemonicService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Mẹo nhớ chữ Hán cho người học (C4, hợp đồng đợt 2 §4; USER như mọi API học tập — staff 403 ở SecurityConfig). Mẹo sinh / tự viết
 * đều chờ admin duyệt (/api/admin/mnemonics) trước khi hiện trên thẻ bộ thủ.
 */
@RestController
@RequestMapping("/api/kanji")
@Validated
public class KanjiMnemonicController {

    private final MnemonicService service;

    public KanjiMnemonicController(MnemonicService service) {
        this.service = service;
    }

    /** {kanji, approved: {id, mnemonicVi, source} | null, mine: [...]}; ch phải là đúng một chữ Hán (400). */
    @GetMapping("/{ch}/mnemonics")
    public MnemonicDtos.KanjiMnemonicsResponse forKanji(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String ch) {
        return service.forKanji(me.getUser().getId(), ch);
    }

    /** {kanji: [≤ 30]} -> mẹo PENDING mới sinh (Gemini, dự phòng câu mẫu); ai-service tắt -> 503. Không tạo gì mới vẫn 200. */
    @PostMapping("/mnemonics/generate")
    public MnemonicDtos.GenerateResponse generate(@AuthenticationPrincipal CustomUserDetails me,
                                                  @Valid @RequestBody MnemonicDtos.GenerateRequest body) {
        return service.generate(me.getUser().getId(), body.kanji());
    }

    /** {kanji, mnemonicVi ≤ 300} -> 201 mẹo USER PENDING; 409 khi đã có 3 mẹo chờ duyệt của mình cho chữ này. */
    @PostMapping("/mnemonics")
    @ResponseStatus(HttpStatus.CREATED)
    public MnemonicDtos.Mine create(@AuthenticationPrincipal CustomUserDetails me,
                                    @Valid @RequestBody MnemonicDtos.CreateRequest body) {
        return service.create(me.getUser().getId(), body.kanji(), body.mnemonicVi());
    }
}
