package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.pbl6.flashcard.dto.dictionary.DictDtos;
import com.pbl6.flashcard.security.CustomUserDetails;
import com.pbl6.flashcard.service.dictionary.DictionaryCommunityService;
import com.pbl6.flashcard.service.dictionary.DictionaryService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

/**
 * Từ điển Nhật–Việt cho người học (spec docs/Plan/specs/2026-10-26-tu-dien-design.md §6.4). ROLE_USER như mọi API học tập (staff
 * 403 ở SecurityConfig, D24 / D8); staff dùng /api/admin/dictionary. Khoá mục: w:&lt;id&gt; | w:jlpt:&lt;từ&gt;|&lt;đọc&gt; | k:&lt;chữ&gt;.
 */
@RestController
@RequestMapping("/api/dictionary")
@Validated
public class DictionaryController {

    private final DictionaryService dictionary;
    private final DictionaryCommunityService community;

    public DictionaryController(DictionaryService dictionary, DictionaryCommunityService community) {
        this.dictionary = dictionary;
        this.community = community;
    }

    private static long uid(CustomUserDetails me) {
        return me.getUser().getId();
    }

    /** {items, total, page, size, modeUsed: ja | en | vi | vi+en}; mode auto: có chữ Nhật → ja, không thì Việt + Anh. */
    @GetMapping("/search")
    public ObjectNode search(@RequestParam String q, @RequestParam(defaultValue = "auto") String mode,
                             @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return dictionary.search(q, mode, page, size);
    }

    /** Tab Câu: {items[{id, jpn, eng, vi, words[{key, form, head}]}], total, page, size} — câu ví dụ chứa cụm q. */
    @GetMapping("/sentences")
    public ObjectNode sentences(@RequestParam String q, @RequestParam(defaultValue = "0") int page,
                                @RequestParam(defaultValue = "20") int size) {
        return dictionary.sentences(q, page, size);
    }

    /** Mục đầy đủ (gốc + ghi đè + nghĩa Việt + ví dụ dịch + câu từ tài liệu của mình); dịch lúc tra nếu thiếu nghĩa Việt. */
    @GetMapping("/entries/{key}")
    public ObjectNode entry(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String key,
                            @RequestParam(required = false) String q) {
        return dictionary.entry(uid(me), key, q);
    }

    @PostMapping("/entries/{key}/translate-examples")
    public ObjectNode translateExamples(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String key,
                                        @Valid @RequestBody DictDtos.TranslateExamplesRequest body) {
        return dictionary.translateExamples(uid(me), key, body.exampleIds());
    }

    /** Vẽ chữ Hán để tra: {strokes: [[{x, y}]]} → {candidates: [{char, score}]}. */
    @PostMapping("/handwriting")
    public JsonNode handwriting(@AuthenticationPrincipal CustomUserDetails me, @Valid @RequestBody DictDtos.HandwritingRequest body) {
        return dictionary.handwriting(uid(me), body.strokes());
    }

    @PostMapping("/tokenize")
    public JsonNode tokenize(@AuthenticationPrincipal CustomUserDetails me, @Valid @RequestBody DictDtos.TokenizeRequest body) {
        return dictionary.tokenize(uid(me), body.text());
    }

    @GetMapping("/stats")
    public DictDtos.AiStats stats(@AuthenticationPrincipal CustomUserDetails me) {
        return dictionary.stats(uid(me));
    }

    // ------------------------------------------------------------ bình luận

    @GetMapping("/entries/{key}/comments")
    public DictDtos.CommentPage comments(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String key,
                                         @RequestParam(defaultValue = "helpful") String sort,
                                         @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return community.comments(uid(me), key, sort, page, size);
    }

    @PostMapping("/entries/{key}/comments")
    @ResponseStatus(HttpStatus.CREATED)
    public DictDtos.Comment addComment(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String key,
                                       @Valid @RequestBody DictDtos.CommentRequest body) {
        return community.addComment(uid(me), key, body.content());
    }

    @PatchMapping("/comments/{id}")
    public DictDtos.Comment editComment(@AuthenticationPrincipal CustomUserDetails me, @PathVariable long id,
                                        @Valid @RequestBody DictDtos.CommentRequest body) {
        return community.editComment(uid(me), id, body.content());
    }

    @DeleteMapping("/comments/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteComment(@AuthenticationPrincipal CustomUserDetails me, @PathVariable long id) {
        community.deleteComment(uid(me), id);
    }

    @PostMapping("/comments/{id}/helpful")
    public DictDtos.HelpfulResponse helpful(@AuthenticationPrincipal CustomUserDetails me, @PathVariable long id) {
        return community.toggleHelpful(uid(me), id);
    }

    // ------------------------------------------------------------ báo cáo

    @PostMapping("/entries/{key}/reports")
    @ResponseStatus(HttpStatus.CREATED)
    public DictDtos.Report reportEntry(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String key,
                                       @Valid @RequestBody DictDtos.EntryReportRequest body) {
        return community.reportEntry(uid(me), key, body);
    }

    @PostMapping("/comments/{id}/reports")
    @ResponseStatus(HttpStatus.CREATED)
    public DictDtos.Report reportComment(@AuthenticationPrincipal CustomUserDetails me, @PathVariable long id,
                                         @Valid @RequestBody DictDtos.CommentReportRequest body) {
        return community.reportComment(uid(me), id, body);
    }

    @GetMapping("/reports/mine")
    public DictDtos.ReportPage myReports(@AuthenticationPrincipal CustomUserDetails me, @RequestParam(defaultValue = "0") int page,
                                         @RequestParam(defaultValue = "20") int size) {
        return community.myReports(uid(me), page, size);
    }

    // ------------------------------------------------------------ sổ tay + lịch sử

    @GetMapping("/favorites")
    public ObjectNode favorites(@AuthenticationPrincipal CustomUserDetails me, @RequestParam(defaultValue = "0") int page,
                                @RequestParam(defaultValue = "50") int size) {
        return dictionary.favorites(uid(me), page, size);
    }

    @PutMapping("/favorites/{key}")
    public ObjectNode putFavorite(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String key,
                                  @Valid @RequestBody(required = false) DictDtos.FavoriteRequest body) {
        return dictionary.putFavorite(uid(me), key, body == null ? null : body.note());
    }

    @DeleteMapping("/favorites/{key}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeFavorite(@AuthenticationPrincipal CustomUserDetails me, @PathVariable String key) {
        dictionary.removeFavorite(uid(me), key);
    }

    @GetMapping("/history")
    public ObjectNode history(@AuthenticationPrincipal CustomUserDetails me, @RequestParam(defaultValue = "100") int size) {
        return dictionary.history(uid(me), size);
    }

    @DeleteMapping("/history")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void clearHistory(@AuthenticationPrincipal CustomUserDetails me) {
        dictionary.clearHistory(uid(me));
    }
}
