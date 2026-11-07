package com.pbl6.flashcard.dto.admin;

import com.pbl6.flashcard.dto.extraction.ExtractionJobResponse;
import com.pbl6.flashcard.model.ExtractionJob;

/** Job bóc tách nhìn từ admin: như của người dùng (không văn bản) + chủ job. */
public record AdminExtractionResponse(ExtractionJobResponse job, Long userId, String userEmail, String purpose) {
    /** lowLineConf = cấu hình ocr_low_line_confidence, để admin thấy cùng các dòng OCR nghi sai như người dùng. */
    public static AdminExtractionResponse of(ExtractionJob j, String userEmail, double lowLineConf) {
        return new AdminExtractionResponse(ExtractionJobResponse.of(j, false, lowLineConf), j.getUserId(), userEmail,
                j.getPurpose());
    }
}
