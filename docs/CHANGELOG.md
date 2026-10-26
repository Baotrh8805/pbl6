# Nhật ký thay đổi

## 26/10/2026: Từ điển — tra dạng chia, câu ví dụ tiếng Việt, tab Câu, vẽ chữ, mở rộng nghĩa
Năm cải tiến sau khi rà từ điển (Phần A). Không có migration.

- **Tra dạng đã chia**: tìm 食べました / 読んで / 高かった / 勉強しています ra 食べる / 読む / 高い / 勉強. ai-service: khi q không trùng
  dạng viết nào, lấy dạng gốc (lemma Sudachi) của các từ nội dung theo thứ tự trong câu (bỏ động từ phụ する / いる đứng sau), mục của
  dạng gốc đứng đầu rồi tới kết quả tiền tố; response thêm `deinflected {query, lemmas}`, backend chuyển tiếp, giao diện ghi chú
  "đang hiện trước mục của dạng gốc". Sudachi lỗi → tìm như cũ.
- **Câu ví dụ tiếng Việt**: `ai-service/app/extract/data/example_vi.csv` — 26 316 câu Tatoeba dịch sẵn (Claude, chưa rà tay). Mục từ
  trả `viSeed`; backend dùng khi chưa có bản admin / Gemini (`dict_example_vi`) và câu chưa bị admin sửa, nên không gọi AI cho các câu
  này nữa. Nghĩa Việt đã lưu thắng bản dịch sẵn.
- **Mở rộng nghĩa Việt**: `jmdict_example_words_meaning_vi.csv` — 14 068 mục có câu ví dụ mà chưa có nghĩa Việt (nạp lúc khởi động như
  hai file cũ, `MACHINE / SEED`). Tổng nghĩa Việt dịch sẵn ~37 000 mục. 27 / 43 dòng JLPT chưa khớp được gán tay về mục JMdict.
- **Tab Câu** (`/dictionary?tab=sentences&s=…`): tìm câu ví dụ theo cụm — chữ Nhật khớp đúng chuỗi, tiếng Anh khớp từ đầu một từ, tiếng
  Việt có / không dấu (theo bản dịch sẵn); câu ngắn trước, tô cụm khớp, nghe câu, bấm từ trong câu để mở mục. ai-service
  `GET /api/dict/sentences`, backend `GET /api/dictionary/sentences` (áp ghi đè câu, ẩn câu admin đã ẩn, bản dịch đã lưu thắng).
- **Vẽ chữ Hán để tra**: ô vẽ ở tab Từ vựng (chữ chọn được nối vào ô tìm) và tab Hán tự (mở chữ đó). ai-service `handwriting.py` +
  `POST /api/dict/handwriting`: so nét đã chuẩn hoá với nét mẫu KanjiVG (~2 000 chữ), lọc theo số nét ±2, ghép nét tối ưu (Hungarian),
  cộng phần đúng thứ tự khi đủ nét. Đo trên 120 chữ ngẫu nhiên: đúng hạng 1 khi vẽ có nhiễu 120/120, đổi thứ tự nét 120/120, thiếu một
  nét 111/120 (118/120 trong 5 gợi ý); ~200 ms / lần. Backend `POST /api/dictionary/handwriting` (120 lượt / phút / người).
- **Test**: ai-service `test_dictionary.py` +9 (dạng chia, bản dịch sẵn, tab Câu, router), `test_handwriting.py` 8 (bộ nét giả + một
  test dữ liệu thật tự bỏ qua khi thiếu tệp); backend `DictionaryIT` +4 (chuyển tiếp dạng gốc, bản dịch sẵn / admin thắng, tab Câu,
  vẽ chữ); selfcheck `dictionary.ts` (ghi chú dạng gốc, tô cụm). Kiểm trên trình duyệt (localhost): tra 食べました, tab Câu Nhật / Anh /
  Việt không dấu, bấm từ trong câu, vẽ 十 bằng sự kiện con trỏ ra 十 đầu danh sách, 375 px không tràn.
- **Chưa làm / giới hạn**: bản dịch câu và nghĩa mới chưa có người rà; vẽ chữ chỉ nhận ~2 000 chữ có trong KanjiVG đã lọc theo JLPT;
  tô cụm không tô khi gõ không dấu (server vẫn tìm ra).

## 26/10/2026: Nhắc học qua email theo lộ trình (B4)
Kế hoạch [Plan/plans/2026-10-26-tu-dien-va-viec-con-lai.md](Plan/plans/2026-10-26-tu-dien-va-viec-con-lai.md) B4. Một migration mới:
**V34** (`learning_paths.remind_email boolean NOT NULL DEFAULT false`, chỉ thêm cột).

- **backend**: `PATCH /api/learning-paths/{id}` nhận `remindEmail`, response có `remindEmail`. `LearningPathReminderJob` sau khi gửi
  nhắc trong app gửi thêm **một email / người / lượt**, gộp các lộ trình vừa được nhắc mà bật `remind_email` (đọc lại cột lúc gửi):
  tiêu đề nêu tổng số thẻ hôm nay, thân liệt kê từng lộ trình (ngày học, thẻ mới / đến hạn / nợ) kèm link `/roadmap/{id}` và chỉ
  chỗ tắt. Tối đa một email / lộ trình / ngày nhờ `last_reminded_on` sẵn có. Email soạn trong giao dịch của người đó nhưng **gửi
  sau commit**; bỏ qua tài khoản bị khoá / đã xoá / chưa xác thực email. Thiếu SMTP: một dòng log mỗi lượt, không gửi.
  `MailService` thêm `isConfigured()` và `sendNotice(...)` (thư không chứa token, lỗi gửi chỉ ghi log).
- **frontend**: Cài đặt lộ trình thêm công tắc **Nhắc thêm qua email** dưới "Nhắc học mỗi sáng" (mờ đi khi tắt nhắc trong app).
- **Test**: `LearningPathReminderJobIT` +1 (JavaMailSender giả: bật theo lộ trình, gộp 2 lộ trình một thư, chạy bù không gửi lại,
  tài khoản khoá không nhận, tắt một lộ trình thì thư hôm sau chỉ còn lộ trình kia), `LearningPathReminderJobTest` +4 (gửi sau
  commit, thiếu SMTP / khoá / chưa xác thực không gửi, soạn nội dung), `MailServiceTest` +2; selfcheck `settingsPatch` +3.
  Chưa gửi thử qua SMTP thật (máy dev không có cấu hình SMTP).

## 26/10/2026: Hiệu quả lộ trình (B3)
Kế hoạch [Plan/plans/2026-10-26-tu-dien-va-viec-con-lai.md](Plan/plans/2026-10-26-tu-dien-va-viec-con-lai.md) B3. **Không có migration**:
`review_logs.path_id` / `reaction_ms` đã có từ V20 và client đã gửi từ lộ trình 2.0.

- **backend**: `GET /api/insights/path-effect/{pathId}` (`PathEffectService`, JDBC gộp ở DB): theo chương và tổng — số thẻ đã học,
  lượt ôn, tỷ lệ "Lại", trung vị phản xạ, tỷ lệ nhớ sau 7 ngày; so trước / sau lộ trình bổ khuyết theo mốc thời gian tạo bổ khuyết
  đầu tiên. Lượt học nhanh không tính. `GET /api/admin/stats` thêm `pathEffect {inPath, outside}` (lượt ôn trong / ngoài lộ trình
  trong cửa sổ `days`). Chi tiết định nghĩa ở [LEARNING_PATH.md](LEARNING_PATH.md) bảng API.
- **frontend**: khung **Hiệu quả học** ở trang lộ trình đang học (4 số tổng, bảng theo chương, hai thanh "Lại" trước / sau bổ khuyết +
  nhận xét giảm / tăng / không đổi / chưa đủ dữ liệu, cần ≥ 5 lượt mỗi bên); tải lại ngầm sau mỗi lượt chấm. Thẻ "Lộ trình học tập"
  ở Tổng quan admin thêm dòng ôn trong / ngoài lộ trình.
- **Test**: backend `PathEffectIT` 2 (dữ liệu chèn có mốc thời gian: chương, tổng, nhớ 7 ngày, chia trước / sau, loại cram, 404 / 403,
  khối admin); frontend selfcheck `learningPath.ts` (đọc response hỏng, định dạng, xu hướng). Kiểm trên trình duyệt (localhost, lộ
  trình thật dựng qua ai-service + bổ khuyết): số khớp API, 375 px không tràn, hai thanh cùng thước đo. Thẻ admin chưa xem trên
  trình duyệt (môi trường thử không có tài khoản admin), chỉ kiểm qua test.

