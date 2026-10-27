# Lộ trình học tập từ tài liệu (UC-37, bản theo tài liệu)

Người dùng nhập văn bản hoặc tải tài liệu + chọn số ngày → hệ thống bóc tách ([EXTRACTION.md](EXTRACTION.md)), **tách chương**,
cho xem bản nháp để chỉnh, rồi tạo **một thư mục, mỗi chương một bộ thẻ** và **chia khối lượng học theo ngày**. Trang
`/roadmap` là danh sách lộ trình + "hôm nay học gì"; `/roadmap/:id` là chi tiết (đang xử lý / bản nháp / đang học).
Bản 2.0 (19/10, mục 9–11): lịch theo **từng thẻ** (`learning_path_cards`), phiên học gộp, trần thẻ / ngày và ngày học trong tuần, cân lại
lịch, kiểm tra chương, hoàn thành, thẻ yếu + lộ trình bổ khuyết, nhắc học (trong app + email). Mục 1–8 là luồng tạo → nháp → kích hoạt
(vẫn đúng), mục 9–11 là phần vận hành 2.0; chỗ nào hai bên khác nhau thì mục 9–11 thắng. GraphRAG gợi ý theo đồ thị tri thức: xem
[Plan/specs/2026-10-27-do-thi-tri-thuc-neo4j-design.md](Plan/specs/2026-10-27-do-thi-tri-thuc-neo4j-design.md) (`/graph`, tab Gợi ý).

Spec: [Plan/specs/2026-10-14-lo-trinh-hoc-tap-design.md](Plan/specs/2026-10-14-lo-trinh-hoc-tap-design.md) ·
Kế hoạch: [Plan/plans/2026-10-14-lo-trinh-hoc-tap.md](Plan/plans/2026-10-14-lo-trinh-hoc-tap.md).

## 1. Luồng

```
CreateLearningPathModal ──POST multipart /api/learning-paths (file|text, days, title?, startDate?, options?)──▶ LearningPathService.create
   │                                      ├ ExtractionService.prepareJob(purpose='learning_path', options.splitChapters=true)
   │                                      ├ lưu learning_paths (PROCESSING, job_id)
   │                                      └ ExtractionService.startJob → ExtractionWorker (TEXT → ANALYZE → ENRICH như cũ)
RoadmapDetailPage poll 2s GET /{id}       ai-service /analyze(splitChapters) → item.chapter, stats.chapters[], stats.chaptersDetected
   │                                      ExtractionWorker DONE/FAILED → publish ExtractionJobFinishedEvent
   │                                      LearningPathService.onJobFinished → buildDraft (chương theo stats hoặc chia theo ngày) → DRAFT
DRAFT: sửa tên/gộp chương, bỏ thẻ (PATCH), đổi ngày → POST /{id}/activate
   │                                      → Folder (metadata learningPathId) + Deck/chương (toCard) + allocate() ngày → ACTIVE
ACTIVE: /roadmap/:id hiện lịch, "Hôm nay" → /decks/:deckId/study?range=a-b&path=:id
```

- **Hook khi job xong** là Spring event (`ExtractionJobFinishedEvent`); listener không bao giờ ném — lỗi nào cũng chuyển
  lộ trình sang FAILED.
- **Học một dải thẻ**: `StudyPage` nhận `?range=a-b` (vị trí thẻ trong bộ) và `?path=` để quay về lộ trình; backend
  không có khái niệm "thẻ mới mỗi ngày", dải vị trí do lịch quyết định. Hàng đợi là **cả dải** (bất kể đến hạn), nhưng
  chế độ chấm quyết định **từng thẻ** (`rangeCram`): thẻ mới (chưa có review) và thẻ đến hạn xếp lịch SRS bình thường;
  thẻ đã ôn mà **chưa đến hạn** chấm kiểu cram (chỉ ghi log, không đổi `reps`/`interval`) — mở lại dải hôm nay không
  thổi phồng "đã thuộc". `?cram=1` vẫn ép cram cho mọi thẻ.
- **"Thử lại"** ở lộ trình FAILED mở modal tạo mới; tạo xong đóng modal rồi sang `/roadmap/:newId` (trang mount lại theo
  `key={id}`, không giữ lộ trình cũ). Danh sách `GET /api/learning-paths` gửi `?date=` của máy khách như trang chi tiết;
  thẻ "Hôm nay: k thẻ" chỉ hiện khi `today.state = during`.
- **Giới hạn ngày dùng chung** với bóc tách (5 lượt / 24 giờ free, 50 premium): tạo lộ trình tốn một lượt.

## 2. Trạng thái

```
PROCESSING ──(job DONE)──▶ DRAFT ──(activate)──▶ ACTIVE
     └──────(job FAILED / lỗi buildDraft)──▶ FAILED
```

| Trạng thái | Cho phép |
|---|---|
| PROCESSING | chỉ xem; `PATCH /{id}` → 409; xoá → 409. Khởi động lại giữa chừng → FAILED (B8: chỉ lộ trình của chính instance) |
| DRAFT | đổi tên / số ngày / ngày bắt đầu / trần thẻ / ngày học, đổi tên chương, gộp chương, bỏ chọn thẻ, "Dịch lại nghĩa", kích hoạt |
| ACTIVE | đổi tên, `startDate` / `totalDays` / `dailyCap` / `studyDays` / nhắc học (xếp lại lịch theo thẻ), phiên học `/session`, cân lại lịch, kiểm tra chương, `POST /complete` khi học hết (`completedAt`) |
| FAILED | "Chạy lại" (`POST /retry`, từ ANALYZE, **không tốn lượt**), tạo lại hoặc xoá (`PATCH` → 400) |

Xoá lộ trình = xoá kế hoạch + job bóc tách ẩn; **thư mục / bộ thẻ / lịch sử ôn tập giữ nguyên**.

## 3. Tách chương (`ai-service/app/extract/chapters.py`, hàm thuần)

Chỉ chạy khi `ExtractionOptions.splitChapters = true` (lộ trình bật sẵn; bóc tách thường không bật).

- Dòng ứng viên tiêu đề khi (≤ 80 ký tự, không kết thúc `。！？!?`) **và** khớp
  `^第\s*(\d{1,3}|[一二三四五六七八九十百]{1,4})\s*(課|章|部|節|回|話|単元)…`, hoặc
  `^(Lesson|Unit|Chapter|Part|Section|Bài|Chương|Phần|Mục|レッスン|ユニット)\s*\d{1,3}…` (không phân biệt hoa thường, nhận số
  fullwidth). Dòng `1.` / `１．` **không** là tiêu đề.
