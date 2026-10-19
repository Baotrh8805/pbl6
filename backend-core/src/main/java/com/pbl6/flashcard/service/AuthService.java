package com.pbl6.flashcard.service;

import com.pbl6.flashcard.config.CodedStatusException;
import com.pbl6.flashcard.dto.AuthRequest;
import com.pbl6.flashcard.dto.AuthResponse;
import com.pbl6.flashcard.dto.RegisterRequest;
import com.pbl6.flashcard.dto.RegisterResponse;
import com.pbl6.flashcard.dto.UserResponse;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.repository.UserRepository;
import com.pbl6.flashcard.security.CustomUserDetails;
import com.pbl6.flashcard.security.LoginAttemptLimiter;
import com.pbl6.flashcard.security.RegisterRateLimiter;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** Lỗi nghiệp vụ ném dưới dạng ResponseStatusException; ApiExceptionHandler đổi thành JSON {status, error, message}. */
@Service

public class AuthService {
    public AuthService(AuthenticationManager authenticationManager, UserRepository userRepository, PasswordEncoder passwordEncoder,
                       RefreshTokenService refreshTokens, LoginAttemptLimiter loginLimiter, RegisterRateLimiter registerLimiter,
                       SettingsService settings, EmailVerificationService verification) {
        this.settings = settings;
        this.verification = verification;
        this.authenticationManager = authenticationManager;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.refreshTokens = refreshTokens;
        this.loginLimiter = loginLimiter;
        this.registerLimiter = registerLimiter;
    }


    private final AuthenticationManager authenticationManager;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final RefreshTokenService refreshTokens;
    private final LoginAttemptLimiter loginLimiter;
    private final RegisterRateLimiter registerLimiter;
    private final SettingsService settings;
    private final EmailVerificationService verification;

    public static final String EMAIL_TAKEN = "Email đã được sử dụng!";
    static final String REGISTERED = "Đăng ký tài khoản thành công!";
    static final String REGISTERED_CHECK_MAIL = "Đăng ký tài khoản thành công! Hãy mở liên kết trong email chúng tôi vừa gửi "
            + "(hiệu lực " + EmailVerificationService.TTL.toHours() + " giờ) để xác thực rồi đăng nhập.";

