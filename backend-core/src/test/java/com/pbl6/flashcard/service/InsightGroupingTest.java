package com.pbl6.flashcard.service;

import com.pbl6.flashcard.dto.insights.WeaknessResponse.Group;
import com.pbl6.flashcard.dto.insights.WeaknessResponse.Groups;
import com.pbl6.flashcard.dto.insights.WeaknessResponse.WeakCard;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Hàm thuần của điểm yếu / bổ khuyết: chữ Hán đầu của term, khoá nhóm, nhóm của GET /api/insights/weaknesses và chương của lộ
 * trình bổ khuyết (gộp quá 12 nhóm vào "Khác", "Khác" luôn cuối).
 */
class InsightGroupingTest {

    private static WeakCard weak(String id, String term, String level, String kind, String deckId) {
        return new WeakCard(id, deckId, "Bộ " + deckId, term, null, "nghĩa", level, kind, List.of("lapses"), 3, 2.0, 1,
                null, 0);
    }

    private static WeakCard weak(String id, String term) {
        return weak(id, term, "N5", "vocab", "d1");
    }

    @Test
    void first_kanji_skips_kana_and_handles_supplementary_characters() {
        assertEquals("茶", InsightService.firstKanji("お茶"));
        assertEquals("水", InsightService.firstKanji("水曜日"));
        assertNull(InsightService.firstKanji("ひらがな"));
        assertNull(InsightService.firstKanji("〜ます"));
        assertNull(InsightService.firstKanji(null));
        assertEquals("𠮷", InsightService.firstKanji("𠮷野家"), "chữ Hán ngoài BMP (cặp surrogate) giữ nguyên");
    }

    @Test
    void group_keys_and_weakness_groups_cover_every_card_once() {
        List<WeakCard> cards = List.of(
                weak("a", "水曜日", "N5", "vocab", "d1"),
                weak("b", "水道", "N4", "vocab", "d2"),
                weak("c", "ひらがな", null, "grammar", "d1"),
                weak("d", "火", "N5", null, "d1"));
        assertEquals("Khác", InsightService.groupKey(cards.get(2), "level"));
        assertEquals("vocab", InsightService.groupKey(cards.get(3), "kind"), "thiếu kind = từ vựng");
        assertEquals("grammar", InsightService.groupKey(cards.get(2), "kind"));
        assertEquals("Khác", InsightService.groupKey(cards.get(2), "kanji"));
        assertEquals("d2", InsightService.groupKey(cards.get(1), "deck"));
        assertThrows(IllegalArgumentException.class, () -> InsightService.groupKey(cards.get(0), "tag"));

        Groups g = InsightService.groups(cards);
        assertEquals(List.of("N5:2", "N4:1", "Khác:1"), keys(g.level()));
        assertEquals(List.of("vocab:3", "grammar:1"), keys(g.kind()));
        assertEquals(List.of("水:2", "火:1", "Khác:1"), keys(g.kanji()));
        assertEquals(List.of("d1:3", "d2:1"), keys(g.deck()));
        assertEquals("Bộ d1", g.deck().get(0).title());
        assertNull(g.level().get(0).title(), "chỉ nhóm theo bộ mới có title");
    }

    private static List<String> keys(List<Group> groups) {
        List<String> out = new ArrayList<>();
        for (Group g : groups) out.add(g.key() + ":" + g.count());
        return out;
    }

    @Test
    void remedial_chapters_keep_other_last_even_when_it_is_larger() {
        List<WeakCard> cards = List.of(
                weak("k1", "ひらがな"), weak("k2", "カタカナ"), weak("k3", "ローマ字じゃない"),
                weak("w1", "水曜日"), weak("w2", "水道"), weak("f1", "火山"));
        // ローマ字じゃない có chữ Hán 字 -> nhóm riêng
        Map<String, List<WeakCard>> out = LearningPathService.remedialGroups(cards, "kanji");
        assertEquals(List.of("水", "字", "火", "Khác"), new ArrayList<>(out.keySet()));
        assertEquals(List.of("w1", "w2"), ids(out.get("水")));
        assertEquals(List.of("k1", "k2"), ids(out.get("Khác")), "thứ tự thẻ = thứ tự điểm yếu");
    }

    @Test
    void remedial_merges_groups_beyond_twelve_into_other_in_weakness_order() {
        String kanji = "一二三四五六七八九十百千万円";
        List<WeakCard> cards = new ArrayList<>();
        cards.add(weak("kana", "かな"));
        for (int i = 0; i < kanji.length(); i++) cards.add(weak("c" + i, kanji.charAt(i) + "つ"));
        cards.add(weak("c0b", "一番")); // nhóm 一 có 2 thẻ -> đứng đầu
        Map<String, List<WeakCard>> out = LearningPathService.remedialGroups(cards, "kanji");
        // 一 (2 thẻ) đứng đầu; 13 nhóm 1 thẻ tranh 10 chỗ còn lại theo thứ tự khoá (mã UTF-16: 七 U+4E03 < 万 < 三 < 九 < 二 <
        // 五 < 八 < 六 < 円 < 十 < 千 < 四 < 百) -> 千, 四, 百 tràn vào "Khác" cùng thẻ kana; "Khác" giữ thứ tự điểm yếu gốc
        assertEquals(List.of("一", "七", "万", "三", "九", "二", "五", "八", "六", "円", "十", "Khác"),
                new ArrayList<>(out.keySet()));
        assertEquals(List.of("c0", "c0b"), ids(out.get("一")));
        assertEquals(List.of("kana", "c3", "c10", "c11"), ids(out.get("Khác")));
        int total = 0;
        for (List<WeakCard> g : out.values()) total += g.size();
        assertEquals(cards.size(), total, "không mất thẻ khi gộp");
    }

    private static List<String> ids(List<WeakCard> cards) {
        return cards.stream().map(WeakCard::cardId).toList();
    }
}