## 26/10/2026: Link chia sẻ bộ thẻ (D9) + xuất bộ thẻ (UC-29)
Kế hoạch [Plan/plans/2026-10-26-tu-dien-va-viec-con-lai.md](Plan/plans/2026-10-26-tu-dien-va-viec-con-lai.md) B1, B2. Một migration
mới: **V33** (`decks.share_token varchar(43)` + chỉ mục unique một phần, chỉ thêm cột).

- **Link riêng (B1, D9)**: chủ bộ thẻ tạo / đổi / tắt link `/d/<token>` (32 byte ngẫu nhiên base64url) ở hộp Chia sẻ; người đã đăng
  nhập mở link → `POST /api/decks/share-link/{token}/accept` thêm dòng `deck_shares` quyền Chỉ xem (xem, học, sao chép dù bộ riêng tư)
  rồi chuyển tới `/decks/{id}`. Người đã được mời giữ quyền cũ (EDITOR không bị hạ), chủ mở link của mình không đổi gì. Đổi link =
  link cũ hết hiệu lực; tắt link không gỡ người đã vào (gỡ ở danh sách). Chưa đăng nhập → trang đăng nhập rồi quay lại đúng link.
  Token sai / đã thu hồi / bộ đã xoá → 404. API: `GET/POST/DELETE /api/decks/{id}/share-link` (chỉ chủ), `DeckShareLinkService`.
- **Xuất bộ thẻ (B2, UC-29)**: `GET /api/decks/{id}/export?format=csv|anki` (ai xem được bộ thẻ đều xuất được, `DeckExportService`).
  CSV UTF-8 có BOM `term,reading,meaning,level,han_viet,pos` (trích dẫn RFC 4180, ô bắt đầu bằng `= + - @` thêm `'` để Excel không chạy
  công thức); Anki = TSV có tiêu đề `#separator:tab` / `#html:true` (mặt trước thuật ngữ, mặt sau cách đọc + nghĩa + Hán-Việt, escape
  HTML, xuống dòng = `<br>`); tên tệp `<tên-bộ-không-dấu>-<ngày VN>.csv` / `-anki.txt`. PDF: trang in `/decks/:id/print` (bảng thẻ,
  CSS in, nút "In / Lưu PDF"). Frontend: menu **Xuất** ở trang bộ thẻ (`DeckExportMenu`, tự neo trái / phải theo chỗ trống).
- **Test**: backend `DeckShareLinkIT` 3 (tạo / đổi / tắt / nhận / token sai / bộ đã xoá / giữ EDITOR / staff 403 / xuất CSV, Anki,
  400, 404) + `DeckExportServiceTest` 3; frontend `scripts/selfcheck/deckShare.ts` (URL link, tên tệp từ `Content-Disposition`).
  Kiểm trên trình duyệt (localhost, tài khoản thử): tạo link → người khác đăng nhập qua link → vào bộ thẻ với quyền xem; link sai báo
  lỗi; tải CSV / Anki đúng tên và nội dung; trang in; 375 px không tràn.

## 26/10/2026: Từ điển Nhật–Việt cộng đồng (UC-43..45)
Spec / kế hoạch: [Plan/specs/2026-10-26-tu-dien-design.md](Plan/specs/2026-10-26-tu-dien-design.md),
[Plan/plans/2026-10-26-tu-dien-va-viec-con-lai.md](Plan/plans/2026-10-26-tu-dien-va-viec-con-lai.md) (phần A). Quyết định D14–D29.
Một migration mới: **V32** (chỉ thêm bảng `dict_*` + 2 khoá cấu hình; mở rộng CHECK khoá `app_settings` như V21).

- **Bảo mật / git**: `application-local.properties` (mật khẩu Supabase, JWT secret) đã bị commit từ 21/10 → gỡ khỏi git, trả lại dòng
  `.gitignore` (`8701745`). **Phải đổi mật khẩu DB và JWT secret** vì lịch sử git vẫn còn bản cũ. Đã gộp `origin/a` (`ac7dc9c`, 25/10).
- **Dữ liệu**: `jmdict.sqlite` dựng lại từ bản JMdict đầy đủ có ví dụ Tatoeba (`jmdict-examples-eng`, 218 930 mục, 32 362 câu, FTS5;
  ~197 MB, gitignore; `--dict-scope compact` cho file nhỏ hơn). Bảng `entries` cũ giữ nguyên nên bóc tách không đổi kết quả.
  Nghĩa tiếng Việt dịch sẵn (Claude viết): 7 972 từ JLPT + 21 806 nhóm từ phổ biến JMdict (29 655 dòng), đã map `entry_key`
  (99 % khớp mục JMdict) bằng `scripts/map_dict_vi_keys.py`; backend nạp vào `dict_meanings` lúc khởi động (`DictionarySeedLoader`,
  status MACHINE, không bao giờ đè bản admin).
- **ai-service**: `/api/dict/{search, entries, kanji, key, tokenize, translate, overrides}` (`dictionary.py`, `dict_router.py`); tìm
  Nhật (kana ↔ katakana, chính xác rồi tiền tố) và Anh (FTS); lớp ghi đè của admin `overrides.py` (RAM + `data/dict_overrides.json`)
  áp vào Hán-Việt, nghĩa chữ, gloss JMdict, cách đọc khi bóc tách; item `/extract/analyze` thêm `dictKey`; health thêm 4 cờ `dict*`;
  `gemini.translate_dictionary`.
- **backend**: `/api/dictionary/*` (USER) tra cứu gộp 4 lớp (gốc → ghi đè → nghĩa Việt → cộng đồng), dịch lúc tra có trần theo giờ
  (`dictionary_ai_hourly_limit`, mặc định 30; người học không thấy nhãn "máy dịch", D23), bình luận + Hữu ích, báo lỗi mục / bình
  luận, sổ tay, lịch sử tra (300 / người); `/api/admin/dictionary/*` (ADMIN, SUPER_ADMIN) hàng chờ (bị báo cáo → chỉ có nghĩa Anh →
  nghĩa máy chưa kiểm), sửa nghĩa Việt / xác nhận / dịch lại, ghi đè dữ liệu gốc, bản dịch ví dụ, áp đề xuất một nút, hoàn tác, ẩn /
  xoá bình luận, lịch sử, đồng bộ ai-service (`DictionaryOverridePublisher`: sau commit + 10 phút / lần); audit target `DICTIONARY`;
  thông báo `DICT_REPORT_RESOLVED`, `DICT_COMMENT_HIDDEN`; thống kê admin thêm `openDictReports`, `dict`. Bóc tách lấy nghĩa Việt có
  sẵn trong từ điển trước khi gọi Gemini, nghĩa Gemini mới được lưu lại (`stats.fromDictionary`).
- **frontend**: trang `/dictionary` (tab Từ vựng / Hán tự / Hán-Việt / Sổ tay; `/kanji`, `/han-viet` chuyển hướng giữ tham số),
  chi tiết mục (Hán-Việt theo chữ, JLPT, trọng âm, nghĩa Việt / Anh, câu ví dụ + dịch, tra từng từ trong câu, câu từ tài liệu của mình,
  thêm vào bộ thẻ, sổ tay, báo lỗi, bình luận), nút tra từ điển ở màn học, `/admin/dictionary` (hàng chờ, tìm & sửa, bình luận, lịch
  sử, ngăn sửa), tab Từ điển ở `/admin/reports`, hai khoá ở Cấu hình (tuỳ chọn), trang `/about/data` ghi nguồn / giấy phép.
- **Test**: ai-service **1383 passed** (+17 `test_dictionary.py`, hai test hợp đồng cập nhật khoá mới); backend `DictionaryIT` 12 + 1 test
  mới ở `ExtractionIT`; frontend lint + build + self-check (module `dictionary.ts`) xanh.
- **Chưa kiểm**: dịch Gemini thật (máy không có khoá), V32 trên Supabase, giao diện trên điện thoại thật.

## 25/10/2026: thao tác khi học flashcard
Spec / kế hoạch: [Plan/specs/2026-10-25-thao-tac-hoc-the-design.md](Plan/specs/2026-10-25-thao-tac-hoc-the-design.md),
[Plan/plans/2026-10-25-thao-tac-hoc-the.md](Plan/plans/2026-10-25-thao-tac-hoc-the.md). Một migration mới: **V31**. Không đổi thuật toán SRS.

