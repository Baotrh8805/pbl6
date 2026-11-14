-- G4 (hợp đồng API đợt 2 §5): nguồn tri thức chuẩn do quản trị tải lên (danh sách từ vựng / ngữ pháp / chữ Hán đã kiểm duyệt).
-- entries của các nguồn ACTIVE (VOCAB / GRAMMAR / KANJI) được gửi sang ai-service làm "references" khi phân tích tài liệu và khi
-- kiểm tra lại mâu thuẫn: mục quản trị ghi đè từ điển cho đúng từ đó. Bảng mới, không đụng dữ liệu cũ.
CREATE TABLE knowledge_sources (
  id          uuid           PRIMARY KEY,
  title       varchar(200)   NOT NULL,
  kind        varchar(10)    NOT NULL CHECK (kind IN ('VOCAB','GRAMMAR','KANJI','OTHER')),
  -- cấp JLPT quản trị khai cho cả nguồn (vd. "Danh sách N5 chính thức"); NULL = không khai
  level       varchar(2)     CHECK (level IN ('N1','N2','N3','N4','N5')),
  -- PUT thay nội dung = phiên bản mới (version + 1) trên cùng id, không giữ bản cũ
  version     int            NOT NULL DEFAULT 1 CHECK (version >= 1),
  source_name varchar(255),
  -- văn bản đã trích (để xem trước / trích lại); file gốc không lưu như extraction_jobs
  content     text,
  -- [{term, reading, meaning, level}] trích bằng ai-service (bố cục danh sách)
  entries     jsonb          NOT NULL DEFAULT '[]',
  text_meta   jsonb,
  status      varchar(10)    NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  uploaded_by bigint         REFERENCES users (id) ON DELETE SET NULL,
  created_at  timestamptz(6) NOT NULL DEFAULT now(),
  updated_at  timestamptz(6) NOT NULL DEFAULT now()
);
-- Danh sách admin (lọc status / kind, mới sửa trước) và truy vấn tham chiếu ACTIVE lúc phân tích
CREATE INDEX idx_knowledge_sources_status_kind ON knowledge_sources (status, kind, updated_at DESC);
