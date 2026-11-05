package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.ClassroomLesson;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ClassroomLessonRepository extends JpaRepository<ClassroomLesson, Long> {
    List<ClassroomLesson> findByClassroomIdOrderByOrderIndexAsc(Long classroomId);
    void deleteByClassroomId(Long classroomId);
}
