-- C4/G2 (hợp đồng API đợt 2 §4): mẹo nhớ chữ Hán theo bộ thủ + kiểm duyệt. Mọi mẹo (Gemini, mẫu, người học tự viết) vào
-- PENDING; chỉ mẹo APPROVED được hiện công khai trên thẻ bộ thủ (/api/nlp/radicals/cards). Bảng mới, không đụng dữ liệu cũ.
CREATE TABLE kanji_mnemonics (
  id              uuid         PRIMARY KEY,
  kanji           varchar(4)   NOT NULL,
  -- số bộ Khang Hi lúc sinh mẹo (ai-service /radicals/cards); NULL khi không tra được bộ hoặc mẹo người học tự viết
  radical_no      int          CHECK (radical_no BETWEEN 1 AND 214),
  mnemonic_vi     varchar(500) NOT NULL,
  source          varchar(10)  NOT NULL CHECK (source IN ('AI','TEMPLATE','USER')),
  status          varchar(10)  NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  generated_model varchar(40),
  -- tác giả (người bấm sinh mẹo hoặc tự viết); xoá tài khoản thì mẹo đã duyệt vẫn giữ cho người học khác
  created_by      bigint       REFERENCES users (id) ON DELETE SET NULL,
  reviewed_by     bigint       REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at     timestamptz(6),
  review_note     varchar(500),
  created_at      timestamptz(6) NOT NULL DEFAULT now(),
  CHECK ((status = 'PENDING') = (reviewed_at IS NULL))
);
-- Mỗi chữ tối đa một mẹo công khai: duyệt mẹo mới chuyển mẹo APPROVED cũ thành REJECTED trong cùng transaction; hai admin
-- duyệt hai mẹo cùng chữ một lúc thì người sau chạm index này (409) thay vì để hai mẹo cùng công khai.
CREATE UNIQUE INDEX uq_kanji_mnemonics_approved ON kanji_mnemonics (kanji) WHERE status = 'APPROVED';
CREATE INDEX idx_kanji_mnemonics_status_time ON kanji_mnemonics (status, created_at DESC);
CREATE INDEX idx_kanji_mnemonics_author ON kanji_mnemonics (created_by, kanji);
