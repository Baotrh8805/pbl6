-- F2 (hợp đồng API đợt 2 §5): cảnh báo mâu thuẫn tài liệu ↔ tham chiếu (từ điển + nguồn tri thức chuẩn V28) cho từng item bóc
-- tách. Cộng dồn, an toàn trên DB đang chạy (IF NOT EXISTS, không xoá gì); item cũ nhận conflicts = [] (chưa kiểm tra), người
-- dùng bấm "Kiểm tra lại" (POST /api/extractions/{id}/recheck-conflicts) để có cảnh báo cho job cũ.
--   conflicts      [{field, document, reference, source, confidence, noteVi}] như ai-service trả (đã chuẩn hoá khoá note_vi);
--                  luôn là mảng để client xử lý một kiểu.
--   doc_reading    cách đọc TÀI LIỆU tự khai (cột kana / ruby in sẵn), khác reading có thể do Sudachi đoán; NULL = tài liệu không
--                  khai báo hoặc job tạo trước khi ai-service trả trường này — kiểm tra lại khi đó coi reading của thẻ là của tài liệu.
--   doc_meaning_en nghĩa tiếng Anh tài liệu in sẵn, cùng quy ước.
ALTER TABLE extraction_items ADD COLUMN IF NOT EXISTS conflicts jsonb NOT NULL DEFAULT '[]';
ALTER TABLE extraction_items ADD COLUMN IF NOT EXISTS doc_reading varchar(200);
ALTER TABLE extraction_items ADD COLUMN IF NOT EXISTS doc_meaning_en varchar(1000);
