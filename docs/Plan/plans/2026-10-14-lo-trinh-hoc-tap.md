# Kế hoạch triển khai: Lộ trình học tập

Spec: [../specs/2026-10-14-lo-trinh-hoc-tap-design.md](../specs/2026-10-14-lo-trinh-hoc-tap-design.md) (nguồn sự thật khi plan mâu thuẫn).
Nhánh `backend-feature-learnmode`. Mỗi task commit riêng, thông điệp commit tiếng Việt ngắn gọn, kết thúc bằng dòng
`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Ràng buộc chung (Global Constraints)

- **TDD**: viết test trước, chạy đỏ, rồi code cho xanh. Không bỏ test cũ.
- **Không đổi hành vi bóc tách hiện có** khi `splitChapters=false`; `ExtractionIT`, toàn bộ `pytest`, `npm run build/lint/selfcheck` phải xanh sau mỗi task.
- Máy dev 8 GB: **không** chạy `pytest` và `mvn test` song song.
- Lệnh kiểm: ai-service `cd ai-service && venv/Scripts/python.exe -m pytest -q` (nếu không có venv: `python -m pytest -q`); backend `cd backend-core && mvn -q test` (hoặc `mvn -q -Dtest=<Class> test`); frontend `cd frontend && npm run lint && npm run build && npm run selfcheck`.
- Chuỗi hiển thị cho người dùng bằng tiếng Việt; comment code tiếng Việt ngắn theo phong cách file xung quanh.
- Backend ném `ResponseStatusException(HttpStatus.X, "thông điệp tiếng Việt")`; jsonb dùng `@JdbcTypeCode(SqlTypes.JSON)`; `ddl-auto=validate` nên entity phải khớp migration.
- Frontend: helper thuần nằm trong `src/features/roadmap/roadmapUtils.ts`, chỉ import tương đối `.ts` (selfCheck chạy bằng node, không có alias `@/`). Token Tailwind M3 như các trang hiện có (`bg-surface-container-lowest`, `text-label-sm`, `material-symbols-outlined`…).
- Hợp đồng API và quy tắc chia ngày: xem spec mục 2–3, **giá trị trong spec là bắt buộc**.

---

## Task 1: ai-service — `Block.heading`, heading DOCX, module `chapters.py`

**Tệp:** `ai-service/app/extract/readers/__init__.py`, `ai-service/app/extract/readers/docx_reader.py`, `ai-service/app/extract/chapters.py` (mới), `ai-service/tests/test_docx_reader.py`, `ai-service/tests/test_chapters.py` (mới).

### 1a. `Block.heading`
- `Block` dataclass (`readers/__init__.py` ~L26-36): thêm trường `heading: Optional[int] = None`; `to_dict()` thêm khoá `"heading": self.heading`.
- `docx_reader.read_docx` (~L70-76, vòng duyệt `<w:p>`): thêm `_heading_level(p_el, para_styles) -> Optional[int]`:
  - `para_styles = {s.style_id: s for s in document.styles if s.type == WD_STYLE_TYPE.PARAGRAPH}`.
  - Đọc `pPr/pStyle@w:val` → style → theo `style.name` và `style.base_style` (tối đa 3 cấp) khớp `re.fullmatch(r"(?i)heading (\d)", name)` hoặc `見出し (\d)`.
  - Không có → `pPr/outlineLvl@w:val` (0-based → +1).
  - Truyền `heading=lvl` vào `Block(...)`.
- Test (viết trước, trong `test_docx_reader.py`, mẫu dựng DOCX bằng python-docx đã có): `d.add_heading("第1課 あいさつ", level=1)`, đoạn thường, `d.add_heading("第2課", level=2)` → `blocks[0].heading == 1`, đoạn thường `heading is None`, block thứ ba `heading == 2`, `to_dict()["heading"]` có mặt.

### 1b. `chapters.py`
```python
@dataclass
class Chapter:
    index: int            # 1-based
    title: Optional[str]  # None khi không nhận dạng được (một chương duy nhất)
    text: str             # đã bỏ dòng tiêu đề
    start_line: int
    end_line: int         # exclusive

