# Nhật ký thay đổi

## 17/10/2026: Admin Panel (UC-38, UC-39, UC-41, UC-42)
Spec: [Plan/specs/2026-10-17-admin-panel-design.md](Plan/specs/2026-10-17-admin-panel-design.md) · plan: [Plan/plans/2026-10-17-admin-panel.md](Plan/plans/2026-10-17-admin-panel.md).
- **Vai trò**: `USER` (người học) + staff `VIEWER` / `ADMIN` / `SUPER_ADMIN` (`RoleHierarchy`). Một tài khoản một vai trò: staff gọi API học
  tập bị 403, người học không vào `/api/admin/**`. Khoá tài khoản (`users.locked_at`) chặn ở đăng nhập, JWT filter và refresh.
  `AuthResponse` có `role`; `@PreAuthorize` từ chối → 403 (trước đây sẽ thành 500).
- **Backend** (`V14__admin_panel.sql`): `app_settings` (hạn mức bóc tách free/premium **đổi lúc chạy**, thông báo hệ thống,
  mở/đóng đăng ký; bỏ property `app.extraction.daily-limit.*`), `users.extraction_daily_limit` (hạn mức riêng), `content_reports`
  (1 báo cáo OPEN / người / bộ thẻ, 10 báo cáo / giờ), `admin_audit_logs` (mọi thao tác ghi, cùng transaction).
  API: `/api/admin/stats|health|users|decks|ratings|extractions|reports|audit-logs|settings`, `/api/announcement`,
  `POST /api/library/decks/{id}/reports`. Gắn featured mới tự bỏ cờ bộ cũ (DB chỉ cho một bộ nổi bật); xoá job đang chạy → 409.
- **Frontend**: `AdminLayout` riêng (`/admin/*`, 8 trang: tổng quan với biểu đồ CSS, người dùng + chi tiết, nội dung 3 tab + chi tiết
  bộ thẻ, báo cáo + modal xử lý, nhật ký, cấu hình), đăng nhập điều hướng theo vai trò, nút "Báo cáo" trên bộ thẻ public,
  banner thông báo trong `AppLayout`. 0 dependency mới.
- **Sao lưu**: `scripts/backup.ps1` / `backup.sh` (pg_dump custom, giữ 14 bản), quy trình khôi phục và tạo Super admin đầu tiên
  trong [SUPABASE_SETUP.md](SUPABASE_SETUP.md).
- Test: `AdminAuthorizationIT` (ma trận vai trò × endpoint), `AccountLockIT`, `AdminUserIT`, `AdminContentIT`, `ContentReportIT`
  (kể cả 2 admin xử lý cùng lúc), `AdminSettingsIT`, `AdminStatsIT`, `AdminAuditIT`, `AdminStatsServiceTest`; selfcheck `roles.ts`,
  `adminUtils.ts`. `mvn test`: 216 test xanh.
- **Việc cần làm khi deploy**: sao lưu DB, kiểm `SELECT email, role FROM users WHERE role <> 'USER'` trước V14, tạo tài khoản
  admin riêng rồi `UPDATE users SET role = 'SUPER_ADMIN' …`. Giao diện admin chưa kiểm tay trên trình duyệt trong đợt này.

## 14/10/2026: Lộ trình học tập từ tài liệu (UC-37, bản theo tài liệu)
Spec: [Plan/specs/2026-10-14-lo-trinh-hoc-tap-design.md](Plan/specs/2026-10-14-lo-trinh-hoc-tap-design.md) · tài liệu: [LEARNING_PATH.md](LEARNING_PATH.md).
- **ai-service**: `extract/chapters.py` (tách chương theo `第N課` / `Unit N` / heading DOCX), `pipeline.analyze` nhận
  `splitChapters` (phân tích từng chương, gộp trùng; `item.chapter`, `stats.chapters`, `stats.chaptersDetected`), `/text` trả `blocks[].heading`.
- **Backend**: `V13__learning_paths.sql` (`learning_paths`, `learning_path_chapters`, `extraction_jobs.purpose`,
  `extraction_items.chapter_no/chapter_id`); `LearningPathService`, `LearningPathScheduler` (chia ngày, hàm thuần),
  `ExtractionJobFinishedEvent`, `LearningPathController` (`/api/learning-paths`: tạo, danh sách, chi tiết, sửa, gộp chương,
  bỏ thẻ, kích hoạt, xoá). Job lộ trình ẩn khỏi `GET /api/extractions`; `DELETE /api/extractions/{id}` → 409 với job này.
