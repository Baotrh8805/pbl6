package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.ClassroomAnnouncementComment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ClassroomAnnouncementCommentRepository extends JpaRepository<ClassroomAnnouncementComment, Long> {
    List<ClassroomAnnouncementComment> findByAnnouncementIdOrderByCreatedAtAsc(Long announcementId);
    List<ClassroomAnnouncementComment> findByAnnouncementIdInOrderByCreatedAtAsc(List<Long> announcementIds);
}
