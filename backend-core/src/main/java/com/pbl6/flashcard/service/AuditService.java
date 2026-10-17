package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.admin.AdminPage;
import com.pbl6.flashcard.dto.admin.AuditLogResponse;
import com.pbl6.flashcard.model.AdminAuditLog;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.repository.AdminAuditLogRepository;
import com.pbl6.flashcard.repository.UserRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Nhật ký thao tác ghi của staff. {@link #log} chạy trong transaction của nghiệp vụ gọi nó (MANDATORY):
 * nghiệp vụ rollback thì dòng nhật ký cũng biến mất, không bao giờ có nhật ký "ảo".
 */
@Service
public class AuditService {

    private final AdminAuditLogRepository logs;
    private final UserRepository users;

    public AuditService(AdminAuditLogRepository logs, UserRepository users) {
        this.logs = logs;
        this.users = users;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void log(Long actorId, String action, String targetType, String targetId, Map<String, Object> detail) {
        AdminAuditLog l = new AdminAuditLog();
        l.setActorId(actorId);
        l.setAction(action);
        l.setTargetType(targetType);
        l.setTargetId(targetId);
        l.setDetail(detail);
        logs.save(l);
    }

    /** {field: {before, after}}; gộp nhiều trường bằng {@link Map#putAll}. */
    public static Map<String, Object> diff(String field, Object before, Object after) {
        Map<String, Object> change = new HashMap<>();
        change.put("before", before);
        change.put("after", after);
        Map<String, Object> m = new HashMap<>();
        m.put(field, change);
        return m;
    }

    @Transactional(readOnly = true)
    public AdminPage<AuditLogResponse> search(Long actorId, String targetType, Instant from, Instant to, int page, int size) {
        Page<AdminAuditLog> p = logs.search(actorId, targetType, from, to, PageRequest.of(page, size));
        Map<Long, String> emails = emailsOf(p.getContent().stream().map(AdminAuditLog::getActorId).toList());
        return AdminPage.of(p, p.getContent().stream().map(l -> AuditLogResponse.of(l, emails.get(l.getActorId()))).toList());
    }

    /** Email theo id cho cả trang bằng một truy vấn; các service admin khác dùng lại. */
    public Map<Long, String> emailsOf(List<Long> ids) {
        return users.findAllById(ids).stream().collect(Collectors.toMap(User::getId, User::getEmail, (a, b) -> a));
    }
}
