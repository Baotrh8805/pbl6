-- Luyện tập viết Kanji / phát âm / trọng âm (hợp đồng API đợt 2 §2, E2–E4): mỗi lần chấm một dòng để trang luyện tập thống kê
-- và dashboard có lịch sử. Âm thanh không bao giờ lên server — chỉ điểm, mục tiêu và vài trường chi tiết nhỏ trong detail.
CREATE TABLE practice_logs (
  id         bigserial PRIMARY KEY,
  user_id    bigint         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- Thẻ bị xoá: nhật ký vẫn giữ (điểm luyện tập không mất theo bộ thẻ), chỉ mất liên kết
  card_id    varchar(255)   REFERENCES flashcards (id) ON DELETE SET NULL,
  kind       varchar(5)     NOT NULL CHECK (kind IN ('write', 'speak', 'pitch')),
  target     varchar(100)   NOT NULL,
  score      smallint       NOT NULL CHECK (score BETWEEN 0 AND 100),
  detail     jsonb          NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX idx_practice_logs_user_time ON practice_logs (user_id, created_at);
-- FK SET NULL: xoá bộ thẻ N thẻ kích hoạt N lần dò card_id; index một phần vì phần lớn lượt luyện không gắn thẻ
CREATE INDEX idx_practice_logs_card ON practice_logs (card_id) WHERE card_id IS NOT NULL;

-- Dashboard cá nhân (§7, A5) đếm quiz_results theo người dùng và ngày (heatmap + chuỗi ngày học); bảng chỉ có index theo
-- deck_id từ V2 nên mỗi lần mở dashboard sẽ quét cả bảng. A5 không có số migration riêng nên index đi cùng V23.
CREATE INDEX IF NOT EXISTS idx_quiz_results_user_time ON quiz_results (user_id, created_at);
