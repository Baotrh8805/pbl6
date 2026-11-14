package com.pbl6.flashcard.service;

import com.pbl6.flashcard.model.Notification;
import com.pbl6.flashcard.repository.NotificationRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Thông báo trong app (G3). notify() gọi trong cùng transaction với hành động admin: hành động rollback thì thông báo
 * cũng không ghi. ponytail: không realtime (frontend tải khi mở chuông); thêm SSE khi người dùng phàn nàn chậm.
 */
@Service
public class NotificationService {
    public static final int PAGE_SIZE = 20;

    private final NotificationRepository repo;

    public NotificationService(NotificationRepository repo) {
        this.repo = repo;
    }

    public void notify(Long userId, String type, Map<String, Object> payload) {
        Map<String, Object> clean = new HashMap<>();
        if (payload != null) payload.forEach((k, v) -> { if (v != null) clean.put(k, v); }); // jsonb không nhận null từ Map.of
        repo.save(new Notification(userId, type, clean));
    }

    public record Feed(List<Notification> items, long unread) {}

    @Transactional(readOnly = true)
    public Feed feed(Long userId) {
        return new Feed(repo.findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, PAGE_SIZE)),
                repo.countByUserIdAndReadAtIsNull(userId));
    }

    @Transactional
    public boolean markRead(Long userId, Long id) {
        return repo.markRead(id, userId, Instant.now()) > 0;
    }

    @Transactional
    public int markAllRead(Long userId) {
        return repo.markAllRead(userId, Instant.now());
    }
}
