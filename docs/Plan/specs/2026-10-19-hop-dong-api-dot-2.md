# Hợp đồng API đợt 2 (19/10/2026) — nguồn sự thật chung cho làn backend và làn frontend

Mọi gói đợt 2 làm theo đúng tệp này. Đổi hợp đồng = sửa tệp này trước rồi mới sửa code. Quy ước chung giữ nguyên:
JWT; lỗi `{status, error, message}` (+ `code` khi ghi rõ dưới đây); `@JsonInclude(NON_NULL)`; phân trang admin
`AdminPage<T> {items, total, page, size}`; API học tập chỉ cho USER (staff 403), `/api/admin/**` cho ADMIN, thao tác ghi
nhạy cảm cho SUPER_ADMIN; mọi thao tác ghi admin sinh đúng 1 dòng audit trong cùng transaction; khoá `app_settings` dùng
**snake_case** trong JSON (như các khoá có sẵn).

Số migration cố định: V22 quiz (pos, distractors, quiz_questions, question_flags) · V23 practice_logs · V24 xác thực email ·
V25 kanji_mnemonics · V26 extraction_items.conflicts · V27 account_appeals · V28 knowledge_sources.
(V20 lộ trình 2.0, V21 tham số AI + last_reminded_on đã có.) Bổ sung 20/10 (chiều): V29 `account_appeals.locked_reason_at_submit`
(§6). Số trống tiếp theo: V30.

Bổ sung 20/10 (chiều), tóm tắt: §1.4 kiểm tra chương, §4 `generate` gửi `geminiModel` và `generated_model` = model thật, §6 lý do
khoá lúc gửi + đổi lý do khoá + mốc thời gian làm tròn µs, §8 `aiModels` và model Gemini theo request, §10 lộ trình (D4:
`quizPassPct`, `state="empty"`, `LEARNING_PATH_CHAPTER_RETRY`). Mọi thay đổi chỉ **thêm** trường / giá trị; hành vi đổi ghi rõ ở
từng mục.

---

## 1. Quiz đa loại + ngân hàng câu hỏi (C2, C3, C7, E6, G3) — V22

### 1.1 Dữ liệu
- `flashcards.pos varchar(40)` (từ `extraction_items.pos` khi tạo thẻ từ bóc tách), `flashcards.distractors jsonb`
  `{kanjiLookalike:[{term,reading,meaning,level,confidence}], homophones:[…]}` (NULL với thẻ tay).
- `quiz_questions(id uuid PK, card_id → flashcards CASCADE, deck_id → decks CASCADE, kind varchar(20) CHECK IN
  ('MEANING','READING','KANJI_LOOKALIKE','HOMOPHONE','CONJUGATION'), prompt varchar(500), options jsonb, correct varchar(500),
  extra jsonb (form, formLabelVi, example…), generator varchar(10) CHECK IN ('RULE','AI'), status varchar(10) DEFAULT 'ACTIVE'
  CHECK IN ('ACTIVE','HIDDEN'), flag_count int DEFAULT 0, created_at, updated_at, edited_by bigint NULL)`; unique
  `(card_id, kind, md5(prompt || coalesce(options::text,'')))`.
- `question_flags(id bigserial, question_id → quiz_questions CASCADE, user_id → users CASCADE, reason CHECK IN
  ('WRONG_ANSWER','BAD_DISTRACTOR','TYPO','OTHER'), detail varchar(500), status CHECK IN ('OPEN','RESOLVED') DEFAULT 'OPEN',
  resolution_note varchar(500), resolved_by, resolved_at, created_at)`; partial unique `(question_id, user_id) WHERE status='OPEN'`.

