package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.ClassroomQuizSubmission;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ClassroomQuizSubmissionRepository extends JpaRepository<ClassroomQuizSubmission, Long> {
    List<ClassroomQuizSubmission> findByQuizIdOrderByCompletedAtDesc(Long quizId);

    List<ClassroomQuizSubmission> findByClassroomIdAndUserId(Long classroomId, Long userId);

    Optional<ClassroomQuizSubmission> findFirstByQuizIdAndUserIdOrderByCompletedAtDesc(Long quizId, Long userId);

    @Query("SELECT s.quizId, COUNT(s.id) FROM ClassroomQuizSubmission s WHERE s.quizId IN :quizIds GROUP BY s.quizId")
    List<Object[]> countSubmissionsByQuizIds(@Param("quizIds") List<Long> quizIds);

    @Query("SELECT s.userId, AVG(s.score), COUNT(DISTINCT s.quizId) " +
           "FROM ClassroomQuizSubmission s WHERE s.classroomId = :classroomId " +
           "GROUP BY s.userId")
    List<Object[]> findUserQuizStatsByClassroomId(@Param("classroomId") Long classroomId);
}
