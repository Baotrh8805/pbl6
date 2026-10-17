-- Hai tài khoản quản trị khởi tạo (yêu cầu 17/10/2026). Đăng nhập bằng email (ô "Email" của trang đăng nhập):
--   superadmin@nihongen.local / superadmin  -> SUPER_ADMIN
--   admin1@nihongen.local     / admin1      -> ADMIN
-- Mật khẩu là BCrypt (cost 10) do BCryptPasswordEncoder sinh. ĐỔI MẬT KHẨU ngay sau lần đăng nhập đầu
-- (Hồ sơ > Đổi mật khẩu) trên môi trường thật: đây là mật khẩu yếu và nằm trong mã nguồn.
-- Idempotent: không ghi đè nếu email đã tồn tại (vd. đã đổi mật khẩu).

INSERT INTO users (email, password_hash, full_name, role, jlpt_level, is_premium, created_at)
SELECT 'superadmin@nihongen.local', '$2a$10$9R8s2pWKX06tOwd/pXcTz.DWZA6oOY2v007rNqADYWQCLCzjzx7Mm', 'Super admin', 'SUPER_ADMIN', 'N5', false, now()
WHERE NOT EXISTS (SELECT 1 FROM users WHERE lower(email) = 'superadmin@nihongen.local');

INSERT INTO users (email, password_hash, full_name, role, jlpt_level, is_premium, created_at)
SELECT 'admin1@nihongen.local', '$2a$10$qnTolaK3SUdH..z4PQcB/upyyZQTcP2diNSxpOk57YrvueMs5wHrm', 'Admin 1', 'ADMIN', 'N5', false, now()
WHERE NOT EXISTS (SELECT 1 FROM users WHERE lower(email) = 'admin1@nihongen.local');