def heading_title(line: str) -> Optional[str]      # None nếu không phải tiêu đề
def split_chapters(text: str, blocks: Optional[list[dict]]) -> tuple[list[Chapter], bool]
```
Quy tắc:
- Dòng (đã `strip`) là tiêu đề khi `len ≤ 80`, không kết thúc `。！？!?`, và: nằm trong tập text của block DOCX có `heading is not None` (so sánh sau strip), **hoặc** khớp một trong:
  - `^第\s*(?:[0-9０-９]{1,3}|[一二三四五六七八九十百]{1,4})\s*(?:課|章|部|節|回|話|単元)\s*[:：.．\-－~〜]?\s*(.{0,50})$`
  - `^(?:Lesson|Unit|Chapter|Part|Section|Bài|Chương|Phần|Mục|レッスン|ユニット)\s*[0-9０-９]{1,3}\s*[:：.．\-－)]?\s*(.{0,50})$` với `re.IGNORECASE`.
  - Phần đuôi tiêu đề không được chứa `。`. Dòng chỉ có `1.` / `１．` **không** là tiêu đề.
- `detected = số dòng tiêu đề ≥ 2`. Không detected → `([Chapter(1, None, text, 0, n_lines)], False)`, **văn bản nguyên vẹn**.
- Detected: thân chương = các dòng nằm giữa hai tiêu đề (bỏ dòng tiêu đề); `title` = cả dòng tiêu đề đã strip, cắt 100 ký tự. Phần trước tiêu đề đầu tiên: `has_japanese(preamble)` (từ `jachars.py`) → `Chapter(1, "Mở đầu", …)` và các chương sau dồn index; không có tiếng Nhật → nối phần đó vào đầu thân chương 1.
- Test `tests/test_chapters.py` (thuần, không cần Sudachi/JMdict): `第1課`, `第２章 かいもの`, `第三課`; `Lesson 3 Greetings`; `Bài 1: Chào hỏi`; `Unit 2`; tiêu đề từ block DOCX (`blocks=[{"text":"...", "heading":1}]`) không khớp regex vẫn là tiêu đề; chỉ 1 tiêu đề → `detected False` và `chapters[0].text == text`; preamble có tiếng Nhật → chương 1 là "Mở đầu", không có → gộp vào chương 1; dòng tiêu đề không còn trong `text` của chương nào; câu `第1課で勉強します。` không phải tiêu đề; dòng `1.` không phải tiêu đề; tiêu đề dài > 100 bị cắt còn 100; `heading_title("Chapter 12 - Food") == "Chapter 12 - Food"`.

Chạy `pytest -q` toàn bộ; cập nhật nếu test nào assert dict `to_dict()` chính xác (kiểm `tests/test_router.py` ~L26-28 chỉ assert `meta`, nên thường không ảnh hưởng).

---

## Task 2: ai-service — `pipeline.analyze` với `splitChapters`, option router

**Tệp:** `ai-service/app/extract/pipeline.py`, `ai-service/app/api/extract_router.py`, `ai-service/tests/test_pipeline.py`, `ai-service/tests/test_router.py`.

- `extract_router.ExtractionOptions` (~L33-43): thêm `splitChapters: bool = False`.
- `pipeline.analyze` (~L185-211): sau phần rubies/`ocr_lines`:
  ```python
  split = bool(opts.get("splitChapters"))
  chapters, detected = split_chapters(text, blocks) if split else ([Chapter(1, None, text, 0, 0)], False)
  items, grammar, n_sent, n_tok, layouts = [], [], 0, 0, []
  for ch in chapters:
      layout = mode if mode in ("list", "prose") else detect_layout(ch.text)
      ci, gi, s, t = ([], [], 0, 0)
      if layout == "list":
          ci, gi, s, t = _list_items(ch.text, opts, rubies, ocr_lines)
          if not ci and mode != "list":
              layout = "prose"
      if layout == "prose":
          ci, gi, s, t = _prose_items(ch.text, opts, rubies, ocr_lines)
      for it in ci + gi:
          it["chapter"] = ch.index if split else None
          it["_order"] = (ch.index,) + tuple(it["_order"])
      items += ci; grammar += gi; n_sent += s; n_tok += t; layouts.append(layout)
  if split:
      items, grammar = _merge_chapters(items), _merge_chapters(grammar)
  result = _finish(items, grammar, n_sent, n_tok, "list" if layouts and all(l == "list" for l in layouts) else "prose", truncated)
  if split:
      counts = Counter((it["chapter"], it["kind"]) for it in result["items"])
      result["stats"]["chaptersDetected"] = detected
      result["stats"]["chapters"] = [{"index": ch.index, "title": ch.title,
                                      "vocab": counts[(ch.index, "vocab")], "grammar": counts[(ch.index, "grammar")]}
                                     for ch in chapters]
  return result
  ```
  `_merge_chapters(lst)`: gộp theo khoá `(kind, term)` — giữ item có `_order` nhỏ nhất (chương đầu), cộng `frequency`, giữ `example` của bản đầu, `conf` = max. Khi `split=False` mọi item có `"chapter": None` và `stats` **không** có khoá `chapters`/`chaptersDetected`.
  `MAX_VOCAB/MAX_GRAMMAR` vẫn áp toàn tài liệu trong `_finish` (không đổi `_finish`).
- Test `test_pipeline.py` (viết trước; không cần jmdict nếu chỉ assert term/chapter/frequency):
  - `analyze("第1課\n私は毎日勉強します。\n第2課\n勉強は面白いです。学校へ行きます。", None, {"splitChapters": True, "levelFilter": "all", "includeGrammar": False})` → `stats["chaptersDetected"] is True`; `stats["chapters"]` có 2 phần tử với `index` 1,2 và `title` `"第1課"`, `"第2課"`; item `勉強` có `chapter == 1` và `frequency == 2`; `学校` có `chapter == 2`; không item nào `term == "課"`; `position` là 1..n liên tiếp; mọi item ở chương 1 đứng trước chương 2.
  - Không bật option → mọi item `chapter is None`, `"chapters" not in stats`.
  - Bật nhưng văn bản không có tiêu đề → `chaptersDetected False`, mọi item `chapter == 1`, `stats["chapters"]` có 1 phần tử `title None`.
  - `extractMode="list"` + 2 chương dạng danh sách `単語<TAB>nghĩa` → item đúng chương.
- `test_router.py`: tập khoá item chính xác (~L140-142) thêm `"chapter"`; thêm `test_analyze_split_chapters` gọi `/api/extract/analyze` với `options.splitChapters=true` và assert `stats["chaptersDetected"]`, `items[0]["chapter"] == 1`.

---

## Task 3: backend — migration V13, entity, repository, `LearningPathScheduler`

**Tệp:** `backend-core/src/main/resources/db/migration/V13__learning_paths.sql` (mới), `model/LearningPath.java`, `model/LearningPathChapter.java` (mới), `model/ExtractionJob.java`, `model/ExtractionItem.java`, `repository/LearningPathRepository.java`, `repository/LearningPathChapterRepository.java` (mới), `repository/ExtractionItemRepository.java`, `repository/ExtractionJobRepository.java`, `service/LearningPathScheduler.java` (mới), `src/test/java/com/pbl6/flashcard/service/LearningPathSchedulerTest.java` (mới). Package gốc `com.pbl6.flashcard`.

### 3a. Migration (đúng nội dung)
```sql
-- Lộ trình học tập (docs/LEARNING_PATH.md): một lượt bóc tách (purpose = 'learning_path') -> chương -> mỗi chương
-- một bộ thẻ trong một thư mục + lịch học theo ngày. Xoá lộ trình chỉ xoá kế hoạch, bộ thẻ / thư mục giữ nguyên.
ALTER TABLE extraction_jobs
    ADD COLUMN purpose varchar(16) NOT NULL DEFAULT 'extraction' CHECK (purpose IN ('extraction', 'learning_path'));

CREATE TABLE learning_paths (
    id                uuid PRIMARY KEY,
    user_id           bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title             varchar(100) NOT NULL,
    source_type       varchar(10) NOT NULL CHECK (source_type IN ('text', 'image', 'pdf', 'docx', 'txt')),
    source_name       varchar(255),
    status            varchar(12) NOT NULL CHECK (status IN ('PROCESSING', 'DRAFT', 'ACTIVE', 'FAILED')),
    job_id            uuid REFERENCES extraction_jobs (id) ON DELETE SET NULL,
    folder_id         uuid REFERENCES folders (id) ON DELETE SET NULL,
    total_days        integer NOT NULL CHECK (total_days BETWEEN 1 AND 365),
    start_date        date NOT NULL,
    chapters_detected boolean,
    error_message     varchar(500),
    created_at        timestamptz(6) NOT NULL DEFAULT now(),
    activated_at      timestamptz(6)
);
CREATE INDEX idx_learning_paths_user ON learning_paths (user_id, created_at DESC);
CREATE INDEX idx_learning_paths_job ON learning_paths (job_id);

CREATE TABLE learning_path_chapters (
    id          uuid PRIMARY KEY,
    path_id     uuid NOT NULL REFERENCES learning_paths (id) ON DELETE CASCADE,
    position    integer NOT NULL,
    title       varchar(100) NOT NULL,
    -- decks.id là varchar(255) (V1). Xoá bộ thẻ -> NULL, API hiện "bộ thẻ đã xoá".
    deck_id     varchar(255) REFERENCES decks (id) ON DELETE SET NULL,
    card_count  integer,      -- NULL khi DRAFT (tính sống từ extraction_items), chốt khi ACTIVE
    day_from    integer,
    day_to      integer
);
CREATE INDEX idx_learning_path_chapters_path ON learning_path_chapters (path_id, position);

ALTER TABLE extraction_items
    ADD COLUMN chapter_no integer,                                                       -- số chương ai-service trả
    ADD COLUMN chapter_id uuid REFERENCES learning_path_chapters (id) ON DELETE SET NULL; -- chương sau khi gộp / sửa