### 1.2 Người học
| Method | Path | Body / Query | Trả về |
|---|---|---|---|
| GET | `/api/decks/{id}/quiz-capabilities` | — | `{meaning:int, kanjiLookalike:int, homophone:int, reading:int, conjugation:int}` = số thẻ dùng được cho từng loại |
| POST | `/api/decks/{id}/distractors` | — (EDITOR+) | `{updated:int, withLookalike:int, withHomophone:int}` — gọi ai-service `/extract/distractors`, ghi `flashcards.distractors`; 503 khi ai-service tắt |
| POST | `/api/quiz-attempts` | `{deckId, size, mode, questionTypes?: ("meaning"\|"kanji_lookalike"\|"homophone"\|"reading"\|"conjugation")[]}` (mặc định `["meaning"]`) | `AttemptState` như cũ |
| PUT | `/api/quiz-attempts/{id}/answers/{cardId}` | `{option}`; loại `reading`: chuỗi tự gõ ≤ 100, server chuẩn hoá kana (katakana→hiragana, bỏ khoảng trắng/dấu câu) | như cũ |
| POST | `/api/quiz-questions/{questionId}/flags` | `{reason, detail?}` (detail bắt buộc khi OTHER; ≤ 500) | 201 `{id, status}`; 409 đã có báo cáo OPEN của mình; 429 > 20/giờ |

`QuestionState` thêm: `type` (`meaning|kanji_lookalike|homophone|reading|conjugation`), `prompt` (string\|null — câu hỏi
hiển thị, ví dụ "Chữ nào có nghĩa 'chờ đợi' (まつ)?" / "Thể て của 書く (かく)"), `inputMode` (`choice|typing`),
`questionId` (string\|null). Với `typing`: `options = []`. `Feedback` thêm `example` (string\|null — câu ví dụ cho
conjugation). Một lượt trộn nhiều loại: mỗi thẻ ra một câu, loại chọn xoay vòng theo `questionTypes` trong số loại thẻ đó
hỗ trợ; thẻ không hỗ trợ loại nào được chọn → câu `meaning`. Câu `reading` cần `card.reading` (hoặc term toàn kana);
`conjugation` cần `card.pos` là động từ (hoặc ai-service xác định được nhóm).

### 1.3 Admin (G3)
| Method | Path | Body / Query | Trả về |
|---|---|---|---|
| GET | `/api/admin/questions` | `deckId?, kind?, flagged?(bool), status?, q?, page, size` | `AdminPage<{id, deckId, deckTitle, cardId, term, kind, prompt, options, correct, status, flagCount, openFlags, generator, updatedAt}>` |
| GET | `/api/admin/questions/{id}` | — | phần tử trên + `flags:[{id, userEmail, reason, detail, status, createdAt, resolutionNote}]` |
| PATCH | `/api/admin/questions/{id}` | `{prompt?, options?, correct?}` — `correct ∈ options` khi options không rỗng | chi tiết; audit `QUESTION_EDIT` |
| POST | `/api/admin/questions/{id}/hide` · `/unhide` | — | chi tiết; audit `QUESTION_HIDE/UNHIDE` |
| POST | `/api/admin/question-flags/{id}/resolve` | `{note?}` | flag; audit `QUESTION_FLAG_RESOLVE`; 409 khi không còn OPEN |
`GET /api/admin/stats` thêm `openQuestionFlags`.

### 1.4 Bài kiểm tra chương của lộ trình (bổ sung 20/10 chiều, `657d383`)
`POST /api/learning-paths/{id}/chapters/{cid}/quiz` **luôn** trả lượt `mode="exam"` của chương, min(10, số thẻ) câu `meaning`
(`QuizAttemptService.chapterExam`), không đi qua quy tắc "đang có lượt mở thì trả lại lượt đó" của `POST /api/quiz-attempts`:
- Đang có lượt exam đủ cỡ trên bộ của chương → trả lại lượt đó (`resumed=true`).
- Đang có lượt khác (practice, exam ít câu mở từ trang Quiz) → lượt đó bị **nộp thay** như khi hết hạn (chấm câu đã làm, câu chưa làm
  tính sai, có dòng `quiz_results` nếu đã trả lời ít nhất một câu), rồi mở lượt exam mới. Đóng dưới khoá dòng; 429 / lỗi → rollback,
  lượt cũ vẫn mở.