- **Trang học** (`StudyPage`, `features/study/*`): chạm vào thẻ / Space / Enter để lật qua lại hai mặt, chấm bằng phím 1 2 3 4;
  vuốt trái = Lại, phải = Tốt trên màn hình cảm ứng; thẻ "Lại" gặp lại sau 3 thẻ (trước: cuối hàng đợi); thanh tiến độ + bộ đếm
  Mới · Ôn · Học lại; màn tổng kết (thời gian, phân bố 4 mức, thẻ bấm Lại nhiều nhất, "Luyện lại n thẻ này" ở chế độ Luyện); phím `?`
  mở bảng phím tắt; F5 giữa phiên học tiếp hàng đợi dở (`sessionStorage`, 12 giờ).
- **Hoàn tác lượt chấm**: Z / Ctrl+Z / nút ↶, tối đa 20 bước mỗi phiên. `POST /api/reviews/undo {cardId}` → 204; 409 khi không có gì để
  hoàn tác (quá 30 phút, lượt quiz, lượt ghi trước V31, lượt của người khác). V31 thêm `review_logs.prev_*` (lịch ngay trước lượt chấm);
  hoàn tác ghi lại lịch cũ (hoặc xoá dòng `reviews` nếu là lượt đầu) và xoá log, nên heatmap / chuỗi ngày không đếm lượt đã bỏ.
- Test: `ReviewSrsIT` thêm 3 test hoàn tác; `scripts/selfcheck/study.ts`.

## 20/10/2026 (chiều): hoàn tất phần còn thiếu của Lộ trình học tập / Admin
Tổng kết và kế hoạch: [Progress/2026-10-19-tong-ket-va-ke-hoach.md](Progress/2026-10-19-tong-ket-va-ke-hoach.md) (§3, §5, §6.2, §10).
10 commit `8de6ea1`..`a0094a3` (10:17–13:59), HEAD `a0094a3`, 44 commit kể từ `de8accb`; vẫn chỉ ở local, chưa push. Một migration
mới: **V29** (chỉ thêm cột, khác bản V29 "Nổi bật" đã bỏ buổi sáng). Mỗi bản sửa tới `5a09e31` qua 1 lượt review đối kháng.

- **Lộ trình học tập**:
  - `8de6ea1` (D4): chương ACTIVE hết thẻ mà chưa qua kiểm tra có `state=empty` ("Trống", không nút học / kiểm tra; kiểm tra trả
    409). Kiểm tra chương chưa đạt: dải "Chưa đạt N% — Làm lại" và thông báo `LEARNING_PATH_CHAPTER_RETRY` một lần mỗi chương;
    `GET /api/learning-paths/{id}` trả `quizPassPct`. Vẫn chỉ gắn nhãn, không chặn chương sau.
  - `657d383` (NEW-17, major; NEW-18): kiểm tra chương luôn là bài thi của chương. Trước đây lượt luyện tập đang mở (24 giờ) được trả
    lại, làm 10/10 mà chương không qua. Nay lượt mở khác bị nộp thay (chấm như hết hạn) sau hộp "Nộp bài đang làm dở?"; đề mới cũng thiếu
    câu thì giữ lượt mở. `completion.chaptersTotal` bỏ chương "Trống" và chương không ra đủ min(10, số thẻ) câu nghĩa.
  - `d5e3c41` (spec LP-13, LP-15): `runOnce` chống bấm đúp cho các thao tác lộ trình (kích hoạt, gộp chương, cân lại, hoàn thành,
    thử lại, dịch lại nghĩa, kiểm tra chương; chưa có cho lưu cài đặt), hai modal tạo và nút xác nhận của `DialogProvider`; dải "Bộ
    thẻ này thuộc lộ trình «X»…" ở trang bộ thẻ / trang sửa của chương, câu xác nhận xoá thẻ / bộ nói rõ thẻ rời lịch. Spec Lộ trình 2.0 nay đủ 18/18 dòng.
- **Admin**:
  - `4232a4b` (STAFF-07): V29 `ALTER TABLE account_appeals ADD COLUMN IF NOT EXISTS locked_reason_at_submit text`; khiếu nại chụp lý do
    khoá lúc gửi (`''` = khoá không lý do, `NULL` = gửi trước V29); `AppealResponse.lockedReasonAtSubmit`; cột "Lý do khoá (lúc gửi)";
    modal xử lý theo trạng thái khoá mới nhất.
  - `3350f71`: `ai_model_primary` có tác dụng cho OCR dự phòng / dịch nghĩa / mẹo nhớ. ai-service nhận `gemini_model` (`/extract/text`)
    / `geminiModel` (`/extract/enrich`, `/radicals/cards`), chỉ trong danh sách cho phép (`GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`,
    `GEMINI_ALLOWED_MODELS` mới, `gemini-3.8-flash`, `gemini-3.7-flash`); tên lạ → `GEMINI_MODEL`; chuỗi model chọn → `GEMINI_MODEL` →
    dự phòng, 404 thì bỏ model đó 30 phút. `GET /api/admin/health` thêm `aiModels {default, allowed}`; trang Cấu hình gợi ý và cảnh báo.
  - `177d764` (NEW-19): `PATCH /api/admin/users/{id}` `{locked:true, lockedReason}` đổi được lý do của tài khoản đang khoá (audit
    `USER_LOCK_REASON`, giữ `lockedAt`); trước đây 200 mà giữ lý do cũ.
  - `d5e3c41`: thẻ "Lộ trình học tập" ở Tổng quan (`learningPathBreakdown`).
- **Màn hẹp** (frontend): `ff82190` (NEW-20) khung thông báo nằm trong màn hình ở 320–639 px, header không tràn ở 320 px; `d1a581e`
  (NEW-21) tiêu đề "Bộ thẻ đang học" và nút "Mục tiêu học tập" không xuống dòng từng chữ; `a0094a3` banner ôn tập theo bề rộng của
  chính nó (768 px: 4 dòng → 1), nút đóng không bị cắt và nhãn bảng điều khiển một dòng ở 320 px.
- **Backend** `5a09e31` (NEW-22): mốc thời gian làm tròn tới micro giây trước khi lưu, response của lần ghi trùng lần đọc sau
  (lockedAt, premiumUntil, updatedAt cài đặt / câu hỏi, dueAt, expiresAt, createdAt…); `premiumUntil` gửi lại cùng hạn không còn
  sinh audit / thông báo thừa; `User.setPasswordChangedAt` cắt µs (token cấp ngay sau đổi mật khẩu từng bị 401 ở ~0,05 % lần).
- **Kiểm trực tiếp**: HEAD `d5e3c41` (`wf_9c24c580-d98`): API 11/11, giao diện người học 13/13 (1280 / 375 px), Claude tự kiểm
  admin; tìm ra NEW-17..20. HEAD `ff82190` (`wf_5aec64e5-42f`): API 10/10, giao diện đạt hết trừ tiêu đề dashboard (NEW-21, đã sửa).
  Chuyển model Gemini thật chỉ kiểm qua code / test (máy không có khoá Gemini).
- **Test**: backend `mvn -B test` 520 → 525 → **528 / 70 lớp, 0 lỗi** (`5a09e31`, 26:32 phút; +18 test, +1 lớp
  `AiServiceClientGeminiModelTest`); ai-service **1340 passed, 2 skipped, 1 xfailed** (`3350f71`); frontend lint + build + self-check
  xanh (`a0094a3`; module self-check mới `learningPath`).
- **Đóng các mục "Còn mở"** của 19/10 và sáng 20/10: STAFF-07, `ai_model_primary`, spec LP-13 / LP-15, D4 "nhắc làm lại", chương
  "trống", `learningPathBreakdown` trên giao diện.
