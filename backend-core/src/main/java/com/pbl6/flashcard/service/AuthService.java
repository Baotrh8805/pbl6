package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.AuthRequest;
import com.pbl6.flashcard.dto.AuthResponse;
import com.pbl6.flashcard.dto.RegisterRequest;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.repository.UserRepository;
import com.pbl6.flashcard.security.CustomUserDetails;
import com.pbl6.flashcard.security.JwtTokenProvider;

import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service

public class AuthService {
    public AuthService(AuthenticationManager authenticationManager, UserRepository userRepository, PasswordEncoder passwordEncoder, JwtTokenProvider tokenProvider) {
        this.authenticationManager = authenticationManager;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.tokenProvider = tokenProvider;
    }


    private final AuthenticationManager authenticationManager;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;

    public AuthResponse login(AuthRequest request) {
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(User.normalizeEmail(request.getEmail()), request.getPassword())
        );

        SecurityContextHolder.getContext().setAuthentication(authentication);

        String jwt = tokenProvider.generateToken((CustomUserDetails) authentication.getPrincipal());
        return new AuthResponse(jwt);
    }

    public User register(RegisterRequest request) {
        String email = User.normalizeEmail(request.getEmail());
        if (userRepository.existsByEmail(email)) {
            throw new IllegalArgumentException("Email đã được sử dụng!");
        }

        User user = new User();
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        user.setFullName(request.getFullName());
        user.setRole(Role.USER);
        user.setJlptLevel("N5");
        user.setIsPremium(false);

        return userRepository.save(user);
    }

    public User getCurrentUser(String email) {
        return userRepository.findByEmail(User.normalizeEmail(email))
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy người dùng: " + email));
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
     * Mọi token phát hành trước đó bị thu hồi; trả token mới để phiên hiện tại dùng tiếp.
     */
    public AuthResponse changePassword(String email, String currentPassword, String newPassword) {
        User user = getCurrentUser(email);
        if (currentPassword == null || currentPassword.isEmpty()) {
            throw new IllegalArgumentException("Mật khẩu hiện tại không được để trống!");
        }
        if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new IllegalArgumentException("Mật khẩu hiện tại không đúng!");
        }
        if (newPassword == null || newPassword.length() < 6) {
            throw new IllegalArgumentException("Mật khẩu mới phải từ 6 ký tự!");
        }
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setPasswordChangedAt(java.time.Instant.now());
        userRepository.save(user);
        return new AuthResponse(tokenProvider.generateToken(new CustomUserDetails(user)));
    }
}
