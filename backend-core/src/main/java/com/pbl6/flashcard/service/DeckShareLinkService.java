package com.pbl6.flashcard.service;

import com.pbl6.flashcard.config.CodedStatusException;
import com.pbl6.flashcard.model.Deck;
import com.pbl6.flashcard.model.DeckShare;
import com.pbl6.flashcard.repository.DeckRepository;
import com.pbl6.flashcard.repository.DeckShareRepository;
import com.pbl6.flashcard.security.AttemptLimiter;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Link chia sẻ bộ thẻ (D9, kế hoạch 2026-10-26 B1). Cột decks.share_token (V33) và share_password_hash (V35, rà soát 27/10) đọc /
 * ghi bằng JDBC để entity Deck không đổi. Token 32 byte ngẫu nhiên base64url (43 ký tự); người đã đăng nhập mở /d/<token> được
 * thêm vào deck_shares quyền VIEWER (xem, học, sao chép dù bộ riêng tư). Thu hồi / đổi token không gỡ người đã nhận.
 * <p>Mật khẩu link (tuỳ chọn): chủ đặt khi tạo / đổi link, lưu BCrypt; người mở link phải gửi đúng mật khẩu mới được thêm quyền
 * (chủ và người đã có quyền trực tiếp không cần). Sai mật khẩu quá 10 lần / 15 phút (theo người mở) -> 429.
 */
@Service
public class DeckShareLinkService {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Pattern TOKEN = Pattern.compile("^[A-Za-z0-9_-]{43}$");
    static final String NOT_FOUND = "Liên kết chia sẻ không tồn tại hoặc đã bị thu hồi.";
    public static final String PASSWORD_REQUIRED = "SHARE_PASSWORD_REQUIRED";
    public static final String PASSWORD_WRONG = "SHARE_PASSWORD_WRONG";
    public static final int PASSWORD_MIN = 4;
    public static final int PASSWORD_MAX = 72;
    static final int WRONG_MAX = 10;
    static final Duration WRONG_WINDOW = Duration.ofMinutes(15);

    /** token null = chưa có link; hasPassword = link cần mật khẩu khi mở. */
    public record ShareLink(String token, boolean hasPassword) {}

    public record Accepted(String deckId, String access) {}

    private final DeckRepository decks;
    private final DeckShareRepository shares;
    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;
    private final AttemptLimiter wrongPassword = new AttemptLimiter(WRONG_MAX, WRONG_WINDOW);

    public DeckShareLinkService(DeckRepository decks, DeckShareRepository shares, JdbcTemplate jdbc, PasswordEncoder encoder) {
        this.decks = decks;
        this.shares = shares;
        this.jdbc = jdbc;
        this.encoder = encoder;
    }

    private Deck owned(Long uid, String deckId) {
        Deck deck = decks.findById(deckId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy bộ thẻ."));
        if (!uid.equals(deck.getOwnerId())) {
            // xem được nhưng không phải chủ = 403; không xem được cũng trả 403 thay vì lộ chi tiết (deck id do chính client gửi)
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Chỉ chủ bộ thẻ được quản lý liên kết chia sẻ.");
        }
        return deck;
    }

    @Transactional(readOnly = true)
    public ShareLink get(Long uid, String deckId) {
        owned(uid, deckId);
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT share_token, share_password_hash FROM decks WHERE id = ?", deckId);
        if (rows.isEmpty() || rows.get(0).get("share_token") == null) return new ShareLink(null, false);
        return new ShareLink((String) rows.get(0).get("share_token"), rows.get(0).get("share_password_hash") != null);
    }

    /**
     * Tạo link mới (bộ đã có link thì thay token: link cũ hết hiệu lực ngay). password null / rỗng = link không cần mật khẩu;
     * có = 4..72 ký tự, lưu BCrypt (không bao giờ trả lại cho client).
     */
    @Transactional
    public ShareLink rotate(Long uid, String deckId, String password) {
        owned(uid, deckId);
        String pw = password == null ? "" : password.strip();
        if (!pw.isEmpty() && (pw.length() < PASSWORD_MIN || pw.length() > PASSWORD_MAX)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Mật khẩu link phải từ " + PASSWORD_MIN + " đến " + PASSWORD_MAX + " ký tự.");
        }
        String token = newToken();
        jdbc.update("UPDATE decks SET share_token = ?, share_password_hash = ? WHERE id = ?",
                token, pw.isEmpty() ? null : encoder.encode(pw), deckId);
        return new ShareLink(token, !pw.isEmpty());
    }

    @Transactional
    public void revoke(Long uid, String deckId) {
        owned(uid, deckId);
        jdbc.update("UPDATE decks SET share_token = NULL, share_password_hash = NULL WHERE id = ?", deckId);
    }

    /**
     * Mở link: chủ -> không đổi gì; người đã có quyền trực tiếp -> giữ quyền đó; còn lại -> thêm quyền xem, qua mật khẩu nếu link
     * có (thiếu -> 403 SHARE_PASSWORD_REQUIRED, sai -> 403 SHARE_PASSWORD_WRONG, sai quá nhiều -> 429).
     */
    @Transactional
    public Accepted accept(Long uid, String token, String password) {
        if (token == null || !TOKEN.matcher(token).matches()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, NOT_FOUND);
        }
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT id, share_password_hash FROM decks WHERE share_token = ?", token);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, NOT_FOUND);
        String deckId = (String) rows.get(0).get("id");
        String hash = (String) rows.get(0).get("share_password_hash");
        Deck deck = decks.findById(deckId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, NOT_FOUND));
        if (uid.equals(deck.getOwnerId())) return new Accepted(deck.getId(), "owner");
        DeckShare existing = shares.findByDeckIdAndUserId(deck.getId(), uid).orElse(null);
        if (existing != null) return new Accepted(deck.getId(), existing.getPermission().toLowerCase(Locale.ROOT));
        if (hash != null) {
            String key = String.valueOf(uid);
            if (wrongPassword.isBlocked(key)) {
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Bạn nhập sai mật khẩu quá nhiều lần, thử lại sau 15 phút.");
            }
            if (password == null || password.isBlank()) {
                throw new CodedStatusException(HttpStatus.FORBIDDEN, PASSWORD_REQUIRED, "Liên kết này cần mật khẩu để mở.");
            }
            if (!encoder.matches(password.strip(), hash)) {
                wrongPassword.record(key);
                throw new CodedStatusException(HttpStatus.FORBIDDEN, PASSWORD_WRONG, "Mật khẩu liên kết không đúng.");
            }
            wrongPassword.reset(key);
        }
        shares.save(new DeckShare(deck.getId(), uid, DeckShare.VIEWER));
        return new Accepted(deck.getId(), "viewer");
    }

    static String newToken() {
        byte[] b = new byte[32];
        RANDOM.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }
}
