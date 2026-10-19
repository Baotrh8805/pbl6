package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.service.AccountDeletionService;
import com.pbl6.flashcard.service.AppealService;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Khiếu nại tài khoản bị khoá (hợp đồng API đợt 2 §6): gửi công khai 202 chung, chỉ lưu khi email đang bị khoá; admin mở khoá
 * qua quy tắc bậc của AdminUserService (audit APPEAL_RESOLVE + USER_UNLOCK), bác bỏ (APPEAL_DISMISS), xử lý lần hai 409.
 */
class AppealIT extends IntegrationTest {

    private static final String MESSAGE = "Tôi bị khoá nhầm, xin xem xét lại giúp.";

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    AppealService appealService;

    private static RequestPostProcessor from(String ip) {
        return req -> {
            req.setRemoteAddr(ip);
            return req;
        };
    }

    /** Mỗi lần gửi một IP riêng: giới hạn 5/giờ/IP dùng chung cả bộ test (bean singleton). */
    private static String randomIp() {
        ThreadLocalRandom r = ThreadLocalRandom.current();
        return "10.77." + r.nextInt(256) + "." + (1 + r.nextInt(254));
    }

    private ResultActions appeal(String email, String message) throws Exception {
        return call(post("/api/auth/appeals").with(from(randomIp())), null, Map.of("email", email, "message", message));
    }

    private Long lockedUser(String email, String reason) throws Exception {
        newUser(email);
        User u = userRepository.findByEmail(email).orElseThrow();
        u.setLockedAt(Instant.now());
        u.setLockedReason(reason);
        userRepository.save(u);
        return u.getId();
    }

    private ResultActions login(String email) throws Exception {
        return call(post("/api/auth/login"), null, Map.of("email", email, "password", "secret123"));
    }

    private JsonNode findAppeal(String token, String status, String email) throws Exception {
        JsonNode page = read(call(get("/api/admin/appeals").param("status", status).param("size", "100"), token, null)
                .andExpect(status().isOk()));
        for (JsonNode n : page.get("items")) {
            if (n.get("email").asText().equals(email)) return n;
        }
        return null;
    }

    private int appealRows(String email) {
        return jdbc.queryForObject("SELECT count(*) FROM account_appeals WHERE lower(email) = lower(?)", Integer.class, email);
    }

    private int audits(String action, Long actorId) {
        return jdbc.queryForObject("SELECT count(*) FROM admin_audit_logs WHERE action = ? AND actor_id = ?", Integer.class,
                action, actorId);
    }

    @Test
    void appeal_from_a_locked_account_is_stored_once_and_listed_for_admins() throws Exception {
        String email = newEmail();
        Long uid = lockedUser(email, "Spam bình luận");
        long openBefore = appealService.countOpen();

        String generic = read(appeal(email.toUpperCase(), MESSAGE).andExpect(status().isAccepted())).get("message").asText();
        assertEquals(1, appealRows(email));
        assertEquals(openBefore + 1, appealService.countOpen());
        // Gửi lặp khi còn khiếu nại đang chờ: vẫn 202 cùng thông báo, không nhân đôi hàng đợi
        appeal(email, "Gửi thêm lần nữa cho chắc.").andExpect(status().isAccepted()).andExpect(jsonPath("$.message").value(generic));
        assertEquals(1, appealRows(email));

        JsonNode a = findAppeal(newStaff(Role.ADMIN), "OPEN", email);
        assertNotNull(a, "khiếu nại phải có trong hàng đợi OPEN");
        assertEquals(email, a.get("email").asText(), "lưu email dạng chuẩn hoá");
        assertEquals(uid, a.get("userId").asLong());
        assertTrue(a.get("userLocked").asBoolean());
        assertEquals("Spam bình luận", a.get("lockedReason").asText());
        assertEquals(MESSAGE, a.get("message").asText());
        assertEquals("OPEN", a.get("status").asText());
        assertTrue(a.hasNonNull("createdAt"));
        assertFalse(a.has("action") || a.has("resolvedAt") || a.has("resolvedByEmail"), "NON_NULL: chưa xử lý thì không có " + a);
    }

    @Test
    void unknown_or_unlocked_email_gets_the_same_202_and_nothing_is_stored() throws Exception {
        String unknown = newEmail();
        String m1 = read(appeal(unknown, MESSAGE).andExpect(status().isAccepted())).get("message").asText();
        String active = newEmail();
        newUser(active);
        String m2 = read(appeal(active, MESSAGE).andExpect(status().isAccepted())).get("message").asText();
        assertEquals(m1, m2, "không cho dò email nào đang bị khoá");
        assertEquals(0, appealRows(unknown));
        assertEquals(0, appealRows(active));
    }