CREATE INDEX idx_extraction_items_chapter ON extraction_items (chapter_id);
```
Kiểm tra kiểu cột `decks.id` trong `V1__baseline.sql` trước khi dùng `varchar(255)`.

### 3b. Entity / repo
- `ExtractionJob`: `@Column(nullable = false, length = 16) private String purpose = "extraction";` + hằng `PURPOSE_EXTRACTION = "extraction"`, `PURPOSE_LEARNING_PATH = "learning_path"` + getter/setter.
- `ExtractionItem`: `Integer chapterNo` (`chapter_no`), `UUID chapterId` (`chapter_id`) + getter/setter.
- `LearningPath`: `UUID id` (gán tay như `ExtractionJob`), `Long userId`, `String title`, `sourceType`, `sourceName`, `status` (hằng `PROCESSING/DRAFT/ACTIVE/FAILED`), `UUID jobId`, `UUID folderId`, `int totalDays`, `LocalDate startDate`, `Boolean chaptersDetected`, `String errorMessage`, `Instant createdAt`, `Instant activatedAt`. Theo phong cách `ExtractionJob` (kiểu `Instant` cho timestamptz).
- `LearningPathChapter`: `UUID id`, `UUID pathId`, `int position`, `String title`, `String deckId`, `Integer cardCount`, `Integer dayFrom`, `Integer dayTo`.
- `LearningPathRepository`: `Optional<LearningPath> findByIdAndUserId(UUID, Long)`, `List<LearningPath> findByUserIdOrderByCreatedAtDesc(Long)`, `Optional<LearningPath> findByJobId(UUID)`, `@Modifying @Query("UPDATE LearningPath p SET p.status = 'FAILED', p.errorMessage = :m WHERE p.status = 'PROCESSING'") int failProcessing(@Param("m") String m)`.
- `LearningPathChapterRepository`: `List<LearningPathChapter> findByPathIdOrderByPositionAsc(UUID)`.
- `ExtractionItemRepository`: thêm `List<ExtractionItem> findByChapterIdOrderByPositionAsc(UUID)`.
- `ExtractionJobRepository`: thêm `List<ExtractionJob> findTop50ByUserIdAndPurposeOrderByCreatedAtDesc(Long, String)`.
- Xác nhận: chạy `mvn -q -Dtest=MigrationUpgradePathTest,FolderDeleteIT test` xanh (ddl validate).

### 3c. `LearningPathScheduler` (final class, static, thuần) + unit test viết trước
```java
public final class LearningPathScheduler {
    public record DayRange(int dayFrom, int dayTo) { public int days() { return dayTo - dayFrom + 1; } }
    public record ChapterPlan(UUID chapterId, String title, String deckId, int cardCount, DayRange range) {
        public int perDay() { return LearningPathScheduler.perDay(cardCount, range); } }
    public record Task(UUID chapterId, String chapterTitle, String deckId, int fromPos, int toPos) {}
    public record DayPlan(int dayIndex, LocalDate date, List<Task> tasks) {}

