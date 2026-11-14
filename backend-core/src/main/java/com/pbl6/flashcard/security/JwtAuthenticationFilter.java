package com.pbl6.flashcard.security;

import com.pbl6.flashcard.service.EmailVerificationService;
import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    public JwtAuthenticationFilter(JwtTokenProvider tokenProvider, CustomUserDetailsService customUserDetailsService,
                                   EmailVerificationService emailVerification) {
        this.tokenProvider = tokenProvider;
        this.customUserDetailsService = customUserDetailsService;
        this.emailVerification = emailVerification;
    }

    private final JwtTokenProvider tokenProvider;
    private final CustomUserDetailsService customUserDetailsService;
    private final EmailVerificationService emailVerification;

    // Token thiếu/sai/hết hạn -> không set Authentication; SecurityConfig trả 401 qua entry point.
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String jwt = getJwtFromRequest(request);
        Claims claims = StringUtils.hasText(jwt) ? tokenProvider.parseValidClaims(jwt) : null;

        if (claims != null) {
            try {
                CustomUserDetails userDetails = (CustomUserDetails) customUserDetailsService.loadUserByUsername(claims.getSubject());
                // Bị khoá, token cấp trước lần đổi mật khẩu, hoặc USER chưa xác thực email khi tính năng bật (token có từ lúc
                // admin còn tắt tính năng / staff bị hạ về USER) -> coi như chưa đăng nhập (401)
                if (!userDetails.isAccountNonLocked() || issuedBeforePasswordChange(claims, userDetails)
                        || emailVerification.mustVerify(userDetails.getUser())) {
                    filterChain.doFilter(request, response);
                    return;
                }
                UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                        userDetails, null, userDetails.getAuthorities());
                authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(authentication);
            } catch (UsernameNotFoundException ex) {
                // Token hợp lệ nhưng user đã bị xoá -> coi như chưa đăng nhập
            }
        }

        filterChain.doFilter(request, response);
    }

    /**
     * Đổi mật khẩu / thu hồi phiên vô hiệu mọi token cũ. Token mới mang claim {@code pcv} (phiên bản mật khẩu, ms):
     * so chính xác. Token cũ chưa có claim: so iat ở mức giây (iat của JWT chỉ chính xác tới giây).
     */
    static boolean issuedBeforePasswordChange(Claims claims, CustomUserDetails user) {
        Instant changedAt = user.getUser().getPasswordChangedAt();
        if (changedAt == null) return false;
        Long pcv = claims.get("pcv", Long.class);
        if (pcv != null) return pcv != changedAt.toEpochMilli();
        if (claims.getIssuedAt() == null) return false;
        return claims.getIssuedAt().toInstant().isBefore(changedAt.truncatedTo(ChronoUnit.SECONDS));
    }

    private String getJwtFromRequest(HttpServletRequest request) {
        String bearerToken = request.getHeader("Authorization");
        if (StringUtils.hasText(bearerToken) && bearerToken.startsWith("Bearer ")) {
            return bearerToken.substring(7);
        }
        return null;
    }
}
