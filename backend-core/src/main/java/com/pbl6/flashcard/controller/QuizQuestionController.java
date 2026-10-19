package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.dto.deck.QuestionFlagDtos;
import com.pbl6.flashcard.security.CustomUserDetails;
import com.pbl6.flashcard.service.QuestionBankService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/** Người học báo lỗi một câu hỏi quiz (hợp đồng đợt 2 §1.2). Chỉ USER (SecurityConfig: API học tập, staff 403). */
@RestController
@RequestMapping("/api/quiz-questions")
public class QuizQuestionController {

    private final QuestionBankService service;

    public QuizQuestionController(QuestionBankService service) {
        this.service = service;
    }

    /**
     * questionId lấy từ QuestionState.questionId của lượt làm. 201 {id, status}; 409 đã có báo lỗi OPEN của mình cho câu này;
     * 429 quá 20 lần / giờ; 404 câu không tồn tại hoặc thuộc bộ thẻ mình không xem được.
     */
    @PostMapping("/{questionId}/flags")
    public ResponseEntity<QuestionFlagDtos.Created> flag(@AuthenticationPrincipal CustomUserDetails me,
                                                         @PathVariable UUID questionId,
                                                         @Valid @RequestBody QuestionFlagDtos.Request body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.flag(me.getUser().getId(), questionId, body));
    }
}
