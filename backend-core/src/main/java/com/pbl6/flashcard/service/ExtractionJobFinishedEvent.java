package com.pbl6.flashcard.service;

import java.util.UUID;

/** Phát khi worker kết thúc một job bóc tách (status = DONE hoặc FAILED), sau khi trạng thái đã được ghi. */
public record ExtractionJobFinishedEvent(UUID jobId, String status) {}
