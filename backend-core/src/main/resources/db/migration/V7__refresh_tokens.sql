-- Refresh token (UC-02): hạn trượt, mỗi lần làm mới lùi expires_at thêm một khoảng (mặc định 3 ngày).
-- Không vào web quá khoảng đó -> token hết hạn -> phải đăng nhập lại. Chỉ lưu SHA-256 của token.
CREATE TABLE refresh_tokens (
    id         bigserial PRIMARY KEY,
    user_id    bigint       NOT NULL CONSTRAINT fk_refresh_token_user REFERENCES users (id) ON DELETE CASCADE,
    token_hash varchar(64)  NOT NULL CONSTRAINT uq_refresh_token UNIQUE,
    expires_at timestamptz(6) NOT NULL,
    created_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_token_user ON refresh_tokens (user_id);
