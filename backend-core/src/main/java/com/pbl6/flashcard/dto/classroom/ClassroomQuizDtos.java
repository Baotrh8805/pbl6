package com.pbl6.flashcard.dto.classroom;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public class ClassroomQuizDtos {

    public record CreateClassroomQuizRequest(
            Long lessonId,
            @NotBlank(message = "Tiêu đề bài kiểm tra không được để trống") String title,
            String description,
            Integer durationMinutes,
            Integer questionCount,
            List<String> deckIds,
            String cardRange
    ) {}

    public record ClassroomQuizResponse(
            Long id,
            Long classroomId,
            Long lessonId,
            String lessonTitle,
            String title,
            String description,
            Integer durationMinutes,
            Integer questionCount,
            String cardRange,
            List<String> deckIds,
            Boolean isPublished,
            Instant createdAt,
            Integer myLatestScore,
            Long submissionCount
    ) {}

    public record QuestionItemDto(
            int index,
            String cardId,
            String term,
            String reading,
            List<String> options
    ) {}

    public record QuizStartResponse(
            UUID attemptId,
            Long quizId,
            String title,
            Integer durationMinutes,
            Instant expiresAt,
            List<QuestionItemDto> questions
    ) {}

    public record SubmitQuizRequest(
            @NotNull(message = "Thiếu attemptId") UUID attemptId,
            Integer timeSpentSeconds,
            Map<Integer, String> answers
    ) {}

    public record GradedItemDto(
            int index,
            String term,
            String reading,
            List<String> options,
            String chosenAnswer,
            String correctAnswer,
            boolean isCorrect,
            String explanation
    ) {}

    public record QuizSubmissionResultResponse(
            Long submissionId,
            Long quizId,
            Integer score,
            Integer correctCount,
            Integer totalQuestions,
            Integer timeSpentSeconds,
            Instant completedAt,
            List<GradedItemDto> items
    ) {}

    public record QuizStudentSubmissionDto(
            Long userId,
            String fullName,
            String email,
            Integer score,
            Integer correctCount,
            Integer totalQuestions,
            Integer timeSpentSeconds,
            Instant completedAt
    ) {}

    public record LeaderboardMemberDto(
            Long userId,
            String fullName,
            String email,
            long completedLessonsCount,
            double averageQuizScore,
            long quizzesTakenCount,
            int rank
    ) {}
}
