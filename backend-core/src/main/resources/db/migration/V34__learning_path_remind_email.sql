-- B4 (kế hoạch 2026-10-26): nhắc học qua email, bật theo từng lộ trình (mặc định tắt). Chỉ có tác dụng khi reminder = true;
-- job nhắc học gửi tối đa 1 email / người / ngày gộp các lộ trình bật cột này, dùng last_reminded_on sẵn có (V21).
ALTER TABLE learning_paths ADD COLUMN IF NOT EXISTS remind_email boolean NOT NULL DEFAULT false;
