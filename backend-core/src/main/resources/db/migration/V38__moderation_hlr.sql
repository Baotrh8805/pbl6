-- Kiểm duyệt bình luận bằng AI + mô hình trí nhớ HLR (spec docs/Plan/specs/2026-10-27-kiem-duyet-ai-va-hlr-design.md §5).
-- Chỉ thêm cột / bảng / index (Supabase dùng chung, D7). Dòng cũ mod_status = 'PENDING' để job quét lại chấm dần.

-- Kết quả kiểm duyệt trên từng bình luận từ điển: mod_status PENDING | CLEAN | FLAGGED | BLOCKED | REVIEWED; mod_verdict giữ kết
-- luận AI gốc sau khi admin xử lý; mod_spans = JSON [{word, start, end, score}] từ bị PhoBERT đánh dấu.
ALTER TABLE dict_comments
  ADD COLUMN IF NOT EXISTS mod_status        varchar(8) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS mod_verdict       varchar(8),
  ADD COLUMN IF NOT EXISTS mod_label         smallint,
  ADD COLUMN IF NOT EXISTS mod_score         real,
  ADD COLUMN IF NOT EXISTS mod_spans         text,
  ADD COLUMN IF NOT EXISTS mod_at            timestamptz(6),
  ADD COLUMN IF NOT EXISTS mod_reviewed_by   bigint REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mod_reviewed_at   timestamptz(6),
  ADD COLUMN IF NOT EXISTS mod_review_action varchar(8);
CREATE INDEX IF NOT EXISTS ix_dict_comments_mod ON dict_comments (mod_status, created_at DESC);

-- Bình luận đánh giá bộ thẻ: cùng bộ cột (sao vẫn tính, chỉ bình luận bị che / ẩn).
ALTER TABLE deck_ratings
  ADD COLUMN IF NOT EXISTS mod_status        varchar(8) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS mod_verdict       varchar(8),
  ADD COLUMN IF NOT EXISTS mod_label         smallint,
  ADD COLUMN IF NOT EXISTS mod_score         real,
  ADD COLUMN IF NOT EXISTS mod_spans         text,
  ADD COLUMN IF NOT EXISTS mod_at            timestamptz(6),
  ADD COLUMN IF NOT EXISTS mod_reviewed_by   bigint REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mod_reviewed_at   timestamptz(6),
  ADD COLUMN IF NOT EXISTS mod_review_action varchar(8);
CREATE INDEX IF NOT EXISTS ix_deck_ratings_mod ON deck_ratings (mod_status, updated_at DESC);
-- Đánh giá không có bình luận thì không có gì để kiểm
UPDATE deck_ratings SET mod_status = 'CLEAN' WHERE comment IS NULL AND mod_status = 'PENDING';

-- Mẹo nhớ người dùng viết: chỉ gắn nhãn cho hàng chờ admin (đã có duyệt tay), không tự từ chối.
ALTER TABLE kanji_mnemonics
  ADD COLUMN IF NOT EXISTS mod_label int,
  ADD COLUMN IF NOT EXISTS mod_score real,
  ADD COLUMN IF NOT EXISTS mod_spans text,
  ADD COLUMN IF NOT EXISTS mod_at    timestamptz(6);

-- Khoá bình luận mềm 24 giờ sau 3 lần bị AI chặn (admin mở sớm được); NULL = không khoá.
ALTER TABLE users ADD COLUMN IF NOT EXISTS comment_locked_until timestamptz(6);

-- Công tắc "mục từ nhạy cảm" của admin, ghi đè nhãn JMdict (vulg / X / derog / sens / sl).
CREATE TABLE IF NOT EXISTS dict_sensitive (
  entry_key  varchar(64) PRIMARY KEY,
  sensitive  boolean NOT NULL,
  actor_id   bigint REFERENCES users (id) ON DELETE SET NULL,
  note       varchar(300),
  updated_at timestamptz(6) NOT NULL DEFAULT now()
);

-- HLR: số lượt đã chấm / đúng (không tính học nhanh), lượt gần nhất, p nhớ dự đoán ngay trước lượt chấm gần nhất, cờ phanh.
ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS seen             int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS correct          int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz(6),
  ADD COLUMN IF NOT EXISTS recall_p         real,
  ADD COLUMN IF NOT EXISTS hlr_brake        boolean NOT NULL DEFAULT false;
-- Lấp từ nhật ký cho thẻ đã học trước V38 (chỉ dòng chưa có số liệu).
UPDATE reviews r
SET seen = l.seen, correct = l.correct, last_reviewed_at = l.last_at
FROM (SELECT user_id, card_id,
             count(*) FILTER (WHERE source <> 'cram')                      AS seen,
             count(*) FILTER (WHERE source <> 'cram' AND grade <> 'again') AS correct,
             max(reviewed_at) FILTER (WHERE source <> 'cram')              AS last_at
      FROM review_logs GROUP BY user_id, card_id) l
WHERE l.user_id = r.user_id AND l.card_id = r.card_id AND r.seen = 0 AND r.last_reviewed_at IS NULL;
