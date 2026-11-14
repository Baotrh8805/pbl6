package com.pbl6.flashcard.service.moderation;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Quét lại bình luận PENDING (ai-service lỗi lúc gửi, hoặc dòng cũ trước V38) mỗi 5 phút, 50 dòng một lượt
 * (`app.moderation.rescan-cron`, "-" = tắt ở profile test). Admin cũng có nút quét ngay (POST /api/admin/moderation/rescan).
 */
@Component
public class ModerationRescanJob {

    private static final Logger log = LoggerFactory.getLogger(ModerationRescanJob.class);
    public static final int BATCH = 50;

    private final ModerationService moderation;

    public ModerationRescanJob(ModerationService moderation) {
        this.moderation = moderation;
    }

    @Scheduled(cron = "${app.moderation.rescan-cron:0 */5 * * * *}", zone = "Asia/Ho_Chi_Minh")
    public void run() {
        try {
            var r = moderation.rescan(BATCH);
            if (r.scanned() > 0) log.info("Kiểm duyệt: chấm lại {} bình luận, còn {} chưa kiểm", r.scanned(), r.pending());
        } catch (RuntimeException e) {
            log.warn("Job quét lại kiểm duyệt lỗi: {}", e.getMessage());
        }
    }
}
