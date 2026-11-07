-- ====================================================================
-- V40: Tính năng Lớp học (Classrooms) dành cho Giáo viên (Premium) & Học viên
-- ====================================================================

-- 1. Bảng lớp học
CREATE TABLE classrooms (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    code VARCHAR(12) NOT NULL UNIQUE,
    jlpt_level VARCHAR(10) DEFAULT 'N5',
    privacy VARCHAR(20) NOT NULL DEFAULT 'PRIVATE',
    owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    max_students INT DEFAULT 30,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_classrooms_owner ON classrooms(owner_id);
CREATE INDEX idx_classrooms_code ON classrooms(code);

-- 2. Bảng thành viên lớp học & yêu cầu duyệt
CREATE TABLE classroom_members (
    id BIGSERIAL PRIMARY KEY,
    classroom_id BIGINT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'STUDENT',
    status VARCHAR(20) NOT NULL DEFAULT 'APPROVED',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_classroom_user UNIQUE (classroom_id, user_id)
);
CREATE INDEX idx_classroom_members_class ON classroom_members(classroom_id, status);
CREATE INDEX idx_classroom_members_user ON classroom_members(user_id);

-- 3. Bảng buổi học trong lớp (Lộ trình học theo từng buổi)
CREATE TABLE classroom_lessons (
    id BIGSERIAL PRIMARY KEY,
    classroom_id BIGINT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
    order_index INT NOT NULL,
    title VARCHAR(150) NOT NULL,
    scheduled_date DATE,
    has_quiz BOOLEAN DEFAULT false,
    quiz_duration_minutes INT DEFAULT 15,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_classroom_lessons_class ON classroom_lessons(classroom_id, order_index);

-- 4. Bảng liên kết bộ thẻ gán vào từng buổi học
CREATE TABLE classroom_lesson_decks (
    id BIGSERIAL PRIMARY KEY,
    lesson_id BIGINT NOT NULL REFERENCES classroom_lessons(id) ON DELETE CASCADE,
    deck_id VARCHAR(255) NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    CONSTRAINT uq_lesson_deck UNIQUE (lesson_id, deck_id)
);

-- 5. Bảng tiến độ học viên theo từng buổi học
CREATE TABLE classroom_lesson_progress (
    id BIGSERIAL PRIMARY KEY,
    lesson_id BIGINT NOT NULL REFERENCES classroom_lessons(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMP WITH TIME ZONE,
    quiz_score INT,
    quiz_attempt_id UUID REFERENCES quiz_attempts(id) ON DELETE SET NULL,
    CONSTRAINT uq_lesson_user_progress UNIQUE (lesson_id, user_id)
);
CREATE INDEX idx_lesson_progress_user ON classroom_lesson_progress(user_id);
