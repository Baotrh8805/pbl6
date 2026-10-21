# Plan: nâng cấp giao diện trang Bóc tách AI (danh sách `/extractions`)

Ngày 13/10/2026 · nhánh `backend-feature-learnmode` · trạng thái: **chờ duyệt, chưa sửa code** (tính đến 14/10/2026 chưa có dòng code nào của spec này).
Phụ thuộc [2026-10-13-thanh-tien-trinh-boc-tach-design.md](2026-10-13-thanh-tien-trinh-boc-tach-design.md): trang này dùng
`useExtractionTracker` để hiện tiến độ sống và tự tải lại. Làm spec đó trước.

## 0. Hiện trạng

[ExtractionsPage.tsx](../../../frontend/src/pages/ExtractionsPage.tsx) là một danh sách phẳng: mỗi job một dòng gồm badge trạng thái,
loại nguồn, tên, ngày và "N từ vựng · M ngữ pháp". Điểm yếu, đều đọc từ code:

| #  | Vấn đề                                                                                                                                                                                         | Bằng chứng                                                                                          |
| -- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1  | Không phân biệt "xong rồi nhưng chưa tạo bộ thẻ" với "đã tạo thẻ"; người dùng phải mở từng job                                                                                                  | chỉ có `deckIds.length` nối vào chuỗi text ([dòng 83](../../../frontend/src/pages/ExtractionsPage.tsx#L83)) |
| 2  | Chất lượng OCR không lộ ra ở danh sách: `textMeta.meanConfidence`, `lowConfidence`, `lowLines` và `stats.enriched === false` đều có sẵn trong response nhưng chỉ thấy khi mở chi tiết           | `ExtractionJobResponse` trả nguyên `textMeta` + `stats`                                              |
| 3  | Phân bố cấp JLPT (`stats.byLevel`) không dùng                                                                                                                                                   | —                                                                                                    |
| 4  | Không tìm kiếm / lọc theo trạng thái / loại nguồn; không giới hạn số dòng hiển thị                                                                                                              | `GET /extractions` không phân trang, không tham số                                                   |
| 5  | Job đang chạy trông y hệt job cũ, không có tiến độ; danh sách không tự cập nhật khi job xong (phải F5)                                                                                          | `useAsync(fetchExtractions, [refreshIndex])` chỉ tải lại khi xoá                                      |
| 6  | Job FAILED chỉ có một dòng chữ lỗi, không có hành động tiếp theo                                                                                                                               | [dòng 84](../../../frontend/src/pages/ExtractionsPage.tsx#L84)                                       |
| 7  | Loading là một dòng "Đang tải..."; mỗi lần tải lại nội dung nháy mất                                                                                                                           | [dòng 55-56](../../../frontend/src/pages/ExtractionsPage.tsx#L55-L56)                                |
| 8  | Tiêu đề trang "Bóc tách AI" lệch với nhãn sidebar "Bóc Tách AI"                                                                                                                                | [DashboardSidebar.tsx:79](../../../frontend/src/features/dashboard/components/DashboardSidebar.tsx#L79) |

## 1. Mục tiêu và tiêu chí nghiệm thu

1. Nhìn vào danh sách là biết ngay **việc cần làm tiếp**: job nào đang chạy, job nào chờ duyệt để tạo thẻ, job nào lỗi.
2. Không cần mở chi tiết vẫn thấy chất lượng kết quả (độ tin cậy OCR, số dòng cần soát, thiếu nghĩa tiếng Việt, bị cắt bớt).
3. Tìm theo tên, lọc theo trạng thái và loại nguồn; bộ lọc nằm trên URL (chia sẻ/refresh vẫn giữ), theo khuôn `DecksPage`.
4. Job đang chạy hiện tiến độ sống; job xong/lỗi tự cập nhật trên danh sách, không cần F5.
5. Giữ nguyên toàn bộ hành vi hiện có: bấm dòng → `/extractions/:id`, xoá có xác nhận, nút "Bóc tách mới", empty state.
6. `npm run build`, `npm run lint`, `npm run selfcheck` pass; không đổi backend, không migration.

## 2. Thiết kế

Trạng thái hiển thị là **phase** suy ra từ job, không thêm trường mới (`jobPhase` trong `jobListUtils.ts`):

| Phase       | Điều kiện                                          | Nhãn           | Hành động chính          |
| ----------- | --------------------------------------------------- | --------------- | ------------------------- |
| `active`    | `status` là `QUEUED` hoặc `RUNNING`                 | Đang xử lý      | (xem tiến độ)             |
| `review`    | `DONE` và `deckIds.length === 0`                    | Chờ duyệt       | **Duyệt & tạo thẻ**       |
| `created`   | `DONE` và `deckIds.length > 0`                      | Đã tạo thẻ      | **Mở bộ thẻ**             |
| `failed`    | `FAILED`                                            | Lỗi             | Mở / Tải lại tệp          |
| `cancelled` | `CANCELLED`                                         | Đã huỷ          | —                         |

### 2.1 Bố cục trang (trên xuống)

1. **Header** (giữ): tiêu đề "Bóc Tách AI" (đồng bộ sidebar), mô tả, nút "Bóc tách mới".
2. **Dải tóm tắt** — 4 ô: Đang xử lý · Chờ duyệt · Đã tạo thẻ · Lỗi. Mỗi ô là nút đặt bộ lọc phase tương ứng
   (bấm lần nữa để bỏ). Số đếm tính từ danh sách đã tải. Ô "Chờ duyệt" nổi bật nhất vì là việc người dùng cần làm.
3. **Thanh lọc**: ô tìm theo tên (`q`), chip phase (`status`), select loại nguồn (`type`: Ảnh / PDF / Word / Văn bản).
   Tham số URL `q`, `status`, `type` với `replace: true`, y hệt `DecksPage`.
4. **Danh sách thẻ job** (mục 2.2), mặc định hiện 20 mục đầu, nút "Xem thêm" mỗi lần 20.
5. **Empty state**: (a) chưa có job nào — giữ câu cũ, thêm dòng liệt kê định dạng hỗ trợ và giới hạn 15 MB;
   (b) có job nhưng bộ lọc không khớp — "Không có kết quả khớp" + nút "Xoá bộ lọc".

### 2.2 Thẻ job (`ExtractionJobCard`)

Vẫn là một `<li>` với link "kéo giãn" (`after:inset-0`) tới chi tiết, nút thao tác `relative z-10` như `DecksPage`
(tránh lồng button trong `<a>`). Nội dung:

- **Đầu thẻ:** ô icon theo loại nguồn (`image`, `picture_as_pdf`, `description`, `notes`) + tên (truncate) +
  badge phase + thời gian tương đối ("5 phút trước", "hôm qua", quá 7 ngày thì ngày đầy đủ); `title` giữ giờ chính xác.
- **`active`:** nhãn bước + thanh `role="progressbar"` lấy từ tracker (`TrackedJob.progress`, `stageLabel`), không tự poll.
- **`review` / `created`:**
  - Dòng kết quả "N từ vựng · M ngữ pháp" và **thanh phân bố cấp** từ `stats.byLevel` (N5…N1 + "chưa rõ", tông đậm dần;
    `title` mỗi đoạn ghi "N3: 12 từ"). Có `aria-label` tóm tắt bằng chữ.
  - **Chip chất lượng** (chỉ hiện khi có ý nghĩa): `OCR 63%` (màu theo ngưỡng 85/60, chỉ ảnh/PDF), `n dòng cần soát`
    (`lowLines.length`, hiện "50+" khi chạm trần 50 của backend), `Chưa dịch nghĩa VI` (`stats.enriched === false`),
    `Đã cắt bớt` (`textMeta.truncated`).
- **`failed`:** `errorMessage` tối đa 2 dòng; nút "Mở" tới chi tiết. Nếu `canReanalyze` (file gốc còn lưu, xem spec kết quả kiểu Sửa bộ thẻ mục 3.6)
  thì có thêm "Chạy lại" ngay trên thẻ; job cũ không còn file → "Tải lại tệp" mở `QuickAiUploadModal`.
- **Hành động:** nút chính theo phase (bảng trên; "Mở bộ thẻ" → `/decks/${deckIds[0]}`), icon xoá như cũ (ẩn khi `active`).

### 2.3 Dữ liệu và làm mới

- Nguồn danh sách vẫn là `fetchExtractions()`. Lớp phủ: với job có trong `tracker.tracked`, dùng bản mới hơn của tracker
  (merge theo `id`). Tải lại danh sách khi `tracker.changeSeq` đổi.
- Khi đang tải lại, giữ danh sách cũ trên màn hình (cùng kiểu `lastData` ở `AppLayout`) thay vì quay về "Đang tải...".
- Lần tải đầu hiện 3 dòng skeleton cùng chiều cao thẻ để không giật bố cục.

### 2.4 Truy cập và responsive

- Chip phase dùng `aria-pressed`; vùng kết quả có `aria-live="polite"` đọc "Hiển thị 5 / 12 lượt".
- Mọi icon `aria-hidden`; thông tin không chỉ dựa vào màu (chip luôn có chữ, thanh cấp có `aria-label`).
- Mobile 375px: dải tóm tắt 2×2, thẻ một cột, nút chính xuống dòng riêng, không tràn ngang.
- Dùng token màu, lớp và font hiện có (`bg-surface-container-lowest`, `rounded-xl`, `text-label-sm`, …); không thêm dependency.

## 3. Mức ưu tiên (để bạn cắt bớt)

| Mức                | Nội dung                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| **P0 — lõi**        | `jobPhase`, dải tóm tắt, thẻ job mới (icon, phase, kết quả, chip chất lượng, hành động chính), empty state     |
| **P1 — nên có**     | Tìm + lọc (URL), tiến độ sống qua tracker + tự tải lại, giữ dữ liệu cũ khi tải lại, skeleton, "Xem thêm"       |
| **P2 — tuỳ chọn**   | Chọn nhiều để xoá hàng loạt (không có endpoint bulk → gọi tuần tự, báo số lỗi); kéo-thả tệp vào trang mở modal đã chọn sẵn tệp (`QuickAiUploadModal` thêm prop `initialFile`) |

## 4. Điểm chạm vào code

| File                                                                                           | Thay đổi                                                                                          |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `frontend/src/features/extraction/jobListUtils.ts` (mới)                                       | Hàm thuần: `jobPhase`, `summarizePhases`, `filterJobs`, `formatRelativeTime(iso, now)`, `ocrTone`, `levelSegments` |
| `frontend/src/features/extraction/components/ExtractionJobCard.tsx` (mới)                      | Thẻ job (2.2)                                                                                      |
| `frontend/src/features/extraction/components/ExtractionSummaryTiles.tsx` (mới)                 | Dải 4 ô tóm tắt                                                                                    |
| `frontend/src/features/extraction/components/ExtractionFilterBar.tsx` (mới)                    | Tìm + chip phase + select loại                                                                     |
| `frontend/src/features/extraction/components/LevelDistributionBar.tsx` (mới)                   | Thanh phân bố cấp                                                                                  |
| [ExtractionsPage.tsx](../../../frontend/src/pages/ExtractionsPage.tsx)                         | Ghép các phần trên, đọc/ghi `useSearchParams`, merge tracker, giữ `QuickAiUploadModal` + xoá       |
| [extractionUtils.ts](../../../frontend/src/features/extraction/extractionUtils.ts)             | Thêm `SOURCE_TYPE_ICONS`, `PHASE_LABELS`                                                           |
| `frontend/scripts/selfCheck.ts`                                                                | Ca kiểm cho `jobListUtils.ts` (mục 5)                                                              |
| `docs/CHANGELOG.md`, `docs/CODEBASE_MAP.md`, `docs/USE_CASES_CHECKLIST.md`                     | Ghi sau khi code xong                                                                              |

Dùng chung với spec tiến trình: `ocrTone` là một hàm duy nhất cho chip trong `ExtractedTextPanel` và chip ở thẻ job
(ngưỡng 85/60), đặt trong `jobListUtils.ts` hoặc `extractionUtils.ts`, không viết hai lần.

## 5. Kiểm thử

Tự động (`npm run selfcheck`):

1. `jobPhase`: đủ 5 phase; `DONE` + `deckIds=[]` → `review`, `DONE` + có deck → `created`.
2. `summarizePhases` cộng đúng, tổng bằng số job.
3. `filterJobs`: khớp tên không phân biệt hoa thường/dấu cách thừa; kết hợp `status` + `type` + `q`; `sourceName = null` khớp "văn bản dán".
4. `formatRelativeTime(iso, now)`: "vừa xong" < 1 phút, "N phút trước", "N giờ trước", "hôm qua", > 7 ngày trả ngày đầy đủ; tương lai (lệch đồng hồ) → "vừa xong".
5. `ocrTone`: 0,85 → tốt; 0,849 → trung bình; 0,60 → trung bình; 0,599 → kém; `null` → không hiện chip.
6. `levelSegments`: bỏ cấp 0 mục, tổng độ rộng = 100%, thứ tự N5→N1→unknown.

Tay trên trình duyệt (ghi vào `docs/USE_CASES_CHECKLIST.md`):

1. Tài khoản chưa có job → empty state (a); có job nhưng lọc không khớp → empty state (b), "Xoá bộ lọc" hoạt động.
2. Bấm ô "Chờ duyệt" → danh sách lọc đúng, URL có `?status=review`; reload vẫn giữ.
3. Upload ảnh → thẻ mới xuất hiện ở đầu, có thanh tiến độ chạy; xong thì tự đổi sang "Chờ duyệt" không cần F5.
4. Ảnh OCR kém (conf < 60%) → chip đỏ + "n dòng cần soát"; job Gemini hết quota → chip "Chưa dịch nghĩa VI".
5. Job lỗi ở bước TEXT → "Tải lại tệp" mở modal; job lỗi ở bước ANALYZE (đã có văn bản) → "Mở", chạy lại được ngay.
6. Tạo bộ thẻ từ job → thẻ chuyển "Đã tạo thẻ", nút "Mở bộ thẻ" dẫn đúng deck.
7. Xoá một job → xác nhận, danh sách cập nhật, các ô tóm tắt giảm đúng.
8. 25+ job → chỉ 20 mục, "Xem thêm" hiện đủ.
9. Tab/phím: tìm → chip → thẻ → nút chính, focus ring thấy rõ; trình đọc màn hình đọc được số kết quả.
10. 375px: không tràn ngang, nút chính không che nội dung.

## 6. Rủi ro

- **Payload danh sách.** `GET /extractions` trả cả `textMeta` (kèm tối đa 50 `lowLines`/job). Với vài chục job là chấp nhận được;
  nếu vượt ~100 job cần phân trang hoặc bản tóm tắt ở backend (việc riêng, ngoài plan này).
- **Từ "Chờ duyệt" là từ mới** trong giao diện; nếu thấy khó hiểu đổi nhãn một chỗ trong `PHASE_LABELS`.
- **Lọc phía client.** Chỉ đúng khi danh sách đã tải đủ; hợp lý ở quy mô hiện tại, đổi khi có phân trang.
- **Trùng việc với spec tiến trình** (cả hai đụng `ExtractionsPage`). Giảm bằng thứ tự: spec tiến trình trước, plan này sau; plan này sở hữu toàn bộ phần bố cục của trang.

## 7. Câu hỏi mở (mặc định tôi đã chọn, bạn đổi nếu muốn)

1. **Phạm vi:** chỉ trang danh sách `/extractions`, không đụng trang chi tiết `/extractions/:id` (chi tiết chỉ có phần làm gọn panel ở spec tiến trình). *Mặc định: đúng như vậy.*
2. **Mức làm:** P0 + P1 trước, P2 để sau. *Mặc định: đúng như vậy.*
3. **Hạn mức bóc tách theo ngày** ("còn N lượt hôm nay"): backend có `enforceDailyLimit` nhưng không có endpoint trả hạn mức, nên cần thêm một API nhỏ. *Mặc định: không làm trong plan này.*
4. **Nhãn "Chờ duyệt"** cho job đã xong nhưng chưa tạo bộ thẻ. *Mặc định: dùng "Chờ duyệt".*

## 8. Thứ tự làm đề xuất

1. `jobListUtils.ts` + ca selfCheck (viết kiểm trước, chạy đỏ rồi xanh).
2. `ExtractionJobCard` + `LevelDistributionBar`, thay vào `ExtractionsPage` (P0).
3. `ExtractionSummaryTiles` + `ExtractionFilterBar` + tham số URL (P1).
4. Nối tracker: lớp phủ job sống, `changeSeq`, giữ dữ liệu cũ, skeleton, "Xem thêm".
5. Build + lint + selfcheck + chạy tay checklist mục 5; cập nhật `docs/*`.
6. (Tuỳ chọn) P2.
