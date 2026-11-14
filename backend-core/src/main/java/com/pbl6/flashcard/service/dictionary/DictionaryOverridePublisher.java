package com.pbl6.flashcard.service.dictionary;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.dto.dictionary.DictDtos;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * Đẩy lớp ghi đè của admin (dict_overrides) sang ai-service để bản sửa có hiệu lực toàn hệ thống (D22, spec §9.1): bóc tách, thẻ
 * chữ Hán, đồ thị Hán-Việt, cảnh báo mâu thuẫn. Backend luôn tự áp ghi đè khi trả mục từ (không phụ thuộc lần đẩy này).
 * <p>
 * Khi nào: lúc khởi động (luồng nền), sau khi giao dịch sửa commit ({@link DictOverrideChangedEvent}), mỗi 10 phút (bù lần lỗi),
 * và khi admin bấm "Đồng bộ ai-service". ai-service lỗi → cảnh báo log tối đa 1 lần / 10 phút, không báo lỗi cho admin.
 * Tắt bằng app.dictionary.sync.enabled=false (test tích hợp: ai-service giả không có thật).
 */
@Component
public class DictionaryOverridePublisher {

    private static final Logger log = LoggerFactory.getLogger(DictionaryOverridePublisher.class);
    private static final long WARN_EVERY_MS = 10 * 60_000L;

    /** Phát sau mỗi lần thêm / sửa / bỏ ghi đè (trong giao dịch); đẩy chạy sau khi commit. */
    public record DictOverrideChangedEvent(String entryKey) {}

    private final DictionaryStore store;
    private final DictionaryAiClient ai;
    private final boolean enabled;
    private volatile long lastWarnAt;
    private volatile long lastPushedVersion = -1;

    public DictionaryOverridePublisher(DictionaryStore store, DictionaryAiClient ai,
                                       @Value("${app.dictionary.sync.enabled:true}") boolean enabled) {
        this.store = store;
        this.ai = ai;
        this.enabled = enabled;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        if (enabled) CompletableFuture.runAsync(this::pushQuietly);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onChange(DictOverrideChangedEvent event) {
        if (enabled) CompletableFuture.runAsync(this::pushQuietly);
    }

    @Scheduled(fixedDelay = 600_000L, initialDelay = 600_000L)
    public void scheduled() {
        if (enabled) pushQuietly();
    }

    private void pushQuietly() {
        try {
            push(false);
        } catch (RuntimeException e) {
            long now = System.currentTimeMillis();
            if (now - lastWarnAt > WARN_EVERY_MS) {
                lastWarnAt = now;
                log.warn("Từ điển: chưa đồng bộ được ghi đè sang ai-service ({}); sẽ thử lại sau", e.getMessage());
            }
        }
    }

    /** Đẩy toàn bộ ghi đè (bỏ qua khi ai-service đã có đúng phiên bản, trừ force). Ném lỗi ai-service cho người gọi. */
    public synchronized JsonNode push(boolean force) {
        long version = store.overridesVersion();
        if (!force && version == lastPushedVersion) return null;
        List<Map<String, Object>> items = new ArrayList<>();
        for (DictionaryStore.Override o : store.allOverrides()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("key", o.entryKey());
            m.put("field", o.field());
            m.put("subKey", o.subKey());
            m.put("value", o.value());
            items.add(m);
        }
        JsonNode res = ai.pushOverrides(version, items);
        lastPushedVersion = version;
        return res;
    }

    /** Nút "Đồng bộ ai-service": đẩy ngay rồi đọc lại phiên bản phía ai-service. */
    public DictDtos.SyncResponse syncNow() {
        long backend = store.overridesVersion();
        if (!enabled) return new DictDtos.SyncResponse(backend, null, null, false);
        try {
            push(true);
            JsonNode v = ai.overridesVersion();
            return new DictDtos.SyncResponse(backend, v.path("version").asLong(), v.path("count").asInt(),
                    v.path("version").asLong() == backend);
        } catch (RuntimeException e) {
            log.warn("Từ điển: đồng bộ ai-service thất bại: {}", e.getMessage());
            return new DictDtos.SyncResponse(backend, null, null, false);
        }
    }
}
