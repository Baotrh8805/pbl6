package com.pbl6.flashcard.dto.library;

import com.pbl6.flashcard.model.ContentReport;

import java.time.Instant;

/**
 * Báo cáo nhìn từ phía người gửi: không lộ email admin xử lý. deckPublic = false khi bộ thẻ đã bị gỡ khỏi Thư viện
 * (client không dẫn link tới bộ thẻ người học không còn mở được).
 */
public record MyReportResponse(Long id, String deckId, String deckTitle, boolean deckPublic, String reason, String detail,
                               String status, String action, String resolutionNote, Instant resolvedAt, Instant createdAt) {

    public static MyReportResponse of(ContentReport r, String deckTitle, boolean deckPublic) {
        return new MyReportResponse(r.getId(), r.getDeckId(), deckTitle, deckPublic, r.getReason(), r.getDetail(),
                r.getStatus(), r.getAction(), r.getResolutionNote(), r.getResolvedAt(), r.getCreatedAt());
    }
}
