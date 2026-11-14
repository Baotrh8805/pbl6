package com.pbl6.flashcard.service;

import com.pbl6.flashcard.model.Deck;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.repository.DeckRepository;
import com.pbl6.flashcard.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;

/**
 * Người dùng tự xoá tài khoản (plan G4/B5, Nghị định 13/2023): ẩn danh hoá hàng users (giữ FK của bộ thẻ public, đánh giá,
 * báo cáo, nhật ký), xoá cứng dữ liệu cá nhân. Bộ thẻ public ở lại Thư viện dưới tên "Người dùng đã xoá".
 * ponytail: xoá ngay, không có thời gian ân hạn; thêm cột deleted_at + job khôi phục khi có khiếu nại xoá nhầm.
 */
@Service
public class AccountDeletionService {
    public static final String DELETED_NAME = "Người dùng đã xoá";

    /** Email ẩn danh hoá của tài khoản đã tự xoá: duy nhất theo id, không phải hộp thư thật. */
    public static String anonymizedEmail(Long uid) {
        return "deleted+" + uid + "@deleted.local";
    }

    /**
     * Tài khoản đã tự xoá (khoá vĩnh viễn: không khiếu nại, không mở khoá được)? So khớp đúng email ẩn danh của CHÍNH id đó
     * thay vì chỉ đuôi @deleted.local: ai đó đăng ký một địa chỉ @deleted.local cũng không biến thành "tài khoản đã xoá".
     */
    public static boolean isDeleted(User u) {
        return u.getId() != null && anonymizedEmail(u.getId()).equals(u.getEmail());
    }

    /** Đuôi email dành riêng cho tài khoản đã tự xoá (anonymizedEmail). */
    public static final String RESERVED_DOMAIN = "@deleted.local";

    /**
     * Email (đã chuẩn hoá) thuộc miền dành riêng -> đăng ký không nhận (AuthService.register). Email ẩn danh đoán được theo id:
     * nếu ai đó đăng ký trước deleted+{id}@deleted.local thì lúc người dùng {id} tự xoá, users.save() đụng unique email và họ
     * không xoá được tài khoản; đồng thời admin không còn bị lẫn tài khoản thật với tài khoản đã xoá trong danh sách.
     */
    public static boolean isReservedEmail(String normalizedEmail) {
        return normalizedEmail != null && normalizedEmail.endsWith(RESERVED_DOMAIN);
    }

    /** 409 khi admin mở khoá tài khoản đã tự xoá (trang Người dùng hoặc khiếu nại UNLOCK). */
    public static final String CANNOT_UNLOCK = "Tài khoản đã bị xoá theo yêu cầu, không thể mở khoá.";
    /** 409 khi admin đổi vai trò / Premium / hạn mức AI của tài khoản đã tự xoá. */
    public static final String CANNOT_CHANGE = "Tài khoản đã bị xoá theo yêu cầu, không thể thay đổi.";

    private final UserRepository users;
    private final DeckRepository decks;
    private final DeckService deckService;
    private final PasswordEncoder passwordEncoder;
    private final RefreshTokenService refreshTokens;
    private final AuditService audit;
    private final JdbcTemplate jdbc;

    public AccountDeletionService(UserRepository users, DeckRepository decks, DeckService deckService,
                                  PasswordEncoder passwordEncoder, RefreshTokenService refreshTokens, AuditService audit,
                                  JdbcTemplate jdbc) {
        this.users = users;
        this.decks = decks;
        this.deckService = deckService;
        this.passwordEncoder = passwordEncoder;
        this.refreshTokens = refreshTokens;
        this.audit = audit;
        this.jdbc = jdbc;
    }

    @Transactional
    public void deleteOwnAccount(String email, String password) {
        User u = users.findByEmail(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy người dùng."));
        if (u.getRole() != Role.USER) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Tài khoản quản trị không tự xoá được; nhờ Super admin chuyển về người học trước.");
        }
        if (!passwordEncoder.matches(password, u.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mật khẩu không đúng!");
        }
        Long uid = u.getId();
        String oldEmail = u.getEmail();

        // 1) Bộ thẻ riêng tư (kèm thẻ, ôn tập của mọi người trên thẻ đó, chia sẻ, đánh giá, báo cáo, quiz) - dùng lại DeckService
        for (Deck d : decks.findByOwnerIdAndVisibility(uid, Deck.PRIVATE)) deckService.deleteDeck(d);
        // 2) Dữ liệu học & cá nhân (FK không cascade vì hàng users còn giữ lại)
        for (String table : new String[] {"reviews", "review_logs", "quiz_results", "quiz_attempts", "learning_paths",
                "extraction_jobs", "notifications", "deck_shares", "folder_shares", "password_reset_tokens", "practice_logs",
                "email_verification_tokens", "account_appeals"}) {
            jdbc.update("DELETE FROM " + table + " WHERE user_id = ?", uid);
        }
        jdbc.update("DELETE FROM folders WHERE user_id = ?", uid); // decks.folder_id -> NULL (bộ thẻ public còn lại)
        refreshTokens.revokeAll(uid);

        // 3) Ẩn danh hoá: email duy nhất, mật khẩu ngẫu nhiên, khoá vĩnh viễn, token cũ vô hiệu (pcv)
        u.setEmail(anonymizedEmail(uid));
        u.setFullName(DELETED_NAME);
        u.setPasswordHash(passwordEncoder.encode(UUID.randomUUID().toString()));
        u.setPasswordChangedAt(Instant.now());
        u.setLockedAt(Instant.now().truncatedTo(ChronoUnit.MICROS)); // micro giây = timestamptz, như khoá của admin
        u.setLockedReason("Tài khoản đã được xoá theo yêu cầu của chủ tài khoản.");
        u.setIsPremium(false);
        u.setExtractionDailyLimit(null);
        users.save(u);
        audit.log(uid, "USER_SELF_DELETE", "USER", String.valueOf(uid), Map.of("email", oldEmail));
    }
}