    public static List<DayRange> allocate(List<Integer> cardCounts, int totalDays);
    public static List<Integer> evenSplit(int total, int parts);   // phần trước lớn hơn, chênh ≤ 1
    public static int perDay(int cards, DayRange r);               // ceil(cards / days), 0 khi cards == 0
    public static List<Task> tasksFor(List<ChapterPlan> plans, int dayIndex);
    public static List<DayPlan> schedule(List<ChapterPlan> plans, LocalDate start, int totalDays);
    public static int dayIndex(LocalDate start, LocalDate today);  // DAYS.between + 1
}
```
`allocate` (n = số chương, D = số ngày): `n == 0` → rỗng. `n >= D` → chương i (0-based) vào ngày `i * D / n + 1`, `dayFrom == dayTo`. `n < D` → `total = Σc` (nếu 0 coi mỗi chương = 1); `quota_i = D * c_i / total` (double); `base_i = max(1, floor(quota_i))`; khi `Σbase > D`: giảm 1 ở chương có `base > 1` lớn nhất (hoà → chương sau); khi `Σbase < D`: +1 cho chương có phần dư lớn nhất chưa được cộng (hoà → chương trước), lặp vòng nếu còn thiếu; rồi dải liên tiếp từ ngày 1.
`tasksFor`: với chương có `dayFrom ≤ d ≤ dayTo`: `k = d - dayFrom + 1`, `from = (k-1)*perDay + 1`, `to = min(k*perDay, cards)`; bỏ khi `from > to`.
Test `LearningPathSchedulerTest`: `[40,60]/30 → [1–12],[13–30]`; `[100,1,1]/3 → [1–1],[2–2],[3–3]`; `[10,10,10]/2 → ngày 1,1,2`; 1 ngày 5 chương → tất cả ngày 1; `[0,5]/4` → chương 0 thẻ vẫn 1 ngày; hoà phần dư → chương trước được +1; `tasksFor` 3 thẻ trên 5 ngày → ngày 4,5 không có task; `perDay(40, 1–6) == 7` và ngày 6 → `36..40`; `evenSplit(20,3) == [7,7,6]`; `dayIndex` trước ngày bắt đầu → 0, đúng ngày → 1.

---

## Task 4: backend — refactor `ExtractionService`, `ExtractionOptions.splitChapters`, `AiDtos.Item.chapter`, `ExtractionJobFinishedEvent`

**Tệp:** `service/ExtractionService.java`, `service/ExtractionWorker.java`, `service/ExtractionJobFinishedEvent.java` (mới), `dto/extraction/ExtractionOptions.java`, `dto/extraction/AiDtos.java`, `dto/extraction/ExtractionJobResponse.java` (nếu cần), `src/test/java/.../controller/ExtractionIT.java` (phải xanh, thêm 1 ca).

- `ExtractionOptions` (record): thêm thành phần cuối `Boolean splitChapters`; `withDefaults(profileLevel)` đặt `FALSE` khi null; thêm `ExtractionOptions withSplitChapters(boolean)`; cập nhật `empty()`. Đánh dấu record `@JsonInclude(JsonInclude.Include.NON_NULL)` nếu chưa có.
- `AiDtos.Item`: thêm thành phần cuối `Integer chapter`. `ExtractionWorker.toEntity`: `e.setChapterNo(it.chapter())`.
- `ExtractionService`:
  - Tách `create` thành `ExtractionJob prepareJob(User user, byte[] data, String filename, String text, ExtractionOptions options, String purpose)` (kiểm đầu vào, `sniff`, giới hạn, `enforceDailyLimit`, dựng + `jobs.save` với `purpose`) và `void startJob(ExtractionJob job, byte[] data, String filename, String text)` (gọi `dispatch(job, () -> worker.runFromText(...))`). `create` = `parseOptions(...).withDefaults(...)` → `prepareJob(..., PURPOSE_EXTRACTION)` → `startJob` → response. `parseOptions`, `dominantLevel` chuyển thành package-private (không `private`).
  - `list` → `findTop50ByUserIdAndPurposeOrderByCreatedAtDesc(uid, PURPOSE_EXTRACTION)`.
  - `delete`: nếu `PURPOSE_LEARNING_PATH.equals(job.getPurpose())` → 409 `"Lượt này thuộc một lộ trình học, hãy xoá lộ trình."`.
- `ExtractionJobFinishedEvent`: `public record ExtractionJobFinishedEvent(UUID jobId, String status) {}`.
- `ExtractionWorker`: inject `ApplicationEventPublisher`; cuối `analyzeAndFinish` sau `update(... DONE ...)` → `publish(jobId, ExtractionJob.DONE)`; trong `fail(...)` sau khi ghi FAILED → `publish(jobId, ExtractionJob.FAILED)`; `publish` bọc `try/catch (RuntimeException)` + log để listener lỗi không ảnh hưởng worker.
- `ExtractionIT`: chạy lại toàn bộ, thêm ca: job tạo qua `POST /api/extractions` có `options.splitChapters == false` trong response.

---

## Task 5: backend — `LearningPathService` (tạo, dựng nháp, đọc), DTO, controller, IT cơ bản

**Tệp:** `service/LearningPathService.java`, `controller/LearningPathController.java`, `dto/learningpath/LearningPathResponse.java`, `dto/learningpath/LearningPathChapterResponse.java`, `dto/learningpath/LearningPathRequests.java` (mới), `src/main/resources/application.properties` (`app.learning-path.zone=Asia/Ho_Chi_Minh`), `src/test/java/.../controller/LearningPathIT.java` (mới).

### DTO
- `LearningPathRequests`: `record Patch(@Size(max = 100) String title, @Min(1) @Max(365) Integer totalDays, LocalDate startDate)`, `record ChapterPatch(@NotBlank @Size(max = 100) String title)`, `record Activate(LocalDate startDate, @Min(1) @Max(365) Integer totalDays)`.
- `LearningPathChapterResponse(UUID id, int position, String title, String deckId, boolean deckDeleted, int cardCount, int vocabCount, int grammarCount, Integer dayFrom, Integer dayTo, int perDay)`.
- `LearningPathResponse` (`@JsonInclude(NON_NULL)`): `UUID id, String title, String status, String sourceType, String sourceName, int totalDays, LocalDate startDate, Boolean chaptersDetected, UUID jobId, UUID folderId, Instant createdAt, Instant activatedAt, String errorMessage, JobSummary job, List<LearningPathChapterResponse> chapters, Today today, List<LearningPathScheduler.DayPlan> days` với `record JobSummary(String status, String stage, String errorMessage, Map<String,Object> stats)` và `record Today(LocalDate date, int dayIndex, String state, List<LearningPathScheduler.Task> tasks)`.

### Service
Constructor: `LearningPathRepository paths, LearningPathChapterRepository chapters, ExtractionJobRepository jobs, ExtractionItemRepository items, ExtractionService extraction, DeckService deckService, FolderService folderService, FolderRepository folders, UserRepository users, PlatformTransactionManager txm, @Value("${app.learning-path.zone:Asia/Ho_Chi_Minh}") String zone`. Không được inject vào `ExtractionWorker` (tránh vòng).

- `create(User user, byte[] data, String filename, String text, Integer days, String title, LocalDate startDate, String optionsJson)` — **không** `@Transactional`:
  1. `days == null || days < 1 || days > 365` → 400 `"Số ngày học phải từ 1 đến 365."`.
  2. `options = extraction.parseOptions(optionsJson).withDefaults(user.getJlptLevel()).withSplitChapters(true)`.
  3. `job = extraction.prepareJob(user, data, filename, text, options, ExtractionJob.PURPOSE_LEARNING_PATH)`.
  4. `LearningPath` mới: `id = UUID.randomUUID()`, status PROCESSING, `jobId`, `sourceType/sourceName` từ job, `title` = title đã trim nếu có, else tên file bỏ đuôi (cắt 100), else `"Lộ trình " + dd/MM/yyyy`; `startDate` = tham số hoặc `LocalDate.now(zone)`; `totalDays = days`; `createdAt = Instant.now()`. `paths.save`.
  5. `try { extraction.startJob(job, data, filename, text); } catch (ResponseStatusException e) { đánh dấu path FAILED với e.getReason(); throw e; }`.
  6. Trả `toResponse(path, today, false)`.
- `@EventListener public void onJobFinished(ExtractionJobFinishedEvent e)`: `try { tx.executeWithoutResult(s -> buildDraft(e.jobId(), e.status())); } catch (RuntimeException ex) { log.error(...); try { markFailed(jobId, "Không dựng được lộ trình từ kết quả bóc tách.") } catch (RuntimeException ignored) {} }` — **không bao giờ ném**.
- `buildDraft(jobId, status)`: `paths.findByJobId` → không có hoặc path không PROCESSING → return. Job FAILED → path FAILED + `job.errorMessage`. Items = `findByJobIdOrderByPositionAsc`; rỗng → FAILED `"Không trích được từ vựng hay ngữ pháp nào từ tài liệu."`. `detected = Boolean.TRUE.equals(job.getStats().get("chaptersDetected"))`.
  - detected: mỗi phần tử `stats.chapters` (List<Map>) → `LearningPathChapter(position = index, title = cut(title,100) hoặc "Chương " + index khi null/blank)`; map `chapterNo → chapterId`; item `chapterId = map.getOrDefault(chapterNo, chương đầu)`.
  - không detected: `k = days <= 14 ? days : ceil(days/7.0)`; `k = min(k, items.size())`; `sizes = evenSplit(items.size(), k)`; `ranges = allocate(sizes, days)`; title `"Ngày " + dayFrom` khi `days <= 14`, else `"Tuần " + (i+1) + " (ngày " + dayFrom + "–" + dayTo + ")"` (en dash); gán item tuần tự theo `position`.
  - `path.chaptersDetected = detected; path.status = DRAFT`.
- `@EventListener(ApplicationReadyEvent.class) @Transactional failOrphans()` → `paths.failProcessing("Máy chủ đã khởi động lại trong lúc xử lý. Hãy tạo lại lộ trình.")`.
- `owned(uid, id)` → 404 `"Không tìm thấy lộ trình học."`.
- `list(uid, today)` → `toResponse(p, today, false)` cho từng path (không `chapters/days`; `today` chỉ khi ACTIVE).
- `get(uid, id, today)` → `toResponse(p, today, true)`.
- `toResponse(path, today, full)`: chapters = `findByPathIdOrderByPositionAsc`; `job` = `jobs.findById(jobId)` → `JobSummary(status, stage, errorMessage, stats)` hoặc null. Số liệu chương: DRAFT → tính sống từ items của job nhóm theo `chapterId` (`cardCount` = số `selected`, `vocabCount/grammarCount` theo `kind` trong selected); dải = `allocate(liveCounts, totalDays)`; ACTIVE → cột đã chốt; `deckDeleted = ACTIVE && deckId == null`; `perDay = LearningPathScheduler.perDay(cardCount, range)`. Khi `full` và status ∈ {DRAFT, ACTIVE}: `days = schedule(plans, startDate, totalDays)`. Khi ACTIVE: `today = Today(date, dayIndex, state, tasksFor(plans, dayIndex))` với `state = before | during | after`.
- Hàm `today(LocalDate date)` = `date != null ? date : LocalDate.now(ZoneId.of(zone))`.

### Controller `@RestController @RequestMapping("/api/learning-paths") @Validated`
- `POST` multipart: `@RequestPart(required=false) MultipartFile file`, `@RequestPart(required=false) String text`, `@RequestPart String days` (parse int, lỗi → 400 `"Số ngày học không hợp lệ."`), `@RequestPart(required=false) String title`, `@RequestPart(required=false) String startDate` (ISO, lỗi → 400), `@RequestPart(required=false) String options` → 202.
- `GET /`, `GET /{id}` với `@RequestParam(required=false) @DateTimeFormat(iso = ISO.DATE) LocalDate date`.
- Các endpoint PATCH/POST/DELETE của Task 6 có thể để stub 501 **không** — chỉ khai báo khi Task 6 cài đặt.
- `uid(me)` lấy theo cách `ExtractionController` đang dùng.

### `LearningPathIT` (extends `IntegrationTest`, `@MockitoBean AiServiceClient ai`, stub giống `ExtractionIT.stubAi` nhưng `analyze` trả item có `chapter` và `stats` có `chaptersDetected` + `chapters`; helper `postPath(token, text, days, title)` dựng multipart bằng `MockPart`; `awaitDraft(id)` poll `GET /api/learning-paths/{id}` ≤ 100 × 100 ms tới DRAFT/FAILED). Lưu ý `app.extraction.daily-limit.free=3` trong test.
Ca viết ở task này:
1. `text_path_runs_to_draft`: POST (text, days=10, title) → 202 PROCESSING, `GET /api/extractions/{jobId}` có `options.splitChapters == true`; chờ DRAFT; 2 chương đúng tiêu đề từ stats; `cardCount` chỉ đếm `selected` (item suspect bị bỏ); `dayFrom/dayTo` tỉ lệ; `days.length == 10`; `perDay` đúng; `GET /api/extractions` **không** chứa job; `GET /api/learning-paths` có path, không có `chapters`.
2. `fallback_splits_by_days_when_no_chapters`: stub `chaptersDetected:false`, 6 item, days=3 → 3 chương "Ngày 1".."Ngày 3" mỗi chương 2 thẻ; path khác days=20 → "Tuần 1 (ngày 1–7)", "Tuần 2 (ngày 8–14)", "Tuần 3 (ngày 15–20)".
3. `ai_failure_marks_path_failed_and_limit_is_shared`: `analyze` ném → FAILED có `errorMessage`; user mới: 2 bóc tách + 1 path = 3 → lượt thứ 4 (path) → 429.
4. `validation_and_privacy_read`: days=0, 400, thiếu → 400; GET của user khác → 404.

---

## Task 6: backend — sửa nháp, `activate`, `delete`, hoàn thiện IT

**Tệp:** `service/LearningPathService.java`, `controller/LearningPathController.java`, `LearningPathIT.java`.

- `requireDraft(path)` → 409 `"Chỉ sửa được khi lộ trình đang ở bước xem trước."`; PROCESSING ở `patch` → 409 `"Lộ trình đang được xử lý."`; FAILED ở `patch` → 400 `"Lộ trình đã lỗi, hãy tạo lại."`.
- `patch(uid, id, Patch)` `@Transactional`: áp trường khác null; ACTIVE và `totalDays` đổi → `allocate` lại trên `card_count` đã chốt, ghi `day_from/day_to`.
- `patchChapter(uid, id, cid, ChapterPatch)`: DRAFT only; chương phải thuộc path (404).
- `mergeUp(uid, id, cid)`: DRAFT only; chương `position == 1` → 400 `"Chương đầu tiên không có chương trước để gộp."`; items của `cid` → `chapterId = chương trước`; xoá chương; đánh lại `position` 1..n.
- `patchItems(uid, id, List<ItemPatch>)`: DRAFT only; `jobId == null` → 400 `"Dữ liệu bóc tách của lộ trình không còn."`; gọi `extraction.patchItems(uid, jobId, patches)` (chỉnh visibility nếu cần) → trả `ExtractionItemResponse[]`.
- `chapterItems(uid, id, cid)` → chương thuộc path (404) → `items.findByChapterIdOrderByPositionAsc` → `ExtractionItemResponse::of`.
- `activate(uid, id, Activate)` `@Transactional`:
  1. `requireDraft`; áp `startDate/totalDays` nếu có; job + items (400 nếu thiếu).
  2. Nhóm item `selected` theo chương (theo `position`); chương 0 thẻ → xoá hàng; không còn chương → 400 `"Chưa chọn thẻ nào để tạo lộ trình."`; đánh lại `position`.
  3. Thư mục: `uniqueRootTitle(uid, path.title)` — duyệt thư mục gốc của user (`FolderRepository`, so `equalsIgnoreCase`), thử `title`, `title (2)`, … (gốc cắt 94 ký tự). `FolderRequest(title, null, "private", dominantLevel(allSelected, job), false, "{\"learningPathId\":\"" + id + "\"}")` + `folderService.createFolder(req, user)` → `folderId`.
  4. Mỗi chương k: cards = vocab (position asc) rồi grammar (position asc) qua `ExtractionService.toCard`; `level = dominantLevel(itemsChương, job)`; `DeckRequest(title chương, level, cut("Chương " + k + " của lộ trình " + path.title, 1000), folderId, visibility null, category "goi", cards)` → `deckService.create(uid, req)`; ghi `chapter.deckId`, `cardCount`; nối `deckId` vào `job.deckIds`.
  5. `ranges = allocate(counts, totalDays)` → `dayFrom/dayTo`; `path.folderId`, status ACTIVE, `activatedAt = now`.
  6. Trả `toResponse(path, today, true)`; controller 201.
- `delete(uid, id)` `@Transactional`: `paths.delete(path)` (chapters cascade) rồi `jobs.deleteById(jobId)` nếu có (items cascade). Deck/folder không đụng.
- Controller: `PATCH /{id}`, `PATCH /{id}/chapters/{cid}`, `POST /{id}/chapters/{cid}/merge-up`, `PATCH /{id}/items` (`@RequestBody @Valid List<ExtractionRequests.ItemPatch>`), `GET /{id}/chapters/{cid}/items`, `POST /{id}/activate` (201), `DELETE /{id}` (204).
- IT bổ sung:
  5. `draft_edit_then_activate`: untick 1 item → `cardCount` giảm; rename chương 2; `PATCH /{id}` `totalDays=4` → dải đổi; `POST /activate` với `startDate` → 201 ACTIVE, `folderId`; `GET /api/folders/{folderId}` title == path title, `metadata` chứa `learningPathId`; `GET /api/decks?folderId=` mỗi chương 1 deck, `category == "goi"`, thẻ vocab trước grammar theo `position` tài liệu, `description` bắt đầu "Chương 1"; `GET /{id}?date=startDate+1` → `today.dayIndex == 2`, `tasks[0].fromPos/toPos` đúng perDay; `DELETE /{id}` 204 → deck vẫn 200, path 404, `GET /api/extractions/{jobId}` 404.
  6. `merge_up_moves_items_and_renumbers`: 3 chương → merge-up chương 2 → 2 chương, cardCount cộng, position 1..2; merge-up chương đầu → 400.
  7. `conflicts_and_privacy_write`: activate lần 2 → 409; patch khi PROCESSING → 409 (dùng `CountDownLatch` giữ job RUNNING như `ExtractionIT`); user khác PATCH/activate/DELETE → 404.
  8. `deleting_deck_or_folder_keeps_path_readable`: sau activate `DELETE /api/decks/{d1}` → chương 1 `deckId null, deckDeleted true`, `today.tasks` không có chương đó; `DELETE /api/folders/{folderId}` → path `folderId null`, GET 200.
  9. `folder_name_conflict_gets_suffix`: tạo trước thư mục cùng tên → activate → thư mục `"<title> (2)"`.
  10. `extraction_delete_refuses_path_job`: `DELETE /api/extractions/{jobId}` → 409.
  11. `listener_never_breaks_job`: dùng `@MockitoSpyBean`/stub làm `buildDraft` ném (ví dụ stats.chapters là kiểu sai) → job vẫn DONE, path FAILED.
- Chạy toàn bộ `mvn -q test`.

---

## Task 7: frontend — types, service, `roadmapUtils` + selfCheck

**Tệp:** `frontend/src/types/api.types.ts`, `frontend/src/services/learningPathService.ts` (mới), `frontend/src/features/roadmap/roadmapUtils.ts` (mới), `frontend/scripts/selfCheck.ts`.

### Types (thêm cuối `api.types.ts`, mục `// ===== Lộ trình học tập (/api/learning-paths) =====`)
```ts
export type LearningPathStatus = "PROCESSING" | "DRAFT" | "ACTIVE" | "FAILED";
export interface LearningPathJob { status: ExtractionStatus; stage: ExtractionStage; errorMessage: string | null; stats?: ExtractionStats | null }
export interface LearningPathChapter { id: string; position: number; title: string; deckId: string | null; deckDeleted?: boolean;
  cardCount: number; vocabCount?: number; grammarCount?: number; dayFrom: number; dayTo: number; perDay: number }
export interface LearningPathTask { chapterId: string; chapterTitle?: string; deckId: string | null; fromPos: number; toPos: number }
export interface LearningPathDay { dayIndex: number; date: string; tasks: LearningPathTask[] }
export interface LearningPathToday { date: string; dayIndex: number; state: "before" | "during" | "after"; tasks: LearningPathTask[] }
export interface LearningPath { id: string; title: string; status: LearningPathStatus; sourceType: ExtractionSourceType; sourceName: string | null;
  totalDays: number; startDate: string; chaptersDetected: boolean | null; jobId: string | null; folderId: string | null;
  createdAt: string; activatedAt: string | null; errorMessage: string | null; job: LearningPathJob | null;
  chapters?: LearningPathChapter[]; today?: LearningPathToday | null; days?: LearningPathDay[] }
export interface LearningPathPatch { title?: string; totalDays?: number; startDate?: string }
export interface ActivateLearningPathDto { startDate?: string; totalDays?: number }
export interface CreateLearningPathInput { file?: File; text?: string; days: number; title?: string; startDate?: string; options: ExtractionOptions }
```
### Service (`learningPathService.ts`, import tương đối như `extractionService.ts`)
`createLearningPath(input)` (FormData `file|text`, `days`, `title` nếu có, `startDate` nếu có, `options` JSON; header multipart; timeout 60 000), `fetchLearningPaths()`, `fetchLearningPath(id, date?)` (`?date=`), `fetchChapterItems(id, cid)`, `updateLearningPath(id, patch)`, `renameChapter(id, cid, title)`, `mergeChapterUp(id, cid)`, `patchPathItems(id, patches: {id: string; selected: boolean}[])`, `activateLearningPath(id, dto)` (timeout 60 000), `deleteLearningPath(id)`. `encodeURIComponent` cho id.

