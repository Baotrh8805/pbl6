package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.model.Notification;
import com.pbl6.flashcard.security.CustomUserDetails;
import com.pbl6.flashcard.service.NotificationService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Chuông thông báo (mọi vai trò đã đăng nhập). 20 mục mới nhất + số chưa đọc. */
@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    public record Item(Long id, String type, Map<String, Object> payload, Instant readAt, Instant createdAt) {
        static Item of(Notification n) {
            return new Item(n.getId(), n.getType(), n.getPayload(), n.getReadAt(), n.getCreatedAt());
        }
    }

    public record Feed(List<Item> items, long unread) {}

    private final NotificationService service;

    public NotificationController(NotificationService service) {
        this.service = service;
    }

    @GetMapping
    public Feed feed(@AuthenticationPrincipal CustomUserDetails me) {
        NotificationService.Feed f = service.feed(me.getUser().getId());
        return new Feed(f.items().stream().map(Item::of).toList(), f.unread());
    }

    @PostMapping("/{id}/read")
    public ResponseEntity<Void> read(@AuthenticationPrincipal CustomUserDetails me, @PathVariable Long id) {
        return service.markRead(me.getUser().getId(), id) ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    @PostMapping("/read-all")
    public Map<String, Integer> readAll(@AuthenticationPrincipal CustomUserDetails me) {
        return Map.of("updated", service.markAllRead(me.getUser().getId()));
    }
}
