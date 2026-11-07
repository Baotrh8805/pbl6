package com.pbl6.flashcard.repository;

import com.pbl6.flashcard.model.Notification;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

    List<Notification> findByUserIdOrderByCreatedAtDesc(Long userId, Pageable page);

    long countByUserIdAndReadAtIsNull(Long userId);

    /** Chỉ chủ sở hữu đánh dấu được (WHERE user_id); 0 dòng = không phải của mình hoặc đã đọc. */
    @Modifying
    @Query("UPDATE Notification n SET n.readAt = :now WHERE n.id = :id AND n.userId = :uid AND n.readAt IS NULL")
    int markRead(@Param("id") Long id, @Param("uid") Long uid, @Param("now") Instant now);

    @Modifying
    @Query("UPDATE Notification n SET n.readAt = :now WHERE n.userId = :uid AND n.readAt IS NULL")
    int markAllRead(@Param("uid") Long uid, @Param("now") Instant now);
}
