package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.service.AccountDeletionService;
import com.pbl6.flashcard.service.AiServiceClient;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockPart;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.ResultActions;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Admin quản lý người dùng: khoá, premium, hạn mức AI riêng, thu hồi phiên; bảo vệ lẫn nhau theo bậc. */
class AdminUserIT extends IntegrationTest {

    @MockitoBean
    AiServiceClient aiClient;

    private record Account(String email, String token, Long id) {}

    private Account user() throws Exception {
        String email = newEmail();
        String token = newUser(email);
        return new Account(email, token, userId(email));
    }

    private Account staff(Role role) throws Exception {
        String email = newEmail();
        String token = newStaff(role, email);
        return new Account(email, token, userId(email));
    }

    private Map<String, Object> body(String k, Object v) {
        Map<String, Object> m = new HashMap<>();
        m.put(k, v);
        return m;
    }

    private ResultActions patchUser(String token, Long id, Map<String, Object> b) throws Exception {
        return call(patch("/api/admin/users/" + id), token, b);
    }

    private long auditCount(String token, Long targetId) throws Exception {
        JsonNode p = read(call(get("/api/admin/audit-logs").param("targetType", "USER").param("size", "100"), token, null));
        long n = 0;
        for (JsonNode r : p.get("items")) if (r.get("targetId").asText().equals(targetId.toString())) n++;
        return n;
    }

    private ResultActions extract(String token) throws Exception {
        return call(multipart("/api/extractions").part(new MockPart("text", "猫が好きです。".getBytes(StandardCharsets.UTF_8))), token, null);
    }

    @Test
    void admin_locks_user_and_it_is_audited() throws Exception { // US-01
        Account admin = staff(Role.ADMIN);
        Account u = user();
        JsonNode res = read(patchUser(admin.token, u.id, body("locked", true)).andExpect(status().isOk()));
        assertFalse(res.get("lockedAt").isNull());
        call(get("/api/decks"), u.token, null).andExpect(status().isUnauthorized());
        assertEquals(1, auditCount(admin.token, u.id));
    }

    @Test
    void admin_cannot_lock_peer_or_super_admin() throws Exception { // US-06
        Account admin = staff(Role.ADMIN);
        patchUser(admin.token, staff(Role.ADMIN).id, body("locked", true)).andExpect(status().isForbidden());
        patchUser(admin.token, staff(Role.SUPER_ADMIN).id, body("locked", true)).andExpect(status().isForbidden());
    }

    @Test
    void admin_cannot_act_on_self() throws Exception { // US-07
        Account admin = staff(Role.ADMIN);
        patchUser(admin.token, admin.id, body("locked", true)).andExpect(status().isBadRequest());
        call(post("/api/admin/users/" + admin.id + "/revoke-sessions"), admin.token, null).andExpect(status().isBadRequest());
    }

    @Test
    void locking_twice_is_idempotent_without_second_audit() throws Exception { // US-08
        Account admin = staff(Role.ADMIN);
        Account u = user();
        patchUser(admin.token, u.id, body("locked", true)).andExpect(status().isOk());
        patchUser(admin.token, u.id, body("locked", true)).andExpect(status().isOk());
        assertEquals(1, auditCount(admin.token, u.id));
    }

