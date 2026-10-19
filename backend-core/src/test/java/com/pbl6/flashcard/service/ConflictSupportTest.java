package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.extraction.AiDtos;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** Hàm thuần của cảnh báo mâu thuẫn (ConflictSupport) và cách dựng entries nguồn chuẩn (KnowledgeSourceService.entriesOf). */
class ConflictSupportTest {

    @Test
    void normalize_renames_note_vi_and_drops_junk() {
        Map<String, Object> python = new HashMap<>();
        python.put("field", "reading");
        python.put("document", "がくこう");
        python.put("reference", "がっこう");
        python.put("source", "jlpt_list");
        python.put("confidence", 0.9);
        python.put("note_vi", "  Tài liệu đọc sai.  ");
        Map<String, Object> camel = Map.of("field", "meaning", "confidence", 1, "noteVi", "đã là noteVi");
        List<Object> raw = new ArrayList<>(List.of(python, camel, "rác", Map.of("document", "thiếu field")));
        raw.add(null);

        List<Map<String, Object>> out = ConflictSupport.normalize(raw);
        assertEquals(2, out.size());
        assertEquals(List.of("field", "document", "reference", "source", "confidence", "noteVi"),
                new ArrayList<>(out.get(0).keySet()));
        assertEquals("Tài liệu đọc sai.", out.get(0).get("noteVi"));
        assertEquals(0.9, out.get(0).get("confidence"));
        assertEquals(1.0, out.get(1).get("confidence"), "số nguyên -> double");
        assertEquals("đã là noteVi", out.get(1).get("noteVi"));
        assertNull(out.get(1).get("document"));

        assertEquals(List.of(), ConflictSupport.normalize(null), "ai-service cũ không trả conflicts");
        assertEquals(List.of(), ConflictSupport.normalize("không phải danh sách"));
        List<Map<String, Object>> many = new ArrayList<>();
        for (int i = 0; i < 25; i++) many.add(Map.of("field", "reading"));
        assertEquals(ConflictSupport.MAX_PER_ITEM, ConflictSupport.normalize(many).size());
    }

    @Test
    void summarize_always_has_five_fields() {
        Map<String, Object> s = ConflictSupport.summarize(List.of(
                List.of(Map.of("field", "reading"), Map.of("field", "meaning")),
                List.of(),
                List.of(Map.of("field", "reading"))));
        assertEquals(3, s.get("conflicts"));
        @SuppressWarnings("unchecked")
        Map<String, Integer> byField = (Map<String, Integer>) s.get("conflictsByField");
        assertEquals(List.of("reading", "furigana", "meaning", "level", "grammar"), new ArrayList<>(byField.keySet()));
        assertEquals(2, byField.get("reading"));
        assertEquals(1, byField.get("meaning"));
        assertEquals(0, byField.get("grammar"));
        assertEquals(0, ConflictSupport.summarize(List.of()).get("conflicts"));
    }

    @Test
    void min_confidence_clamps_and_falls_back() {
        SettingsService settings = Mockito.mock(SettingsService.class);
        Mockito.when(settings.getDouble(SettingsService.KEY_CONTRADICTION_ALERT, ConflictSupport.DEFAULT_MIN_CONFIDENCE))
                .thenReturn(0.55, 1.7, -0.2);
        assertEquals(0.55, ConflictSupport.minConfidence(settings), 1e-9);
        assertEquals(1.0, ConflictSupport.minConfidence(settings), 1e-9);
        assertEquals(0.0, ConflictSupport.minConfidence(settings), 1e-9);
    }

    @Test
    void merge_replaces_only_evaluated_fields_in_field_order() {
        Map<String, Object> oldReading = Map.of("field", "reading", "noteVi", "cũ");
        Map<String, Object> oldLevel = Map.of("field", "level");
        Map<String, Object> oldGrammar = Map.of("field", "grammar");
        Map<String, Object> oldOdd = Map.of("field", "lạ");
        Map<String, Object> newMeaning = Map.of("field", "meaning");
        Map<String, Object> newLevel = Map.of("field", "level", "noteVi", "không được đánh giá");
        List<Map<String, Object>> stored = List.of(oldOdd, oldLevel, oldReading, oldGrammar);

        assertEquals(List.of(newMeaning, oldLevel, oldGrammar, oldOdd),
                ConflictSupport.merge(stored, List.of(newLevel, newMeaning), List.of("reading", "furigana", "meaning")),
                "reading cũ bị thay (kết quả mới không còn), level / grammar / trường lạ giữ, level mới bị bỏ");
        assertEquals(List.of(oldReading, oldLevel, oldGrammar, oldOdd), ConflictSupport.merge(stored, null, List.of()),
                "không đánh giá trường nào: giữ nguyên (theo thứ tự trường)");
        assertEquals(List.of(newMeaning), ConflictSupport.merge(null, List.of(newMeaning), List.of("meaning")));
    }

    private static AiDtos.Item item(String term, String reading, String docReading, String en, String docEn, String vi,
                                    Boolean suspect) {
        return new AiDtos.Item("vocab", 1, term, term, reading, null, null, "句", en, vi, "N1", 0.4, List.of(), 1, null, null,
                suspect, null, null, docReading, docEn);
    }

    @Test
    void knowledge_entries_dedupe_skip_suspect_and_keep_only_declared_values() {
        List<Map<String, Object>> entries = KnowledgeSourceService.entriesOf(List.of(
                item(" 学校 ", "がっこう", "がっこう", "school", "school", null, false),
                item("学校", "がくこう", null, "school", null, "trường", false),
                item("先生", "せんせ", "せんせい", "teacher", null, "giáo viên", null),
                item("明日", "あした", null, "tomorrow", null, null, false),
                item("ノイズ", "のいず", null, "noise", null, null, true),
                item("  ", "x", null, null, null, null, false)), "N5");
        assertEquals(3, entries.size());
        assertEquals(Map.of("term", "学校", "reading", "がっこう", "meaning", "school", "level", "N5"), entries.get(0));
        assertEquals(Map.of("term", "先生", "reading", "せんせい", "meaning", "giáo viên", "level", "N5"), entries.get(1));
        assertEquals(Map.of("term", "明日", "level", "N5"), entries.get(2),
                "cách đọc Sudachi / gloss từ điển không phải của tài liệu -> không lưu");
        assertFalse(KnowledgeSourceService.entriesOf(List.of(item("本", null, null, null, null, null, false)), null).get(0)
                .containsKey("level"), "nguồn không khai cấp: không lấy cấp ai-service đoán");
        assertEquals(List.of(), KnowledgeSourceService.entriesOf(null, "N5"));
    }

    @Test
    void reference_key_drops_tildes_and_spaces() {
        assertEquals("なければならない", KnowledgeSourceService.refKey("〜 なければ ならない"));
        assertEquals("ために", KnowledgeSourceService.refKey("～ために　"));
        assertEquals("", KnowledgeSourceService.refKey(null));
    }
}
