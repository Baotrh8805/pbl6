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
 * client chỉ nhận danh sách lựa chọn đã trộn (và phản hồi từng câu khi chế độ cho phép).
 */
public final class QuizService {

    public static final int OPTIONS = 4;
    /** Thời gian làm mỗi câu ở chế độ thi (client hiển thị đồng hồ theo số này). */
    public static final int SECONDS_PER_QUESTION = 30;
    /** Bù độ trễ mạng khi client tự nộp lúc hết giờ. */
    public static final int GRACE_SECONDS = 60;

    private QuizService() {}

    /** Một câu hỏi gửi cho client — không có trường nào chỉ ra đáp án đúng. */
    public record Question(String cardId, String term, String reading, List<String> options) {}

    /**
     * Một câu trong bản chụp đề lưu ở server (lượt làm): có đáp án đúng và lời giải nên KHÔNG gửi nguyên cho client.
     * explanation: phần nội dung thẻ sau dòng đầu (định nghĩa phụ, ví dụ, ghi chú), null nếu không có.
     */
    public record Item(String cardId, String term, String reading, List<String> options, String correct,
                       String explanation) {
        public Question toQuestion() {
            return new Question(cardId, term, reading, options);
        }
    }

    public record Graded(int score, int total, List<String> wrongCardIds) {}

    /**
     * Nội dung thẻ nhiều dòng (định nghĩa, ví dụ, ghi chú): quiz chỉ lấy dòng không rỗng đầu tiên làm đáp án
     * để lựa chọn ngắn gọn. Dùng chung cho cả sinh đề lẫn chấm điểm.
     */
    public static String headline(String meaning) {
        if (meaning == null) return "";
        return meaning.lines().map(String::strip).filter(l -> !l.isEmpty()).findFirst().orElse("");
    }

    /** Phần nội dung sau dòng đầu = lời giải (định nghĩa phụ, ví dụ, ghi chú); null nếu không có. */
    public static String explanation(String meaning) {
        if (meaning == null) return null;
        List<String> lines = meaning.lines().map(String::strip).toList();
        int first = 0;
        while (first < lines.size() && lines.get(first).isEmpty()) first++;
        String rest = String.join("\n", lines.subList(Math.min(first + 1, lines.size()), lines.size())).strip();
        return rest.isEmpty() ? null : rest;
    }

    public static List<Question> buildQuiz(List<Flashcard> cards, int size, Random random) {
        return buildItems(cards, size, random).stream().map(Item::toQuestion).toList();
    }

    /** Một câu hợp lệ cần ít nhất 2 lựa chọn khác nhau, nên bộ thẻ cần tối thiểu 2 thẻ có nghĩa khác nhau. */
    public static List<Item> buildItems(List<Flashcard> cards, int size, Random random) {
        List<Flashcard> pool = new ArrayList<>(cards);
        Collections.shuffle(pool, random);
        int count = Math.min(Math.max(size, 1), pool.size());

        List<Item> items = new ArrayList<>();
        for (Flashcard card : pool.subList(0, count)) {
            // LinkedHashSet: bỏ nghĩa trùng, tránh 2 lựa chọn cùng đúng
            LinkedHashSet<String> options = new LinkedHashSet<>();
            options.add(headline(card.getMeaning()));
            for (Flashcard other : pool) {
                if (options.size() >= OPTIONS) break;
                if (!other.getId().equals(card.getId())) options.add(headline(other.getMeaning()));
            }
            // Bộ thẻ chỉ có 1 thẻ / mọi thẻ cùng nghĩa: không ra được câu trắc nghiệm hợp lệ -> bỏ câu này
            if (options.size() < 2) continue;
            List<String> shuffled = new ArrayList<>(options);
            Collections.shuffle(shuffled, random);
            items.add(new Item(card.getId(), card.getTerm(), card.getReading(), shuffled,
                    headline(card.getMeaning()), explanation(card.getMeaning())));
        }
        return items;
    }

    /**
     * Chấm trên đúng các câu server đã phát: câu không trả lời = sai, cardId lạ trong answers bị bỏ qua.
     * @param meanings cardId -> nghĩa đúng, lấy từ bản chụp đề của lượt làm
     * @param issued   cardId các câu đã phát (QuizAttempt)
     * @param answers  cardId -> nghĩa người dùng chọn (dữ liệu không đáng tin)
     */
    public static Graded grade(Map<String, String> meanings, List<String> issued, Map<String, String> answers) {
        int score = 0;
        int total = 0;
        List<String> wrong = new ArrayList<>();
        for (String cardId : issued) {
            String correct = meanings.get(cardId);
            if (correct == null) continue;
            total++;
            if (correct.equals(answers.get(cardId))) score++;
            else wrong.add(cardId);
        }
        return new Graded(score, total, wrong);
    }
}
