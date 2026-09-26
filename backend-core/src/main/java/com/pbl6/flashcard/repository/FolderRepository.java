package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.Folder;
import com.pbl6.flashcard.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface FolderRepository extends JpaRepository<Folder, UUID> {
    List<Folder> findByUser(User user);

    // 1 query duy nhất cho cả cây -> dựng cây trong RAM, tránh N+1
    List<Folder> findByUserOrderByTitleAsc(User user);
}
