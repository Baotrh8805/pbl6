-- Đổi thuật toán SRS (ease tự hồi phục, quên giữ lại 30% khoảng ôn): chấp nhận reset toàn bộ tiến độ cũ.
DELETE FROM reviews;

-- Nhật ký từng lần ôn (flip / quiz practice / cram) để đo hiệu quả và tối ưu thuật toán về sau.
CREATE TABLE review_logs (
    id          bigserial PRIMARY KEY,
    user_id     bigint         NOT NULL REFERENCES users (id),
    card_id     varchar(255)   NOT NULL REFERENCES flashcards (id) ON DELETE CASCADE,
    grade       varchar(5)     NOT NULL CHECK (grade IN ('again', 'hard', 'good', 'easy')),
    source      varchar(5)     NOT NULL CHECK (source IN ('flip', 'quiz', 'cram')),
    reviewed_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX idx_review_logs_user_time ON review_logs (user_id, reviewed_at);
CREATE INDEX idx_review_logs_card ON review_logs (card_id);