- Đề mới cũng thiếu câu (ví dụ câu nghĩa bị admin ẩn trên bộ ít nghĩa) → trả lại lượt đang mở, không nộp thay.
- Chỉ lượt exam đủ min(10, số thẻ) câu mới được tính "qua chương" khi nộp. Chương rỗng → 409 "Chương không còn thẻ nào để kiểm tra.";
  bộ thẻ của chương đã xoá → 409; lộ trình không ACTIVE → 409.
- Frontend đọc `GET /api/quiz-attempts/open` trước và hỏi "Nộp bài đang làm dở?" khi lượt mở sẽ bị nộp thay; lượt trả về không phải
  exam thì báo lỗi, không điều hướng.

---

## 2. Luyện tập: viết Kanji, phát âm, trọng âm (E2, E3, E4) — V23

`practice_logs(id bigserial, user_id → users CASCADE, card_id → flashcards SET NULL, kind CHECK IN ('write','speak','pitch'),
target varchar(100), score smallint CHECK 0..100, detail jsonb DEFAULT '{}', created_at)`.

| Method | Path | Body / Query | Trả về |
|---|---|---|---|
| GET | `/api/practice/kanji/{ch}/strokes` | — | `{kanji, strokeCount, strokes:[[[x,y]…]…]}` (nét chuẩn KanjiVG 0..1); 404 không có dữ liệu |
| POST | `/api/practice/kanji/score` | `{kanji, cardId?, strokes:[[{x,y,t}]]}` (≤ 40 nét, ≤ 500 điểm/nét) | `{kanji, totalScore, isCorrectOrder, feedback, perStroke:[{index, score, wrongDirection, expectedIndex}], missing:[int], extra:[int], strokeCount}`; ghi log `write` |
| GET | `/api/practice/pitch/reference` | `word, reading` | `{word, reading, accentType, moras:[{mora, level:"H"\|"L"}]}`; 404 không có dữ liệu |
| POST | `/api/practice/pitch/score` | `{cardId?, word, reading, accentType?, contour:[{t, f0\|null}]}` (≤ 2000) | `{pct, userHL, refHL, wrongMora, voicedRatio, feedback}`; ghi log `pitch` |
| POST | `/api/practice/pronunciation` | `{cardId?, term, target, transcript, score}` | 201; ghi log `speak` (âm thanh không bao giờ gửi lên) |
| GET | `/api/practice/stats` | `days=30` | `{write:{count, avg}, speak:{count, avg}, pitch:{count, avg}, recent:[{kind, target, score, createdAt}] (≤ 20)}` |

---

## 3. Xác thực email (A1) — V24

- `users.email_verified_at timestamptz(6)` (backfill `now()` cho mọi user đang có + tài khoản seed); bảng
  `email_verification_tokens` (như V6: token băm SHA-256, hạn 24 giờ, dùng 1 lần).
- Bật/tắt bằng khoá `email_verification_required` (V21, mặc định `true`). Tắt → đăng ký xong đã xác thực sẵn.
| Method | Path | Body | Trả về |
|---|---|---|---|
| POST | `/api/auth/register` | như cũ | **200 JSON** `{message, needsVerification:boolean}` (trước đây là chuỗi; FE phải đọc cả hai dạng); email `*@deleted.local` (miền dành riêng cho tài khoản đã tự xoá) → **400** `"email: Email không đúng định dạng"` y hệt lỗi `@Email`, kiểm trước cả cờ mở đăng ký |
| POST | `/api/auth/verify-email` | `{token}` | 200 `{message, email}`; 400 token sai/hết hạn |
| POST | `/api/auth/resend-verification` | `{email}` | 202 `{message}` chung (không lộ email tồn tại); 5 lần/15 phút theo (IP, email) |
| POST | `/api/auth/login` | như cũ | chưa xác thực → **403** `{status, error, message, code:"EMAIL_NOT_VERIFIED"}` |
| POST | `/api/admin/users/{id}/verify-email` | — (ADMIN) | chi tiết người dùng; audit `USER_VERIFY_EMAIL` |
`UserResponse` và chi tiết admin thêm `emailVerified:boolean`. Link email: `{frontendUrl}/verify-email?token=…`.
Staff (ADMIN/SUPER_ADMIN) không bị chặn bởi xác thực email.

