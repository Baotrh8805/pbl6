# Spec: Lộ trình học tập từ tài liệu (thư mục → chương → bộ thẻ → lịch theo ngày)

Ngày 14/10/2026 · nhánh `backend-feature-learnmode` · trạng thái: **đã duyệt 14/10, đã triển khai 14/10/2026** theo
[plans/2026-10-14-lo-trinh-hoc-tap.md](../plans/2026-10-14-lo-trinh-hoc-tap.md).

## 1. Bối cảnh

- Trang `/roadmap` hiện chỉ là view tính tiến độ theo cấp JLPT từ mọi bộ thẻ (`frontend/src/pages/RoadmapPage.tsx`);
  nhãn "AI Path Architecture" là chữ trang trí. UC-37 (đề xuất lộ trình) chưa có gì.
- Yêu cầu: người dùng **nhập văn bản hoặc tải tài liệu + chọn số ngày** → hệ thống phân tích, **tự tạo một thư mục**
  chứa các **chương** (mỗi chương một bộ thẻ, thẻ bóc từ chương đó) và **chia khối lượng học theo ngày**.
- Dùng lại pipeline bóc tách sẵn có (TEXT → ANALYZE → ENRICH, [../../EXTRACTION.md](../../EXTRACTION.md)), SRS,
  thư mục/bộ thẻ. Không thêm AI/Neo4j mới.

### Quyết định đã chốt với người dùng

| # | Quyết định |
|---|---|
| Q1 | **Chương theo cấu trúc tài liệu** (tiêu đề `第1課`, `Bài 1`, `Unit 1`, heading DOCX…); không nhận ra → **chia theo ngày**. |
| Q2 | **Xem trước rồi mới tạo**: sau phân tích là bản nháp (DRAFT) để đổi tên/gộp chương, bỏ thẻ, đổi số ngày; bấm "Tạo lộ trình" mới sinh thư mục + bộ thẻ. |
| Q3 | **Ngày theo lịch**: ngày N = ngày bắt đầu + N−1; học trễ thì hiện "nợ". |
| Q4 | **Thay hẳn** trang `/roadmap` bằng danh sách lộ trình + "hôm nay học gì". |

### Phát hiện kỹ thuật quyết định thiết kế

- Cấu trúc tài liệu chỉ còn **dòng** khi tới `analyze`: `docx_reader` bỏ style heading, `pdf_reader` chỉ giữ
  `blocks[].page`, `split_sentences` (`pipeline.py:63-70`) **xoá** dòng tiêu đề không có kana/kanji, còn `第1課` bị
  tách thành từ vựng `課`. → Tách chương **trước** khi phân tích và bỏ dòng tiêu đề khỏi thân chương.
- `_prose_items`/`_list_items` gộp từ theo lemma trên toàn văn bản, `_finish` bỏ `_order` → không ánh xạ ngược item
  về chương. → Phân tích **từng chương**, gộp trùng toàn tài liệu theo lần xuất hiện đầu.
- Backend không có khái niệm "thẻ mới/ngày" hay học một phần bộ thẻ; StudyPage xếp hàng toàn bộ thẻ đến hạn. → Thêm
  `?range=a-b`.
- `ExtractionWorker.analyzeAndFinish` không có hook khi DONE → thêm Spring event.

## 2. Kiến trúc & luồng

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

Trạng thái: `PROCESSING → DRAFT → ACTIVE`, hoặc `FAILED`. Xoá lộ trình = xoá kế hoạch + job bóc tách;
**thư mục / bộ thẻ / review giữ nguyên**.

### Quy tắc tách chương (`ai-service/app/extract/chapters.py`, thuần hàm)

- Dòng là tiêu đề khi (≤ 80 ký tự, không kết thúc `。！？!?`) và: là block DOCX có `heading`, hoặc khớp
  `^第\s*(\d{1,3}|[一二三四五六七八九十百]{1,4})\s*(課|章|部|節|回|話|単元)…` hoặc
  `^(Lesson|Unit|Chapter|Part|Section|Bài|Chương|Phần|Mục|レッスン|ユニット)\s*\d{1,3}…` (không phân biệt hoa thường,
  nhận số fullwidth). Dòng `1.`/`１．` **không** là tiêu đề.
- `detected = số tiêu đề ≥ 2`. Không detected → một chương, văn bản **nguyên vẹn**.
- Detected: thân chương = dòng giữa hai tiêu đề (bỏ dòng tiêu đề); tiêu đề chương = cả dòng (cắt 100). Phần trước
  tiêu đề đầu: có tiếng Nhật → chương "Mở đầu", không thì gộp vào chương 1. Trang PDF **không** là chương.
- Gộp trùng: từ xuất hiện ở chương 1 và 5 → chỉ chương 1, `frequency` cộng dồn. Giới hạn 600/100 vẫn tính toàn tài liệu.

### Quy tắc chia ngày (`LearningPathScheduler`, thuần hàm, có unit test)

- `allocate(cardCounts, D)`: n chương, D ngày. `n ≥ D` → chương i (0-based) vào ngày `i*D/n + 1` (nhiều chương chung
  ngày). `n < D` → quota tỉ lệ số thẻ, mỗi chương ≥ 1 ngày, phần dư lớn nhất được +1 (hoà → chương trước), dải liên tiếp.
