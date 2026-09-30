-- Lượt làm quiz do server phát: chấm trên đúng các câu đã phát (câu bỏ trống = sai), mỗi lượt nộp 1 lần,
-- có hạn giờ. Lượt quá hạn chưa nộp được ghi 0 điểm -> không bỏ dở để chọn lượt có lợi.
CREATE TABLE quiz_attempts (
    id           uuid PRIMARY KEY,
    user_id      bigint       NOT NULL CONSTRAINT fk_quiz_attempts_user REFERENCES users (id) ON DELETE CASCADE,
    deck_id      varchar(255) NOT NULL CONSTRAINT fk_quiz_attempts_deck REFERENCES decks (id) ON DELETE CASCADE,
    card_ids     text         NOT NULL, -- id thẻ đã phát, phân tách bằng xuống dòng
    created_at   timestamptz(6) NOT NULL,
    expires_at   timestamptz(6) NOT NULL,
    submitted_at timestamptz(6)
);
CREATE INDEX idx_quiz_attempts_open ON quiz_attempts (user_id, expires_at) WHERE submitted_at IS NULL;
