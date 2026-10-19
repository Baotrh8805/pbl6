package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.AppealRequest;
import com.pbl6.flashcard.dto.admin.AdminPage;
import com.pbl6.flashcard.dto.admin.AdminUserPatch;
import com.pbl6.flashcard.dto.admin.AppealResolveRequest;
import com.pbl6.flashcard.dto.admin.AppealResponse;
import com.pbl6.flashcard.model.AccountAppeal;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.repository.AccountAppealRepository;
import com.pbl6.flashcard.repository.UserRepository;
import com.pbl6.flashcard.security.AttemptLimiter;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Khiếu nại tài khoản bị khoá (hợp đồng API đợt 2 §6, G1). Người gửi không có token nên mọi phản hồi công khai là 202 chung
 * (không cho dò email nào tồn tại / đang bị khoá); chỉ lưu khi email thuộc tài khoản đang bị khoá. Admin resolve / dismiss
 * atomic bằng UPDATE ... WHERE status = 'OPEN' như báo cáo nội dung (ReportService).
 */
@Service
public class AppealService {

    private static final String NOT_FOUND = "Không tìm thấy khiếu nại.";

    private final AccountAppealRepository appeals;
    private final UserRepository users;
    private final AdminUserService adminUsers;
    private final AuditService audit;
    /**
     * 5 khiếu nại / giờ / IP, đếm cả lần gửi cho email không bị khoá: không dùng được để dò hàng loạt email nào đang bị khoá.
     * ponytail: bộ đếm RAM của 1 instance như AttemptLimiter khác.
     */
    private final AttemptLimiter limiter = new AttemptLimiter(5, Duration.ofHours(1));

    public AppealService(AccountAppealRepository appeals, UserRepository users, AdminUserService adminUsers, AuditService audit) {
        this.appeals = appeals;
        this.users = users;
        this.adminUsers = adminUsers;
        this.audit = audit;
    }

    // ---------- công khai ----------

