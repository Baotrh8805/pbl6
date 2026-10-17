package com.pbl6.flashcard.dto.admin;

import com.pbl6.flashcard.dto.extraction.ExtractionJobResponse;
import com.pbl6.flashcard.model.ExtractionJob;

/** Job bóc tách nhìn từ admin: như của người dùng (không văn bản) + chủ job. */
public record AdminExtractionResponse(ExtractionJobResponse job, Long userId, String userEmail, String purpose) {
    public static AdminExtractionResponse of(ExtractionJob j, String userEmail) {
        return new AdminExtractionResponse(ExtractionJobResponse.of(j, false), j.getUserId(), userEmail, j.getPurpose());
    }
}
