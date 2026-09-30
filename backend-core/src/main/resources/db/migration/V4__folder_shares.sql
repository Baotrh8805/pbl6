-- Chia sẻ thư mục: người được chia sẻ được XEM & HỌC mọi bộ thẻ trong thư mục và các thư mục con.
-- Muốn sửa thì lưu bản sao (clone). Quyền sửa vẫn chia sẻ riêng từng bộ thẻ qua deck_shares.
-- folders.access_type = 'public': mọi tài khoản đã đăng nhập có link đều xem được (không cần mời).
CREATE TABLE folder_shares (
    id         bigserial PRIMARY KEY,
    folder_id  uuid   NOT NULL CONSTRAINT fk_folder_shares_folder REFERENCES folders (id) ON DELETE CASCADE,
    user_id    bigint NOT NULL CONSTRAINT fk_folder_shares_user REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz(6) NOT NULL DEFAULT now(),
    CONSTRAINT uq_folder_shares_folder_user UNIQUE (folder_id, user_id)
);
CREATE INDEX idx_folder_shares_user ON folder_shares (user_id);
