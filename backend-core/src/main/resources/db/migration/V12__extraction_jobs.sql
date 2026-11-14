-- Bóc tách tài liệu tiếng Nhật -> từ vựng / ngữ pháp -> bộ thẻ (xem docs/EXTRACTION.md).
-- File gốc KHÔNG lưu: chỉ giữ văn bản đã trích (người dùng sửa được rồi phân tích lại) và kết quả.
CREATE TABLE extraction_jobs (
    id              uuid PRIMARY KEY,
    user_id         bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    source_type     varchar(10) NOT NULL CHECK (source_type IN ('text', 'image', 'pdf', 'docx', 'txt')),
    source_name     varchar(255),
    status          varchar(12) NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED')),
    stage           varchar(12) NOT NULL DEFAULT 'QUEUED' CHECK (stage IN ('QUEUED', 'TEXT', 'ANALYZE', 'ENRICH', 'DONE')),
    options         jsonb NOT NULL,
    extracted_text  text,
    text_meta       jsonb,
    error_message   varchar(500),
    stats           jsonb,
    deck_ids        jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at      timestamptz(6) NOT NULL DEFAULT now(),
    started_at      timestamptz(6),
    finished_at     timestamptz(6)
);
CREATE INDEX idx_extraction_jobs_user ON extraction_jobs (user_id, created_at DESC);

CREATE TABLE extraction_items (
    id               uuid PRIMARY KEY,
    job_id           uuid NOT NULL REFERENCES extraction_jobs (id) ON DELETE CASCADE,
    kind             varchar(8) NOT NULL CHECK (kind IN ('vocab', 'grammar')),
    position         integer NOT NULL,
    term             varchar(200) NOT NULL,
    surface          varchar(200),
    reading          varchar(200),
    reading_segments jsonb,
    han_viet         varchar(100),
    pos              varchar(40),
    meaning_en       varchar(1000),
    meaning_vi       varchar(1000),
    level            varchar(2) CHECK (level IN ('N5', 'N4', 'N3', 'N2', 'N1')),
    level_confidence double precision,
    level_sources    jsonb,
    frequency        integer NOT NULL DEFAULT 1,
    example          varchar(500),
    example_vi       varchar(500),
    selected         boolean NOT NULL DEFAULT true
);
CREATE INDEX idx_extraction_items_job ON extraction_items (job_id, kind, position);

-- Thẻ sinh tự động giữ metadata ngôn ngữ; thẻ tạo tay để NULL / mặc định nên code cũ không đổi.
ALTER TABLE flashcards
    ADD COLUMN level            varchar(2) CHECK (level IN ('N5', 'N4', 'N3', 'N2', 'N1')),
    ADD COLUMN kind             varchar(8) NOT NULL DEFAULT 'vocab' CHECK (kind IN ('vocab', 'grammar')),
    ADD COLUMN reading_segments jsonb,
    ADD COLUMN han_viet         varchar(100);