### `roadmapUtils.ts` (chỉ import `../../lib/learningStats.ts` (`dayKey`), `../../lib/deckUtils.ts` (`calcDeckProgress`, `DeckProgress`), `../../lib/srs.ts` (`Review`), `../../types/api.types.ts`)
```ts
export const MIN_DAYS = 1, MAX_DAYS = 365, DEFAULT_DAYS = 30;
export const PATH_STATUS_LABELS: Record<LearningPathStatus, string>; // Đang xử lý / Bản nháp / Đang học / Thất bại
export const isPathProcessing = (s: LearningPathStatus) => s === "PROCESSING";
export const isValidDays = (n: number) => Number.isInteger(n) && n >= MIN_DAYS && n <= MAX_DAYS;
export function parseDateOnly(s: string): Date;            // local midnight; KHÔNG dùng new Date("YYYY-MM-DD")
export function addDaysStr(s: string, n: number): string;  // dayKey(new Date(y, m-1, d+n))
export function dayIndexFor(startDate: string | null, today: Date, totalDays: number): number; // kẹp 1..totalDays
export function endDate(startDate: string, totalDays: number): string;
export function dateForDay(startDate: string, dayIndex: number): string;
export function isPathEnded(startDate: string | null, totalDays: number, today: Date): boolean;
export function formatDayRange(from: number, to: number): string; // "Ngày 1–3" | "Ngày 4"
type ChapterLite = Pick<LearningPathChapter, "id" | "deckId" | "cardCount" | "dayFrom" | "dayTo" | "perDay">;
export function chapterPerDay(ch: ChapterLite): number;  // perDay > 0 ? perDay : ceil(cardCount / days)
export function tasksForDay(chapters: ChapterLite[], dayIndex: number): LearningPathTask[]; // bỏ chương deckId null
export function scheduledUpTo(ch: ChapterLite, dayIndex: number): number;
export function todayCardCount(tasks: Pick<LearningPathTask, "fromPos" | "toPos">[]): number;
export function parseRange(raw: string | null): { from: number; to: number } | null; // ^\s*(\d+)-(\d+)\s*$, from ≥ 1, to ≥ from
export function sliceRange<T>(cards: T[], r: { from: number; to: number }): T[];   // cards.slice(from-1, to)
export function chapterProgress(ch: Pick<LearningPathChapter, "deckId">, decks: Deck[], reviews: Record<string, Review>, now: Date): DeckProgress | null;
export function pathProgress(chapters, decks, reviews, now): { total: number; mastered: number; pct: number; missingDecks: number };
export function behindCount(chapters: ChapterLite[], dayIndex: number, decks: Deck[], reviews: Record<string, Review>): number; // thẻ lên lịch tới hết ngày dayIndex-1 chưa có review
export function unreviewedInTasks(tasks: LearningPathTask[], decks: Deck[], reviews: Record<string, Review>): number;
```
`tasksForDay`: chương có `deckId` và `dayFrom ≤ d ≤ dayTo`: `from = (d - dayFrom) * perDay + 1`, `to = d === dayTo ? cardCount : min(cardCount, from + perDay - 1)`; bỏ khi `from > cardCount`. `scheduledUpTo`: `d < dayFrom → 0`; `d ≥ dayTo → cardCount`; else `min(cardCount, (d - dayFrom + 1) * perDay)`. `behindCount`: mỗi chương lấy `deck.cards.slice(0, scheduledUpTo(ch, dayIndex - 1))` đếm `!reviews[c.id]`.