- **Còn mở** (chi tiết §7 tài liệu tổng kết): LC-04 backend; CSV JLPT; đổi vai trò không kiểm bậc; tên model lạ vẫn lưu được (chỉ
  cảnh báo); dải LP-15 mất khi chuyển bộ thẻ khỏi thư mục lộ trình, xoá cả bộ từ trang Bộ thẻ / Thư mục không nhắc lộ trình; lưu cài
  đặt lộ trình chưa qua `runOnce`; chương `locked` có điểm trượt không hiện dải "Làm lại"; một PATCH đổi nhiều trường chỉ ghi một
  action audit (có từ trước); "Ghi nhớ đăng nhập" mặc định chọn (quyết định sản phẩm); `chaptersTotal` không trừ câu hỏi bị ẩn (hiếm);
  chân thẻ KPI dashboard còn chật ở 768 px; đổi lý do khoá của tài khoản đang khoá chỉ làm được qua API (trang chi tiết người dùng
  chưa có ô); NEW-22 mới kiểm bằng IT, chưa kiểm trực tiếp; chuyển model Gemini thật chưa chạy (máy không có khoá); trước khi chạy
  V29 trên Supabase phải kiểm không còn dòng V29 cũ. Các mục còn mở của buổi sáng (thẻ rác "漢字 かな", `failOrphans`, giới hạn
  tách chương, LP-07) không đổi.
- **Bàn giao kiểm trực tiếp** (theo yêu cầu của người dùng, 20/10): Claude dừng các lượt kiểm trực tiếp. Các lượt đã kiểm và 12 việc
  còn lại để người dùng tự kiểm (NEW-22 trên dịch vụ thật, dashboard mới, LP-07, STAFF-06 ca 0, đổi lý do khoá qua API, SMTP, Gemini /
  `ai_model_primary` thật, OCR chữ dọc, micro, trình duyệt khác, smoke `npm run e2e`, Supabase thật) nằm ở
  [tài liệu tổng kết §8a.1](Progress/2026-10-19-tong-ket-va-ke-hoach.md).

## 20/10/2026 (sáng): Kiểm trực tiếp sau khi khởi động lại dịch vụ, sửa NEW-03..16, an toàn cho Supabase dùng chung
Tổng kết và kế hoạch: [Progress/2026-10-19-tong-ket-va-ke-hoach.md](Progress/2026-10-19-tong-ket-va-ke-hoach.md) (§6.2, §10). Mọi
commit vẫn chỉ ở local trên `backend-feature-learnmode` (chưa push). Không có migration mới (vẫn tới V28). Máy mất nguồn lúc 02:01
giữa một workflow; đã chạy lại từ đúng chỗ dở, không mất thay đổi.

- **Kiểm trực tiếp** (ai-service, backend e2e, frontend chạy thật; 1280 / 1024 / 375 px; USER / ADMIN / SUPER_ADMIN): các bản sửa
  LC-01..03, LC-11, LP-01, LP-02, LP-08, LP-10, STAFF-01..08, STAFF-10, 11, 13, 14 đạt trên dịch vụ thật; STAFF-12 trượt ở lượt đầu
  (bong bóng tiếng Anh của trình duyệt), sửa ở NEW-08 (`faf028b`) rồi đạt; STAFF-09 không kiểm lại ngày 20/10; ca tổng 0 của
  STAFF-06 mới kiểm qua code. Mỗi lượt kiểm tìm thêm lỗi; sửa xong lại kiểm, lượt cuối đạt hết.
- **Lộ trình học tập**:
  - `7f66b34`, `4a4a409`, `f1cdf53` (ai-service, NEW-03 / NEW-13): tách chương nhận tên bài bắt đầu bằng chữ giống trợ từ
    ("第1課 はじめまして", "第3課 がっこう", bản OCR dính liền) khi lấp đúng dãy số bài; không nhận câu / ghi chú / mục lục
    ("第1課 を復習しましょう", "第4課の予習", "第4課 はらいしゅう"); một bài cuối yếu không còn kéo mất cả dãy; bỏ dựa vào khoảng trắng
    toàn cỡ (NFKC đã đổi); thuật toán tuyến tính. 4 lượt review đối kháng + 5 bộ fuzz tới 40 000 tài liệu: 0 tiêu đề giả mới, 0 mất
    nội dung so với trước `7f66b34`; bộ `f6` (20 000 tài liệu thực tế) còn 9 tiêu đề giả do mục lục khi sách bắt đầu giữa chừng.
  - `1f861ff`, `fb656a8`, `4fce06b` (backend, NEW-04 / NEW-05): chương "Ngày N" của bản nháp không có chương là hàm thuần của
    (thẻ đã chọn, số ngày, trần), tính lại ở mọi thao tác ghi, giữ id; chương đặt tên riêng giữ thẻ; gộp tay vào chương "Ngày N" trả
    400; đang "Dịch lại nghĩa" thì PATCH số ngày / trần trả 409 cho mọi bản nháp; bản nháp lưu từ bản cũ được chuẩn hoá khi **chính
    chủ** mở (bỏ bước quét mọi bản nháp lúc khởi động, vốn sẽ ghi vào dữ liệu của mọi người trên Supabase dùng chung);
    `completedAt` chính xác tới micro giây.
  - `20a2331`, `74f97cc` (frontend, NEW-06 / NEW-07): một chip "Đã hoàn thành", banner Thư viện cùng nhãn đánh giá, bản nháp khoá ô
    số ngày / trần khi đang dịch lại nghĩa, danh sách chương đang mở tải lại khi bố cục đổi.
- **Admin**:
  - `1c2e5ff` (backend, NEW-11): Nổi bật chỉ cho bộ công khai (gỡ / chuyển riêng tư bỏ cờ, bật cho bộ riêng tư → 400). Bản sửa đầu có
    tạo migration V29 (CHECK + UPDATE dữ liệu) — **đã bỏ** vì Supabase dùng chung (quyết định D7); quy tắc giữ ở tầng code.
  - `638b963` (backend): health ai-service có hạn chót 3 s cho cả lời gọi, kể cả DNS (lần chạy test đầy đủ bắt được DNS chậm ~11 s).
  - `faf028b`, `3b0bfcb` (frontend, NEW-08..12, NEW-16): mọi form admin báo lỗi tiếng Việt thay bong bóng tiếng Anh của trình duyệt
    (STAFF-12 còn sót), nhãn biểu đồ OCR / "Cơ cấu Bóc tách AI" không bị cắt, lời báo xử lý báo cáo, ô ngày Nhật ký chỉ lên URL khi
    gõ xong.
- **Người học** (`3b0bfcb`, NEW-14 / NEW-15): thẻ thư mục ở dashboard không tràn ở 1024 px; đăng xuất rồi đăng nhập tài khoản khác
  không vào trang riêng của người trước.
- **Test**: backend `mvn -B test` **510 / 69 lớp, 0 lỗi** (`4fce06b`); ai-service **1326 passed, 2 skipped, 1 xfailed**
  (`f1cdf53`); frontend lint + build + self-check xanh (`3b0bfcb`).
- **Còn mở** (chi tiết §7 của tài liệu tổng kết): thẻ rác khi bóc tách dòng "漢字 かな"; `failOrphans` (có từ trước) làm hỏng job của
  người khác trên DB dùng chung; giới hạn còn lại của tách chương (2 bài, khoảng trắng lẫn lộn, mục lục khi sách bắt đầu giữa chừng); LP-07 chưa kiểm trực tiếp (cần
  đổi đồng hồ); trước khi chạy V29 (nay là V29 của STAFF-07, mục chiều 20/10) phải kiểm Supabase không có dòng V29 / constraint
  `ck_decks_featured_public` từ bản V29 đã bỏ; dữ liệu cũ "bộ riêng tư mang cờ Nổi bật" không được dọn (admin bỏ cờ tay). Các mục
  "Còn mở" của 19/10: LC-04 backend, CSV JLPT, đổi vai trò vẫn mở; STAFF-07, `ai_model_primary`, spec LP-13 / LP-15, D4 **đã đóng
  chiều 20/10** (mục trên); mục "chưa kiểm trực tiếp sau khi khởi động lại" đã đóng.

## 19/10/2026 (khuya, tới 00:21 20/10): Khớp hợp đồng, đợt dọn, kiểm tay trên trình duyệt + sửa lỗi
Tổng kết và kế hoạch tiếp theo: [Progress/2026-10-19-tong-ket-va-ke-hoach.md](Progress/2026-10-19-tong-ket-va-ke-hoach.md). Mọi commit
vẫn chỉ ở local trên `backend-feature-learnmode` (chưa push). Không có migration mới (vẫn tới V28).

- **Khớp frontend – backend đợt 2** (`b6a01cf`):
  - `notificationService` thêm `MNEMONIC_REVIEWED` (dẫn tới `/kanji?k=`) và `LEARNING_PATH_READY / _FAILED / _REMINDER /
    _CHAPTER_PASSED / _COMPLETED` (dẫn tới `/roadmap/:id`). Trước đây các loại này rơi vào nhánh "Thông báo: <TYPE>", không có link.
  - Nhật ký admin có nhãn `QUESTION`, `MNEMONIC`, `KNOWLEDGE_SOURCE`, `APPEAL`.
