package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.AuthResponse;
import com.pbl6.flashcard.model.RefreshToken;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.repository.RefreshTokenRepository;
import com.pbl6.flashcard.repository.UserRepository;
import com.pbl6.flashcard.security.CustomUserDetails;
import com.pbl6.flashcard.security.JwtTokenProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;

/**
 * Phiên đăng nhập = access token JWT ngắn hạn (jwt.expiration) + refresh token ngẫu nhiên (DB chỉ lưu SHA-256).
 * Refresh token có hạn trượt (jwt.refresh-expiration, mặc định 3 ngày): mỗi lần làm mới lùi hạn thêm một khoảng,
 * nên người dùng không vào web quá khoảng đó sẽ phải đăng nhập lại.
 * Không xoay vòng token khi làm mới: nhiều tab / nhiều request cùng làm mới một lúc không làm nhau bị đăng xuất.
 */
@Service
public class RefreshTokenService {

    public static final String EXPIRED = "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";

    private final RefreshTokenRepository tokenRepository;
    private final UserRepository userRepository;
    private final JwtTokenProvider jwtTokenProvider;
    private final Duration ttl;
    private final SecureRandom random = new SecureRandom();

    public RefreshTokenService(RefreshTokenRepository tokenRepository, UserRepository userRepository,
                               JwtTokenProvider jwtTokenProvider,
                               @Value("${jwt.refresh-expiration}") Duration ttl) {
        this.tokenRepository = tokenRepository;
        this.userRepository = userRepository;
        this.jwtTokenProvider = jwtTokenProvider;
        this.ttl = ttl;
    }

    /** Mở phiên mới (đăng nhập, đổi mật khẩu): access token + refresh token. */
    @Transactional
    public AuthResponse issueTokens(User user) {
        Instant now = Instant.now();
        tokenRepository.deleteExpiredByUserId(user.getId(), now);
        byte[] raw = new byte[32];
        random.nextBytes(raw);
        String refreshToken = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        tokenRepository.save(new RefreshToken(user.getId(), PasswordResetService.sha256(refreshToken), now.plus(ttl)));
        return new AuthResponse(jwtTokenProvider.generateToken(new CustomUserDetails(user)), refreshToken);
    }

    /** Cấp access token mới và lùi hạn refresh token; token sai / hết hạn / đã thu hồi -> 401. */
    @Transactional
    public AuthResponse refresh(String refreshToken) {
        Instant now = Instant.now();
        RefreshToken saved = tokenRepository.findByTokenHash(PasswordResetService.sha256(refreshToken))
                .filter(t -> t.getExpiresAt().isAfter(now))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, EXPIRED));
        User user = userRepository.findById(saved.getUserId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, EXPIRED));
        saved.setExpiresAt(now.plus(ttl));
        return new AuthResponse(jwtTokenProvider.generateToken(new CustomUserDetails(user)), refreshToken);
    }

    /** Đăng xuất phiên hiện tại. Token không tồn tại cũng coi như đã đăng xuất. */
    @Transactional
    public void revoke(String refreshToken) {
        tokenRepository.deleteByTokenHash(PasswordResetService.sha256(refreshToken));
    }

    /** Đăng xuất mọi phiên của user. */
    @Transactional
    public void revokeAll(Long userId) {
        tokenRepository.deleteByUserId(userId);
    }
}
