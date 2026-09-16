package com.pbl6.flashcard.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Component;

import java.security.Key;
import java.util.Date;

@Component
public class JwtTokenProvider {
    
    // Khóa bí mật (Trong thực tế nên cấu hình ở application.properties)
    private final String JWT_SECRET = "PBL6_Japanese_Flashcard_Super_Secret_Key_For_JWT_Authentication_Length_Must_Be_Long_Enough_512_bits";
    
    // Thời hạn JWT: 3 ngày như yêu cầu (3 * 24 * 60 * 60 * 1000 = 259200000 ms)
    private final long JWT_EXPIRATION = 259200000L;

    private Key getSigningKey() {
        return Keys.hmacShaKeyFor(JWT_SECRET.getBytes());
    }

    // Tạo JWT Token từ thông tin người dùng
    public String generateToken(CustomUserDetails userDetails) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + JWT_EXPIRATION);

        return Jwts.builder()
                .setSubject(userDetails.getUsername())
                .setIssuedAt(now)
                .setExpiration(expiryDate)
                .signWith(getSigningKey(), SignatureAlgorithm.HS512)
                .compact();
    }

    // Lấy Email (username) từ JWT
    public String getEmailFromJwt(String token) {
        Claims claims = Jwts.parserBuilder()
                .setSigningKey(getSigningKey())
                .build()
                .parseClaimsJws(token)
                .getBody();
        return claims.getSubject();
    }

    // Xác thực JWT Token
    public boolean validateToken(String authToken) {
        try {
            Jwts.parserBuilder().setSigningKey(getSigningKey()).build().parseClaimsJws(authToken);
            return true;
        } catch (JwtException | IllegalArgumentException ex) {
            System.err.println("Token không hợp lệ hoặc đã hết hạn: " + ex.getMessage());
        }
        return false;
    }
}
