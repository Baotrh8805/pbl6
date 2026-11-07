package com.pbl6.flashcard.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.pbl6.flashcard.model.Role;
import com.pbl6.flashcard.model.User;
import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** G5/N2: Premium có hạn; job đêm hạ về free khi quá hạn và báo người dùng. */
class PremiumExpiryIT extends IntegrationTest {

    @Autowired HousekeepingJob housekeeping;

    @Test
    void admin_sets_expiry_and_housekeeping_expires_it() throws Exception {
        String admin = newStaff(Role.ADMIN);
        String email = newEmail();
        String user = newUser(email);
        Long id = userId(email);
        Instant until = Instant.now().plus(Duration.ofDays(30)).truncatedTo(java.time.temporal.ChronoUnit.SECONDS);

        JsonNode d = read(call(patch("/api/admin/users/" + id), admin, Map.of("premium", true, "premiumUntil", until.toString()))
                .andExpect(status().isOk()));
        assertTrue(d.get("isPremium").asBoolean());
        assertEquals(until.toString(), d.get("premiumUntil").asText());
        assertEquals(until.toString(), read(call(get("/api/auth/me"), user, null)).get("premiumUntil").asText());

        // Đổi sang vĩnh viễn = gửi premium=true không kèm hạn
        d = read(call(patch("/api/admin/users/" + id), admin, Map.of("premium", true)).andExpect(status().isOk()));
        assertTrue(d.get("premiumUntil").isNull());

        // Hết hạn trong quá khứ -> job hạ về free + thông báo
        call(patch("/api/admin/users/" + id), admin, Map.of("premium", true, "premiumUntil", Instant.now().minusSeconds(60).toString()))
                .andExpect(status().isOk());
        int[] n = housekeeping.run(Instant.now());
        assertTrue(n[3] >= 1);
        User u = userRepository.findById(id).orElseThrow();
        assertFalse(u.getIsPremium());
        assertNull(u.getPremiumUntil());
        JsonNode feed = read(call(get("/api/notifications"), user, null));
        JsonNode last = feed.get("items").get(0);
        assertEquals("PREMIUM_CHANGED", last.get("type").asText());
        assertFalse(last.get("payload").get("premium").asBoolean());
        assertTrue(last.get("payload").get("expired").asBoolean());
    }
}
