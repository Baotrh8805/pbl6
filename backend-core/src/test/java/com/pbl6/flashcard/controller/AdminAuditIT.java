package com.pbl6.flashcard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.service.AuditService;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Nhật ký quản trị: chỉ đọc, lọc theo người thao tác / loại đối tượng. */
class AdminAuditIT extends IntegrationTest {

    @Autowired
    AuditService audit;

    @Autowired
    TransactionTemplate tx;

    @Test
    void viewer_lists_logs_filtered_by_actor_and_target_type() throws Exception {
        String emailA = newEmail();
        String emailB = newEmail();
        String viewer = newStaff(Role.VIEWER, emailA);
        newStaff(Role.ADMIN, emailB);
        Long a = userId(emailA);
        Long b = userId(emailB);
        tx.executeWithoutResult(s -> {
            audit.log(a, "USER_LOCK", "USER", "42", AuditService.diff("locked", false, true));
            audit.log(b, "DECK_UNPUBLISH", "DECK", "k9f", AuditService.diff("visibility", "public", "private"));
        });

        JsonNode page = read(call(get("/api/admin/audit-logs").param("actorId", a.toString()).param("targetType", "USER"),
                viewer, null).andExpect(status().isOk()));
        assertEquals(1, page.get("total").asLong());
        JsonNode row = page.get("items").get(0);
        assertEquals(emailA, row.get("actorEmail").asText());
        assertEquals("USER_LOCK", row.get("action").asText());
        assertEquals(true, row.get("detail").get("locked").get("after").asBoolean());

        JsonNode all = read(call(get("/api/admin/audit-logs").param("size", "100"), viewer, null));
        assertTrue(all.get("total").asLong() >= 2);
    }

    @Test
    void audit_endpoints_are_read_only() throws Exception {
        String root = newStaff(Role.SUPER_ADMIN);
        int put = call(put("/api/admin/audit-logs/1"), root, Map.of()).andReturn().getResponse().getStatus();
        int del = call(delete("/api/admin/audit-logs/1"), root, null).andReturn().getResponse().getStatus();
        assertTrue(put == 404 || put == 405, "PUT -> " + put);
        assertTrue(del == 404 || del == 405, "DELETE -> " + del);
    }

    @Test
    void user_is_forbidden() throws Exception {
        call(get("/api/admin/audit-logs"), newUser(), null).andExpect(status().isForbidden());
    }

    @Test
    void page_params_are_validated() throws Exception {
        String viewer = newStaff(Role.VIEWER);
        call(get("/api/admin/audit-logs").param("page", "-1"), viewer, null).andExpect(status().isBadRequest());
        call(get("/api/admin/audit-logs").param("size", "101"), viewer, null).andExpect(status().isBadRequest());
    }

    @Autowired
    com.pbl6.flashcard.repository.AdminAuditLogRepository logRepo;

    /** Lọc theo ngày dùng múi giờ ứng dụng (Asia/Ho_Chi_Minh): 01:00 hôm nay giờ VN là 18:00 hôm qua UTC. */
    @Test
    void date_filter_uses_application_timezone() throws Exception {
        String email = newEmail();
        String viewer = newStaff(Role.VIEWER, email);
        Long me = userId(email);
        java.time.ZoneId vn = java.time.ZoneId.of("Asia/Ho_Chi_Minh");
        java.time.LocalDate today = java.time.LocalDate.now(vn);
        com.pbl6.flashcard.model.AdminAuditLog l = new com.pbl6.flashcard.model.AdminAuditLog();
        l.setActorId(me);
        l.setAction("USER_LOCK");
        l.setTargetType("USER");
        l.setTargetId("tz");
        l.setCreatedAt(today.atTime(1, 0).atZone(vn).toInstant());
        logRepo.save(l);

        JsonNode fromToday = read(call(get("/api/admin/audit-logs").param("actorId", me.toString()).param("from", today.toString()),
                viewer, null).andExpect(status().isOk()));
        assertEquals(1, fromToday.get("total").asLong(), "từ hôm nay (giờ VN) phải thấy dòng lúc 01:00");
        JsonNode toYesterday = read(call(get("/api/admin/audit-logs").param("actorId", me.toString())
                .param("to", today.minusDays(1).toString()), viewer, null));
        assertEquals(0, toYesterday.get("total").asLong(), "đến hết hôm qua (giờ VN) không được lọt dòng hôm nay");
    }
}