- **Loại câu văn**: dòng chứa `、` hoặc `。` ở bất kỳ đâu không phải tiêu đề; phần sau số phải ≤ 50 ký tự và không bắt đầu
  bằng `で|に|の|は|が|を|目` (trợ từ dính vào số: `第3章では…`, `第2回目の授業で…`).
- **Xếp hạng họ từ khoá**: hạng 1 = `課|章|単元|日目|Bài|Chương|Lesson|Unit|Chapter|レッスン|ユニット` (`N日目` = bài theo ngày,
  Nihongo Soumatome); hạng 2 = `部|節|回|話|週|Phần|Mục|Part|Section` (`第N週` là nhóm tuần, chỉ tách khi không có ngày).
  Tiêu đề dạng câu hỏi (`…ますか?`) hợp lệ; chỉ loại dòng kết thúc `。！!` hoặc chứa `、`. Chỉ tách theo **họ hạng cao nhất xuất hiện ≥ 2 lần** (hạng 1 nếu có ≥ 2, không thì
  hạng 2 nếu có ≥ 2); dòng của họ hạng thấp hơn **ở lại trong thân chương** ("Bài 1 / Phần 1 / Phần 2 / Bài 2" → 2 chương).
- **DOCX** (hạng 0, ưu tiên hơn regex khi khớp ≥ 2 dòng): chỉ dùng heading ở **cấp nhỏ nhất** (gần 1 nhất) xuất hiện ≥ 2
  lần; cấp sâu hơn (vd. H2 `語彙`/`文法` lặp ở mỗi bài) ở lại trong thân. Tập so khớp dựng từ dòng đầu của các block cấp đó.
- **Bỏ mục lục / phần đầu & cuối sách** (14/10): (1) cụm ≥ 3 dòng tiêu đề liên tiếp **không có thân** hoặc **kết thúc
  bằng số trang** (`第1課 あいさつ ...... 12`) là mục lục → bỏ; (2) tiêu đề **lặp** (mục lục sót, header chạy đầu trang PDF)
  chỉ lần đầu mở chương, các lần sau bị xoá khỏi thân; (3) phần trước tiêu đề thật đầu tiên bị **bỏ hẳn** nếu chứa dòng
  `はじめに / まえがき / 本書の使い方 / 目次 / 凡例 / Lời nói đầu / Cách sử dụng / Mục lục / Preface / Contents…` (không thì giữ
  "Mở đầu" như dưới); chương có tiêu đề là các từ đó cũng bị bỏ; (4) chương cuối bị cắt tại dòng `付録 / 索引 / 解答 / Phụ lục
  / Đáp án / Appendix / Index`. Danh sách phần đã bỏ trả về ở `stats.skippedSections`, bản nháp hiện "Đã bỏ qua: …".
- **Mục lục OCR**: dòng mục lục còn là dòng có **2 mốc trong một dòng** (`1日目アパート…2日目引っ越し…`, scan không có số trang).
- **Phần đầu sách liền khối** (14/10, sau khi thử PDF Soumatome): bỏ mọi chương tới chương **cuối cùng** mà thân còn chứa dòng
  tên phần đầu sách (mục nhập cuối của mục lục OCR thường "ôm" luôn trang cách dùng sách), miễn sau đó còn ≥ 2 chương;
  tiêu đề đứng **trước tiêu đề số 1 đầu tiên** (hộp ví dụ `5日目 …` trong trang cách dùng sách) là phần đầu sách — không áp dụng
  khi tài liệu bắt đầu giữa sách (không có bài 1); chương dẫn đầu có **tiêu đề dạng mục lục** (`1日目-6日目 7日目`) bị bỏ; phần mở
  đầu chỉ gồm tiêu đề nhóm (trang bìa `第1週 …`) bị bỏ, không thành "Mở đầu".
- `chaptersDetected` = số tiêu đề được chọn ≥ 2. Không nhận ra → một chương, văn bản **nguyên vẹn**; backend dùng thuật toán chia theo ngày (mục 4).
- Nhận ra: thân chương = các dòng giữa hai tiêu đề (bỏ dòng tiêu đề, vì `split_sentences` vốn xoá nó và `第1課` sẽ thành
  từ vựng `課`); tiêu đề chương = cả dòng (cắt 100 ký tự). Phần trước tiêu đề đầu: có tiếng Nhật → chương "Mở đầu", không thì
  gộp vào chương 1. Trang PDF **không** là chương.
- Backend `buildDraft`: chương trong `stats.chapters` **không có item nào** bị gộp (bỏ hàng, đánh lại `position` 1..n)
  ngay khi dựng bản nháp, nên bản nháp không hiện chương rỗng và khớp với kết quả `activate`.
- Phân tích **từng chương**, rồi gộp trùng toàn tài liệu theo lần xuất hiện đầu (từ ở chương 1 và 5 → chỉ chương 1,
  `frequency` cộng dồn). **Cap từ vựng (LP-17)**: tách được ≥ 2 chương → cap **900** (`MAX_VOCAB_CHAPTERED`) chia cho từng
  chương theo tỉ lệ số ứng viên, mỗi chương tối thiểu min(20, số ứng viên); quá nhiều chương thì sàn hạ xuống f lớn nhất ≤ 20
  sao cho Σ min(số ứng viên, f) ≤ 900 (vd. 50 chương × 40 từ → 18; hơn 900 chương → 0, mỗi suất cấp theo tần suất),
  phần dư do làm tròn dồn cho chương còn bị cắt nhiều tần suất nhất (`pipeline._chapter_caps`); một chương / không bật tách →
  600 từ theo tần suất toàn tài liệu như cũ; ngữ pháp vẫn 100 mẫu cho cả tài liệu.
- Đầu ra: `item.chapter`, `stats.chaptersDetected`, `stats.chapters[{index, title, vocab, grammar}]`, `stats.skippedSections[]`,
  `stats.capPerChapter[{index, cap, candidates, kept}]`; `/text` trả thêm `blocks[].heading` cho DOCX.

Hạn chế đã biết: OCR nhiễu (`第l課`) hoặc heading chỉ là đoạn in đậm thường bị sót / nhận nhầm → dùng bản nháp: sửa tên,
**gộp chương lên trên**. Gộp trùng vẫn có thể làm chương sau mỏng (từ lặp dồn về chương đầu) dù cap đã chia theo chương.