    /**
     * Đã khoá + gửi lý do khác: đổi lý do (trước đây 200 mà lặng lẽ giữ lý do cũ), audit USER_LOCK_REASON với before/after, mốc
     * khoá giữ nguyên. Lý do trùng / rỗng / thiếu = no-op, không audit. Quy tắc bậc vẫn áp dụng. Khiếu nại đã gửi giữ lý do chụp
     * lúc gửi (STAFF-07), chỉ lockedReason hiện tại đổi.
     */
    @Test
    void relocking_with_a_new_reason_updates_it_and_is_audited() throws Exception {
        Account admin = staff(Role.ADMIN);
        Account u = user();
        JsonNode locked = read(patchUser(admin.token, u.id, Map.of("locked", true, "lockedReason", "Spam bình luận"))
                .andExpect(status().isOk()));
        assertEquals("Spam bình luận", locked.get("lockedReason").asText());
        String lockedAt = locked.get("lockedAt").asText();
        // Lần khoá trả mốc trong RAM, mọi lần đọc sau trả mốc từ DB (timestamptz, micro giây): server làm tròn xuống micro giây khi
        // đặt nên hai chuỗi giống hệt (trước đây …23.222907500Z rồi …23.222908Z)
        assertEquals(lockedAt, read(call(get("/api/admin/users/" + u.id), admin.token, null).andExpect(status().isOk()))
                .get("lockedAt").asText());
        // khiếu nại gửi khi đang khoá với lý do cũ
        String ip = "10.78." + ThreadLocalRandom.current().nextInt(256) + "." + (1 + ThreadLocalRandom.current().nextInt(254));
        call(post("/api/auth/appeals").with(req -> { // IP riêng: giới hạn khiếu nại 5/giờ/IP dùng chung cả bộ test
            req.setRemoteAddr(ip);
            return req;
        }), null, Map.of("email", u.email, "message", "Tôi bị khoá nhầm, xin xem xét lại giúp.")).andExpect(status().isAccepted());

        JsonNode changed = read(patchUser(admin.token, u.id, Map.of("locked", true, "lockedReason", "  Lừa đảo  "))
                .andExpect(status().isOk()));
        assertEquals("Lừa đảo", changed.get("lockedReason").asText(), "lý do mới (đã trim) thay lý do cũ");
        assertEquals(lockedAt, changed.get("lockedAt").asText(), "đổi lý do không đổi mốc khoá");
        assertEquals("Lừa đảo", userRepository.findById(u.id).orElseThrow().getLockedReason());
        assertEquals(2, auditCount(admin.token, u.id), "USER_LOCK + USER_LOCK_REASON");
        JsonNode audit = null;
        for (JsonNode r : read(call(get("/api/admin/audit-logs").param("targetType", "USER").param("size", "100"), admin.token, null))
                .get("items")) {
            if (r.get("targetId").asText().equals(u.id.toString()) && "USER_LOCK_REASON".equals(r.get("action").asText())) audit = r;
        }
        assertNotNull(audit, "đổi lý do được audit riêng");
        assertEquals("Spam bình luận", audit.get("detail").get("lockedReason").get("before").asText(), audit.toString());
        assertEquals("Lừa đảo", audit.get("detail").get("lockedReason").get("after").asText(), audit.toString());

        // lý do trùng / rỗng / chỉ locked=true: không đổi gì, không audit thêm
        patchUser(admin.token, u.id, Map.of("locked", true, "lockedReason", "Lừa đảo")).andExpect(status().isOk());
        patchUser(admin.token, u.id, Map.of("locked", true, "lockedReason", "   ")).andExpect(status().isOk());
        patchUser(admin.token, u.id, body("locked", true)).andExpect(status().isOk());
        assertEquals("Lừa đảo", userRepository.findById(u.id).orElseThrow().getLockedReason());
        assertEquals(2, auditCount(admin.token, u.id));

        // STAFF-07: khiếu nại đang chờ giữ lý do lúc gửi, lockedReason là trạng thái hiện tại
        JsonNode appeal = null;
        for (JsonNode a : read(call(get("/api/admin/appeals").param("status", "OPEN").param("size", "100"), admin.token, null)
                .andExpect(status().isOk())).get("items")) {
            if (a.get("email").asText().equals(u.email)) appeal = a;
        }
        assertNotNull(appeal);
        assertEquals("Spam bình luận", appeal.get("lockedReasonAtSubmit").asText(), appeal.toString());
        assertEquals("Lừa đảo", appeal.get("lockedReason").asText(), appeal.toString());

        // quy tắc bậc: ADMIN không đổi được lý do khoá của ADMIN khác (do SUPER_ADMIN khoá)
        Account root = staff(Role.SUPER_ADMIN);
        Account peer = staff(Role.ADMIN);
        patchUser(root.token, peer.id, Map.of("locked", true, "lockedReason", "Lạm quyền")).andExpect(status().isOk());
        patchUser(admin.token, peer.id, Map.of("locked", true, "lockedReason", "Khác")).andExpect(status().isForbidden());
        assertEquals("Lạm quyền", userRepository.findById(peer.id).orElseThrow().getLockedReason());
    }

    @Test
    void zero_personal_limit_blocks_first_extraction() throws Exception { // US-09
        Account admin = staff(Role.ADMIN);
        Account u = user();
        patchUser(admin.token, u.id, body("extractionDailyLimit", 0)).andExpect(status().isOk());
        extract(u.token).andExpect(status().isTooManyRequests());
    }

    @Test
    void clearing_personal_limit_falls_back_to_global() throws Exception { // US-10
        Account admin = staff(Role.ADMIN);
        Account u = user();
        patchUser(admin.token, u.id, body("extractionDailyLimit", 0)).andExpect(status().isOk());
        JsonNode res = read(patchUser(admin.token, u.id, body("clearLimit", true)).andExpect(status().isOk()));
        assertTrue(res.get("extractionDailyLimit").isNull());
        for (int i = 0; i < 5; i++) extract(u.token).andExpect(status().isAccepted());
        extract(u.token).andExpect(status().isTooManyRequests());
    }

    @Test
    void personal_limit_is_validated() throws Exception { // US-11
        Account admin = staff(Role.ADMIN);
        Account u = user();
        patchUser(admin.token, u.id, body("extractionDailyLimit", 1001)).andExpect(status().isBadRequest());
        patchUser(admin.token, u.id, body("extractionDailyLimit", -1)).andExpect(status().isBadRequest());
    }