### selfCheck khối mới "14. Lộ trình học tập (features/roadmap/roadmapUtils.ts)" — viết **trước**, chạy đỏ rồi xanh
| Gọi | Kỳ vọng |
|---|---|
| `dayIndexFor("2026-10-14", d(2026,10,14), 30)` | 1 |
| `dayIndexFor("2026-10-14", d(2026,10,16,23), 30)` | 3 |
| `dayIndexFor("2026-10-14", d(2026,10,13), 30)` | 1 |
| `dayIndexFor("2026-10-14", d(2026,12,25), 30)` | 30 |
| `dayIndexFor(null, d(2026,10,14), 30)` | 1 |
| `endDate("2026-10-14", 30)` / `("2026-10-14", 1)` / `("2026-12-31", 2)` | "2026-11-12" / "2026-10-14" / "2027-01-01" |
| `dateForDay("2026-10-14", 3)` | "2026-10-16" |
| `isPathEnded("2026-10-14", 30, d(2026,11,12))` / `d(2026,11,13)` | false / true |
| `parseDateOnly("2026-10-14").getHours()` | 0 |
| `formatDayRange(1,3)` / `(4,4)` | "Ngày 1–3" / "Ngày 4" |
| A=`{id:"c1",deckId:"d1",cardCount:10,dayFrom:1,dayTo:3,perDay:4}`, B=`{id:"c2",deckId:"d2",cardCount:5,dayFrom:4,dayTo:5,perDay:3}`, C=`{id:"c3",deckId:null,cardCount:9,dayFrom:1,dayTo:9,perDay:1}` — `tasksForDay([A,B,C], d)` nối `${chapterId}:${fromPos}-${toPos}` bằng "," | d=1 → "c1:1-4"; 3 → "c1:9-10"; 4 → "c2:1-3"; 5 → "c2:4-5"; 6 → "" |
| `tasksForDay([{...A, cardCount:4, perDay:2}], 3)` | "" |
| `chapterPerDay({...A, perDay:0})` | 4 |
| `scheduledUpTo(A,0)/(A,2)/(A,3)/(A,9)` | 0 / 8 / 10 / 10 |
| `todayCardCount([{fromPos:1,toPos:4},{fromPos:1,toPos:3}])` / `([])` | 7 / 0 |
| `parseRange("3-10")`→"3-10"; `"5-5"`; `" 2-4 "`→"2-4"; `"0-5"`,`"7-3"`,`"abc"`,`null`,`"3-"` | …/ null |
| `sliceRange(["c1".."c5"], {from:2,to:4})` / `{4,9}` / `{7,9}` | "c2,c3,c4" / "c4,c5" / "" |
| decks `[{id:"d1", cards:[c1..c4]}]`, reviews `{c1: intervalDays 30}`; `pathProgress([A(d1), B(deckId "gone"), C], decks, reviews, now)` | total 4, mastered 1, pct 25, missingDecks 1 |
| `chapterProgress({deckId:"gone"})` / `({deckId:null})` | null / null |
| `behindCount([{...A, deckId:"d1", cardCount:4, dayFrom:1, dayTo:2, perDay:2}], 2, decks, {c1})` ; dayIndex 1 ; dayIndex 5 | 1 ; 0 ; 3 |
| `unreviewedInTasks([{chapterId:"c1",deckId:"d1",fromPos:1,toPos:4}], decks, {c1})` | 3 |
| `isValidDays(1)`,`(365)` / `(0)`,`(366)`,`(2.5)`,`(NaN)` | true / false |

