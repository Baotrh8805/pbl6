package com.pbl6.flashcard.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;

/** ContentAiClient gửi đúng đường dẫn + body JSON mà các router của ai-service (radical / extract / mining) đọc. */
class ContentAiClientTest {

    private final AiServiceClient ai = Mockito.mock(AiServiceClient.class);
    private final ContentAiClient client = new ContentAiClient(ai);
    private final JsonNode ok = JsonNodeFactory.instance.objectNode().put("ok", true);

    @SuppressWarnings("unchecked")
    private Map<String, Object> bodyOf(String path) {
        ArgumentCaptor<Object> body = ArgumentCaptor.forClass(Object.class);
        Mockito.verify(ai).postJsonLong(anyString(), eq(path), body.capture());
        return (Map<String, Object>) body.getValue();
    }

    @Test
    void radical_cards_always_ask_for_mnemonics() {
        Mockito.when(ai.postJsonLong(anyString(), eq("/api/radicals/cards"), Mockito.any())).thenReturn(ok);
        assertSame(ok, client.radicalCardsWithMnemonic(List.of("海", "河")));
        assertEquals(Map.of("kanji", List.of("海", "河"), "withMnemonic", true), bodyOf("/api/radicals/cards"));
    }

    @Test
    void conflicts_send_items_references_and_threshold() {
        Mockito.when(ai.postJsonLong(anyString(), eq("/api/extract/conflicts"), Mockito.any())).thenReturn(ok);
        List<Map<String, Object>> items = List.of(Map.of("ref", "1", "term", "水"));
        client.conflicts(items, null, 0.7);
        Map<String, Object> body = bodyOf("/api/extract/conflicts");
        assertEquals(items, body.get("items"));
        assertEquals(List.of(), body.get("references"), "null -> mảng rỗng (ai-service mặc định cũng rỗng)");
        assertEquals(0.7, body.get("minConfidence"));
    }

    @Test
    void i_plus_one_omits_blank_level() {
        Mockito.when(ai.postJsonLong(anyString(), eq("/api/mining/i-plus-one"), Mockito.any())).thenReturn(ok);
        client.iPlusOne("水を飲む。", List.of("水"), " ", false, 50);
        Map<String, Object> body = bodyOf("/api/mining/i-plus-one");
        assertEquals("水を飲む。", body.get("text"));
        assertEquals(List.of("水"), body.get("knownLemmas"));
        assertFalse(body.containsKey("userLevel"));
        assertEquals(false, body.get("assumeLevelKnown"));
        assertEquals(50, body.get("limit"));
    }
}
