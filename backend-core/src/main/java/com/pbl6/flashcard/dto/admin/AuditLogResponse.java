package com.pbl6.flashcard.dto.admin;

import com.pbl6.flashcard.model.AdminAuditLog;

import java.time.Instant;
import java.util.Map;

public record AuditLogResponse(Long id, String actorEmail, String action, String targetType, String targetId,
                               Map<String, Object> detail, Instant createdAt) {

    public static AuditLogResponse of(AdminAuditLog l, String actorEmail) {
        return new AuditLogResponse(l.getId(), actorEmail, l.getAction(), l.getTargetType(), l.getTargetId(),
                l.getDetail(), l.getCreatedAt());
    }
}
