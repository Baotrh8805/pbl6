# Plan: thanh tiến trình bóc tách xuyên trang + làm gọn panel kết quả OCR

Ngày 13/10/2026 · nhánh `backend-feature-learnmode` · trạng thái: **chờ duyệt, chưa sửa code** (tính đến 14/10/2026 chưa có dòng code nào của spec này).
Tiếp nối [2026-10-12-trich-xuat-cum-tu-design.md](2026-10-12-trich-xuat-cum-tu-design.md) (luồng job QUEUED → TEXT → ANALYZE → ENRICH → DONE).

## 0. Vấn đề

Sau khi tải ảnh lên, người dùng bị chuyển thẳng sang `/extractions/:id`. Thanh tiến trình (`StageStepper`) và vòng poll 2 giây
đều nằm **trong** `ExtractionPage` ([ExtractionPage.tsx:45-64](../../../frontend/src/pages/ExtractionPage.tsx#L45-L64)),
nên rời trang là mất cả hai. Trang vẫn ghi "Bạn có thể rời trang và quay lại sau" nhưng không có gì cho biết job đã xong chưa.
Job chạy ngầm ở backend (worker `@Async`), chỉ cần frontend theo dõi nó ở một chỗ không bị unmount khi đổi trang.

Dữ kiện nền, đã đọc từ code:

- `AppLayout` sống suốt các route con (Outlet), chỉ `StudyPage` và `QuizPage` nằm ngoài layout.
- Backend chỉ báo `stage`, không có phần trăm. Một ảnh đơn là **một** lệnh Tesseract nên không có tiến độ thật bên trong bước.
- `GET /extractions` trả job của người dùng (không kèm `extractedText`); `GET /extractions/:id` trả một job.
- Worker sống trong RAM: restart backend thì job QUEUED/RUNNING bị đánh dấu FAILED khi khởi động lại, tức frontend sẽ thấy FAILED có `errorMessage`.
- Không lưu file gốc trên server → không có ảnh để hiện cạnh văn bản đã trích.
- Frontend chưa có test runner; pure function được kiểm bằng [scripts/selfCheck.ts](../../../frontend/scripts/selfCheck.ts).

## 1. Mục tiêu và tiêu chí nghiệm thu

1. Tải tài liệu xong, người dùng đi tới bất kỳ trang nào trong layout (Dashboard, Bộ thẻ, Thư mục, Hồ sơ…) vẫn thấy một thanh
   tiến trình của job đó cho tới khi xong.
2. Job xong → thanh chuyển xanh, có nút "Xem kết quả" dẫn tới `/extractions/:id`. Job lỗi → thanh đỏ kèm lý do và nút "Mở".
3. Reload trình duyệt khi job còn chạy → thanh vẫn xuất hiện lại (tự tìm job đang chạy từ server).
4. Đang mở đúng trang chi tiết của job đó thì **không** hiện thanh (trang đã có `StageStepper`), tránh trùng lặp.
5. Phần trăm hiển thị không bao giờ giảm, không chạm 100% trước khi server báo DONE.
6. `npm run build`, `npm run lint`, `npm run selfcheck` đều pass; không đổi backend, không migration.

Ngoài phạm vi (cố ý, YAGNI): % thật theo từng trang PDF (cần cột progress + ai-service báo trang), hiển thị ảnh gốc cạnh
văn bản, thông báo qua `document.title`/Notification API, badge số job trên sidebar, nhớ "đã xem" qua reload,
hiện thanh trên `StudyPage`/`QuizPage` (màn hình học chiếm trọn, không nên bị chen).

## 2. Các hướng đã cân nhắc

| Hướng                                                                                      | Ưu                                                                                                    | Nhược                                                                                                                                       | Quyết định          |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **A. Tracker toàn cục trong `AppLayout`, poll riêng; `ExtractionPage` giữ vòng poll của nó** | Đổi ít code cũ, trang chi tiết không bị refactor; tracker và trang cùng nhìn một job qua `sync(job)` | Hai nơi biết trạng thái job (giảm nhẹ bằng `sync`: trang đẩy mỗi bản job mới vào tracker, tracker không poll job đang mở)                  | **Chọn**             |
| B. Dời toàn bộ poll vào tracker, `ExtractionPage` chỉ đọc context                           | Một nguồn sự thật duy nhất                                                                            | Trang cần `includeText=true` + `doneKey` tải lại items + `restartWith`; phải đập lại logic trang đang chạy ổn, rủi ro hồi quy cao hơn lợi ích | Loại                 |
| C. Server-Sent Events / WebSocket đẩy trạng thái                                            | Không poll                                                                                            | Thêm hạ tầng backend cho một việc mà poll 2 giây đã đủ; không nằm trong yêu cầu                                                           | Loại                 |

## 3. Thiết kế

### 3.1 Tính tiến độ: `frontend/src/features/extraction/progress.ts` (hàm thuần, không React)

Khoảng phần trăm mỗi bước, theo `job.stage`:

| Stage       | Từ → đến | τ (giây) | Nhãn (ảnh/PDF)                | Nhãn (văn bản/docx)        |
| ----------- | --------- | --------- | ------------------------------ | --------------------------- |
| `QUEUED`    | 2 → 8     | 4         | Đang chờ đến lượt              | Đang chờ đến lượt           |
| `TEXT`      | 8 → 45    | 15        | Đang nhận dạng chữ (OCR)       | Đang đọc văn bản            |
| `ANALYZE`   | 45 → 80   | 8         | Đang tách từ vựng, ngữ pháp    | giống cột trái              |
| `ENRICH`    | 80 → 96   | 10        | Đang dịch nghĩa tiếng Việt     | giống cột trái              |
| `DONE`      | 100       | —         | Hoàn tất                       | Hoàn tất                    |

- `estimateProgress(stage, sinceMs)` = `from + (to - from) × (1 − e^(−sinceMs/τ))`. Tiệm cận `to` nhưng không bao giờ chạm,
  nên không "đứng ở 100%" khi server còn xử lý. `sinceMs` là thời gian kể từ lúc **tracker thấy** stage đó (đo ở client,
  vì backend không trả thời điểm vào stage).
- `nextProgress(prev, stage, sinceMs)` = `max(prev, estimateProgress(...))` → không giảm, kể cả khi job chạy lại
  (rerun/re-enrich đẩy stage về `QUEUED` thì tracker coi là một lượt mới và đặt lại `prev`).
- `stageLabel(stage, sourceType)` trả nhãn ở bảng trên. `FAILED` giữ nguyên % lúc lỗi, đổi màu đỏ.
- Các hằng số (khoảng, τ) nằm gom trong một object `STAGE_PROGRESS`, chỉnh một chỗ. Con số là ước lượng, nhãn UI ghi rõ
  "ước tính" qua `title`, không hứa số giây còn lại.

### 3.2 Tracker: context toàn cục trong layout

Theo khuôn của `AuthContext` (tách để qua được lint react-refresh):

- `frontend/src/features/extraction/context/extractionTrackerContext.ts` — `createContext` + kiểu `ExtractionTrackerValue`.
- `frontend/src/features/extraction/context/ExtractionTrackerProvider.tsx` — state và vòng poll.
- `frontend/src/features/extraction/context/useExtractionTracker.ts` — hook, ném lỗi khi dùng ngoài provider (giống `useAuth`).

Giá trị context:

```ts
interface TrackedJob {
  job: ExtractionJob;           // bản mới nhất (không kèm extractedText)
  progress: number;             // 0..100, đã qua nextProgress
  stageSince: number;           // Date.now() lúc thấy stage hiện tại
  dismissed: boolean;           // người dùng bấm × hoặc đã xem kết quả
  stalled: boolean;             // ≥ 3 lần poll liên tiếp lỗi mạng
}
interface ExtractionTrackerValue {
  tracked: TrackedJob[];                    // đang hiện: chưa dismissed
  track: (job: ExtractionJob) => void;      // thêm/khởi động lại theo dõi (sau upload, rerun, reanalyze, re-enrich)
  sync: (job: ExtractionJob) => void;       // trang chi tiết đẩy bản job mới nhất vào
  dismiss: (id: string) => void;
  changeSeq: number;                        // tăng khi có job mới / một job đổi sang DONE|FAILED (để danh sách tự tải lại)
}
```

Hành vi:

1. **Tìm lại khi mount:** gọi `fetchExtractions()` một lần, giữ job `QUEUED`/`RUNNING` → vào `tracked` (đáp ứng nghiệm thu 3).
   Job DONE/FAILED có sẵn từ trước không đưa vào (tránh bật thanh cho việc cũ).
2. **Poll theo từng job:** mỗi job đang active một timer 2 giây gọi `fetchExtraction(id)` (không kèm text). Thường chỉ 1 job.
   Dừng khi `DONE`/`FAILED`/`CANCELLED`. Lỗi mạng: giữ trạng thái cũ, thử lại với backoff 2 → 5 giây, sau 3 lần lỗi đặt `stalled`;
   `404` (job bị xoá) → bỏ khỏi `tracked`. `401` do `apiClient` lo (sự kiện `auth:expired`).
3. **Không poll job đang mở trên trang chi tiết:** dùng `useLocation` khớp `/extractions/:id`. Job đó được trang đẩy qua `sync(job)`;
   `sync` cũng upsert vào `tracked`. Khi người dùng rời trang, tracker tick ngay một lần (không chờ 2 giây) rồi poll bình thường.
4. **Job xong khi người dùng đang xem đúng trang đó:** `sync` thấy trạng thái cuối + id trùng route → `dismissed = true`,
   không hiện thanh thành công (họ đang nhìn kết quả).
5. Tab quay lại foreground (`visibilitychange`) → tick ngay để bắt kịp trạng thái.
6. `changeSeq` tăng khi: `track()` một job mới, hoặc job chuyển sang DONE/FAILED. `ExtractionsPage` dùng nó làm dependency tải lại.
7. Dọn sạch timer khi unmount (rời layout sang Study/Quiz); quay lại layout thì bước 1 chạy lại.

### 3.3 Giao diện: `ExtractionProgressDock`

`frontend/src/features/extraction/components/ExtractionProgressDock.tsx`, render một lần trong `AppLayout` (cạnh `<main>`).

- Vị trí: `fixed` góc dưới phải trên desktop (`md:left-auto md:right-4 md:w-[22rem]`), dưới cùng full-width với lề 16px trên mobile,
  `z-30` (Sidebar `z-40`, Header `z-50` nên menu mobile mở ra sẽ che dock; `Modal` dùng `<dialog>.showModal()` nên luôn nằm trên dock).
- Mỗi job một thẻ: tên (`sourceName` hoặc "Văn bản dán", cắt `truncate`), nhãn bước, thanh `div[role="progressbar"]`
  (`aria-valuenow`, `aria-valuemin=0`, `aria-valuemax=100`, `aria-label` có tên tài liệu), `%` bên phải.
  Chuyển bước thì `aria-live="polite"` đọc nhãn mới; `%` không nằm trong vùng live để không đọc mỗi 2 giây.
- Trạng thái: đang chạy (màu primary, thanh chuyển động mượt `transition-[width]`) / xong (màu secondary + nút "Xem kết quả" +
  × đóng) / lỗi (màu error + `errorMessage` cắt 2 dòng + nút "Mở" + × đóng) / mất kết nối (`stalled`: dòng "Mất kết nối, đang thử lại…").
- Nhiều job: hiện tối đa 3 thẻ, còn lại gộp "+N tác vụ khác" dẫn tới `/extractions`.
- Tôn trọng `prefers-reduced-motion`: bỏ transition và `animate-pulse`.
- Dùng token màu/lớp sẵn có (`bg-surface-container-lowest`, `border-surface-container-high`, `rounded-2xl`, `shadow-xs`, `material-symbols-outlined`).

### 3.4 Điểm chạm vào code hiện có

| File                                                                                                                                     | Thay đổi                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [AppLayout.tsx](../../../frontend/src/components/layout/AppLayout.tsx)                                                                   | Bọc phần return bằng `ExtractionTrackerProvider`, thêm `<ExtractionProgressDock />`                                                                                                                                                     |
| [QuickAiUploadModal.tsx:116](../../../frontend/src/features/dashboard/components/modals/QuickAiUploadModal.tsx#L116)                      | Thay `navigate(...)` bằng `tracker.track(job)` + `onClose()` → ở lại trang hiện tại, thanh hiện ngay. Modal chỉ được render trong `DashboardPage` và `ExtractionsPage`, đều nằm trong layout nên có provider                            |
| [ExtractionPage.tsx](../../../frontend/src/pages/ExtractionPage.tsx)                                                                     | Gọi `tracker.sync(job)` mỗi khi `job` đổi; `restartWith` (rerun / re-enrich / phân tích lại từ file gốc) gọi thêm `tracker.track(next)` để theo dõi lại. **Không đổi** vòng poll của trang                                                                 |
| [ExtractionsPage.tsx](../../../frontend/src/pages/ExtractionsPage.tsx)                                                                   | Thêm `tracker.changeSeq` vào dependency của `useAsync` để danh sách tự tải lại khi có job mới/xong; dòng đang chạy hiện mini progress                                                                                                   |
| [ExtractedTextPanel.tsx](../../../frontend/src/features/extraction/components/ExtractedTextPanel.tsx)                                     | **Không sửa**: component bị bỏ khỏi trang theo spec kết quả kiểu Sửa bộ thẻ (xem 3.5)                                                                                                                                                  |
| `frontend/scripts/selfCheck.ts`                                                                                                          | Thêm ca kiểm `progress.ts` (xem 4)                                                                                                                                                                                                      |
| `docs/CHANGELOG.md`, `docs/CODEBASE_MAP.md`, `docs/USE_CASES_CHECKLIST.md`                                                               | Ghi theo thông lệ repo sau khi code xong                                                                                                                                                                                                |

Quyết định cần biết: sau upload **không còn tự chuyển sang trang chi tiết**. Đây là thay đổi hành vi có chủ ý (đáp ứng
"đi trang khác vẫn thấy tiến trình"); muốn giữ cách cũ chỉ cần thêm lại một dòng `navigate` ở modal.

### 3.5 ~~Làm gọn panel kết quả OCR~~ — **đã bị thay thế (13/10)**

Panel `ExtractedTextPanel` bị bỏ khỏi trang chi tiết theo yêu cầu mới; cảnh báo chất lượng OCR chuyển sang dải "cần soát" trên trang kết quả.
Xem [2026-10-13-ket-qua-boc-tach-kieu-sua-bo-the-design.md](2026-10-13-ket-qua-boc-tach-kieu-sua-bo-the-design.md).
Giữ lại từ mục này một điều: màu chip độ tin cậy theo ngưỡng 85% / 60% (hàm `ocrTone` dùng chung, xem spec giao diện trang Bóc tách AI).

## 4. Kiểm thử

Tự động (`frontend/scripts/selfCheck.ts`, `npm run selfcheck`):

1. `estimateProgress` luôn nằm trong `[from, to)` của stage với mọi `sinceMs ≥ 0`; tăng đơn điệu theo `sinceMs`; `sinceMs = 0` trả đúng `from`.
2. `nextProgress(prev, …)` không bao giờ nhỏ hơn `prev`.
3. Stage `DONE` → đúng 100; các stage khác luôn < 100.
4. Thứ tự: `to` của stage trước ≤ `from` của stage sau (không nhảy lùi khi sang bước).
5. `stageLabel("TEXT", "image")` ≠ `stageLabel("TEXT", "text")`; mọi stage đều có nhãn.

Tay trên trình duyệt (checklist ghi vào `docs/USE_CASES_CHECKLIST.md`):

1. Upload ảnh từ Dashboard → modal đóng, thanh hiện ở góc dưới phải; đi `/decks`, `/folders`, `/profile`: thanh vẫn còn, % chạy.
2. Job xong khi đang ở trang khác → thanh xanh, "Xem kết quả" mở đúng job; bấm × thì biến mất.
3. Reload giữa chừng → thanh xuất hiện lại.
4. Mở thẳng `/extractions/:id` của job đang chạy → không có thanh (chỉ `StageStepper`); rời trang → thanh hiện lại đúng bước.
5. Tắt ai-service để job FAILED → thanh đỏ + lý do + "Mở"; bấm "Chạy lại" ở trang chi tiết → thanh quay lại chạy.
6. Mất mạng 10 giây → dòng "Mất kết nối…", có mạng lại thì tự hết.
7. Hai job song song → hai thẻ; 4 job → 3 thẻ + "+1 tác vụ khác".
8. Mobile 375px: dock full-width, không tràn ngang, không che nút chính của trang.
9. Danh sách `/extractions` tự cập nhật khi job mới/xong mà không cần F5.

## 5. Rủi ro

- **Hai nguồn trạng thái (hướng A).** Giảm bằng `sync` một chiều trang → tracker và quy tắc "tracker không poll job đang mở". Nếu sau này thấy lệch, chuyển sang hướng B là việc riêng.
- **% là ước lượng.** OCR ảnh nặng có thể lâu hơn τ; thanh sẽ "nằm ở ~44%" thay vì nhảy loạn. Chấp nhận, đã nói rõ trong tooltip.
- **Không nhớ "đã xem" qua reload.** Job xong lúc người dùng đã đóng tab sẽ không bật thanh khi quay lại; họ vẫn thấy nó ở `/extractions`. Muốn nhớ thì thêm localStorage theo `userEmail` (việc nhỏ, để sau).
- **Số request.** Một job active = 1 request/2 giây, ngang cách trang chi tiết đang làm. Dừng hẳn khi job kết thúc.

## 6. Thứ tự làm đề xuất (để chuyển sang plan triển khai)

1. `progress.ts` + ca selfCheck (viết test trước, chạy đỏ rồi xanh).
2. Context + Provider + hook; nối vào `AppLayout` (chưa có UI).
3. `ExtractionProgressDock`.
4. Đổi `QuickAiUploadModal`, nối `sync`/`track` ở `ExtractionPage`, `changeSeq` ở `ExtractionsPage`.
5. ~~Làm gọn `ExtractedTextPanel`~~ — bỏ, thay bằng spec kết quả kiểu Sửa bộ thẻ.
6. Build + lint + selfcheck + chạy tay checklist ở mục 4; cập nhật `docs/*`.
