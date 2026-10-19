-- Khiếu nại tài khoản bị khoá (hợp đồng API đợt 2 §6, G1). Người bị khoá không đăng nhập được nên gửi bằng email qua
-- POST /api/auth/appeals (công khai); chỉ lưu khi email thuộc tài khoản đang bị khoá. Staff xử lý ở Admin Panel.
CREATE TABLE account_appeals (
  id              bigserial PRIMARY KEY,
  email           varchar(255)   NOT NULL,
  -- Giữ khiếu nại khi tài khoản biến mất; email vẫn cho biết ai đã gửi
  user_id         bigint         REFERENCES users (id) ON DELETE SET NULL,
  message         varchar(1000)  NOT NULL,
  status          varchar(10)    NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED','DISMISSED')),
  action          varchar(10)    CHECK (action IN ('UNLOCK','NONE')),
  resolution_note varchar(500),
  resolved_by     bigint         REFERENCES users (id) ON DELETE SET NULL,
  resolved_at     timestamptz(6),
  created_at      timestamptz(6) NOT NULL DEFAULT now(),
  CHECK ((status = 'OPEN') = (resolved_at IS NULL))
);
-- Một khiếu nại đang chờ cho mỗi email: gửi lặp không làm đầy hàng đợi của admin
CREATE UNIQUE INDEX uq_account_appeals_open_email ON account_appeals (lower(email)) WHERE status = 'OPEN';
CREATE INDEX idx_account_appeals_status ON account_appeals (status, created_at DESC);
-- Tự xoá tài khoản xoá khiếu nại của người đó (AccountDeletionService)
CREATE INDEX idx_account_appeals_user ON account_appeals (user_id) WHERE user_id IS NOT NULL;
