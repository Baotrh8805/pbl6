-- Lộ trình học tập (docs/LEARNING_PATH.md): một lượt bóc tách (purpose = 'learning_path') -> chương -> mỗi chương
-- một bộ thẻ trong một thư mục + lịch học theo ngày. Xoá lộ trình chỉ xoá kế hoạch, bộ thẻ / thư mục giữ nguyên.
ALTER TABLE extraction_jobs
    ADD COLUMN purpose varchar(16) NOT NULL DEFAULT 'extraction' CHECK (purpose IN ('extraction', 'learning_path'));

CREATE TABLE learning_paths (
    id                uuid PRIMARY KEY,
    user_id           bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title             varchar(100) NOT NULL,
    source_type       varchar(10) NOT NULL CHECK (source_type IN ('text', 'image', 'pdf', 'docx', 'txt')),
    source_name       varchar(255),
    status            varchar(12) NOT NULL CHECK (status IN ('PROCESSING', 'DRAFT', 'ACTIVE', 'FAILED')),
    job_id            uuid REFERENCES extraction_jobs (id) ON DELETE SET NULL,
    folder_id         uuid REFERENCES folders (id) ON DELETE SET NULL,
    total_days        integer NOT NULL CHECK (total_days BETWEEN 1 AND 365),
    start_date        date NOT NULL,
    chapters_detected boolean,
    error_message     varchar(500),
    created_at        timestamptz(6) NOT NULL DEFAULT now(),
    activated_at      timestamptz(6)
);
CREATE INDEX idx_learning_paths_user ON learning_paths (user_id, created_at DESC);
CREATE INDEX idx_learning_paths_job ON learning_paths (job_id);

CREATE TABLE learning_path_chapters (
    id          uuid PRIMARY KEY,
    path_id     uuid NOT NULL REFERENCES learning_paths (id) ON DELETE CASCADE,
    position    integer NOT NULL,
    title       varchar(100) NOT NULL,
    -- decks.id là varchar(255) (V1). Xoá bộ thẻ -> NULL, API hiện "bộ thẻ đã xoá".
    deck_id     varchar(255) REFERENCES decks (id) ON DELETE SET NULL,
    card_count  integer,      -- NULL khi DRAFT (tính sống từ extraction_items), chốt khi ACTIVE
    day_from    integer,
    day_to      integer
);
CREATE INDEX idx_learning_path_chapters_path ON learning_path_chapters (path_id, position);

ALTER TABLE extraction_items
    ADD COLUMN chapter_no integer,                                                       -- số chương ai-service trả
    ADD COLUMN chapter_id uuid REFERENCES learning_path_chapters (id) ON DELETE SET NULL; -- chương sau khi gộp / sửa
CREATE INDEX idx_extraction_items_chapter ON extraction_items (chapter_id);
