package com.pbl6.flashcard.dto.learningpath;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Phiên học hợp nhất của lộ trình (GET /{id}/session). kind: today (đến hạn → nợ → mới hôm nay) | catchup (chỉ thẻ nợ) | due (chỉ
 * thẻ đến hạn) | chapter (mọi thẻ của một chương). dayIndex/state như LearningPathResponse.today. counts: số thẻ theo nhóm đã đưa
 * vào phiên (today: ba nhóm; chapter: new = chưa học, due = đến hạn, phần còn lại là cram), total = cards.size().
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record SessionResponse(String kind, LocalDate date, int dayIndex, String state, Counts counts, List<Card> cards) {

    public record Counts(@JsonProperty("new") int newCount, int due, int catchup, int total) {}

    /**
     * Một thẻ trong hàng đợi, đủ nội dung để học mà không tải từng bộ thẻ. mode quyết định cách chấm ở client: new (chưa có
     * reviews) và due (đến hạn tới hết ngày) chấm SRS bình thường; cram (đã ôn, chưa đến hạn) chỉ ghi log để không thổi phồng tiến độ.
     */
    public record Card(String cardId, String deckId, UUID chapterId, String chapterTitle, String term, String reading,
                       List<Map<String, String>> readingSegments, String meaning, String hanViet, String level,
                       String kind, String mode) {}
}
