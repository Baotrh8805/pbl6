package com.pbl6.flashcard.dto.admin;

import com.pbl6.flashcard.model.ContentReport;

import java.time.Instant;

public record ReportResponse(Long id, String deckId, String deckTitle, String deckVisibility, Long reporterId,
                             String reporterEmail, String reason, String detail, String status, String action,
                             String resolutionNote, String resolvedByEmail, Instant resolvedAt, Instant createdAt,
                             long sameDeckOpen) {

    public static ReportResponse of(ContentReport r, String deckTitle, String deckVisibility, String reporterEmail,
                                    String resolvedByEmail, long sameDeckOpen) {
        return new ReportResponse(r.getId(), r.getDeckId(), deckTitle, deckVisibility, r.getReporterId(), reporterEmail,
                r.getReason(), r.getDetail(), r.getStatus(), r.getAction(), r.getResolutionNote(), resolvedByEmail,
                r.getResolvedAt(), r.getCreatedAt(), sameDeckOpen);
    }
}
