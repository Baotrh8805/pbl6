package com.pbl6.flashcard.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.zonky.test.db.AutoConfigureEmbeddedDatabase;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

/**
 * Nền cho test tích hợp: app thật + Postgres nhúng (partial index, lower()... chạy như Supabase).
 * Các test dùng chung 1 DB nên mỗi test tự tạo user riêng bằng {@link #newUser()}.
 */
@SpringBootTest
@AutoConfigureMockMvc
@AutoConfigureEmbeddedDatabase(provider = AutoConfigureEmbeddedDatabase.DatabaseProvider.ZONKY)
@ActiveProfiles("test")
public abstract class IntegrationTest {

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected ObjectMapper json;

    @Autowired
    protected com.pbl6.flashcard.repository.UserRepository userRepository;

    /** Đăng ký + đăng nhập, trả về access token. */
    protected String newUser() throws Exception {
        return newUser(newEmail());
    }

    protected static String newEmail() {
        return "it-" + UUID.randomUUID() + "@test.com";
    }

    /**
     * Xác thực email bật theo seed V21 (email_verification_required = true) nên tài khoản vừa đăng ký chưa đăng nhập được:
     * đánh dấu đã xác thực thẳng trong DB như người dùng đã bấm link. Luồng xác thực thật nằm ở EmailVerificationIT.
     */
    protected String newUser(String email) throws Exception {
        String body = json.writeValueAsString(java.util.Map.of(
                "email", email, "password", "Secret123!", "fullName", "IT"));
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(body));
        markEmailVerified(email);
        String res = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(body))
                .andReturn().getResponse().getContentAsString();
        return json.readTree(res).get("accessToken").asText();
    }

    /** Test tự gọi /api/auth/register rồi muốn đăng nhập / dùng token: bỏ qua bước bấm link xác thực. */
    protected void markEmailVerified(String email) {
        userRepository.findByEmail(com.pbl6.flashcard.model.User.normalizeEmail(email))
                .filter(u -> u.getEmailVerifiedAt() == null)
                .ifPresent(u -> {
                    u.setEmailVerifiedAt(java.time.Instant.now());
                    userRepository.save(u);
                });
    }

    /** Tài khoản staff: đăng ký như người thường (đã xác thực email qua newUser), đặt vai trò thẳng trong DB (spec 3.4), đăng nhập lại lấy token. */
    protected String newStaff(com.pbl6.flashcard.model.Role role) throws Exception {
        return newStaff(role, newEmail());
    }

    protected String newStaff(com.pbl6.flashcard.model.Role role, String email) throws Exception {
        newUser(email);
        com.pbl6.flashcard.model.User u = userRepository.findByEmail(email).orElseThrow();
        u.setRole(role);
        userRepository.save(u);
        String body = json.writeValueAsString(java.util.Map.of("email", email, "password", "Secret123!"));
        String res = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(body))
                .andReturn().getResponse().getContentAsString();
        return json.readTree(res).get("accessToken").asText();
    }

    protected Long userId(String email) {
        return userRepository.findByEmail(email).orElseThrow().getId();
    }

    protected ResultActions call(MockHttpServletRequestBuilder req, String token, Object body) throws Exception {
        if (token != null) req.header("Authorization", "Bearer " + token);
        if (body != null) req.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
        return mvc.perform(req);
    }

    protected JsonNode read(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString());
    }
}
