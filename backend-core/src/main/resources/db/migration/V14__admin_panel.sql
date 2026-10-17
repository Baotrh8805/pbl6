-- Admin Panel (docs/Plan/specs/2026-10-17-admin-panel-design.md): vai trò staff, khoá tài khoản, hạn mức AI riêng,
-- cấu hình đổi lúc chạy, báo cáo nội dung, nhật ký quản trị.

-- Vai trò: USER (người học) | ADMIN / SUPER_ADMIN (staff, không dùng tính năng học)
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('USER','ADMIN','SUPER_ADMIN'));
ALTER TABLE users ADD COLUMN locked_at timestamptz(6);
ALTER TABLE users ADD COLUMN extraction_daily_limit int
  CONSTRAINT users_extraction_limit_check CHECK (extraction_daily_limit BETWEEN 0 AND 1000);
CREATE INDEX idx_users_created_at ON users (created_at);

-- Cấu hình chạy được lúc runtime: khoá cố định, giá trị chuỗi, kiểm tra kiểu ở service theo khoá
CREATE TABLE app_settings (
  key        varchar(40)  PRIMARY KEY
             CHECK (key IN ('extraction_daily_limit_free','extraction_daily_limit_premium','announcement','registration_open')),
  value      varchar(300) NOT NULL,
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_by bigint REFERENCES users (id) ON DELETE SET NULL
);
INSERT INTO app_settings (key, value) VALUES
  ('extraction_daily_limit_free', '5'), ('extraction_daily_limit_premium', '50'),
  ('announcement', ''), ('registration_open', 'true');

-- Báo cáo nội dung (bộ thẻ public)
CREATE TABLE content_reports (
  id              bigserial PRIMARY KEY,
  deck_id         varchar(255) NOT NULL REFERENCES decks (id) ON DELETE CASCADE,
  reporter_id     bigint       NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reason          varchar(20)  NOT NULL
                  CHECK (reason IN ('WRONG_CONTENT','COPYRIGHT','OFFENSIVE','SPAM','OTHER')),
  detail          varchar(500),
  status          varchar(10)  NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED','DISMISSED')),
  action          varchar(20)  CHECK (action IN ('NONE','UNPUBLISH_DECK','CLEAR_COMMENT')),
  resolution_note varchar(500),
  resolved_by     bigint REFERENCES users (id) ON DELETE SET NULL,
  resolved_at     timestamptz(6),
  created_at      timestamptz(6) NOT NULL DEFAULT now(),
  CHECK ((status = 'OPEN') = (resolved_at IS NULL))
);
CREATE UNIQUE INDEX uq_content_reports_open ON content_reports (deck_id, reporter_id) WHERE status = 'OPEN';
CREATE INDEX idx_content_reports_status ON content_reports (status, created_at DESC);

-- Nhật ký quản trị: chỉ ghi thêm, không có API sửa / xoá
CREATE TABLE admin_audit_logs (
  id          bigserial PRIMARY KEY,
  actor_id    bigint       NOT NULL REFERENCES users (id),
  action      varchar(40)  NOT NULL,
  target_type varchar(20)  NOT NULL,
  target_id   varchar(255) NOT NULL,
  detail      jsonb,
  created_at  timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_audit_actor_time ON admin_audit_logs (actor_id, created_at DESC);
CREATE INDEX idx_admin_audit_target ON admin_audit_logs (target_type, target_id);
