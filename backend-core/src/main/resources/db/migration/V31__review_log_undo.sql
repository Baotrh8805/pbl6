-- Spec 25/10 (thao tác học thẻ §3.8): hoàn tác lượt chấm. Mỗi lượt lật / cram ghi lại trạng thái reviews NGAY TRƯỚC khi chấm để
-- POST /api/reviews/undo khôi phục đúng, không tin dữ liệu client gửi. prev_exists: true = có dòng reviews (prev_* là giá trị cũ),
-- false = lượt đầu tiên (hoàn tác thì xoá dòng), NULL = log trước V31 hoặc từ quiz -> không hoàn tác được.
ALTER TABLE review_logs
  ADD COLUMN IF NOT EXISTS prev_exists        boolean,
  ADD COLUMN IF NOT EXISTS prev_reps          integer,
  ADD COLUMN IF NOT EXISTS prev_interval_days integer,
  ADD COLUMN IF NOT EXISTS prev_ease          double precision,
  ADD COLUMN IF NOT EXISTS prev_due_at        timestamptz(6);