- **Frontend**: trang `/roadmap` thay hẳn bằng danh sách lộ trình + modal tạo; `/roadmap/:id` (đang xử lý / bản nháp / đang học
  với "Hôm nay" và nợ); `StudyPage` nhận `?range=a-b&path=`; tách dùng chung `SourceFields`, `ExtractionOptionsFields`, `LevelBadge`.
- Test: `LearningPathSchedulerTest`, `LearningPathIT`, `test_chapters.py`, `roadmapUtils` (selfcheck), `smoke-learning-path.mjs`
  (thêm vào `npm run e2e`).
- **Kiểm thử thật (Chrome + ai-service thật) với văn bản mẫu và PDF scan Nihongo Soumatome N2 Goi (trang 1–18)** → báo cáo
  [Plan/reports/2026-10-14-kiem-thu-lo-trinh.md](Plan/reports/2026-10-14-kiem-thu-lo-trinh.md). Lỗi tìm thấy và sửa cùng ngày:
  - Gemini treo/quá tải làm job FAILED dù dịch nghĩa không fatal → ngân sách 150 s, bọc `RestClientException`, `enrich` bắt `RuntimeException`.
  - OCR 18 trang scan vượt 3 phút khi Gemini hết quota → model chính hết quota thì đi thẳng model dự phòng 2 phút; cả hai hỏng thì tạm ngưng Gemini 2 phút.
  - Gemini Vision sinh 50 000 dấu chấm dẫn ở trang mục lục → gộp ký tự lặp, từ chối bản Gemini phình bất thường.
  - Tách chương: thêm `N日目` / `第N週`; bỏ mục lục (kể cả OCR 2 mục/dòng), lời nói đầu, cách dùng sách, hộp ví dụ trước bài 1,
    phụ lục; `stats.skippedSections` → bản nháp hiện "Đã bỏ qua: …".

## 14/10/2026: Cập nhật tài liệu cho đợt "Bóc tách AI" (chưa đổi code)
- Cập nhật `README.md` (cài ai-service, Tesseract, `build_dicts.py`, `.env`), `EXTRACTION.md`, `CODEBASE_MAP.md`,
  `TEAM_GUIDELINES.md`, `USE_CASES_CHECKLIST.md`; thêm [Plan/README.md](Plan/README.md) làm mục lục spec / kế hoạch.
