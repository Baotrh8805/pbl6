package com.pbl6.flashcard.service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;
import java.util.function.Supplier;

/**
 * Cache trong RAM có hạn sống và trần số mục, cho dữ liệu tra cứu tĩnh của ai-service (từ điển, bảng bộ thủ) — không có Caffeine
 * trong classpath và dữ liệu nhỏ nên một ConcurrentHashMap là đủ. Đầy thì bỏ mục hết hạn trước, rồi mục sắp hết hạn nhất (cũ
 * nhất, vì mọi mục cùng TTL). Hai request cùng khoá lúc trống có thể cùng gọi nguồn một lần: chấp nhận, đổi lại không khoá.
 * Lỗi của nguồn không được cache (lần sau gọi lại).
 */
class TtlCache<K, V> {

    private record Entry<V>(V value, long expiresAt) {}

    private final Map<K, Entry<V>> entries = new ConcurrentHashMap<>();
    private final long ttlMillis;
    private final int maxEntries;
    private final LongSupplier clock;

    TtlCache(long ttlMillis, int maxEntries, LongSupplier clock) {
        this.ttlMillis = ttlMillis;
        this.maxEntries = maxEntries;
        this.clock = clock;
    }

    V get(K key, Supplier<V> loader) {
        long now = clock.getAsLong();
        Entry<V> hit = entries.get(key);
        if (hit != null && hit.expiresAt() > now) return hit.value();
        V value = loader.get();
        if (value != null) {
            if (hit == null && entries.size() >= maxEntries) evict(now);
            entries.put(key, new Entry<>(value, now + ttlMillis));
        }
        return value;
    }

    int size() {
        return entries.size();
    }

    private void evict(long now) {
        entries.entrySet().removeIf(e -> e.getValue().expiresAt() <= now);
        while (entries.size() >= maxEntries) {
            K oldest = null;
            long min = Long.MAX_VALUE;
            for (Map.Entry<K, Entry<V>> e : entries.entrySet()) {
                if (e.getValue().expiresAt() < min) {
                    min = e.getValue().expiresAt();
                    oldest = e.getKey();
                }
            }
            if (oldest == null) return;
            entries.remove(oldest);
        }
    }
}
