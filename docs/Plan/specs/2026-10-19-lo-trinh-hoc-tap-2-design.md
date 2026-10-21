# Spec: Lộ trình học tập 2.0 — lịch thích ứng, phiên học hợp nhất, kiểm tra chương, bổ khuyết điểm yếu

Ngày 19/10/2026 · nhánh `backend-feature-learnmode` · trạng thái: **bản thiết kế, đang triển khai**.
Nền: [2026-10-14-lo-trinh-hoc-tap-design.md](2026-10-14-lo-trinh-hoc-tap-design.md) (bản 1.0 đã chạy) và
[../../LEARNING_PATH.md](../../LEARNING_PATH.md). Yêu cầu gốc: mục 1.2.1 (f) "Xem lộ trình học đề xuất", (e) "Ôn tập theo lịch
… đo thời gian phản xạ", (f) "Thống kê ma sát trí nhớ", (a) dashboard cá nhân.

## 0. Vì sao cần bản 2.0 (lỗ hổng đã xác nhận trong code 1.0)

| # | Vấn đề | Nơi |
|---|---|---|
| LP-1 | `HousekeepingJob` xoá job bóc tách > 90 ngày **kể cả job của lộ trình** → bản nháp mất hết thẻ, lộ trình đang học mất số từ vựng/ngữ pháp | `ExtractionJobRepository.deleteFinishedBefore` |
| LP-2 | "Hôm nay" chỉ có **thẻ mới** theo vị trí; thẻ đến hạn ôn của chính lộ trình không nằm trong phiên | `TodayPanel.tsx`, `LearningPathScheduler.tasksFor` |
| LP-3 | Tiến độ = thẻ có khoảng ôn ≥ 21 ngày → lộ trình 7–30 ngày luôn ~0 %, chương không bao giờ "xong" | `deckUtils.calcDeckProgress`, `ChapterTimeline` |
| LP-4 | "Nợ: N thẻ" chỉ là nhãn; không học bù, không cân lại lịch khi học trễ | `PathActiveView` |
| LP-5 | Việc theo **vị trí thẻ** trong bộ: sửa/thêm/xoá thẻ sau khi kích hoạt làm dải trôi | `tasksFor`, `sliceRange` |
| LP-6 | FAILED không chạy lại được; DRAFT không có "Dịch lại nghĩa" khi Gemini hết quota | `PathFailedPanel`, `PathDraftEditor` |
| LP-7 | `GET /api/learning-paths` N+1 (job + chương từng lộ trình) | `LearningPathService.list` |
| LP-8 | Số ngày mặc định cứng 30; không gợi ý theo số thẻ; không trần thẻ/ngày; không tính độ khó so với trình độ | `roadmapUtils.DEFAULT_DAYS`, `allocate` |
| LP-9 | Trang Tổng quan không có "hôm nay của lộ trình" | `DashboardPage` |
| LP-10 | Không có nhắc học, không báo khi bản nháp sẵn sàng (bóc tách mất 2–4 phút) | — (hệ thống thông báo đã có từ 17/10) |

### 0.1 Bổ sung sau rà soát toàn mã nguồn (19/10, chiều)

