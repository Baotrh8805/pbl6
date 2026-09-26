-- Baseline = schema Supabase tại 2026-09-25 (trước đây do Hibernate ddl-auto=update + data.sql tạo).
-- DB đã có bảng: Flyway baseline-on-migrate đánh dấu V1 là đã chạy, KHÔNG thực thi file này.
-- DB trống (test, môi trường mới): file này tạo đúng schema đó.

CREATE TABLE users (
    id            bigserial PRIMARY KEY,
    created_at    timestamp(6),
    email         varchar(255) NOT NULL CONSTRAINT uk_6dotkott2kjsp8vw4d0m25fb7 UNIQUE,
    full_name     varchar(255),
    is_premium    boolean,
    jlpt_level    varchar(255),
    password_hash varchar(255) NOT NULL,
    role          varchar(255) CONSTRAINT users_role_check CHECK (role IN ('USER', 'ADMIN'))
);

CREATE TABLE folders (
    id          uuid PRIMARY KEY,
    access_type varchar(20)  NOT NULL,
    created_at  timestamp(6),
    description varchar(500),
    level       varchar(10),
    title       varchar(100) NOT NULL,
    updated_at  timestamp(6),
    user_id     bigint       NOT NULL CONSTRAINT fkc2qooq7m62v6o0c8ptaj3x4cj REFERENCES users (id),
    metadata    text,
    parent_id   uuid,
    is_pinned   boolean      NOT NULL DEFAULT false
);
-- Xoá folder cha KHÔNG xoá con: con được đẩy lên gốc (FolderService.deleteFolder).
ALTER TABLE folders ADD CONSTRAINT fk_folders_parent
    FOREIGN KEY (parent_id) REFERENCES folders (id) ON DELETE SET NULL;
CREATE INDEX idx_folders_user_parent ON folders (user_id, parent_id);
-- Trùng tên trong cùng thư mục cha: cần 2 index vì NULL không so sánh được trong UNIQUE.
CREATE UNIQUE INDEX uq_folder_name_in_parent ON folders (user_id, parent_id, lower(title)) WHERE parent_id IS NOT NULL;
CREATE UNIQUE INDEX uq_folder_name_at_root ON folders (user_id, lower(title)) WHERE parent_id IS NULL;

CREATE TABLE decks (
    id          varchar(255) PRIMARY KEY,
    description varchar(255),
    level       varchar(255) NOT NULL,
    owner_id    bigint,
    title       varchar(255) NOT NULL,
    -- Deck trong folder bị xoá -> về "chưa xếp"
    folder_id   uuid CONSTRAINT fk_decks_folder REFERENCES folders (id) ON DELETE SET NULL
);
CREATE INDEX idx_decks_folder ON decks (folder_id);

CREATE TABLE flashcards (
    id       varchar(255) PRIMARY KEY,
    example  varchar(255),
    meaning  varchar(255) NOT NULL,
    position integer,
    reading  varchar(255),
    term     varchar(255) NOT NULL,
    deck_id  varchar(255) NOT NULL CONSTRAINT fkcsgfhexx0of03e3fnt644uls1 REFERENCES decks (id)
);

CREATE TABLE reviews (
    id            bigserial PRIMARY KEY,
    card_id       varchar(255)     NOT NULL,
    due_at        timestamptz(6)   NOT NULL,
    ease          double precision NOT NULL,
    interval_days integer          NOT NULL,
    reps          integer          NOT NULL,
    user_id       bigint           NOT NULL,
    CONSTRAINT ukequlosournnndxcasu7u5sh8i UNIQUE (user_id, card_id)
);

CREATE TABLE quiz_results (
    id         bigserial PRIMARY KEY,
    created_at timestamptz(6) NOT NULL,
    deck_id    varchar(255)   NOT NULL,
    score      integer        NOT NULL,
    total      integer        NOT NULL,
    user_id    bigint         NOT NULL
);
