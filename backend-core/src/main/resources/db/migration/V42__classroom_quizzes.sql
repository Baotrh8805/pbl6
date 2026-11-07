-- ====================================================================
-- V42: Bài kiểm tra trắc nghiệm riêng cho Lớp học (Classroom Quizzes / Exams)
-- ====================================================================

-- 1. Bảng bài kiểm tra của lớp học
CREATE TABLE classroom_quizzes (
    id BIGSERIAL PRIMARY KEY,
    classroom_id BIGINT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
    lesson_id BIGINT REFERENCES classroom_lessons(id) ON DELETE SET NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    duration_minutes INT NOT NULL DEFAULT 15,
    question_count INT NOT NULL DEFAULT 30,
    card_range VARCHAR(50),
    deck_ids JSONB DEFAULT '[]'::jsonb,
    is_published BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_classroom_quizzes_class ON classroom_quizzes(classroom_id);
CREATE INDEX idx_classroom_quizzes_lesson ON classroom_quizzes(lesson_id);

-- 2. Bảng phiên làm bài thi đang diễn ra (Quiz Attempt Session)
CREATE TABLE classroom_quiz_attempts (
    id UUID PRIMARY KEY,
    quiz_id BIGINT NOT NULL REFERENCES classroom_quizzes(id) ON DELETE CASCADE,
    classroom_id BIGINT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    items_json JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX idx_classroom_quiz_attempts_user ON classroom_quiz_attempts(quiz_id, user_id);

-- 3. Bảng kết quả nộp bài thi (Submissions)
CREATE TABLE classroom_quiz_submissions (
    id BIGSERIAL PRIMARY KEY,
    quiz_id BIGINT NOT NULL REFERENCES classroom_quizzes(id) ON DELETE CASCADE,
    classroom_id BIGINT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
    lesson_id BIGINT REFERENCES classroom_lessons(id) ON DELETE SET NULL,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score INT NOT NULL,
    correct_count INT NOT NULL,
    total_questions INT NOT NULL,
    time_spent_seconds INT DEFAULT 0,
    answers_json JSONB,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_classroom_quiz_sub_quiz ON classroom_quiz_submissions(quiz_id);
CREATE INDEX idx_classroom_quiz_sub_user ON classroom_quiz_submissions(classroom_id, user_id);
