-- B8 (kế hoạch 26/10): failOrphans theo instance. Khởi động lại chỉ đánh FAILED job bóc tách / lộ trình dở dang CỦA CHÍNH
-- instance đó (app.instance-id, mặc định hostname) hoặc dòng chưa ghi instance (trước V37) quá 30 phút; nhiều instance
-- chạy chung một DB không đánh hỏng việc đang chạy của nhau. Chỉ thêm cột (Supabase dùng chung).
ALTER TABLE extraction_jobs ADD COLUMN IF NOT EXISTS instance_id varchar(64);
ALTER TABLE learning_paths ADD COLUMN IF NOT EXISTS instance_id varchar(64);