## 4. Chia ngày (`LearningPathScheduler`, hàm thuần, có unit test)

- `allocate(cardCounts, D)`: n chương, D ngày.
  - `n ≥ D`: chương i (0-based) vào ngày `i*D/n + 1` (nhiều chương chung một ngày).
  - `n < D`: quota tỉ lệ số thẻ, mỗi chương ≥ 1 ngày, phần dư lớn nhất được +1 (hoà → chương trước); các chương chiếm dải ngày liên tiếp.
- Trong chương: `perDay = ceil(cards / days)`; ngày thứ k của chương phủ vị trí `[(k−1)·perDay+1 .. min(k·perDay, cards)]`;
  ngày không còn thẻ → `tasks = []` (UI hiện "ngày ôn tập").
- **Dự phòng khi không nhận ra chương**: `k = days ≤ 14 ? days : ceil(days/7)`, `k = min(k, số thẻ)`; chia đều thẻ giữa k
  bộ. Tên "Ngày N" (≤ 14 ngày) hoặc "Tuần k (ngày a–b)".
- Thứ tự thẻ trong bộ chương = **thứ tự tài liệu** (từ vựng rồi ngữ pháp), không sắp N5 → N1 như bộ thẻ bóc tách thường.
- `dayIndex = DAYS.between(startDate, today) + 1`; `state = before | during | after`. Backend nhận `?date=YYYY-MM-DD` từ máy
  khách (tránh lệch múi giờ), mặc định `app.learning-path.zone=Asia/Ho_Chi_Minh`.
- Ngày theo lịch: ngày N = ngày bắt đầu + N−1; học trễ thì giao diện hiện phần "nợ".
- Tên thư mục trùng → hậu tố " (2)", tính **trước** khi gọi `createFolder` (bắt 409 trong transaction sẽ rollback-only).

## 5. API (`/api/learning-paths`, JWT; của người khác = 404)

| Method | Path | Body / Query | Trả về |
|---|---|---|---|
| POST | `/` | multipart `file`\|`text`, `days` (1–365), `title?` (≤100), `startDate?`, `options?` (JSON) | 202 `LearningPathResponse` (PROCESSING). 400 ngày sai, 429 vượt hạn mức ngày |
| GET | `/` | — | mới nhất trước, không có `chapters/days`; `today` chỉ khi ACTIVE |
| GET | `/{id}` | `?date=` | đầy đủ: `job`, `chapters[]`, `days[]`, `today` |
| PATCH | `/{id}` | `{title?, totalDays?, startDate?}` | DRAFT/ACTIVE (ACTIVE đổi ngày → tính lại dải); 409 nếu PROCESSING, 400 nếu FAILED |
| PATCH | `/{id}/chapters/{cid}` | `{title}` | DRAFT only (409) |
| POST | `/{id}/chapters/{cid}/merge-up` | — | gộp vào chương trước, đánh lại `position`; 400 ở chương đầu |
| PATCH | `/{id}/items` | `[{id, selected?, …}]` (như `ItemPatch` bóc tách) | proxy `ExtractionService.patchItems`; DRAFT only |
| GET | `/{id}/chapters/{cid}/items` | — | `ExtractionItemResponse[]` |
| POST | `/{id}/activate` | `{startDate?, totalDays?}` | 201 ACTIVE; 400 nếu không còn thẻ chọn; 409 nếu không DRAFT |
| DELETE | `/{id}` | — | 204 |
| POST | `/` (2.0) | thêm part `dailyCap?` (5–200; mặc định `app_settings.learning_path_daily_cap_default` = 50) và `studyDays?` (7 ký tự 0/1 cho T2..CN, mặc định `1111111`) | 202 như cũ; 400 nếu trần / mask sai (mask toàn 0 cũng 400) |
| GET | `/` (2.0) | `?date=` | một truy vấn batch cho job / chương / thẻ (LP-7); ACTIVE kèm `today{…, newCount, dueCount, behindCount}` và `completion` |
| GET | `/today-summary` | `?date=` | `[{pathId, title, dayIndex, totalDays, state, newCount, dueCount, behindCount, studyDays, dailyCap}]` cho mọi lộ trình ACTIVE — widget Tổng quan + badge sidebar dùng chung (LP-16) |
| GET | `/{id}` (2.0) | `?date=` | thêm `dailyCap, studyDays, reminder, completedAt, lastRebalancedAt`; ACTIVE: `completion`, `chapters[].{learned, mastered, state, quizBestPct, quizPassedAt}`, `today{…, newCount, dueCount, behindCount}` với `tasks[].{count, cardIds}`, `forecast[]`; DRAFT: `suggestedDays`, `overCap` |
| PATCH | `/{id}` (2.0) | `{title?, totalDays?, startDate?, dailyCap?, studyDays?, reminder?, remindEmail?}` · `?date=` | ACTIVE đổi `totalDays / startDate / studyDays / dailyCap` → xếp lại thẻ **chưa học** từ hôm nay (thẻ đã học giữ ngày); 400 nếu `totalDays` < ngày học hiện tại; 409 nếu lịch mới cần > 365 ngày; `overflow = true` khi không giữ được trần |
| PATCH / POST | `/{id}/chapters/{cid}`, `/{id}/chapters/{cid}/merge-up`, `/{id}/items` | thêm `?date=` | như 1.0; response theo ngày máy khách (LP-11); 409 "Đang dịch lại nghĩa" khi job của lộ trình đang chạy |
| POST | `/{id}/activate` (2.0) | `{startDate?, totalDays?, dailyCap?, studyDays?}` · `?date=` | 201 như cũ; ghi `learning_path_cards` (seq, scheduled_day, weight) theo `plan` (§3.2 spec 2.0), chương chốt `cardCount / dayFrom / dayTo` từ các dòng đó; khoá dòng lộ trình (LP-13) nên bấm hai lần → 409, một thư mục; `overflow = true` khi không giữ được trần |
| GET | `/{id}/session` | `?kind=today\|catchup\|due\|chapter&chapterId=&date=` | `{kind, date, dayIndex, state, counts{new, due, catchup, total}, cards[{cardId, deckId, chapterId, chapterTitle, term, reading, readingSegments, meaning, hanViet, level, kind, mode: new\|due\|cram}]}`. `today` = đến hạn → nợ (cắt để đến hạn + nợ + mới ≤ `dailyCap`, không bao giờ bỏ thẻ mới) → mới hôm nay; `before` / `rest` chỉ đến hạn, `after` đến hạn + nợ; `catchup` mọi thẻ nợ; `due` mọi thẻ đến hạn; `chapter` mọi thẻ của chương. 409 không ACTIVE; 400 `kind` sai / thiếu `chapterId`; 404 chương lộ trình khác |
| POST | `/{id}/rebalance` | `{extend: boolean}` · `?date=` | 200 lộ trình đầy đủ. Không có thẻ nợ → chỉ đặt `lastRebalancedAt`; `extend=false` chia nợ + chưa tới ngày vào các ngày còn lại; `extend=true` giữ nhịp cũ và kéo `totalDays`; tự chốt `completedAt` khi đã qua ngày cuối và học hết. 409 không ACTIVE / lịch cần > 365 ngày |
| POST | `/{id}/retry`, `/{id}/enrich`, `/{id}/chapters/{cid}/quiz`, `/{id}/complete` | `?date=` | xem bảng ở mục 9 (chạy lại FAILED không tốn lượt, dịch lại nghĩa, bài kiểm tra chương, chốt hoàn thành) |

