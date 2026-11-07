package com.pbl6.flashcard.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pbl6.flashcard.dto.practice.PracticeDtos.ContourPoint;
import com.pbl6.flashcard.dto.practice.PracticeDtos.StrokePoint;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;

/**
 * Client luyện tập (§2): gọi đúng route / tham số của kanji_dtw_router + audio_praat_router qua getJson / postJson dùng chung, và đổi
 * lỗi ai-service thành mã HTTP của ta (404 giữ 404, tham số → 400, còn lại → 503; không bao giờ để lọt 401/403).
 */
class PracticeAiClientTest {

    private final AiServiceClient ai = Mockito.mock(AiServiceClient.class);
    private final PracticeAiClient client = new PracticeAiClient(ai);
    private final ObjectMapper json = new ObjectMapper();

    @Test
    @SuppressWarnings("unchecked")
    void calls_the_ai_service_routes_with_the_expected_payloads() throws Exception {
        JsonNode ok = json.readTree("{\"ok\":true}");
        Mockito.when(ai.getJson(anyString(), anyString(), any(), any())).thenReturn(ok);
        Mockito.when(ai.postJson(anyString(), anyString(), any())).thenReturn(ok);

        assertSame(ok, client.strokes("水"));
        Mockito.verify(ai).getJson(anyString(), eq("/api/kanji/{ch}/strokes"), eq(Map.of("ch", "水")), isNull());

        assertSame(ok, client.score("水", List.of(List.of(new StrokePoint(0.1, 0.2, 5.0)))));
        ArgumentCaptor<Object> body = ArgumentCaptor.forClass(Object.class);
        Mockito.verify(ai).postJson(anyString(), eq("/api/kanji/score"), body.capture());
        Map<String, Object> score = (Map<String, Object>) body.getValue();
        assertEquals("水", score.get("kanji"));
        assertEquals(List.of(List.of(new StrokePoint(0.1, 0.2, 5.0))), score.get("strokes"));
        // Đúng tên trường ai-service đọc (PointIn: x, y, t)
        assertEquals("{\"kanji\":\"水\",\"strokes\":[[{\"x\":0.1,\"y\":0.2,\"t\":5.0}]]}", json.writeValueAsString(score));

        ArgumentCaptor<Map<String, ?>> query = ArgumentCaptor.forClass(Map.class);
        client.pitchReference("箸", "はし");
        Mockito.verify(ai).getJson(anyString(), eq("/api/audio/pitch-reference"), isNull(), query.capture());
        assertEquals("箸", query.getValue().get("word"));
        assertEquals("はし", query.getValue().get("reading"));

        Mockito.reset(ai);
        Mockito.when(ai.postJson(anyString(), anyString(), any())).thenReturn(ok);
        client.pitchScore("はし", null, 1, List.of(new ContourPoint(0.0, 220.0), new ContourPoint(0.02, null)));
        ArgumentCaptor<Object> pitch = ArgumentCaptor.forClass(Object.class);
        Mockito.verify(ai).postJson(anyString(), eq("/api/audio/pitch-score"), pitch.capture());
        // reading null không gửi (ai-service lấy chính word khi toàn kana); f0 null = khung không có thanh
        assertEquals("{\"word\":\"はし\",\"accentType\":1,\"contour\":[{\"t\":0.0,\"f0\":220.0},{\"t\":0.02,\"f0\":null}]}",
                json.writeValueAsString(pitch.getValue()));
    }

    private int statusOf(int aiStatus) {
        Mockito.reset(ai);
        Mockito.when(ai.getJson(anyString(), anyString(), any(), any()))
                .thenThrow(new AiServiceClient.AiServiceException("chi tiết từ ai-service", aiStatus, null));
        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> client.strokes("水"));
        return e.getStatusCode().value();
    }

    @Test
    void ai_service_errors_map_to_our_status_codes() {
        assertEquals(404, statusOf(404), "chưa có nét mẫu / dữ liệu trọng âm");
        assertEquals(400, statusOf(400));
        assertEquals(400, statusOf(413));
        assertEquals(400, statusOf(422));
        assertEquals(503, statusOf(401), "sai X-Internal-Key không được thành 401 (frontend coi là hết phiên)");
        assertEquals(503, statusOf(403));
        assertEquals(503, statusOf(500));
        assertEquals(503, statusOf(0), "không kết nối được");

        Mockito.reset(ai);
        Mockito.when(ai.getJson(anyString(), anyString(), any(), any()))
                .thenThrow(new AiServiceClient.AiServiceException("Chưa có nét mẫu cho chữ 鬱", 404, null));
        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> client.strokes("鬱"));
        assertEquals("Chưa có nét mẫu cho chữ 鬱", e.getReason(), "giữ câu tiếng Việt của ai-service");
    }
}
