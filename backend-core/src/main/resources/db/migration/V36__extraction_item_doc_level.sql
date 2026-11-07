-- B5.2 (kế hoạch 26/10): cấp JLPT mà TÀI LIỆU khai báo cho một mục (ai-service docLevel) — trước đây backend bỏ, nên
-- "Kiểm tra lại" mâu thuẫn không đánh giá lại được level / grammar. Chỉ thêm cột (Supabase dùng chung).
ALTER TABLE extraction_items ADD COLUMN IF NOT EXISTS doc_level varchar(2);
