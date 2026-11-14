-- ====================================================================
-- V45: Mở rộng cơ chế tạo bài kiểm tra (Scope, Prerequisite & Extra Decks)
-- ====================================================================

ALTER TABLE classroom_quizzes
    ADD COLUMN IF NOT EXISTS scope_type VARCHAR(30) DEFAULT 'LESSON_ONLY',
    ADD COLUMN IF NOT EXISTS required_lesson_id BIGINT REFERENCES classroom_lessons(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS extra_deck_ids JSONB DEFAULT '[]'::jsonb;
