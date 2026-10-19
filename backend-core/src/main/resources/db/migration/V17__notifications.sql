-- G3 (docs/Plan/plans/2026-10-18-admin-roadmap.md): thông báo trong app cho người học.
-- type KHÔNG có CHECK: thêm loại mới (vd. DECK_SHARED, NEW_COMMENT) không cần migration. payload = dữ liệu để frontend dựng câu.
CREATE TABLE notifications (
  id         bigserial PRIMARY KEY,
  user_id    bigint       NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type       varchar(30)  NOT NULL,
  payload    jsonb        NOT NULL DEFAULT '{}'::jsonb,
  read_at    timestamptz(6),
  created_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_time ON notifications (user_id, created_at DESC);
