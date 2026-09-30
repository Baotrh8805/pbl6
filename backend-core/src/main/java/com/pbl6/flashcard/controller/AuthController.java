package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.config.ApiExceptionHandler;
import com.pbl6.flashcard.dto.AuthRequest;
import com.pbl6.flashcard.dto.AuthResponse;
import com.pbl6.flashcard.dto.ForgotPasswordRequest;
import com.pbl6.flashcard.dto.ResetPasswordRequest;
import com.pbl6.flashcard.dto.JlptLevelRequest;
import com.pbl6.flashcard.dto.PasswordChangeRequest;
import com.pbl6.flashcard.dto.ProfileRequest;
import com.pbl6.flashcard.dto.RefreshRequest;
import com.pbl6.flashcard.dto.RegisterRequest;
import com.pbl6.flashcard.service.AuthService;
import com.pbl6.flashcard.service.PasswordResetService;
import com.pbl6.flashcard.service.RefreshTokenService;
import com.pbl6.flashcard.security.AttemptLimiter;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.security.LoginAttemptLimiter;
import com.pbl6.flashcard.security.RegisterRateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.annotation.*;

/** Lỗi trả về cùng định dạng JSON {status, error, message} như mọi endpoint khác (ApiExceptionHandler). */
@RestController
@RequestMapping("/api/auth")
public class AuthController {
    public AuthController(AuthService authService, LoginAttemptLimiter loginLimiter,
                          RegisterRateLimiter registerLimiter, PasswordResetService passwordReset,
                          RefreshTokenService refreshTokens) {
        this.authService = authService;
        this.loginLimiter = loginLimiter;
        this.registerLimiter = registerLimiter;
        this.passwordReset = passwordReset;
        this.refreshTokens = refreshTokens;
    }

    private final AuthService authService;
    private final LoginAttemptLimiter loginLimiter;
    private final RegisterRateLimiter registerLimiter;
    private final PasswordResetService passwordReset;
    private final RefreshTokenService refreshTokens;
    /** Xin link đặt lại mật khẩu: tối đa 5 lần / 15 phút cho mỗi (IP, email) -> không spam hộp thư người khác. */
    private final AttemptLimiter forgotLimiter = new AttemptLimiter(5, java.time.Duration.ofMinutes(15));

    private static final String RESET_SENT =
            "Nếu email đã đăng ký, chúng tôi đã gửi liên kết đặt lại mật khẩu (hiệu lực 30 phút).";

    @PostMapping("/login")
    public ResponseEntity<?> authenticateUser(@Valid @RequestBody AuthRequest loginRequest, HttpServletRequest request) {
        String key = LoginAttemptLimiter.key(request.getRemoteAddr(), User.normalizeEmail(loginRequest.getEmail()));
        if (loginLimiter.isBlocked(key)) {
            // Chặn cả khi lần này đúng mật khẩu: không cho kẻ dò biết đã trúng
            return ApiExceptionHandler.error(HttpStatus.TOO_MANY_REQUESTS,
                    "Bạn đã đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 1 phút.");
        }
        try {
            AuthResponse ok = authService.login(loginRequest);
            loginLimiter.reset(key);
            return ResponseEntity.ok(ok);
        } catch (AuthenticationException e) {
            loginLimiter.record(key);
            // 401 (không phải 403) + thông báo chung: không lộ email tồn tại hay không
            return ApiExceptionHandler.error(HttpStatus.UNAUTHORIZED, "Email hoặc mật khẩu không đúng!");
        }
    }