- **Đợt dọn**:
  - `1d1c5e2` (ai-service): mọi item của `/extract/analyze` (từ vựng lẫn ngữ pháp, cả hai bố cục) trả công khai `docReading` /
    `docMeaningEn` / `docLevel` (`null` = tài liệu không ghi). Gửi lại nguyên các trường này cho `/extract/conflicts` thì ra cùng
    cảnh báo.
  - `d2c42c7` (frontend):
    - `apiErrorText` ưu tiên message thật của server, nên 409 của mẹo nhớ (trần 3 / 50), báo lỗi câu hỏi và câu nhiễu hiện đúng
      câu; riêng 503 vẫn dùng câu thân thiện.
    - Tài khoản đã tự xoá có nhãn "Đã xoá" và bị ẩn các thao tác; CSV thêm cột `da_xoa`.
    - Admin ở 375 px không còn tràn ngang.
  - `580568a` (backend):
    - `AdminUserResponse` luôn có `deleted`.
    - Tài khoản đã xoá trả 409 khi mở khoá / Premium / hạn mức / đổi vai trò. Với PATCH (mở khoá / Premium / hạn mức), quy tắc
      bậc (403) vẫn được kiểm trước. Với PUT đổi vai trò, trước 409 chỉ có bước chặn tự đổi chính mình (400); đổi vai trò không
      kiểm bậc.
    - Khiếu nại UNLOCK tài khoản đã xoá trả 409 và rollback, nên khiếu nại vẫn OPEN.
    - Đăng ký `*@deleted.local` trả 400.
  - `5172ddc` (README, `.env.example`, data README): danh sách tính năng, cách tải dữ liệu từ điển, SMTP và xác thực email.
  - Đóng được 3 mục "Còn mở" của đợt 2 backend (mục ngay dưới): `docReading` / `docMeaningEn`, mở khoá tài khoản đã xoá +
    `@deleted.local`, câu 409 của mẹo nhớ.
- **Kiểm tay trên trình duyệt**:
  - Cách chạy: ai-service :8000, backend profile e2e :8082 (Postgres nhúng), frontend :5173 với `BE_PORT=8082`; cấu hình ở
    `.claude/launch.json`, chưa commit.
  - Phạm vi: 1280 px và 375 px, đủ vai trò USER / ADMIN / SUPER_ADMIN.
  - Kết quả: **37 lỗi** gồm 12 LC (người học), 14 STAFF (admin), 11 LP (lộ trình); 4 lỗi major là LC-01, LC-02, STAFF-01, LP-01.
    Mã LP-01..11 ở đây là mã lỗi kiểm tay, **khác** LP-1..17 của spec.
  - `4e1143f` (frontend, 29 lỗi):
    - LC-04..12: chặn thêm thẻ trùng khi thêm từ Hán–Việt, ô vẽ Kanji đứng yên, chip chủ đề, Ctrl+K, nhãn i+1, bản đồ
      Hán–Việt hiện "+N từ", quiz báo số câu tối đa.
    - LP-03..07, 09..11: "Kiểm tra chương" mang `?path=`, "Học gì tiếp" tải lại, câu lỗi đúng chỗ, `no_api_key`, lý do "severe",
      chip "Đã hoàn thành", lỗi tại ô nhập.
    - STAFF-02..13: `/admin/account`, `PublicRoute` chờ hồ sơ, tab staff gộp ADMIN + SUPER_ADMIN, câu trạng thái, nhãn "Lý do
      khoá hiện tại", biểu đồ / bảng vừa khung, `/setup` kiểm mật khẩu 6–72.
    - Thêm `scripts/selfcheck/manual.ts`.
  - `538d2ab` (backend):
    - LP-01: bản nháp xem trước bằng đúng `plan()` của lúc kích hoạt.
    - LP-02: dự báo không đếm thẻ đã học trước là thẻ mới.
    - LP-08: tên chương "Ngày N" / "Tuần N (ngày a–b)" đi theo dải ngày và ghi xuống DB.
    - STAFF-01: CORS mặc định thêm `127.0.0.1` và `[::1]` cổng 5173; origin bị từ chối nhận 403 JSON tiếng Việt
      (`JsonCorsProcessor`).
    - STAFF-14: `PUT /api/admin/settings` kiểm mọi khoá ở service, lỗi 400 tiếng Việt nêu tên khoá.
  - `7cc8840` (ai-service):
    - LC-01: `han_viet_overrides.csv` thêm 726 mục cho mọi chữ trong từ vựng JLPT N5–N1.
    - LC-02: thêm `kanji_meanings.py` với thứ tự nguồn `kanji_meaning_overrides.csv` → `unihan_definitions.csv`
      (`build_dicts --only unihan_def`) → JMdict.
    - LC-03: 日本 đọc にほん; 日本 / 日本語 / 日本人 xếp N5.
  - Kiểm lại còn 4 lỗi, đã sửa:
    - `dc350b7` (frontend): LP-10 widget có chip "Đã hoàn thành" và badge bỏ lộ trình đã xong; NEW-01 `/quiz` gom vệt trang trí
      vào lớp `overflow-x-clip`; NEW-02 thẻ Thư viện ghi "★ x · n đánh giá", lượt tải ghi riêng.
    - `409f4b4` (backend): `GET /api/learning-paths/today-summary` thêm `completedAt` (NON_NULL) và `done`; lộ trình đã xong
      xếp cuối.
    - `467fd8e` (ai-service): LC-11 tách mục JLPT gộp nhiều biến thể ("高校; 高等学校", "行く" いく / ゆく…); thêm
      `jlpt_meaning_overrides.csv` (中学校, 辞典, ～人).
- **Test**:
  - Backend: `538d2ab` 496 test / 69 lớp, 0 lỗi; `409f4b4` LearningPathIT 44/44, LearningPathReminderJobTest 3/3.
  - ai-service: `7cc8840` 1290 passed; HEAD 1296 passed, 2 skipped, 1 xfailed.
  - Frontend: HEAD lint, build và self-check xanh (build có cảnh báo chunk 1,27 MB).
  - `mvn -B test` đầy đủ ở HEAD `467fd8e`: **497 test / 69 lớp, 0 failures, 0 errors, 0 skipped** (xong 00:21 ngày 20/10,
    26:42 phút). 490 ở `d7b9955` + 7 `@Test` thêm sau đó.
  - CI chưa chạy (chưa push).
- **Còn mở**:
  - Các bản sửa backend / ai-service chưa kiểm trực tiếp sau khi khởi động lại dịch vụ.
  - LC-04 phía backend (`DeckService.addCards` vẫn nhận thẻ trùng).
  - STAFF-07 (khiếu nại không lưu lý do khoá lúc gửi).
  - CSV JLPT còn cách đọc kèm する, dòng đảo cột, `下る さがる`.
  - `ai_model_primary` chưa có tác dụng.
  - Spec LP-15 chưa làm; spec LP-13 thiếu guard ở frontend.
  - D4 "nhắc làm lại nếu chưa đạt" chưa làm.
  - Đổi vai trò không kiểm bậc (SUPER_ADMIN đổi được vai trò SUPER_ADMIN khác): chủ ý hay lỗi chưa xác minh.
  - Danh sách đầy đủ ở tài liệu tổng kết §7; 37 lỗi kiểm tay ở §10.

## 19/10/2026 (khuya): Đợt 2 — backend (3 làn + tích hợp)
Hợp đồng: [Plan/specs/2026-10-19-hop-dong-api-dot-2.md](Plan/specs/2026-10-19-hop-dong-api-dot-2.md). Chỉ `backend-core`; ba làn làm song song
trong worktree rồi gộp `--no-ff` vào `backend-feature-learnmode` (không xung đột), sau đó một commit tích hợp. Migration V22–V28 (chỉ thêm).
- **Làn quiz** (`wave2/quiz`, §1 — C2, C3, C7, E6, G3; V22): quiz 5 loại (`meaning`, `kanji_lookalike`, `homophone`, `reading` tự gõ chuẩn hoá
  kana, `conjugation`) chọn qua `questionTypes`; `GET /api/decks/{id}/quiz-capabilities`, `POST /api/decks/{id}/distractors` (ai-service
  `/extract/distractors`, ngưỡng `distractor_min_confidence`); ngân hàng câu hỏi `quiz_questions` (dùng lại câu cũ, câu admin sửa giữ qua
  `extra.supersedes`, câu ẩn không bao giờ phát), báo lỗi câu `POST /api/quiz-questions/{id}/flags` (409 trùng, 429 > 20/giờ), admin
  `/api/admin/questions` + `/question-flags/{id}/resolve` có audit. Từ loại + phương án nhiễu đi theo bản sao (bóc tách, nhân bản, bổ khuyết).