    /** ip: địa chỉ người gọi, dùng để giới hạn số lần đăng nhập sai theo (IP, email). */
    public AuthResponse login(AuthRequest request, String ip) {
        String key = LoginAttemptLimiter.key(ip, User.normalizeEmail(request.getEmail()));
        if (loginLimiter.isBlocked(key)) {
            // Chặn cả khi lần này đúng mật khẩu: không cho kẻ dò biết đã trúng
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Bạn đã đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 1 phút.");
        }
        try {
            Authentication authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(User.normalizeEmail(request.getEmail()), request.getPassword())
            );
            User user = ((CustomUserDetails) authentication.getPrincipal()).getUser();
            if (verification.mustVerify(user)) {
                // Kiểm SAU mật khẩu: sai mật khẩu vẫn là 401 chung, không lộ email nào đã đăng ký mà chưa xác thực.
                // Mật khẩu đúng -> không tính là lần dò sai.
                loginLimiter.reset(key);
                throw new CodedStatusException(HttpStatus.FORBIDDEN, EmailVerificationService.NOT_VERIFIED_CODE,
                        EmailVerificationService.NOT_VERIFIED_MESSAGE);
            }
            SecurityContextHolder.getContext().setAuthentication(authentication);
            AuthResponse ok = refreshTokens.issueTokens(user);
            loginLimiter.reset(key);
            return ok;
        } catch (LockedException e) {
            // Mật khẩu đúng nhưng admin đã khoá: 403 (không phải 401), không tính là lần dò sai; kèm lý do nếu admin ghi
            String reason = userRepository.findByEmail(User.normalizeEmail(request.getEmail()))
                    .map(User::getLockedReason).filter(r -> !r.isBlank()).orElse(null);
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    reason == null ? "Tài khoản đã bị khoá, vui lòng liên hệ hỗ trợ." : "Tài khoản đã bị khoá: " + reason);
        } catch (AuthenticationException e) {
            loginLimiter.record(key);
            // 401 (không phải 403) + thông báo chung: không lộ email tồn tại hay không
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Email hoặc mật khẩu không đúng!");
        }
    }

    // ponytail: register vẫn báo "Email đã được sử dụng" (lộ tồn tại email) vì UX cần biết.
    // Nâng cấp khi cần chống dò email: trả 202 chung + gửi mail xác thực.
    // Không gắn @Transactional: lỗi unique từ save() phải được bắt ngay tại đây, không đợi lúc commit.
    /**
     * Xác thực email bật (app_settings email_verification_required, trừ khi app.auth.email-verification-forced-off) -> tài khoản
     * chưa xác thực + gửi link, needsVerification=true; tắt -> đã xác thực sẵn, đăng nhập được ngay.
     */
    public RegisterResponse register(RegisterRequest request, String ip) {
        if (!settings.getBool(SettingsService.KEY_REGISTRATION_OPEN)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Hệ thống tạm ngừng đăng ký tài khoản mới.");
        }
        // IP thật khi chạy sau reverse proxy: server.forward-headers-strategy (application.properties)
        if (registerLimiter.isBlocked(ip)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Có quá nhiều tài khoản được tạo từ mạng của bạn. Vui lòng thử lại sau.");
        }
        String email = User.normalizeEmail(request.getEmail());
        if (userRepository.existsByEmail(email)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, EMAIL_TAKEN);
        }

        User user = new User();
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        user.setFullName(request.getFullName().trim());
        user.setRole(Role.USER);
        user.setJlptLevel("N5");
        user.setIsPremium(false);
        // Người đăng ký luôn là USER nên chỉ cần hỏi tính năng có bật không
        boolean needsVerification = verification.required();
        if (!needsVerification) user.setEmailVerifiedAt(java.time.Instant.now());

        try {
            userRepository.save(user);
        } catch (DataIntegrityViolationException e) {
            // 2 request đăng ký cùng email song song: cả hai qua existsByEmail, unique index chặn request sau.
            // Vi phạm ràng buộc khác không được báo nhầm thành "trùng email".
            if (isEmailUniqueViolation(e)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, EMAIL_TAKEN);
            }
            throw e;
        }
        registerLimiter.record(ip);
        if (!needsVerification) return new RegisterResponse(REGISTERED, false);
        verification.issue(user);
        return new RegisterResponse(REGISTERED_CHECK_MAIL, true);
    }

    /** Hai ràng buộc unique trên email: cột (V1__baseline) và lower(email) (V2). */
    private static boolean isEmailUniqueViolation(DataIntegrityViolationException e) {
        String cause = e.getMostSpecificCause().getMessage();
        return cause != null && (cause.contains("uq_users_email_lower") || cause.contains("uk_6dotkott2kjsp8vw4d0m25fb7"));
    }

    private User findUser(String email) {
        return userRepository.findByEmail(User.normalizeEmail(email))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy người dùng."));
    }

    public UserResponse getProfile(String email) {
        return UserResponse.of(findUser(email));
    }

    public UserResponse updateJlptLevel(String email, String newLevel) {
        User user = findUser(email);
        user.setJlptLevel(newLevel);
        return UserResponse.of(userRepository.save(user));
    }

    public UserResponse updateProfile(String email, String fullName) {
        User user = findUser(email);
        user.setFullName(fullName);
        return UserResponse.of(userRepository.save(user));
    }

    /**
     * Mật khẩu cũ phải được kiểm tra ở server; client không được phép bỏ qua bước này.
     * Mọi token phát hành trước đó (cả refresh token ở thiết bị khác) bị thu hồi; trả cặp token mới để phiên hiện tại dùng tiếp.
     */
    public AuthResponse changePassword(String email, String currentPassword, String newPassword) {
        // Rỗng / độ dài đã được PasswordChangeRequest kiểm tra ở controller
        User user = findUser(email);
        if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mật khẩu hiện tại không đúng!");
        }
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setPasswordChangedAt(java.time.Instant.now());
        user.setMustChangePassword(false);
        userRepository.save(user);
        refreshTokens.revokeAll(user.getId());
        return refreshTokens.issueTokens(user);
    }

}
