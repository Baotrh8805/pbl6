-- Dịch câu / đoạn Nhật ↔ Việt trong từ điển (spec docs/Plan/specs/2026-10-28-dich-cau-design.md §4, D33).
-- Chỉ thêm bảng / khoá cấu hình (Supabase dùng chung, D7).

-- Bộ nhớ dịch cho tab Dịch: cùng câu (đã gộp khoảng trắng) và cùng hướng thì không gọi Gemini lại, không tốn lượt của ai.
-- Không gắn người dùng (câu gõ vào có thể chứa thông tin cá nhân): dòng không được dùng lại 30 ngày bị HousekeepingJob xoá.
CREATE TABLE IF NOT EXISTS dict_text_translations (
  text_hash   varchar(64) PRIMARY KEY,                       -- sha256(hướng + '\n' + câu đã chuẩn hoá)
  direction   varchar(5) NOT NULL CHECK (direction IN ('ja-vi','vi-ja')),
  source_text text NOT NULL,
  result      text NOT NULL,                                 -- JSON ai-service trả (đã lọc): bản dịch, sát nghĩa, phương án, ghi chú,
                                                             -- cách đọc, cụm từ + nghĩa theo ngữ cảnh; nghĩa Việt từ điển áp lúc đọc
  model       varchar(40),
  hit_count   integer NOT NULL DEFAULT 0,
  created_at  timestamptz(6) NOT NULL DEFAULT now(),
  last_hit_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_dict_text_tr_last_hit ON dict_text_translations (last_hit_at);

-- Khoá cấu hình mới: trần lượt dịch câu / giờ / tài khoản, tách khỏi dictionary_ai_hourly_limit để dịch câu không "ăn" lượt dịch
-- nghĩa khi tra. Mở rộng CHECK khoá của app_settings như V21 / V32 (bỏ mọi CHECK trên cột key rồi tạo lại).
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
  'ai_model_primary','email_verification_required',
  'dictionary_ai_hourly_limit','dictionary_examples_translate','dictionary_translate_hourly_limit'));
INSERT INTO app_settings (key, value) VALUES ('dictionary_translate_hourly_limit', '20')
ON CONFLICT (key) DO NOTHING;
