-- Link chia sẻ bộ thẻ (quyết định D9, kế hoạch 2026-10-26 B1): null = tắt. Có token = người đã đăng nhập mở /d/<token> được nhận quyền
-- xem (xem + học + sao chép) dù bộ riêng tư; chủ tạo / đổi / thu hồi. 32 byte ngẫu nhiên base64url = 43 ký tự. Chỉ thêm cột (D7).
ALTER TABLE decks ADD COLUMN IF NOT EXISTS share_token varchar(43);
CREATE UNIQUE INDEX IF NOT EXISTS ux_decks_share_token ON decks (share_token) WHERE share_token IS NOT NULL;
