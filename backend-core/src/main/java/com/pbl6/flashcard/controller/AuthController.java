package com.pbl6.flashcard.controller;

import com.pbl6.flashcard.dto.AuthRequest;
import com.pbl6.flashcard.dto.AuthResponse;
import com.pbl6.flashcard.dto.RegisterRequest;
import com.pbl6.flashcard.service.AuthService;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.security.LoginAttemptLimiter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")

public class AuthController {
    public AuthController(AuthService authService, LoginAttemptLimiter loginLimiter) {
        this.authService = authService;
        this.loginLimiter = loginLimiter;
    }

    private final AuthService authService;
    private final LoginAttemptLimiter loginLimiter;

    @PostMapping("/login")
    public ResponseEntity<?> authenticateUser(@Valid @RequestBody AuthRequest loginRequest, HttpServletRequest request) {
        String key = LoginAttemptLimiter.key(request.getRemoteAddr(), User.normalizeEmail(loginRequest.getEmail()));
        if (loginLimiter.isBlocked(key)) {
            // Chặn cả khi lần này đúng mật khẩu: không cho kẻ dò biết đã trúng
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body("Bạn đã đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 1 phút.");
        }
        try {
            ResponseEntity<?> ok = ResponseEntity.ok(authService.login(loginRequest));
            loginLimiter.reset(key);
            return ok;
        } catch (AuthenticationException e) {
            loginLimiter.recordFailure(key);
            // 401 (không phải 403) + thông báo chung: không lộ email tồn tại hay không
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body("Email hoặc mật khẩu không đúng!");
        }
    }

    // ponytail: register vẫn báo "Email đã được sử dụng" (lộ tồn tại email) vì UX
    // cần biết.
    // Nâng cấp khi cần chống dò email: trả 202 chung + gửi mail xác thực.
    @PostMapping("/register")
    public ResponseEntity<?> registerUser(@Valid @RequestBody RegisterRequest registerRequest) {
        try {
            authService.register(registerRequest);
            return ResponseEntity.ok("Đăng ký tài khoản thành công!");
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            // 2 request đăng ký cùng email song song: cả hai qua existsByEmail, unique index chặn request sau
            return ResponseEntity.badRequest().body("Email đã được sử dụng!");
        }
    }

    @GetMapping("/me")
    public ResponseEntity<?> getCurrentUser(org.springframework.security.core.Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Chưa đăng nhập!");
        }
        try {
            return ResponseEntity.ok(authService.getCurrentUser(authentication.getName()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(e.getMessage());
        }
    }

    @PutMapping("/profile")
    public ResponseEntity<?> updateProfile(
            org.springframework.security.core.Authentication authentication,
            @RequestBody java.util.Map<String, String> body) {
        String fullName = body.get("fullName");
        if (fullName == null || fullName.isBlank()) {
            return ResponseEntity.badRequest().body("Họ tên không được để trống!");
        }
        try {
            return ResponseEntity.ok(authService.updateProfile(authentication.getName(), fullName.trim()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PutMapping("/password")
    public ResponseEntity<?> changePassword(
            org.springframework.security.core.Authentication authentication,
            @RequestBody java.util.Map<String, String> body) {
        try {
            // Token cũ bị thu hồi -> trả token mới cho phiên hiện tại
            return ResponseEntity.ok(authService.changePassword(authentication.getName(),
                    body.get("currentPassword"), body.get("newPassword")));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PutMapping("/jlpt-level")
    public ResponseEntity<?> updateJlptLevel(
            org.springframework.security.core.Authentication authentication,
            @RequestBody java.util.Map<String, String> body) {
        if (authentication == null || !authentication.isAuthenticated()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Chưa đăng nhập!");
        }
        String level = body.get("jlptLevel");
        // Cột jlpt_level chỉ dài 10 và chỗ khác trong hệ thống giả định N1..N5.
        if (level == null || !level.matches("N[1-5]")) {
            return ResponseEntity.badRequest().body("Trình độ JLPT không hợp lệ!");
        }
        try {
            return ResponseEntity.ok(authService.updateJlptLevel(authentication.getName(), level));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }
}