Tài khoản đã tự xoá (email ẩn danh `deleted+{id}@deleted.local`, khoá vĩnh viễn):
- `AdminUserResponse.Row` (`GET /api/admin/users`) và `Detail` (`GET /api/admin/users/{id}`) luôn có `deleted:boolean`
  (boolean nguyên thuỷ, có cả khi bật NON_NULL) → FE hiện nhãn "Đã xoá" thay cho "Bị khoá" và ẩn nút mở khoá / Premium /
  hạn mức / vai trò.
- `PATCH /api/admin/users/{id}` với `locked:false` → **409** `"Tài khoản đã bị xoá theo yêu cầu, không thể mở khoá."`;
  với `premium`, `extractionDailyLimit` hoặc `clearLimit:true` → **409** `"Tài khoản đã bị xoá theo yêu cầu, không thể thay
  đổi."` (`locked:true` không kèm lý do mới là no-op nên vẫn 200; từ `177d764`, `locked:true` kèm `lockedReason` khác lý do hiện tại
  → **409** "không thể thay đổi", xem §6). `PUT /api/admin/users/{id}/role` → **409** cùng thông điệp "không thể thay đổi".
  Quy tắc bậc / tự thao tác (403) vẫn kiểm trước.

---

## 4. Mẹo nhớ bộ thủ + kiểm duyệt (C4, G2) — V25

`kanji_mnemonics(id uuid, kanji varchar(4), radical_no int NULL, mnemonic_vi varchar(500), source CHECK IN
('AI','TEMPLATE','USER'), status CHECK IN ('PENDING','APPROVED','REJECTED') DEFAULT 'PENDING', generated_model varchar(40),
created_by bigint NULL → users SET NULL, reviewed_by, reviewed_at, review_note varchar(500), created_at)`; partial unique
`(kanji) WHERE status='APPROVED'` (duyệt mẹo mới tự chuyển mẹo APPROVED cũ thành REJECTED với ghi chú "Thay bằng mẹo mới").
| Method | Path | Body / Query | Trả về |
|---|---|---|---|
| GET | `/api/kanji/{ch}/mnemonics` | — (USER) | `{kanji, approved:{id, mnemonicVi, source}\|null, mine:[{id, mnemonicVi, source, status, reviewNote, createdAt}]}` |
| POST | `/api/kanji/mnemonics/generate` | `{kanji:[…] ≤ 30}` | `{items:[{id, kanji, mnemonicVi, source:"AI"\|"TEMPLATE", status:"PENDING"}], reason}` — gọi ai-service `/radicals/cards` withMnemonic=true, lưu PENDING; bỏ qua chữ đã có mẹo PENDING của chính mình; **429** sau 10 lượt gọi ai-service / giờ / người (`app.rate-limit.mnemonic-generate.*`); **409** khi vượt 50 mẹo PENDING / người |
| POST | `/api/kanji/mnemonics` | `{kanji, mnemonicVi ≤ 300}` | 201 mẹo `USER` PENDING; 409 đã có 3 mẹo PENDING cho chữ này; **409** khi người dùng đã có 50 mẹo PENDING |
| GET | `/api/admin/mnemonics` | `status=PENDING, q?, page, size` | `AdminPage<{id, kanji, radical:{no,char,nameVi}\|null, mnemonicVi, source, status, authorEmail, generatedModel, createdAt, reviewedByEmail, reviewedAt, reviewNote}>` |
| PATCH | `/api/admin/mnemonics/{id}` | `{mnemonicVi}` (chỉ khi PENDING) | phần tử; audit `MNEMONIC_EDIT` |
| POST | `/api/admin/mnemonics/{id}/approve` · `/reject` | `{note?}` (reject: note bắt buộc) | phần tử; audit `MNEMONIC_APPROVE/REJECT`; thông báo tác giả `MNEMONIC_REVIEWED {kanji, status, note}`; 409 khi không còn PENDING |

