package com.pbl6.flashcard.service;

import com.pbl6.flashcard.model.Flashcard;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * Sinh đề và chấm điểm. Đáp án đúng không bao giờ rời server dưới dạng "đáp án":
 * client chỉ nhận danh sách lựa chọn đã trộn.
 */
public final class QuizService {

    public static final int OPTIONS = 4;
    /** Thời gian làm mỗi câu (client hiển thị đồng hồ theo số này). */
    public static final int SECONDS_PER_QUESTION = 30;
    /** Bù độ trễ mạng khi client tự nộp lúc hết giờ. */
    public static final int GRACE_SECONDS = 60;

    private QuizService() {}

    /** Một câu hỏi gửi cho client — không có trường nào chỉ ra đáp án đúng. */
    public record Question(String cardId, String term, String reading, List<String> options) {}

    /** Đề đã phát: nộp bài phải kèm attemptId (null khi bộ thẻ không có thẻ nào). */
    public record Paper(java.util.UUID attemptId, int timeLimitSeconds, List<Question> questions) {}

    public record Graded(int score, int total, List<String> wrongCardIds) {}

    public static List<Question> buildQuiz(List<Flashcard> cards, int size, Random random) {
        List<Flashcard> pool = new ArrayList<>(cards);
        Collections.shuffle(pool, random);
        int count = Math.min(Math.max(size, 1), pool.size());

        List<Question> questions = new ArrayList<>();
        for (Flashcard card : pool.subList(0, count)) {
            // LinkedHashSet: bỏ nghĩa trùng, tránh 2 lựa chọn cùng đúng
            LinkedHashSet<String> options = new LinkedHashSet<>();
            options.add(card.getMeaning());
            for (Flashcard other : pool) {
                if (options.size() >= OPTIONS) break;
                if (!other.getId().equals(card.getId())) options.add(other.getMeaning());
            }
            List<String> shuffled = new ArrayList<>(options);
            Collections.shuffle(shuffled, random);
            questions.add(new Question(card.getId(), card.getTerm(), card.getReading(), shuffled));
        }
        return questions;
    }

    /**
     * Chấm trên đúng các câu server đã phát: câu không trả lời = sai, cardId lạ trong answers bị bỏ qua.
     * @param meanings cardId -> nghĩa đúng, lấy từ DB của đúng bộ thẻ
     * @param issued   cardId các câu đã phát (QuizAttempt)
     * @param answers  cardId -> nghĩa người dùng chọn (dữ liệu không đáng tin)
     */
    public static Graded grade(Map<String, String> meanings, List<String> issued, Map<String, String> answers) {
        int score = 0;
        int total = 0;
        List<String> wrong = new ArrayList<>();
        for (String cardId : issued) {
            String correct = meanings.get(cardId);
            if (correct == null) continue; // thẻ đã bị xoá sau khi phát đề -> không tính
            total++;
            if (correct.equals(answers.get(cardId))) score++;
            else wrong.add(cardId);
        }
        return new Graded(score, total, wrong);
    }
}