`LearningPathResponse` (bỏ trường null): `id, title, status, sourceType, sourceName, totalDays, startDate, chaptersDetected,
jobId, folderId, createdAt, activatedAt, errorMessage, job{status, stage, errorMessage, stats},
chapters[{id, position, title, deckId, deckDeleted, cardCount, vocabCount, grammarCount, dayFrom, dayTo, perDay}],
today{date, dayIndex, state, tasks[{chapterId, chapterTitle, deckId, fromPos, toPos}]}, days[{dayIndex, date, tasks[]}]`.
DRAFT: `cardCount` và dải ngày tính **sống** từ item `selected` + `allocate`; ACTIVE: chốt trong DB.

Trường 2.0 của `LearningPathResponse` (cũng NON_NULL, client 1.0 không thấy khác biệt): `dailyCap, studyDays, reminder,
completedAt, lastRebalancedAt, completion{total, learned, mastered, learnedPct, masteredPct, chaptersPassed, chaptersTotal, done},
forecast[{dayIndex, date, newCount, newWeight, predictedReviews, load, overCap}]` (chỉ `GET /{id}` ACTIVE), `suggestedDays, overCap`
(chỉ `GET /{id}` DRAFT), `overflow` (chỉ response của activate / PATCH / rebalance vừa xếp lịch mà không giữ được trần).
`chapters[]` ACTIVE thêm `learned, mastered, state (passed | review | current | locked | open | empty — "Trống": chương không còn thẻ trong lịch mà chưa qua kiểm tra, 20/10 chiều), quizBestPct, quizPassedAt` và mọi số
đếm / dải ngày suy từ `learning_path_cards` (bộ thẻ bị xoá → `cardCount 0`, không dải ngày). `today` thêm `state = rest` (ngày nghỉ theo
`studyDays`, `dayIndex` = ngày học gần nhất trước đó), `newCount` (thẻ chưa học xếp đúng hôm nay), `dueCount` (thẻ của lộ trình có
`reviews.due_at` tới hết ngày theo múi giờ cấu hình), `behindCount` (thẻ chưa học xếp ở ngày đã qua); `tasks[]` giữ `fromPos / toPos`
cho client 1.0 (min / max `flashcards.position` của thẻ xếp hôm nay) và thêm `count, cardIds` — client 2.0 học theo `cardIds` qua
`/session`. `days[]` tính ngày lịch qua `dateForDay(startDate, i, studyDays)` nên ngày nghỉ không có dòng.

Liên quan: `GET /api/extractions` **không** liệt kê job của lộ trình; `DELETE /api/extractions/{id}` với job lộ trình → 409
(xoá qua `DELETE /api/learning-paths/{id}`; job **mồ côi** — lộ trình đã xoá, dòng `CANCELLED` giữ cho hạn mức — chủ sở hữu /
Admin Panel xoá được sau 24 giờ, trước đó 409). Các thao tác sửa job bóc tách (`PUT /text`, `POST /rerun`, `POST /enrich`,
`PATCH /items`, `POST /decks`) với job lộ trình → 409 "Lượt này thuộc một lộ trình học, hãy thao tác từ trang lộ trình."
(`rerun` xoá item → rỗng mọi chương nháp); sửa item đi qua `PATCH /api/learning-paths/{id}/items`.
ACTIVE đổi `totalDays`: chỉ chia lại cho chương còn bộ thẻ; chương có bộ thẻ đã xoá giữ dải cũ, không chiếm ngày.

## 6. Dữ liệu (`V13__learning_paths.sql`)

| Bảng / cột | Ghi chú |
|---|---|
| `extraction_jobs.purpose` | `'extraction'` (mặc định) \| `'learning_path'`; lọc khỏi danh sách bóc tách |
| `learning_paths` | `user_id` CASCADE; `job_id` SET NULL; `folder_id` SET NULL; `status`, `total_days`, `start_date`, `chapters_detected`, `activated_at` |
| `learning_path_chapters` | `path_id` CASCADE; `position`, `title`, `deck_id` SET NULL; `card_count` (NULL khi DRAFT), `day_from`, `day_to` |
| `extraction_items.chapter_no` / `chapter_id` | số chương ai-service trả / chương sau khi gộp, sửa (SET NULL) |

Ngữ nghĩa xoá: xoá bộ thẻ hoặc thư mục ngoài lộ trình → FK về NULL, API không vỡ (`deckDeleted = true`); xoá lộ trình →
chương CASCADE, job bóc tách ẩn bị xoá, bộ thẻ / thư mục giữ nguyên. Thư mục tạo ra mang `metadata.learningPathId`.

## 7. Hạn chế đã biết (cập nhật 27/10, bản 2.0)

- Tên "Tuần k (ngày a–b)" / "Ngày N" **không tự đổi** khi người dùng sửa số ngày sau đó; UI luôn hiện `dayFrom–dayTo`.
- Lịch 2.0 theo **id thẻ** nên sửa / thêm / xoá thẻ không làm lịch trôi; thẻ thêm sau kích hoạt **không vào lịch** (trang bộ thẻ có dải
  LP-15 nhắc, kể cả khi bộ đã rời thư mục lộ trình — B5.8), thẻ xoá thì rời lịch (chương có thể thành "Trống").
