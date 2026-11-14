-- STAFF-07: khiếu nại giữ lý do khoá như lúc gửi. users.locked_reason chỉ là trạng thái HIỆN TẠI (mở khoá -> NULL, khoá lại
-- -> lý do mới) nên sau khi xử lý admin không còn biết người dùng đã khiếu nại về lần khoá nào. Chỉ thêm cột nullable trên DB
-- dùng chung, không backfill (lý do lúc gửi của khiếu nại cũ không khôi phục được):
--   NULL = khiếu nại gửi trước V29 -> Admin Panel hiện lý do hiện tại kèm nhãn;
--   ''   = lúc gửi tài khoản bị khoá không ghi lý do (phân biệt được với NULL ở trên).
-- IF NOT EXISTS (D7): cột đã có sẵn trên DB dùng chung (thêm tay khi thử / nhánh khác) không được làm Flyway ghi V29 thất bại
-- rồi chặn mọi backend trỏ vào DB đó tới khi có người chạy flyway repair.
ALTER TABLE account_appeals ADD COLUMN IF NOT EXISTS locked_reason_at_submit text;