    // ponytail: register vẫn báo "Email đã được sử dụng" (lộ tồn tại email) vì UX cần biết.
    // Nâng cấp khi cần chống dò email: trả 202 chung + gửi mail xác thực.
    @PostMapping("/register")
    public ResponseEntity<?> registerUser(@Valid @RequestBody RegisterRequest registerRequest,
                                          HttpServletRequest request) {
        // IP thật khi chạy sau reverse proxy: server.forward-headers-strategy (application.properties)
        String ip = request.getRemoteAddr();
        if (registerLimiter.isBlocked(ip)) {
            return ApiExceptionHandler.error(HttpStatus.TOO_MANY_REQUESTS,
                    "Có quá nhiều tài khoản được tạo từ mạng của bạn. Vui lòng thử lại sau.");
        }
        try {
            authService.register(registerRequest);
            registerLimiter.record(ip);
            return ResponseEntity.ok("Đăng ký tài khoản thành công!");
        } catch (IllegalArgumentException e) {
            return ApiExceptionHandler.error(HttpStatus.BAD_REQUEST, e.getMessage());
        } catch (DataIntegrityViolationException e) {
            // 2 request đăng ký cùng email song song: cả hai qua existsByEmail, unique index chặn request sau.
            // Vi phạm ràng buộc khác không được báo nhầm thành "trùng email".
            if (isEmailUniqueViolation(e)) {
                return ApiExceptionHandler.error(HttpStatus.BAD_REQUEST, AuthService.EMAIL_TAKEN);
            }
            throw e;
        }
    }

    /** Hai ràng buộc unique trên email: cột (V1__baseline) và lower(email) (V2). */
    private static boolean isEmailUniqueViolation(DataIntegrityViolationException e) {
        String cause = e.getMostSpecificCause().getMessage();
        return cause != null && (cause.contains("uq_users_email_lower") || cause.contains("uk_6dotkott2kjsp8vw4d0m25fb7"));
    }

    /** Luôn trả cùng một thông báo: không cho dò email nào đã đăng ký. */
    @PostMapping("/forgot-password")
    public ResponseEntity<?> forgotPassword(@Valid @RequestBody ForgotPasswordRequest body, HttpServletRequest request) {
        String key = LoginAttemptLimiter.key(request.getRemoteAddr(), User.normalizeEmail(body.email()));
        if (forgotLimiter.isBlocked(key)) {
            return ApiExceptionHandler.error(HttpStatus.TOO_MANY_REQUESTS,
                    "Bạn đã yêu cầu quá nhiều lần. Vui lòng thử lại sau 15 phút.");
        }
        forgotLimiter.record(key);
        passwordReset.requestReset(body.email());
        return ResponseEntity.ok(java.util.Map.of("message", RESET_SENT));
    }

    /** Đặt mật khẩu mới bằng token trong email; mọi phiên đăng nhập cũ bị thu hồi. */
    @PostMapping("/reset-password")
    public ResponseEntity<?> resetPassword(@Valid @RequestBody ResetPasswordRequest body) {
        passwordReset.reset(body.token(), body.newPassword());
        return ResponseEntity.ok(java.util.Map.of("message", "Đặt lại mật khẩu thành công. Hãy đăng nhập bằng mật khẩu mới."));
    }

    /** Đổi refresh token còn hạn lấy access token mới (và lùi hạn phiên). Không cần access token: nó có thể đã hết hạn. */
    @PostMapping("/refresh")
    public AuthResponse refresh(@Valid @RequestBody RefreshRequest body) {
        return refreshTokens.refresh(body.refreshToken());
    }

    /** Đăng xuất: thu hồi refresh token của phiên này. Luôn 204 để không lộ token có tồn tại hay không. */
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@Valid @RequestBody RefreshRequest body) {
        refreshTokens.revoke(body.refreshToken());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    public User getCurrentUser(Authentication authentication) {
        return authService.getCurrentUser(authentication.getName());
    }

    @PutMapping("/profile")
    public User updateProfile(Authentication authentication, @Valid @RequestBody ProfileRequest body) {
        return authService.updateProfile(authentication.getName(), body.fullName().trim());
    }

    /** Token cũ bị thu hồi -> trả token mới cho phiên hiện tại. */
    @PutMapping("/password")
    public ResponseEntity<?> changePassword(Authentication authentication, @Valid @RequestBody PasswordChangeRequest body) {
        try {
            return ResponseEntity.ok(authService.changePassword(authentication.getName(),
                    body.currentPassword(), body.newPassword()));
        } catch (IllegalArgumentException e) {
            return ApiExceptionHandler.error(HttpStatus.BAD_REQUEST, e.getMessage());
        }
    }

    @PutMapping("/jlpt-level")
    public User updateJlptLevel(Authentication authentication, @Valid @RequestBody JlptLevelRequest body) {
        return authService.updateJlptLevel(authentication.getName(), body.jlptLevel());
    }
}
