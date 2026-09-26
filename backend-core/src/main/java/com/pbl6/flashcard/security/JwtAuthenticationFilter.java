package com.pbl6.flashcard.security;

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
    public JwtAuthenticationFilter(JwtTokenProvider tokenProvider, CustomUserDetailsService customUserDetailsService) {
        this.tokenProvider = tokenProvider;
        this.customUserDetailsService = customUserDetailsService;
    }

    private final JwtTokenProvider tokenProvider;
    private final CustomUserDetailsService customUserDetailsService;

    // Token thiếu/sai/hết hạn -> không set Authentication; SecurityConfig trả 401 qua entry point.
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String jwt = getJwtFromRequest(request);
        Claims claims = StringUtils.hasText(jwt) ? tokenProvider.parseValidClaims(jwt) : null;

        if (claims != null) {
            try {
                CustomUserDetails userDetails = (CustomUserDetails) customUserDetailsService.loadUserByUsername(claims.getSubject());
                if (issuedBeforePasswordChange(claims, userDetails)) {
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

    /** Đổi mật khẩu thu hồi mọi token cũ. iat của JWT chỉ chính xác tới giây -> so ở mức giây. */
    static boolean issuedBeforePasswordChange(Claims claims, CustomUserDetails user) {
        Instant changedAt = user.getUser().getPasswordChangedAt();
        if (changedAt == null || claims.getIssuedAt() == null) return false;
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
