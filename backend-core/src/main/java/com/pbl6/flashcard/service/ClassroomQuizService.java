package com.pbl6.flashcard.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pbl6.flashcard.dto.classroom.ClassroomQuizDtos.*;
import com.pbl6.flashcard.model.*;
import com.pbl6.flashcard.repository.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class ClassroomQuizService {

    private static final Logger log = LoggerFactory.getLogger(ClassroomQuizService.class);
    private static final Pattern RANGE_PATTERN = Pattern.compile("(\\d+)\\s*-\\s*(\\d+)");

    private final ClassroomRepository classroomRepo;
    private final ClassroomMemberRepository memberRepo;
    private final ClassroomLessonRepository lessonRepo;
    private final ClassroomLessonProgressRepository progressRepo;
    private final ClassroomQuizRepository quizRepo;
    private final ClassroomQuizAttemptRepository attemptRepo;
    private final ClassroomQuizSubmissionRepository submissionRepo;
    private final FlashcardRepository flashcardRepo;
    private final UserRepository userRepo;
    private final ObjectMapper objectMapper;
    private final Random random = new Random();

    public ClassroomQuizService(ClassroomRepository classroomRepo,
                                ClassroomMemberRepository memberRepo,
                                ClassroomLessonRepository lessonRepo,
                                ClassroomLessonProgressRepository progressRepo,
                                ClassroomQuizRepository quizRepo,
                                ClassroomQuizAttemptRepository attemptRepo,
                                ClassroomQuizSubmissionRepository submissionRepo,
                                FlashcardRepository flashcardRepo,
                                UserRepository userRepo,
                                ObjectMapper objectMapper) {
        this.classroomRepo = classroomRepo;
        this.memberRepo = memberRepo;
        this.lessonRepo = lessonRepo;
        this.progressRepo = progressRepo;
        this.quizRepo = quizRepo;
        this.attemptRepo = attemptRepo;
        this.submissionRepo = submissionRepo;
        this.flashcardRepo = flashcardRepo;
        this.userRepo = userRepo;
        this.objectMapper = objectMapper;
    }

    /** Tạo bài kiểm tra riêng cho Lớp học (Chỉ giáo viên/chủ lớp) */
    @Transactional
    public ClassroomQuizResponse createQuiz(User user, Long classroomId, CreateClassroomQuizRequest req) {
        Classroom classroom = getOwnedClassroom(user, classroomId);

        ClassroomQuiz quiz = new ClassroomQuiz();
        quiz.setClassroomId(classroom.getId());
        quiz.setTitle(req.title().trim());
        quiz.setDescription(req.description());
        quiz.setDurationMinutes(req.durationMinutes() != null && req.durationMinutes() > 0 ? req.durationMinutes() : 15);
        quiz.setQuestionCount(req.questionCount() != null && req.questionCount() > 0 ? req.questionCount() : 30);

        List<String> deckIds = new ArrayList<>();
        if (req.deckIds() != null && !req.deckIds().isEmpty()) {
            deckIds.addAll(req.deckIds());
        }

        String cardRange = req.cardRange();

        if (req.lessonId() != null) {
            ClassroomLesson lesson = lessonRepo.findById(req.lessonId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy buổi học."));
            if (!lesson.getClassroomId().equals(classroom.getId())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Buổi học không thuộc lớp này.");
            }
            quiz.setLessonId(lesson.getId());

            // Nếu chưa chọn bộ thẻ, kế thừa bộ thẻ của buổi học
            if (deckIds.isEmpty() && lesson.getDeckIds() != null) {
                deckIds.addAll(lesson.getDeckIds());
            }

            // Nếu chưa nhập cardRange, thử trích xuất từ tiêu đề buổi học (ví dụ: Buổi 1: Từ vựng (Thẻ 1 - 41))
            if ((cardRange == null || cardRange.isBlank()) && lesson.getTitle() != null) {
                Matcher m = RANGE_PATTERN.matcher(lesson.getTitle());
                if (m.find()) {
                    cardRange = m.group(1) + "-" + m.group(2);
                }
            }

            // Cập nhật thông tin hasQuiz cho buổi học
            lesson.setHasQuiz(true);
            lesson.setQuizDurationMinutes(quiz.getDurationMinutes());
            lessonRepo.save(lesson);
        }

        if (deckIds.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Vui lòng chọn ít nhất 1 bộ thẻ nguồn để tạo bài kiểm tra.");
        }

        quiz.setDeckIds(deckIds);
        quiz.setCardRange(cardRange != null && !cardRange.isBlank() ? cardRange.trim() : null);
        quiz.setIsPublished(true);
        quiz.setCreatedAt(Instant.now());
        quiz.setUpdatedAt(Instant.now());
        quiz = quizRepo.save(quiz);

        return toQuizResponse(quiz, null, 0L);
    }

    /** Lấy danh sách bài kiểm tra của Lớp học */
    @Transactional(readOnly = true)
    public List<ClassroomQuizResponse> getQuizzes(User user, Long classroomId) {
        verifyClassroomMember(user, classroomId);

        List<ClassroomQuiz> quizzes = quizRepo.findByClassroomIdOrderByCreatedAtDesc(classroomId);
        if (quizzes.isEmpty()) {
            return Collections.emptyList();
        }

        List<Long> quizIds = quizzes.stream().map(ClassroomQuiz::getId).toList();

        // Đếm tổng số bài nộp của từng quiz
        Map<Long, Long> submissionCounts = new HashMap<>();
        List<Object[]> countRows = submissionRepo.countSubmissionsByQuizIds(quizIds);
        for (Object[] r : countRows) {
            if (r[0] != null && r[1] != null) {
                submissionCounts.put(((Number) r[0]).longValue(), ((Number) r[1]).longValue());
            }
        }

        // Lấy điểm làm bài gần nhất của người dùng
        Map<Long, Integer> myScores = new HashMap<>();
        List<ClassroomQuizSubmission> mySubmissions = submissionRepo.findByClassroomIdAndUserId(classroomId, user.getId());
        for (ClassroomQuizSubmission s : mySubmissions) {
            myScores.putIfAbsent(s.getQuizId(), s.getScore());
        }

        return quizzes.stream()
                .map(q -> toQuizResponse(q, myScores.get(q.getId()), submissionCounts.getOrDefault(q.getId(), 0L)))
                .toList();
    }

    /** Bắt đầu làm bài kiểm tra (Sinh đề ngẫu nhiên theo số câu và phạm vi thẻ) */
    @Transactional
    public QuizStartResponse startQuiz(User user, Long classroomId, Long quizId) {
        verifyClassroomMember(user, classroomId);

        ClassroomQuiz quiz = quizRepo.findById(quizId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy bài kiểm tra."));
        if (!quiz.getClassroomId().equals(classroomId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bài kiểm tra không thuộc lớp này.");
        }

        // Xóa attempt cũ nếu có
        attemptRepo.deleteByQuizIdAndUserId(quiz.getId(), user.getId());

        // Thu thập các thẻ flashcard từ các deck nguồn
        List<Flashcard> allCards = new ArrayList<>();
        if (quiz.getDeckIds() != null) {
            for (String deckId : quiz.getDeckIds()) {
                allCards.addAll(flashcardRepo.findByDeck_IdOrderByPositionAsc(deckId));
            }
        }

        if (allCards.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bộ thẻ nguồn không có thẻ flashcard nào.");
        }

        // Lọc theo cardRange nếu có (ví dụ "1-41")
        List<Flashcard> questionPool = new ArrayList<>(allCards);
        if (quiz.getCardRange() != null && !quiz.getCardRange().isBlank()) {
            Matcher m = RANGE_PATTERN.matcher(quiz.getCardRange());
            if (m.find()) {
                int start = Integer.parseInt(m.group(1));
                int end = Integer.parseInt(m.group(2));
                int fromIndex = Math.max(0, start - 1);
                int toIndex = Math.min(allCards.size(), end);
                if (fromIndex < toIndex) {
                    questionPool = new ArrayList<>(allCards.subList(fromIndex, toIndex));
                }
            }
        }

        // Bốc ngẫu nhiên số lượng câu hỏi
        int targetCount = Math.min(quiz.getQuestionCount(), questionPool.size());
        Collections.shuffle(questionPool, random);
        List<Flashcard> selectedCards = questionPool.subList(0, targetCount);

        // Tập hợp tất cả các nghĩa để làm đáp án nhiễu (distractors)
        List<String> allMeanings = allCards.stream()
                .map(c -> QuizService.headline(c.getMeaning()))
                .filter(m -> m != null && !m.isBlank())
                .distinct()
                .collect(Collectors.toList());

        List<QuizInternalItem> internalItems = new ArrayList<>();
        List<QuestionItemDto> clientQuestions = new ArrayList<>();

        for (int i = 0; i < selectedCards.size(); i++) {
            Flashcard card = selectedCards.get(i);
            String correct = QuizService.headline(card.getMeaning());
            String explanation = QuizService.explanation(card.getMeaning());

            // Lấy 3 đáp án nhiễu khác với đáp án đúng
            List<String> distractors = new ArrayList<>(allMeanings);
            distractors.remove(correct);
            Collections.shuffle(distractors, random);

            List<String> options = new ArrayList<>();
            options.add(correct);
            int distractorCount = Math.min(3, distractors.size());
            for (int d = 0; d < distractorCount; d++) {
                options.add(distractors.get(d));
            }
            Collections.shuffle(options, random);

            internalItems.add(new QuizInternalItem(
                    i,
                    card.getId(),
                    card.getTerm(),
                    card.getReading(),
                    options,
                    correct,
                    explanation
            ));

            clientQuestions.add(new QuestionItemDto(
                    i,
                    card.getId(),
                    card.getTerm(),
                    card.getReading(),
                    options
            ));
        }

        UUID attemptId = UUID.randomUUID();
        Instant now = Instant.now();
        int durationSec = quiz.getDurationMinutes() * 60;
        Instant expiresAt = now.plusSeconds(durationSec + 120); // Thêm 120 giây bù trừ mạng

        try {
            String itemsJson = objectMapper.writeValueAsString(internalItems);
            ClassroomQuizAttempt attempt = new ClassroomQuizAttempt(
                    attemptId, quiz.getId(), classroomId, user.getId(), itemsJson, now, expiresAt
            );
            attemptRepo.save(attempt);
        } catch (Exception e) {
            log.error("Lỗi lưu quiz attempt", e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Không thể bắt đầu bài kiểm tra.");
        }

        return new QuizStartResponse(
                attemptId,
                quiz.getId(),
                quiz.getTitle(),
                quiz.getDurationMinutes(),
                expiresAt,
                clientQuestions
        );
    }

    /** Nộp bài kiểm tra & Chấm điểm tự động */
    @Transactional
    public QuizSubmissionResultResponse submitQuiz(User user, Long classroomId, Long quizId, SubmitQuizRequest req) {
        verifyClassroomMember(user, classroomId);

        ClassroomQuiz quiz = quizRepo.findById(quizId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy bài kiểm tra."));

        ClassroomQuizAttempt attempt = attemptRepo.findById(req.attemptId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Phiên làm bài không tồn tại hoặc đã nộp."));

        if (!attempt.getQuizId().equals(quiz.getId()) || !attempt.getUserId().equals(user.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Phiên làm bài không hợp lệ.");
        }

        List<QuizInternalItem> items;
        try {
            items = objectMapper.readValue(attempt.getItemsJson(), new TypeReference<List<QuizInternalItem>>() {});
        } catch (Exception e) {
            log.error("Lỗi đọc snapshot đề thi", e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Dữ liệu đề thi bị lỗi.");
        }

        int total = items.size();
        int correct = 0;
        Map<Integer, String> userAnswers = req.answers() != null ? req.answers() : Collections.emptyMap();
        List<GradedItemDto> gradedItems = new ArrayList<>();

        for (QuizInternalItem item : items) {
            String chosen = userAnswers.get(item.index());
            boolean isCorrect = chosen != null && chosen.trim().equalsIgnoreCase(item.correct().trim());
            if (isCorrect) correct++;

            gradedItems.add(new GradedItemDto(
                    item.index(),
                    item.term(),
                    item.reading(),
                    item.options(),
                    chosen,
                    item.correct(),
                    isCorrect,
                    item.explanation()
            ));
        }

        int score = total > 0 ? (int) Math.round((correct * 100.0) / total) : 0;
        int timeSpent = req.timeSpentSeconds() != null && req.timeSpentSeconds() >= 0 ? req.timeSpentSeconds() : 0;

        ClassroomQuizSubmission submission = new ClassroomQuizSubmission();
        submission.setQuizId(quiz.getId());
        submission.setClassroomId(classroomId);
        submission.setLessonId(quiz.getLessonId());
        submission.setUserId(user.getId());
        submission.setScore(score);
        submission.setCorrectCount(correct);
        submission.setTotalQuestions(total);
        submission.setTimeSpentSeconds(timeSpent);
        submission.setCompletedAt(Instant.now());

        try {
            submission.setAnswersJson(objectMapper.writeValueAsString(gradedItems));
        } catch (Exception e) {
            log.warn("Không thể lưu chi tiết bài làm", e);
        }

        submission = submissionRepo.save(submission);

        // Nếu bài kiểm tra gắn với buổi học, cập nhật tiến độ hoàn thành buổi học của học sinh
        if (quiz.getLessonId() != null) {
            Optional<ClassroomLessonProgress> pOpt = progressRepo.findByLessonIdAndUserId(quiz.getLessonId(), user.getId());
            ClassroomLessonProgress p = pOpt.orElseGet(() -> {
                ClassroomLessonProgress np = new ClassroomLessonProgress();
                np.setLessonId(quiz.getLessonId());
                np.setUserId(user.getId());
                return np;
            });
            p.setIsCompleted(true);
            p.setCompletedAt(Instant.now());
            // Giữ lại điểm cao nhất
            if (p.getQuizScore() == null || score > p.getQuizScore()) {
                p.setQuizScore(score);
            }
            progressRepo.save(p);
        }

        // Xóa attempt sau khi hoàn tất nộp bài
        attemptRepo.delete(attempt);

        return new QuizSubmissionResultResponse(
                submission.getId(),
                quiz.getId(),
                score,
                correct,
                total,
                timeSpent,
                submission.getCompletedAt(),
                gradedItems
        );
    }

    /** Lấy danh sách nộp bài kiểm tra của học sinh (Dành cho Giáo viên) */
    @Transactional(readOnly = true)
    public List<QuizStudentSubmissionDto> getQuizSubmissions(User user, Long classroomId, Long quizId) {
        getOwnedClassroom(user, classroomId);

        List<ClassroomQuizSubmission> submissions = submissionRepo.findByQuizIdOrderByCompletedAtDesc(quizId);
        if (submissions.isEmpty()) return Collections.emptyList();

        List<Long> userIds = submissions.stream().map(ClassroomQuizSubmission::getUserId).distinct().toList();
        Map<Long, User> userMap = userRepo.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, u -> u, (a, b) -> a));

        return submissions.stream().map(s -> {
            User u = userMap.get(s.getUserId());
            return new QuizStudentSubmissionDto(
                    s.getUserId(),
                    u != null && u.getFullName() != null ? u.getFullName() : "Học viên",
                    u != null && u.getEmail() != null ? u.getEmail() : "",
                    s.getScore(),
                    s.getCorrectCount(),
                    s.getTotalQuestions(),
                    s.getTimeSpentSeconds(),
                    s.getCompletedAt()
            );
        }).toList();
    }

    /** Xóa bài kiểm tra (Chỉ giáo viên/chủ lớp) */
    @Transactional
    public void deleteQuiz(User user, Long classroomId, Long quizId) {
        Classroom classroom = getOwnedClassroom(user, classroomId);
        ClassroomQuiz quiz = quizRepo.findById(quizId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy bài kiểm tra."));
        if (!quiz.getClassroomId().equals(classroom.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bài kiểm tra không thuộc lớp này.");
        }
        quizRepo.delete(quiz);
    }

    /** Bảng xếp hạng học tập của lớp học */
    @Transactional(readOnly = true)
    public List<LeaderboardMemberDto> getLeaderboard(User user, Long classroomId) {
        verifyClassroomMember(user, classroomId);

        List<ClassroomMember> members = memberRepo.findByClassroomIdAndStatus(classroomId, ClassroomMember.STATUS_APPROVED);
        if (members.isEmpty()) return Collections.emptyList();

        List<Long> userIds = members.stream().map(ClassroomMember::getUserId).toList();
        Map<Long, User> userMap = userRepo.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, u -> u, (a, b) -> a));

        // Số buổi học hoàn thành
        List<ClassroomLesson> lessons = lessonRepo.findByClassroomIdOrderByOrderIndexAsc(classroomId);
        List<Long> lessonIds = lessons.stream().map(ClassroomLesson::getId).filter(Objects::nonNull).toList();
        Map<Long, Long> userCompletedLessons = new HashMap<>();
        if (!lessonIds.isEmpty()) {
            List<Object[]> rows = progressRepo.countCompletedByUserAndLessonIds(lessonIds);
            for (Object[] r : rows) {
                if (r[0] != null && r[1] != null) {
                    userCompletedLessons.put(((Number) r[0]).longValue(), ((Number) r[1]).longValue());
                }
            }
        }

        // Thống kê điểm Quiz: user_id -> [avg_score, quiz_count]
        Map<Long, Double> avgScores = new HashMap<>();
        Map<Long, Long> quizCounts = new HashMap<>();
        List<Object[]> statsRows = submissionRepo.findUserQuizStatsByClassroomId(classroomId);
        for (Object[] r : statsRows) {
            if (r[0] != null) {
                Long uid = ((Number) r[0]).longValue();
                Double avg = r[1] != null ? ((Number) r[1]).doubleValue() : 0.0;
                Long count = r[2] != null ? ((Number) r[2]).longValue() : 0L;
                avgScores.put(uid, Math.round(avg * 10.0) / 10.0);
                quizCounts.put(uid, count);
            }
        }

        // Tạo danh sách và sắp xếp theo: (1) Điểm trung bình Quiz giảm dần, (2) Số buổi hoàn thành giảm dần
        List<LeaderboardMemberDto> list = new ArrayList<>();
        for (ClassroomMember m : members) {
            User u = userMap.get(m.getUserId());
            long completedLessons = userCompletedLessons.getOrDefault(m.getUserId(), 0L);
            double avgScore = avgScores.getOrDefault(m.getUserId(), 0.0);
            long qCount = quizCounts.getOrDefault(m.getUserId(), 0L);

            list.add(new LeaderboardMemberDto(
                    m.getUserId(),
                    u != null ? u.getFullName() : "Học viên",
                    u != null ? u.getEmail() : "",
                    completedLessons,
                    avgScore,
                    qCount,
                    0
            ));
        }

        list.sort((a, b) -> {
            int cmpScore = Double.compare(b.averageQuizScore(), a.averageQuizScore());
            if (cmpScore != 0) return cmpScore;
            return Long.compare(b.completedLessonsCount(), a.completedLessonsCount());
        });

        // Gán thứ hạng
        List<LeaderboardMemberDto> ranked = new ArrayList<>();
        for (int i = 0; i < list.size(); i++) {
            LeaderboardMemberDto item = list.get(i);
            ranked.add(new LeaderboardMemberDto(
                    item.userId(),
                    item.fullName(),
                    item.email(),
                    item.completedLessonsCount(),
                    item.averageQuizScore(),
                    item.quizzesTakenCount(),
                    i + 1
            ));
        }

        return ranked;
    }

    private Classroom getOwnedClassroom(User user, Long classroomId) {
        Classroom c = classroomRepo.findById(classroomId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy lớp học."));
        if (!c.getOwnerId().equals(user.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bạn không có quyền quản trị lớp học này.");
        }
        return c;
    }

    private void verifyClassroomMember(User user, Long classroomId) {
        Classroom c = classroomRepo.findById(classroomId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy lớp học."));
        if (c.getOwnerId().equals(user.getId())) return;

        Optional<ClassroomMember> member = memberRepo.findByClassroomIdAndUserId(c.getId(), user.getId());
        if (member.isEmpty() || !ClassroomMember.STATUS_APPROVED.equals(member.get().getStatus())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bạn chưa tham gia lớp học này.");
        }
    }

    private ClassroomQuizResponse toQuizResponse(ClassroomQuiz q, Integer myLatestScore, Long submissionCount) {
        String lessonTitle = null;
        if (q.getLessonId() != null) {
            lessonTitle = lessonRepo.findById(q.getLessonId()).map(ClassroomLesson::getTitle).orElse(null);
        }

        return new ClassroomQuizResponse(
                q.getId(),
                q.getClassroomId(),
                q.getLessonId(),
                lessonTitle,
                q.getTitle(),
                q.getDescription(),
                q.getDurationMinutes(),
                q.getQuestionCount(),
                q.getCardRange(),
                q.getDeckIds() != null ? new ArrayList<>(q.getDeckIds()) : Collections.emptyList(),
                q.getIsPublished(),
                q.getCreatedAt(),
                myLatestScore,
                submissionCount
        );
    }

    private record QuizInternalItem(
            int index,
            String cardId,
            String term,
            String reading,
            List<String> options,
            String correct,
            String explanation
    ) {}
}