- **Trạng thái các spec trong `docs/Plan/`**: `trich-xuat-cum-tu` đã làm (xem mục 12/10 bên dưới); `dich-nghia-offline` đã thử
  rồi **hoàn tác** (xem ngay dưới); 3 spec ngày 13/10 (thanh tiến trình, giao diện trang `/extractions`, kết quả kiểu "Sửa bộ
  thẻ") **mới là thiết kế, chưa triển khai, chờ duyệt**.

## 12/10/2026: Thử dịch nghĩa offline (NLLB + CTranslate2) rồi HOÀN TÁC
- Đã dựng thử engine dịch EN → VI offline thay Gemini ở bước ENRICH, sau đó **gỡ hoàn toàn theo yêu cầu**: không còn
  `translator.py` / `tm.py` / `enrich.py`, không thêm `ctranslate2` / `sentencepiece` vào `requirements.txt`, không có
  `--models` trong `build_dicts.py`. Bước ENRICH vẫn là Gemini (kèm thử lại + `GEMINI_FALLBACK_MODEL`, mục bên dưới).
- Còn lại duy nhất: spec + kế hoạch trong `docs/Plan/` (đánh dấu "đã hoàn tác") và hai dòng `.gitignore`
  (`app/extract/data/models/`, `translations.sqlite`) để file model / bộ nhớ dịch còn trên máy dev không bị commit nhầm.
  Xoá thư mục `ai-service/app/extract/data/models/` (≈ 600 MB) nếu cần giải phóng ổ đĩa.

## 12/10/2026: Bảng / danh sách từ vựng → trích theo **cụm**, dùng nghĩa in sẵn; dự phòng khi Gemini hết quota
Spec: [Plan/specs/2026-10-12-trich-xuat-cum-tu-design.md](Plan/specs/2026-10-12-trich-xuat-cum-tu-design.md).
- **ai-service** `extract/entries.py` (mới): `parse_line` tách mỗi dòng thành cụm + nghĩa (TAB / `｜` / ` - ` / `：` /
  ranh giới chữ viết; cột cụm = cột đầu tiên có tiếng Nhật nên `nghĩa<TAB>cụm` vẫn chạy; cột toàn kana → cách đọc
  cho bảng 3 cột; khai triển `A[B/C`; bỏ `↔ (N)`, bullet, chú thích `＊ ※`; gloss Trung/Hàn bỏ — chữ Hán không có cách
  đọc tiếng Nhật trong Unihan); `detect_layout` nhận dạng `list` / `prose` (câu ví dụ song ngữ `…です。 I am…` vẫn là
  `prose`; `auto` mà `list` không ra mục nào thì rơi về `prose`).
- Sau review: "Dịch lại nghĩa" thành công thì xoá `stats.enrichReason` cũ (trước đây banner hết quota hiện mãi).
- Sửa sau khi chạy thật (Gemini `gemini-3.7/3.8-flash` quá tải, job rơi về bản Tesseract rác): (1) gloss chỉ được nhận khi có
  ít nhất một từ tiếng Anh thật (wordfreq zipf ≥ 3) — bỏ "el", "ME", "OO pm fd 24" từ dòng Tesseract; (2) mã 504
  `DEADLINE_EXCEEDED` cũng thử lại rồi sang `GEMINI_FALLBACK_MODEL` như 503; đo 12/10: `gemini-3.5-flash-lite` trả đúng
  định dạng trong 2 s nên dùng làm model dự phòng. Thứ tự OCR không đổi: Tesseract trước, Gemini chỉ khi conf < 0,85.
- `pipeline.py`: tuỳ chọn `extractMode` (`auto|list|prose`), `stats.layout`; nhánh `list` không tách từ bên trong cụm,
  không ngữ pháp, `pos = 句`, cấp = cấp khó nhất của từ bên trong (`jlpt.phrase_level`, `levelSources[0] = phrase:<từ>`),
  nghĩa EN/VI in sẵn → `meaningEn` / `meaningVi` (VI có dấu mới nhận). Ảnh bảng "ngân hàng" thật: 20 cụm đúng như bảng
  (trước: 36 từ rời + 2 ngữ pháp, chú thích bị tách thành 4 từ).
- `gemini.py`: prompt Vision xuất bảng từ vựng dạng `cụm<TAB>nghĩa`; prompt dịch giữ sát nghĩa gốc; thử lại 429/503
  (2/4/8 s) rồi `GEMINI_FALLBACK_MODEL` (env mới, tuỳ chọn); hết lượt vẫn giữ `reason = quota`.
- **Backend**: `ExtractionOptions.extractMode`; `POST /api/extractions/{id}/enrich` chạy lại riêng bước dịch cho item
  chưa có nghĩa VI (không phân tích lại, không tính hạn mức ngày, cách nhau ≥ 5 phút → `stats.enrichedAt`).
- **Frontend**: ô "Bố cục tài liệu" trong modal tải lên; huy hiệu "Nhận dạng: danh sách từ vựng" và nút "Dịch lại nghĩa"
  trên trang kết quả khi `enrichReason` là `quota` / `error`.
- Test: `test_entries.py` (mới, 11), `test_pipeline.py` +5, `test_classifier.py` +2, `test_gemini.py` +5, `test_router.py` +1,
  `test_vision_fixture.py` (chạy thật khi `RUN_GEMINI_TESTS=1`, fixture `tests/fixtures/vocab_table.png`), `ExtractionIT` +2.

## 11/10/2026: Thẻ sạch hơn khi nguồn là OCR (ảnh bảng song ngữ), PDF có chữ không bị OCR nhầm
- **PDF** `readers/pdf_reader.py`: chỉ OCR khi text layer gần như rỗng (< 30 ký tự/trang). Trước đây PDF tiếng Việt/Anh có
  chữ thật (tỉ lệ chữ Nhật < 20%) bị coi là scan và OCR bằng `jpn` → văn bản rác.
- **Ví dụ trên thẻ** `pipeline.py`: với dòng OCR, ví dụ = cụm tiếng Nhật liền mạch quanh từ (cắt ở chữ Latin / ký hiệu /
  chữ số ASCII); bỏ nếu cụm ≤ từ + 1 ký tự hoặc dòng conf < 0.40; lần đầu không có ví dụ thì lấy ở lần xuất hiện sau. Ngữ
  pháp lấy cụm dài nhất của dòng. Văn bản thường / DOCX / PDF có chữ giữ nguyên câu như cũ.
- **Mục đáng ngờ** (`suspect`, chỉ OCR): không có nghĩa trong từ điển, từ 1 ký tự trên dòng conf < 0.75, hoặc không rõ cấp
  JLPT trên dòng conf < 0.60 → backend lưu `selected=false` (vẫn hiện, tick lại được). Ảnh bảng song ngữ thật: 84 từ,
  34 chọn sẵn (trước: 91 từ chọn hết, gồm 具 / 戸 / 肌 / 逝得…).
- **OCR** `image_reader.py`: chèn khoảng trắng giữa hai từ Latin liền nhau ("met money from your account" thay vì
  "metmoneyfrom…"); CER bộ tổng hợp không đổi (0.044). Thử lại `jpn+eng` trên ảnh thật: chữ Anh tốt hơn nhưng mất chữ Nhật
  (を, 人) → vẫn loại.
- **Báo lỗi Gemini**: `textMeta.geminiError` (chỉ có khi OCR kém mà Gemini không chép lại được) và `stats.enrichReason`
  hiện thành cảnh báo trong `ExtractedTextPanel` (vd. "AI (Gemini) đã hết hạn mức…").
- Test: `test_pipeline.py` +6, `test_image_reader.py` +2, `test_pdf_reader.py` +1, `ExtractionIT` kiểm tra `selected=false`.

## 10/10/2026: Nâng độ chính xác OCR ảnh / PDF scan (UC-05, 07, 17)
- **ai-service** `readers/image_reader.py` (chỉ Pillow + numpy, không thêm thư viện): flatten PNG trong suốt lên nền trắng;
  khử bóng đổ (`_flatten_background`); deskew ±5° (projection profile, có biên 1.2× tránh xoay nhầm chữ dọc); hỏi OSD xoay
  90/180/270 khi cả hai lượt đọc đều kém; điểm chọn hướng phạt dòng < 8 ký tự; 2 lượt `jpn`/`jpn_vert` và 3 trang PDF chạy
  song song (20 trang: 44 s → 22 s); lọc furigana bỏ dấu câu trước khi xét kana-only; NFKC cho text OCR; Gemini nhận ảnh
  đã tiền xử lý, kết quả Gemini `meanConfidence=null` và `lowConfidence=true` nếu độ dài lệch > 3× bản Tesseract.
- **Đo**: `ai-service/scripts/ocr_eval.py` (ảnh tổng hợp 12 nhóm, CER / tỉ lệ Gemini / thời gian / vocab F1; `--gemini`,
  `--real DIR`, `--set`). Chỉ Tesseract: CER 0.355 → 0.095; có Gemini ≈ 0.05. Bảng từng bước và các thử nghiệm bị loại
  (`jpn+eng`, `--oem 1`, Otsu, psm 3/4/11, dừng sớm) ở [EXTRACTION.md](EXTRACTION.md) §6. Chưa xử lý được trang ngang 2 cột
  (Tesseract gộp 2 cột thành một dòng; Gemini đọc đúng).
- **Tách 2 cột**: rãnh trắng dọc ≥ 1.5 dòng ở giữa trang → OCR từng nửa, nối trái → phải (two_col CER 0.58 → 0.03;
  Tesseract tự nó gộp 2 cột thành 1 dòng ở mọi psm).
- **Soát dòng nghi sai**: ai-service trả `blocks[].lines[] = {text, conf}`; backend (`ExtractionJobResponse`) rút
  `textMeta.lowLines` (conf < 0.75, ≤ 50 dòng) thay vì gửi cả `blocks`; FE `ExtractedTextPanel` liệt kê, bấm vào là bôi
  đen đúng dòng trong ô văn bản để sửa rồi "Phân tích lại".
- **API đổi**: `meanConfidence` có thể `null` khi `engine=gemini` (FE đã xử lý `!= null`); `textMeta.lowLines` (tuỳ chọn).
- Test: `test_image_reader.py` thêm 12 test (alpha, NFKC, nền, deskew, OSD, furigana, 2 cột, Gemini plausibility, lines);
  `ExtractionIT` kiểm tra `lowLines`.

## 07/10/2026: Bóc tách tài liệu tiếng Nhật → từ vựng / ngữ pháp / cấp JLPT → bộ thẻ (UC-05 → 12, 17, 18)
- **Backend** (`V12__extraction_jobs`): bảng `extraction_jobs` / `extraction_items`; `flashcards` thêm `level`, `kind`,
  `reading_segments`, `han_viet`. API `/api/extractions` (tạo job multipart, poll, sửa văn bản chạy lại, duyệt / PATCH item,
  tạo bộ thẻ qua `DeckService.create`, xoá). Worker `@Async` 3 giai đoạn TEXT → ANALYZE → ENRICH gọi ai-service bằng
  `RestClient` (`AiServiceClient`); file gốc không lưu. Giới hạn 5 / 50 lượt mỗi 24 giờ (`app.extraction.daily-limit.*`).
- **ai-service**: gói `app/extract/` thật (SudachiPy, furigana từng chữ, Hán-Việt Unihan, JMdict, 5 danh sách JLPT + wordfreq,
  catalog ngữ pháp YAML, DOCX/PDF/TXT reader, Tesseract + Gemini Vision fallback, Gemini dịch nghĩa VN) với
  `POST /api/extract/text|analyze|enrich`, `GET /api/extract/health`; `scripts/build_dicts.py` tải dữ liệu từ điển.
- **Frontend**: modal "Tải tài liệu & bóc tách AI" mở khoá (file hoặc dán văn bản + tuỳ chọn), trang `/extractions/:id`
  (tiến trình, sửa văn bản OCR, duyệt từ vựng / ngữ pháp theo cấp, tạo bộ thẻ), `/extractions` lịch sử; `Ruby` nhận
  `segments` để hiện furigana theo từng chữ.
- **API đổi**: `CardResponse` / `DeckRequest.Card` có thêm `level`, `kind`, `readingSegments`, `hanViet` (tuỳ chọn; không gửi = giữ nguyên).
- Test: `ExtractionIT` (4 test, ai-service giả lập); pytest trong `ai-service/tests/`. Tài liệu: [EXTRACTION.md](EXTRACTION.md).

## 03/10/2026: Đánh giá bộ thẻ có bình luận
- **Backend** (`V10__deck_rating_comments`): bảng `deck_ratings` có sẵn từ V3 nay thêm `comment` (<= 500 ký tự, CHECK) và
  `created_at`; vẫn một đánh giá mỗi người mỗi bộ thẻ (UNIQUE `deck_id,user_id`). Thêm `GET /api/library/decks/{id}/ratings`
  (tổng hợp + `mine` + danh sách phân trang, tên hiển thị = `full_name` hoặc phần trước `@` của email) và
  `DELETE /api/library/decks/{id}/rating`.
- **API đổi**: `PUT .../rating` nhận thêm `comment` (tuỳ chọn); gửi lại mà không có `comment` sẽ xoá bình luận cũ.
- **Frontend**: `DeckRatings` + `DeckRatingForm` + `RatingStars` dùng ở trang chi tiết bộ thẻ (bộ public) và hộp xem trước
  Thư viện; `lib/ratingUtils.ts` có kiểm tra trong `selfCheck`.
- Test: `DeckRatingIT` (4 test); `MigrationUpgradePathTest` chạy qua V10.

## 30/09/2026: Refresh token, tự đăng xuất sau 3 ngày không hoạt động (UC-02)
- **Backend** (`V7__refresh_tokens`): `POST /api/auth/login` trả thêm `refreshToken`; `POST /api/auth/refresh` đổi lấy
  access token mới và lùi hạn phiên thêm 3 ngày; `POST /api/auth/logout` thu hồi phiên. Access token rút từ 3 ngày
  xuống 15 phút (`jwt.expiration`); hạn refresh token là `jwt.refresh-expiration` (mặc định `P3D`).
  Đổi / đặt lại mật khẩu thu hồi refresh token ở mọi thiết bị. DB chỉ lưu SHA-256 của token.
- **Frontend**: `apiClient` gặp 401 thì tự gọi làm mới một lần rồi gửi lại request; chỉ đăng xuất khi refresh token
  bị từ chối (quá 3 ngày / đã thu hồi), lỗi mạng thì giữ phiên. Nút đăng xuất gọi `/auth/logout`.
- **API đổi**: `AuthResponse` có thêm `refreshToken`; `login()` của `AuthContext` nhận thêm tham số `refreshToken`.
- Test: `RefreshTokenIT` (6 test); `smoke-auth.mjs` kiểm tra refresh / logout.

## 30/09/2026: Sửa lỗi tồn đọng và đưa code về đúng guideline
- **Lỗi**: thư mục được chia sẻ nay hiện đúng số bộ thẻ / số thẻ của thư mục con (`GET /api/decks?folderId=` của thư mục
  được chia sẻ trả bộ thẻ của cả cây con, kèm `folderId`); trang chi tiết bộ thẻ không còn nháy "Đang tải" sau khi sửa thẻ
  (`useAsync` có tham số `reload`).
- **Cấu trúc backend**: `AuthController` chỉ còn nhận / trả, giới hạn số lần thử và đổi lỗi chuyển vào `AuthService` /
  `PasswordResetService`; API trả DTO (`UserResponse`, `ReviewResponse`, `ShareMemberResponse`, `FolderMemberResponse`,
  `QuizResultResponse`, `QuizOutcomeResponse`) thay vì entity / record của repository; `StudyController` tách thành
  `DeckController` (bộ thẻ, thẻ, chia sẻ) và `StudyController` (ôn tập, quiz); `DeckService` tách `ReviewService`,
  `QuizAttemptService`. URL và JSON giữ nguyên, trừ ngoại lệ ở mục "API đã đổi".
- **API đã đổi**: bộ thẻ trong danh sách của thư mục được chia sẻ có `folderId` (trước đây luôn `null` với người xem);
  các endpoint khác vẫn `null`.
- **Frontend**: gom `getInitials` (`lib/textUtils.ts`) và `flattenFolders` (`folderTree.ts`) về một bản.
- **CI**: thêm job kiểm cú pháp `ai-service` (`python -m compileall`). **Guideline**: thêm quy trình PR / review, mẫu
  tên nhánh, quy tắc controller / service / DTO.

# Ổn định nền tảng theo kế hoạch MoSCoW
*Ngày: 29/09/2026*

## Must have
- **CI** (`.github/workflows/ci.yml`): `mvn test` + lint / build / self-check frontend cho mọi push & PR.
- **Chống mất thẻ trong trình soạn**: không mở form khi tải bộ thẻ lỗi (trước đây lưu form trống sẽ xoá toàn bộ thẻ
  và lịch sử ôn); chế độ "Thêm thẻ" chỉ ghi thông tin bộ thẻ khi có thay đổi.
- **Validate đầu vào auth / review**: DTO có `@Valid` thay cho body `Map`; giới hạn họ tên 100, mật khẩu 6–72 ký tự;
  hết lỗi báo nhầm "Email đã được sử dụng" khi họ tên quá dài; lỗi auth trả cùng định dạng JSON.
- **"Bộ thẻ của tôi"** chỉ gồm bộ thẻ sở hữu (kể cả bản đã lưu) và bộ được chia sẻ; bộ thẻ cộng đồng chỉ ở Thư viện.
- **Quiz đáng tin**: lượt làm do server phát (`V5__quiz_attempts`), chấm trên mọi câu đã phát, nộp 1 lần, có hạn giờ;
  bỏ dở quá hạn = 0 điểm. Endpoint xem trước `/quizzes/{id}/preview` không mở lượt làm.
- Tài liệu: `SUPABASE_SETUP.md` bỏ SQL tạo bảng tay (xung đột Flyway), README sửa lệnh chạy & biến môi trường.

## Should have
- **Chia sẻ thư mục** (`V4__folder_shares`): mời theo email (xem & học cả cây con), bật/tắt "ai có link đều xem được",
  mục "Được chia sẻ với tôi".
- **Quên mật khẩu** (`V6__password_reset_tokens`): link dùng 1 lần, 30 phút; gửi qua SMTP khi có cấu hình.
- Chặn tạo tài khoản hàng loạt theo IP; lấy IP thật sau reverse proxy (`server.forward-headers-strategy=native`).
- Số liệu dashboard tự tải lại sau mọi thao tác ghi; bỏ số liệu bịa của người dùng ở Phòng thi & Lộ trình;
  lịch sử quiz trả kèm tên bộ thẻ.
- Sửa lỗi giao diện: trình độ thư mục không còn bị ép N5, số liệu thư mục con, dấu phân cách `\n` khi nhập thẻ,
  các class Tailwind chưa định nghĩa, thông báo lỗi khi ôn tập / thêm nhiều bộ thẻ.
- Dọn: bỏ dependency Redis / WebFlux chưa dùng, component `DeckModal` không dùng, gom hằng số cấp JLPT,
  thông báo lỗi thư mục sang tiếng Việt.

---

# Nhật ký thay đổi: Xây dựng API Quản lý Thư mục (Folder)
*Ngày hoàn thành: 22/09/2026*

## Tóm tắt
Đã hoàn tất việc xây dựng toàn bộ hệ thống API Quản lý Thư mục (Bộ thẻ Flashcard) ở phía Backend theo mô hình 3 lớp chuẩn của Spring Boot. API này phục vụ trực tiếp cho màn hình Dashboard bên phía Frontend.

## Chi tiết các thành phần đã thêm / chỉnh sửa

### 1. Tầng Model (Thực thể CSDL)
- **`Folder.java`**: Tạo bảng `folders` lưu trữ thông tin thư mục.
  - Các trường cơ bản: `id`, `title`, `description`, `level`, `accessType`.
  - Các trường đặc biệt (Hybrid Approach): 
    - `isPinned` (boolean): Phục vụ tính năng Ghim thư mục (truy vấn tốc độ cao).
    - `metadata` (TEXT): Chứa chuỗi JSON để lưu trữ các thông tin cấu hình giao diện tùy chỉnh từ Frontend (màu sắc, icon, ảnh bìa...) mà không làm phình to cấu trúc CSDL.
  - Quan hệ: Khóa ngoại `user_id` liên kết với bảng `User`.

### 2. Tầng Data Transfer Object (DTO)
- **`FolderRequest.java`**: Quy định cấu trúc dữ liệu Frontend gửi lên khi Tạo/Sửa thư mục (Có validation kiểm tra `title` không được để trống).
- **`FolderResponse.java`**: Quy định cấu trúc dữ liệu trả về cho Frontend. 
  - *Lưu ý kiến trúc:* Đã loại bỏ toàn bộ các trường hardcode UI (như `iconBg`, `tagColor`) ra khỏi Response để tuân thủ triệt để nguyên tắc RESTful API chuẩn. Trách nhiệm render màu sắc và icon mặc định được giao hoàn toàn cho Frontend xử lý.

### 3. Tầng Repository (Truy xuất CSDL)
- **`FolderRepository.java`**: Thêm hàm `findByUser(User user)` để truy xuất toàn bộ thư mục thuộc quyền sở hữu của một cá nhân cụ thể.

### 4. Tầng Service (Xử lý nghiệp vụ)
- **`FolderService.java`**: Xử lý logic lõi.
  - Khởi tạo thư mục mới.
  - Kiểm tra bảo mật chặt chẽ: Trong các hàm Cập nhật (Update) và Xóa (Delete), hệ thống bắt buộc kiểm tra xem người đang thực hiện hành động có phải là **chủ sở hữu** của thư mục đó không. Báo lỗi nếu không có quyền.

### 5. Tầng Controller (Giao tiếp API)
- **`FolderController.java`**: Cung cấp 4 Endpoints chính (Yêu cầu JWT Token ở Header):
  - `GET /api/folders`: Lấy danh sách thư mục của User hiện tại.
  - `POST /api/folders`: Tạo thư mục mới.
  - `PUT /api/folders/{id}`: Cập nhật thông tin thư mục.
  - `DELETE /api/folders/{id}`: Xóa thư mục.

### 6. Cấu hình hệ thống
- Thêm file **`application-local.properties`** (đã được cấu hình ẩn trong `.gitignore`) để truyền biến môi trường mật khẩu Database, giúp Server kết nối thành công với Supabase.

---
**Ghi chú cho Frontend Team:** 
- Khi gọi API `/api/folders`, Frontend có thể tận dụng trường `metadata` để nhét bất kỳ JSON cấu hình UI nào vào (ví dụ: `{"color": "red", "icon": "star"}`).
- Cần tự map các giá trị mặc định cho UI nếu `metadata` rỗng.