    /**
     * Không @Transactional: lỗi unique (email đã có khiếu nại OPEN) phải bắt ngay tại save(). Khi đó giữ khiếu nại cũ và vẫn
     * trả 202 như mọi trường hợp khác: người gửi không phân biệt được "đã lưu" và "bỏ qua".
     * <p>
     * Tài khoản đã tự xoá cũng đang khoá (khoá vĩnh viễn) nhưng không nhận khiếu nại: email ẩn danh deleted+{id}@deleted.local
     * đoán được theo id, không chặn thì ai cũng lấp được hàng đợi admin và một lần UNLOCK là hồi sinh tài khoản đã xoá.
     */
    public void create(String email, String message, String ip) {
        // @Size(min = 10) đếm cả khoảng trắng hai đầu nhưng nội dung lưu là bản trim -> kiểm lại để admin không nhận khiếu nại
        // ngắn hơn hợp đồng (10..1000). Kiểm trước bộ đếm như lỗi @Valid: nhập sai không tốn lượt, không phụ thuộc email.
        String text = message.trim();
        if (text.length() < AppealRequest.MESSAGE_MIN) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "message: " + AppealRequest.MESSAGE_SIZE);
        }
        if (limiter.isBlocked(ip)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Bạn đã gửi quá nhiều khiếu nại. Vui lòng thử lại sau 1 giờ.");
        }
        limiter.record(ip);
        String normalized = User.normalizeEmail(email);
        users.findByEmail(normalized)
                .filter(u -> u.getLockedAt() != null && !AccountDeletionService.isDeleted(u))
                .ifPresent(u -> store(normalized, u.getId(), text));
    }

    private void store(String email, Long userId, String message) {
        AccountAppeal a = new AccountAppeal();
        a.setEmail(email);
        a.setUserId(userId);
        a.setMessage(message);
        try {
            appeals.save(a);
        } catch (DataIntegrityViolationException e) {
            // Đã có khiếu nại đang chờ cho email này (uq_account_appeals_open_email): không nhân đôi hàng đợi của admin
        }
    }

    /** Số khiếu nại đang chờ (Admin Panel > Tổng quan: openAppeals). */
    public long countOpen() {
        return appeals.countByStatus(AccountAppeal.OPEN);
    }

    // ---------- admin ----------

    @Transactional(readOnly = true)
    public AdminPage<AppealResponse> list(String status, int page, int size) {
        Page<AccountAppeal> p = appeals.search(status, PageRequest.of(page, size));
        return AdminPage.of(p, toResponses(p.getContent()));
    }

    /**
     * UNLOCK đi qua AdminUserService.patch(locked=false): cùng quy tắc bậc (ADMIN chỉ mở khoá USER -> 403) và cùng audit
     * USER_UNLOCK như mở khoá ở trang Người dùng. Mọi bước chung một transaction: bị từ chối mở khoá thì khiếu nại vẫn OPEN.
     * Tài khoản đã được mở khoá ở chỗ khác -> patch không đổi gì (không USER_UNLOCK), khiếu nại vẫn đóng với action UNLOCK.
     * Tài khoản đã tự xoá -> 400: khoá vĩnh viễn của AccountDeletionService không được gỡ qua khiếu nại (create() đã không
     * nhận khiếu nại như vậy; đây là chốt chặn cho dữ liệu cũ / ghi tay).
     */
    @Transactional
    public AppealResponse resolve(User actor, Long id, AppealResolveRequest req) {
        AccountAppeal a = find(id);
        String note = trimToNull(req.note());
        close(a, AccountAppeal.RESOLVED, req.action().name(), note, actor);
        if (req.action() == AppealResolveRequest.Action.UNLOCK) {
            User target = a.getUserId() == null ? null : users.findById(a.getUserId()).orElse(null);
            if (target == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tài khoản của khiếu nại này không còn tồn tại.");
            }
            if (AccountDeletionService.isDeleted(target)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Tài khoản này đã bị xoá theo yêu cầu của chủ tài khoản, không mở khoá được.");
            }
            adminUsers.patch(actor, a.getUserId(), new AdminUserPatch(false, null, null, null, null, null));
        }
        Map<String, Object> detail = new HashMap<>();
        detail.put("action", req.action().name());
        detail.put("note", note);
        detail.put("email", a.getEmail());
        audit.log(actor.getId(), "APPEAL_RESOLVE", "APPEAL", String.valueOf(id), detail);
        return reload(id);
    }

    @Transactional
    public AppealResponse dismiss(User actor, Long id, String rawNote) {
        AccountAppeal a = find(id);
        String note = trimToNull(rawNote);
        close(a, AccountAppeal.DISMISSED, null, note, actor);
        Map<String, Object> detail = new HashMap<>();
        detail.put("note", note);
        detail.put("email", a.getEmail());
        audit.log(actor.getId(), "APPEAL_DISMISS", "APPEAL", String.valueOf(id), detail);
        return reload(id);
    }

    private AccountAppeal find(Long id) {
        return appeals.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, NOT_FOUND));
    }

    /** Đóng khiếu nại chỉ khi còn OPEN (một câu UPDATE): hai admin cùng xử lý thì người sau nhận 409. */
    private void close(AccountAppeal a, String status, String action, String note, User actor) {
        int n = appeals.close(a.getId(), status, action, note, actor.getId(), Instant.now());
        if (n == 0) throw new ResponseStatusException(HttpStatus.CONFLICT, "Khiếu nại đã được xử lý.");
    }

    /** close() xoá persistence context (clearAutomatically) -> đọc lại để trả trạng thái mới. */
    private AppealResponse reload(Long id) {
        return toResponses(List.of(find(id))).get(0);
    }

    private static String trimToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    /** Người gửi (trạng thái khoá hiện tại) và người xử lý của cả trang bằng một truy vấn. */
    private List<AppealResponse> toResponses(List<AccountAppeal> rows) {
        if (rows.isEmpty()) return List.of();
        List<Long> ids = rows.stream().flatMap(a -> Stream.of(a.getUserId(), a.getResolvedBy()))
                .filter(Objects::nonNull).distinct().toList();
        Map<Long, User> byId = users.findAllById(ids).stream().collect(Collectors.toMap(User::getId, Function.identity()));
        return rows.stream().map(a -> {
            User resolver = a.getResolvedBy() == null ? null : byId.get(a.getResolvedBy());
            return AppealResponse.of(a, a.getUserId() == null ? null : byId.get(a.getUserId()),
                    resolver == null ? null : resolver.getEmail());
        }).toList();
    }
}
