package com.pbl6.flashcard.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Ma trận phân quyền (spec Admin Panel mục 3): USER không vào /api/admin, staff không dùng API học tập,
 * ai cũng dùng được /api/auth. Các endpoint admin cụ thể được thêm vào bảng ở từng task.
 */
class AdminAuthorizationIT extends IntegrationTest {

    @Test
    void user_is_forbidden_on_admin_paths() throws Exception {
        String user = newUser();
        call(get("/api/admin/stats"), user, null).andExpect(status().isForbidden());
    }

    @Test
    void anonymous_is_unauthorized() throws Exception {
        call(get("/api/admin/stats"), null, null).andExpect(status().isUnauthorized());
    }

    @ParameterizedTest
    @EnumSource(value = Role.class, names = {"VIEWER", "ADMIN", "SUPER_ADMIN"})
    void staff_cannot_use_learning_apis(Role role) throws Exception {
        String token = newStaff(role);
        call(get("/api/decks"), token, null).andExpect(status().isForbidden());
        call(post("/api/decks"), token, Map.of("title", "x", "level", "N5", "cards", List.of()))
                .andExpect(status().isForbidden());
        call(get("/api/library/decks"), token, null).andExpect(status().isForbidden());
        call(get("/api/quizzes/n5-core"), token, null).andExpect(status().isForbidden());
    }

    @Test
    void staff_can_use_auth_apis() throws Exception {
        String viewer = newStaff(Role.VIEWER);
        JsonNode me = read(call(get("/api/auth/me"), viewer, null).andExpect(status().isOk()));
        assertEquals("VIEWER", me.get("role").asText());
    }

    @Test
    void login_response_carries_role() throws Exception {
        String email = newEmail();
        newStaff(Role.ADMIN, email);
        JsonNode admin = read(call(post("/api/auth/login"), null, Map.of("email", email, "password", "secret123"))
                .andExpect(status().isOk()));
        assertEquals("ADMIN", admin.get("role").asText());

        String userEmail = newEmail();
        newUser(userEmail);
        JsonNode user = read(call(post("/api/auth/login"), null, Map.of("email", userEmail, "password", "secret123")));
        assertEquals("USER", user.get("role").asText());
    }
}