| # | Vấn đề | Cách sửa (bắt buộc trong 2.0) |
|---|---|---|
| LP-10 | `DELETE /{id}` khi PROCESSING xoá job dưới chân worker (`LearningPathService.delete` không kiểm trạng thái); hạn mức đếm theo số dòng job nên xoá = hoàn lại lượt; `create()` không transaction → job mồ côi khi lưu path lỗi | PROCESSING → 409 "Đang xử lý, hãy chờ xong rồi xoá"; xoá lộ trình **giữ dòng job** (status `CANCELLED`, xoá trắng `extracted_text`, item CASCADE theo job vẫn xoá được bằng `items.deleteByJobId`) để hạn mức không bị hoàn; `create()` bọc `TransactionTemplate` cho cặp job + path |
| LP-11 | Múi giờ: `startDate` mặc định theo giờ server; modal tạo không gửi `startDate`; PATCH/activate/merge-up trả `today(null)` theo server nên FE phải gọi thêm `refreshPath()` vá | Modal luôn gửi `startDate = dayKey(new Date())` (ô "Ngày bắt đầu" có sẵn giá trị); mọi endpoint ghi (PATCH, chapters, merge-up, items, activate, rebalance, retry, enrich, complete) nhận `?date=` và trả response theo ngày đó; FE bỏ `refreshPath()` vá |
| LP-12 | `PathDraftEditor` gộp 3 ô vào một `src` → blur lưu một ô làm reset hai ô kia đang gõ | Tách state `{src, value}` theo từng ô, chỉ reset ô có `src` khác server (như `ChapterDraftCard`) |
| LP-13 | `activate`/`mergeUp`/`patchItems`/`delete` không khoá dòng lộ trình → 2 activate song song tạo 2 thư mục + 2 bộ bộ thẻ | `LearningPathRepository.lockByIdAndUserId` (`@Lock(PESSIMISTIC_WRITE)`) dùng trong mọi thao tác ghi; FE guard bằng `useRef` ngoài state `activating`; IT `activate_concurrent_single_folder` |
| LP-14 | `ChapterTimeline` "Học bộ này" không kèm `?path=`; ngày rỗng link về `/` | Mọi nút học từ lộ trình đi qua `/session`; ngày nghỉ/ôn tập hiện "N thẻ đến hạn" + nút ôn |
| LP-15 | Sửa bộ thẻ thuộc lộ trình không cảnh báo | `DeckEditorPage` hiện dải "Bộ thẻ này thuộc lộ trình X; thẻ thêm mới sẽ không có trong lịch" khi thư mục có `metadata.learningPathId` (đọc từ `/folders`) |
| LP-16 | Sidebar badge và RoadmapPage gọi `/api/learning-paths` trùng nhau | Hook `useTodaySummary()` dùng chung (`/today-summary`) cho badge sidebar + widget Tổng quan + thẻ danh sách |
| LP-17 | `pipeline._finish` cắt 600 từ theo tần suất toàn tài liệu **sau** khi gộp chương → chương sau mỏng | Khi `splitChapters`: cap chia theo tỉ lệ số ứng viên mỗi chương (mỗi chương tối thiểu 20), `MAX_VOCAB` cho lộ trình nâng lên 900 (ai-service, test `test_pipeline.py`) |

## 1. Mục tiêu

Một lộ trình **biết người học đang ở đâu** và **tự điều chỉnh**:

1. **Phiên học hợp nhất mỗi ngày** = thẻ mới theo kế hoạch + thẻ đến hạn ôn trong lộ trình + thẻ nợ (học bù), một nút "Bắt đầu".
2. **Lịch theo thẻ (card id), không theo vị trí**; chia ngày có **trần thẻ/ngày**, **trọng số độ khó** theo cấp JLPT so với trình độ người học, **ngày nghỉ trong tuần**, và **dự báo khối lượng ôn** (mô phỏng SRS) để ngày sau không bị dồn.
3. **Tự cân lại** khi học trễ (chia phần chưa học vào các ngày còn lại, hoặc kéo dài), **gợi ý số ngày** từ số thẻ.
4. **Kiểm tra cuối chương** (dùng lại Quiz): đạt ngưỡng (mặc định 80 %) mới tính chương đã qua; chương có trạng thái.
5. **Hai thước đo tiến độ**: đã học (có ít nhất một lần chấm) và đã thuộc (khoảng ôn ≥ 21 ngày); lộ trình "Hoàn thành".
6. **Đo thời gian phản xạ** mỗi lần chấm → "ma sát trí nhớ" (thẻ phản xạ chậm bất thường) và **điểm yếu** (hay quên, ease thấp, sai quiz).
7. **Lộ trình bổ khuyết** sinh từ điểm yếu (không cần tài liệu): gom thẻ yếu theo cấp / loại / chữ Hán chung, lịch 5–7 ngày.
8. **Đề xuất "học gì tiếp"** (F3) trên Tổng quan và trang lộ trình; **thông báo** bản nháp sẵn sàng / thất bại / nhắc mỗi sáng / qua chương / hoàn thành.
9. Sửa trọn LP-1 … LP-10.

Không làm (ghi rõ để không lan): FSRS đúng công thức (giữ SM-2 cải tiến hiện có, chỉ **dự báo** bằng chuỗi khoảng ôn),
GraphRAG/Neo4j, nhắc qua email (dùng thông báo trong app), chỉnh sửa thẻ ngay trong lộ trình.