- Trong chương: `perDay = ceil(cards/days)`; ngày thứ k của chương phủ vị trí `[(k−1)·perDay+1 .. min(k·perDay, cards)]`;
  ngày không còn thẻ → `tasks = []` ("ngày ôn tập").
- Dự phòng không có chương: `k = days ≤ 14 ? days : ceil(days/7)`, `k = min(k, số thẻ)`; chia đều thẻ; tên "Ngày N"
  hoặc "Tuần k (ngày a–b)".
- `dayIndex = DAYS.between(startDate, today) + 1`; `state = before | during | after`. Backend nhận `?date=YYYY-MM-DD`
  từ máy khách, mặc định `app.learning-path.zone=Asia/Ho_Chi_Minh`.

## 3. Hợp đồng API (`/api/learning-paths`, JWT; của người khác = 404)

| Method | Path | Body / Query | Trả về |
|---|---|---|---|
| POST | `/` | multipart `file`\|`text`, `days` (1–365), `title?` (≤100), `startDate?`, `options?` (JSON) | 202 `LearningPathResponse` (PROCESSING). 400 ngày sai, 429 vượt hạn mức ngày (**dùng chung bộ đếm** với bóc tách) |
| GET | `/` | — | mới nhất trước, không có `chapters/days`; `today` chỉ khi ACTIVE |
| GET | `/{id}` | `?date=` | đầy đủ: `job{status,stage,errorMessage,stats}`, `chapters[]`, `days[]`, `today` |
| PATCH | `/{id}` | `{title?, totalDays?, startDate?}` | DRAFT/ACTIVE (ACTIVE đổi ngày → tính lại dải); 409 nếu PROCESSING, 400 nếu FAILED |
| PATCH | `/{id}/chapters/{cid}` | `{title}` | DRAFT only (409) |
| POST | `/{id}/chapters/{cid}/merge-up` | — | gộp vào chương trước, đánh lại `position`; 400 ở chương đầu |
| PATCH | `/{id}/items` | `[{id, selected?, …}]` (như `ItemPatch` bóc tách) | proxy `ExtractionService.patchItems`; DRAFT only |
| GET | `/{id}/chapters/{cid}/items` | — | `ExtractionItemResponse[]` |
| POST | `/{id}/activate` | `{startDate?, totalDays?}` | 201 ACTIVE; 400 nếu không còn thẻ chọn; 409 nếu không DRAFT |
| DELETE | `/{id}` | — | 204 |

`LearningPathResponse` (NON_NULL): `id, title, status, sourceType, sourceName, totalDays, startDate, chaptersDetected,
jobId, folderId, createdAt, activatedAt, errorMessage, job{status, stage, errorMessage, stats},
chapters[{id, position, title, deckId, deckDeleted, cardCount, vocabCount, grammarCount, dayFrom, dayTo, perDay}],
today{date, dayIndex, state, tasks[{chapterId, chapterTitle, deckId, fromPos, toPos}]}, days[{dayIndex, date, tasks[]}]`.
DRAFT: `cardCount`/dải ngày tính **sống** từ item `selected` + `allocate`; ACTIVE: chốt trong DB.

Hợp đồng ai-service: `ExtractionOptions.splitChapters: bool = false`; mọi item có `chapter: int|null`; khi bật,
`stats.chaptersDetected` + `stats.chapters[{index,title,vocab,grammar}]`; `/text` block có `heading: int|null`.

## 4. Quyết định mặc định (đã nêu khi duyệt)

- Thứ tự thẻ trong bộ chương = **thứ tự tài liệu** (vocab rồi grammar), không sắp N5→N1 như `buildDeck`.
- Không nhận ra chương → `days ≤ 14`: một bộ mỗi ngày "Ngày N"; `> 14`: một bộ mỗi tuần "Tuần k (ngày a–b)".
- Chương ít thẻ hơn số ngày → ngày trống, UI hiện "ngày ôn tập".
- Xoá lộ trình xoá cả job bóc tách ẩn; job lộ trình không hiện ở `/extractions` (cột `purpose`), nhưng dùng chung hạn
  mức 5 lượt/ngày; `DELETE /extractions/{id}` từ chối job của lộ trình (409).
- Hook DONE bằng Spring event (`ExtractionJobFinishedEvent`), listener **không bao giờ ném** (lỗi → path FAILED).
- Tên thư mục trùng → hậu tố " (2)", tính **trước** khi gọi `createFolder` (bắt 409 trong transaction sẽ rollback-only).
- Tên "Tuần k (ngày a–b)" không tự đổi khi sửa số ngày sau đó; UI luôn hiện `dayFrom–dayTo`.
- Path FAILED tốn một lượt hạn mức, chưa có `rerun`.

## 5. Rủi ro

- Tiêu đề nhận nhầm/sót (OCR nhiễu `第l課`, heading là đoạn in đậm thường): bản nháp + gộp chương là lối thoát.
- Gộp trùng toàn tài liệu + cap 600 → chương sau có thể mỏng.
- Vị trí thẻ thay đổi khi người dùng sửa bộ thẻ sau activate → task theo vị trí trôi; `sliceRange` kẹp biên.
- Deck/folder bị xoá ngoài lộ trình: FK `SET NULL`, API không vỡ (`deckDeleted`).
