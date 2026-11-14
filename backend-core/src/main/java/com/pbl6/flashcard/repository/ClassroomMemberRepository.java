package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.ClassroomMember;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ClassroomMemberRepository extends JpaRepository<ClassroomMember, Long> {
    List<ClassroomMember> findByClassroomIdAndStatus(Long classroomId, String status);
    List<ClassroomMember> findByUserIdAndStatus(Long userId, String status);
    Optional<ClassroomMember> findByClassroomIdAndUserId(Long classroomId, Long userId);
    long countByClassroomIdAndStatus(Long classroomId, String status);
    void deleteByClassroomIdAndUserId(Long classroomId, Long userId);

    @Query(value = """
            SELECT EXISTS (
                SELECT 1 FROM classroom_lesson_decks cld
                JOIN classroom_lessons cl ON cl.id = cld.lesson_id
                JOIN classrooms c ON c.id = cl.classroom_id
                WHERE cld.deck_id = :deckId
                AND (
                    c.owner_id = :userId
                    OR EXISTS (
                        SELECT 1 FROM classroom_members cm
                        WHERE cm.classroom_id = c.id AND cm.user_id = :userId AND cm.status = 'APPROVED'
                    )
                )
            )
            """, nativeQuery = true)
    boolean isDeckAccessibleByClassroomMember(@Param("deckId") String deckId, @Param("userId") Long userId);
}
