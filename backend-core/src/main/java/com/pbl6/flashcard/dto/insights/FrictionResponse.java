package com.pbl6.flashcard.dto.insights;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * GET /api/insights/friction (F4, spec §3.7 "ma sát trí nhớ"): thẻ phản xạ chậm trong 30 ngày — trung vị reaction_ms của thẻ
 * (≥ 5 mẫu) vượt CẢ 2 × trung vị cá nhân LẪN 4 000 ms (chưa có trung vị cá nhân thì chỉ còn sàn 4 000 ms), cùng quy tắc với lý
 * do "slow" của /weaknesses; tối đa 50 thẻ, chậm nhất trước. personalMedianMs null khi chưa đo.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record FrictionResponse(Integer personalMedianMs, List<FrictionCard> cards) {

    /** ratio = trung vị thẻ / trung vị cá nhân (1 chữ số thập phân); null khi chưa có trung vị cá nhân. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record FrictionCard(String cardId, String term, String reading, String meaning, String deckId,
                               int medianReactionMs, int samples, Double ratio) {}
}