## 2. Dữ liệu — `V20__learning_paths_v2.sql`

```sql
-- Lịch theo thẻ: một dòng cho mỗi thẻ đã chốt khi kích hoạt. Thẻ bị xoá -> dòng mất (CASCADE), lịch không trôi.
CREATE TABLE learning_path_cards (
  id            bigserial PRIMARY KEY,
  path_id       uuid NOT NULL REFERENCES learning_paths (id) ON DELETE CASCADE,
  chapter_id    uuid NOT NULL REFERENCES learning_path_chapters (id) ON DELETE CASCADE,
  card_id       varchar(255) NOT NULL REFERENCES flashcards (id) ON DELETE CASCADE,
  seq           integer NOT NULL,          -- thứ tự trong lộ trình (chương rồi thứ tự tài liệu)
  scheduled_day integer NOT NULL,          -- ngày học thứ mấy (1-based, chỉ đếm ngày học)
  weight        numeric(3,1) NOT NULL DEFAULT 1.0,  -- 1.0 dễ/ngang cấp, 1.5 trên cấp, 1.2 chưa rõ cấp
  UNIQUE (path_id, card_id)
);
CREATE INDEX idx_lp_cards_day ON learning_path_cards (path_id, scheduled_day);
CREATE INDEX idx_lp_cards_card ON learning_path_cards (card_id);       -- FK CASCADE từ flashcards: xoá bộ thẻ không quét cả bảng
CREATE INDEX idx_lp_cards_chapter ON learning_path_cards (chapter_id); -- FK CASCADE từ learning_path_chapters

ALTER TABLE learning_paths
  ADD COLUMN daily_cap    integer NOT NULL DEFAULT 30 CHECK (daily_cap BETWEEN 5 AND 200),
  ADD COLUMN study_days   varchar(7) NOT NULL DEFAULT '1111111' CHECK (study_days ~ '^[01]{7}$' AND study_days <> '0000000'), -- T2..CN
  ADD COLUMN reminder     boolean NOT NULL DEFAULT true,
  ADD COLUMN completed_at timestamptz(6),
  ADD COLUMN last_rebalanced_at timestamptz(6);
ALTER TABLE learning_paths DROP CONSTRAINT learning_paths_source_type_check;
ALTER TABLE learning_paths ADD CONSTRAINT learning_paths_source_type_check
  CHECK (source_type IN ('text','image','pdf','docx','txt','remedial'));

ALTER TABLE learning_path_chapters
  ADD COLUMN quiz_best_pct   integer,
  ADD COLUMN quiz_passed_at  timestamptz(6);

-- Đo thời gian phản xạ + gắn lượt ôn với lộ trình (phân tích hiệu quả)
ALTER TABLE review_logs
  ADD COLUMN reaction_ms integer CHECK (reaction_ms IS NULL OR reaction_ms BETWEEN 0 AND 600000),
  ADD COLUMN path_id uuid REFERENCES learning_paths (id) ON DELETE SET NULL;
CREATE INDEX idx_review_logs_path ON review_logs (path_id) WHERE path_id IS NOT NULL;

-- Cấu hình chung (Admin > Cấu hình): mở rộng CHECK khoá
ALTER TABLE app_settings DROP CONSTRAINT app_settings_key_check;
ALTER TABLE app_settings ADD CONSTRAINT app_settings_key_check CHECK (key IN (
  'extraction_daily_limit_free','extraction_daily_limit_premium','announcement','registration_open',
  'learning_path_daily_cap_default','learning_path_quiz_pass_pct','learning_path_reminder_hour'));
INSERT INTO app_settings (key, value) VALUES
  ('learning_path_daily_cap_default','30'), ('learning_path_quiz_pass_pct','80'), ('learning_path_reminder_hour','7')
ON CONFLICT (key) DO NOTHING;
```

Dọn dẹp (LP-1): `deleteFinishedBefore` thêm `AND purpose <> 'learning_path'`; job lộ trình chỉ bị **xoá trắng `extracted_text`**
sau 90 ngày khi lộ trình đã ACTIVE (`clearTextOfOldPathJobs`), bản nháp giữ nguyên.

