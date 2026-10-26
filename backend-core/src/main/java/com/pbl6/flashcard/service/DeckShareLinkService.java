package com.pbl6.flashcard.service;

import com.pbl6.flashcard.model.Deck;
import com.pbl6.flashcard.model.DeckShare;
import com.pbl6.flashcard.repository.DeckRepository;
import com.pbl6.flashcard.repository.DeckShareRepository;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Link chia sẻ bộ thẻ (D9, kế hoạch 2026-10-26 B1). Cột decks.share_token (V33) đọc / ghi bằng JDBC để entity Deck không đổi.
 * <ul>
 *   <li>Chủ bộ: xem / tạo (hoặc đổi sang token mới, link cũ hết hiệu lực) / thu hồi.</li>
 *   <li>Người đã đăng nhập mở link: được thêm quyền VIEWER vào deck_shares (cùng cơ chế mời qua email: xem + học + sao chép dù bộ
 *       riêng tư); đã có quyền cao hơn thì giữ nguyên. Thu hồi / đổi token không gỡ người đã nhận — chủ gỡ từng người như trước.</li>
 * </ul>
 */
@Service
public class DeckShareLinkService {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Pattern TOKEN = Pattern.compile("^[A-Za-z0-9_-]{43}$");
    private static final String NOT_FOUND = "Liên kết chia sẻ không tồn tại hoặc đã bị thu hồi.";

    public record ShareLink(String token) {}

    public record Accepted(String deckId, String access) {}

    private final DeckRepository decks;
    private final DeckShareRepository shares;
    private final JdbcTemplate jdbc;

    public DeckShareLinkService(DeckRepository decks, DeckShareRepository shares, JdbcTemplate jdbc) {
        this.decks = decks;
        this.shares = shares;
        this.jdbc = jdbc;
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
        List<String> t = jdbc.queryForList("SELECT share_token FROM decks WHERE id = ?", String.class, deckId);
        return new ShareLink(t.isEmpty() ? null : t.get(0));
    }

    /** Tạo link mới (bộ đã có link thì thay token: link cũ hết hiệu lực ngay). */
    @Transactional
    public ShareLink rotate(Long uid, String deckId) {
        owned(uid, deckId);
        String token = newToken();
        jdbc.update("UPDATE decks SET share_token = ? WHERE id = ?", token, deckId);
        return new ShareLink(token);
    }

    @Transactional
    public void revoke(Long uid, String deckId) {
        owned(uid, deckId);
        jdbc.update("UPDATE decks SET share_token = NULL WHERE id = ?", deckId);
    }

    /** Mở link: chủ → không đổi gì; người khác → thêm quyền xem nếu chưa có quyền chia sẻ trực tiếp. */
    @Transactional
    public Accepted accept(Long uid, String token) {
        if (token == null || !TOKEN.matcher(token).matches()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, NOT_FOUND);
        }
        List<String> ids = jdbc.queryForList("SELECT id FROM decks WHERE share_token = ?", String.class, token);
        if (ids.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, NOT_FOUND);
        Deck deck = decks.findById(ids.get(0)).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, NOT_FOUND));
        if (uid.equals(deck.getOwnerId())) return new Accepted(deck.getId(), "owner");
        DeckShare existing = shares.findByDeckIdAndUserId(deck.getId(), uid).orElse(null);
        if (existing != null) return new Accepted(deck.getId(), existing.getPermission().toLowerCase(java.util.Locale.ROOT));
        shares.save(new DeckShare(deck.getId(), uid, DeckShare.VIEWER));
        return new Accepted(deck.getId(), "viewer");
    }

    static String newToken() {
        byte[] b = new byte[32];
        RANDOM.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }
}
