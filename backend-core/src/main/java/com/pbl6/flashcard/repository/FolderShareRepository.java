package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.FolderShare;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface FolderShareRepository extends JpaRepository<FolderShare, Long> {

    List<FolderShare> findByUserId(Long userId);

    Optional<FolderShare> findByFolderIdAndUserId(UUID folderId, Long userId);

    record Member(Long userId, String email, String fullName) {}

    @Query("SELECT new com.pbl6.flashcard.repository.FolderShareRepository$Member(s.userId, u.email, u.fullName) "
            + "FROM FolderShare s, User u WHERE u.id = s.userId AND s.folderId = :folderId ORDER BY u.email")
    List<Member> findMembers(@Param("folderId") UUID folderId);
}
