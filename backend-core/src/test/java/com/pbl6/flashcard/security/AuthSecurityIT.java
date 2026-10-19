package com.pbl6.flashcard.security;

import com.pbl6.flashcard.support.IntegrationTest;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;

import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AuthSecurityIT extends IntegrationTest {

    /** Secret từng nằm trong mã nguồn (đã lộ qua lịch sử git). */
    private static final String LEAKED_SECRET =
            "PBL6_Japanese_Flashcard_Super_Secret_Key_For_JWT_Authentication_Length_Must_Be_Long_Enough_512_bits";

    @Value("${jwt.secret}")
    String secret;

    private String sign(String key, String subject, long expiresInMs) {
        Date now = new Date();
        return Jwts.builder().subject(subject).issuedAt(now)
                .expiration(new Date(now.getTime() + expiresInMs))
                .signWith(Keys.hmacShaKeyFor(key.getBytes(StandardCharsets.UTF_8)), Jwts.SIG.HS512)
                .compact();
    }

    private String registerEmail(String email) throws Exception {
        call(post("/api/auth/register"), null, Map.of("email", email, "password", "secret123", "fullName", "X"))
                .andExpect(status().isOk());
        markEmailVerified(email); // xác thực email bật mặc định (V21): test này kiểm JWT / email, không kiểm bước bấm link
        return email;
    }

    @Test
    void missing_invalid_or_expired_token_is_401_not_403() throws Exception {
        call(get("/api/auth/me"), null, null).andExpect(status().isUnauthorized());
        call(get("/api/folders"), "garbage", null).andExpect(status().isUnauthorized());

        String email = registerEmail("exp-" + UUID.randomUUID() + "@test.com");
        call(get("/api/folders"), sign(secret, email, -60_000), null).andExpect(status().isUnauthorized());
        call(get("/api/folders"), sign(secret, email, 60_000), null).andExpect(status().isOk());
    }

    @Test
    void token_signed_with_leaked_secret_is_rejected() throws Exception {
        String email = registerEmail("forge-" + UUID.randomUUID() + "@test.com");
        call(get("/api/auth/me"), sign(LEAKED_SECRET, email, 60_000), null).andExpect(status().isUnauthorized());
    }

    @Test
    void email_is_case_insensitive() throws Exception {
        String id = UUID.randomUUID().toString();
        registerEmail("Mixed-" + id + "@Test.com");

        call(post("/api/auth/register"), null,
                Map.of("email", "MIXED-" + id.toUpperCase() + "@TEST.COM", "password", "secret123", "fullName", "Y"))
                .andExpect(status().isBadRequest());
        call(post("/api/auth/login"), null, Map.of("email", "mixed-" + id + "@test.com", "password", "secret123"))
                .andExpect(status().isOk());
    }

    @Test
    void cors_only_allows_configured_origin() throws Exception {
        mvc.perform(options("/api/folders").header("Origin", "https://evil.example")
                        .header("Access-Control-Request-Method", "DELETE"))
                .andExpect(status().isForbidden());
        mvc.perform(options("/api/folders/x").header("Origin", "http://localhost:5173")
                        .header("Access-Control-Request-Method", "PATCH"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5173"));
    }

    /**
     * STAFF-01: proxy /api của Vite chuyển nguyên header Origin của trình duyệt (changeOrigin chỉ đổi Host), nên mở app bằng
     * http://127.0.0.1:5173 hay http://[::1]:5173 thay vì localhost thì mọi request ghi (trình duyệt gửi Origin cả khi cùng
     * origin) bị 403 "Invalid CORS request" — đăng nhập / đăng ký / thao tác admin đều chết. Mặc định cho cả ba tên loopback.
     */
    @Test
    void cors_allows_vite_dev_origin_under_every_loopback_name() throws Exception {
        String email = registerEmail("cors-" + UUID.randomUUID() + "@test.com");
        String body = json.writeValueAsString(Map.of("email", email, "password", "secret123"));
        for (String origin : List.of("http://localhost:5173", "http://127.0.0.1:5173", "http://[::1]:5173")) {
            mvc.perform(post("/api/auth/login").header("Origin", origin)
                            .contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isOk())
                    .andExpect(header().string("Access-Control-Allow-Origin", origin));
            mvc.perform(options("/api/auth/register").header("Origin", origin)
                            .header("Access-Control-Request-Method", "POST"))
                    .andExpect(status().isOk())
                    .andExpect(header().string("Access-Control-Allow-Origin", origin));
        }
        // Origin lạ vẫn bị chặn, nhưng bằng 403 JSON tiếng Việt như mọi lỗi khác (frontend hiện "message"), không còn chữ thô
        mvc.perform(post("/api/auth/login").header("Origin", "http://evil.example")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403))
                .andExpect(jsonPath("$.message", containsString("CORS")))
                .andExpect(jsonPath("$.message", containsString("Máy chủ từ chối")))
                .andExpect(content().string(not(containsString("Invalid CORS request"))));
    }
}
