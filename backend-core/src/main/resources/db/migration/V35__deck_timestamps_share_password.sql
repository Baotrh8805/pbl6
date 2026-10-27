-- Rà soát 27/10: bộ thẻ / thẻ có mốc thời gian (sắp xếp "mới cập nhật", lọc theo thời gian); link chia sẻ có thể đặt mật khẩu.
-- Chỉ thêm cột, mặc định now() cho dữ liệu cũ (không biết ngày tạo thật).
ALTER TABLE decks ADD COLUMN IF NOT EXISTS created_at timestamptz(6) NOT NULL DEFAULT now();
ALTER TABLE decks ADD COLUMN IF NOT EXISTS updated_at timestamptz(6) NOT NULL DEFAULT now();
-- BCrypt của mật khẩu mở link riêng (D9); NULL = link không cần mật khẩu.
ALTER TABLE decks ADD COLUMN IF NOT EXISTS share_password_hash varchar(100);
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS created_at timestamptz(6) NOT NULL DEFAULT now();
