-- Spec 21/10 (OCR hạ cấp khi Gemini quá tải): loại lỗi của job FAILED để hạn mức 24 giờ (đếm theo số dòng job) bỏ qua lỗi do
-- hệ thống. NULL = không lỗi hoặc lỗi khác (vẫn tính lượt); 'AI_OVERLOADED' = ai-service 503 aiOverloaded (Gemini quá tải /
-- hết quota mà không có bản Tesseract để hạ cấp) -> không tính lượt. Xoá khi job chạy lại (QUEUED / RUNNING).
-- IF NOT EXISTS như V29: DB dùng chung có thể đã được thêm tay.
ALTER TABLE extraction_jobs ADD COLUMN IF NOT EXISTS failure_kind varchar(32);
