package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.dto.classroom.ClassroomQuizDtos.*;
import com.pbl6.flashcard.security.CustomUserDetails;
import com.pbl6.flashcard.service.ClassroomQuizService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/classrooms/{classroomId}")
public class ClassroomQuizController {

    private final ClassroomQuizService quizService;

    public ClassroomQuizController(ClassroomQuizService quizService) {
        this.quizService = quizService;
    }

    /** Tạo bài kiểm tra riêng cho Lớp học (Chủ lớp/Giáo viên) */
    @PostMapping("/quizzes")
    public ResponseEntity<ClassroomQuizResponse> createQuiz(
            @AuthenticationPrincipal CustomUserDetails me,
            @PathVariable Long classroomId,
            @Valid @RequestBody CreateClassroomQuizRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(quizService.createQuiz(me.getUser(), classroomId, req));
    }

    /** Lấy danh sách bài kiểm tra của Lớp học */
    @GetMapping("/quizzes")
    public ResponseEntity<List<ClassroomQuizResponse>> getQuizzes(
            @AuthenticationPrincipal CustomUserDetails me,
            @PathVariable Long classroomId) {
        return ResponseEntity.ok(quizService.getQuizzes(me.getUser(), classroomId));
    }

    /** Xóa bài kiểm tra (Chủ lớp) */
    @DeleteMapping("/quizzes/{quizId}")
    public ResponseEntity<Void> deleteQuiz(
            @AuthenticationPrincipal CustomUserDetails me,
            @PathVariable Long classroomId,
            @PathVariable Long quizId) {
        quizService.deleteQuiz(me.getUser(), classroomId, quizId);
        return ResponseEntity.noContent().build();
    }

    /** Bắt đầu làm bài kiểm tra (Phát đề ngẫu nhiên theo số câu và phạm vi thẻ) */
    @PostMapping("/quizzes/{quizId}/start")
    public ResponseEntity<QuizStartResponse> startQuiz(
            @AuthenticationPrincipal CustomUserDetails me,
            @PathVariable Long classroomId,
            @PathVariable Long quizId) {
        return ResponseEntity.ok(quizService.startQuiz(me.getUser(), classroomId, quizId));
    }

    /** Nộp bài kiểm tra & Chấm điểm tự động */
    @PostMapping("/quizzes/{quizId}/submit")
    public ResponseEntity<QuizSubmissionResultResponse> submitQuiz(
            @AuthenticationPrincipal CustomUserDetails me,
            @PathVariable Long classroomId,
            @PathVariable Long quizId,
            @Valid @RequestBody SubmitQuizRequest req) {
        return ResponseEntity.ok(quizService.submitQuiz(me.getUser(), classroomId, quizId, req));
    }

    /** Xem danh sách học sinh nộp bài kiểm tra (Giáo viên) */
    @GetMapping("/quizzes/{quizId}/submissions")
    public ResponseEntity<List<QuizStudentSubmissionDto>> getQuizSubmissions(
            @AuthenticationPrincipal CustomUserDetails me,
            @PathVariable Long classroomId,
            @PathVariable Long quizId) {
        return ResponseEntity.ok(quizService.getQuizSubmissions(me.getUser(), classroomId, quizId));
    }

    /** Lấy Bảng xếp hạng học tập của lớp học */
    @GetMapping("/leaderboard")
    public ResponseEntity<List<LeaderboardMemberDto>> getLeaderboard(
            @AuthenticationPrincipal CustomUserDetails me,
            @PathVariable Long classroomId) {
        return ResponseEntity.ok(quizService.getLeaderboard(me.getUser(), classroomId));
    }
}
