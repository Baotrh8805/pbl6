-- Quiz đa loại + ngân hàng câu hỏi (hợp đồng API đợt 2 §1, C2 C3 C7 E6 G3): từ loại + phương án gây nhiễu trên thẻ, bảng câu
-- hỏi đã sinh (để admin xem / sửa / ẩn câu sai) và báo cáo câu hỏi của người học. Chỉ thêm cột NULL / bảng mới nên dữ liệu
-- và code cũ không đổi: thẻ tay để pos / distractors NULL, quiz "meaning" như trước không cần bảng mới.

-- pos: từ loại Sudachi (pos1, ví dụ 動詞) chép từ extraction_items.pos khi tạo thẻ từ bóc tách -> biết thẻ nào chia động từ được.
-- distractors: {kanjiLookalike:[{term,reading,meaning,level,confidence}], homophones:[...]} do ai-service /extract/distractors
-- sinh (POST /api/decks/{id}/distractors). NULL = chưa sinh; hai danh sách rỗng = đã sinh nhưng không tìm được ứng viên.
ALTER TABLE flashcards
    ADD COLUMN pos         varchar(40),
    ADD COLUMN distractors jsonb;

-- Ngân hàng câu hỏi: mỗi câu đã sinh (theo luật hoặc AI) lưu lại một lần để admin sửa / ẩn và người học báo cáo đúng câu đó.
-- options NULL = câu tự gõ (reading). Unique theo nội dung (md5 vì prompt + options có thể dài quá giới hạn khoá B-tree):
-- sinh lại cùng một câu cho cùng thẻ thì dùng lại dòng cũ (giữ trạng thái HIDDEN và lượt báo cáo) thay vì nhân bản.
CREATE TABLE quiz_questions (
    id         uuid PRIMARY KEY,
    card_id    varchar(255) NOT NULL REFERENCES flashcards (id) ON DELETE CASCADE,
    deck_id    varchar(255) NOT NULL REFERENCES decks (id) ON DELETE CASCADE,
    kind       varchar(20)  NOT NULL
               CHECK (kind IN ('MEANING','READING','KANJI_LOOKALIKE','HOMOPHONE','CONJUGATION')),
    prompt     varchar(500) NOT NULL,
    options    jsonb,
    correct    varchar(500) NOT NULL,
    extra      jsonb,                         -- form, formLabelVi, example... (câu chia động từ)
    generator  varchar(10)  NOT NULL CHECK (generator IN ('RULE','AI')),
    status     varchar(10)  NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','HIDDEN')),
    flag_count integer      NOT NULL DEFAULT 0 CHECK (flag_count >= 0),
    created_at timestamptz(6) NOT NULL DEFAULT now(),
    updated_at timestamptz(6) NOT NULL DEFAULT now(),
    edited_by  bigint REFERENCES users (id) ON DELETE SET NULL  -- admin sửa gần nhất; NULL = nguyên bản máy sinh
);
-- Index unique dẫn bằng card_id nên phục vụ luôn FK CASCADE từ flashcards; deck_id cần index riêng (xoá bộ thẻ, lọc admin).
CREATE UNIQUE INDEX uq_quiz_questions_content ON quiz_questions (card_id, kind, md5(prompt || coalesce(options::text, '')));
CREATE INDEX idx_quiz_questions_deck ON quiz_questions (deck_id, kind);
-- Admin lọc "đang bị báo cáo": chỉ một phần nhỏ câu hỏi có flag nên index một phần gọn hơn index cả bảng.
CREATE INDEX idx_quiz_questions_flagged ON quiz_questions (updated_at DESC) WHERE flag_count > 0;

-- Báo cáo câu hỏi sai của người học. Mỗi người tối đa một báo cáo OPEN cho mỗi câu (partial unique, như content_reports).
CREATE TABLE question_flags (
    id              bigserial PRIMARY KEY,
    question_id     uuid    NOT NULL REFERENCES quiz_questions (id) ON DELETE CASCADE,
    user_id         bigint  NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    reason          varchar(20) NOT NULL CHECK (reason IN ('WRONG_ANSWER','BAD_DISTRACTOR','TYPO','OTHER')),
    detail          varchar(500),
    status          varchar(10) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED')),
    resolution_note varchar(500),
    resolved_by     bigint REFERENCES users (id) ON DELETE SET NULL,
    resolved_at     timestamptz(6),
    created_at      timestamptz(6) NOT NULL DEFAULT now(),
    CHECK ((status = 'OPEN') = (resolved_at IS NULL))
);
CREATE UNIQUE INDEX uq_question_flags_open ON question_flags (question_id, user_id) WHERE status = 'OPEN';
-- Index một phần ở trên không dùng được cho FK CASCADE (câu DELETE của trigger không mang điều kiện status) -> index riêng.
CREATE INDEX idx_question_flags_question ON question_flags (question_id);
-- Giới hạn 20 báo cáo / giờ / người đếm theo (user_id, created_at); cũng phục vụ FK CASCADE khi xoá tài khoản.
CREATE INDEX idx_question_flags_user_time ON question_flags (user_id, created_at DESC);
CREATE INDEX idx_question_flags_status ON question_flags (status, created_at DESC);
