package com.pbl6.flashcard.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pbl6.flashcard.service.QuizAiClient.ConjugationQuiz;
import com.pbl6.flashcard.service.QuizAiClient.DistractorInput;
import com.pbl6.flashcard.service.QuizAiClient.Distractors;
import com.pbl6.flashcard.service.QuizAiClient.Verb;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;

/** Dạng JSON gửi / nhận khớp ai-service/app/api/extract_router.py (distractors) và grammar_router.py (conjugation-quiz). */
class QuizAiClientTest {

    private final ObjectMapper json = new ObjectMapper();
    private final AiServiceClient ai = Mockito.mock(AiServiceClient.class);
    private final SettingsService settings = Mockito.mock(SettingsService.class);
    private final QuizAiClient client = new QuizAiClient(ai, settings);

    @SuppressWarnings("unchecked")
    private Map<String, Object> body(ArgumentCaptor<Object> captor, int i) {
        return (Map<String, Object>) captor.getAllValues().get(i);
    }

    @Test
    void distractors_payload_and_response_mapping() throws Exception {
        Mockito.when(settings.getDouble(SettingsService.KEY_DISTRACTOR_MIN, 0.6)).thenReturn(0.75);
        JsonNode res = json.readTree("""
                {"items":[{"ref":"c1","kanjiLookalike":[{"term":"昼","reading":"ひる","meaning":"noon","level":"N5","confidence":0.8,
                "extra":"x"},{"reading":"no-term"}],"homophones":[]},{"ref":null,"kanjiLookalike":[],"homophones":[]}],
                "stats":{"withLookalike":1,"withHomophone":0}}""");
        ArgumentCaptor<Object> captor = ArgumentCaptor.forClass(Object.class);
        Mockito.when(ai.postJsonLong(anyString(), eq("/api/extract/distractors"), captor.capture())).thenReturn(res);

        List<Distractors> out = client.distractors(List.of(
                new DistractorInput("c1", " 書く ", "かく", "viết", "N5"),
                new DistractorInput("c2", "  ", null, null, null),       // term rỗng: ai-service bắt min_length 1 -> bỏ
                new DistractorInput("c3", "学校", " ", null, null)));

        Map<String, Object> body = body(captor, 0);
        assertEquals(List.of("kanji_lookalike", "homophone"), body.get("kinds"));
        assertEquals(0.75, body.get("minConfidence"));
        assertEquals(3, body.get("k"));
        List<?> items = (List<?>) body.get("items");
        assertEquals(2, items.size());
        assertEquals(Map.of("ref", "c1", "term", "書く", "reading", "かく", "meaning", "viết", "level", "N5"), items.get(0));
        assertEquals(Map.of("ref", "c3", "term", "学校"), items.get(1), "trường rỗng không gửi");

        assertEquals(1, out.size(), "dòng không có ref bị bỏ");
        Distractors d = out.get(0);
        assertEquals("c1", d.ref());
        assertEquals(1, d.kanjiLookalike().size(), "ứng viên không có term bị bỏ");
        Map<String, Object> c = d.kanjiLookalike().get(0);
        assertEquals(List.of("term", "reading", "meaning", "level", "confidence"), new ArrayList<>(c.keySet()), "bỏ trường lạ");
        assertEquals(0.8, c.get("confidence"));
        assertEquals(List.of(), d.homophones());
        assertEquals(List.of("kanjiLookalike", "homophones"), new ArrayList<>(d.toColumn().keySet()));
    }

