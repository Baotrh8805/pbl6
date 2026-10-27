package com.pbl6.flashcard.service.graph;

import com.pbl6.flashcard.service.AiServiceClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Đồng bộ toàn bộ lớp người học sang Neo4j mỗi đêm (spec 2026-10-27 §5): {@code app.graph.sync-cron}, mặc định 03:50 giờ VN
 * (sau HousekeepingJob 03:30 để không đẩy tài khoản vừa bị dọn). "-" = tắt (profile test). Neo4j / ai-service tắt → ghi log,
 * không ném lỗi; không chạy chồng lên lần admin bấm "Đồng bộ ngay".
 */
@Service
public class GraphSyncJob {

    private static final Logger log = LoggerFactory.getLogger(GraphSyncJob.class);

    private final GraphSyncService sync;
    private final GraphAiClient ai;

    public GraphSyncJob(GraphSyncService sync, GraphAiClient ai) {
        this.sync = sync;
        this.ai = ai;
    }

    @Scheduled(cron = "${app.graph.sync-cron:0 50 3 * * *}", zone = "${app.learning-path.zone:Asia/Ho_Chi_Minh}")
    public void nightly() {
        run();
    }

    /** Trả true khi đã đồng bộ. */
    public boolean run() {
        if (sync.isFullSyncRunning()) {
            log.info("graph: bỏ qua đồng bộ đêm vì admin đang đồng bộ");
            return false;
        }
        try {
            if (!ai.status().path("available").asBoolean(false)) {
                log.info("graph: Neo4j chưa sẵn sàng, bỏ qua đồng bộ đêm");
                return false;
            }
            sync.recordFull(sync.syncAll());
            return true;
        } catch (AiServiceClient.AiServiceException e) {
            log.warn("graph: đồng bộ đêm lỗi: {}", e.getMessage());
            return false;
        }
    }
}
