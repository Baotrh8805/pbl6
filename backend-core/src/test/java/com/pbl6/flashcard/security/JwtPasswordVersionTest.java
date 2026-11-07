package com.pbl6.flashcard.security;

import com.pbl6.flashcard.model.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Date;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Thu hồi phiên / đổi mật khẩu phải vô hiệu token cũ kể cả khi cấp trong cùng giây (claim pcv). */
class JwtPasswordVersionTest {

    private static CustomUserDetails userChangedAt(Instant at) {
        User u = new User();
        u.setPasswordChangedAt(at);
        return new CustomUserDetails(u);
    }

    private static Claims claims(Long pcv, Instant iat) {
        var b = Jwts.claims().issuedAt(Date.from(iat));
        if (pcv != null) b.add("pcv", pcv);
        return b.build();
    }

    @Test
    void token_with_old_version_is_rejected_even_in_same_second() {
        Instant t0 = Instant.parse("2026-10-18T10:00:00.300Z");
        Instant revokedAt = t0.plusMillis(500);
        Claims old = claims(JwtTokenProvider.passwordVersion(userChangedAt(t0)), t0);
        assertTrue(JwtAuthenticationFilter.issuedBeforePasswordChange(old, userChangedAt(revokedAt)));
    }

    @Test
    void token_with_current_version_is_accepted_even_in_same_second() {
        Instant changedAt = Instant.parse("2026-10-18T10:00:00.300Z");
        Claims fresh = claims(changedAt.toEpochMilli(), changedAt.plusMillis(10));
        assertFalse(JwtAuthenticationFilter.issuedBeforePasswordChange(fresh, userChangedAt(changedAt)));
    }

    @Test
    void never_changed_password_accepts_any_token() {
        assertFalse(JwtAuthenticationFilter.issuedBeforePasswordChange(claims(0L, Instant.now()), userChangedAt(null)));
    }

    @Test
    void legacy_token_without_claim_falls_back_to_second_precision() {
        Instant changedAt = Instant.parse("2026-10-18T10:00:05Z");
        assertTrue(JwtAuthenticationFilter.issuedBeforePasswordChange(claims(null, changedAt.minusSeconds(1)), userChangedAt(changedAt)));
        assertFalse(JwtAuthenticationFilter.issuedBeforePasswordChange(claims(null, changedAt), userChangedAt(changedAt)));
    }
}