- Tiêu đề chương nhận sót / nhầm (xem mục 3); gộp trùng toàn tài liệu làm chương sau có thể ít thẻ.
- Chưa lưu file gốc (chỉ giữ văn bản đã trích, sửa được bằng `PUT /{id}/text`); lộ trình FAILED chạy lại từ văn bản đó.
- Cá nhân hoá: thẻ yếu + lộ trình bổ khuyết theo luật (mục 11) và gợi ý theo đồ thị tri thức (27/10, `/graph`); chưa có mô hình học máy
  dự đoán.

## 8. Test

- Backend: `LearningPathSchedulerTest` (thuần hàm), `LearningPathIT` (ai-service giả lập `@MockitoBean AiServiceClient`):
  `cd backend-core && mvn test -Dtest=LearningPathSchedulerTest,LearningPathIT`.
- ai-service: `cd ai-service && python -m pytest -q tests/test_chapters.py` (cùng `test_pipeline.py` cho `splitChapters`).
- Frontend: `cd frontend && npm run lint && npm run build && npm run selfcheck` (`roadmapUtils`).
- Smoke end-to-end: `npm run smoke:learning-path` (cần backend + ai-service thật); `npm run e2e` chạy nó trên DB cô lập
  (khởi động ai-service trước: `cd ai-service && venv/Scripts/uvicorn.exe app.main:app --port 8000`).

## 9. Bản 2.0 — phần vận hành (19/10, backend; spec [2026-10-19-lo-trinh-hoc-tap-2-design.md](Plan/specs/2026-10-19-lo-trinh-hoc-tap-2-design.md))

Mục này ghi phần B đã làm ở backend (lịch theo thẻ / phiên học / cân lại ở phần A đã có trong response `GET /{id}`); các mục 1–8 ở
trên vẫn đúng cho luồng tạo → nháp → kích hoạt, trừ chỗ ghi khác dưới đây.

| Method | Path | Trả về / quy tắc |
|---|---|---|
| POST | `/{id}/retry?date=` | **FAILED** → chạy lại từ ANALYZE trên `extracted_text` của job (không OCR lại, **không tốn lượt hạn mức**): 202 lộ trình `PROCESSING`, client poll như lúc tạo; job mất văn bản → 400 "Hãy tạo lại lộ trình với tài liệu mới."; không FAILED → 409. `buildDraft` xoá chương của lần dựng trước rồi dựng mới |
| POST | `/{id}/enrich?date=` | **DRAFT / ACTIVE** → chạy lại bước ENRICH (dịch nghĩa VI cho item còn thiếu), cooldown 5 phút như `/api/extractions/{id}/enrich` (429); 202 lộ trình đầy đủ, **trạng thái lộ trình không đổi** — client poll `job.stats.enrichedAt` rồi tải lại item. PROCESSING / FAILED → 409; không còn job → 400. Ở ACTIVE chỉ item được dịch lại, thẻ đã tạo không đổi. **Trong lúc job đang chạy** (QUEUED/RUNNING): `activate`, `PATCH /items`, `merge-up`, `DELETE /{id}` → 409 "Đang dịch lại nghĩa, hãy chờ xong." (worker ghi item / job bằng UPDATE cả dòng, ghi chen là ghi đè nhau; `activate` ghi `deck_ids` bằng UPDATE một cột vì cùng lý do). Lần dịch lại bị **ngắt** (khởi động lại → job FAILED, lộ trình vẫn DRAFT/ACTIVE, item còn) → vẫn nhận, worker ghi lại DONE |
| POST | `/{id}/chapters/{cid}/quiz` | ACTIVE: mở lượt quiz **exam** trên bộ của chương, `min(10, số thẻ còn trong lịch)` câu → `AttemptState` (đang có lượt mở thì `resumed = true`). 409 nếu không ACTIVE / bộ thẻ đã xoá / chương hết thẻ; 404 chương lộ trình khác (kể cả lộ trình khác của chính mình). Chỉ lượt exam có `total ≥ min(10, số thẻ chương)` mới được chấm "qua chương" — exam 1 câu mở qua `POST /api/quiz-attempts` bị bỏ qua |
| POST | `/{id}/complete?date=` | ACTIVE và `completion.learnedPct = 100` → `completedAt` (idempotent, kể cả khi sau đó bộ thẻ đã bị xoá hết) + thông báo; chưa học hết → 409 "Chưa học hết thẻ của lộ trình (còn N thẻ chưa học)."; không còn thẻ nào mà chưa chốt → 409 |
| DELETE | `/{id}` | PROCESSING → 409 "Đang xử lý, hãy chờ xong rồi xoá."; job đang dịch lại → 409 "Đang dịch lại nghĩa, hãy chờ xong rồi xoá."; còn lại 204: xoá chương + lịch thẻ + item, **giữ dòng job** ở `CANCELLED` (xoá trắng `extracted_text`) để hạn mức 24 giờ không được hoàn; `GET /api/extractions/{jobId}` vẫn 200 với status `CANCELLED`; `DELETE /api/extractions/{jobId}` được sau 24 giờ |

- **Kiểm tra chương (D4 — chỉ gắn nhãn, không chặn học)**: `QuizAttemptService.close()` phát `QuizSubmittedEvent(uid, deckId,
  attemptId, score, total, mode)` trong cùng giao dịch; `LearningPathService.onQuizSubmitted` chỉ xét `mode = exam`, chương ACTIVE
  của chính người nộp có `deckId` trùng: `quizBestPct = max`, lần đầu `pct ≥ learning_path_quiz_pass_pct` (mặc định 80) →
  `quizPassedAt` + thông báo `LEARNING_PATH_CHAPTER_PASSED`; lượt đầu tiên của chương mà dưới ngưỡng → `LEARNING_PATH_CHAPTER_RETRY`
  (D4 "nhắc làm lại", 20/10 chiều) và giao diện hiện dải "Chưa đạt N% — Làm lại" (kể cả chương đã bị cân lại về "chưa tới ngày", B5.8).
  Ngưỡng `quizPassPct` nằm trong response (`learning_path_quiz_pass_pct`). Practice trên cùng bộ thẻ không tính. `chapters[].state = passed` khi
  có `quizPassedAt`.
