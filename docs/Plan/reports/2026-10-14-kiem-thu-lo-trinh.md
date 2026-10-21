# Báo cáo kiểm thử: Lộ trình học tập (14/10/2026)

Nhánh `backend-feature-learnmode`, HEAD sau đợt sửa: xem `git log` ngày 14/10. Môi trường: ai-service thật (Tesseract 5 +
Gemini `gemini-3.7-flash`, dự phòng `gemini-3.5-flash-lite`, JMdict), backend profile `e2e` (Postgres nhúng cổng 8082,
**không** đụng DB Supabase), Vite dev, Chrome thật điều khiển bằng `playwright-core` (kịch bản 18 bước, chụp ảnh từng màn).

## 1. Tài liệu thử

| Tài liệu | Loại | Kết quả tách chương |
|---|---|---|
| Văn bản mẫu 3 bài (`第1課 あいさつ` / `第2課 買い物` / `第3課 週末`, dán tay) | text | 3 chương đúng, 46 thẻ |
| `D:\JLPT\Soumatome\nihongo-soumatome-n2-goi.pdf` — **scan 156 trang, 103 MB**, không lớp chữ | PDF scan | Cắt **trang 1–18** (12,7 MB): bìa, ký hiệu, はじめに, 目次, giới thiệu đề thi, この本の使い方, bìa 第1週, rồi **1日目 / 2日目 / 3日目** (mỗi ngày 2 trang) |

Kết quả cuối với PDF (lần chạy thứ 4, sau các sửa lỗi bên dưới): **đúng 3 chương = 3 ngày đầu**, phần đầu sách bị bỏ đúng:

```
Đã nhận dạng 3 chương theo cấu trúc tài liệu. Đã bỏ qua: はじめに, 目次, この本の使い方, How to use.
1. 1日目 アパートを探しています — 140 thẻ, ngày 1–3, 47/ngày
2. 8日目引っ越しは大変です叶      — 82 thẻ,  ngày 4–5, 41/ngày   (OCR đọc nhầm 2→8, đuôi 叶 là nhiễu; sửa tên trong bản nháp)
3. 3日目友人を招きました          — 79 thẻ,  ngày 6–6, 79/ngày
stats: vocab 412, grammar 25, byLevel N5 97 / N4 45 / N3 95 / N2 82 / N1 53 / chưa rõ 65; engine gemini (một phần Tesseract), meanConfidence 0.72
```

Mẫu thẻ bộ "1日目": アパート (N5), 駅, 徒歩 (N1), 家賃 (N3), 敷金 (N1), 礼金 (N1), 管理 (N3), 南向き (chưa rõ, chưa có nghĩa), 階, 築…
→ đúng là từ vựng trang 13–14 của sách. Nghĩa chỉ có **tiếng Anh** vì Gemini hết quota trong ngày thử (`enrichReason=quota`).

## 2. Kịch bản giao diện (Chrome thật, 1280 px + 375 px)

| # | Bước | Mẫu text | PDF Soumatome |
|---|---|---|---|
| 1 | Đăng ký (API) → đăng nhập (UI) | ✅ | ✅ |
| 2 | `/roadmap` trống, nút "Tạo lộ trình" | ✅ | ✅ |
| 3 | Modal: dán văn bản / chọn file + 6 ngày + tên → `/roadmap/:id` | ✅ | ✅ |
| 4 | "Đang xử lý" + stepper TEXT → ANALYZE → ENRICH | ✅ | ✅ |
| 5 | Tới "Bản nháp" (text ~2,5 phút vì Gemini; PDF ~4 phút) | ✅ | ✅ |
| 6 | Danh sách chương + số thẻ + dải ngày + thẻ/ngày | ✅ | ✅ |
| 7 | Mở danh sách thẻ (furigana, nghĩa, cấp), bỏ tick → tổng thẻ giảm 1 | ✅ (46→45) | ✅ (301→300) |
| 8 | Đổi tên chương (blur/Enter), còn sau khi tải lại | ✅* | ✅* |
| 9 | Đổi số ngày 6→4 → dải ngày tính lại ngay | ✅ | ✅ |
| 10 | "Gộp vào chương trước" | ✅ | ✅ |
| 11 | "Tạo lộ trình" → Đang học; thư mục + bộ thẻ/chương; lịch ngày; `today.tasks` | ✅ | ✅ |
| 12 | "Học ngay (k thẻ)" → StudyPage đúng k thẻ, chấm 2 thẻ, "← Về lộ trình" | ✅ (13 thẻ) | ✅ (70 thẻ) |
| 13 | Danh sách `/roadmap` "Ngày 1/4"; thư mục ở `/folders` | ✅ | ✅ |
| 14 | Job lộ trình **không** hiện ở `/extractions` | ✅ | ✅ |
| 15 | 375 px: `/roadmap`, `/roadmap/:id` không tràn ngang | ✅ | ✅ |
| 16 | Xoá lộ trình → bộ thẻ còn nguyên | ✅ (2/2) | ✅ (2/2) |
| | Lỗi console trình duyệt | không | không |

\* Bước 8 kịch bản báo FAIL vì tìm chữ bằng `getByText` trong khi tên nằm trong `<input value>`; tên đã đổi thật (bước 11 hiện
"Chương hai đã đổi tên"). Lỗi của script, không phải của ứng dụng.

Ảnh: [img/04-ban-nhap.png](img/04-ban-nhap.png) (bản nháp PDF), [img/07-dang-hoc.png](img/07-dang-hoc.png) (đang học),
[img/14-m-chi-tiet.png](img/14-m-chi-tiet.png) (375 px, sau khi học 2 thẻ: "còn 68 thẻ chưa học").

