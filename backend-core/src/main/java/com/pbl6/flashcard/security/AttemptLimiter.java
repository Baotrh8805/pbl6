package com.pbl6.flashcard.security;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Cửa sổ trượt đếm số lần theo khoá: đủ {@code maxAttempts} lần trong {@code window} -> chặn tới khi lần cũ
 * nhất ra khỏi cửa sổ.
 * ponytail: bộ đếm trong RAM của 1 instance, mất khi restart. Nâng cấp khi chạy nhiều instance: chuyển sang Redis.
 */
public class AttemptLimiter {

    /** Van an toàn bộ nhớ: dọn khoá đã hết hạn khi số khoá vượt ngưỡng. */
    private static final int SWEEP_THRESHOLD = 10_000;

    private final int maxAttempts;
    private final Duration window;
    private final Map<String, Deque<Instant>> attempts = new ConcurrentHashMap<>();

    public AttemptLimiter(int maxAttempts, Duration window) {
        this.maxAttempts = maxAttempts;
        this.window = window;
    }

    public boolean isBlocked(String key) {
        Deque<Instant> list = attempts.get(key);
        if (list == null) return false;
        synchronized (list) {
            prune(list, Instant.now());
            return list.size() >= maxAttempts;
        }
    }

    public void record(String key) {
        if (attempts.size() > SWEEP_THRESHOLD) sweep();
        Deque<Instant> list = attempts.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (list) {
            Instant now = Instant.now();
            prune(list, now);
            list.addLast(now);
        }
    }

    /** Số lần trong cửa sổ hiện tại (đã bỏ lần quá hạn) — cho bộ giới hạn có trần đổi lúc chạy (DictionaryRateLimiter). */
    public int count(String key) {
        Deque<Instant> list = attempts.get(key);
        if (list == null) return 0;
        synchronized (list) {
            prune(list, Instant.now());
            return list.size();
        }
    }

    public void reset(String key) {
        attempts.remove(key);
    }

    private void prune(Deque<Instant> list, Instant now) {
        Instant cutoff = now.minus(window);
        while (!list.isEmpty() && list.peekFirst().isBefore(cutoff)) list.pollFirst();
    }

    private void sweep() {
        Instant now = Instant.now();
        attempts.entrySet().removeIf(e -> {
            synchronized (e.getValue()) {
                prune(e.getValue(), now);
                return e.getValue().isEmpty();
            }
        });
    }
}
