package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.admin.AdminPage;
import com.pbl6.flashcard.dto.admin.AdminUserPatch;
import com.pbl6.flashcard.dto.admin.AdminUserResponse.Detail;
import com.pbl6.flashcard.dto.admin.AdminUserResponse.Row;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.repository.*;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Admin Panel > Người dùng. Mọi thao tác ghi: kiểm tra bậc (requireBelow) + audit trong cùng transaction. */
@Service
public class AdminUserService {

    private final UserRepository users;
    private final DeckRepository decks;
    private final FlashcardRepository cards;
    private final ExtractionJobRepository jobs;
    private final QuizResultRepository quizzes;
    private final RefreshTokenRepository sessions;
    private final RefreshTokenService refreshTokens;
    private final AuditService audit;
    private final EmailVerificationTokenRepository verificationTokens;

    public AdminUserService(UserRepository users, DeckRepository decks, FlashcardRepository cards,
                            ExtractionJobRepository jobs, QuizResultRepository quizzes, RefreshTokenRepository sessions,
                            RefreshTokenService refreshTokens, AuditService audit, NotificationService notifications,
                            EmailVerificationTokenRepository verificationTokens) {
        this.notifications = notifications;
        this.verificationTokens = verificationTokens;
        this.users = users;
        this.decks = decks;
        this.cards = cards;
        this.jobs = jobs;
        this.quizzes = quizzes;
        this.sessions = sessions;
        this.refreshTokens = refreshTokens;
        this.audit = audit;
    }

    /** Chuỗi tìm kiếm LIKE: '!' là ký tự escape; %, _ là chữ thường. Dùng chung cho các danh sách admin. */
    public static String likePattern(String input) {
        if (input == null || input.isBlank()) return "";
        String escaped = input.trim().toLowerCase(Locale.ROOT)
                .replace("!", "!!").replace("%", "!%").replace("_", "!_");
        return "%" + escaped + "%";
    }

    @Transactional(readOnly = true)
    public AdminPage<Row> list(String q, Role role, Boolean premium, Boolean locked, int page, int size) {
        Page<User> p = users.search(likePattern(q), role, premium, locked, PageRequest.of(page, size));
        Map<Long, Long> deckCounts = p.isEmpty() ? Map.of()
                : decks.countByOwnerIds(p.getContent().stream().map(User::getId).toList()).stream()
                        .collect(Collectors.toMap(DeckRepository.OwnerCount::getOwnerId, DeckRepository.OwnerCount::getN));
        return AdminPage.of(p, p.getContent().stream().map(u -> Row.of(u, deckCounts.getOrDefault(u.getId(), 0L))).toList());
    }

    @Transactional(readOnly = true)
    public Detail detail(Long id) {
        return detail(find(id));
    }

    private Detail detail(User u) {
        Instant now = Instant.now();
        return new Detail(u.getId(), u.getEmail(), u.getFullName(), u.getJlptLevel(), u.getRole(), u.getIsPremium(), u.getPremiumUntil(),
                u.getLockedAt(), u.getLockedReason(), u.getCreatedAt(), u.getExtractionDailyLimit(),
                decks.countByOwnerId(u.getId()), cards.countByDeck_OwnerId(u.getId()),
                jobs.countByUserId(u.getId()), jobs.countByUserIdAndCreatedAtAfter(u.getId(), now.minus(Duration.ofHours(24))),
                quizzes.countByUserId(u.getId()), users.lastReviewAt(u.getId()),
                sessions.countByUserIdAndExpiresAtAfter(u.getId(), now), u.isMustChangePassword(), u.getEmailVerifiedAt() != null);
    }

    /**
     * Xác thực email hộ (người dùng không nhận được mail, hộp thư công ty chặn link...). Theo quy tắc bậc như mọi thao tác ghi.
     * Đã xác thực rồi -> trả chi tiết, không ghi gì và không audit (thao tác không đổi dữ liệu). Link còn trong hộp thư bị huỷ.
     */
    @Transactional
    public Detail verifyEmail(User actor, Long id) {
        User target = find(id);
        requireBelow(actor, target);
        if (target.getEmailVerifiedAt() == null) {
            target.setEmailVerifiedAt(Instant.now());
            users.save(target);
            verificationTokens.deleteByUserId(target.getId());
            audit.log(actor.getId(), "USER_VERIFY_EMAIL", "USER", String.valueOf(id), Map.of("email", target.getEmail()));
        }
        return detail(target);
    }

    private final NotificationService notifications;

