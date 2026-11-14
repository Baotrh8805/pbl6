package com.pbl6.flashcard.dto.insights;

import java.time.Instant;
import java.util.List;

/**
 * GET /api/insights/path-effect/{pathId} (kế hoạch 2026-10-26 B3): hiệu quả một lộ trình theo chương, đọc từ review_logs có
 * path_id = lộ trình (lượt "học nhanh" không tính vì không đổi lịch ôn). Tỷ lệ là 0..1, null khi chưa có mẫu.
 * remedialSplit: lộ trình thường mà người học đã tạo lộ trình bổ khuyết SAU khi bắt đầu nó → chia lượt ôn của lộ trình này tại
 * thời điểm tạo lộ trình bổ khuyết đầu tiên (thẻ bổ khuyết là bản sao, không lưu nguồn, nên so theo mốc thời gian); null với lộ
 * trình bổ khuyết hoặc khi chưa có.
 */
public record PathEffectResponse(String pathId, String title, boolean remedial, Stats total, List<Chapter> chapters,
                                 RemedialSplit remedialSplit) {

    /**
     * cards: số thẻ trong lộ trình / chương; studiedCards: số thẻ đã chấm ít nhất một lần trong lộ trình. retention7d = retained /
     * retentionEligible: thẻ "đủ điều kiện" là thẻ có lượt ôn (mọi nguồn trừ học nhanh) cách lượt đầu trong lộ trình ≥ 7 ngày,
     * "nhớ" khi lượt ôn đầu tiên sau mốc đó không phải "again".
     */
    public record Stats(int cards, int studiedCards, long reviews, long again, Double againRate, Integer medianReactionMs,
                        int retentionEligible, int retained, Double retention7d) {}

    public record Chapter(String chapterId, int position, String title, Stats stats) {}

    public record Window(long reviews, long again, Double againRate, Integer medianReactionMs) {}

    public record RemedialSplit(String remedialPathId, String remedialTitle, Instant at, Window before, Window after) {}
}