## 3. Lỗi phát hiện và đã sửa (commit cùng ngày)

| # | Hiện tượng | Nguyên nhân | Sửa |
|---|---|---|---|
| 1 | Lộ trình (và mọi job bóc tách) **FAILED** khi Gemini quá tải dù dịch nghĩa chỉ là bước làm giàu | Gemini 503/504 treo 60 s × 4 lượt + model dự phòng ≈ 5 phút > `AI_SERVICE_READ_TIMEOUT` 3 phút; `Read timed out` không được bọc thành `AiServiceException` | ai-service dừng thử lại khi vượt ngân sách 150 s; backend bọc mọi `RestClientException`, `enrich` bắt `RuntimeException` → job DONE, `enrichReason=error` (`5597cc9`) |
| 2 | PDF scan 18 trang: bước TEXT vượt 3 phút → FAILED | Mỗi trang Tesseract đọc kém đều gọi Gemini; model chính hết quota (429) nhưng vẫn tốn 2+4+8 s/trang trước khi sang dự phòng | Model chính hết quota → 2 phút sau đi thẳng model dự phòng; cả hai hỏng → tạm ngưng gọi Gemini 2 phút (`c2129fb`, `5051f0e`) |
| 3 | Văn bản bị cắt ở 50 000 ký tự, **mất trang 6–18** | Gemini Vision trang mục lục sinh **50 470 dấu `·`** (suy thoái lặp) | Gộp ký tự lặp ≥ 10 lần còn 3; bản Gemini dài > 3× Tesseract và > 3 000 ký tự → giữ Tesseract, `geminiError=implausible` (`795473d`) |
| 4 | Không nhận ra chương của Soumatome | Chỉ có mẫu `第N課 / Bài N / Lesson N`, chưa có `N日目`, `第N週` | `N日目` hạng 1, `第N週` hạng 2; tiêu đề dạng câu hỏi (`…ますか?`) hợp lệ; trang bìa tuần trước bài 1 bị bỏ (`b9d2a6c`) |
| 5 | Mục lục + lời nói đầu + cách dùng sách thành chương rác (12 "chương" trước 3 chương thật) | Chưa có cơ chế bỏ phần đầu/cuối sách; mục lục OCR ra 2 mục/dòng không số trang; hộp ví dụ trong "cách dùng sách" chứa `5日目 …` | Cụm mục lục (≥ 3 tiêu đề liên tiếp không thân / có số trang / 2 mục một dòng); tiêu đề lặp chỉ lần đầu mở chương; bỏ cả khối tới chương cuối còn chứa `はじめに / 目次 / 本書の使い方 / Lời nói đầu / Mục lục…`; tiêu đề đứng trước tiêu đề số 1 đầu tiên là đầu sách; chương dẫn đầu có tiêu đề dạng mục lục bị bỏ; `付録 / 索引 / Phụ lục` cắt khỏi chương cuối. `stats.skippedSections` → bản nháp hiện "Đã bỏ qua: …" (`473073c`, `e1bbd7f`, `fb5af28`, `795473d`) |

Test tự động sau đợt sửa: ai-service **183 passed**; `ExtractionIT` 9/9 (thêm `enrich_unexpected_failure_keeps_job_done`); frontend lint/build/selfcheck xanh.

## 4. Quan sát còn mở (chưa sửa)

1. **Dịch nghĩa tiếng Việt cho tài liệu lớn**: 412 từ = 11 batch Gemini; khi model chậm, tổng vượt 3 phút → `enrichReason=error/quota`, thẻ chỉ có nghĩa EN. Bản nháp **chưa báo** và chưa có nút "Dịch lại nghĩa" như trang bóc tách. Đề xuất: dải cảnh báo + nút dịch lại ở DRAFT; enrich trả **một phần** theo ngân sách thời gian thay vì tất cả-hoặc-không.
2. **Chất lượng OCR scan** phụ thuộc Gemini Vision: Tesseract thuần trên sách này cho độ tin cậy 0,66 và nhiều thẻ rác (được gắn `suspect`, bỏ tick sẵn). Khi Gemini hết quota, người dùng cần soát bản nháp kỹ hơn.
3. Tiêu đề OCR nhiễu (`8日目…叶`): sửa tay trong bản nháp. Có thể thêm luật "số thứ tự phải tăng dần" để tự sửa `2→8` nhưng rủi ro với sách nhiều tuần.
4. Chia ngày theo tỉ lệ số thẻ: 140 thẻ/3 ngày ≈ 47/ngày là nặng với N2; nên gợi ý số ngày mặc định từ tổng thẻ (≈ 20–30 thẻ/ngày) trong modal.
5. Giới hạn 20 trang / 15 MB: sách scan 156 trang phải cắt tay trước. Nếu muốn "cả cuốn" cần OCR nền theo lô (ngoài phạm vi hiện tại).
6. Kịch bản Playwright nằm ngoài repo (`scratchpad/pw/ui-test.mjs`); nếu muốn giữ thì đưa vào `frontend/scripts/` kèm `playwright-core` dev-dependency.

## 5. Cách chạy lại

```
# ai-service (cần venv, .env có GEMINI_API_KEY, TESSERACT_CMD)
cd ai-service && venv/Scripts/python.exe -X utf8 -m uvicorn app.main:app --port 8000
# backend cô lập (Postgres nhúng)
cd backend-core && mvn -q spring-boot:test-run -Dspring-boot.run.profiles=e2e -Dspring-boot.run.arguments=--server.port=8082
# frontend trỏ về 8082
cd frontend && BE_PORT=8082 npm run dev
# smoke API: npm run e2e (gồm smoke-learning-path.mjs)
```