- **Hoàn thành**: đọc (`GET /{id}`, `/session`) không có tác dụng phụ — `completion.done = true` ngay khi học hết, UI gọi
  `POST /complete`. Tự chốt (spec §4.1 "qua ngày cuối và learnedPct = 100") chỉ ở lối ghi: `PATCH /{id}` (ACTIVE) và `POST /rebalance`
  đặt `completedAt` khi `today.state = after` và mọi thẻ đã học.
- **Thông báo** (`model/Notification`): `LEARNING_PATH_READY {pathId, title, chapters}` khi bản nháp dựng xong,
  `LEARNING_PATH_FAILED {pathId, title, reason}` khi lộ trình lỗi (lỗi job, lỗi dựng nháp, và khởi động lại giữa chừng —
  `failOrphans` đi từng dòng qua `fail()` thay vì UPDATE hàng loạt), `LEARNING_PATH_CHAPTER_PASSED
  {pathId, pathTitle, chapterId, chapterTitle, pct}`, `LEARNING_PATH_COMPLETED {pathId, title}`; `LEARNING_PATH_REMINDER` do
  `LearningPathReminderJob` gửi (mục 11).
- **Ôn tập (E1)**: `POST /api/reviews` nhận thêm `reactionMs?` (0–600000, ngoài khoảng → 400) và `pathId?`; cả hai chỉ ghi vào
  `review_logs.reaction_ms / path_id` (kể cả cram), không đổi SRS; `pathId` không phải lộ trình của người dùng → ghi NULL, không chặn.
- **Dọn dẹp đêm**: `deleteFinishedBefore` chỉ xoá job thường; `clearTextOfOldPathJobs` xoá trắng văn bản job của lộ trình ACTIVE > 90
  ngày; `deleteOrphanPathJobsBefore` xoá job lộ trình mồ côi (CANCELLED sau khi xoá lộ trình) > 90 ngày. `run()` trả
  `{refreshTokens, resetTokens, jobsDeleted, premiumExpired, pathJobsTextCleared, orphanPathJobsDeleted}`.
- **Admin**: `GET /api/admin/stats` giữ `learningPaths` (long) và thêm `learningPathBreakdown {active, completed, failed, remedial,
  draft}` (`active` = ACTIVE chưa chốt; `completed` = có `completed_at`; PROCESSING không đếm riêng).
- Test: `LearningPathIT` (retry / enrich / chapter quiz / complete), `HousekeepingIT` (job mồ côi), `ReviewSrsIT` (reactionMs),
  `AdminStatsIT` (breakdown).

## 10. Giao diện 2.0 (19/10, frontend)

- **Route**: `/roadmap` (danh sách + modal tạo: ngày bắt đầu mặc định hôm nay theo máy khách; khối "Lịch học" có trần thẻ/ngày —
  **để trống thì không gửi `dailyCap`**, server dùng `learning_path_daily_cap_default` do quản trị đặt — và ngày học trong tuần),
  `/roadmap/:id` (PROCESSING / DRAFT / ACTIVE / FAILED), `/session` (cùng `StudyPage`, không có `:deckId`). Đường cũ
  `/decks/:deckId/study?range=a-b&path=` và `?cram=1` vẫn chạy.
- **Tham số phiên**: `/session?session=today|catchup|due|chapter&path=<id>[&chapter=<cid>]` → `GET /{id}/session?kind=&chapterId=&date=`.
  Hàng đợi là `cards[]` server trả (nhiều bộ thẻ, đã xếp đến hạn → nợ → mới); mỗi thẻ có chip Mới / Ôn / Luyện theo `mode`
  (`?cram=1` ép Luyện; học bộ thẻ / dải 1.0 suy từ lịch SRS máy khách). Chấm gửi `cram` (mode = cram), `reactionMs` (từ lúc hiện
  thẻ tới lúc bấm chấm, không tính thời gian trong modal luyện, kẹp `MAX_REACTION_MS` = 600 000 — một hằng ở `lib/srs.ts` dùng
  chung cho kẹp lẫn lọc) và `pathId`. Header "Ôn x · Nợ y · Mới z (· Luyện n)" — `Luyện` = thẻ `mode=cram` đếm từ danh sách thẻ
  (server không đưa vào `counts`, chỉ có ở `chapter`); màn hình kết thúc đặt tiêu đề theo loại phiên (`sessionDoneHeading`), phiên
  rỗng nói rõ lý do (`sessionEmptyMessage`: nghỉ / chưa bắt đầu / hết nợ / hết đến hạn / chương trống). Hai nút trên thẻ: "Luyện
  phát âm" (`PronunciationPanel`) và "Viết" (`KanjiWritePanel`, chỉ khi từ có chữ Hán); phím tắt Space / 1–4 tắt khi modal mở.
- **Trang ACTIVE** (`PathActiveView`, số liệu lấy từ response, hàm máy khách chỉ dự phòng khi thiếu trường): `ProgressSummary`
  (đã học / đã thuộc, chương đã qua kiểm tra, "Hoàn thành" → `POST /complete` khi `learnedPct = 100`, "Cài đặt"), `BehindBanner`
  (nợ: Học bù / Cân lại lịch / Kéo dài → `POST /rebalance`, mức `behindSeverity`), `TodaySessionPanel` (3 nhóm + "Bắt đầu phiên
  hôm nay (k thẻ)" với `k = todaySessionSize` mô phỏng cách server cắt nợ theo trần; "Chỉ ôn", "Học bù"), `WorkloadChart` (forecast,
  cột CSS cuộn ngang trong khung riêng + bảng ẩn cho trình đọc màn hình), `ChapterTimeline` (trạng thái chương, "Học chương" →
  `/session?session=chapter`, "Kiểm tra chương" → `POST /chapters/{cid}/quiz` rồi `/decks/{deckId}/quiz?attempt=`, điểm cao nhất),
  `PathSettingsDrawer` (PATCH chỉ trường đổi; `totalDays` tối thiểu = `replanFromDay(ngày bắt đầu, hôm nay, mặt nạ ĐANG chọn)` —
  đúng quy tắc `placeFrom` của server: ngày nghỉ → ngày học kế, đặt lại ngày bắt đầu = hôm nay thì rút ngắn được; server vẫn là
  người quyết định cuối với 400 kèm mốc).
