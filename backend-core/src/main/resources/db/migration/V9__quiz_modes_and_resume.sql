-- Quiz 2 chế độ (practice = làm từng câu, exam = làm hết bài) + khôi phục tiến độ.
--  * questions: bản chụp đề lúc phát (câu hỏi, lựa chọn đã trộn, đáp án đúng, lời giải) -> khôi phục đúng đề
--    sau khi tải lại trang, và chấm không đổi khi bộ thẻ bị sửa/xoá giữa chừng. Không bao giờ gửi nguyên cột này cho client.
--  * answers: JSON cardId -> nghĩa đã chọn, ghi dần (tự lưu) dưới khoá hàng của lượt làm.
ALTER TABLE quiz_attempts ADD COLUMN mode      varchar(16) NOT NULL DEFAULT 'exam';
ALTER TABLE quiz_attempts ADD COLUMN questions text        NOT NULL DEFAULT '[]';
ALTER TABLE quiz_attempts ADD COLUMN answers   text        NOT NULL DEFAULT '{}';

-- Lượt cũ còn mở không có bản chụp đề để khôi phục -> đóng lại trước khi áp ràng buộc "một lượt mở mỗi bộ thẻ".
UPDATE quiz_attempts SET submitted_at = now() WHERE submitted_at IS NULL;

-- Mỗi người chỉ có một lượt đang mở cho mỗi bộ thẻ (bấm "Bắt đầu" lần nữa = tiếp tục lượt cũ).
CREATE UNIQUE INDEX uq_quiz_attempts_one_open ON quiz_attempts (user_id, deck_id) WHERE submitted_at IS NULL;

-- Mỗi lượt chỉ có đúng một kết quả; mode để tách luyện tập khỏi thi khi tính độ chính xác.
ALTER TABLE quiz_results ADD COLUMN mode       varchar(16) NOT NULL DEFAULT 'exam';
ALTER TABLE quiz_results ADD COLUMN attempt_id uuid;
CREATE UNIQUE INDEX uq_quiz_results_attempt ON quiz_results (attempt_id) WHERE attempt_id IS NOT NULL;
