-- Thư viện cộng đồng = bộ thẻ public trong bảng decks. Mọi bộ thẻ đều có chủ (owner_id NOT NULL);
-- bộ thẻ "hệ thống" cũ (owner_id NULL) chuyển cho tài khoản đăng tải thư viện.

-- 1) Tài khoản đăng tải. Chưa có (DB mới/test) thì tạo với password_hash không phải BCrypt
--    -> không đăng nhập được bằng mật khẩu nào. DB đã có tài khoản thì giữ nguyên.
INSERT INTO users (email, password_hash, full_name, role, jlpt_level, is_premium, created_at)
SELECT 'dongocle2404@gmail.com', '!locked', 'Dongocle2404', 'USER', 'N5', false, now()
WHERE NOT EXISTS (SELECT 1 FROM users WHERE lower(email) = 'dongocle2404@gmail.com');

-- 2) Thuộc tính thư viện của bộ thẻ.
ALTER TABLE decks
    ADD COLUMN visibility  varchar(10) NOT NULL DEFAULT 'private'
        CONSTRAINT decks_visibility_check CHECK (visibility IN ('private', 'public')),
    ADD COLUMN category    varchar(20)
        CONSTRAINT decks_category_check CHECK (category IN ('dokkai', 'goi', 'kanji', 'bunpou', 'kaiwa', 'it', 'business')),
    ADD COLUMN is_official boolean NOT NULL DEFAULT false,
    ADD COLUMN is_featured boolean NOT NULL DEFAULT false,
    -- Bộ thẻ được nhân bản từ đâu: đếm lượt tải. Xoá bản gốc thì bản sao vẫn còn.
    ADD COLUMN source_deck_id varchar(255)
        CONSTRAINT fk_decks_source REFERENCES decks (id) ON DELETE SET NULL;
CREATE INDEX idx_decks_source ON decks (source_deck_id);
CREATE INDEX idx_decks_public ON decks (visibility) WHERE visibility = 'public';
-- Tối đa 1 bộ thẻ nổi bật.
CREATE UNIQUE INDEX uq_decks_single_featured ON decks (is_featured) WHERE is_featured;

-- 3) Bộ thẻ hệ thống cũ -> thuộc tài khoản đăng tải, public (id giữ nguyên: lịch sử ôn SRS vẫn gắn đúng thẻ).
UPDATE decks SET owner_id = (SELECT id FROM users WHERE lower(email) = 'dongocle2404@gmail.com'),
                 visibility = 'public', is_official = true, category = 'goi'
WHERE owner_id IS NULL;
ALTER TABLE decks ALTER COLUMN owner_id SET NOT NULL;

-- 4) Chia sẻ quyền: VIEWER xem/học/quiz, EDITOR thêm sửa xoá thẻ và thông tin bộ thẻ.
CREATE TABLE deck_shares (
    id         bigserial PRIMARY KEY,
    deck_id    varchar(255) NOT NULL CONSTRAINT fk_deck_shares_deck REFERENCES decks (id) ON DELETE CASCADE,
    user_id    bigint       NOT NULL CONSTRAINT fk_deck_shares_user REFERENCES users (id) ON DELETE CASCADE,
    permission varchar(10)  NOT NULL CONSTRAINT deck_shares_permission_check CHECK (permission IN ('VIEWER', 'EDITOR')),
    created_at timestamptz(6) NOT NULL DEFAULT now(),
    CONSTRAINT uq_deck_shares_deck_user UNIQUE (deck_id, user_id)
);
CREATE INDEX idx_deck_shares_user ON deck_shares (user_id);

-- 5) Đánh giá 1-5 sao, mỗi người 1 lần mỗi bộ (chấm lại = cập nhật).
CREATE TABLE deck_ratings (
    id         bigserial PRIMARY KEY,
    deck_id    varchar(255) NOT NULL CONSTRAINT fk_deck_ratings_deck REFERENCES decks (id) ON DELETE CASCADE,
    user_id    bigint       NOT NULL CONSTRAINT fk_deck_ratings_user REFERENCES users (id) ON DELETE CASCADE,
    stars      smallint     NOT NULL CONSTRAINT deck_ratings_stars_check CHECK (stars BETWEEN 1 AND 5),
    updated_at timestamptz(6) NOT NULL DEFAULT now(),
    CONSTRAINT uq_deck_ratings_deck_user UNIQUE (deck_id, user_id)
);