    @Test
    void distractors_split_large_decks_and_clamp_confidence() throws Exception {
        Mockito.when(settings.getDouble(any(), Mockito.anyDouble())).thenReturn(7.0);
        ArgumentCaptor<Object> captor = ArgumentCaptor.forClass(Object.class);
        Mockito.when(ai.postJsonLong(anyString(), anyString(), captor.capture()))
                .thenReturn(json.readTree("{\"items\":[]}"));
        List<DistractorInput> many = new ArrayList<>();
        for (int i = 0; i < QuizAiClient.MAX_DISTRACTOR_ITEMS + 5; i++) many.add(new DistractorInput("c" + i, "語" + i, null, null, null));

        client.distractors(many);

        assertEquals(2, captor.getAllValues().size());
        assertEquals(QuizAiClient.MAX_DISTRACTOR_ITEMS, ((List<?>) body(captor, 0).get("items")).size());
        assertEquals(5, ((List<?>) body(captor, 1).get("items")).size());
        assertEquals(1.0, body(captor, 0).get("minConfidence"), "ai-service chỉ nhận 0..1");

        assertEquals(List.of(), client.distractors(List.of()));
        Mockito.verify(ai, Mockito.times(2)).postJsonLong(anyString(), anyString(), any());
    }

    @Test
    void conjugation_quiz_payload_and_response_mapping() throws Exception {
        JsonNode res = json.readTree("""
                {"items":[{"term":"書く","lemma":"書く","reading":"かく","group":"godan","form":"te","formLabelVi":"thể て",
                "prompt":"Chia động từ 「書く（かく）」 sang thể て.","correct":"書いて","options":["書きて","書いて","書って","書かて"],
                "example":"書いてください。"}],
                "skipped":[{"term":"学校","reason":"not_a_verb"}]}""");
        ArgumentCaptor<Object> captor = ArgumentCaptor.forClass(Object.class);
        Mockito.when(ai.postJson(anyString(), eq("/api/grammar/conjugation-quiz"), captor.capture())).thenReturn(res);

        ConjugationQuiz quiz = client.conjugationQuiz(List.of(new Verb("書く", "かく"), new Verb("学校", null),
                new Verb("あ".repeat(65), null), new Verb("食べる", "た".repeat(65))), List.of("te"), 9, 42L);

        Map<String, Object> body = body(captor, 0);
        assertEquals(List.of(Map.of("term", "書く", "reading", "かく"), Map.of("term", "学校"), Map.of("term", "食べる")),
                body.get("verbs"), "thuật ngữ > 64 ký tự không gửi; cách đọc quá dài bỏ");
        assertEquals(List.of("te"), body.get("forms"));
        assertEquals(5, body.get("perVerb"), "perVerb kẹp về 1..5");
        assertEquals(42L, body.get("seed"));

        assertEquals(1, quiz.items().size());
        QuizAiClient.ConjugationItem it = quiz.items().get(0);
        assertEquals("書いて", it.correct());
        assertEquals(4, it.options().size());
        assertEquals("thể て", it.formLabelVi());
        assertEquals("書いてください。", it.example());
        assertEquals(List.of(new QuizAiClient.Skipped("あ".repeat(65), "too_long"),
                new QuizAiClient.Skipped("学校", "not_a_verb")), quiz.skipped());
    }

    @Test
    void conjugation_quiz_without_forms_omits_field() throws Exception {
        ArgumentCaptor<Object> captor = ArgumentCaptor.forClass(Object.class);
        Mockito.when(ai.postJson(anyString(), anyString(), captor.capture()))
                .thenReturn(json.readTree("{\"items\":[],\"skipped\":[]}"));
        client.conjugationQuiz(List.of(new Verb("書く", null)), null, 1, 0L);
        assertFalse(body(captor, 0).containsKey("forms"), "null = mọi dạng ai-service hỗ trợ");
    }

    @Test
    void ai_errors_propagate_unchanged() {
        Mockito.when(settings.getDouble(any(), Mockito.anyDouble())).thenReturn(0.6);
        Mockito.when(ai.postJsonLong(anyString(), anyString(), any()))
                .thenThrow(new AiServiceClient.AiServiceException("down"));
        assertThrows(AiServiceClient.AiServiceException.class,
                () -> client.distractors(List.of(new DistractorInput("c1", "書く", null, null, null))));
    }
}
