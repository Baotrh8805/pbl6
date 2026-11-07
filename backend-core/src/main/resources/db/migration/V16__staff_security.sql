-- G1 (docs/Plan/plans/2026-10-18-admin-roadmap.md): bảo vệ tài khoản staff + lý do khoá.
-- Staff (ADMIN / SUPER_ADMIN) chỉ dùng được /api/admin/** khi must_change_password = false VÀ totp_secret khác null
-- (CustomUserDetails.getAuthorities: đang chờ hoàn tất -> chỉ còn ROLE_SETUP).
ALTER TABLE users ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN totp_secret varchar(32);
ALTER TABLE users ADD COLUMN locked_reason varchar(200);

-- Hai tài khoản seed (V15) có mật khẩu nằm trong mã nguồn: bắt đổi ngay lần đăng nhập đầu.
UPDATE users SET must_change_password = true
WHERE email IN ('superadmin@nihongen.local', 'admin1@nihongen.local');
