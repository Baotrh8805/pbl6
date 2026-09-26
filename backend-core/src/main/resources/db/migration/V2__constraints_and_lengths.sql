-- 1) Độ dài cột khớp DTO: trước đây DTO cho phép 500/1000 ký tự nhưng cột 255 -> 500 từ DB.
ALTER TABLE decks      ALTER COLUMN description TYPE varchar(1000);
ALTER TABLE flashcards ALTER COLUMN meaning     TYPE varchar(500);
ALTER TABLE flashcards ALTER COLUMN example     TYPE varchar(1000);

-- 2) Ràng buộc tham chiếu còn thiếu. Dữ liệu mồ côi (nếu có) làm migration dừng tại đây -> xử lý tay trước.
ALTER TABLE reviews ADD CONSTRAINT fk_reviews_card
    FOREIGN KEY (card_id) REFERENCES flashcards (id) ON DELETE CASCADE;
ALTER TABLE reviews ADD CONSTRAINT fk_reviews_user
    FOREIGN KEY (user_id) REFERENCES users (id);
ALTER TABLE quiz_results ADD CONSTRAINT fk_quiz_results_deck
    FOREIGN KEY (deck_id) REFERENCES decks (id) ON DELETE CASCADE;
ALTER TABLE quiz_results ADD CONSTRAINT fk_quiz_results_user
    FOREIGN KEY (user_id) REFERENCES users (id);
ALTER TABLE decks ADD CONSTRAINT fk_decks_owner
    FOREIGN KEY (owner_id) REFERENCES users (id);
CREATE INDEX idx_reviews_card ON reviews (card_id);
CREATE INDEX idx_quiz_results_deck ON quiz_results (deck_id);
CREATE INDEX idx_decks_owner ON decks (owner_id);

-- 3) Email không phân biệt hoa thường (ứng dụng luôn lưu dạng lower-case).
-- Còn email trùng khi lower() -> migration dừng ở đây; gộp tài khoản bằng tay trước.
UPDATE users SET email = lower(trim(email)) WHERE email <> lower(trim(email));
CREATE UNIQUE INDEX uq_users_email_lower ON users (lower(email));

-- 4) Mốc đổi mật khẩu: token phát hành trước mốc này bị từ chối.
ALTER TABLE users ADD COLUMN password_changed_at timestamptz(6);
