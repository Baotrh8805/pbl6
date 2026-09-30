-- Quên mật khẩu: token dùng 1 lần, hết hạn nhanh. Chỉ lưu SHA-256 của token (lộ DB không dùng được link).
CREATE TABLE password_reset_tokens (
    id         bigserial PRIMARY KEY,
    user_id    bigint       NOT NULL CONSTRAINT fk_password_reset_user REFERENCES users (id) ON DELETE CASCADE,
    token_hash varchar(64)  NOT NULL CONSTRAINT uq_password_reset_token UNIQUE,
    expires_at timestamptz(6) NOT NULL,
    created_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX idx_password_reset_user ON password_reset_tokens (user_id);
