package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.Folder;
import com.pbl6.flashcard.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface FolderRepository extends JpaRepository<Folder, UUID> {
    // 1 query duy nhất cho cả cây -> dựng cây trong RAM, tránh N+1
    List<Folder> findByUserOrderByTitleAsc(User user);

    List<Folder> findByUser_IdOrderByTitleAsc(Long userId);

    /**
     * Người không phải chủ xem được thư mục khi chính nó hoặc một thư mục tổ tiên được chia sẻ cho họ
     * (folder_shares) hoặc để chế độ 'public' (ai có link cũng xem). 1 query đệ quy theo chuỗi cha;
     * depth < 50 = van an toàn nếu dữ liệu hỏng thành chu trình (FolderService.MAX_DEPTH).
     */
    @Query(value = """
            WITH RECURSIVE chain(id, parent_id, access_type, depth) AS (
                SELECT id, parent_id, access_type, 1 FROM folders WHERE id = :folderId
                UNION ALL
                SELECT f.id, f.parent_id, f.access_type, c.depth + 1
                FROM folders f JOIN chain c ON f.id = c.parent_id
                WHERE c.depth < 50
            )
            SELECT EXISTS (
                SELECT 1 FROM chain c
                WHERE c.access_type = 'public'
                   OR EXISTS (SELECT 1 FROM folder_shares s WHERE s.folder_id = c.id AND s.user_id = :uid)
            )
            """, nativeQuery = true)
    boolean isSharedWith(@Param("folderId") UUID folderId, @Param("uid") Long uid);
}
