# Plan: trang kết quả bóc tách kiểu "Sửa bộ thẻ" (bỏ panel văn bản, sửa trực tiếp, tạo bộ thẻ ngay)

Ngày 13/10/2026 · nhánh `backend-feature-learnmode` · trạng thái: **chờ duyệt, chưa sửa code** (tính đến 14/10/2026 chưa có dòng code nào của spec này).
Thay thế mục 3.5 của [2026-10-13-thanh-tien-trinh-boc-tach-design.md](2026-10-13-thanh-tien-trinh-boc-tach-design.md)
(làm gọn `ExtractedTextPanel`: panel này bị bỏ nên mục đó không còn hiệu lực).

> **Cập nhật lần 2 (13/10):** giữ chức năng **Phân tích lại**, nhưng chạy lại **từ đầu** (OCR lại từ file gốc, chỉ giữ nguyên file đầu vào).
> Việc này buộc phải **lưu file gốc trên server** — đảo lại quyết định "không lưu file" ngày 07/10. Xem mục 3.6 và câu hỏi 1 ở mục 6.

## 0. Yêu cầu và hiện trạng

Yêu cầu (từ ảnh chụp trang `/extractions/:id` khi job DONE):

1. Bỏ khối **"Văn bản đã trích"** bên trái.
2. Khối **"Kết quả bóc tách"** đổi sang giao diện như trang **Sửa bộ thẻ**: sửa trực tiếp, thêm / sửa / xoá thẻ, và có nút **Tạo bộ thẻ** ngay.

Hiện trạng đọc từ code:

