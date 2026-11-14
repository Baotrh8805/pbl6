package com.pbl6.flashcard.service;

import org.junit.jupiter.api.Test;

import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/** Cache TTL của proxy NLP: hết hạn thì nạp lại, đầy thì bỏ mục cũ nhất, lỗi / null không được cache. */
class TtlCacheTest {

    private final AtomicLong now = new AtomicLong(1_000);
    private final AtomicInteger loads = new AtomicInteger();

    private String load(String v) {
        loads.incrementAndGet();
        return v;
    }

    @Test
    void hit_until_ttl_then_reload() {
        TtlCache<String, String> c = new TtlCache<>(100, 10, now::get);
        assertEquals("a", c.get("k", () -> load("a")));
        now.addAndGet(99);
        assertEquals("a", c.get("k", () -> load("b")), "chưa hết hạn: không nạp lại");
        assertEquals(1, loads.get());
        now.addAndGet(1);
        assertEquals("b", c.get("k", () -> load("b")), "đúng hạn: nạp lại");
        assertEquals(2, loads.get());
    }

    @Test
    void full_cache_drops_expired_then_oldest() {
        TtlCache<String, String> c = new TtlCache<>(100, 3, now::get);
        c.get("a", () -> load("a"));
        now.addAndGet(10);
        c.get("b", () -> load("b"));
        now.addAndGet(10);
        c.get("c", () -> load("c"));
        now.addAndGet(10);
        c.get("d", () -> load("d")); // đầy, chưa mục nào hết hạn -> bỏ "a" (cũ nhất)
        assertEquals(3, c.size());
        assertEquals("a2", c.get("a", () -> load("a2")), "a đã bị bỏ");
        assertEquals("c", c.get("c", () -> load("x")), "c vẫn còn");

        now.addAndGet(1_000); // mọi mục hết hạn
        c.get("e", () -> load("e"));
        assertEquals(1, c.size(), "đầy -> dọn hết mục hết hạn trước");
    }

    @Test
    void failures_and_nulls_are_not_cached() {
        TtlCache<String, String> c = new TtlCache<>(100, 10, now::get);
        assertThrows(IllegalStateException.class, () -> c.get("k", () -> {
            throw new IllegalStateException("down");
        }));
        assertEquals(null, c.get("k", () -> null));
        assertEquals(0, c.size());
        assertEquals("ok", c.get("k", () -> load("ok")));
        assertEquals(1, c.size());
    }
}