`GET /api/admin/stats` thêm `pendingMnemonics`. `/api/nlp/radicals/cards` trả `mnemonicVi` = mẹo APPROVED nếu có
(`mnemonicSource:"approved"`), không thì mẫu (`"template"`).
Bổ sung 20/10 (chiều, `3350f71`): `generate` gửi `geminiModel` = `ai_model_primary` cho ai-service; `generated_model` ghi model thật
đã viết mẹo (có thể là model dự phòng), xem §8.

---

## 5. Cảnh báo mâu thuẫn + nguồn tri thức chuẩn (F2, G4) — V26, V28

- `extraction_items.conflicts jsonb DEFAULT '[]'`, `extraction_items.doc_reading varchar(200)`, `doc_meaning_en varchar(1000)`
  (giá trị tài liệu tự ghi, để kiểm lại sau).
- ai-service `/extract/analyze`: mọi item (vocab lẫn grammar, bất kể `warnConflicts`) luôn mang `docReading`, `docMeaningEn`,
  `docLevel` — cách đọc (cột kana / ruby / kana liền sau cụm), nghĩa EN in sẵn, tag cấp trên dòng mà TÀI LIỆU khai báo;
  `null` = tài liệu không ghi (cách đọc Sudachi / gloss từ điển không bao giờ nằm ở đây; `docLevel` tuỳ chọn của cả tài liệu
  không chép vào item). Worker lưu hai khoá đầu (cắt 200 / 1000) → kiểm lại mâu thuẫn đánh giá lại reading / meaning theo đúng
  khai báo; mục VOCAB của nguồn tri thức lấy `reading` từ `docReading`. Tên khoá trùng `ConflictItem` của `/extract/conflicts`.
- `ExtractionItemResponse.conflicts: [{field:"reading"\|"furigana"\|"meaning"\|"level"\|"grammar", document, reference,
  source, confidence, noteVi}]` (luôn là mảng). `job.stats.conflicts`, `stats.conflictsByField` từ ai-service.
- `POST /api/extractions/{id}/recheck-conflicts` (owner) và `POST /api/learning-paths/{id}/recheck-conflicts` → chạy lại
  ai-service `/extract/conflicts` với tham chiếu của nguồn chuẩn ACTIVE; trả job / lộ trình.
- `knowledge_sources(id uuid, title varchar(200), kind CHECK IN ('VOCAB','GRAMMAR','KANJI','OTHER'), level varchar(2) NULL,
  version int DEFAULT 1, source_name varchar(255), content text, entries jsonb DEFAULT '[]', text_meta jsonb, status CHECK IN
  ('ACTIVE','ARCHIVED'), uploaded_by → users SET NULL, created_at, updated_at)`.
| Method | Path | Body / Query | Trả về |
|---|---|---|---|
| GET | `/api/admin/knowledge-sources` | `kind?, status?, q?, page, size` | `AdminPage<{id, title, kind, level, version, sourceName, status, entryCount, uploadedByEmail, createdAt, updatedAt}>` |
| GET | `/api/admin/knowledge-sources/{id}` | — | phần tử + `contentPreview` (≤ 4000 ký tự) + `entries` (≤ 500: `{term, reading, meaning, level}`) |
| POST | `/api/admin/knowledge-sources` | multipart `file`\|`text`, `title`, `kind`, `level?` (≤ 2 MB / 20 trang) | 201 chi tiết; trích entries qua ai-service (bố cục list); audit `KNOWLEDGE_UPLOAD` |
| PUT | `/api/admin/knowledge-sources/{id}` | như POST | phiên bản mới (version+1); audit `KNOWLEDGE_UPDATE` |
| POST | `/api/admin/knowledge-sources/{id}/archive` · `/activate` | — | audit |
| DELETE | `/api/admin/knowledge-sources/{id}` | — (SUPER_ADMIN) | 204; audit `KNOWLEDGE_DELETE` |