- **Làn luyện tập + tài khoản** (`wave2/practice-auth`, §2, §3, §6, §7; V23, V24, V27): `/api/practice/*` (nét KanjiVG, chấm DTW, mẫu / chấm
  trọng âm, ghi phát âm, thống kê; âm thanh không lên server); xác thực email (đăng nhập 403 `EMAIL_NOT_VERIFIED`, gửi lại 5 lần / 15 phút,
  admin xác thực hộ, mail gửi SAU khi commit token, timeout SMTP mặc định); khiếu nại tài khoản bị khoá (`POST /api/auth/appeals` công khai
  202 chung, `/api/admin/appeals` resolve UNLOCK theo quy tắc bậc / dismiss; tài khoản đã tự xoá không khiếu nại / mở khoá được);
  `GET /api/reviews/activity` (ngày học, đến hạn hôm nay, thẻ mới, chuỗi ngày theo tz).
- **Làn nội dung** (`wave2/content`, §4, §5, §9; V25, V26, V28): mẹo nhớ bộ thủ (sinh qua ai-service / mẫu, người học tự viết; 10 lượt sinh
  / giờ, ≤ 50 PENDING / người; admin `/api/admin/mnemonics` duyệt / từ chối có thông báo `MNEMONIC_REVIEWED`; `/api/nlp/radicals/cards` trả
  mẹo đã duyệt); cảnh báo mâu thuẫn `extraction_items.conflicts` + "Kiểm tra lại" cho bóc tách / lộ trình (chỉ đánh giá lại trường tài liệu
  khai báo); nguồn tri thức chuẩn `/api/admin/knowledge-sources` (xoá: SUPER_ADMIN); câu ví dụ i+1 `/api/extractions/{id}/i-plus-one` (áp cho
  job lộ trình chỉ khi DRAFT).
- **Tích hợp**:
  - `GET /api/admin/stats` thêm `openQuestionFlags`, `pendingMnemonics`, `openAppeals` (hàm đếm của từng làn) và G6 §8: `ai.engines[]`
    `{engine, total, failed, lowConfidence, avgConfidence, avgSeconds}`, `ai.enrich {total, enriched, quota, error}`, `ocrSeries[]`
    `{date, ocrJobs, failed, lowConfidence, geminiFallback, errorRate}` (đủ `days` phần tử) — native query trên `extraction_jobs.text_meta` /
    `stats`, cửa sổ `days`, chỉ job DONE/FAILED; engine của dòng cũ suy từ `source_type`; OCR chỉ ảnh / PDF scan (bỏ `pdf-text`);
    `errorRate` 0..1, `null` khi ngày không có OCR.
  - `GET /api/admin/health` thêm `engines` (cờ boolean từ body `/api/extract/health`, `AiServiceClient.healthBody()` client 2 giây, một lời gọi
    cho cả `aiService`); ai-service tắt → `{}`. Hợp đồng §8 ghi rõ vị trí này (thống kê không chờ ai-service).
  - `Notification.MNEMONIC_REVIEWED` thay hằng riêng trong `MnemonicService` (các làn khác không thêm loại thông báo).
  - `AdminAuthorizationIT`: ma trận thêm 21 endpoint admin đợt 2 + `stats` / `health` (USER 403, không token 401, ADMIN được, xoá nguồn tri thức chỉ SUPER_ADMIN)
    + API học tập mới chặn staff. Hợp đồng §4 / §9 ghi thêm 429 / 409 của mẹo nhớ và 409 của i+1 trên lộ trình đã kích hoạt.
- **Test**: `AdminStatsIT` (+2: hàng đợi kiểm duyệt; engine / enrich / chuỗi OCR từ job chèn bằng JDBC, cửa sổ 30 / 90 ngày, ranh giới ngày
  VN; health `engines` rỗng khi ai-service tắt), `AdminStatsServiceTest` (+3), `AiServiceClientHealthTest` (+1).
  `mvn -B test`: **490 test, 0 lỗi** (DNS `ai-service.invalid` của máy đã nhanh lại nên `health_reports_ai_service_down_quickly` qua). Commit:
  làn `48c1a33`, `f125265`, `e0ce4d4`; merge `b1be63a`, `3cdebbd`, `0cde82f`; tích hợp `d7b9955`. Chưa push; worktree làn đã gỡ, nhánh giữ.
- **Còn mở**: ai-service chưa trả `docReading` / `docMeaningEn` trên item (nguồn chuẩn từ vựng chưa có cách đọc, "Kiểm tra lại" job mới
  không kiểm được gì); `PATCH /api/admin/users/{id} {locked:false}` vẫn mở khoá được tài khoản đã tự xoá, đăng ký vẫn nhận `@deleted.local`;
  race hẹp khi admin sửa câu hỏi đúng lúc một lượt quiz đang sinh; đếm `conjugation` có thể dư với danh từ không có `pos` tận cùng hàng う;
  frontend coi mọi 409 khi gửi mẹo là "đã có 3 mẹo chờ duyệt cho chữ này" nên 409 mới (đủ 50 mẹo PENDING / người) hiện sai câu, chưa kiểm frontend hiện 429 / 409 của sinh mẹo và 409 của i+1 ra sao; chưa kiểm tay trọn luồng với ai-service thật.

## 19/10/2026 (khuya): Đợt 2 — giao diện (frontend)
Hợp đồng: [Plan/specs/2026-10-19-hop-dong-api-dot-2.md](Plan/specs/2026-10-19-hop-dong-api-dot-2.md). Chỉ `frontend/`; endpoint chưa có trên máy chủ
(404 "No static resource…" / 405 / 501) hiện câu bình tĩnh "Tính năng đang được cập nhật trên máy chủ…" thay vì lỗi đỏ.
- **Frontend đợt 2**: quiz đa loại + báo lỗi câu hỏi, admin `/admin/questions` (G3); luyện viết chữ Hán / phát âm + tab thống kê luyện tập
  (§2); xác thực email + khiếu nại khoá tài khoản (§3, §6); mẹo nhớ chữ Hán / bộ thủ phía người học và trang duyệt `/admin/mnemonics` (§4);
  nguồn tri thức `/admin/knowledge`, mâu thuẫn + "Kiểm tra lại" và câu i+1 trên trang bóc tách / bản nháp lộ trình (§5, F2); dashboard
  AI + biểu đồ OCR, cấu hình 13 khoá (§8, WP-G5); `/kanji`, `/han-viet`, tab "Phản xạ chậm". Self-check: `runAdminChecks`,
  `runQuizChecks`, `runPracticeChecks`, `runLearnerChecks`. 0 dependency mới.
- **Sửa sau rà soát**: `/admin` trắng trang (TDZ `ctx` trong `useGsap`; khung admin thêm `AdminErrorBoundary`); bảng admin và bảng
  `sr-only` của biểu đồ không còn nới rộng trang ở 375 px (`relative` trên vùng cuộn của `AdminTableShell`, `sr-only` đặt trên div bọc);
  khiếu nại của tài khoản đã xoá (trường vắng do NON_NULL) chuẩn hoá về null; một nguồn "chưa có endpoint" `lib/apiErrorInfo` (404 nghiệp
  vụ như báo lỗi câu của thẻ đã xoá giờ hiện đúng lỗi server); "Kiểm tra lại" khi máy chủ chưa có endpoint báo trung tính `role="status"`;
  nhãn nút "Xử lý / Chi tiết" khớp chữ hiển thị (WCAG 2.5.3); trang mẹo nhớ / khiếu nại dùng số việc chờ của `AdminLayout` (không gọi
  `/admin/stats` lần hai); tách `QuizPage` (màn bắt đầu, xem lại, `useTypingAutosave`) và `AdminQuestionDetail`; bỏ export chết.
  `npm run lint && npm run build && node --experimental-strip-types scripts/selfCheck.ts` xanh; chưa kiểm tay với backend thật.

