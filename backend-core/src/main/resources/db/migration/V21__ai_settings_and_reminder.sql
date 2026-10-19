-- Lộ trình 2.0 (phần nhắc học, spec §4.4): ngày (theo Asia/Ho_Chi_Minh) đã gửi LEARNING_PATH_REMINDER gần nhất cho lộ trình,
-- để job mỗi giờ gửi tối đa một lần / lộ trình / ngày. Cộng dồn, an toàn trên DB đang chạy (IF NOT EXISTS, không xoá gì).
ALTER TABLE learning_paths ADD COLUMN IF NOT EXISTS last_reminded_on date;

-- WP-G5 tham số AI (Admin > Cấu hình): 6 khoá mới. Chỉ V21 sửa CHECK khoá của app_settings (kế hoạch tổng 19/10), nên mọi
-- khoá của các gói sau (xác thực email...) gom vào đây. CHECK khai báo trong cột ở V14 rồi được V20 tạo lại với tên cố định;
-- vẫn tra pg_constraint theo cột như V20 để không phụ thuộc tên khi chạy trên Postgres nhúng lẫn Supabase.
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT con.conname FROM pg_constraint con
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
    WHERE con.conrelid = 'app_settings'::regclass AND con.contype = 'c' AND a.attname = 'key'
  LOOP
    EXECUTE format('ALTER TABLE app_settings DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE app_settings ADD CONSTRAINT app_settings_key_check CHECK (key IN (
  'extraction_daily_limit_free','extraction_daily_limit_premium','announcement','registration_open',
  'learning_path_daily_cap_default','learning_path_quiz_pass_pct','learning_path_reminder_hour',
  'ocr_fallback_confidence','ocr_low_line_confidence','distractor_min_confidence','contradiction_alert_threshold',
  'ai_model_primary','email_verification_required'));
-- Giá trị mặc định = hằng số đang dùng trong code (LOW_LINE_CONF 0.75...) để nâng cấp không đổi hành vi. ai_model_primary rỗng
-- = để ai-service tự chọn model. email_verification_required 'true' theo quyết định D2 (gói xác thực email đọc khoá này sau).
INSERT INTO app_settings (key, value) VALUES
  ('ocr_fallback_confidence','0.85'), ('ocr_low_line_confidence','0.75'), ('distractor_min_confidence','0.6'),
  ('contradiction_alert_threshold','0.7'), ('ai_model_primary',''), ('email_verification_required','true')
ON CONFLICT (key) DO NOTHING;