---

## Task 8: frontend — tách field dùng chung, `StageStepper`, `LevelBadge`, `CreateLearningPathModal`

**Tệp:** `frontend/src/features/extraction/components/StageStepper.tsx`, `frontend/src/pages/ExtractionPage.tsx`, `frontend/src/features/extraction/components/LevelBadge.tsx` (mới), `ExtractionItemsPanel.tsx`, `frontend/src/features/extraction/components/SourceFields.tsx` (mới), `ExtractionOptionsFields.tsx` (mới), `frontend/src/features/dashboard/components/modals/QuickAiUploadModal.tsx`, `frontend/src/features/roadmap/components/CreateLearningPathModal.tsx` (mới).

- `StageStepper` props → `{ status: ExtractionStatus; stage: ExtractionStage }`; `ExtractionPage.tsx` chỗ dùng (~L242) truyền `status={job.status} stage={job.stage}`.
- `LevelBadge.tsx`: chuyển `LEVEL_TONE` + `LevelBadge` (hiện module-private trong `ExtractionItemsPanel.tsx`) ra, export; panel import lại. Hành vi không đổi.
- `SourceFields.tsx`: props `{ source: "file"|"text"; onSourceChange; file: File|null; onFileChange; text: string; onTextChange; onError(msg) }` = tablist + dropzone (`UPLOAD_ACCEPT`, kiểm `UPLOAD_MAX_BYTES` → `onError`) + textarea (`TEXT_MAX_CHARS`, bộ đếm) lấy từ `QuickAiUploadModal` (~L137-185).
- `ExtractionOptionsFields.tsx`: props `{ options: ExtractionOptions; onChange(key, value); file: File|null }` = các select/checkbox (~L187-309, select OCR chỉ khi `needsOcr(file)`).
- `QuickAiUploadModal` dùng hai component trên; submit/validate giữ nguyên. Kiểm tay: modal bóc tách vẫn gửi được.
- `CreateLearningPathModal.tsx`: props `{ isOpen; onClose; initial?: { days?: number; title?: string } }`; `Modal size="2xl"` icon `alt_route`, tiêu đề "Tạo lộ trình học tập"; form con remount mỗi lần mở (như `UploadForm`). State: `source/file/text`, `days` (mặc định `DEFAULT_DAYS`, `Input type="number" min=1 max=365`, lỗi inline khi `!isValidDays`), `title` (tuỳ chọn, ≤100), `options = loadSavedOptions(userProfile?.jlptLevel)`, `<details>` "Tuỳ chọn nâng cao" bọc `ExtractionOptionsFields`. Submit: validate file/text như modal bóc tách → `saveOptions(options)` → `createLearningPath({...})` → `navigate(/roadmap/:id)`; lỗi hiện `extractErrorMessage`. Nút gửi `isLoading`.
- Kiểm: `npm run lint && npm run build && npm run selfcheck`; mở trang bóc tách + modal bóc tách tay để chắc không đổi.

---

## Task 9: frontend — route `/roadmap/:id`, `RoadmapDetailPage` (PROCESSING/FAILED), `RoadmapPage` mới

**Tệp:** `frontend/src/routes/AppRoutes.tsx`, `frontend/src/pages/RoadmapDetailPage.tsx` (mới), `frontend/src/pages/RoadmapPage.tsx` (viết lại), `frontend/src/features/roadmap/components/{PathStatusChip,ProgressBar,PathProcessingPanel,PathFailedPanel,LearningPathCard}.tsx` (mới).

- `AppRoutes.tsx`: thêm `<Route path="/roadmap/:id" element={<RoadmapDetailPage />} />` ngay sau route `/roadmap`.
- `PathStatusChip { status }` (markup như `ExtractionStatusBadge`, nhãn `PATH_STATUS_LABELS`). `ProgressBar { pct; label; tone?: "primary"|"secondary"; className? }` với `role="progressbar"`, `aria-valuenow`, markup như `RecentDecksSection.tsx:170-178`.
- `PathProcessingPanel { path }`: `StageStepper status/stage` (fallback `QUEUED` khi `job` null) + câu "Hệ thống đang đọc tài liệu và chia chương, bạn có thể rời trang và quay lại sau."
- `PathFailedPanel { path; onRetry; onDelete; busy }`: `errorMessage` + nút "Thử lại" (mở `CreateLearningPathModal` với `initial={{days, title}}`) + "Xoá".
- `RoadmapDetailPage`: `useParams` id; state `path, loadError, pollRound, actionError, busy, createOpen`; poll 2 s khi `isPathProcessing(path.status)` theo mẫu `ExtractionPage.tsx` L45-64 (`setTimeout` chuỗi, cờ `alive`, `clearTimeout`); `fetchLearningPath(id, dayKey(new Date()))`; breadcrumb "← Lộ trình học tập" về `/roadmap`; tiêu đề + `PathStatusChip`; nút Xoá (ẩn khi PROCESSING) → `dialog.confirm({tone:"danger", title:"Xoá lộ trình?", message:"Kế hoạch học sẽ bị xoá. Bộ thẻ và thư mục đã tạo giữ nguyên.", action})` → navigate `/roadmap`. DRAFT/ACTIVE tạm render placeholder "(đang xây)" — Task 10 thay.
- `RoadmapPage` viết lại hoàn toàn (bỏ giai đoạn JLPT và chữ "AI Path Architecture"): header "Lộ trình học tập" + mô tả ngắn + `Button` "Tạo lộ trình"; `useAsync(fetchLearningPaths, [refreshIndex])`; `useShell()` lấy `decks/reviews`; empty state khung nét đứt (như `ExtractionsPage` L58-64) với CTA; lưới `LearningPathCard`; xoá qua `dialog.confirm` như trên; `CreateLearningPathModal`.
- `LearningPathCard { path; decks; reviews; now; onDelete }`: tiêu đề, `PathStatusChip`, nguồn (`SOURCE_TYPE_LABELS`), "Ngày X/N" khi ACTIVE (`dayIndexFor`), `ProgressBar` khi có `chapters`, "Hôm nay: k thẻ" từ `todayCardCount(path.today?.tasks ?? [])`, nút thùng rác; cả thẻ là `Link` tới `/roadmap/:id`.
- Giữ `sortDecksByLevel`/`JLPT_LEVELS` trong `deckUtils` (nơi khác còn dùng).
- Kiểm: lint/build/selfcheck; tay: `/roadmap` rỗng → modal → tạo → `/roadmap/:id` stepper.

---

## Task 10: frontend — bản nháp (DRAFT), đang học (ACTIVE), `StudyPage ?range`

**Tệp:** `frontend/src/features/roadmap/components/{PathDraftEditor,ChapterDraftCard,ChapterItemsList,PathActiveView,TodayPanel,ChapterTimeline}.tsx` (mới), `frontend/src/pages/RoadmapDetailPage.tsx`, `frontend/src/pages/StudyPage.tsx`, (tuỳ chọn) `frontend/src/features/dashboard/components/DashboardSidebar.tsx`.