    @Transactional
    public Detail patch(User actor, Long id, AdminUserPatch req) {
        User target = find(id);
        requireBelow(actor, target);
        Map<String, Object> changes = new HashMap<>();

        if (req.locked() != null && req.locked() != (target.getLockedAt() != null)) {
            changes.putAll(AuditService.diff("locked", !req.locked(), req.locked()));
            target.setLockedAt(req.locked() ? Instant.now() : null);
            String reason = req.locked() && req.lockedReason() != null && !req.lockedReason().isBlank() ? req.lockedReason().trim() : null;
            target.setLockedReason(reason);
            if (reason != null) changes.put("reason", reason);
            if (req.locked()) refreshTokens.revokeAll(target.getId());
        }
        if (req.premium() != null) {
            // premiumUntil chỉ có nghĩa khi premium = true; null = vĩnh viễn. Gửi premium=true lần nữa với hạn khác = đổi hạn.
            Instant until = req.premium() ? req.premiumUntil() : null;
            boolean was = Boolean.TRUE.equals(target.getIsPremium());
            if (was != req.premium() || !Objects.equals(until, target.getPremiumUntil())) {
                changes.putAll(AuditService.diff("premium", target.getIsPremium(), req.premium()));
                if (!Objects.equals(until, target.getPremiumUntil())) {
                    changes.putAll(AuditService.diff("premiumUntil", target.getPremiumUntil(), until));
                }
                target.setIsPremium(req.premium());
                target.setPremiumUntil(until);
                Map<String, Object> p = new HashMap<>();
                p.put("premium", req.premium());
                p.put("until", until == null ? null : until.toString());
                notifications.notify(target.getId(), com.pbl6.flashcard.model.Notification.PREMIUM_CHANGED, p);
            }
        }
        Integer newLimit = Boolean.TRUE.equals(req.clearLimit()) ? null : req.extractionDailyLimit();
        boolean limitGiven = Boolean.TRUE.equals(req.clearLimit()) || req.extractionDailyLimit() != null;
        if (limitGiven && !Objects.equals(newLimit, target.getExtractionDailyLimit())) {
            changes.putAll(AuditService.diff("extractionDailyLimit", target.getExtractionDailyLimit(), newLimit));
            target.setExtractionDailyLimit(newLimit);
        }

        if (!changes.isEmpty()) {
            users.save(target);
            String action = changes.containsKey("locked") ? (Boolean.TRUE.equals(req.locked()) ? "USER_LOCK" : "USER_UNLOCK")
                    : changes.containsKey("premium") ? "USER_PREMIUM" : "USER_LIMIT";
            audit.log(actor.getId(), action, "USER", String.valueOf(id), changes);
        }
        return detail(target);
    }

    /** Chỉ SUPER_ADMIN (controller). Thu hồi phiên để frontend nạp lại layout đúng vai trò khi đăng nhập lại. */
    @Transactional
    public Detail changeRole(User actor, Long id, Role role) {
        User target = find(id);
        requireNotSelf(actor, target);
        if (target.getRole() != role) {
            audit.log(actor.getId(), "USER_ROLE", "USER", String.valueOf(id), AuditService.diff("role", target.getRole(), role));
            target.setRole(role);
            users.save(target);
            refreshTokens.revokeAll(target.getId());
            notifications.notify(target.getId(), com.pbl6.flashcard.model.Notification.ROLE_CHANGED, Map.of("role", role.name()));
        }
        return detail(target);
    }

    /** Thu hồi refresh token + đánh dấu mọi access token cũ không còn giá trị; mật khẩu không đổi. */
    @Transactional
    public void revokeSessions(User actor, Long id) {
        User target = find(id);
        requireBelow(actor, target);
        refreshTokens.revokeAll(target.getId());
        target.setPasswordChangedAt(Instant.now());
        users.save(target);
        audit.log(actor.getId(), "USER_REVOKE_SESSIONS", "USER", String.valueOf(id), null);
    }

    private User find(Long id) {
        return users.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy người dùng."));
    }

    private static void requireNotSelf(User actor, User target) {
        if (actor.getId().equals(target.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Không thể thao tác trên tài khoản của chính bạn.");
        }
    }

    /** Chỉ thao tác lên người có bậc thấp hơn mình. */
    private static void requireBelow(User actor, User target) {
        requireNotSelf(actor, target);
        if (target.getRole().rank() >= actor.getRole().rank()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bạn không có quyền thao tác trên tài khoản này.");
        }
    }
}