---

## 6. Khiếu nại tài khoản (G1) — V27

`account_appeals(id bigserial, email varchar(255), user_id → users SET NULL, message varchar(1000), status CHECK IN
('OPEN','RESOLVED','DISMISSED') DEFAULT 'OPEN', action CHECK IN ('UNLOCK','NONE'), resolution_note varchar(500), resolved_by,
resolved_at, created_at)`; partial unique `(lower(email)) WHERE status='OPEN'`.
| Method | Path | Body / Query | Trả về |
|---|---|---|---|
| POST | `/api/auth/appeals` | `{email, message (10..1000)}` (permitAll) | 202 `{message}` chung; chỉ lưu khi email là tài khoản đang bị khoá; 5/giờ theo IP |
| GET | `/api/admin/appeals` | `status=OPEN, page, size` | `AdminPage<{id, email, userId, userLocked, lockedReason, message, status, action, resolutionNote, resolvedByEmail, resolvedAt, createdAt}>` |
| POST | `/api/admin/appeals/{id}/resolve` | `{action:"UNLOCK"\|"NONE", note?}` | phần tử; UNLOCK đi qua quy tắc bậc (ADMIN chỉ mở khoá USER); audit `APPEAL_RESOLVE` (+ `USER_UNLOCK`); UNLOCK tài khoản đã tự xoá → **409** `"Tài khoản đã bị xoá theo yêu cầu, không thể mở khoá."` (trước đây 400), khiếu nại vẫn OPEN để bác bỏ; tài khoản không còn tồn tại → 400 |
| POST | `/api/admin/appeals/{id}/dismiss` | `{note?}` | phần tử; audit `APPEAL_DISMISS` |
`GET /api/admin/stats` thêm `openAppeals`.

Bổ sung 20/10 (chiều):
- **V29** (`4232a4b`, STAFF-07): `ALTER TABLE account_appeals ADD COLUMN IF NOT EXISTS locked_reason_at_submit text` (nullable, không
  backfill, không CHECK; `IF NOT EXISTS` để cột đã có trên DB dùng chung không làm Flyway thất bại). `POST /api/auth/appeals` chụp
  lý do khoá hiện tại khi lưu khiếu nại (`''` = khoá không ghi lý do); gửi lặp khi còn OPEN không ghi đè.
- Phần tử `AppealResponse` thêm `lockedReasonAtSubmit` (string; vắng theo NON_NULL = khiếu nại gửi trước V29). `userLocked` /
  `lockedReason` vẫn là trạng thái **hiện tại** của tài khoản. FE: cột "Lý do khoá (lúc gửi)"; khiếu nại cũ hiện lý do hiện tại kèm
  nhãn; modal xử lý lấy trạng thái khoá + lý do từ chi tiết người dùng khi tra được.
- `PATCH /api/admin/users/{id}` `{locked:true, lockedReason:X}` trên tài khoản **đang khoá** (`177d764`): X không rỗng và khác lý do
  hiện tại → đổi `lockedReason`, giữ `lockedAt`, không thu hồi phiên lần nữa, audit `USER_LOCK_REASON` với detail
  `lockedReason {before, after}` (quy tắc bậc 403 kiểm trước). X rỗng / thiếu / trùng → no-op, không audit. Tài khoản đã tự xoá + lý do
  khác → 409 "không thể thay đổi". `lockedReasonAtSubmit` của khiếu nại đã gửi không đổi. Một PATCH đổi thêm trường khác (ví dụ
  `premium`) vẫn chỉ ghi một dòng audit, action `USER_LOCK_REASON`, detail có đủ các trường.
