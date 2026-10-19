package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.dto.AuthRequest;
import com.pbl6.flashcard.dto.AuthResponse;
import com.pbl6.flashcard.dto.DeleteAccountRequest;
import com.pbl6.flashcard.dto.ForgotPasswordRequest;
import com.pbl6.flashcard.dto.ResetPasswordRequest;
import com.pbl6.flashcard.dto.JlptLevelRequest;
import com.pbl6.flashcard.dto.PasswordChangeRequest;
import com.pbl6.flashcard.dto.ProfileRequest;
import com.pbl6.flashcard.dto.RefreshRequest;
import com.pbl6.flashcard.dto.RegisterRequest;
import com.pbl6.flashcard.dto.UserResponse;
import com.pbl6.flashcard.service.AccountDeletionService;
import com.pbl6.flashcard.service.AuthService;
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
                          AccountDeletionService accountDeletion) {
        this.accountDeletion = accountDeletion;
        this.authService = authService;
        this.passwordReset = passwordReset;
        this.refreshTokens = refreshTokens;
    }

    private final AuthService authService;
    private final AccountDeletionService accountDeletion;
    private final PasswordResetService passwordReset;
    private final RefreshTokenService refreshTokens;

    private static final String RESET_SENT =
            "Nếu email đã đăng ký, chúng tôi đã gửi liên kết đặt lại mật khẩu (hiệu lực 30 phút).";

    @PostMapping("/login")
    public AuthResponse authenticateUser(@Valid @RequestBody AuthRequest loginRequest, HttpServletRequest request) {
        return authService.login(loginRequest, request.getRemoteAddr());
    }

    @PostMapping("/register")
    public ResponseEntity<String> registerUser(@Valid @RequestBody RegisterRequest registerRequest,
                                               HttpServletRequest request) {
        authService.register(registerRequest, request.getRemoteAddr());
        return ResponseEntity.ok("Đăng ký tài khoản thành công!");
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