- **DRAFT** (`PathDraftEditor`): mỗi ô lưu-khi-blur có `{src, value}` riêng (LP-12); gợi ý số ngày "Gợi ý N ngày (~k thẻ mới/ngày)
  [Áp dụng]" từ `suggestedDays`, cảnh báo đỏ khi `overCap`; trần + ngày học PATCH ngay để gợi ý cập nhật; "Dịch lại nghĩa" khi
  `canReEnrichPath(job)` — job **DONE hoặc FAILED** (lần dịch lại trước bị ngắt, item còn) với `enrichReason` quota / error và chưa
  dịch được — đếm ngược **chỉ** theo `job.stats.enrichedAt` (429 của server luôn kèm mốc đó; 429 "hàng đợi đầy" không có cooldown
  nên không đặt mốc chờ ở máy khách). **FAILED** (`PathFailedPanel`): "Chạy lại" (`POST /retry`, trang poll lại) + "Tạo lại" + "Xoá".
- **Tổng quan / sidebar**: `useTodaySummary()` (cache mức module, một `GET /today-summary`, làm mới sau mỗi thao tác ghi và khi qua
  ngày) → `TodayPathWidget` trên `/` (mỗi lộ trình: "Ngày d/N · ôn a · nợ b · mới c", "Bắt đầu (k thẻ)"; **ngày nghỉ có nợ → thêm
  "Học bù (n)"** để khớp badge) và badge sidebar = Σ(mới + đến hạn + nợ). Thẻ danh sách đọc `today` / `completion` từ chính response
  danh sách.
- Trang chi tiết poll `GET /{id}` mỗi 2 s khi `isPathBusy` (PROCESSING hoặc job QUEUED/RUNNING, tức cả lúc dịch lại nghĩa trên bản
  nháp đang sửa); **mọi** lần tải (poll lẫn tải lại sau ghi) đi qua một bộ đếm `refreshSeq` nên phản hồi cũ không đè kết quả PATCH /
  activate mới hơn. `dayIndexFor(start, today, totalDays, mask?)` 1.0 nay đếm theo mặt nạ (qua `dayIndexForMask`) cho các chỗ dự
  phòng. Hàm thuần + selfcheck: `roadmapUtils.ts` (`scripts/selfCheck.ts` mục 21–24). Đã kiểm tay 1280 / 375 px trên trình duyệt (20/10 chiều, 26–27/10); bố cục dùng flex-wrap / 1 cột trên di động, biểu đồ cuộn trong khung riêng.

## 11. Bản 2.0 — điểm yếu, bổ khuyết, nhắc học (19/10, backend)

Mọi endpoint: vai trò USER (staff 403), cần Bearer (thiếu → 401), DTO `@JsonInclude(NON_NULL)` nên trường null bị bỏ khỏi JSON.

| Method | Path | Trả về / quy tắc |
|---|---|---|
| GET | `/api/insights/weaknesses?days=30` (1–365, ngoài khoảng → 400) | `{total, cards[{cardId, deckId, deckTitle, term, reading?, meaning, level?, kind?, reasons[], againCount, ease?, intervalDays?, medianReactionMs?, quizWrong}], groups{level, kind, kanji, deck}, canRemedial, suggestedDays}`. Thẻ yếu = hợp 4 tín hiệu (`reasons` theo đúng thứ tự này): `lapses` (≥ 3 "again" trong **min(14, days)** ngày), `low_ease` (`reviews.ease < 1.8`, trạng thái hiện tại — không theo cửa sổ), `slow` (trung vị `reaction_ms` trên ≥ 5 mẫu trong `days` ngày **> max(4 000, 2 × trung vị cá nhân)**), `quiz_wrong` (≥ 2 câu sai trong các lượt đã nộp trong `days` ngày, so `answers` với bản chụp `questions`). Câu không có đáp án: exam = sai, practice = không tính (câu chưa mở); riêng câu practice bấm **"Bỏ qua câu này"** (lưu `""`, đã chấm sai + ghi "again") = sai. Chỉ thẻ trong bộ còn xem được (`DeckService.canView`); tối đa 500; thứ tự: nhiều lý do → `againCount` giảm → term → cardId. Nhóm: count giảm, hoà thì "Khác" cuối rồi theo khoá; mỗi cách gom cộng lại = total. `canRemedial` = total ≥ 8; `suggestedDays` = §3.6 trên **150 thẻ yếu nhất** (đúng số thẻ lộ trình bổ khuyết sẽ lấy), kẹp 3..30 |
| GET | `/api/insights/friction` | `{personalMedianMs?, cards[{cardId, term, reading?, meaning, deckId, medianReactionMs, samples, ratio?}]}` — 30 ngày, ≥ 5 mẫu, **cùng quy tắc với lý do `slow`**: trung vị thẻ > 4 000 ms **và** > 2 × trung vị cá nhân (đúng gấp 2 hay đúng 4 000 ms là chưa vượt; chưa có trung vị cá nhân thì chỉ còn sàn 4 000). Tối đa 50, chậm nhất trước. `ratio` = thẻ / cá nhân, 1 chữ số thập phân; `personalMedianMs` / `ratio` vắng khi chưa đo |
| GET | `/api/insights/next?date=` | `[{kind, title, count, to}]` theo thứ tự cố định: `path_today` (mỗi lộ trình ACTIVE chưa chốt, đã tới ngày học 1, mới + đến hạn > 0; `to=/session?session=today&path=<id>`) → `due` ("Ôn thẻ đến hạn", `to=/decks`: thẻ đến hạn tới hết `date` **ngoài các lộ trình vừa gợi ý phiên hôm nay** — thẻ của lộ trình đã chốt hoàn thành / chưa bắt đầu đếm ở đây — và chỉ trong bộ còn xem được) → `catchup` (thẻ nợ, `to=/session?session=catchup&path=<id>`) → `remedial` (≥ 8 thẻ yếu, count = số thẻ yếu, `to=/roadmap?remedial=1`) → `next_chapter` (chương locked đầu của lộ trình ACTIVE mới nhất, `to=/roadmap/<id>`) → `library` (≤ 3 bộ public cùng cấp JLPT, không phải của mình, chưa lưu bản sao, **chưa học** — chưa có lượt ôn nào; `to=/decks/<id>`). Người mới chỉ có `library` |
| GET | `/api/insights/path-effect/{pathId}` (B3, 26/10) | `{pathId, title, remedial, total, chapters[{chapterId, position, title, stats}], remedialSplit?}`; `stats = {cards, studiedCards, reviews, again, againRate?, medianReactionMs?, retentionEligible, retained, retention7d?}` (tỷ lệ 0..1, null khi chưa có mẫu). Nguồn: `review_logs` có `path_id` = lộ trình, gán về chương qua `learning_path_cards`; lượt học nhanh (`cram`) **không tính**. Trung vị phản xạ của tổng tính lại trên mọi lượt. Nhớ sau 7 ngày: thẻ có lượt ôn (mọi nguồn trừ cram, không cần cùng lộ trình) ≥ 7 ngày sau lượt đầu trong lộ trình; nhớ = lượt đầu tiên sau mốc không phải "again". `remedialSplit {remedialPathId, remedialTitle, at, before, after}`: lộ trình thường + có lộ trình bổ khuyết tạo **sau** khi lộ trình bắt đầu → chia lượt ôn của lộ trình này tại lúc tạo bổ khuyết đầu tiên (thẻ bổ khuyết là bản sao không lưu nguồn nên so theo mốc thời gian); lộ trình bổ khuyết → null. Không phải của mình → 404; staff → 403 |
| POST | `/api/learning-paths/remedial?date=` | `{days 3..30, groupBy level\|kind\|kanji\|deck, title? ≤ 100}` → 201 lộ trình **ACTIVE** (cùng dạng `GET /{id}`; `overflow: true` khi lịch không vừa trần) `sourceType=remedial`, `sourceName="Điểm yếu"`, không job, không tốn hạn mức, không thông báo. Tiêu đề mặc định "Bổ khuyết dd/MM/yyyy". Lấy tối đa **150** thẻ yếu nhất (< 8 → 409 "... hiện có N"), mỗi nhóm một chương + một bộ thẻ **clone** (term / reading / meaning / segments / Hán-Việt / cấp / loại; SRS thẻ gốc giữ nguyên) trong thư mục "Bổ khuyết dd/MM/yyyy" (trùng tên → " (2)"). Tên chương: cấp ("N5"), loại ("Từ vựng" / "Ngữ pháp"), "Chữ 水", tên bộ gốc; chủ đề bộ: `kanji` khi gom theo chữ Hán, `bunpou` khi toàn ngữ pháp, còn lại `goi`. Quá 12 nhóm thì giữ 11 nhóm đông nhất, gộp phần còn lại vào "Khác"; "Khác" luôn là chương cuối. Lịch: trần `learning_path_daily_cap_default`, học cả tuần, bắt đầu `date`. Xoá như lộ trình thường (giữ thư mục + bộ thẻ). 400 khi `days` / `groupBy` / `title` sai |

