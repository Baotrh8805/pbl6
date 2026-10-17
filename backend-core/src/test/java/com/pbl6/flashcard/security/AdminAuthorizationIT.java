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

    // ---------- đổi vai trò (Task 4) ----------

    private record Account(String email, String token, Long id) {}

    private Account staff(Role role) throws Exception {
        String email = newEmail();
        String token = newStaff(role, email);
        return new Account(email, token, userId(email));
    }

    private Account user() throws Exception {
        String email = newEmail();
        String token = newUser(email);
        return new Account(email, token, userId(email));
    }

    private String relogin(String email) throws Exception {
        return read(call(post("/api/auth/login"), null, Map.of("email", email, "password", "secret123")))
                .get("accessToken").asText();
    }

    @Test
    void promoted_user_can_enter_admin_after_relogin() throws Exception { // AZ-03
        Account root = staff(Role.SUPER_ADMIN);
        Account u = user();
        call(put("/api/admin/users/" + u.id + "/role"), root.token, Map.of("role", "VIEWER")).andExpect(status().isOk());
        call(get("/api/admin/users"), relogin(u.email), null).andExpect(status().isOk());
    }

    @Test
    void demoted_viewer_loses_admin_immediately_with_old_token() throws Exception { // AZ-04
        Account root = staff(Role.SUPER_ADMIN);
        Account v = staff(Role.VIEWER);
        call(put("/api/admin/users/" + v.id + "/role"), root.token, Map.of("role", "USER")).andExpect(status().isOk());
        call(get("/api/admin/stats"), v.token, null).andExpect(status().isForbidden());
    }

    @Test
    void super_admin_cannot_change_own_role() throws Exception { // AZ-05
        Account root = staff(Role.SUPER_ADMIN);
        call(put("/api/admin/users/" + root.id + "/role"), root.token, Map.of("role", "ADMIN")).andExpect(status().isBadRequest());
    }

    @Test
    void unknown_role_is_rejected() throws Exception { // AZ-07
        Account root = staff(Role.SUPER_ADMIN);
        Account u = user();
        call(put("/api/admin/users/" + u.id + "/role"), root.token, Map.of("role", "MODERATOR")).andExpect(status().isBadRequest());
        call(put("/api/admin/users/" + u.id + "/role"), root.token, Map.of("role", "ROOT")).andExpect(status().isBadRequest());
    }

    @Test
    void role_change_is_audited_and_revokes_sessions() throws Exception { // AZ-08
        Account root = staff(Role.SUPER_ADMIN);
        String email = newEmail();
        newUser(email);
        JsonNode tokens = read(call(post("/api/auth/login"), null, Map.of("email", email, "password", "secret123")));
        Long id = userId(email);
        call(put("/api/admin/users/" + id + "/role"), root.token, Map.of("role", "VIEWER")).andExpect(status().isOk());
        JsonNode logs = read(call(get("/api/admin/audit-logs").param("actorId", root.id.toString()), root.token, null));
        assertEquals(1, logs.get("total").asLong());
        JsonNode d = logs.get("items").get(0).get("detail").get("role");
        assertEquals("USER", d.get("before").asText());
        assertEquals("VIEWER", d.get("after").asText());
        call(post("/api/auth/refresh"), null, Map.of("refreshToken", tokens.get("refreshToken").asText()))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void hierarchy_applies_to_pre_authorize() throws Exception { // AZ-09: PATCH user cần ADMIN, SUPER_ADMIN cũng qua
        Account root = staff(Role.SUPER_ADMIN);
        Account u = user();
        call(patch("/api/admin/users/" + u.id), root.token, Map.of("premium", true)).andExpect(status().isOk());
        call(patch("/api/admin/users/" + u.id), staff(Role.VIEWER).token, Map.of("premium", true)).andExpect(status().isForbidden());
    }

    @Test
    void learning_data_survives_promotion_and_demotion() throws Exception { // AZ-12
        Account root = staff(Role.SUPER_ADMIN);
        Account u = user();
        for (int i = 0; i < 3; i++) {
            call(post("/api/decks"), u.token, Map.of("title", "D" + i, "level", "N5", "cards", List.of(Map.of("term", "猫", "meaning", "mèo"))))
                    .andExpect(status().isCreated());
        }
        call(put("/api/admin/users/" + u.id + "/role"), root.token, Map.of("role", "VIEWER")).andExpect(status().isOk());
        call(get("/api/decks"), relogin(u.email), null).andExpect(status().isForbidden());
        call(put("/api/admin/users/" + u.id + "/role"), root.token, Map.of("role", "USER")).andExpect(status().isOk());
        assertEquals(3, read(call(get("/api/decks"), relogin(u.email), null).andExpect(status().isOk())).size());
    }
}
