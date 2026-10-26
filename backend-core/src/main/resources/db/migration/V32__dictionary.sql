-- Từ điển Nhật–Việt cộng đồng (spec docs/Plan/specs/2026-10-26-tu-dien-design.md §6.1, quyết định D14–D29). Chỉ thêm bảng /
-- index / khoá cấu hình (D7, Supabase dùng chung). Dữ liệu gốc (JMdict, ví dụ Tatoeba, thẻ chữ Hán) nằm ở ai-service; ở đây là
-- lớp ghi đè của admin, nghĩa tiếng Việt, bình luận, báo cáo, sổ tay và lịch sử tra.
-- Khoá mục (entry_key): 'w:<id JMdict>' | 'w:jlpt:<dạng viết>|<cách đọc>' | 'k:<một chữ Hán>' (kiểm ở DictionaryKeys).

-- Nghĩa tiếng Việt của mục từ / chữ Hán. MACHINE = máy dịch (SEED: dịch sẵn; GEMINI: dịch lúc tra), VERIFIED = admin đã kiểm.
-- Người học không thấy trạng thái (D23); hàng chờ admin dùng nó.
CREATE TABLE IF NOT EXISTS dict_meanings (
  entry_key   varchar(64) PRIMARY KEY,
  term        varchar(100),
  reading     varchar(100),
  level       varchar(2),                    -- cấp JLPT (N5..N1) khi biết, để lọc hàng chờ
  meaning_vi  text NOT NULL,
  status      varchar(16) NOT NULL CHECK (status IN ('MACHINE','VERIFIED')),
  source      varchar(16) NOT NULL CHECK (source IN ('SEED','GEMINI','ADMIN')),
  model       varchar(40),
  created_at  timestamptz(6) NOT NULL DEFAULT now(),
  updated_at  timestamptz(6) NOT NULL DEFAULT now(),
  updated_by  bigint REFERENCES users (id) ON DELETE SET NULL,
  verified_at timestamptz(6),
  verified_by bigint REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_dict_meanings_term ON dict_meanings (term, reading);
CREATE INDEX IF NOT EXISTS ix_dict_meanings_status ON dict_meanings (status);

-- Bản dịch tiếng Việt của câu ví dụ (example_id = id câu Tatoeba).
CREATE TABLE IF NOT EXISTS dict_example_vi (
  entry_key  varchar(64) NOT NULL,
  example_id varchar(40) NOT NULL,
  text_vi    text NOT NULL,
  status     varchar(16) NOT NULL CHECK (status IN ('MACHINE','VERIFIED')),
  source     varchar(16) NOT NULL CHECK (source IN ('GEMINI','ADMIN')),
  model      varchar(40),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_by bigint REFERENCES users (id) ON DELETE SET NULL,
  PRIMARY KEY (entry_key, example_id)
);

-- Lớp ghi đè dữ liệu gốc (D21, D22): đẩy sang ai-service, có hiệu lực toàn hệ thống.
CREATE TABLE IF NOT EXISTS dict_overrides (
  id         bigserial PRIMARY KEY,
  entry_key  varchar(64) NOT NULL,
  field      varchar(24) NOT NULL CHECK (field IN ('reading','han_viet','meaning_en','kanji_meaning',
                                                   'example_jpn','example_eng','example_hidden')),
  sub_key    varchar(40) NOT NULL DEFAULT '',
  value      text NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  created_by bigint REFERENCES users (id) ON DELETE SET NULL,
  UNIQUE (entry_key, field, sub_key)
);

-- Lịch sử mọi lần sửa của admin (nghĩa Việt, bản dịch ví dụ, ghi đè); hoàn tác = ghi thêm dòng mới.
CREATE TABLE IF NOT EXISTS dict_edit_history (
  id         bigserial PRIMARY KEY,
  entry_key  varchar(64) NOT NULL,
  field      varchar(24) NOT NULL,
  sub_key    varchar(40) NOT NULL DEFAULT '',
  old_value  text,
  new_value  text,
  actor_id   bigint REFERENCES users (id) ON DELETE SET NULL,
  report_id  bigint,
  reason     varchar(300),
  created_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_dict_hist_entry ON dict_edit_history (entry_key, id DESC);

CREATE TABLE IF NOT EXISTS dict_comments (
  id            bigserial PRIMARY KEY,
  entry_key     varchar(64) NOT NULL,
  user_id       bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  content       varchar(1000) NOT NULL,
  helpful_count int NOT NULL DEFAULT 0,
  hidden_at     timestamptz(6),
  hidden_by     bigint REFERENCES users (id) ON DELETE SET NULL,
  hidden_note   varchar(300),
  created_at    timestamptz(6) NOT NULL DEFAULT now(),
  updated_at    timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_dict_comments_entry ON dict_comments (entry_key, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_dict_comments_user ON dict_comments (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS dict_comment_votes (
  comment_id bigint NOT NULL REFERENCES dict_comments (id) ON DELETE CASCADE,
  user_id    bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

-- Báo cáo: ENTRY = sai dữ liệu mục từ (field + đề xuất sửa), COMMENT = bình luận xấu.
CREATE TABLE IF NOT EXISTS dict_reports (
  id              bigserial PRIMARY KEY,
  kind            varchar(8) NOT NULL CHECK (kind IN ('ENTRY','COMMENT')),
  entry_key       varchar(64) NOT NULL,
  comment_id      bigint REFERENCES dict_comments (id) ON DELETE SET NULL,
  field           varchar(24),
  sub_key         varchar(40),
  current_value   text,
  proposed_value  text,
  reason          varchar(32),
  note            varchar(1000),
  reporter_id     bigint REFERENCES users (id) ON DELETE SET NULL,
  status          varchar(12) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED','DISMISSED')),
  action          varchar(20),
  resolution_note varchar(500),
  resolved_by     bigint REFERENCES users (id) ON DELETE SET NULL,
  resolved_at     timestamptz(6),
  created_at      timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_dict_reports_status ON dict_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_dict_reports_entry ON dict_reports (entry_key, status);

CREATE TABLE IF NOT EXISTS dict_favorites (
  user_id    bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  entry_key  varchar(64) NOT NULL,
  note       varchar(300),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, entry_key)
);

CREATE TABLE IF NOT EXISTS dict_lookup_history (
  id         bigserial PRIMARY KEY,
  user_id    bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  entry_key  varchar(64) NOT NULL,
  query      varchar(64),
  created_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_dict_history_user ON dict_lookup_history (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_dict_history_entry ON dict_lookup_history (entry_key, created_at DESC);

-- Khoá cấu hình mới: mở rộng CHECK khoá của app_settings như V21 (bỏ mọi CHECK trên cột key rồi tạo lại).
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
  'dictionary_ai_hourly_limit','dictionary_examples_translate'));
INSERT INTO app_settings (key, value) VALUES
  ('dictionary_ai_hourly_limit', '30'), ('dictionary_examples_translate', '3')
ON CONFLICT (key) DO NOTHING;
