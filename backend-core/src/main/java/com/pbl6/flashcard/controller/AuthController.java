package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.dto.AppealRequest;
import com.pbl6.flashcard.dto.AuthRequest;
import com.pbl6.flashcard.dto.AuthResponse;
import com.pbl6.flashcard.dto.DeleteAccountRequest;
import com.pbl6.flashcard.dto.ForgotPasswordRequest;
import com.pbl6.flashcard.dto.ResendVerificationRequest;
import com.pbl6.flashcard.dto.ResetPasswordRequest;
import com.pbl6.flashcard.dto.JlptLevelRequest;
import com.pbl6.flashcard.dto.PasswordChangeRequest;
import com.pbl6.flashcard.dto.ProfileRequest;
import com.pbl6.flashcard.dto.RefreshRequest;
import com.pbl6.flashcard.dto.RegisterRequest;
import com.pbl6.flashcard.dto.RegisterResponse;
import com.pbl6.flashcard.dto.UserResponse;
import com.pbl6.flashcard.dto.VerifyEmailRequest;
import com.pbl6.flashcard.service.AccountDeletionService;
import com.pbl6.flashcard.service.AppealService;
import com.pbl6.flashcard.service.AuthService;
import com.pbl6.flashcard.service.EmailVerificationService;
import com.pbl6.flashcard.service.PasswordResetService;
import com.pbl6.flashcard.service.RefreshTokenService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * HTTP <-> service. Lỗi nghiệp vụ (sai mật khẩu, quá giới hạn...) do service ném,
 * trả JSON {status, error, message} qua ApiExceptionHandler.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {
    public AuthController(AuthService authService, PasswordResetService passwordReset, RefreshTokenService refreshTokens,
                          AccountDeletionService accountDeletion, EmailVerificationService emailVerification,
                          AppealService appeals) {
        this.accountDeletion = accountDeletion;
        this.authService = authService;
        this.passwordReset = passwordReset;
        this.refreshTokens = refreshTokens;
        this.emailVerification = emailVerification;
        this.appeals = appeals;
    }

    private final AuthService authService;
    private final AccountDeletionService accountDeletion;
    private final PasswordResetService passwordReset;
    private final RefreshTokenService refreshTokens;
    private final EmailVerificationService emailVerification;
    private final AppealService appeals;

    private static final String RESET_SENT =
            "Nếu email đã đăng ký, chúng tôi đã gửi liên kết đặt lại mật khẩu (hiệu lực 30 phút).";
    private static final String VERIFICATION_SENT =
            "Nếu email đã đăng ký và chưa xác thực, chúng tôi đã gửi lại liên kết xác thực (hiệu lực 24 giờ).";
    private static final String APPEAL_RECEIVED =
            "Chúng tôi đã nhận khiếu nại. Nếu email thuộc một tài khoản đang bị khoá, quản trị viên sẽ xem xét; "
                    + "hãy thử đăng nhập lại sau.";

    @PostMapping("/login")
    public AuthResponse authenticateUser(@Valid @RequestBody AuthRequest loginRequest, HttpServletRequest request) {
        return authService.login(loginRequest, request.getRemoteAddr());
    }

    /** 200 {message, needsVerification} (hợp đồng API đợt 2 §3; trước đây là chuỗi trần). */
    @PostMapping("/register")
    public RegisterResponse registerUser(@Valid @RequestBody RegisterRequest registerRequest, HttpServletRequest request) {
        return authService.register(registerRequest, request.getRemoteAddr());
    }

    /** Mở link trong email xác thực. Token sai / hết hạn / đã dùng -> 400. */
    @PostMapping("/verify-email")
    public Map<String, String> verifyEmail(@Valid @RequestBody VerifyEmailRequest body) {
        String email = emailVerification.verify(body.token());
        return Map.of("message", "Xác thực email thành công. Bạn có thể đăng nhập.", "email", email);
    }

    /** 202 với cùng một thông báo dù email có tồn tại / đã xác thực hay không: không cho dò email. */
    @PostMapping("/resend-verification")
    public ResponseEntity<Map<String, String>> resendVerification(@Valid @RequestBody ResendVerificationRequest body,
                                                                  HttpServletRequest request) {
        emailVerification.resend(body.email(), request.getRemoteAddr());
        return ResponseEntity.accepted().body(Map.of("message", VERIFICATION_SENT));
    }

    /** Khiếu nại khi bị khoá (công khai). 202 chung: không cho dò email nào đang bị khoá. */
    @PostMapping("/appeals")
    public ResponseEntity<Map<String, String>> appeal(@Valid @RequestBody AppealRequest body, HttpServletRequest request) {
        appeals.create(body.email(), body.message(), request.getRemoteAddr());
        return ResponseEntity.accepted().body(Map.of("message", APPEAL_RECEIVED));
    }

    /** Luôn trả cùng một thông báo: không cho dò email nào đã đăng ký. */
    @PostMapping("/forgot-password")
    public Map<String, String> forgotPassword(@Valid @RequestBody ForgotPasswordRequest body, HttpServletRequest request) {
        passwordReset.requestReset(body.email(), request.getRemoteAddr());
        return Map.of("message", RESET_SENT);
    }

    /** Đặt mật khẩu mới bằng token trong email; mọi phiên đăng nhập cũ bị thu hồi. */
    @PostMapping("/reset-password")
    public Map<String, String> resetPassword(@Valid @RequestBody ResetPasswordRequest body) {
        passwordReset.reset(body.token(), body.newPassword());
        return Map.of("message", "Đặt lại mật khẩu thành công. Hãy đăng nhập bằng mật khẩu mới.");
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
    public UserResponse getCurrentUser(Authentication authentication) {
        return authService.getProfile(authentication.getName());
    }

    /** Tự xoá tài khoản (ẩn danh hoá + xoá dữ liệu cá nhân). 204; sau đó mọi token của người này vô hiệu. */
    @DeleteMapping("/me")
    public ResponseEntity<Void> deleteOwnAccount(Authentication authentication, @Valid @RequestBody DeleteAccountRequest body) {
        accountDeletion.deleteOwnAccount(authentication.getName(), body.password());
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/profile")
    public UserResponse updateProfile(Authentication authentication, @Valid @RequestBody ProfileRequest body) {
        return authService.updateProfile(authentication.getName(), body.fullName().trim());
    }

    /** Token cũ bị thu hồi -> trả token mới cho phiên hiện tại. */
    @PutMapping("/password")
    public AuthResponse changePassword(Authentication authentication, @Valid @RequestBody PasswordChangeRequest body) {
        return authService.changePassword(authentication.getName(), body.currentPassword(), body.newPassword());
    }

    @PutMapping("/jlpt-level")
    public UserResponse updateJlptLevel(Authentication authentication, @Valid @RequestBody JlptLevelRequest body) {
        return authService.updateJlptLevel(authentication.getName(), body.jlptLevel());
    }
}
