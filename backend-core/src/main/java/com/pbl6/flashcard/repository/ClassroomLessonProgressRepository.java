package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.ClassroomLessonProgress;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ClassroomLessonProgressRepository extends JpaRepository<ClassroomLessonProgress, Long> {
    Optional<ClassroomLessonProgress> findByLessonIdAndUserId(Long lessonId, Long userId);
    List<ClassroomLessonProgress> findByLessonIdInAndUserId(List<Long> lessonIds, Long userId);
    long countByLessonIdAndIsCompletedTrue(Long lessonId);

    @Query("""
            SELECT p.userId, COUNT(p) FROM ClassroomLessonProgress p
            WHERE p.lessonId IN :lessonIds AND p.isCompleted = true
            GROUP BY p.userId
            """)
    List<Object[]> countCompletedByUserAndLessonIds(@Param("lessonIds") List<Long> lessonIds);

    @Query("""
            SELECT p.lessonId, COUNT(p) FROM ClassroomLessonProgress p
            WHERE p.lessonId IN :lessonIds AND p.isCompleted = true
            GROUP BY p.lessonId
            """)
    List<Object[]> countCompletedByLessonIds(@Param("lessonIds") List<Long> lessonIds);
}