- Mốc thời gian trong response (`lockedAt`, `premiumUntil`…) làm tròn tới micro giây, trùng với lần đọc sau (`5a09e31`).

---

## 7. Dashboard cá nhân đúng nghĩa (A5)
`GET /api/reviews/activity?days=400&tz=Asia/Ho_Chi_Minh` → `{days:[{day:"YYYY-MM-DD", reviews:int, quizzes:int}],
dueToday:int (thẻ đã học có due_at trước cuối ngày theo tz), newCards:int (thẻ trong các bộ của mình chưa học lần nào),
learnedTotal:int, masteredTotal:int (interval ≥ 21), currentStreak:int, maxStreak:int}` (streak tính từ `review_logs` +
`quiz_results` theo ngày tz; hôm nay chưa học thì chuỗi tính tới hôm qua).

---

## 8. Thống kê AI cho admin (G6)
`GET /api/admin/stats` thêm:
- `ai: { engines:[{engine:"tesseract"\|"gemini"\|"pdf-text"\|"docx"\|"text"…, total, failed, lowConfidence, avgConfidence\|null, avgSeconds\|null}], enrich:{total, enriched, quota, error} }`
- `ocrSeries: [{date, ocrJobs, failed, lowConfidence, geminiFallback, errorRate}]` (đủ `days` phần tử)
- `health.engines: {sudachi, jmdict, jlpt, unihan, grammar, tesseract, gemini, radicals, kradfile, kanjivg, pitch, distractors, conflicts, mining, radicalCards, …: boolean}`

Chốt khi tích hợp (19/10): `ai` và `ocrSeries` tính trên job tạo trong cửa sổ `days` (múi `app.learning-path.zone`), chỉ job
DONE/FAILED (bỏ CANCELLED). `engine` = `text_meta.engine`, dòng cũ / hỏng trước khi có text_meta suy từ `source_type` (ảnh →
`tesseract`, txt → `text`, còn lại giữ nguyên). `ocrSeries` chỉ gồm nguồn ảnh / PDF, bỏ PDF có lớp chữ (`pdf-text`);
`geminiFallback` = engine `gemini`; `errorRate` = failed / ocrJobs dạng **0..1**, `null` khi ngày đó không có lượt OCR.
`enrich.total` = số job đã thật sự gọi dịch (`stats.enriched=true` hoặc có `stats.enrichReason`). **`health.engines` nằm ở
`GET /api/admin/health` (trường `engines`)**, không nằm trong `/api/admin/stats`, để thống kê không chờ ai-service; ai-service tắt →
`aiService:"down"` và `engines:{}`.

Bổ sung 20/10 (chiều, `3350f71`): khoá `ai_model_primary` có tác dụng.
- `GET /api/admin/health` thêm `aiModels: {default: string|null, allowed: string[]}` lấy từ `geminiModel` / `geminiModels` của
  ai-service `/api/extract/health` (tối đa 50 tên, mỗi tên ≤ 64 ký tự); `null` khi ai-service tắt hoặc bản cũ chưa trả danh sách.
  `PUT /api/admin/settings` vẫn nhận mọi tên ≤ 40 ký tự (kể cả tên ngoài danh sách); trang Cấu hình gợi ý `allowed` và cảnh báo
  (so không phân biệt hoa thường).
- Backend đọc `ai_model_primary` lúc gọi (`SettingsService.aiModelPrimary()`, trống / lỗi → không gửi) và gửi kèm:
  `POST /api/extract/text` trường form `gemini_model`; `POST /api/extract/enrich` JSON `geminiModel`; `POST /api/radicals/cards` JSON
  `geminiModel` (chỉ khi `withMnemonic`). `/radicals/cards` trả thêm `model` (model thật đã viết mẹo, `null` khi không có mẹo từ
  Gemini); backend ghi vào `kanji_mnemonics.generated_model`.
