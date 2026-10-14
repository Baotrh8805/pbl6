# Lộ trình học tập từ tài liệu (UC-37, bản theo tài liệu)

Người dùng nhập văn bản hoặc tải tài liệu + chọn số ngày → hệ thống bóc tách ([EXTRACTION.md](EXTRACTION.md)), **tách chương**,
cho xem bản nháp để chỉnh, rồi tạo **một thư mục, mỗi chương một bộ thẻ** và **chia khối lượng học theo ngày**. Trang
`/roadmap` là danh sách lộ trình + "hôm nay học gì"; `/roadmap/:id` là chi tiết (đang xử lý / bản nháp / đang học).
Chưa cá nhân hoá theo điểm yếu của từng người (phần còn lại của UC-37 và GraphRAG vẫn chưa làm).

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
| PROCESSING | chỉ xem; `PATCH /{id}` → 409 |
| DRAFT | đổi tên / số ngày / ngày bắt đầu, đổi tên chương, gộp chương, bỏ chọn thẻ, kích hoạt |
| ACTIVE | đổi tên, đổi `startDate` / `totalDays` (tính lại dải ngày), xem lịch, học theo "Hôm nay" |
| FAILED | chỉ xoá (`PATCH` → 400). Chưa có `rerun`; lượt hạn mức đã tính |

Xoá lộ trình = xoá kế hoạch + job bóc tách ẩn; **thư mục / bộ thẻ / lịch sử ôn tập giữ nguyên**.

## 3. Tách chương (`ai-service/app/extract/chapters.py`, hàm thuần)

Chỉ chạy khi `ExtractionOptions.splitChapters = true` (lộ trình bật sẵn; bóc tách thường không bật).

- Dòng ứng viên tiêu đề khi (≤ 80 ký tự, không kết thúc `。！？!?`) **và** khớp
  `^第\s*(\d{1,3}|[一二三四五六七八九十百]{1,4})\s*(課|章|部|節|回|話|単元)…`, hoặc
  `^(Lesson|Unit|Chapter|Part|Section|Bài|Chương|Phần|Mục|レッスン|ユニット)\s*\d{1,3}…` (không phân biệt hoa thường, nhận số
  fullwidth). Dòng `1.` / `１．` **không** là tiêu đề.
- **Loại câu văn**: dòng chứa `、` hoặc `。` ở bất kỳ đâu không phải tiêu đề; phần sau số phải ≤ 50 ký tự và không bắt đầu
  bằng `で|に|の|は|が|を|目` (trợ từ dính vào số: `第3章では…`, `第2回目の授業で…`).
- **Xếp hạng họ từ khoá**: hạng 1 = `課|章|単元|Bài|Chương|Lesson|Unit|Chapter|レッスン|ユニット`; hạng 2 =
  `部|節|回|話|Phần|Mục|Part|Section`. Chỉ tách theo **họ hạng cao nhất xuất hiện ≥ 2 lần** (hạng 1 nếu có ≥ 2, không thì
  hạng 2 nếu có ≥ 2); dòng của họ hạng thấp hơn **ở lại trong thân chương** ("Bài 1 / Phần 1 / Phần 2 / Bài 2" → 2 chương).
- **DOCX** (hạng 0, ưu tiên hơn regex khi khớp ≥ 2 dòng): chỉ dùng heading ở **cấp nhỏ nhất** (gần 1 nhất) xuất hiện ≥ 2
  lần; cấp sâu hơn (vd. H2 `語彙`/`文法` lặp ở mỗi bài) ở lại trong thân. Tập so khớp dựng từ dòng đầu của các block cấp đó.
- **Bỏ mục lục / phần đầu & cuối sách** (14/10): (1) cụm ≥ 3 dòng tiêu đề liên tiếp **không có thân** hoặc **kết thúc
  bằng số trang** (`第1課 あいさつ ...... 12`) là mục lục → bỏ; (2) tiêu đề **lặp** (mục lục sót, header chạy đầu trang PDF)
  chỉ lần đầu mở chương, các lần sau bị xoá khỏi thân; (3) phần trước tiêu đề thật đầu tiên bị **bỏ hẳn** nếu chứa dòng
  `はじめに / まえがき / 本書の使い方 / 目次 / 凡例 / Lời nói đầu / Cách sử dụng / Mục lục / Preface / Contents…` (không thì giữ
  "Mở đầu" như dưới); chương có tiêu đề là các từ đó cũng bị bỏ; (4) chương cuối bị cắt tại dòng `付録 / 索引 / 解答 / Phụ lục
  / Đáp án / Appendix / Index`. Danh sách phần đã bỏ trả về ở `stats.skippedSections`, bản nháp hiện "Đã bỏ qua: …".
