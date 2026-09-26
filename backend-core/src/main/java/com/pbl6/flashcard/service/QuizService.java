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

    private QuizService() {}

    /** Một câu hỏi gửi cho client — không có trường nào chỉ ra đáp án đúng. */
    public record Question(String cardId, String term, String reading, List<String> options) {}

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
     * @param meanings cardId -> nghĩa đúng, lấy từ DB của đúng bộ thẻ
     * @param answers  cardId -> nghĩa người dùng chọn (dữ liệu không đáng tin)
     */
    public static Graded grade(Map<String, String> meanings, Map<String, String> answers) {
        int score = 0;
        int total = 0;
        List<String> wrong = new ArrayList<>();
        for (Map.Entry<String, String> entry : answers.entrySet()) {
            String correct = meanings.get(entry.getKey());
            if (correct == null) continue; // cardId lạ (không thuộc bộ thẻ) -> bỏ qua
            total++;
            if (correct.equals(entry.getValue())) score++;
            else wrong.add(entry.getKey());
        }
        return new Graded(score, total, wrong);
    }
}
