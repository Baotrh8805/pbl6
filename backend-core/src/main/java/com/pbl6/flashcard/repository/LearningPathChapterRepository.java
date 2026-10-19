package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.LearningPathChapter;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

@Repository
public interface LearningPathChapterRepository extends JpaRepository<LearningPathChapter, UUID> {

    List<LearningPathChapter> findByPathIdOrderByPositionAsc(UUID pathId);

    /** LP-7: chương của nhiều lộ trình trong một truy vấn (danh sách); caller gom theo pathId, thứ tự position giữ trong từng nhóm. */
    List<LearningPathChapter> findByPathIdInOrderByPositionAsc(Collection<UUID> pathIds);

    /** Chương gắn một bộ thẻ (bài kiểm tra chương chấm theo deckId của lượt quiz); thường 0–1 dòng, deck_id SET NULL khi bộ bị xoá. */
    List<LearningPathChapter> findByDeckId(String deckId);
}
