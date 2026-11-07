package com.pbl6.flashcard.security;

import com.pbl6.flashcard.support.IntegrationTest;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * Rà soát 25/10 (S4): thao tác gọi lại AI không tạo job mới (không bị hạn mức ngày chặn) có trần theo người dùng. Bước đếm đứng
 * trước service nên id không tồn tại (404) cũng tính — đủ để kiểm trần mà không cần ai-service.
 */
class AiRateLimitIT extends IntegrationTest {

    private int status(String method, String url, String token, Object body) throws Exception {
        var req = "PUT".equals(method) ? put(url) : post(url);
        return call(req, token, body).andReturn().getResponse().getStatus();
    }

    @Test
    void reanalyze_actions_share_a_per_user_cap() throws Exception {
        String token = newUser();
        String job = "/api/extractions/" + UUID.randomUUID();
        String path = "/api/learning-paths/" + UUID.randomUUID();
        // 10 lần (mặc định) trộn đủ loại: rerun, sửa văn bản, dịch lại nghĩa, chạy lại / sửa văn bản lộ trình
        String[][] calls = {
                {"POST", job + "/rerun"}, {"PUT", job + "/text"}, {"POST", job + "/enrich"},
                {"POST", path + "/retry"}, {"PUT", path + "/text"}, {"POST", path + "/enrich"},
                {"POST", job + "/rerun"}, {"POST", job + "/rerun"}, {"POST", job + "/rerun"}, {"POST", job + "/rerun"}};
        for (String[] c : calls) {
            int s = status(c[0], c[1], token, "PUT".equals(c[0]) ? Map.of("text", "日本語") : null);
            assertEquals(true, s != 429, c[1] + " chưa tới trần mà đã 429");
        }
        assertEquals(429, status("POST", job + "/rerun", token, null));
        assertEquals(429, status("POST", path + "/retry", token, null));
        // người khác không bị vạ lây
        assertEquals(404, status("POST", job + "/rerun", newUser(), null));
    }

    @Test
    void deck_ai_tools_have_their_own_cap() throws Exception {
        String token = newUser();
        for (int i = 0; i < 20; i++) {
            assertEquals(true, status("POST", "/api/decks/khong-ton-tai/distractors", token, null) != 429, "lần " + (i + 1));
        }
        assertEquals(429, status("POST", "/api/decks/khong-ton-tai/distractors", token, null));
        assertEquals(429, status("POST", "/api/extractions/" + UUID.randomUUID() + "/recheck-conflicts", token, null));
        // trần chạy lại phân tích là bộ đếm riêng
        assertEquals(404, status("POST", "/api/extractions/" + UUID.randomUUID() + "/rerun", token, null));
    }
}
