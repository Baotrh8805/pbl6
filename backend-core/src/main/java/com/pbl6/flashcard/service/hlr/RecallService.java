package com.pbl6.flashcard.service.hlr;

import com.pbl6.flashcard.model.Review;
import com.pbl6.flashcard.repository.ReviewRepository;
import com.pbl6.flashcard.service.moderation.ModerationPolicy;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * "p nhớ bây giờ" của nhiều thẻ (spec 2026-10-27 đêm §8.4): một lời gọi HLR theo lô với Δ = now − last_reviewed_at của từng thẻ;
 * thẻ chưa học (seen = 0) không có p. ai-service lỗi → map rỗng (caller giữ thứ tự / giao diện cũ).
 */
@Service
public class RecallService {

    public static final int RECENT_LIMIT = 300;

    private final ReviewRepository reviews;
    private final HlrClient hlr;

    public RecallService(ReviewRepository reviews, HlrClient hlr) {
        this.reviews = reviews;
        this.hlr = hlr;
    }

    public boolean enabled() { return hlr.enabled(); }

    public static double deltaDays(Instant last, Instant now) {
        return last == null ? 0 : Math.max(0, Duration.between(last, now).toMillis() / 86_400_000.0);
    }

    /** p nhớ của các thẻ đã học trong cardIds (thẻ chưa học / HLR lỗi → thiếu khoá). */
    public Map<String, HlrClient.Prediction> predictNow(Long uid, Collection<String> cardIds, Instant now) {
        if (!hlr.enabled() || cardIds.isEmpty()) return Map.of();
        return predictNow(reviews.findByUserIdAndCardIdIn(uid, cardIds), now);
    }

    public Map<String, HlrClient.Prediction> predictNow(List<Review> rows, Instant now) {
        List<HlrClient.Item> items = new ArrayList<>();
        for (Review r : rows) {
            if (r.getSeen() <= 0) continue;
            items.add(new HlrClient.Item(r.getCardId(), r.getSeen(), r.getCorrect(), deltaDays(r.getLastReviewedAt(), now)));
        }
        if (items.isEmpty()) return Map.of();
        Optional<Map<String, HlrClient.Prediction>> res = hlr.tryPredict(items);
        return res.orElse(Map.of());
    }

    public Map<String, Double> recallNow(Long uid, Collection<String> cardIds) {
        Map<String, Double> out = new LinkedHashMap<>();
        predictNow(uid, cardIds, Instant.now()).forEach((k, v) -> out.put(k, v.recall()));
        return out;
    }

    /** Thẻ "sắp quên" (p &lt; {@link ModerationPolicy#FORGETTING_SOON}) trong ≤ 300 thẻ học gần nhất; HLR lỗi → rỗng. */
    public Map<String, Double> lowRecall(Long uid) {
        if (!hlr.enabled()) return Map.of();
        Map<String, Double> out = new LinkedHashMap<>();
        predictNow(reviews.findTop300ByUserIdAndSeenGreaterThanOrderByLastReviewedAtDesc(uid, 0), Instant.now())
                .forEach((k, v) -> { if (v.recall() < ModerationPolicy.FORGETTING_SOON) out.put(k, v.recall()); });
        return out;
    }
}
