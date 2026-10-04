-- Đánh giá bộ thẻ: thêm bình luận tuỳ chọn (tối đa 500 ký tự) và thời điểm tạo.
-- Bảng đã có UNIQUE (deck_id, user_id) và CHECK stars 1-5 từ V3 nên mỗi người chỉ có một đánh giá mỗi bộ thẻ.
ALTER TABLE deck_ratings ADD COLUMN comment varchar(500);
ALTER TABLE deck_ratings ADD COLUMN created_at timestamptz(6) NOT NULL DEFAULT now();
ALTER TABLE deck_ratings ADD CONSTRAINT deck_ratings_comment_len CHECK (comment IS NULL OR char_length(comment) <= 500);
-- Đánh giá cũ: lấy updated_at làm created_at cho đúng thứ tự.
UPDATE deck_ratings SET created_at = updated_at;
-- Danh sách đánh giá theo bộ thẻ, mới nhất trước.
CREATE INDEX idx_deck_ratings_deck_updated ON deck_ratings (deck_id, updated_at DESC);