## 3. Thuật toán (`LearningPathScheduler`, thuần, unit test)

### 3.1 Trọng số thẻ
`weight(card, userLevel)`: cấp thẻ ≤ cấp người học → 1.0; cao hơn 1 bậc → 1.3; cao hơn ≥ 2 bậc → 1.5; không rõ → 1.2. Ngữ pháp +0.2.

### 3.2 Chia ngày theo thẻ (`plan`)
Đầu vào: danh sách thẻ theo chương (đã `seq`), `D` ngày học, `cap` (trần tải/ngày, tính theo **tải** = mới + ôn dự báo).
1. Quota tải mỗi ngày `q = max(ceil(Σweight / D), 1)`.
2. Duyệt thẻ theo `seq`, gán ngày `d` hiện tại; chuyển sang ngày sau khi `newWeight(d) ≥ q` **hoặc** `newWeight(d) + forecastReviews(d) ≥ cap`; không để một chương bị chia nhỏ quá mức: chương dưới `q/2` trọng số được **gộp chung ngày** với chương kế; chương **đang học dở** chỉ còn đuôi `≤ max(1 thẻ, q/4)` thì học nốt trong ngày (chỉ áp dụng cho chương đã bắt đầu — thẻ mở đầu chương mới luôn chịu kiểm tra `q`/`cap`, nếu không chuỗi chương 1–3 thẻ của lộ trình bổ khuyết bị dồn hết vào một ngày).
3. Nếu hết `D` ngày mà còn thẻ → nới `q` (×1.15) và chạy lại (tối đa 10 vòng); nếu vẫn thừa → báo `overflow` (UI gợi ý tăng ngày hoặc cap).
4. Kết quả: `scheduled_day` cho từng thẻ; dải ngày từng chương suy ra `min/max(scheduled_day)`.

### 3.3 Dự báo khối lượng ôn (`forecast`)
Chuỗi khoảng ôn kỳ vọng của SM-2 hiện tại khi chấm "Tốt": 1 → 3 → 7 → 17 → 40 ngày (ease 2.5, mean reversion).
`forecastReviews(d) = Σ_{k ∈ {1,3,7,17,40}} newCount(d − k)` (chỉ các ngày trong lộ trình) × `retention` 0.9.
Khi lộ trình đã chạy: dùng **lịch thật** (`reviews.due_at` của thẻ trong lộ trình) cho các ngày tới, dự báo chỉ cho thẻ chưa học.
Trả `[{dayIndex, date, newCount, predictedReviews, load, overCap}]` → biểu đồ cột CSS trên trang lộ trình.

### 3.4 Cân lại lịch (`rebalance`)
Thẻ "nợ" = `scheduled_day < hôm nay` và chưa có `reviews`. `rebalance(extend)`:
- `extend=false`: chia đều thẻ nợ + thẻ chưa tới ngày vào `[hôm nay, ngày cuối]` theo 3.2 (tôn trọng cap; cho phép vượt `q`).
- `extend=true`: giữ `q` cũ, kéo `total_days` tới khi đủ chỗ.
Lưu `last_rebalanced_at`. UI: khi nợ > `cap` hoặc nợ > 20 % thẻ còn lại → dải "Bạn đang trễ N thẻ · [Học bù] [Cân lại lịch] [Kéo dài]".

### 3.5 Ngày học / ngày nghỉ
`study_days` mặc định `1111111`. `dateForDay(start, idx, mask)` đếm chỉ ngày được bật; `dayIndexFor(start, date, mask)` trả
`{index, rest:boolean}`. Ngày nghỉ: "Hôm nay nghỉ theo lịch — vẫn có N thẻ đến hạn nếu muốn ôn". Toàn bộ `days[]`, `today`
đi qua hai hàm này (frontend `roadmapUtils` có bản sao thuần + selfcheck).

