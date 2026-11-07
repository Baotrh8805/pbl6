package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.ClassroomAnnouncement;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ClassroomAnnouncementRepository extends JpaRepository<ClassroomAnnouncement, Long> {
    List<ClassroomAnnouncement> findByClassroomIdOrderByIsPinnedDescCreatedAtDesc(Long classroomId);
}