- **Nhắc học** (`LearningPathReminderJob`, cron `app.learning-path.reminder-cron` = `0 5 * * * *` theo `app.learning-path.zone`;
  profile test đặt `-` để tắt): mỗi giờ phút 05, **từ** giờ `learning_path_reminder_hour` trở đi trong ngày (kẹp 0..23; đọc lỗi → 7) —
  các giờ sau chạy bù cho lộ trình chưa được xét (lượt đúng giờ lỗi, server tắt lúc 07:05). Ứng viên: ACTIVE, chưa chốt hoàn thành,
  `reminder = true`, `last_reminded_on <> hôm nay` (V21), **kích hoạt trước giờ nhắc hôm nay** (lộ trình vừa tạo / kích hoạt sau giờ nhắc
  được nhắc từ hôm sau). Mỗi người dùng một giao dịch riêng: lỗi của một người chỉ rollback phần của người đó (giờ sau chạy bù), không
  hỏng cả lượt. Lộ trình được "giành" bằng `LearningPathRepository.claimReminder` — `UPDATE ... SET last_reminded_on` có điều kiện (vẫn
  ACTIVE / bật nhắc / chưa chốt / chưa xét hôm nay), không ghi lại cả dòng từ bản đọc cũ nên không đè PATCH / complete chạy xen, và hai
  lượt chạy chồng nhau không nhắc trùng. Mọi lộ trình giành được ghi `last_reminded_on = hôm nay` (kể cả khi không gửi) → tối đa một
  nhắc / lộ trình / ngày; gửi `LEARNING_PATH_REMINDER {pathId, title, dayIndex, totalDays, newCount, dueCount, behindCount}` (chỉ trong
  app) khi mới + đến hạn + nợ > 0 và `today.state` là `during` / `after`; **trước ngày học 1 và ngày nghỉ theo `studyDays` thì im lặng**
  kể cả khi có thẻ đến hạn (người học đã chọn nghỉ; thẻ đó vẫn hiện ở "Học gì tiếp" / phiên hôm nay khi họ tự mở app). Số liệu =
  `todaySummary`, batch theo người dùng. Tắt nhắc: `PATCH /api/learning-paths/{id} {reminder: false}`.
- **Nhắc qua email** (B4, V34 `remind_email`, mặc định tắt; bật: `PATCH {remindEmail: true}`, chỉ có tác dụng khi `reminder` bật):
  sau khi nhắc trong app, mỗi người nhận **một email mỗi lượt** gộp các lộ trình vừa được nhắc mà bật email (cột đọc lại lúc gửi) —
  tiêu đề "Hôm nay học N thẻ – <tên lộ trình>" hoặc "… trong K lộ trình", thân: ngày học, thẻ mới / đến hạn / nợ, link `/roadmap/{id}`,
  cách tắt. Gửi **sau commit** giao dịch của người đó (`MailService.sendNotice`, lỗi gửi chỉ ghi log); bỏ qua tài khoản bị khoá / đã xoá /
  chưa xác thực email; thiếu `spring.mail.host` → một dòng log "bỏ qua N email nhắc học" mỗi lượt.
- Test: `InsightIT` (4 tín hiệu + quyền xem, cửa sổ `days` và mốc 14 ngày, bỏ trống quiz exam / practice, trần 150 thẻ + `suggestedDays`,
  biên ma sát, thứ tự "học gì tiếp" kể cả lộ trình đã hoàn thành và bộ Thư viện đã học), `InsightGroupingTest` (hàm thuần gom nhóm),
  `LearningPathIT` (`remedial_*`: kanji / level / deck / kind, chủ đề bộ, SRS thẻ gốc), `LearningPathReminderJobIT` (giờ cấu hình, chạy
  bù, before / rest / after, kích hoạt sau giờ nhắc), `LearningPathReminderJobTest` (kẹp giờ, lỗi một người không hỏng cả lượt).