## 19/10/2026 (đêm): Lộ trình 2.0 — điểm yếu, bổ khuyết, nhắc học (backend) + sửa sau rà soát
Spec §3.7–3.9, §4.2, §4.4 · tài liệu: [LEARNING_PATH.md](LEARNING_PATH.md) mục 11. Chỉ backend; mọi endpoint / trường cũ giữ nguyên.
- **API mới `/api/insights`** (USER): `GET /weaknesses?days=` (4 tín hiệu `lapses` / `low_ease` / `slow` / `quiz_wrong`, chỉ bộ còn xem
  được, gom theo cấp / loại / chữ Hán / bộ, `canRemedial`, `suggestedDays`), `GET /friction` (thẻ phản xạ chậm), `GET /next?date=` ("học gì
  tiếp": `path_today` → `due` → `catchup` → `remedial` → `next_chapter` → `library`).
- **`POST /api/learning-paths/remedial`** `{days 3..30, groupBy level|kind|kanji|deck, title?}` → lộ trình ACTIVE `source_type=remedial`
  từ ≤ 150 thẻ yếu nhất (< 8 → 409), mỗi nhóm một chương + bộ thẻ clone trong thư mục "Bổ khuyết dd/MM/yyyy"; không job, không hạn mức.
- **Nhắc học** `LearningPathReminderJob` → `LEARNING_PATH_REMINDER` (chỉ trong app), tối đa 1 lần / lộ trình / ngày nhờ
  `learning_paths.last_reminded_on` (V21, `ADD COLUMN IF NOT EXISTS`).
- **Sửa sau rà soát**:
  - Job nhắc không còn một giao dịch dài sửa entity đã nạp từ đầu lượt (UPDATE cả dòng từ bản cũ đè PATCH `reminder` / `dailyCap` /
    `totalDays`, reset `completedAt`, xoá lộ trình giữa lượt → `StaleStateException` rollback nhắc của mọi người): giờ mỗi người dùng một
    giao dịch, lộ trình được giành bằng `claimReminder` (UPDATE có điều kiện chỉ cột `last_reminded_on`). Lỗi một người không hỏng cả
    lượt; job chạy bù các giờ sau giờ cấu hình trong ngày; lộ trình kích hoạt sau giờ nhắc được nhắc từ hôm sau. Cron đọc
    `app.learning-path.reminder-cron` (test đặt `-` để cron thật không chạy giữa IT).
  - `/next` mục `due`: thẻ của lộ trình đã chốt hoàn thành (vẫn status ACTIVE) / chưa bắt đầu không còn biến mất khỏi mọi gợi ý; chỉ đếm
    thẻ trong bộ còn xem được (bộ bị thu hồi chia sẻ không còn kẹt số đến hạn). Mục `library` bỏ cả bộ public đã học trực tiếp.
  - `/friction` dùng đúng quy tắc §3.7 như lý do `slow`: > 4 000 ms **và** > 2 × trung vị cá nhân (trước là "hoặc", hai trang bất đồng).
  - `suggestedDays` tính trên 150 thẻ lộ trình bổ khuyết sẽ lấy (trước tính trên cả 500 thẻ → gợi ý quá dài).
  - Câu practice bấm "Bỏ qua câu này" tính là sai quiz (khớp việc đã chấm sai + ghi "again"); Javadoc / tài liệu sửa theo.
- **Test**: `InsightIT` (6: thêm cửa sổ `days` + mốc 14 ngày, bỏ trống exam / practice, trần 150 thẻ, biên ma sát cho 3 kiểu trung vị
  cá nhân, lộ trình đã hoàn thành trong `/next`, bộ Thư viện đã học), `LearningPathIT` (+ `remedial` gom theo bộ / loại, chủ đề bộ, SRS
  thẻ gốc), `LearningPathReminderJobIT` (3: giờ cấu hình 9, chạy bù, before / rest / after, kích hoạt sau giờ nhắc),
  `LearningPathReminderJobTest` (mới, unit), `InsightGroupingTest` (khẳng định chính xác nhóm tràn vào "Khác"), `NlpIT` (+ 422 → 400, 403 → 503).

## 19/10/2026 (tối): WP-G5 tham số AI + proxy tra cứu NLP — backend
- **Dữ liệu** (`V21__ai_settings_and_reminder.sql`, cộng dồn): ngoài `learning_paths.last_reminded_on`, tạo lại CHECK khoá `app_settings`
  (tra `pg_constraint` như V20) và seed 6 khoá: `ocr_fallback_confidence` 0.85, `ocr_low_line_confidence` 0.75, `distractor_min_confidence` 0.6,
  `contradiction_alert_threshold` 0.7, `ai_model_primary` "" (ai-service tự chọn), `email_verification_required` true (D2; gói xác thực email đọc sau).
- **Cấu hình** (`GET/PUT /api/admin/settings`): trả và nhận đủ 13 khoá (tên JSON = tên khoá); PUT vẫn chỉ SUPER_ADMIN, đòi mọi khoá, kiểm
  khoảng khoá V20/V21 ở `SettingsService.update` (400 tiếng Việt nêu tên khoá, gom nhiều lỗi), chỉ ghi + audit khoá đổi; số thực lưu dạng gọn
  ("0.85", "1"). `SettingsService.getDouble(key)` / `getDouble(key, fallback)`.
- **Bóc tách**: `textMeta.lowLines` lọc theo `ocr_low_line_confidence` (đọc lúc trả response, cả trang admin; hỏng → hằng 0.75);
  `ExtractionService.startJob` đọc `ocr_fallback_confidence` (hỏng → 0.85, kẹp 0..1) → `ExtractionWorker` → `AiServiceClient.extractText(..., ocrFallbackConfidence)`
  gửi field `ocr_fallback_confidence` sang `/api/extract/text`; ngưỡng đã dùng ghi ở `textMeta.ocrFallbackConfidence`.
- **API mới `/api/nlp`** (USER; staff 403): `GET /han-viet-graph?reading=&level=&limit=`, `GET /han-viet-suggest?q=&limit=`,
  `POST /kanji-cards {kanji, userLevel?}`, `GET /radicals`, `GET /radicals/{no}/kanji?levels=`, `POST /radicals/cards {kanji, withMnemonic}`
  (withMnemonic luôn false tới khi có kiểm duyệt mẹo nhớ). Trả nguyên JSON ai-service; GET cache 10 phút / 500 mục dùng chung; ai-service
  400/422 → 400, 404 → 404, còn lại (kể cả 401 sai khoá nội bộ) → 503.
- **Test**: `AdminSettingsIT` (13 khoá, ST-06/08–11), `ExtractionIT.ocr_thresholds_come_from_settings`, `NlpIT`, `AiServiceClientNlpTest`, `TtlCacheTest`.

## 19/10/2026 (chiều): Lộ trình học tập 2.0 — backend
Spec: [Plan/specs/2026-10-19-lo-trinh-hoc-tap-2-design.md](Plan/specs/2026-10-19-lo-trinh-hoc-tap-2-design.md) · tài liệu: [LEARNING_PATH.md](LEARNING_PATH.md) (mục 5 bảng API + mục 9).
Chỉ backend (`backend-core`); frontend 1.0 vẫn chạy nguyên vì mọi trường / endpoint cũ giữ nguyên, trường mới null bị bỏ (NON_NULL).
- **Dữ liệu** (`V20__learning_paths_v2.sql`): bảng `learning_path_cards` (lịch **theo thẻ**: `seq`, `scheduled_day`, `weight`, CASCADE theo
  thẻ / chương / lộ trình — LP-5); `learning_paths` thêm `daily_cap` (5–200, mặc định 50), `study_days` (mask T2..CN), `reminder`,
  `completed_at`, `last_rebalanced_at`, `source_type` nhận `remedial`; `learning_path_chapters` thêm `quiz_best_pct`, `quiz_passed_at`;
  `review_logs` thêm `reaction_ms`, `path_id`; `app_settings` thêm `learning_path_daily_cap_default` (50), `learning_path_quiz_pass_pct` (80),
  `learning_path_reminder_hour` (7). CHECK của V13 / V14 được tra theo `pg_constraint` nên chạy được cả Postgres nhúng lẫn Supabase.
- **Thuật toán** (`LearningPathScheduler`, thuần): `weight` (cấp thẻ so với trình độ, ngữ pháp +0.2), `plan` (chia theo thẻ với quota chạy,
  trần **tải** = mới + 0.9 × ôn dự báo, gộp chương nhỏ, nới quota ×1.15 tối đa 10 vòng, `overflow`), `forecast` (sóng ôn 1/3/7/17/40 ngày,
  lịch thật cho thẻ đã học), `rebalance` (không nợ = không đổi; `extend`), `replan` (đổi khung lịch: chỉ thẻ chưa học), `dateForDay` /
  `dayIndexFor` theo mask ngày nghỉ, `suggestDays` (số ngày nhỏ nhất mà lịch phẳng không vượt trần, 3–90).
- **API `/api/learning-paths`** (mọi endpoint ghi nhận `?date=` của máy khách, LP-11; mọi thao tác ghi khoá dòng `FOR UPDATE`, LP-13):
  `POST /` thêm `dailyCap?`, `studyDays?`; `GET /` một truy vấn batch (LP-7) + `today{newCount, dueCount, behindCount}` + `completion`;
  `GET /today-summary` (widget Tổng quan / badge, LP-16); `GET /{id}` thêm `completion`, `chapters[].{learned, mastered, state, quizBestPct,
  quizPassedAt}`, `today.state = rest`, `tasks[].cardIds`, `forecast[]`, bản nháp có `suggestedDays` / `overCap`; `PATCH /{id}` thêm
  `dailyCap / studyDays / reminder`, ACTIVE đổi khung → xếp lại thẻ chưa học; `POST /{id}/activate` ghi `learning_path_cards`;
  **mới**: `GET /{id}/session?kind=today|catchup|due|chapter` (phiên hợp nhất: đến hạn → nợ → mới, `mode` từng thẻ), `POST /{id}/rebalance`,
  `POST /{id}/retry` (FAILED chạy lại từ ANALYZE, **không tốn lượt**, LP-6), `POST /{id}/enrich` (dịch lại nghĩa, cooldown 5 phút),
  `POST /{id}/chapters/{cid}/quiz` (bài kiểm tra chương = quiz exam min(10, số thẻ)), `POST /{id}/complete`. `DELETE /{id}`: PROCESSING →
  409, giữ dòng job ở `CANCELLED` (xoá trắng văn bản) để không hoàn lượt hạn mức (LP-10); `create()` bọc một giao dịch cho cặp job + path.
- **Liên quan**: `POST /api/reviews` nhận `reactionMs?` (0–600000) và `pathId?` → `review_logs` (không đổi SRS); `QuizAttemptService.close()`
  phát `QuizSubmittedEvent` → `quizBestPct` / `quizPassedAt` + thông báo `LEARNING_PATH_CHAPTER_PASSED` (chỉ exam đủ cỡ);
  thông báo `LEARNING_PATH_READY / FAILED / COMPLETED` (kể cả FAILED do khởi động lại); Housekeeping không xoá job lộ trình (LP-1), chỉ xoá trắng
  `extracted_text` khi ACTIVE > 90 ngày và dọn job mồ côi; `nightly()` có `@Transactional` (trước đây `run()` gọi từ `this` không có giao
  dịch); `GET /api/admin/stats` thêm `learningPathBreakdown{active, completed, failed, remedial, draft}`; `ExtractionService.deleteJob`
  cho xoá job lộ trình mồ côi sau 24 giờ.
- **Test**: `LearningPathSchedulerTest` (44, S-01…S-05), `LearningPathIT` (37: IT-01…IT-04, LP-7/10/11/13, session / rebalance / retry /
  enrich / quiz / complete / khởi động lại), `LearningPathCardRepositoryIT`, `HousekeepingIT` (IT-05), `ReviewSrsIT` (reactionMs),
  `AdminStatsIT` (breakdown); `AdminSettingsIT.migration_seeds_exactly_seven_rows` cập nhật theo 3 khoá mới. Toàn bộ: `mvn test` 19/10 (14:39–14:51, 12 phút 43 s): **292 test / 44 lớp**, 1 lỗi duy nhất là `AdminSettingsIT` ST-08 (đếm 4 dòng `app_settings`, V20 thêm 3 → 7) đã sửa như trên; chạy lại lớp đó 9/9 xanh → 292/292, 0 lỗi, 0 bỏ qua.
- **Chưa làm trong đợt này** (phần còn lại của spec 2.0): `InsightService` + `/api/insights/{weaknesses, friction, next}` (§3.7, §3.9),
  lộ trình bổ khuyết `POST /remedial` (§3.8; DB đã nhận `source_type = remedial`), job nhắc `LEARNING_PATH_REMINDER` (§4.4, loại thông báo đã
  khai báo), 3 khoá lộ trình trên `/api/admin/settings` (`SettingsResponse` vẫn 4 khoá — sửa qua DB), LP-17 (ai-service). Giao diện (§6) ở mục ngay dưới.

## 19/10/2026: Lộ trình học tập 2.0 — giao diện (frontend)
Spec: [Plan/specs/2026-10-19-lo-trinh-hoc-tap-2-design.md](Plan/specs/2026-10-19-lo-trinh-hoc-tap-2-design.md) · tài liệu: [LEARNING_PATH.md](LEARNING_PATH.md) mục 10.
- **Frontend**: route `/session` (phiên hợp nhất `today|catchup|due|chapter`, hàng đợi đa bộ thẻ, chip Mới/Ôn/Luyện, đo thời gian
  phản xạ → `reactionMs` + `pathId`, luyện phát âm / viết ngay trên thẻ); trang ACTIVE dựng lại (`ProgressSummary`, `BehindBanner`,
  `TodaySessionPanel`, `WorkloadChart`, `ChapterTimeline` + kiểm tra chương, `PathSettingsDrawer`); bản nháp có gợi ý số ngày / trần /
  ngày học / "Dịch lại nghĩa"; FAILED có "Chạy lại"; widget "Lộ trình hôm nay" + badge sidebar qua `useTodaySummary` (`/today-summary`).
  0 dependency mới; `npm run lint && npm run build && npm run selfcheck` xanh.
- Sửa sau review (cùng ngày): mốc tối thiểu số ngày trong Cài đặt tính như `placeFrom` server (`replanFromDay`, theo ngày bắt đầu /
  ngày học đang chọn); poll trang chi tiết đi qua cùng `refreshSeq` với tải lại sau ghi; "Dịch lại nghĩa" nhận cả job FAILED còn item
  và chỉ đếm ngược theo `enrichedAt`; modal tạo không gửi `dailyCap` khi để trống (dùng mặc định quản trị); phiên chương thêm "Luyện n"
  và tiêu đề kết thúc theo loại phiên; "Học bù (n)" trên widget ngày nghỉ; `MAX_REACTION_MS` một nguồn ở `lib/srs.ts`; `dayIndexFor`
  nhận mặt nạ ngày học; bỏ `pathProgress` / `unreviewedInTasks` / `minDaysForActive` không còn dùng. Chưa kiểm tay 375 px (cần backend).

## 17/10/2026: Admin Panel (UC-38, UC-39, UC-41, UC-42)
Spec: [Plan/specs/2026-10-17-admin-panel-design.md](Plan/specs/2026-10-17-admin-panel-design.md) · plan: [Plan/plans/2026-10-17-admin-panel.md](Plan/plans/2026-10-17-admin-panel.md).
- **Vai trò**: `USER` (người học) + staff `ADMIN` / `SUPER_ADMIN` (`RoleHierarchy`). Một tài khoản một vai trò: staff gọi API học
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
- Review toàn nhánh (reviewer độc lập) tìm 2 lỗi đã sửa cùng ngày: `/api/admin/health` thiếu `X-Internal-Key` nên luôn báo AI
  "down" khi có `AI_SERVICE_KEY` (`AiServiceClientHealthTest`); lọc nhật ký theo ngày dùng nửa đêm UTC thay vì giờ VN (`AdminAuditIT`).
  Thay đổi phụ cho người học: `DELETE /api/extractions/{id}` với job đang chạy nay trả 409 (UI đã ẩn nút từ trước).
- **Chiều 17/10: bỏ vai trò VIEWER** (còn `USER / ADMIN / SUPER_ADMIN`; `/api/admin/**` cần ADMIN; `@PreAuthorize` chỉ còn cho đổi vai trò và sửa cấu hình). V14 chưa chạy trên Supabase nên sửa thẳng CHECK trong V14.
- `V15__seed_admin_accounts.sql`: 2 tài khoản khởi tạo `superadmin@nihongen.local` / `superadmin` (SUPER_ADMIN) và `admin1@nihongen.local` / `admin1` (ADMIN); đổi mật khẩu sau lần đầu đăng nhập.
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
