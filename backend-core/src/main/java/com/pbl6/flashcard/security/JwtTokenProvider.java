package com.pbl6.flashcard.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

@Component
public class JwtTokenProvider {

    /** HS512 cần khoá >= 512 bit. */
    private static final int MIN_SECRET_BYTES = 64;

    private final SecretKey signingKey;
    private final long expirationMs;

    // Secret chỉ đến từ cấu hình (env JWT_SECRET / application-local.properties), không có giá trị mặc định:
    // secret nằm trong mã nguồn = ai đọc được repo cũng ký được token cho bất kỳ user nào.
    public JwtTokenProvider(@Value("${jwt.secret}") String secret,
                            @Value("${jwt.expiration}") long expirationMs) {
        byte[] bytes = secret.getBytes(StandardCharsets.UTF_8);
        if (bytes.length < MIN_SECRET_BYTES) {
            throw new IllegalStateException("jwt.secret phải dài ít nhất " + MIN_SECRET_BYTES + " byte");
        }
        this.signingKey = Keys.hmacShaKeyFor(bytes);
        this.expirationMs = expirationMs;
    }

    public String generateToken(CustomUserDetails userDetails) {
        Date now = new Date();
        return Jwts.builder()
                .subject(userDetails.getUsername())
                .issuedAt(now)
                .expiration(new Date(now.getTime() + expirationMs))
                .signWith(signingKey, Jwts.SIG.HS512)
                .compact();
    }

    /** Trả về claims nếu token hợp lệ (đúng chữ ký, chưa hết hạn), ngược lại null. */
    public Claims parseValidClaims(String token) {
        try {
            return Jwts.parser().verifyWith(signingKey).build().parseSignedClaims(token).getPayload();
        } catch (JwtException | IllegalArgumentException ex) {
            return null;
        }
    }
}