### 3.6 Gợi ý số ngày
`suggestDays(cards | Σweight, userCap)` = số ngày **nhỏ nhất** `D ∈ [max(3, ceil(Σweight / 25)), 90]` mà lịch **phẳng** theo quota
(chia đều như `plan` khi không vướng trần, thử cả hai cách ngắt chương) có tải ≤ `cap` ở mọi ngày — khi đó `plan(cards, D, cap)` chắc
chắn không `overflow` (ứng viên vòng 0 trùng lịch phẳng). Không dùng điều kiện yếu "`plan` không overflow": `plan` có thể vừa trần bằng
lịch lồi lõm (60 thẻ / 3 ngày / trần 30 → {30, 3, 27}). Lý do đổi: `cap` áp lên **tải** = mới + ôn dự báo (3.2, S-02) nên công thức cũ
`ceil(Σweight / min(cap, 25))` (25 thẻ mới/ngày) với trần mặc định 30 luôn cho overflow ngay khi "Áp dụng" (100 thẻ / 4 ngày: tải 70);
tải ổn định ≈ 3.7–5.5 × thẻ mới/ngày nên trần 30 ≈ 5–8 thẻ mới/ngày (60 thẻ → 6 ngày, 100 → 13, 150 → 23, 300 → 54). Quét tuyến tính
(vừa trần không đơn điệu theo `D`: mốc k = 17, 40 bật thêm nguồn ôn). Không `D ≤ 90` nào vừa → 90 và UI cảnh báo đỏ gợi ý tăng trần;
`cap ≤ 0` (không trần) → `ceil(Σweight / 25)`. Bản chỉ có `Σweight` mô phỏng `ceil(Σweight)` thẻ một chương (hơi dè dặt khi thẻ nặng
hơn 1.0). Hiện ở DRAFT "Gợi ý N ngày (~k thẻ/ngày) [Áp dụng]"; cảnh báo đỏ khi `plan` báo `overflow` với `D` người dùng chọn.

### 3.7 Điểm yếu & ma sát trí nhớ (`InsightService`, truy vấn + hàm thuần)
Trên `reviews` + `review_logs` 30 ngày + `quiz_results/attempts`:
- **Hay quên**: ≥ 3 lần `again` trong 14 ngày hoặc `ease < 1.8`.
- **Ma sát**: `reaction_ms` trung vị của thẻ > 2 × trung vị cá nhân (≥ 5 mẫu) và > 4 000 ms.
- **Sai quiz**: ≥ 2 lần sai cùng thẻ (từ `quiz_attempts.answers` vs bản chụp đề) trong 30 ngày.
Điểm yếu = hợp của ba tập, mỗi thẻ kèm lý do. Gom: theo cấp JLPT, loại (từ vựng/ngữ pháp), **chữ Hán chung** (ký tự CJK trong `term`),
theo bộ thẻ. Trả `GET /api/insights` (xem §4).

### 3.8 Lộ trình bổ khuyết (`remedial`)
Từ điểm yếu: tạo thư mục "Bổ khuyết dd/MM", mỗi nhóm một bộ thẻ (clone thẻ: term/reading/meaning/segments/hanViet/level/kind,
`sourceDeckId` giữ nguồn), chương = nhóm, `source_type='remedial'`, không có job; lịch theo 3.2 với `D` người chọn (gợi ý 5–7).
Tối đa 150 thẻ / lộ trình bổ khuyết; dưới 8 thẻ yếu → không đề xuất.

### 3.9 "Học gì tiếp" (F3)
`GET /api/insights/next` trả danh sách gợi ý có thứ tự: (1) phiên hôm nay của lộ trình ACTIVE (số thẻ), (2) thẻ đến hạn ngoài lộ
trình, (3) thẻ nợ, (4) điểm yếu ≥ 8 thẻ → đề xuất bổ khuyết, (5) chương kế tiếp chưa mở, (6) bộ thẻ Thư viện cùng cấp JLPT chưa học
(tối đa 3). Mỗi mục: `{kind, title, count, to}`.

## 4. API

