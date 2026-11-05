-- ====================================================================
-- V41: Bảng tin thông báo & bình luận lớp học (Classroom Announcements)
-- ====================================================================

-- 1. Bảng thông báo của giáo viên trong lớp
CREATE TABLE classroom_announcements (
    id BIGSERIAL PRIMARY KEY,
    classroom_id BIGINT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
    author_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200),
    content TEXT NOT NULL,
    is_pinned BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_announcements_class ON classroom_announcements(classroom_id, created_at DESC);

-- 2. Bảng bình luận dưới bài thông báo
CREATE TABLE classroom_announcement_comments (
    id BIGSERIAL PRIMARY KEY,
    announcement_id BIGINT NOT NULL REFERENCES classroom_announcements(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_announcement_comments ON classroom_announcement_comments(announcement_id, created_at ASC);
