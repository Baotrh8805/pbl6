package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.AuthRequest;
import com.pbl6.flashcard.dto.AuthResponse;
import com.pbl6.flashcard.dto.RegisterRequest;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.repository.UserRepository;
import com.pbl6.flashcard.security.CustomUserDetails;

import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service

public class AuthService {
    public AuthService(AuthenticationManager authenticationManager, UserRepository userRepository, PasswordEncoder passwordEncoder, RefreshTokenService refreshTokens) {
        this.authenticationManager = authenticationManager;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.refreshTokens = refreshTokens;
    }


    private final AuthenticationManager authenticationManager;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final RefreshTokenService refreshTokens;

    public static final String EMAIL_TAKEN = "Email đã được sử dụng!";

    public AuthResponse login(AuthRequest request) {
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(User.normalizeEmail(request.getEmail()), request.getPassword())
        );

        SecurityContextHolder.getContext().setAuthentication(authentication);

        return refreshTokens.issueTokens(((CustomUserDetails) authentication.getPrincipal()).getUser());
    }

    public User register(RegisterRequest request) {
        String email = User.normalizeEmail(request.getEmail());
        if (userRepository.existsByEmail(email)) {
            throw new IllegalArgumentException(EMAIL_TAKEN);
        }

        User user = new User();
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        user.setFullName(request.getFullName().trim());
        user.setRole(Role.USER);
        user.setJlptLevel("N5");
        user.setIsPremium(false);

        return userRepository.save(user);
    }

    public User getCurrentUser(String email) {
        return userRepository.findByEmail(User.normalizeEmail(email))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy người dùng."));
    }

    public User updateJlptLevel(String email, String newLevel) {
        User user = getCurrentUser(email);
        user.setJlptLevel(newLevel);
        return userRepository.save(user);
    }

    public User updateProfile(String email, String fullName) {
        User user = getCurrentUser(email);
        user.setFullName(fullName);
        return userRepository.save(user);
    }

    /**
     * Mật khẩu cũ phải được kiểm tra ở server; client không được phép bỏ qua bước này.
     * Mọi token phát hành trước đó (cả refresh token ở thiết bị khác) bị thu hồi; trả cặp token mới để phiên hiện tại dùng tiếp.
     */
    public AuthResponse changePassword(String email, String currentPassword, String newPassword) {
        // Rỗng / độ dài đã được PasswordChangeRequest kiểm tra ở controller
        User user = getCurrentUser(email);
        if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new IllegalArgumentException("Mật khẩu hiện tại không đúng!");
        }
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setPasswordChangedAt(java.time.Instant.now());
        userRepository.save(user);
        refreshTokens.revokeAll(user.getId());
        return refreshTokens.issueTokens(user);
    }
}
