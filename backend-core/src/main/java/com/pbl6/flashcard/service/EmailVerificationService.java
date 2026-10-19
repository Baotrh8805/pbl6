package com.pbl6.flashcard.service;

import com.pbl6.flashcard.model.EmailVerificationToken;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.repository.EmailVerificationTokenRepository;
import com.pbl6.flashcard.repository.UserRepository;
import com.pbl6.flashcard.security.AttemptLimiter;
import com.pbl6.flashcard.security.LoginAttemptLimiter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;

/**
 * Xác thực email (hợp đồng API đợt 2 §3, A1): link chứa token ngẫu nhiên, DB chỉ lưu SHA-256, hết hạn sau {@link #TTL}, dùng 1 lần;
 * xin gửi lại thì link cũ hết hiệu lực. Cũng là nơi DUY NHẤT quyết định "người này có bị chặn vì chưa xác thực không"
 * ({@link #mustVerify}) để đăng nhập, làm mới phiên và JwtAuthenticationFilter luôn cùng một luật.
 * <p>
 * {@code app.auth.email-verification-forced-off=true} (profile e2e, xem application-e2e.properties): coi như khoá
 * email_verification_required đang tắt — smoke test đăng ký rồi đăng nhập ngay, không có hộp thư để bấm link. Không đặt ở môi
 * trường thật: admin tắt / bật tính năng bằng khoá app_settings ở Admin Panel > Cấu hình.
 */
@Service
public class EmailVerificationService {

    private static final Logger log = LoggerFactory.getLogger(EmailVerificationService.class);

    public static final Duration TTL = Duration.ofHours(24);
    /** Mã lỗi trong JSON 403 của đăng nhập (và 401 của làm mới phiên): frontend hiện nút "Gửi lại email xác thực". */
    public static final String NOT_VERIFIED_CODE = "EMAIL_NOT_VERIFIED";
    public static final String NOT_VERIFIED_MESSAGE =
            "Tài khoản chưa xác thực email. Hãy mở liên kết trong email chúng tôi đã gửi, hoặc yêu cầu gửi lại.";
    static final String INVALID = "Liên kết xác thực email không hợp lệ hoặc đã hết hạn.";

    private final UserRepository users;
    private final EmailVerificationTokenRepository tokens;
    private final MailService mail;
    private final SettingsService settings;
    private final TransactionTemplate tx;
    private final boolean forcedOff;
    private final SecureRandom random = new SecureRandom();
    /** Như quên mật khẩu: 5 lần / 15 phút cho mỗi (IP, email) -> không dùng được để spam hộp thư người khác. */
    private final AttemptLimiter resendLimiter = new AttemptLimiter(5, Duration.ofMinutes(15));

    public EmailVerificationService(UserRepository users, EmailVerificationTokenRepository tokens, MailService mail,
                                    SettingsService settings, PlatformTransactionManager txManager,
                                    @Value("${app.auth.email-verification-forced-off:false}") boolean forcedOff) {
        this.users = users;
        this.tokens = tokens;
        this.mail = mail;
        this.settings = settings;
        this.tx = new TransactionTemplate(txManager);
        this.forcedOff = forcedOff;
    }

    /**
     * Tính năng đang bật? Đọc app_settings mỗi lần (1 PK lookup) nên Admin đổi là có hiệu lực ngay. Dòng cấu hình thiếu / hỏng
     * (sửa tay DB) -> coi như bật theo giá trị seed (quyết định D2) thay vì 500 ở mọi request.
     */
    public boolean required() {
        if (forcedOff) return false;
        try {
            return settings.getBool(SettingsService.KEY_EMAIL_VERIFICATION);
        } catch (RuntimeException e) {
            log.warn("Không đọc được {} trong app_settings, coi như bật", SettingsService.KEY_EMAIL_VERIFICATION);
            return true;
        }
    }

    /**
     * Người này bị chặn (đăng nhập 403, refresh 401, access token đang có 401)? Chỉ USER chưa xác thực khi tính năng bật; staff
     * không bao giờ bị chặn. Kiểm cột trước để người đã xác thực (gần như mọi request) không tốn thêm truy vấn cấu hình.
     */
    public boolean mustVerify(User u) {
        return u.getEmailVerifiedAt() == null && u.getRole() == Role.USER && required();
    }

    /**
     * Sinh link mới (link cũ hết hiệu lực) và gửi mail. Lỗi gửi chỉ ghi log (MailService): người dùng còn nút gửi lại.
     * <p>
     * KHÔNG @Transactional: chỉ việc ghi token nằm trong một transaction ngắn, mail gửi SAU khi commit. Đăng ký / gửi lại là
     * endpoint công khai; SMTP chậm hay treo mà vẫn ở trong transaction thì mỗi request giữ một kết nối Hikari suốt lúc chờ
     * -> vài request song song là cạn pool, mọi API khác 500. Gửi sau commit còn bảo đảm link trong mail luôn dùng được.
     * Người gọi (AuthService.register, {@link #resend}) không mở transaction; gọi từ trong một transaction thì việc ghi token
     * nhập vào transaction đó và mail lại đi trước commit.
     */
    public void issue(User user) {
        String token = tx.execute(s -> {
            tokens.deleteByUserId(user.getId());
            byte[] raw = new byte[32];
            random.nextBytes(raw);
            String t = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
            tokens.save(new EmailVerificationToken(user.getId(), PasswordResetService.sha256(t), Instant.now().plus(TTL)));
            return t;
        });
        String link = mail.frontendLink("/verify-email?token=" + token);
        mail.sendLink(user.getEmail(), "xác thực email", "Xác thực email NihonGen",
                "Chào mừng bạn đến với NihonGen!\n\n"
                        + "Mở liên kết sau trong " + TTL.toHours() + " giờ để xác thực email và bắt đầu học:\n" + link + "\n\n"
                        + "Nếu bạn không đăng ký tài khoản này, hãy bỏ qua email này.",
                link);
    }

    /** Token đúng và còn hạn -> đánh dấu đã xác thực, xoá mọi link của người đó (dùng 1 lần). Trả email đã xác thực. */
    @Transactional
    public String verify(String token) {
        EmailVerificationToken saved = tokens.findByTokenHash(PasswordResetService.sha256(token))
                .filter(t -> t.getExpiresAt().isAfter(Instant.now()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, INVALID));
        User user = users.findById(saved.getUserId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, INVALID));
        if (user.getEmailVerifiedAt() == null) {
            user.setEmailVerifiedAt(Instant.now());
            users.save(user);
        }
        tokens.deleteByUserId(user.getId());
        return user.getEmail();
    }

    /**
     * Gửi lại link. Email không tồn tại / đã xác thực / là staff cũng không báo lỗi: không cho dò email nào đã đăng ký.
     * Vẫn gửi khi admin đang tắt tính năng: xác thực sớm thì bật lại không bị chặn.
     * Không @Transactional: {@link #issue} tự mở transaction ngắn cho token rồi gửi mail ngoài transaction.
     */
    public void resend(String email, String ip) {
        String normalized = User.normalizeEmail(email);
        String key = LoginAttemptLimiter.key(ip, normalized);
        if (resendLimiter.isBlocked(key)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Bạn đã yêu cầu quá nhiều lần. Vui lòng thử lại sau 15 phút.");
        }
        resendLimiter.record(key);
        users.findByEmail(normalized)
                .filter(u -> u.getEmailVerifiedAt() == null && u.getRole() == Role.USER)
                .ifPresent(this::issue);
    }
}
