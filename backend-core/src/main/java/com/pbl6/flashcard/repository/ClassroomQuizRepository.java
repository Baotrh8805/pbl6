package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.ClassroomQuiz;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ClassroomQuizRepository extends JpaRepository<ClassroomQuiz, Long> {
    List<ClassroomQuiz> findByClassroomIdOrderByCreatedAtDesc(Long classroomId);

    Optional<ClassroomQuiz> findFirstByLessonId(Long lessonId);

    List<ClassroomQuiz> findByLessonId(Long lessonId);

    void deleteByClassroomId(Long classroomId);
}