- `chaptersDetected` = số tiêu đề được chọn ≥ 2. Không nhận ra → một chương, văn bản **nguyên vẹn**; backend dùng thuật toán chia theo ngày (mục 4).
- Nhận ra: thân chương = các dòng giữa hai tiêu đề (bỏ dòng tiêu đề, vì `split_sentences` vốn xoá nó và `第1課` sẽ thành
  từ vựng `課`); tiêu đề chương = cả dòng (cắt 100 ký tự). Phần trước tiêu đề đầu: có tiếng Nhật → chương "Mở đầu", không thì
  gộp vào chương 1. Trang PDF **không** là chương.
- Backend `buildDraft`: chương trong `stats.chapters` **không có item nào** bị gộp (bỏ hàng, đánh lại `position` 1..n)
  ngay khi dựng bản nháp, nên bản nháp không hiện chương rỗng và khớp với kết quả `activate`.
- Phân tích **từng chương**, rồi gộp trùng toàn tài liệu theo lần xuất hiện đầu (từ ở chương 1 và 5 → chỉ chương 1,
  `frequency` cộng dồn). Giới hạn 600 từ / 100 mẫu ngữ pháp tính cho cả tài liệu.
- Đầu ra: `item.chapter`, `stats.chaptersDetected`, `stats.chapters[{index, title, vocab, grammar}]`, `stats.skippedSections[]`; `/text` trả thêm
  `blocks[].heading` cho DOCX.

Hạn chế đã biết: OCR nhiễu (`第l課`) hoặc heading chỉ là đoạn in đậm thường bị sót / nhận nhầm → dùng bản nháp: sửa tên,
**gộp chương lên trên**. Gộp trùng + cap 600 có thể làm chương sau mỏng.

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

`LearningPathResponse` (bỏ trường null): `id, title, status, sourceType, sourceName, totalDays, startDate, chaptersDetected,
jobId, folderId, createdAt, activatedAt, errorMessage, job{status, stage, errorMessage, stats},
chapters[{id, position, title, deckId, deckDeleted, cardCount, vocabCount, grammarCount, dayFrom, dayTo, perDay}],
today{date, dayIndex, state, tasks[{chapterId, chapterTitle, deckId, fromPos, toPos}]}, days[{dayIndex, date, tasks[]}]`.
DRAFT: `cardCount` và dải ngày tính **sống** từ item `selected` + `allocate`; ACTIVE: chốt trong DB.

Liên quan: `GET /api/extractions` **không** liệt kê job của lộ trình; `DELETE /api/extractions/{id}` với job lộ trình → 409
(xoá qua `DELETE /api/learning-paths/{id}`). Các thao tác sửa job bóc tách (`PUT /text`, `POST /rerun`, `POST /enrich`,
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

## 7. Hạn chế đã biết

- Tên "Tuần k (ngày a–b)" / "Ngày N" **không tự đổi** khi người dùng sửa số ngày sau đó; UI luôn hiện `dayFrom–dayTo`.
- Task theo **vị trí thẻ**: sửa / thêm / xoá thẻ trong bộ chương sau khi kích hoạt làm dải trôi; `sliceRange` kẹp biên, không vỡ.
- Lộ trình FAILED chưa có "Chạy lại"; vẫn tốn một lượt hạn mức dùng chung với bóc tách.
- Tiêu đề chương nhận sót / nhầm (xem mục 3); gộp trùng toàn tài liệu làm chương sau có thể ít thẻ → nhiều "ngày ôn tập".
- Chưa cá nhân hoá theo điểm yếu, chưa nhắc học, chưa lưu file gốc.

## 8. Test

- Backend: `LearningPathSchedulerTest` (thuần hàm), `LearningPathIT` (ai-service giả lập `@MockitoBean AiServiceClient`):
  `cd backend-core && mvn test -Dtest=LearningPathSchedulerTest,LearningPathIT`.
- ai-service: `cd ai-service && python -m pytest -q tests/test_chapters.py` (cùng `test_pipeline.py` cho `splitChapters`).
- Frontend: `cd frontend && npm run lint && npm run build && npm run selfcheck` (`roadmapUtils`).
- Smoke end-to-end: `npm run smoke:learning-path` (cần backend + ai-service thật); `npm run e2e` chạy nó trên DB cô lập
  (khởi động ai-service trước: `cd ai-service && venv/Scripts/uvicorn.exe app.main:app --port 8000`).
