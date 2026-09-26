package com.pbl6.flashcard.security;

import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Chặn dò mật khẩu: quá MAX_FAILURES lần sai trong WINDOW cho cùng (IP, email) -> tạm khoá tới khi lần sai
 * cũ nhất ra khỏi cửa sổ. Đăng nhập đúng xoá bộ đếm.
 * ponytail: bộ đếm trong RAM của 1 instance, mất khi restart. Nâng cấp khi chạy nhiều instance: chuyển sang Redis.
 */
@Component
public class LoginAttemptLimiter {

    public static final int MAX_FAILURES = 5;
    public static final Duration WINDOW = Duration.ofMinutes(1);
    /** Van an toàn bộ nhớ: dọn khoá đã hết hạn khi số khoá vượt ngưỡng. */
    private static final int SWEEP_THRESHOLD = 10_000;

    private final Map<String, Deque<Instant>> failures = new ConcurrentHashMap<>();

    public static String key(String ip, String normalizedEmail) {
        return ip + "|" + normalizedEmail;
    }

    public boolean isBlocked(String key) {
        Deque<Instant> attempts = failures.get(key);
        if (attempts == null) return false;
        synchronized (attempts) {
            prune(attempts, Instant.now());
            return attempts.size() >= MAX_FAILURES;
        }
    }

    public void recordFailure(String key) {
        if (failures.size() > SWEEP_THRESHOLD) sweep();
        Deque<Instant> attempts = failures.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (attempts) {
            Instant now = Instant.now();
            prune(attempts, now);
            attempts.addLast(now);
        }
    }

    public void reset(String key) {
        failures.remove(key);
    }

    private static void prune(Deque<Instant> attempts, Instant now) {
        Instant cutoff = now.minus(WINDOW);
        while (!attempts.isEmpty() && attempts.peekFirst().isBefore(cutoff)) attempts.pollFirst();
    }

    private void sweep() {
        Instant now = Instant.now();
        failures.entrySet().removeIf(e -> {
            synchronized (e.getValue()) {
                prune(e.getValue(), now);
                return e.getValue().isEmpty();
            }
        });
    }
}
