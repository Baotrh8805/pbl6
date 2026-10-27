package com.pbl6.flashcard.security;

import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.ResultActions;

import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@TestPropertySource(properties = "app.rate-limit.register.max=2")
class RegisterRateLimitIT extends IntegrationTest {

    private ResultActions registerFrom(String ip) throws Exception {
        String body = json.writeValueAsString(Map.of("email", newEmail(), "password", "Secret123!", "fullName", "R"));
        return mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(body)
                .with(req -> {
                    req.setRemoteAddr(ip);
                    return req;
                }));
    }

    @Test
    void too_many_accounts_from_one_ip_are_blocked_but_other_ips_are_not() throws Exception {
        registerFrom("10.1.1.1").andExpect(status().isOk());
        registerFrom("10.1.1.1").andExpect(status().isOk());
        registerFrom("10.1.1.1").andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.status").value(429));
        registerFrom("10.1.1.2").andExpect(status().isOk());
    }
}
