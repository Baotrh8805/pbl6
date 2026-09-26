package com.pbl6.flashcard.service;

import com.pbl6.flashcard.model.Flashcard;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;

import static org.junit.jupiter.api.Assertions.*;

class QuizServiceTest {

    private static List<Flashcard> cards(int n) {
        List<Flashcard> list = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            Flashcard c = new Flashcard();
            c.setId("c" + i);
            c.setTerm("term" + i);
            c.setMeaning("nghĩa" + i);
            list.add(c);
        }
        return list;
    }

    @Test
    void deTronDuAppAnVaKhongLoDapAn() {
        List<QuizService.Question> quiz = QuizService.buildQuiz(cards(10), 5, new Random(1));
        assertEquals(5, quiz.size());
        for (QuizService.Question q : quiz) {
            assertEquals(QuizService.OPTIONS, q.options().size());
            assertEquals(QuizService.OPTIONS, q.options().stream().distinct().count(), "Không lựa chọn trùng");
            assertTrue(q.options().contains("nghĩa" + q.cardId().substring(1)), "Đáp án đúng phải nằm trong lựa chọn");
        }
    }

    @Test
    void boTheItThePhaiKhongNo() {
        List<QuizService.Question> quiz = QuizService.buildQuiz(cards(2), 10, new Random(1));
        assertEquals(2, quiz.size(), "size lớn hơn số thẻ -> cắt về số thẻ");
        assertEquals(2, quiz.get(0).options().size(), "Không đủ nghĩa thì ít lựa chọn hơn");
    }

    @Test
    void chamDiemBoQuaCardIdLa() {
        Map<String, String> meanings = Map.of("c0", "nghĩa0", "c1", "nghĩa1");
        QuizService.Graded g = QuizService.grade(meanings, Map.of(
                "c0", "nghĩa0",
                "c1", "nghĩa-sai",
                "hacker", "nghĩa0"));
        assertEquals(1, g.score());
        assertEquals(2, g.total(), "cardId không thuộc bộ thẻ bị loại khỏi tổng");
        assertEquals(List.of("c1"), g.wrongCardIds());
    }
}