### 4.1 Lộ trình (mở rộng `/api/learning-paths`, USER)
| Method | Path | Ghi chú |
|---|---|---|
| GET | `/` | như cũ + `today{newCount, dueCount, behindCount}` cho ACTIVE; **1 truy vấn batch** cho job/chương/thẻ (LP-7) |
| GET | `/{id}` | thêm `dailyCap, studyDays, reminder, completedAt, completion{learned, mastered, total, learnedPct, masteredPct, chaptersPassed, chaptersTotal, done}`, `chapters[].{state: locked\|current\|review\|passed, learned, mastered, quizBestPct, quizPassedAt, cardIds?}`, `today{date, dayIndex, state(before\|during\|rest\|after), newCount, dueCount, behindCount, tasks[] (giữ cho tương thích), suggestions[]}`, `forecast[]` (chỉ ACTIVE) |
| PATCH | `/{id}` | thêm `dailyCap?, studyDays?, reminder?`; đổi `totalDays/startDate/studyDays/dailyCap` ở ACTIVE → chạy `plan` lại cho thẻ **chưa học** |
| GET | `/{id}/session?kind=today\|catchup\|due\|chapter&chapterId=` | `{kind, cards:[{cardId, deckId, term, reading, readingSegments, meaning, hanViet, level, kind, mode:new\|due\|cram}], counts}`; `today` = due → nợ (tối đa cap) → mới hôm nay; thẻ **chưa đến hạn** đi kèm `mode=cram` |
| POST | `/{id}/rebalance` | `{extend:boolean}` → 200 lộ trình; 409 nếu không ACTIVE |
| POST | `/{id}/retry` | FAILED: job còn `extracted_text` → chạy lại ANALYZE; không còn → 400 "Hãy tạo lại"; **không tốn lượt hạn mức** |
| POST | `/{id}/enrich` | DRAFT/ACTIVE: dịch lại nghĩa (ủy quyền `ExtractionWorker.runEnrich`), cách nhau ≥ 5 phút |
| POST | `/{id}/chapters/{cid}/quiz` | tạo lượt quiz **exam** trên bộ của chương (size = min(10, thẻ)); trả `AttemptState`; khi nộp đạt ≥ `learning_path_quiz_pass_pct` → `quiz_passed_at` (qua `QuizSubmittedEvent`) |
| POST | `/{id}/complete` | người dùng chốt hoàn thành (chỉ khi `learnedPct = 100`); hoặc tự đặt khi qua ngày cuối và `learnedPct = 100` |
| POST | `/remedial` | `{days, groupBy: level\|kind\|kanji\|deck}` → 201 lộ trình ACTIVE `source_type=remedial` |
| GET | `/today-summary` | Tổng quan: `[{pathId, title, dayIndex, totalDays, newCount, dueCount, behindCount, state}]` |

### 4.2 Insights (mới, USER): `/api/insights`
| Method | Path | Trả về |
|---|---|---|
| GET | `/weaknesses` | `{total, cards:[{cardId, deckId, term, reading, meaning, level, reasons[], againCount, ease, medianReactionMs, quizWrong}], groups:{level:[], kind:[], kanji:[], deck:[]}, canRemedial}` |
| GET | `/friction` | thẻ phản xạ chậm: `[{cardId, term, medianReactionMs, personalMedianMs, samples}]` (F4) |
| GET | `/next` | §3.9 |

### 4.3 Ôn tập (sửa nhỏ, tương thích ngược)
`POST /api/reviews` body thêm `reactionMs?` (0–600000) và `pathId?`; ghi vào `review_logs`. `GET /api/reviews` không đổi.

### 4.4 Thông báo (loại mới, không cần migration)
`LEARNING_PATH_READY {pathId, title}`, `LEARNING_PATH_FAILED {pathId, title, reason}`, `LEARNING_PATH_REMINDER {pathId, title,
newCount, dueCount, behindCount}` (job `@Scheduled` mỗi giờ, gửi khi tới `learning_path_reminder_hour` theo `Asia/Ho_Chi_Minh`,
mỗi lộ trình tối đa 1 lần/ngày, chỉ khi `reminder = true` và có việc; trước ngày học 1 và ngày nghỉ theo `study_days` thì không nhắc — chốt khi làm job, xem LEARNING_PATH.md mục 11), `LEARNING_PATH_CHAPTER_PASSED {pathId, chapterTitle, pct}`,
`LEARNING_PATH_COMPLETED {pathId, title}`.

### 4.5 Admin
`AdminStatsResponse.learningPaths` → `{total, active, completed, failed, remedial}`; trang Tổng quan admin hiện thêm dòng này.
Cấu hình: 3 khoá mới ở `/admin/settings` (SUPER_ADMIN sửa).