### DRAFT
- `PathDraftEditor { path; busy; error; onPatchPath(patch); onRenameChapter(cid, title); onMergeUp(cid); onItemsPatched(); onActivate(startDate, totalDays) }`: khối thông tin: `Input` tiêu đề, `Input type="number"` số ngày (1–365), `Input type="date"` ngày bắt đầu (mặc định `path.startDate`), commit khi blur/Enter → `onPatchPath`; thông báo `chaptersDetected ? "Đã nhận dạng N chương theo cấu trúc tài liệu." : "Không nhận ra chương trong tài liệu, đã chia theo ngày."`; danh sách `ChapterDraftCard`; thanh sticky dưới: "N chương · M thẻ · ~k thẻ/ngày" + `Button` "Tạo lộ trình" (`isLoading={busy}`).
- `ChapterDraftCard { pathId; chapter; index; canMergeUp; busy; onRename; onMergeUp; onItemsPatched }`: tiêu đề sửa inline (blur/Enter commit, mẫu `ItemRow`), chip `formatDayRange(dayFrom, dayTo)`, "`cardCount` thẻ", "`perDay`/ngày"; nút mở rộng → `useAsync(() => fetchChapterItems(pathId, chapter.id), [pathId, chapter.id, open, version])` → `ChapterItemsList`; nút "Gộp vào chương trước" (ẩn khi `index === 0`).
- `ChapterItemsList { items; busy; onToggle(id, selected) }`: hàng = checkbox, `Ruby` term (component đã có), reading, `itemMeaning(item)`, `LevelBadge`; hàng bỏ tick mờ (`opacity-70`).
- `RoadmapDetailPage` handlers: `onPatchPath` → `updateLearningPath` → `refreshPath()`; `onRenameChapter` → `renameChapter` (cập nhật tiêu đề lạc quan) → `refreshPath()`; `onMergeUp` → `mergeChapterUp` → `refreshPath()`; toggle item → lật cục bộ, `patchPathItems`, `refreshPath()`; `onActivate` → `activateLearningPath(id, {startDate, totalDays})` → `setPath(next)`, `reloadStats()`, `setDecksPending(true)`; lỗi → `actionError` (`extractErrorMessage`).

### ACTIVE
- `PathActiveView { path; decks; reviews; now; decksPending }`: `dayIndex = path.today?.dayIndex ?? dayIndexFor(...)`; `ended = path.today?.state === "after" || isPathEnded(...)`; `tasks = path.today?.tasks ?? tasksForDay(chapters, dayIndex)`; `progress = pathProgress(...)`; `behind = behindCount(...)`. Header card: tiêu đề, "`startDate` → `endDate`", "Ngày X/N", `ProgressBar` tổng, link thư mục `/folders?folderId=` khi `folderId`.
- `TodayPanel`: "Hôm nay · Ngày X/N (dd/mm)" hoặc "Đã kết thúc — ôn lại phần ngày cuối" (`state after` hiện task ngày cuối); mỗi task: tiêu đề chương, "k thẻ (vị trí a–b)", "còn r thẻ chưa học" (`unreviewedInTasks`), `Link` "Học ngay (k thẻ)" → `/decks/${deckId}/study?range=${from}-${to}&path=${path.id}`; badge "Nợ: b thẻ" khi `behind > 0`; không task → "Hôm nay là ngày ôn tập, hãy ôn thẻ đến hạn ở Tổng quan."; chương `deckId null` → "Bộ thẻ đã xoá" (hoặc "Đang tạo bộ thẻ…" khi `decksPending`).
- `ChapterTimeline`: `ol` với đường nối `before:` như RoadmapPage cũ (L234-323); mỗi chương: nút tròn (xong ✓ khi `pct === 100`, hiện tại ring, sắp tới mờ), `formatDayRange` + ngày `dateForDay`, tiêu đề, `ProgressBar` từ `chapterProgress`, link "Xem bộ thẻ" `/decks/:id` và "Học bộ này" `/decks/:id/study`; thiếu deck → nhãn như trên.
- `decksPending`: effect xoá cờ khi mọi `chapter.deckId` có trong `decks` hoặc sau 8 s.

### StudyPage
- Đọc `range`, `path`, `cram` bằng `useSearchParams`; `const range = parseRange(params.get("range"))`; hàng đợi = `range ? sliceRange(deck.cards, range).map(c => c.id) : cards.filter(c => cram || isDue(reviews[c.id], now))`; khoá dựng hàng đợi gồm `deckId + range`.
- Khi có `path`: link thoát và nút chính màn kết thúc → `/roadmap/${path}` ("Về lộ trình"); câu kết thúc khi có `range`: "Bạn đã học xong phần hôm nay (k thẻ)". Không có `path` → như cũ.

### (Tuỳ chọn) Sidebar
`RoadmapTodayBadge` (mẫu `LibraryCountBadge`): `useAsync(fetchLearningPaths, [])`, tổng `todayCardCount` của path ACTIVE; render "k thẻ" hoặc null; thay badge `currentLevel` ở mục Roadmap. Bỏ qua nếu thiếu thời gian.

Kiểm: lint/build/selfcheck + checklist tay: DRAFT đổi tên/gộp/untick/đổi ngày; activate không reload; "Học ngay (k thẻ)" đúng k thẻ bất kể đến hạn; về `/roadmap/:id`; 375 px không tràn ngang (sticky bar không che chương cuối: `pb-24`).

---

## Task 11: smoke end-to-end + tài liệu

**Tệp:** `smoke-learning-path.mjs` (mới, gốc repo), `e2e.mjs` (thêm vào danh sách ~L60), `package.json` gốc (`"smoke:learning-path"`), `docs/LEARNING_PATH.md` (mới), `docs/EXTRACTION.md`, `docs/CHANGELOG.md`, `docs/CODEBASE_MAP.md`, `docs/USE_CASES_CHECKLIST.md`, `docs/TEAM_GUIDELINES.md`, `docs/Plan/README.md`, `docs/Plan/specs/2026-10-14-lo-trinh-hoc-tap-design.md` (dòng trạng thái).

- `smoke-learning-path.mjs` theo mẫu `smoke-extraction.mjs` (helper `api`, `signUp`, `section`, poll): đăng ký → `POST /learning-paths` multipart (`text` 2 chương `第1課…第2課…`, `days=3`, options `meaningLang=en`) 202 → poll tới DRAFT (FAILED → throw) → `chapters.length >= 1`, `chapters[0].dayFrom === 1`, chương cuối `dayTo === 3` → `GET …/chapters/:cid/items` không rỗng → `PATCH …/items [{id, selected:false}]` → `GET` path: `cardCount` giảm → `PATCH` `{title:"Smoke path"}` → `POST …/activate {startDate:"2026-10-14"}` → ACTIVE, mọi `deckId` khác null, `today.tasks` là mảng → `GET /decks/:deckId` 200 → `DELETE` 204 → deck vẫn 200. Thêm vào `e2e.mjs` và script npm. Chạy thật với backend + ai-service (nếu không chạy được ai-service thật, ghi rõ trong báo cáo).
- `docs/LEARNING_PATH.md`: luồng (sơ đồ như spec), máy trạng thái, bảng API, thuật toán chia ngày, quy tắc tách chương + hạn chế, ngữ nghĩa xoá/FK, cách test. `docs/EXTRACTION.md`: option `splitChapters`, block `heading`, item `chapter`, `stats.chapters`, cột `purpose`, `DELETE` 409. `CHANGELOG.md` mục 14/10/2026. `CODEBASE_MAP.md`: trang `Roadmap (/roadmap, /roadmap/:id)`, feature `roadmap`, API `/api/learning-paths`, file mới backend/ai-service. `USE_CASES_CHECKLIST.md`: UC-37 → `[~]` "lộ trình theo tài liệu (chưa cá nhân hoá theo điểm yếu)". `TEAM_GUIDELINES.md`: phân hệ 6 cập nhật mô tả/%. `docs/Plan/README.md`: thêm dòng spec + plan, trạng thái "Đã làm". Dòng trạng thái đầu spec → "đã triển khai dd/10/2026".
