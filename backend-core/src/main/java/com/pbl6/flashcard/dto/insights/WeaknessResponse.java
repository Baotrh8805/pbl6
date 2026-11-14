package com.pbl6.flashcard.dto.insights;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * GET /api/insights/weaknesses (spec §3.7, §4.2): thẻ yếu của người dùng kèm lý do, gom theo cấp / loại / chữ Hán / bộ thẻ.
 * cards tối đa 500 (total = số thẻ trả về), thứ tự: nhiều lý do trước, rồi số lần "again" giảm dần, rồi term. canRemedial khi đủ
 * 8 thẻ để tạo lộ trình bổ khuyết; suggestedDays = gợi ý số ngày cho lộ trình đó (§3.6 trên 150 thẻ yếu nhất mà nó sẽ lấy, kẹp
 * 3..30).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record WeaknessResponse(int total, List<WeakCard> cards, Groups groups, boolean canRemedial, int suggestedDays) {

    /**
     * Một thẻ yếu. reasons ⊆ {lapses, low_ease, slow, quiz_wrong} theo thứ tự đó; againCount = số "again" trong 14 ngày;
     * ease / intervalDays từ bản ghi SRS (null khi thẻ chưa có — chỉ sai quiz); medianReactionMs chỉ có khi đủ 5 mẫu đo;
     * quizWrong = số câu sai trong cửa sổ.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record WeakCard(String cardId, String deckId, String deckTitle, String term, String reading, String meaning,
                           String level, String kind, List<String> reasons, int againCount, Double ease,
                           Integer intervalDays, Integer medianReactionMs, int quizWrong,
                           /* HLR (V38): p nhớ dự đoán bây giờ; lý do low_recall khi &lt; 0,7 */ Double recall) {
        public WeakCard(String cardId, String deckId, String deckTitle, String term, String reading, String meaning, String level,
                        String kind, List<String> reasons, int againCount, Double ease, Integer intervalDays,
                        Integer medianReactionMs, int quizWrong) {
            this(cardId, deckId, deckTitle, term, reading, meaning, level, kind, reasons, againCount, ease, intervalDays,
                    medianReactionMs, quizWrong, null);
        }
    }

    /** Nhóm theo khoá (level: "N5".."N1" | "Khác"; kind: vocab | grammar; kanji: một chữ Hán | "Khác"; deck: deckId + title). */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Group(String key, String title, int count) {}

    public record Groups(List<Group> level, List<Group> kind, List<Group> kanji, List<Group> deck) {}
}