## 5. Backend — tệp chạm tới
| Tệp | Việc |
|---|---|
| `V20__learning_paths_v2.sql` | §2 |
| `model/LearningPathCard` + repo | mới; truy vấn: theo path & ngày, chưa học (`NOT EXISTS reviews`), đếm nhóm |
| `model/LearningPath`, `LearningPathChapter` | cột mới |
| `service/LearningPathScheduler` | `weight`, `plan`, `forecast`, `rebalance`, `dateForDay/dayIndexFor(mask)`, `suggestDays` (thuần) |
| `service/LearningPathService` | activate → ghi `learning_path_cards`; `session`, `rebalance`, `retry`, `enrich`, `chapterQuiz`, `complete`, `remedial`, `todaySummary`; `list` batch; `toResponse` mới; `onQuizSubmitted`; `completion` |
| `service/LearningPathReminderJob` | `@Scheduled(cron = "0 5 * * * *")` nhắc theo giờ cấu hình |
| `service/InsightService` | §3.7, §3.9 |
| `service/ReviewService`, `ReviewRepository.log` | `reactionMs`, `pathId` |
| `service/QuizAttemptService` | publish `QuizSubmittedEvent(uid, deckId, attemptId, score, total)` trong `close()` |
| `service/HousekeepingJob`, `ExtractionJobRepository` | LP-1 |
| `service/SettingsService`, `SettingsResponse`, `AdminSettings*` | 3 khoá mới |
| `controller/LearningPathController`, `InsightController` | §4 |
| `dto/learningpath/*` | response mở rộng (NON_NULL giữ tương thích) |
| Test | `LearningPathSchedulerTest` (+plan/forecast/rebalance/mask/suggest), `LearningPathIT` (+session/rebalance/retry/enrich/quiz gate/complete/remedial/today-summary/housekeeping), `InsightIT`, `ReviewSrsIT` (+reactionMs) |

## 6. Frontend — tệp chạm tới
| Tệp | Việc |
|---|---|
| `roadmapUtils.ts` | `dateForDay/dayIndexFor(mask)`, `suggestDays`, `loadLabel`, `weekdayMask` helpers (+selfcheck) |
| `pages/RoadmapDetailPage.tsx` | nhận response mới; hành động rebalance/retry/enrich/complete |
| `components/PathActiveView.tsx` | bố cục mới: `TodaySessionPanel` (3 nhóm + 1 nút Bắt đầu, nút Học bù), `BehindBanner`, `WorkloadChart` (forecast, cột CSS, bảng ẩn cho screen reader), `ProgressSummary` (2 thước đo + vòng tròn), `ChapterTimeline` (trạng thái, Kiểm tra chương, điểm quiz), `PathSettingsDrawer` (trần/ngày, ngày học trong tuần, nhắc) |
| `components/PathDraftEditor.tsx` | gợi ý số ngày + cảnh báo tải, "Dịch lại nghĩa" khi `enrichReason`, chọn trần/ngày & ngày học trước khi kích hoạt |
| `components/PathFailedPanel.tsx` | "Chạy lại" (retry) bên cạnh "Tạo lại" |
| `pages/StudyPage.tsx` | chế độ `?session=today\|catchup\|due\|chapter&path=&chapter=`: tải `/session`, hàng đợi đa bộ thẻ, nhãn Mới/Ôn/Luyện, **đo thời gian phản xạ** (từ lúc hiện thẻ tới lúc chấm) gửi `reactionMs` + `pathId`; `?range=` cũ vẫn chạy |
| `pages/RoadmapPage.tsx` | thẻ "Học gì tiếp" (`/insights/next`) + "Điểm yếu" (`/insights/weaknesses`) với nút "Tạo lộ trình bổ khuyết" (modal chọn ngày, cách gom) |
| `features/dashboard/components/TodayPathWidget.tsx` | trên `/`: lộ trình đang học, N thẻ hôm nay, nợ, nút Bắt đầu; dùng `/today-summary` |
| `features/profile/components/FrictionTab.tsx` (hoặc mục trong QuizHistoryTab) | bảng thẻ phản xạ chậm (F4) |
| `services/learningPathService.ts`, `insightService.ts`, `types/api.types.ts` | API mới |
| `services/notificationService.ts` | câu chữ cho 5 loại thông báo mới |
| Admin: `AdminSettingsPage`, `AdminDashboardPage` | 3 khoá; thống kê lộ trình |

