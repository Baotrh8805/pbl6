package com.pbl6.flashcard.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Arrays;

/**
 * B5.7: backend không có khoá nội bộ ai-service (app.ai-service.key rỗng) thì ai-service chỉ nhận request từ localhost — ổn khi
 * dev, nhưng trên máy chủ (ai-service ở máy khác) là lỗi cấu hình: ghi một dòng WARN lúc khởi động ở mọi profile trừ e2e / test.
 */
@Component
public class AiServiceKeyWarning {

    private static final Logger log = LoggerFactory.getLogger(AiServiceKeyWarning.class);

    public AiServiceKeyWarning(@Value("${app.ai-service.key:}") String key,
                               @Value("${spring.profiles.active:}") String profiles) {
        if (key != null && !key.isBlank()) return;
        boolean quiet = Arrays.stream(profiles.split(",")).map(String::trim).anyMatch(p -> p.equals("e2e") || p.equals("test"));
        if (!quiet) {
            log.warn("AI_SERVICE_KEY chưa đặt: backend gọi ai-service không có khoá nội bộ (ai-service chỉ nhận localhost). "
                    + "Khi triển khai hãy đặt cùng một khoá ở cả backend lẫn ai-service.");
        }
    }
}
