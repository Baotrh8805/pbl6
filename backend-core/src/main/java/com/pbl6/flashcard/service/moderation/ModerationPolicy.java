package com.pbl6.flashcard.service.moderation;

import com.pbl6.flashcard.dto.moderation.ModerationDtos.Signal;
import com.pbl6.flashcard.dto.moderation.ModerationDtos.Span;
import com.pbl6.flashcard.dto.moderation.ModerationDtos.Verdict;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Quy tắc quyết định (spec 2026-10-27 đêm §4), hàm thuần có unit test. Hai model cùng đồng ý mới chặn: trên tập test ViHSD
 * cứ 4 câu bị đoán "thù ghét" thì 1 câu sạch, còn PhoBERT bắt từ tục tốt hơn model câu — nên nhãn 2 chỉ chặn khi p2 ≥ 0,8 VÀ có
 * ít nhất một từ bị đánh dấu; mục từ nhạy cảm (từ tục là chủ đề) chỉ gắn cờ.
 */
public final class ModerationPolicy {

    /** Nhãn 2 cần p ≥ ngưỡng này (kèm từ đánh dấu) mới chặn. */
    public static final double BLOCK_MIN_P2 = 0.8;
    /** Từ đánh dấu tính khi t_score ≥ ngưỡng này (ai-service đã lọc ở 0,5; giữ để phòng cấu hình khác). */
    public static final double SPAN_MIN = 0.5;
    /** Nhãn 0 nhưng có từ đánh dấu rất chắc → vẫn gắn cờ. */
    public static final double SPAN_STRONG = 0.9;
    /** Khoá bình luận mềm sau N lần bị chặn trong LOCK_WINDOW. */
    public static final int LOCK_AFTER = 3;
    public static final Duration LOCK_WINDOW = Duration.ofHours(24);
    public static final Duration LOCK_FOR = Duration.ofHours(24);
    /** Bình luận BLOCKED không ai xử lý quá hạn này thì HousekeepingJob xoá. */
    public static final Duration BLOCKED_TTL = Duration.ofDays(30);
    /** "Sắp quên" (HLR) khi p dự đoán dưới mức này. */
    public static final double FORGETTING_SOON = 0.7;

    private static final char MASK = '∗'; // ∗

    private ModerationPolicy() {}

    public static Verdict decide(Signal s, boolean sensitive) {
        if (s == null) return Verdict.CLEAN;
        List<Span> spans = s.spans() == null ? List.of() : s.spans().stream().filter(x -> x.score() >= SPAN_MIN).toList();
        boolean anySpan = !spans.isEmpty();
        boolean strongSpan = spans.stream().anyMatch(x -> x.score() >= SPAN_STRONG);
        if (s.label() == 2 && s.p2() >= BLOCK_MIN_P2 && anySpan) return sensitive ? Verdict.FLAGGED : Verdict.BLOCKED;
        if (s.label() >= 1) return Verdict.FLAGGED;
        if (strongSpan) return Verdict.FLAGGED;
        return Verdict.CLEAN;
    }

    /**
     * Che các từ bị đánh dấu: giữ ký tự đầu, phần còn lại thành ∗ (theo vị trí ký tự; từ không có vị trí thì thay theo từ, không
     * phân biệt hoa thường). Không có từ nào → trả nguyên văn.
     */
    public static String mask(String content, List<Span> spans) {
        if (content == null || content.isEmpty() || spans == null || spans.isEmpty()) return content;
        StringBuilder sb = new StringBuilder(content);
        List<Span> positioned = new ArrayList<>();
        List<Span> loose = new ArrayList<>();
        for (Span sp : spans) {
            if (sp.start() >= 0 && sp.end() > sp.start() && sp.end() <= content.length()) positioned.add(sp);
            else if (sp.word() != null && !sp.word().isBlank()) loose.add(sp);
        }
        // Span không chồng lấn: span bắt đầu sớm hơn (dài hơn khi cùng đầu) thắng; thay từ phải sang trái để vị trí không lệch
        positioned.sort(Comparator.comparingInt(Span::start).thenComparing(Comparator.comparingInt(Span::end).reversed()));
        List<Span> kept = new ArrayList<>();
        int covered = -1;
        for (Span sp : positioned) {
            if (sp.start() < covered) continue;
            kept.add(sp);
            covered = sp.end();
        }
        for (int i = kept.size() - 1; i >= 0; i--) {
            Span sp = kept.get(i);
            sb.replace(sp.start(), sp.end(), maskWord(sb.substring(sp.start(), sp.end())));
        }
        String out = sb.toString();
        for (Span sp : loose) {
            String w = sp.word().replace('_', ' ').trim();
            if (w.isEmpty()) continue;
            Matcher m = Pattern.compile("(?iu)(?<![\\p{L}\\p{N}])" + Pattern.quote(w) + "(?![\\p{L}\\p{N}])").matcher(out);
            StringBuilder r = new StringBuilder();
            while (m.find()) m.appendReplacement(r, Matcher.quoteReplacement(maskWord(m.group())));
            m.appendTail(r);
            out = r.toString();
        }
        return out;
    }

    static String maskWord(String w) {
        if (w.isEmpty()) return w;
        int first = w.offsetByCodePoints(0, 1);
        int rest = w.codePointCount(first, w.length());
        return w.substring(0, first) + String.valueOf(MASK).repeat(Math.max(1, rest));
    }

    /** Câu giải thích cho chủ bình luận theo trạng thái. */
    public static String message(String status, List<String> words) {
        String list = words == null || words.isEmpty() ? "" : " (từ bị đánh dấu: " + String.join(", ", words) + ")";
        return switch (status == null ? "" : status.toUpperCase(Locale.ROOT)) {
            case "BLOCKED" -> "AI nhận định nội dung thù ghét" + list + ". Bình luận chưa được đăng: bạn có thể sửa rồi gửi lại, "
                    + "hoặc chờ quản trị viên xem lại.";
            case "FLAGGED" -> "AI gắn cờ bình luận này để quản trị viên xem lại" + list + "."
                    + (words == null || words.isEmpty() ? "" : " Người khác thấy bản che các từ đó cho tới khi được duyệt.");
            case "PENDING" -> "Bình luận chưa được kiểm duyệt tự động (dịch vụ AI tạm lỗi); hệ thống sẽ kiểm lại sau.";
            default -> null;
        };
    }
}
