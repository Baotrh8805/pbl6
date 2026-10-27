package com.pbl6.flashcard.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.InetAddress;

/**
 * B8: tên instance backend để gắn vào job bóc tách / lộ trình đang xử lý ({@code extraction_jobs.instance_id},
 * {@code learning_paths.instance_id}, V37). Đọc {@code app.instance-id} (biến INSTANCE_ID), rỗng → hostname; tối đa 64 ký tự.
 * Khởi động lại chỉ đánh FAILED việc dở dang của chính instance này (xem ExtractionService / LearningPathService failOrphans).
 */
@Component
public class InstanceId {

    private final String value;

    public InstanceId(@Value("${app.instance-id:}") String configured) {
        String v = configured == null ? "" : configured.strip();
        if (v.isEmpty()) {
            try {
                v = InetAddress.getLocalHost().getHostName();
            } catch (Exception e) {
                v = "";
            }
        }
        if (v == null || v.isBlank()) v = "unknown";
        this.value = v.length() > 64 ? v.substring(0, 64) : v;
    }

    public String value() {
        return value;
    }
}