    @Test
    void revoke_sessions_invalidates_tokens_but_keeps_password() throws Exception { // US-12
        Account admin = staff(Role.ADMIN);
        String email = newEmail();
        newUser(email);
        JsonNode tokens = read(call(post("/api/auth/login"), null, Map.of("email", email, "password", "Secret123!")));
        Long id = userId(email);
        Thread.sleep(1100); // iat của JWT chỉ chính xác tới giây: mốc thu hồi phải sang giây mới (như đổi mật khẩu)
        call(post("/api/admin/users/" + id + "/revoke-sessions"), admin.token, null).andExpect(status().isNoContent());
        call(post("/api/auth/refresh"), null, Map.of("refreshToken", tokens.get("refreshToken").asText()))
                .andExpect(status().isUnauthorized());
        call(get("/api/decks"), tokens.get("accessToken").asText(), null).andExpect(status().isUnauthorized());
        call(post("/api/auth/login"), null, Map.of("email", email, "password", "Secret123!")).andExpect(status().isOk());
    }

    @Test
    void premium_toggle_is_visible_in_profile() throws Exception { // US-13
        Account admin = staff(Role.ADMIN);
        Account u = user();
        patchUser(admin.token, u.id, body("premium", true)).andExpect(status().isOk());
        assertTrue(read(call(get("/api/auth/me"), u.token, null)).get("isPremium").asBoolean());
    }

    /**
     * Hạn Premium gửi kèm phần dưới micro giây: lưu (timestamptz, micro giây) và trả về đúng giá trị DB giữ được, cắt xuống chứ không
     * làm tròn sang giây sau; gửi lại cùng hạn là no-op (trước đây response mang …59.999999999Z, DB lưu 17:00:00Z, nên gửi lại
     * thành "đổi hạn" với audit + thông báo thừa).
     */
    @Test
    void premium_until_round_trips_at_microsecond_precision() throws Exception {
        Account admin = staff(Role.ADMIN);
        Account u = user();
        Map<String, Object> b = Map.of("premium", true, "premiumUntil", "2027-01-31T16:59:59.999999999Z");
        JsonNode res = read(patchUser(admin.token, u.id, b).andExpect(status().isOk()));
        assertEquals("2027-01-31T16:59:59.999999Z", res.get("premiumUntil").asText());
        assertEquals(res.get("premiumUntil").asText(), read(call(get("/api/admin/users/" + u.id), admin.token, null)
                .andExpect(status().isOk())).get("premiumUntil").asText());
        patchUser(admin.token, u.id, b).andExpect(status().isOk());
        assertEquals(1, auditCount(admin.token, u.id), "gửi lại cùng hạn: không đổi gì, không audit");
    }

    @Test
    void empty_patch_changes_nothing_and_is_not_audited() throws Exception { // US-14
        Account admin = staff(Role.ADMIN);
        Account u = user();
        patchUser(admin.token, u.id, Map.of()).andExpect(status().isOk());
        assertEquals(0, auditCount(admin.token, u.id));
    }

    @Test
    void search_escapes_like_wildcards_and_limits_length() throws Exception { // US-15
        Account viewer = staff(Role.ADMIN);
        user();
        JsonNode pct = read(call(get("/api/admin/users").param("q", "%"), viewer.token, null).andExpect(status().isOk()));
        assertEquals(0, pct.get("total").asLong(), "'%' là ký tự thường, không khớp tất cả");
        JsonNode us = read(call(get("/api/admin/users").param("q", "_"), viewer.token, null));
        assertEquals(0, us.get("total").asLong());
        call(get("/api/admin/users").param("q", "a".repeat(101)), viewer.token, null).andExpect(status().isBadRequest());
    }

    @Test
    void paging_params_are_validated() throws Exception { // US-16
        Account viewer = staff(Role.ADMIN);
        call(get("/api/admin/users").param("page", "-1"), viewer.token, null).andExpect(status().isBadRequest());
        call(get("/api/admin/users").param("size", "0"), viewer.token, null).andExpect(status().isBadRequest());
        call(get("/api/admin/users").param("size", "101"), viewer.token, null).andExpect(status().isBadRequest());
    }

    @Test
    void detail_of_fresh_user_has_zero_counts() throws Exception { // US-17
        Account viewer = staff(Role.ADMIN);
        Account u = user();
        JsonNode d = read(call(get("/api/admin/users/" + u.id), viewer.token, null).andExpect(status().isOk()));
        assertEquals(0, d.get("deckCount").asInt());
        assertEquals(0, d.get("cardCount").asInt());
        assertEquals(0, d.get("quizCount").asInt());
        assertEquals(0, d.get("extractionsToday").asInt());
        assertTrue(d.get("lastReviewAt").isNull());
        assertEquals(1, d.get("activeSessions").asInt());
        assertEquals(u.email, d.get("email").asText());
        assertFalse(d.get("deleted").asBoolean());
    }

