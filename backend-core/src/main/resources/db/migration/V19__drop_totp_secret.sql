-- Tối 18/10/2026: bỏ xác thực 2 bước (TOTP) cho staff, chỉ giữ bắt đổi mật khẩu seed (users.must_change_password).
-- V16 giữ nguyên nội dung cũ để checksum Flyway khớp với DB đã migrate; cột thừa gỡ ở đây.
ALTER TABLE users DROP COLUMN IF EXISTS totp_secret;
