package com.pbl6.flashcard.service;

import com.pbl6.flashcard.model.PasswordResetToken;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.repository.PasswordResetTokenRepository;
import com.pbl6.flashcard.repository.UserRepository;
import com.pbl6.flashcard.security.AttemptLimiter;
import com.pbl6.flashcard.security.LoginAttemptLimiter;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;

/**
 * Quên mật khẩu: gửi link chứa token ngẫu nhiên (dùng 1 lần, hết hạn sau {@link #TTL}); DB chỉ lưu SHA-256.
 * Đặt lại xong: token cũ bị thu hồi như đổi mật khẩu (passwordChangedAt + refresh token) -> mọi phiên cũ đăng xuất.
 * Gửi mail qua {@link MailService}: không cấu hình SMTP (spring.mail.host) thì link được ghi vào log để dev dùng.
 */
@Service
public class PasswordResetService {

    public static final Duration TTL = Duration.ofMinutes(30);
    static final String INVALID = "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.";

    private final UserRepository userRepository;
    private final PasswordResetTokenRepository tokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final RefreshTokenService refreshTokens;
    private final MailService mail;
    private final TransactionTemplate tx;
    private final SecureRandom random = new SecureRandom();
    private final AttemptLimiter forgotLimiter = new AttemptLimiter(5, Duration.ofMinutes(15));

    public PasswordResetService(UserRepository userRepository, PasswordResetTokenRepository tokenRepository,
                                PasswordEncoder passwordEncoder, RefreshTokenService refreshTokens,
                                MailService mail, PlatformTransactionManager txManager) {
        this.userRepository = userRepository;
        this.tokenRepository = tokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.refreshTokens = refreshTokens;
        this.mail = mail;
        this.tx = new TransactionTemplate(txManager);
    }

    /**
     * Email không tồn tại cũng không báo lỗi: không cho dò email nào đã đăng ký.
     * Tối đa 5 lần / 15 phút cho mỗi (IP, email) -> không spam hộp thư người khác.
     * <p>
     * Không @Transactional: ghi token trong một transaction ngắn, gửi mail SAU khi commit (như
     * EmailVerificationService.issue) để SMTP chậm không giữ kết nối DB của endpoint công khai này.
     */
    public void requestReset(String email, String ip) {
        String key = LoginAttemptLimiter.key(ip, User.normalizeEmail(email));
        if (forgotLimiter.isBlocked(key)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Bạn đã yêu cầu quá nhiều lần. Vui lòng thử lại sau 15 phút.");
        }
        forgotLimiter.record(key);
        userRepository.findByEmail(User.normalizeEmail(email)).ifPresent(user -> {
            String token = tx.execute(s -> {
                tokenRepository.deleteByUserId(user.getId()); // link mới thay link cũ
                byte[] raw = new byte[32];
                random.nextBytes(raw);
                String t = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
                tokenRepository.save(new PasswordResetToken(user.getId(), sha256(t), Instant.now().plus(TTL)));
                return t;
            });
            send(user.getEmail(), mail.frontendLink("/reset-password?token=" + token));
        });
    }

    @Transactional
    public void reset(String token, String newPassword) {
        PasswordResetToken saved = tokenRepository.findByTokenHash(sha256(token))
                .filter(t -> t.getExpiresAt().isAfter(Instant.now()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, INVALID));
        User user = userRepository.findById(saved.getUserId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, INVALID));
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setPasswordChangedAt(Instant.now());
        userRepository.save(user);
        tokenRepository.deleteByUserId(user.getId());
        refreshTokens.revokeAll(user.getId());
    }

    private void send(String to, String link) {
        mail.sendLink(to, "đặt lại mật khẩu", "Đặt lại mật khẩu NihonGen",
                "Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu cho tài khoản này.\n\n"
                        + "Mở liên kết sau trong " + TTL.toMinutes() + " phút để đặt mật khẩu mới:\n" + link + "\n\n"
                        + "Nếu không phải bạn yêu cầu, hãy bỏ qua email này; mật khẩu hiện tại vẫn giữ nguyên.",
                link);
    }

    static String sha256(String value) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e); // SHA-256 luôn có sẵn trong JDK
        }
    }
}