    @Test
    void unknown_user_is_404() throws Exception { // US-18
        call(get("/api/admin/users/999999"), staff(Role.ADMIN).token, null).andExpect(status().isNotFound());
    }

    @Test
    void super_admin_can_lock_admin() throws Exception { // US-19
        Account root = staff(Role.SUPER_ADMIN);
        Account a = staff(Role.ADMIN);
        patchUser(root.token, a.id, body("locked", true)).andExpect(status().isOk());
        call(get("/api/admin/stats"), a.token, null).andExpect(status().isUnauthorized());
    }

    @Test
    void list_filters_by_role_and_shows_deck_count() throws Exception {
        Account viewer = staff(Role.ADMIN);
        Account u = user();
        call(post("/api/decks"), u.token, Map.of("title", "A", "level", "N5", "cards", List.of(Map.of("term", "猫", "meaning", "mèo"))))
                .andExpect(status().isCreated());
        JsonNode page = read(call(get("/api/admin/users").param("q", u.email).param("role", "USER"), viewer.token, null)
                .andExpect(status().isOk()));
        assertEquals(1, page.get("total").asLong());
        assertEquals(1, page.get("items").get(0).get("deckCount").asInt());
        assertFalse(page.get("items").get(0).get("deleted").asBoolean());
        assertEquals(0, read(call(get("/api/admin/users").param("q", u.email).param("role", "ADMIN"), viewer.token, null))
                .get("total").asLong());
    }

    /**
     * Tài khoản đã tự xoá: danh sách / chi tiết đánh dấu deleted=true; mở khoá (kể cả Super admin), Premium, hạn mức, vai trò
     * đều 409 để không hồi sinh tài khoản chủ nhân đã yêu cầu xoá. Khoá lại là no-op nên vẫn 200 và không audit.
     */
    @Test
    void self_deleted_account_is_flagged_and_cannot_be_revived() throws Exception {
        Account u = user();
        call(delete("/api/auth/me"), u.token, Map.of("password", "Secret123!")).andExpect(status().isNoContent());
        Account admin = staff(Role.ADMIN);
        Account root = staff(Role.SUPER_ADMIN);
        String anonymized = AccountDeletionService.anonymizedEmail(u.id);

        JsonNode page = read(call(get("/api/admin/users").param("q", anonymized), admin.token, null).andExpect(status().isOk()));
        assertEquals(1, page.get("total").asLong());
        JsonNode row = page.get("items").get(0);
        assertTrue(row.get("deleted").asBoolean());
        assertFalse(row.get("lockedAt").isNull());
        JsonNode d = read(call(get("/api/admin/users/" + u.id), admin.token, null).andExpect(status().isOk()));
        assertTrue(d.get("deleted").asBoolean());
        assertEquals(AccountDeletionService.DELETED_NAME, d.get("fullName").asText());

        patchUser(admin.token, u.id, body("locked", false)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(AccountDeletionService.CANNOT_UNLOCK));
        patchUser(root.token, u.id, body("locked", false)).andExpect(status().isConflict());
        patchUser(admin.token, u.id, body("premium", true)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(AccountDeletionService.CANNOT_CHANGE));
        patchUser(admin.token, u.id, body("extractionDailyLimit", 5)).andExpect(status().isConflict());
        patchUser(admin.token, u.id, body("clearLimit", true)).andExpect(status().isConflict());
        call(put("/api/admin/users/" + u.id + "/role"), root.token, Map.of("role", "ADMIN")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(AccountDeletionService.CANNOT_CHANGE));
        // lý do của khoá vĩnh viễn không đổi được (khoá lại có lý do mới = thay đổi, không phải no-op)
        String deletedReason = userRepository.findById(u.id).orElseThrow().getLockedReason();
        patchUser(admin.token, u.id, Map.of("locked", true, "lockedReason", "Lý do khác")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(AccountDeletionService.CANNOT_CHANGE));
        patchUser(admin.token, u.id, body("locked", true)).andExpect(status().isOk());

        User after = userRepository.findById(u.id).orElseThrow();
        assertNotNull(after.getLockedAt(), "khoá vĩnh viễn giữ nguyên");
        assertEquals(Role.USER, after.getRole());
        assertFalse(after.getIsPremium());
        assertNull(after.getExtractionDailyLimit());
        assertEquals(anonymized, after.getEmail());
        assertEquals(deletedReason, after.getLockedReason());
        assertEquals(1, auditCount(admin.token, u.id), "chỉ có USER_SELF_DELETE, không USER_UNLOCK / USER_PREMIUM / USER_ROLE");
    }
}