    @Test
    void body_is_validated_and_each_ip_gets_five_appeals_per_hour() throws Exception {
        appeal("khong-phai-email", MESSAGE).andExpect(status().isBadRequest());
        appeal(newEmail(), "ngắn").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("10 đến 1000")));
        appeal(newEmail(), "x".repeat(1001)).andExpect(status().isBadRequest());

        String ip = "10.88.1." + (1 + ThreadLocalRandom.current().nextInt(254));
        for (int i = 0; i < 5; i++) {
            call(post("/api/auth/appeals").with(from(ip)), null, Map.of("email", newEmail(), "message", MESSAGE))
                    .andExpect(status().isAccepted());
        }
        call(post("/api/auth/appeals").with(from(ip)), null, Map.of("email", newEmail(), "message", MESSAGE))
                .andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.status").value(429));
        appeal(newEmail(), MESSAGE).andExpect(status().isAccepted());
    }

    /** @Size đếm cả khoảng trắng hai đầu, nội dung lưu là bản trim: độ dài 10..1000 phải đúng với bản được lưu. */
    @Test
    void message_must_have_ten_characters_after_trimming() throws Exception {
        String email = newEmail();
        lockedUser(email, null);
        appeal(email, "x" + " ".repeat(9)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("10 đến 1000")));
        appeal(email, "   " + "y".repeat(9) + "   ").andExpect(status().isBadRequest());
        assertEquals(0, appealRows(email));

        appeal(email, "  " + MESSAGE + "	 ").andExpect(status().isAccepted());
        assertEquals(MESSAGE, jdbc.queryForObject("SELECT message FROM account_appeals WHERE lower(email) = lower(?)",
                String.class, email));
    }

    /**
     * Tài khoản đã tự xoá bị khoá vĩnh viễn với email ẩn danh đoán được theo id: không nhận khiếu nại (vẫn 202 chung), và
     * khiếu nại có sẵn (dữ liệu cũ / ghi tay) không mở khoá được. Địa chỉ @deleted.local tự đăng ký không bị coi là đã xoá.
     */
    @Test
    void self_deleted_accounts_cannot_appeal_or_be_unlocked() throws Exception {
        String email = newEmail();
        String token = newUser(email);
        Long uid = userId(email);
        call(delete("/api/auth/me"), token, Map.of("password", "secret123")).andExpect(status().isNoContent());
        String anonymized = AccountDeletionService.anonymizedEmail(uid);
        assertNotNull(userRepository.findByEmail(anonymized).orElseThrow().getLockedAt());

        String generic = read(appeal(newEmail(), MESSAGE).andExpect(status().isAccepted())).get("message").asText();
        appeal(anonymized, MESSAGE).andExpect(status().isAccepted()).andExpect(jsonPath("$.message").value(generic));
        assertEquals(0, appealRows(anonymized));

        jdbc.update("INSERT INTO account_appeals (email, user_id, message) VALUES (?, ?, ?)", anonymized, uid, MESSAGE);
        String rootEmail = newEmail();
        String root = newStaff(Role.SUPER_ADMIN, rootEmail);
        long id = findAppeal(root, "OPEN", anonymized).get("id").asLong();
        call(post("/api/admin/appeals/" + id + "/resolve"), root, Map.of("action", "UNLOCK"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message", containsString("đã bị xoá")));
        assertNotNull(findAppeal(root, "OPEN", anonymized), "bị từ chối -> khiếu nại vẫn chờ");
        assertNotNull(userRepository.findById(uid).orElseThrow().getLockedAt(), "khoá vĩnh viễn giữ nguyên");
        assertEquals(0, audits("USER_UNLOCK", userId(rootEmail)));
        call(post("/api/admin/appeals/" + id + "/dismiss"), root, null).andExpect(status().isOk());

        String lookalike = "it-" + java.util.UUID.randomUUID() + "@deleted.local";
        lockedUser(lookalike, null);
        appeal(lookalike, MESSAGE).andExpect(status().isAccepted());
        assertEquals(1, appealRows(lookalike));
    }

    @Test
    void resolve_unlock_reopens_the_account_through_the_admin_unlock_path() throws Exception {
        String email = newEmail();
        lockedUser(email, "Nghi ngờ gian lận");
        appeal(email, MESSAGE).andExpect(status().isAccepted());
        login(email).andExpect(status().isForbidden());

        String adminEmail = newEmail();
        String admin = newStaff(Role.ADMIN, adminEmail);
        Long adminId = userId(adminEmail);
        long id = findAppeal(admin, "OPEN", email).get("id").asLong();

        JsonNode r = read(call(post("/api/admin/appeals/" + id + "/resolve"), admin,
                Map.of("action", "UNLOCK", "note", "  Đã xác minh chủ tài khoản  ")).andExpect(status().isOk()));
        assertEquals("RESOLVED", r.get("status").asText());
        assertEquals("UNLOCK", r.get("action").asText());
        assertEquals("Đã xác minh chủ tài khoản", r.get("resolutionNote").asText());
        assertEquals(adminEmail, r.get("resolvedByEmail").asText());
        assertTrue(r.hasNonNull("resolvedAt"));
        assertFalse(r.get("userLocked").asBoolean());
        assertFalse(r.has("lockedReason"));

        String token = read(login(email).andExpect(status().isOk())).get("accessToken").asText();
        assertEquals(1, audits("APPEAL_RESOLVE", adminId));
        assertEquals(1, audits("USER_UNLOCK", adminId), "mở khoá đi qua AdminUserService.patch");
        assertNull(findAppeal(admin, "OPEN", email));
        assertNotNull(findAppeal(admin, "RESOLVED", email));

        // Tự xoá tài khoản xoá luôn khiếu nại (dữ liệu cá nhân)
        call(delete("/api/auth/me"), token, Map.of("password", "secret123")).andExpect(status().isNoContent());
        assertEquals(0, appealRows(email));
    }

    @Test
    void admin_cannot_unlock_an_admin_but_super_admin_can() throws Exception {
        String lockedAdmin = newEmail();
        newStaff(Role.ADMIN, lockedAdmin);
        User u = userRepository.findByEmail(lockedAdmin).orElseThrow();
        u.setLockedAt(Instant.now());
        userRepository.save(u);
        appeal(lockedAdmin, MESSAGE).andExpect(status().isAccepted());

        String adminEmail = newEmail();
        String admin = newStaff(Role.ADMIN, adminEmail);
        long id = findAppeal(admin, "OPEN", lockedAdmin).get("id").asLong();

        call(post("/api/admin/appeals/" + id + "/resolve"), admin, Map.of("action", "UNLOCK")).andExpect(status().isForbidden());
        assertNotNull(findAppeal(admin, "OPEN", lockedAdmin), "bị từ chối mở khoá -> khiếu nại vẫn chờ (rollback cả transaction)");
        assertEquals(0, audits("APPEAL_RESOLVE", userId(adminEmail)));
        login(lockedAdmin).andExpect(status().isForbidden());

        String root = newStaff(Role.SUPER_ADMIN);
        call(post("/api/admin/appeals/" + id + "/resolve"), root, Map.of("action", "UNLOCK")).andExpect(status().isOk());
        login(lockedAdmin).andExpect(status().isOk());
    }

    @Test
    void dismiss_keeps_the_account_locked_and_a_second_decision_is_409() throws Exception {
        String email = newEmail();
        lockedUser(email, null);
        appeal(email, MESSAGE).andExpect(status().isAccepted());
        String adminEmail = newEmail();
        String admin = newStaff(Role.ADMIN, adminEmail);
        long id = findAppeal(admin, "OPEN", email).get("id").asLong();

        JsonNode d = read(call(post("/api/admin/appeals/" + id + "/dismiss"), admin, Map.of("note", "Vi phạm nhiều lần"))
                .andExpect(status().isOk()));
        assertEquals("DISMISSED", d.get("status").asText());
        assertEquals("Vi phạm nhiều lần", d.get("resolutionNote").asText());
        assertFalse(d.has("action"));
        assertTrue(d.get("userLocked").asBoolean());
        assertEquals(1, audits("APPEAL_DISMISS", userId(adminEmail)));

        call(post("/api/admin/appeals/" + id + "/resolve"), admin, Map.of("action", "UNLOCK")).andExpect(status().isConflict());
        call(post("/api/admin/appeals/" + id + "/dismiss"), admin, null).andExpect(status().isConflict());
        login(email).andExpect(status().isForbidden());
        assertEquals(0, audits("USER_UNLOCK", userId(adminEmail)));

        // Đã đóng -> được gửi khiếu nại mới (unique chỉ áp cho OPEN); bác bỏ không cần body
        appeal(email, MESSAGE).andExpect(status().isAccepted());
        assertEquals(2, appealRows(email));
        long second = findAppeal(admin, "OPEN", email).get("id").asLong();
        call(post("/api/admin/appeals/" + second + "/resolve"), admin, Map.of("action", "NONE")).andExpect(status().isOk())
                .andExpect(jsonPath("$.action").value("NONE"));
        call(post("/api/admin/appeals/" + second + "/resolve"), admin, Map.of("action", "NONE")).andExpect(status().isConflict());
    }

    @Test
    void admin_endpoints_are_staff_only_and_validated() throws Exception {
        call(get("/api/admin/appeals"), newUser(), null).andExpect(status().isForbidden());
        call(get("/api/admin/appeals"), null, null).andExpect(status().isUnauthorized());

        String admin = newStaff(Role.ADMIN);
        call(get("/api/admin/appeals").param("status", "BOGUS"), admin, null).andExpect(status().isBadRequest());
        call(get("/api/admin/appeals").param("status", "DISMISSED"), admin, null).andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray()).andExpect(jsonPath("$.total").isNumber());
        call(post("/api/admin/appeals/999999999/resolve"), admin, Map.of("action", "NONE")).andExpect(status().isNotFound());
        call(post("/api/admin/appeals/999999999/dismiss"), admin, null).andExpect(status().isNotFound());
        call(post("/api/admin/appeals/1/resolve"), admin, Map.of("action", "DELETE")).andExpect(status().isBadRequest());
        call(post("/api/admin/appeals/1/resolve"), admin, Map.of()).andExpect(status().isBadRequest());
    }
}
