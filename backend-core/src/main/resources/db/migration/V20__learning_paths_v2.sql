-- Lộ trình học tập 2.0 (docs/Plan/specs/2026-10-19-lo-trinh-hoc-tap-2-design.md §2): lịch theo thẻ thay cho dải vị trí,
-- trần thẻ/ngày + ngày học trong tuần + nhắc học, kiểm tra cuối chương, đo thời gian phản xạ khi ôn, 3 khoá cấu hình mới.

-- Lịch theo thẻ: một dòng cho mỗi thẻ đã chốt khi kích hoạt. Thẻ bị xoá -> dòng mất (CASCADE), lịch không trôi.
CREATE TABLE learning_path_cards (
  id            bigserial PRIMARY KEY,
  path_id       uuid NOT NULL REFERENCES learning_paths (id) ON DELETE CASCADE,
  chapter_id    uuid NOT NULL REFERENCES learning_path_chapters (id) ON DELETE CASCADE,
  card_id       varchar(255) NOT NULL REFERENCES flashcards (id) ON DELETE CASCADE,
  seq           integer NOT NULL,          -- thứ tự trong lộ trình (chương rồi thứ tự tài liệu)
  scheduled_day integer NOT NULL,          -- ngày học thứ mấy (1-based, chỉ đếm ngày học)
  weight        numeric(3,1) NOT NULL DEFAULT 1.0,  -- 1.0 dễ/ngang cấp, 1.5 trên cấp, 1.2 chưa rõ cấp
  UNIQUE (path_id, card_id)
);
CREATE INDEX idx_lp_cards_day ON learning_path_cards (path_id, scheduled_day);
-- Hai FK CASCADE còn lại cần index dẫn đầu bằng chính cột đó (UNIQUE và idx_lp_cards_day đều dẫn bằng path_id nên không dùng
-- được): xoá bộ thẻ N thẻ hay xoá chương sẽ quét cả bảng N lần cho trigger FK, mà bảng lớn dần theo mọi lộ trình ACTIVE.
CREATE INDEX idx_lp_cards_card ON learning_path_cards (card_id);
CREATE INDEX idx_lp_cards_chapter ON learning_path_cards (chapter_id);

ALTER TABLE learning_paths
  ADD COLUMN daily_cap    integer NOT NULL DEFAULT 50 CHECK (daily_cap BETWEEN 5 AND 200),
  ADD COLUMN study_days   varchar(7) NOT NULL DEFAULT '1111111' CHECK (study_days ~ '^[01]{7}$' AND study_days <> '0000000'), -- T2..CN
  ADD COLUMN reminder     boolean NOT NULL DEFAULT true,
  ADD COLUMN completed_at timestamptz(6),
  ADD COLUMN last_rebalanced_at timestamptz(6);

-- V13 khai báo CHECK ngay trong cột nên Postgres tự đặt tên (learning_paths_source_type_check). Tra pg_constraint theo
-- cột thay vì tin vào tên để chạy được cả trên Postgres nhúng (test) lẫn Supabase; tạo lại với tên cố định để lần sau sửa dễ.
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT con.conname FROM pg_constraint con
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
    WHERE con.conrelid = 'learning_paths'::regclass AND con.contype = 'c' AND a.attname = 'source_type'
  LOOP
    EXECUTE format('ALTER TABLE learning_paths DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE learning_paths ADD CONSTRAINT learning_paths_source_type_check
  CHECK (source_type IN ('text','image','pdf','docx','txt','remedial'));

ALTER TABLE learning_path_chapters
  ADD COLUMN quiz_best_pct   integer,
  ADD COLUMN quiz_passed_at  timestamptz(6);

-- Đo thời gian phản xạ + gắn lượt ôn với lộ trình (phân tích hiệu quả)
ALTER TABLE review_logs
  ADD COLUMN reaction_ms integer CHECK (reaction_ms IS NULL OR reaction_ms BETWEEN 0 AND 600000),
  ADD COLUMN path_id uuid REFERENCES learning_paths (id) ON DELETE SET NULL;
CREATE INDEX idx_review_logs_path ON review_logs (path_id) WHERE path_id IS NOT NULL;

-- Cấu hình chung (Admin > Cấu hình): mở rộng CHECK khoá. V14 cũng khai báo CHECK trong cột (app_settings_key_check) -> tra như trên.
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
  'learning_path_daily_cap_default','learning_path_quiz_pass_pct','learning_path_reminder_hour'));
INSERT INTO app_settings (key, value) VALUES
  ('learning_path_daily_cap_default','50'), ('learning_path_quiz_pass_pct','80'), ('learning_path_reminder_hour','7')
ON CONFLICT (key) DO NOTHING;
