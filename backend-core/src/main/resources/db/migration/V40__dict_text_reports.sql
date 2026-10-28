-- Báo bản dịch sai ở tab Dịch (spec docs/Plan/specs/2026-10-28-dich-cau-design.md §4.5, D33 bổ sung).
-- Chỉ thêm cột / mở rộng CHECK (Supabase dùng chung, D7).

-- Bộ nhớ dịch dùng chung cho mọi người: một bản dịch sai được phục vụ lại tới 30 ngày. Người học báo (kind = TEXT), admin áp bản
-- sửa (Nhật → Việt) hoặc xoá dòng khỏi bộ nhớ để lượt sau dịch lại.
--   entry_key     = text_hash của dict_text_translations (sha256 hex, đúng 64 ký tự)
--   field         = hướng dịch ja-vi | vi-ja
--   current_value = bản dịch lúc báo, proposed_value = bản dịch người học đề xuất (tuỳ chọn)
--   source_text   = câu gốc (người học tự gửi kèm báo cáo — giao diện nói rõ; bộ nhớ dịch vẫn không gắn tài khoản)
ALTER TABLE dict_reports ADD COLUMN IF NOT EXISTS source_text text;

DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT con.conname FROM pg_constraint con
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
    WHERE con.conrelid = 'dict_reports'::regclass AND con.contype = 'c' AND a.attname = 'kind'
  LOOP
    EXECUTE format('ALTER TABLE dict_reports DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE dict_reports ADD CONSTRAINT dict_reports_kind_check CHECK (kind IN ('ENTRY','COMMENT','TEXT'));
