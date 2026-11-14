package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.QuizQuestion;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface QuizQuestionRepository extends JpaRepository<QuizQuestion, UUID> {

    /** Ngân hàng của một bộ thẻ cho các loại sắp phát (index idx_quiz_questions_deck (deck_id, kind)), gồm cả câu đã ẩn. */
    List<QuizQuestion> findByDeckIdAndKindIn(String deckId, Collection<String> kinds);

    /** Admin sửa / ẩn: khoá dòng để hai admin không ghi đè nhau và nhật ký before/after đúng. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT q FROM QuizQuestion q WHERE q.id = :id")
    Optional<QuizQuestion> findForUpdate(@Param("id") UUID id);

    /** Điều kiện lọc chung của {@link #search} và câu đếm của nó. */
    String FILTER = "(:deckId IS NULL OR q.deckId = :deckId) "
            + "AND (:kind IS NULL OR q.kind = :kind) "
            + "AND (:status IS NULL OR q.status = :status) "
            + "AND (:flagged = false OR (q.flagCount > 0 AND EXISTS (SELECT f.id FROM QuestionFlag f "
            + "     WHERE f.questionId = q.id AND f.status = 'OPEN'))) "
            + "AND (:q = '' OR lower(q.prompt) LIKE :q ESCAPE '!' OR lower(q.correct) LIKE :q ESCAPE '!' "
            + "     OR EXISTS (SELECT c.id FROM Flashcard c WHERE c.id = q.cardId AND lower(c.term) LIKE :q ESCAPE '!'))";

    /**
     * Admin: deckId / kind / status null = không lọc; flagged = chỉ câu đang có báo lỗi OPEN (flagCount > 0 để dùng index một
     * phần idx_quiz_questions_flagged); q đã lower + escape (rỗng = không lọc), tìm trong prompt, đáp án và thuật ngữ của thẻ.
     */
    @Query(value = "SELECT q FROM QuizQuestion q WHERE " + FILTER,
            countQuery = "SELECT count(q) FROM QuizQuestion q WHERE " + FILTER)
    Page<QuizQuestion> search(@Param("deckId") String deckId, @Param("kind") String kind, @Param("status") String status,
                              @Param("flagged") boolean flagged, @Param("q") String q, Pageable pageable);
}