- ai-service chỉ nhận model trong `allowed_models()` = `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `GEMINI_ALLOWED_MODELS` (biến môi
  trường mới, danh sách cách nhau dấu phẩy) và `KNOWN_MODELS` (`gemini-3.8-flash`, `gemini-3.7-flash`). Tên lạ → dùng `GEMINI_MODEL`,
  ghi log một lần, **không** trả 422. Chuỗi khi lỗi: model được chọn (thử lại 429 / 503) → `GEMINI_MODEL` → `GEMINI_FALLBACK_MODEL`;
  model được chọn bị Google trả 404 thì lượt đó dùng `GEMINI_MODEL` và bỏ qua model đó 30 phút; cầu dao quota theo từng model; 404
  của chính `GEMINI_MODEL` vẫn báo lỗi như cũ. `/api/extract/health` thêm `geminiModel`, `geminiModels`.

---

## 9. Câu ví dụ i+1 (C6)
| Method | Path | Body / Query | Trả về |
|---|---|---|---|
| GET | `/api/extractions/{id}/i-plus-one` | `assumeLevelKnown=true, limit=50` | `{items:[{sentence, target:{lemma, surface, reading, level, meaningEn, readingSegments}, unknownCount, knownCount, length, score, itemId\|null}], knownCount}` — knownLemmas = term các thẻ của mình có `reps ≥ 2` hoặc `interval ≥ 7` |
| POST | `/api/extractions/{id}/i-plus-one/apply` | `{itemId, sentence}` | item đã cập nhật `example`; job của lộ trình: khoá dòng lộ trình, **409** khi lộ trình không còn DRAFT (như sửa mục lộ trình) |

---

## 10. Lộ trình: kiểm tra chương chưa đạt, chương rỗng (D4) — bổ sung 20/10 (chiều)
Không cần migration (cột `notifications.type` không có CHECK). `8de6ea1`, `657d383`.
- `GET /api/learning-paths/{id}` (lộ trình ACTIVE) thêm `quizPassPct: int` = `learning_path_quiz_pass_pct`, đọc mỗi request (Admin
  đổi là có hiệu lực ngay). Danh sách và `today-summary` **không** trả trường này.
- `chapters[].state` thêm giá trị `"empty"`: chương không còn thẻ nào trong lịch (xoá bộ thẻ hoặc từng thẻ) mà chưa qua kiểm tra.
  Thứ tự: `passed > empty > review > current > locked > open`; chương đã qua rồi mới mất thẻ vẫn `passed`. Kiểm tra chương rỗng → 409.
  Client phải xử lý giá trị mới (FE `chapterStateOf` tự suy cả `"empty"` khi response kiểu 1.0 thiếu `state`).
- `completion.chaptersTotal` chỉ đếm chương đã qua hoặc ra được đủ min(10, số thẻ) câu nghĩa (không đếm `"empty"`, chương 1 thẻ,
  chương mọi thẻ cùng một nghĩa), ở cả `GET /{id}` và danh sách.
- Thông báo mới `LEARNING_PATH_CHAPTER_RETRY`, payload `{pathId, pathTitle, chapterId, chapterTitle, pct, passPct}`: chỉ gửi ở lượt
  kiểm tra chương **đầu tiên** dưới ngưỡng của mỗi chương (trượt lần sau không gửi thêm; đạt thì gửi `LEARNING_PATH_CHAPTER_PASSED`
  như cũ). Vẫn chỉ gắn nhãn, không khoá chương sau.
- FE: dải "Chưa đạt N% — Làm lại" khi `quizBestPct < quizPassPct` (Admin hạ ngưỡng sau lần làm thì ghi "Chưa qua kiểm tra"); không
  hiện cho chương `locked` / `empty`. Trạng thái "Trống" có ghi chú "Không còn thẻ nào trong lịch".
- Kiểm tra chương luôn là lượt exam của chương: §1.4.