## 7. Trạng thái & quy tắc
- `PROCESSING → DRAFT → ACTIVE (→ completed_at) | FAILED (→ retry → PROCESSING)`.
- Remedial: tạo thẳng ACTIVE (không có DRAFT vì không có job); xoá như lộ trình thường (giữ bộ thẻ).
- `session.today` khi `state = rest`: chỉ thẻ đến hạn; `state = after`: thẻ nợ + đến hạn; `before`: rỗng + lời nhắc.
- Thẻ trong lộ trình bị xoá khỏi bộ → biến mất khỏi lịch (CASCADE); chương không còn thẻ → `state = passed` nếu đã qua quiz, không thì "trống".
- Mọi PATCH đổi lịch ở ACTIVE chỉ đụng thẻ **chưa học** (có `reviews` thì giữ `scheduled_day` cũ) — lịch sử không bị viết lại.
- Reaction time chỉ là tín hiệu phụ: **không** đổi thuật toán SRS (giữ SM-2 hiện tại), chỉ dùng cho insight.

## 8. Test case chính
| ID | Kiểm | Kỳ vọng |
|---|---|---|
| S-01 | `plan` 60 thẻ, 6 ngày, cap 30 | mỗi ngày ~10 trọng số, không ngày nào > cap, chương liền mạch |
| S-02 | `plan` với dự báo: 100 thẻ/4 ngày cap 30 | ngày 2–4 bị cap chặn → `overflow` → UI báo |
| S-03 | `forecast` 10 thẻ/ngày × 7 ngày | ngày 8 dự báo = (10 + 10 + 10) × 0.9 = **27.0** (k = 1, 3, 7; retention nhân đúng một lần — bản cũ ghi "9 + 9 + 9 × 0.9" là nhân hai lần) |
| S-04 | `rebalance(extend=false)` sau khi nợ 20 thẻ ngày 3/10 | 20 thẻ chia vào ngày 3..10; thẻ đã học không đổi |
| S-05 | `dayIndexFor` với mask `1111100`, bắt đầu thứ 6 | thứ 7/CN trả `rest`, thứ 2 là ngày 2 |
| IT-01 | activate ghi `learning_path_cards` đúng `seq`, ngày; xoá 1 thẻ trong bộ → session không còn thẻ đó, không 500 | |
| IT-02 | `/session?kind=today` ngày 1: chỉ thẻ mới; chấm 3 thẻ → ngày 2 (date=) có 3 thẻ due + thẻ mới | |
| IT-03 | `retry` FAILED có text → PROCESSING → DRAFT, **không** tăng số lượt hạn mức | |
| IT-04 | chapter quiz: nộp 9/10 → `quizPassedAt` set, thông báo `LEARNING_PATH_CHAPTER_PASSED`; 5/10 → chưa | |
| IT-05 | Housekeeping sau 90 ngày: job lộ trình còn, `extracted_text` null khi ACTIVE, DRAFT giữ nguyên | |
| IT-06 | remedial: 12 thẻ yếu → lộ trình `remedial` ACTIVE với bộ thẻ clone, lịch 5 ngày | |
| IT-07 | reminder job tại giờ cấu hình: 1 thông báo / lộ trình / ngày; `reminder=false` không gửi | |
| IT-08 | `reactionMs` ghi vào `review_logs`; `/insights/friction` trả thẻ chậm | |
| FE | selfcheck cho mask/suggestDays; lint/build xanh; kiểm tay 375 px | |

## 9. Thứ tự triển khai
1. V20 + entity/repo + Scheduler (plan/forecast/rebalance/mask/suggest) + unit test.
2. Service: activate theo thẻ, session, list batch, retry/enrich, housekeeping (LP-1), reaction time.
3. Quiz gate + completion + notifications + reminder job.
4. Insights + remedial + next.
5. Frontend: StudyPage session → PathActiveView mới → Draft/Failed → Dashboard widget → Roadmap insights → Profile friction → notifications.
6. Admin: settings keys + stats.
7. Docs: LEARNING_PATH.md (bản 2.0), CHANGELOG, USE_CASES_CHECKLIST (UC-37 → xong), smoke-learning-path.mjs mở rộng.