| Phần                                                                                                               | Hiện tại                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ExtractionPage.tsx:305-323](../../../frontend/src/pages/ExtractionPage.tsx#L305-L323)                             | Lưới 2 cột: `ExtractedTextPanel` \| `ExtractionItemsPanel`                                                                                                                                                       |
| [ExtractionItemsPanel.tsx](../../../frontend/src/features/extraction/components/ExtractionItemsPanel.tsx)         | Mỗi item là một hàng có ô tick; sửa cách đọc/nghĩa lưu bằng `PATCH` khi blur; "xoá" = bỏ tick; "Tạo bộ thẻ" mở `CreateDecksModal` hỏi tên/thư mục/cấp                                                               |
| `PATCH /extractions/{id}/items`                                                                                   | Chỉ sửa được `selected, term, reading, meaningVi, meaningEn, level`. **Không có API thêm/xoá item**, không sửa được câu ví dụ                                                                                     |
| `POST /extractions/{id}/decks` → `ExtractionService.buildDeck`                                                    | Dựng thẻ **từ item đã lưu** (`toCard` ghép nghĩa + "Hán-Việt: …" + ví dụ + ví dụ VI vào `meaning`), sắp N5→N1 rồi tần suất, ghi `job.deckIds`                                                                    |
| [CardRowsEditor.tsx](../../../frontend/src/features/decks/editor/CardRowsEditor.tsx) (trang Sửa bộ thẻ)          | Nhận `EditorCard[]` + 4 callback theo chỉ số; có sẵn thêm / chèn dưới / xoá / "Thêm thẻ". Metadata (`level, kind, readingSegments, hanViet`) đi qua không sửa                                                       |

Nghĩa là "sửa như Sửa bộ thẻ" không làm được chỉ bằng frontend: thêm thẻ và xoá thẻ cần chỗ lưu, còn `meaning` nhiều dòng ở
editor không ánh xạ ngược được về các trường riêng của item.

## 1. Mục tiêu và tiêu chí nghiệm thu

1. Khi job DONE, trang chỉ còn **một cột** giống Sửa bộ thẻ; không còn panel văn bản.
2. Mỗi thẻ có Thuật ngữ, Cách đọc, Nội dung (nhiều dòng); thêm, chèn dưới, xoá, sửa tự do.
3. Nút **Tạo bộ thẻ** nằm trên thanh sticky đầu trang và cuối trang, bấm là tạo ngay (không qua modal riêng); tên/cấp/thư mục sửa ngay trên trang.
4. Thẻ tạo ra **đúng bằng nội dung đang hiện trên màn hình**, kể cả thẻ thêm tay và thẻ đã xoá không có mặt.
5. Không mất cảnh báo chất lượng OCR: độ tin cậy thấp, Gemini lỗi, thiếu nghĩa tiếng Việt, và dòng nghi sai vẫn thấy được, nay gắn thẳng vào thẻ liên quan.
6. Sửa dở rồi rời trang / reload thì quay lại vẫn còn bản nháp.
6b. Nút **Phân tích lại** còn trên trang và chạy lại **toàn bộ** (OCR → phân tích → dịch nghĩa) từ file đầu vào đã tải lên,
    thay kết quả hiện tại và bỏ các chỉnh sửa chưa tạo bộ thẻ; bộ thẻ đã tạo không bị ảnh hưởng (mục 3.6).
7. Hành vi cũ của `POST /extractions/{id}/decks` (không gửi `cards`) không đổi → `smoke-extraction.mjs` và `ExtractionIT` vẫn pass.
8. `npm run build`, `npm run lint`, `npm run selfcheck`, `mvn test` pass.

## 2. Hướng đã cân nhắc

| Hướng                                                                                                                                             | Ưu                                                                                  | Nhược                                                                                                                                                                                     | Quyết định |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| **A. Nháp ở client, gửi danh sách thẻ cuối cùng khi tạo** (`DeckSpec.cards` tuỳ chọn)                                                              | Thẻ = đúng cái đang thấy; thêm/xoá/sửa nhiều dòng tự nhiên; backend chỉ thêm 2 trường | Nháp nằm ở trình duyệt (giảm bằng tự lưu `localStorage`); `PATCH items` không còn được UI dùng                                                                                            | **Chọn**    |
| B. Lưu mọi thao tác lên server (thêm `POST`/`DELETE items`, thêm cột ghi đè `meaning`)                                                              | Nháp bền, đa thiết bị                                                               | Migration + 2 endpoint + khớp ngược `meaning` ↔ trường riêng; nhiều round-trip mỗi lần gõ; quá nặng cho một màn hình sửa                                                                    | Loại        |
| C. Chỉ frontend: sửa trên editor rồi gọi `POST /decks` có sẵn                                                                                      | Không đụng backend                                                                  | `job.deckIds` không được ghi → trang danh sách mất trạng thái "Đã tạo thẻ" và liên kết bộ thẻ (đang dựa vào nó, xem spec giao diện trang Bóc tách AI); không có chống tạo trùng qua job     | Loại        |

## 3. Thiết kế

### 3.1 Bố cục trang khi DONE

Một cột `max-w-5xl mx-auto`, như `DeckEditorPage`:

1. **Header job** (giữ): badge, loại nguồn, tên, thời gian; `StageStepper` chỉ hiện khi đang chạy / lỗi. Khi DONE thêm một dòng meta gọn:
   `gemini · 2 trang · OCR 63% · chữ dọc` (chip hiện có `Chip`, màu theo ngưỡng 85/60 từ spec tiến trình).
2. **Dải cần soát** (chỉ hiện khi có), gom thông báo vốn nằm trong panel văn bản:
   - `meta.lowConfidence` → "Độ tin cậy nhận dạng thấp, hãy đối chiếu với tài liệu gốc trước khi tạo bộ thẻ."
   - `meta.geminiError` / `stats.enrichReason` → câu `geminiReasonText(...)` như hiện nay, kèm nút "Dịch lại nghĩa" (đã có ở trang).
   - Số thẻ thiếu nghĩa / số thẻ cần soát, kèm nút lọc nhanh.
3. **Thanh sticky**: `← Bóc tách AI` · "N thẻ" · [Đặt lại] [Phân tích lại] [**Tạo bộ thẻ**] (nút chính; ghi "Tạo 2 bộ thẻ" khi cả hai loại có thẻ).
   "Đặt lại" chỉ khôi phục kết quả đã phân tích (cục bộ); "Phân tích lại" chạy lại cả pipeline (mục 3.6).
4. **Tab Từ vựng (n) / Ngữ pháp (m)** (giữ từ panel cũ) — mỗi tab là một "bộ thẻ" riêng.
5. **Thông tin bộ thẻ** của tab đang mở: tái dùng `DeckInfoFields` (tiêu đề, mô tả, cấp, thư mục).
6. **Thanh công cụ** như Sửa bộ thẻ: tổng thẻ, lọc cấp (N5…N1, Chưa rõ), ô tìm, công tắc "Chỉ thẻ cần soát", "Xoá hết".
7. **`CardRowsEditor`** + nút "Thêm thẻ".
8. **Thanh tạo cuối trang**: lặp lại nút Tạo bộ thẻ.

Banner "Job này đã tạo bộ thẻ… Tạo lại sẽ sinh bản sao" (hiện nằm trong `CreateDecksModal`) chuyển lên đầu trang khi `deckIds.length > 0`.

### 3.2 Nháp phía client

- **Dựng nháp** khi job DONE và items đã tải: `draftFromItems(items)` (hàm thuần, `extractionUtils.ts`):
  1. Tách theo `kind`, sắp theo `levelRank` (N5 → N1 → chưa rõ), tần suất giảm dần, `position` → khớp thứ tự `buildDeck` đang dùng để bộ thẻ mặc định không đổi.
  2. Mỗi item → `EditorCard` qua `itemToEditorCard`, **phản chiếu `ExtractionService.toCard`**: dòng 1 = `meaningVi ?? meaningEn ?? ""`,
     rồi `Hán-Việt: …`, `example`, `exampleVi`. Khác biệt duy nhất: thiếu nghĩa thì để trống (backend cũ chèn "(chưa có nghĩa)"), để người dùng thấy và điền.
  3. Ghi chú theo `_key` (không gửi API): `level`, `frequency`, `hanViet`, `suspect`, `missingMeaning`.
- **Thao tác**: `useCardDraft(initial)` (hook mới, `features/decks/editor/`) cung cấp `cards, change, add, insertAfter, remove, replaceAll`.
  Không sửa `DeckEditorPage` (hook chỉ dùng ở trang này; trang kia có thể chuyển sang dùng sau). Xoá thẻ cuối cùng thì để danh sách rỗng
  (khác Sửa bộ thẻ vốn luôn giữ 1 hàng trống), hiện empty state.
- **Thẻ thêm tay**: `kind` theo tab đang mở, `level = null`, `readingSegments = null`.
- **Đặt lại**: dựng lại từ items trên server (xác nhận bằng `dialog.confirm`), cũng là cách "hoàn tác" khi lỡ xoá.
- **Tự lưu**: `localStorage["extraction:draft:<jobId>:<finishedAt>"]`, debounce 500 ms, có `try/catch` như `saveOptions`.
  Khoá có `finishedAt` nên "Chạy lại" tạo kết quả mới sẽ không dính nháp cũ. Vào lại trang: có nháp thì khôi phục kèm
  dòng "Đã khôi phục bản nháp chưa tạo · [Bỏ nháp]". Xoá nháp khi tạo xong hoặc Đặt lại.
- **Thẻ nghi sai** (thay cho danh sách `lowLines` ở panel cũ): thẻ có `term` hoặc `surface` nằm trong chuỗi của một dòng trong
  `textMeta.lowLines` → chip "Soát lại · 58%" trên hàng. `lowLines` chỉ có khi engine là Tesseract (không có với Gemini), nên với
  Gemini không có chip này và dải cần soát chỉ nói chung.

### 3.3 Editor

- Tái dùng [CardRowsEditor](../../../frontend/src/features/decks/editor/CardRowsEditor.tsx) nguyên vẹn; thêm **một prop tuỳ chọn**
  `renderRowMeta?: (card: EditorCard, index: number) => React.ReactNode` hiển thị cạnh số thứ tự (badge cấp, "×N", chip Hán-Việt,
  "Soát lại", "Thiếu nghĩa"). Không truyền prop thì `DeckEditorPage` y nguyên.
- **Lọc/tìm** chỉ làm trên danh sách truyền vào; callback chuyển chỉ số → `_key` để sửa đúng thẻ gốc. Số thứ tự hiện theo danh sách
  đang hiển thị (chấp nhận, ghi chú ở UI khi đang lọc: "Đang lọc, số thứ tự theo kết quả lọc").
- Thẻ đã xoá/đã thêm không gọi API cho tới khi bấm Tạo bộ thẻ.

### 3.4 Tạo bộ thẻ

`handleCreate` ở `ExtractionPage` (thay `CreateDecksModal`):

1. Với mỗi `kind`: thẻ hợp lệ = `toValidCardDtos(cards)` (có Thuật ngữ + Nội dung). `kind` không có thẻ hợp lệ thì bỏ qua.
2. Không có `kind` nào → thông báo "Chưa có thẻ hoàn chỉnh để tạo".
3. Có thẻ thiếu nghĩa/thiếu thuật ngữ → `dialog.confirm`: "N thẻ chưa đủ Thuật ngữ + Nội dung sẽ không được tạo."
4. Thiếu tiêu đề ở loại sẽ tạo → báo lỗi, chuyển sang tab đó, focus ô tiêu đề.
5. Gọi `POST /extractions/{id}/decks` với `{vocab, grammar}`, mỗi phần `{title, description, folderId, level, cards}`.
6. Thành công: xoá nháp; 1 bộ → mở `/decks/:id`; 2 bộ → `dialog.alert` liệt kê rồi mở bộ đầu (giữ đúng `handleCreated` hiện tại).
7. Lỗi: giữ nguyên nháp, hiện `extractErrorMessage` ở đầu trang, bấm lại được.

Tên mặc định `defaultDeckTitle(job, kind)`, cấp mặc định `mostCommonLevel` của các thẻ có cấp, thư mục "ngoài cùng" — đều có sẵn.

### 3.5 Backend (nhỏ, tương thích ngược)

`ExtractionRequests.DeckSpec` thêm hai trường tuỳ chọn:

```java
public record DeckSpec(@NotBlank @Size(max = 200) String title, UUID folderId,
                       @Pattern(regexp = "N[1-5]") String level,
                       @Size(max = 1000) String description,
                       @Size(max = 1000) List<@Valid DeckRequest.Card> cards) {}
```

`ExtractionService.buildDeck`:

- `spec.cards()` khác null và không rỗng → dùng nguyên danh sách làm thẻ của bộ (bỏ qua `selected`, không xếp lại); `description` rỗng thì giữ câu "Tạo tự động từ …".
- Ngược lại → giữ nguyên hành vi hiện tại (lấy item `selected`, ném 400 "Chưa chọn … nào" nếu rỗng).
- `deckService.create` vẫn làm kiểm tra chung; `job.deckIds` cập nhật như cũ; trạng thái job phải DONE như cũ.
- Không migration; `PATCH /items` và `PUT /text` giữ nguyên (UI mới không gọi nhưng vẫn là API hợp lệ).

### 3.6 Phân tích lại từ đầu

**Ngữ nghĩa:** giữ nguyên *file đầu vào* (và `sourceName`, `sourceType`), chạy lại cả ba bước TEXT → ANALYZE → ENRICH, tức là
OCR lại. Kết quả cũ (văn bản, item, thống kê) và mọi chỉnh sửa chưa tạo bộ thẻ bị thay; `deckIds` giữ nguyên.
Với job dán văn bản, "file đầu vào" chính là văn bản đã dán nên bước TEXT chỉ đọc lại văn bản đó.

**Vì sao cần lưu file gốc.** Hiện server không giữ file: `ExtractionWorker.runFromText` nhận `byte[]`, trích xong là bỏ
(`ExtractionJob` ghi rõ "File gốc không lưu"). Không có file thì không OCR lại được. Các lựa chọn:

| Lựa chọn                                                                                                     | Nhận xét                                                                                                                                             | Quyết định |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **Lưu file gốc trong Postgres** (bảng riêng `extraction_sources`, `bytea`, giữ có thời hạn, xoá theo job)        | Hoạt động qua reload/đổi máy, cùng cơ sở dữ liệu hiện có, không thêm dịch vụ; tốn dung lượng DB (≤ 15 MB/file) và đảo quyết định "không lưu file"      | **Chọn**    |
| Giữ `File` trong bộ nhớ trình duyệt                                                                          | Mất khi reload / sang trang tải lại / job cũ; trái với tinh thần "rời trang vẫn theo dõi được"                                                        | Loại        |
| Bắt chọn lại file mỗi lần phân tích lại                                                                      | Không "giữ nguyên file đầu vào" như yêu cầu                                                                                                           | Loại        |

**Backend**

- Migration `V13__extraction_sources.sql`: bảng `extraction_sources(job_id uuid PK REFERENCES extraction_jobs ON DELETE CASCADE,
  content bytea NOT NULL, size_bytes int NOT NULL, created_at timestamptz NOT NULL, reanalyze_count int NOT NULL DEFAULT 0,
  last_reanalyzed_at timestamptz)`. Tách bảng để không nạp `bytea` mỗi lần đọc job.
- Lưu trong `ExtractionService.create` ngay sau `jobs.save(job)` khi `hasFile` (file đã qua `sniff` + giới hạn 15 MB). Job dán văn bản không có hàng này.
- **Thời hạn giữ:** `app.extraction.source-retention-days` (mặc định 30). Hiện repo chưa có `@Scheduled`, nên dọn theo cách đơn giản:
  mỗi lần `create` xoá các hàng quá hạn bằng một câu lệnh `DELETE` (không thêm hạ tầng lập lịch). Xoá job thì file xoá theo (cascade).
- `ExtractionJobResponse` thêm `canReanalyze: boolean` = job dán văn bản **hoặc** còn hàng trong `extraction_sources`
  (một truy vấn `IN (...)` cho cả danh sách `GET /extractions`, không N+1).
- **API mới:** `POST /api/extractions/{id}/reanalyze`, body tuỳ chọn `{ options }` (ghi đè một phần `ExtractionOptions`, validate như lúc tạo job).
  - `requireIdle` (409 nếu đang chạy), 400 nếu `!canReanalyze`.
  - Chống lạm dụng OCR/Gemini: cách nhau ≥ 60 giây và tối đa 5 lần mỗi job (`429` kèm thông điệp), đếm ở `extraction_sources`.
    Không tính vào hạn mức ngày (free chỉ 5 lượt/ngày), giống `reEnrich`.
  - Đặt `status = QUEUED`, `stage = QUEUED`, xoá `errorMessage`, gộp `options` mới; gọi `worker.runFromSource(jobId)`.
- `ExtractionWorker.runFromSource`: đọc `content` rồi đi đúng đường của `runFromText` (`ai.extractText` → lưu `extractedText`/`textMeta` → `analyzeAndFinish`).
  Với job văn bản dùng `extractedText` hiện có. `analyzeAndFinish` đã xoá và tạo lại toàn bộ item nên chỉnh sửa/`selected` cũ tự mất.
- **Lỗi giữa chừng không làm mất kết quả cũ:** văn bản/item chỉ bị thay khi bước tương ứng thành công; nếu OCR lỗi, job `FAILED`
  và các trang vẫn cho "Chạy lại". Job cũ tạo trước khi có tính năng (không có file) → `canReanalyze = false`.
- `PUT /text` và `POST /rerun` giữ nguyên làm API (UI mới không còn nút sửa văn bản).

**Frontend**

- Nút **Phân tích lại** trên thanh sticky, `disabled` kèm tooltip khi `canReanalyze = false`:
  "Tài liệu này tải lên trước khi hệ thống lưu file gốc (hoặc file đã quá hạn giữ 30 ngày). Hãy tải lại tệp."
- Bấm → modal xác nhận (`Modal`, theo khuôn các modal hiện có):
  - Cảnh báo: "Kết quả hiện tại và các chỉnh sửa chưa tạo bộ thẻ sẽ bị thay thế. Bộ thẻ đã tạo giữ nguyên."
  - **Tuỳ chọn** (mặc định = `job.options`), dùng lại khối tuỳ chọn của `QuickAiUploadModal` tách thành
    `ExtractionOptionsFields`: hướng chữ (chỉ ảnh/PDF), bố cục, trình độ, lọc cấp, ngôn ngữ nghĩa… Đây là lý do chính để phân tích lại
    từ đầu (đổi chữ dọc ↔ ngang, danh sách ↔ văn xuôi), nên không chỉ là nút "chạy lại".
  - Nút "Phân tích lại" → `POST /reanalyze`.
- Thành công: `restartWith(job)` như `rerun` hiện có (poll lại, `tracker.track`), **xoá nháp** `localStorage` của job, danh sách thẻ trống cho tới khi xong.
- Trang job `FAILED` có `canReanalyze`: nút "Chạy lại" gọi `reanalyze` (thay vì `rerun`), nên job lỗi ngay bước TEXT cũng thử lại được mà không phải tải lại file.
  Job không có file thì giữ hành vi cũ.

### 3.7 Điểm chạm vào code

| File                                                                                                                | Thay đổi                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [ExtractionPage.tsx](../../../frontend/src/pages/ExtractionPage.tsx)                                                | Bỏ lưới 2 cột và `ExtractedTextPanel`; thêm dải cần soát, thanh sticky, `handleCreate`; bỏ `handleReanalyze`, `handlePatch`, `CreateDecksModal`  |
| `frontend/src/features/extraction/components/ExtractionDraftEditor.tsx` (mới)                                       | Tab, thông tin bộ thẻ, thanh công cụ, `CardRowsEditor`, empty state                                                                            |
| `frontend/src/features/extraction/components/ExtractionNotices.tsx` (mới)                                          | Dải cần soát (3.1.2)                                                                                                                            |
| `frontend/src/features/decks/editor/useCardDraft.ts` (mới)                                                         | Hook thao tác danh sách thẻ                                                                                                                     |
| [CardRowsEditor.tsx](../../../frontend/src/features/decks/editor/CardRowsEditor.tsx)                               | Thêm prop tuỳ chọn `renderRowMeta`                                                                                                              |
| [extractionUtils.ts](../../../frontend/src/features/extraction/extractionUtils.ts)                                  | `draftFromItems`, `itemToEditorCard`, `suspectKeys`, `rankLevel`                                                                                |
| [extractionService.ts](../../../frontend/src/services/extractionService.ts), `api.types.ts`                         | `ExtractionDeckSpec` thêm `description?`, `cards?: CardDto[]`                                                                                   |
| `ExtractedTextPanel.tsx`, `ExtractionItemsPanel.tsx`, `CreateDecksModal.tsx`                                        | Xoá khi không còn nơi dùng (kiểm bằng `build` + `lint`)                                                                                         |
| `ExtractionRequests.java`, `ExtractionService.java`                                                                 | 3.5 và 3.6                                                                                                                                      |
| `V13__extraction_sources.sql`, `ExtractionSource.java`, `ExtractionSourceRepository.java` (mới)                    | Bảng + entity + repo lưu file gốc (3.6)                                                                                                         |
| `ExtractionWorker.java`, `ExtractionController.java`, `ExtractionJobResponse.java`, `application.properties`       | `runFromSource`, `POST /{id}/reanalyze`, `canReanalyze`, `app.extraction.source-retention-days`                                                 |
| `ExtractionOptionsFields.tsx` (mới), [QuickAiUploadModal.tsx](../../../frontend/src/features/dashboard/components/modals/QuickAiUploadModal.tsx) | Tách khối tuỳ chọn dùng chung; `ReanalyzeModal.tsx` (mới); `reanalyzeExtraction()` trong `extractionService.ts`; `canReanalyze` trong `api.types.ts` |
| `docs/EXTRACTION.md`                                                                                                | Ghi lại quyết định lưu file gốc, thời hạn giữ, cách xoá                                                                                         |
| `ExtractionIT.java`, `smoke-extraction.mjs`                                                                         | Thêm ca tạo bộ thẻ với `cards` (xem mục 4)                                                                                                      |
| `frontend/scripts/selfCheck.ts`, `docs/CHANGELOG.md`, `docs/CODEBASE_MAP.md`, `docs/USE_CASES_CHECKLIST.md`        | Ca kiểm + ghi tài liệu                                                                                                                          |

Cập nhật chéo: spec tiến trình bỏ hàng `ExtractedTextPanel` ở 3.4 và mục 3.5; trang chi tiết vẫn gọi `tracker.sync/track` như đã định
(`restartWith` còn dùng cho "Chạy lại" và "Dịch lại nghĩa").

## 4. Kiểm thử

Tự động:

- **selfCheck** (`draftFromItems`, `itemToEditorCard`):
  1. Thứ tự: N5 trước N1, chưa rõ cuối; cùng cấp thì tần suất cao trước; hoà thì `position` nhỏ trước.
  2. `meaning` ghép đúng `main\nHán-Việt: X\nví dụ\nví dụ VI`, bỏ dòng thiếu, `main` rỗng khi thiếu cả VI lẫn EN.
  3. `suspectKeys`: khớp theo `term` và `surface`, không khớp thẻ không liên quan, `lowLines` rỗng/undefined không lỗi.
  4. Lọc theo `level`/`query` không đổi thứ tự và ánh xạ `_key` đúng.
- **Backend** (`ExtractionIT`, khuôn các IT hiện có): (a) `POST /decks` có `cards` → bộ thẻ có đúng các thẻ gửi lên (không phải item `selected`),
  `job.deckIds` được ghi; (b) không có `cards` → hành vi cũ; (c) `cards` quá 1000 hoặc thẻ `term` rỗng → 400; (d) job chưa DONE → 400.
- `smoke-extraction.mjs`: thêm một lần tạo bộ thẻ với `cards` tuỳ chỉnh (xoá một mục, thêm một mục) rồi `GET /decks/{id}` so sánh.
- **Phân tích lại** (`ExtractionIT`): (a) upload file → có hàng `extraction_sources`; dán văn bản → không có; (b) `POST /reanalyze`
  trên job DONE → QUEUED → DONE, `deckIds` giữ nguyên, item được tạo lại; (c) job đang chạy → 409; (d) lần thứ hai trong 60 giây → 429, lần thứ sáu → 429;
  (e) job không có file (tạo trước migration) → 400 và `canReanalyze=false`; (f) `options` không hợp lệ → 400; (g) xoá job → hàng nguồn mất;
  (h) quá hạn giữ → hàng bị dọn khi tạo job mới, `canReanalyze=false`. Đồng thời xác nhận `ai.extractText` được gọi lại với **cùng byte** của file gốc.

Tay trên trình duyệt (ghi vào `docs/USE_CASES_CHECKLIST.md`):

1. Mở job DONE → một cột, không còn panel văn bản; số thẻ bằng số item trước đây.
2. Sửa Thuật ngữ / Cách đọc / Nội dung, thêm thẻ (nút "+" trên hàng và "Thêm thẻ" cuối), xoá thẻ → bấm Tạo → bộ thẻ khớp màn hình.
3. Xoá hết rồi "Đặt lại" → trở về kết quả gốc.
4. Reload giữa lúc sửa → "Đã khôi phục bản nháp"; "Bỏ nháp" hoạt động; tạo xong thì nháp mất.
5. Ảnh OCR kém → dải cần soát + chip "Soát lại" đúng thẻ; bật "Chỉ thẻ cần soát" chỉ còn các thẻ đó.
6. Thẻ không có nghĩa → chip "Thiếu nghĩa"; bấm Tạo → hỏi xác nhận, thẻ đó không được tạo.
7. Cả từ vựng lẫn ngữ pháp có thẻ → "Tạo 2 bộ thẻ", hai tiêu đề độc lập.
8. Job đã tạo thẻ → banner liên kết bộ cũ; tạo lại sinh bản sao, bộ cũ nguyên vẹn.
9. Mất mạng khi bấm Tạo → báo lỗi, nháp còn nguyên, bấm lại thành công.
10. 375px: không tràn ngang; thanh sticky không che ô nhập; `DeckEditorPage` (không truyền `renderRowMeta`) không đổi gì.
11. Phân tích lại ảnh: đổi hướng chữ ngang → dọc trong modal → job chạy lại từ bước nhận văn bản, nháp cũ biến mất, kết quả mới thay thế; bộ thẻ cũ còn nguyên.
12. Job tạo trước khi có tính năng → nút "Phân tích lại" mờ kèm tooltip; bấm liên tiếp trong 60 giây → thông báo chờ.
13. Tắt ai-service rồi phân tích lại → job FAILED, trang báo lỗi và có "Chạy lại"; dữ liệu item/văn bản cũ trên server không bị xoá; bật lại ai-service, "Chạy lại" thành công và kết quả mới thay thế.

## 5. Rủi ro và điều bị mất

- **"Phân tích lại" đổi nghĩa:** không còn phân tích lại từ văn bản đã sửa tay (không còn ô sửa văn bản), mà chạy lại từ file gốc.
  Muốn sửa chữ OCR thì sửa trực tiếp ở thẻ; muốn đọc lại khác đi (đổi hướng chữ / bố cục) thì Phân tích lại với tuỳ chọn mới.
- **Lưu file gốc đảo quyết định "không lưu file" (07/10).** Tài liệu người dùng (giáo trình, ảnh chụp) nằm ở DB tới 30 ngày. Giảm bằng: bảng riêng,
  tự dọn khi quá hạn, xoá cùng job, không bao giờ trả file ra API, giới hạn 15 MB/file. Với DB nhỏ (ví dụ gói miễn phí) dung lượng là điểm cần theo dõi:
  30 ngày × 5 lượt/ngày × ≤ 15 MB ≈ ≤ 2,2 GB cho **một** người dùng trong trường hợp xấu nhất, nên cân nhắc hạ thời hạn xuống 7 ngày (Q1).
- **Thẻ bị xoá tay khỏi nháp không "nhớ"** qua máy khác: nháp nằm ở trình duyệt. Đã chấp nhận theo hướng A.
- **Hai nguồn sự thật về `meaning`** (item trên server vs nháp): sau khi tạo bộ thẻ, `ExtractionItem` vẫn là bản gốc chưa sửa. Chấp nhận: trang
  danh sách chỉ dùng `stats` và `deckIds`; muốn mở lại job để sửa tiếp thì nháp (nếu còn) hoặc kết quả gốc được dùng.
- **Thẻ lớn của `CardRowsEditor`** (ô Nội dung cao ~8,5rem): 100 thẻ là trang rất dài. Đã chọn giống Sửa bộ thẻ theo yêu cầu; nếu khó dùng thì thêm chế độ gọn
  (`rows=2`) là việc nhỏ, đã có tìm/lọc để rút ngắn.
- **Số thứ tự khi đang lọc** theo kết quả lọc, không phải vị trí thật; có ghi chú trên giao diện.

## 6. Câu hỏi mở (mặc định đã chọn)

1. **(Cần bạn xác nhận)** Chấp nhận **lưu file gốc trên server** để Phân tích lại từ đầu, và thời hạn giữ? *Mặc định: có, 30 ngày; đề xuất cân nhắc 7 ngày nếu dung lượng DB hạn chế.*
   Nếu không muốn lưu file: phương án còn lại là Phân tích lại chỉ chạy lại từ **văn bản đã trích** (như `POST /rerun` hiện có, không OCR lại), không cần migration.
1b. Phân tích lại có **cho đổi tuỳ chọn** (hướng chữ, bố cục…) trong modal không? *Mặc định: có.* Có tính vào hạn mức ngày (free 5 lượt) không? *Mặc định: không, chỉ giới hạn 60 giây / 5 lần mỗi job.*
2. Trang vẫn cho tạo **nhiều bộ** (từ vựng + ngữ pháp) như hiện nay? *Mặc định: có, hai tab, mỗi tab một bộ.*
3. Thứ tự thẻ mặc định theo cấp N5→N1 (khớp bộ thẻ tạo trước đây), người dùng không kéo-thả được, chỉ chèn thêm. *Mặc định: như vậy.*
4. Nháp lưu `localStorage` (theo trình duyệt) thay vì lên server. *Mặc định: như vậy.*

## 7. Thứ tự làm đề xuất

1. Backend: `DeckSpec` + `buildDeck` + test (độc lập, không phá cũ) → `mvn test`, `smoke-extraction.mjs`.
1b. Backend: `V13__extraction_sources` + lưu file khi tạo job + `POST /reanalyze` + `canReanalyze` + test (3.6). **Chỉ làm sau khi Q1 được duyệt.**
2. `extractionUtils.ts` (`draftFromItems`, `itemToEditorCard`, `suspectKeys`) + ca selfCheck, viết trước, chạy đỏ rồi xanh.
3. `useCardDraft` + prop `renderRowMeta` cho `CardRowsEditor` (kiểm `DeckEditorPage` không đổi).
4. `ExtractionDraftEditor` + `ExtractionNotices`; thay vào `ExtractionPage`, nối `handleCreate`.
5. Tự lưu nháp + khôi phục + Đặt lại; `ExtractionOptionsFields` + `ReanalyzeModal` + nút Phân tích lại + "Chạy lại" dùng `reanalyze`.
6. Dọn component không còn dùng; build + lint + selfcheck + chạy tay checklist mục 4; cập nhật `docs/*`.
