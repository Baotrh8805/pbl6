-- Xác thực email (hợp đồng API đợt 2 §3, A1). Bật/tắt bằng khoá app_settings email_verification_required (V21).
-- NULL = chưa xác thực. Người dùng đang có (kể cả 2 tài khoản seed V15 và tài khoản hệ thống V3) được coi là đã xác thực:
-- bật tính năng không được khoá ngoài mọi người đang dùng. Cộng dồn, an toàn trên DB đang chạy.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz(6);
UPDATE users SET email_verified_at = now() WHERE email_verified_at IS NULL;

-- Như password_reset_tokens (V6): chỉ lưu SHA-256 của token (lộ DB không dùng được link), dùng 1 lần, hết hạn 24 giờ.
-- Gửi lại link xoá token cũ của user; HousekeepingJob dọn token hết hạn.
CREATE TABLE email_verification_tokens (
    id         bigserial PRIMARY KEY,
    user_id    bigint         NOT NULL CONSTRAINT fk_email_verification_user REFERENCES users (id) ON DELETE CASCADE,
    token_hash varchar(64)    NOT NULL CONSTRAINT uq_email_verification_token UNIQUE,
    expires_at timestamptz(6) NOT NULL,
    created_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_verification_user ON email_verification_tokens (user_id);
