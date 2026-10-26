# Tổng kết công việc và kế hoạch tiếp theo — 19/10/2026

Viết lúc 00:10 ngày 20/10/2026, cập nhật nhiều lần trong ngày; **lần cuối: chiều 20/10, sau đợt hoàn tất phần còn thiếu của Lộ
trình / Admin (D4, STAFF-07, `ai_model_primary`, spec LP-13 / LP-15, thẻ lộ trình ở Tổng quan admin) và hai lượt kiểm trực tiếp**.
Nhánh `backend-feature-learnmode`, HEAD `a0094a3` (44 commit kể từ `de8accb`, gồm 3 merge). Mọi commit **chỉ có ở máy này, chưa
push, chưa gộp vào `main`**.
`docs/` bị gitignore nên tài liệu này cũng chỉ có trên máy này (xem §8b b7).

Yêu cầu gốc: `D:\University\PBL6\Yêu cầu chức năng.docx` (nằm ngoài repo). Trong file, tiêu đề là "1.2. Các yêu cầu về chức
năng" nhưng mục con lại đánh "1.1.1" (chức năng) và "1.1.2" (phi chức năng). Tài liệu này gọi phần chức năng là "1.2.1".

Tài liệu liên quan: [quyết định đã chốt](../Plan/specs/2026-10-19-quyet-dinh-da-chot.md) ·
[spec Lộ trình 2.0](../Plan/specs/2026-10-19-lo-trinh-hoc-tap-2-design.md) ·
[hợp đồng API đợt 2](../Plan/specs/2026-10-19-hop-dong-api-dot-2.md) ·
[kế hoạch tổng 1.2.1](../Plan/plans/2026-10-19-ke-hoach-tong-1-2-1.md) · [CHANGELOG](../CHANGELOG.md) ·
[tiến trình chi tiết trong ngày](2026-10-19-tien-trinh.md) · [LEARNING_PATH.md](../LEARNING_PATH.md) ·
[USE_CASES_CHECKLIST.md](../USE_CASES_CHECKLIST.md)

> **Lưu ý về mã "LP-xx".** Spec Lộ trình 2.0 đánh số hạng mục `LP-1 … LP-17`. Đợt kiểm tay trên trình duyệt lại đặt mã lỗi
> `LP-01 … LP-11`. Hai bộ mã trùng tên nhưng **khác nghĩa**. Ví dụ: spec LP-10 là "thông báo / xoá an toàn", còn lỗi kiểm tay
> LP-10 là "widget vẫn hiện lộ trình đã xong". Trong tài liệu này, mã của spec luôn ghi kèm chữ "spec", còn mã lỗi kiểm tay dùng
> hai chữ số.

---

## 1. Tóm tắt

Từ 19/10 tới chiều 20/10, nhánh có thêm 44 commit so với `origin/backend-feature-learnmode` (`de8accb`): 41 commit nội dung và
3 commit merge (diff: 487 tệp, +94 354 / −2 433 dòng, phần lớn là dữ liệu ai-service). Phạm vi mục 1.2.1 "Yêu cầu chức năng" gồm
39 yêu cầu. Theo rà soát, trước đợt này có 10 yêu cầu xong, 12 một phần và 17 chưa có. Sau đợt này có 37 yêu cầu chạy được và
2 yêu cầu một phần (D2 link chia sẻ bí mật, E4 mẫu trọng âm chuẩn). Trong 37 yêu cầu chạy được, 9 yêu cầu được làm khác cách mô tả
ở mục 1.3 một cách có chủ đích, theo quyết định "không cần làm y hệt 1.3".

Phần nổi bật là **Lộ trình học tập 2.0**. Lịch học nay xếp theo từng thẻ chứ không theo vị trí, có trần tải mỗi ngày và ngày
nghỉ trong tuần. Mỗi ngày chỉ cần một nút "Bắt đầu". Lộ trình có dự báo khối lượng ôn, tự cân lại lịch khi học trễ, bài kiểm
tra cuối chương, hai thước đo tiến độ, nhắc học, phân tích điểm yếu và lộ trình bổ khuyết. Bản nháp xem trước luôn trùng với lộ
trình nhận được sau khi bấm "Tạo lộ trình" (kể cả khi đổi số ngày, trần, bỏ chọn thẻ), và tài liệu có tên bài kiểu "第1課 はじめまして"
được chia đúng chương. Admin Panel có thêm 3 hàng đợi kiểm duyệt có badge (mẹo nhớ chờ duyệt, câu hỏi bị báo lỗi, khiếu nại),
trang quản lý nguồn tri thức chuẩn, 9 khoá cấu hình mới (tổng 13 khoá), thống kê hiệu suất AI / OCR, và mọi form admin báo lỗi
bằng tiếng Việt. Chiều 20/10 làm nốt các phần còn thiếu: chương hết thẻ thành "Trống" và nhắc "Chưa đạt N% — Làm lại" (D4),
khiếu nại giữ lý do khoá lúc gửi (STAFF-07), khoá `ai_model_primary` có tác dụng thật (có danh sách model cho phép), chống bấm đúp
(spec LP-13), nhắc bộ thẻ thuộc lộ trình (spec LP-15) và thẻ "Lộ trình học tập" ở Tổng quan admin.

Đợt này có thêm 10 migration (V20–V29). Phần lớn chỉ thêm, riêng V20 và V21 xoá rồi tạo lại CHECK, còn V24
`UPDATE users SET email_verified_at = now()` cho tài khoản cũ. V29 (STAFF-07, `4232a4b`) chỉ `ADD COLUMN IF NOT EXISTS`; đây **không**
phải bản V29 "Nổi bật" đã bỏ sáng 20/10 (§8b b3). Có 58 endpoint backend mới và 17 endpoint ai-service mới (đợt chiều chỉ thêm
trường vào endpoint có sẵn).

**Kiểm thử và sửa lỗi:**
- Kiểm tay lần 1 trên trình duyệt (đêm 19/10) tìm thấy 37 lỗi. Cả 37 đều đã có bản sửa được commit, nhưng LC-04 mới chỉ sửa ở
  frontend; phần backend vẫn còn tồn (§7.1 #3). STAFF-07 có phần backend từ chiều 20/10 (`4232a4b`, V29). Kiểm lại sinh thêm NEW-01,
  NEW-02, cũng đã sửa.
- Sáng 20/10 khởi động lại dịch vụ và kiểm trực tiếp lại 3 lượt (API, trang người học, trang admin; 1280 / 1024 / 375 px), tìm và
  sửa thêm NEW-03..16. Mỗi bản sửa qua 1–4 lượt review đối kháng (tách chương và bản nháp lộ trình mỗi phần 4 lượt, tách chương có
  fuzz tới 40 000 tài liệu; form admin 2; sửa frontend cuối 1), trừ `638b963` (hạn chót health) viết ở bước chốt sau review, rồi
  chạy lại toàn bộ test và kiểm trực tiếp lần nữa. Kết quả lượt cuối buổi sáng (HEAD `f1cdf53`): **tất cả mục kiểm đạt** (§6.2);
  những gì còn hạn chế ghi ở §7.
- Chiều 20/10: làm nốt phần còn thiếu (`8de6ea1`..`d5e3c41`), kiểm trực tiếp 2 lượt (HEAD `d5e3c41` rồi `ff82190`), tìm và sửa
  NEW-17..22 (lớn nhất: NEW-17, lượt luyện tập đang mở chiếm chỗ bài kiểm tra chương), rồi chỉnh dashboard ở màn hẹp (`a0094a3`).
  Mỗi bản sửa từ `8de6ea1` tới `5a09e31` qua 1 lượt review đối kháng; `a0094a3` (đổi lớp Tailwind và bọc lại vài thẻ span, không
  đổi logic) không review. Chi tiết §5, §6.2, §10.
- Máy mất nguồn lúc 02:01 ngày 20/10 giữa một workflow; đã chạy lại từ đúng chỗ dở, không mất thay đổi nào.
- Hai quyết định để an toàn cho Supabase dùng chung: **bỏ migration V29 "Nổi bật"** (CHECK + UPDATE dữ liệu cho cờ Nổi bật; quy tắc
  giữ ở tầng code; số V29 sau đó dùng cho STAFF-07, chỉ thêm cột) và **bỏ bước quét mọi bản nháp lúc khởi động** (thay bằng chuẩn hoá
  khi chính chủ mở bản nháp).

**Test tự động ở bản cuối:**
- Backend: **528 test / 70 lớp, 0 failures, 0 errors, 0 skipped** (`mvn -B test` ở `5a09e31`, 26:32 phút; `a0094a3` sau đó không
  đụng backend).
- ai-service: **1340 passed, 2 skipped, 1 xfailed** (ở `3350f71`; các commit sau không đụng ai-service).
- Frontend: lint, build và self-check đều xanh (ở `a0094a3`).
- CI (GitHub Actions) chưa chạy trên 44 commit này vì chưa push.

## 2. Yêu cầu ban đầu và quyết định đã chốt

Người dùng yêu cầu theo thứ tự:
1. Đọc dự án và đánh giá Lộ trình học tập.
2. Cài Maven, sửa code lộ trình và hoàn thiện đủ mục 1.2.1 của "Yêu cầu chức năng.docx" cùng chức năng Admin / Super admin.
   Không cần làm y hệt mục 1.3 (Neo4j, NLI, FSRS). Lộ trình làm "tốt nhất có thể".
3. Sau đó được tự quyết, không hỏi lại ("tắt grill me"). Vẫn giữ quy tắc chỉ commit local, **không push**.

Các quyết định D1–D12 nằm ở [quyet-dinh-da-chot.md](../Plan/specs/2026-10-19-quyet-dinh-da-chot.md); D13 hiện chỉ ghi ở đây.
Tóm tắt:

| # | Quyết định | Code hiện tại |
|---|---|---|
| D1 | Hạn chót hơn 1 tháng, làm đủ 1.2.1 ở mức chạy thật | Đúng |
| D2 | Xác thực email chặn cứng, dùng SMTP thật | Đúng; gửi lại **5 lần / 15 phút** cho mỗi (IP, email), trong khi D2 ghi 3 lần/giờ (xem §7) |
| D3 | Phát âm / trọng âm làm trong trình duyệt | Đúng (Web Speech API, WebAudio F0) |
| D4 | Kiểm tra chương chỉ gắn nhãn | Đúng (`8de6ea1`, 20/10 chiều): chương đã làm kiểm tra mà dưới ngưỡng có dải "Chưa đạt N% — Làm lại" trong `ChapterTimeline` (ngưỡng lấy từ `quizPassPct` của `GET /{id}`), thông báo `LEARNING_PATH_CHAPTER_RETRY` một lần mỗi chương (lượt trượt đầu tiên). Vẫn không chặn chương sau. Kiểm tra chương luôn là bài thi của chương (`657d383`) |
| D5 | Mẹo nhớ dùng Gemini, có mẫu dự phòng, admin duyệt | Đúng |
| D6 | Mâu thuẫn so với từ điển và nguồn chuẩn do admin tải lên | Đúng |
| D7 | Migration chỉ thêm trên Supabase dùng chung | V20–V29 chỉ thêm; V20 và V21 tạo lại CHECK; V29 dùng `ADD COLUMN IF NOT EXISTS` (§8b) |
| D8 | Staff không học | Đúng (`anyRequest().hasRole("USER")`) |
| D9 | Link chia sẻ `share_token` | **Chưa làm** |
| D10 | Dùng KanjiVG | Đúng (file thật là `kanji_strokes.json`) |
| D11 | Ngân hàng câu hỏi lưu theo thẻ | Đúng một phần: lưu theo thẻ, nhưng bảng tên `quiz_questions` (D11 ghi `question_bank`) và `kind` chỉ có MEANING / READING / KANJI_LOOKALIKE / HOMOPHONE / CONJUGATION (V22). Loại "on-kun" của D11 không phải loại câu quiz; On / Kun là thẻ (C5) |
| D12 | Có ngày nghỉ trong tuần, trần mặc định 50 thẻ/ngày | Đúng |
| D13 | Được tải KRADFILE và kanjium (người dùng đồng ý 19/10; chưa ghi vào `quyet-dinh-da-chot.md`) | Đúng (`build_dicts.py --only kradfile\|pitch`, 2 file không commit). Kéo theo nghĩa vụ ghi nguồn CC BY-SA (§8c c7) |

## 3. Đã làm

### 3.1 Lộ trình học tập 2.0 (phần trọng tâm)

Bản 1.0 chia thẻ theo vị trí trong bộ và tính "việc hôm nay" theo dải chỉ số. Cách này có nhiều điểm yếu: sửa bộ thẻ là lịch
trôi, học trễ thì nợ dồn mãi, không có cảm giác hoàn thành và không cá nhân hoá. Bản 2.0 viết lại phần lõi: backend `e6312d3`,
frontend `174135e`, ai-service `6a55d55`, sửa sau kiểm tay `538d2ab` / `4e1143f` / `dc350b7` / `409f4b4`, làm nốt chiều 20/10
`8de6ea1` / `d5e3c41` / `657d383`.

| Người học được gì | Cách làm | Bằng chứng |
|---|---|---|
| **Lịch không trôi** khi sửa, thêm hay xoá thẻ | Mỗi thẻ có một dòng lịch riêng (`seq`, `scheduled_day`, `weight`). Xoá thẻ thì dòng lịch tự mất theo, không lỗi 500 (spec LP-5) | `V20__learning_paths_v2.sql` (`learning_path_cards`), `LearningPathService.writeSchedule`, `LearningPathIT.deleting_a_card_removes_it_from_session_without_error` |
| **Không quá tải mỗi ngày** | Trần tải = thẻ mới (có trọng số theo cấp so với trình độ: 1.0 / 1.3 / 1.5, không rõ cấp 1.2; ngữ pháp +0.2) + lượt ôn dự báo × 0.9. Mặc định 50, khoảng 5–200, admin đổi được mặc định | `LearningPathScheduler.weight/plan`, khoá `learning_path_daily_cap_default` |
| **Chọn ngày học trong tuần** | Mặt nạ 7 ký tự (T2..CN). Ngày nghỉ có `state=rest`, chỉ gợi ý ôn nếu người học muốn | `study_days`, `dateForDay` / `dayIndexFor`, `StudyDaysToggles.tsx` |
| **Biết trước nên học bao nhiêu ngày** | Bản nháp gợi ý số ngày nhỏ nhất mà lịch không vượt trần (3–90 ngày), cảnh báo `overCap`. Lịch xem trước dùng đúng hàm `plan()` của lúc kích hoạt (lỗi kiểm tay LP-01) | `suggestDays`, `draftSchedule`, `PathDraftEditor.tsx` |
| **Một nút "Bắt đầu" mỗi ngày** | `/session` gộp thẻ đến hạn, thẻ nợ và thẻ mới từ nhiều bộ. Phần nợ bị cắt cho vừa trần, nhưng thẻ mới của hôm nay luôn được giữ | `GET /api/learning-paths/{id}/session?kind=today\|catchup\|due\|chapter`, route `/session` |
| **Thấy trước khối lượng ôn** | Biểu đồ tải từng ngày: thẻ mới + sóng ôn 1/3/7/17/40 ngày; thẻ đã học dùng hạn ôn thật | `forecast`, `WorkloadChart.tsx` |
| **Học trễ không bị dồn nợ** | Dải nợ cho 3 lựa chọn: "Học bù", "Cân lại lịch" (dàn nợ vào các ngày còn lại) và "Kéo dài". Thẻ đã học giữ nguyên ngày; lịch tối đa 365 ngày | `POST /{id}/rebalance`, `BehindBanner.tsx`, `PathSettingsDrawer.tsx` |
| **Kiểm tra cuối chương** | Quiz exam min(10, số thẻ) câu, đạt từ 80 % (cấu hình được) thì chương có nhãn "đã qua" và người học nhận thông báo. Không chặn chương sau (D4). Chưa đạt: dải "Chưa đạt N% — Làm lại" + thông báo nhắc một lần mỗi chương (`8de6ea1`). Luôn là bài thi của chương: lượt luyện tập / exam ít câu đang mở trên bộ đó bị nộp thay (chấm như hết hạn) sau hộp xác nhận "Nộp bài đang làm dở?"; đề mới cũng thiếu câu thì trả lại lượt đang mở (`657d383`, NEW-17) | `POST /{id}/chapters/{cid}/quiz`, `QuizAttemptService.chapterExam`, `QuizSubmittedEvent`, `ChapterTimeline.tsx`, `roadmapUtils.quizRetryLabel` |
| **Chương hết thẻ không treo tiến độ** | Chương ACTIVE không còn thẻ nào trong lịch mà chưa qua kiểm tra có `state=empty` ("Trống", không nút học / kiểm tra; kiểm tra trả 409). `chaptersTotal` chỉ đếm chương đã qua hoặc ra được đủ đề (bỏ chương "Trống" và chương 1 thẻ / mọi thẻ cùng nghĩa), nên "N/M chương đã qua kiểm tra" tới được M/M; 0 chương thì ghi "Chưa có chương để kiểm tra" (`8de6ea1`, `657d383`, NEW-18) | `LearningPathService.chapterState`, `QuizCapabilities.meaningQuestions`, `ProgressSummary.tsx` |
| **Thấy rõ tiến độ và cảm giác hoàn thành** | Hai thước đo "đã học" và "đã thuộc" (khoảng ôn ≥ 21 ngày). `POST /complete`; widget "Lộ trình hôm nay" có chip "Đã hoàn thành" | `ProgressSummary.tsx`, `TodaySummaryResponse(completedAt, done)` |
| **Được nhắc học** | Job chạy phút 05 mỗi giờ, từ giờ cấu hình trở đi (mặc định 7 giờ, giờ VN), tối đa 1 lần / lộ trình / ngày. Có 6 loại thông báo `LEARNING_PATH_*` (thêm `_CHAPTER_RETRY` chiều 20/10) | `LearningPathReminderJob`, V21 `last_reminded_on`, `Notification.java` |
| **Biết bộ thẻ nào thuộc lộ trình** (spec LP-15) | Bộ thẻ của một chương (thư mục có `metadata.learningPathId` + `chapters[].deckId`) hiện dải "Bộ thẻ này thuộc lộ trình «X». Thẻ thêm mới sẽ không có trong lịch…" kèm link; xác nhận xoá thẻ / xoá bộ ở trang bộ thẻ nói rõ thẻ rời lịch. Bộ người học tự tạo trong thư mục lộ trình không bị nhắc (`d5e3c41`) | `useDeckLearningPath.ts`, `DeckPathNotice.tsx`, `DeckEditorPage`, `DeckDetailPage` |
| **Biết mình yếu ở đâu, học gì tiếp** | Thẻ yếu xét theo 4 tín hiệu (sai nhiều, ease thấp, phản xạ chậm, sai quiz). Tab "Phản xạ chậm". Gợi ý "Học gì tiếp" theo thứ tự cố định | `/api/insights/weaknesses\|friction\|next`, `WeaknessCard`, `NextStepsCard`, `FrictionTab` |
| **Lộ trình bổ khuyết** | Tạo từ 8–150 thẻ yếu nhất, 3–30 ngày, mỗi nhóm một chương. Không cần tài liệu, không tốn hạn mức | `POST /api/learning-paths/remedial`, `CreateRemedialModal.tsx` |
| **Đo phản xạ** | Mỗi lượt chấm gửi `reactionMs` + `pathId` vào `review_logs` (không đổi SM-2) | `StudyPage.tsx`, `ReviewService` |
| **Không mất công khi lỗi** | FAILED chạy lại không tốn lượt. "Dịch lại nghĩa" cách nhau 5 phút. Xoá khi đang xử lý trả 409 và giữ job để không hoàn hạn mức | `POST /{id}/retry`, `/enrich`, `delete` |
| **Dữ liệu an toàn** | Khoá dòng khi ghi, `?date=` theo ngày máy khách, danh sách tải theo lô (hết N+1), dọn dẹp không xoá job của lộ trình. Frontend chặn bấm đúp (`runOnce` trong `useRef`) cho kích hoạt, gộp chương (khoá theo từng chương), cân lại, hoàn thành, thử lại, dịch lại nghĩa, kiểm tra chương, hai modal tạo lộ trình và nút xác nhận của `DialogProvider` (`d5e3c41`) | spec LP-1, LP-7, LP-11, LP-13; `HousekeepingIT`; `lib/inFlight.ts` |
| **Tài liệu dài vẫn đủ từ cho mọi chương** | ai-service chia trần 900 từ theo chương, mỗi chương ít nhất 20 từ (spec LP-17) | `ai-service/app/extract/pipeline.py` (`MAX_VOCAB_CHAPTERED`) |
| **Chương đúng theo bài của giáo trình** | Nhận tên bài kiểu "第1課 はじめまして", "第3課 がっこう" (bắt đầu bằng chữ giống trợ từ), dòng OCR dính liền "第1課はじめまして", "Lesson 1: …": dòng như vậy chỉ được nhận khi lấp đúng dãy số bài (n−1 trước, n+1 sau hoặc là bài cuối của dãy cùng kiểu viết). Không nhận câu trong thân bài ("第1課 を復習しましょう", "第1課 はどうでしたか"), ghi chú cuối sách ("第4課の予習", "第4課 はらいしゅう"), mục lục. Thuật toán tuyến tính | `ai-service/app/extract/chapters.py` (`_fill_particle_gaps`, `_sentence_like`, `_particle_led`), `test_chapters.py` 55 test, fuzz; `7f66b34`, `4a4a409`, `f1cdf53` |
| **Bản nháp xem trước = lộ trình nhận được** | Tài liệu không có chương: chương "Ngày N" là hàm thuần của (thẻ đã chọn, số ngày, trần, các chương đặt tên riêng, cấp JLPT của người học dùng để tính trọng số), tính lại ở mọi thao tác ghi; đổi số ngày 10 → 3 → 10 hay bỏ chọn rồi chọn lại cho lại đúng bố cục và đúng id chương. Chương người học đặt tên riêng giữ nguyên thẻ của nó. Bản nháp lưu từ bản cũ được chuẩn hoá khi chính chủ mở (chỉ ghi khi khác). Đang "Dịch lại nghĩa" thì khoá ô số ngày / trần | `LearningPathService.layoutDayChapters`, `fitDayChapters`, `get()`; `PathDraftEditor.tsx`; LearningPathIT (53 test ở `4fce06b`, nay 58); `1f861ff`, `fb656a8`, `4fce06b`, `74f97cc` |

Đối chiếu với spec (18 dòng LP-1..17, trong đó LP-10 xuất hiện 2 lần): **18/18 dòng xong** từ chiều 20/10 (spec LP-13 phía
frontend và spec LP-15 làm ở `d5e3c41`; trước đó 16 xong, 1 một phần, 1 chưa làm). Giới hạn còn lại của LP-15 ở §7.2.

Admin có thêm 3 khoá cấu hình cho lộ trình. Trang tổng quan admin có thẻ "Lộ trình học tập" từ `learningPathBreakdown` (Đang học /
Hoàn thành / Bản nháp / Thất bại / Đang xử lý, bổ khuyết đếm chéo; `d5e3c41`).

Code chính: [`LearningPathScheduler.java`](../../backend-core/src/main/java/com/pbl6/flashcard/service/LearningPathScheduler.java) (804 dòng, hàm thuần),
[`LearningPathService.java`](../../backend-core/src/main/java/com/pbl6/flashcard/service/LearningPathService.java),
[`InsightService.java`](../../backend-core/src/main/java/com/pbl6/flashcard/service/InsightService.java),
`frontend/src/features/roadmap/` (19 component). Test: `LearningPathSchedulerTest` 44, `LearningPathIT` 58, `LearningPathCardRepositoryIT` 1, `InsightIT` 6,
`LearningPathReminderJobIT` 3, `LearningPathReminderJobTest` 3; self-check `scripts/selfcheck/learningPath.ts`.

### 3.2 Chức năng người học khác

- **Quiz đa loại** (`48c1a33`, V22): có 5 loại câu (nghĩa, Kanji giống hình, đồng âm, gõ cách đọc bằng romaji → kana, chia thể
  động từ). Ngân hàng câu hỏi lưu theo thẻ; câu admin đã ẩn không bao giờ được phát. Người học báo lỗi câu hỏi được (409 khi
  trùng, 429 khi > 20 lần/giờ). Màn bắt đầu cho biết bộ thẻ chỉ đủ bao nhiêu câu.
  Code: `QuizService`, `QuestionBankService`, `frontend/src/features/quiz/`.
- **Luyện tập** (`f125265`, V23):
  - Viết Kanji trên canvas, chấm bằng DTW so với nét KanjiVG.
  - Phát âm bằng Web Speech API, chấm bằng Levenshtein trên kana; âm thanh không gửi lên server.
  - Trọng âm: lấy F0 bằng WebAudio, so với kiểu trọng âm kanjium.
  - Chế độ chỉ nghe.
  - Có thống kê luyện tập.
  - Code: `/api/practice/*`, `frontend/src/features/practice/`.
- **Chữ Hán, bộ thủ, mẹo nhớ, Hán–Việt** (`6a55d55`, `e0ce4d4`, V25):
  - Trang `/kanji`: thẻ On/Kun, 214 bộ thủ, mẹo nhớ (sinh tối đa 10 lần/giờ, tối đa 50 mẹo chờ duyệt mỗi người).
  - Trang `/han-viet`: đồ thị âm → chữ → từ, thêm từ vào bộ thẻ.
  - Âm Hán–Việt sửa tay 726 mục và nghĩa từng chữ Kanji đã sửa (`7cc8840`).
- **Bóc tách** (`6a55d55`, `e0ce4d4`, `1d1c5e2`, V26):
  - Tách furigana (PDF và OCR), chọn cách đọc theo ngữ cảnh.
  - Phân bố cấp JLPT của tài liệu.
  - Cảnh báo mâu thuẫn, có nút "Kiểm tra lại".
  - Câu ví dụ i+1, áp vào mục bóc tách.
- **Tài khoản** (`f125265`, V24, V27):
  - Xác thực email: link 24 giờ; đăng nhập trả 403 `EMAIL_NOT_VERIFIED`; gửi lại được; admin xác thực hộ được.
  - Khiếu nại khi bị khoá: gửi từ trang đăng nhập, luôn trả 202, 5 lần/giờ/IP; lưu lý do khoá lúc gửi (V29, `4232a4b`).
- **Dashboard hoạt động**: `GET /api/reviews/activity` trả ngày học, số thẻ đến hạn, thẻ mới, đã học / đã thuộc và chuỗi ngày
  theo múi giờ.
- **Chia sẻ**: chép link `/decks/:id` (theo quyền đã có) và "Lưu bản sao". Chưa có link bí mật `share_token` (D9).

### 3.3 Admin và Super admin

Vai trò gồm `USER` (người học), `ADMIN` và `SUPER_ADMIN` (SUPER_ADMIN > ADMIN qua `RoleHierarchy`).
- Staff không gọi được API học. Frontend đưa staff về `/admin`; `/profile` của staff dẫn tới `/admin/account`.
- Khoá / mở khoá, Premium, hạn mức, thu hồi phiên và xác thực email hộ chỉ làm được với **người có bậc thấp hơn**
  (`AdminUserService.requireBelow`). Đổi vai trò (chỉ SUPER_ADMIN) chỉ chặn tự đổi vai trò của chính mình (`requireNotSelf`, 400)
  và tài khoản đã xoá (409), **không** kiểm bậc, nên một SUPER_ADMIN đổi được vai trò của SUPER_ADMIN khác (§7.1 #14). Mọi thao
  tác đều có audit.
- `/api/admin/**` cần quyền ADMIN.
- Tạo staff: chỉ SUPER_ADMIN đổi vai trò được. SUPER_ADMIN đầu tiên là tài khoản seed của `V15__seed_admin_accounts.sql`
  (lần đầu đăng nhập phải qua `/setup` đổi mật khẩu) hoặc tạo bằng SQL.

Trang mới trong đợt (6 route) và trang được mở rộng:

| Trang | Route | Endpoint | Quyền |
|---|---|---|---|
| Duyệt mẹo nhớ | `/admin/mnemonics` | `GET /api/admin/mnemonics`, `PATCH /{id}`, `POST /{id}/approve`, `POST /{id}/reject` (bắt buộc lý do) | ADMIN |
| Ngân hàng câu hỏi | `/admin/questions` | `GET /api/admin/questions`, `GET/PATCH /{id}`, `POST /{id}/hide`, `/unhide`, `POST /api/admin/question-flags/{id}/resolve` | ADMIN |
| Nguồn tri thức chuẩn | `/admin/knowledge`, `/admin/knowledge/:id` | `GET`, `GET /{id}`, `POST` (multipart), `PUT /{id}` (phiên bản + 1), `/archive`, `/activate`, **`DELETE /{id}`** | ADMIN; **xoá chỉ SUPER_ADMIN** |
| Khiếu nại | `/admin/appeals` | `GET /api/admin/appeals`, `POST /{id}/resolve` (mở khoá theo quy tắc bậc), `POST /{id}/dismiss`. Từ `4232a4b`: cột "Lý do khoá (lúc gửi)" đọc `lockedReasonAtSubmit` (V29, giữ nguyên qua mở / khoá lại; khiếu nại gửi trước V29 hiện lý do hiện tại kèm nhãn); modal xử lý lấy trạng thái khoá và lý do mới nhất từ chi tiết người dùng | ADMIN |
| Hồ sơ của tôi (staff đổi mật khẩu) | `/admin/account` | dùng API tài khoản sẵn có | ADMIN |
| Người dùng (mở rộng) | `/admin/users/:id` | `POST /api/admin/users/{id}/verify-email`; trường `deleted`; tài khoản đã xoá → 409 khi mở khoá / Premium / hạn mức / vai trò (`580568a`). Từ `177d764`: `PATCH {locked:true, lockedReason}` trên tài khoản **đang khoá** đổi được lý do (audit `USER_LOCK_REASON`; giao diện chưa có ô cho việc này, xem §3.7 và §7.2) | ADMIN; **đổi vai trò chỉ SUPER_ADMIN** |
| Tổng quan (mở rộng) | `/admin` | `GET /api/admin/stats` thêm `openQuestionFlags`, `pendingMnemonics`, `openAppeals`, `ai.engines[]`, `ai.enrich`, `ocrSeries[]`; thẻ "Lộ trình học tập" từ `learningPathBreakdown` (`d5e3c41`); `GET /api/admin/health` thêm `engines` và `aiModels {default, allowed}` (`3350f71`) | ADMIN |
| Cấu hình (mở rộng) | `/admin/settings` | `GET /api/admin/settings` (13 khoá), **`PUT`** (kiểm từng khoá, lỗi 400 tiếng Việt nêu tên khoá, `538d2ab`); ô "Model AI chính" gợi ý danh sách `aiModels.allowed` và cảnh báo tên ai-service sẽ bỏ qua (`3350f71`) | Xem: ADMIN; **sửa chỉ SUPER_ADMIN** |

Trang admin có từ trước đợt này (đều cần ADMIN; để có ma trận đầy đủ):

| Trang | Route | Endpoint |
|---|---|---|
| Người dùng | `/admin/users`, `/admin/users/:id` | `GET /api/admin/users`, `GET/PATCH /{id}` (khoá, Premium, hạn mức), `POST /{id}/revoke-sessions`, `PUT /{id}/role` (SUPER_ADMIN) |
| Nội dung | `/admin/decks`, `/admin/decks/:id` | `GET /api/admin/decks`, `GET /decks/{id}`, `POST /decks/{id}/unpublish`, `PATCH /decks/{id}/flags`, `DELETE /decks/{id}`; `GET /ratings`, `DELETE /ratings/{id}/comment`; `GET /extractions`, `DELETE /extractions/{id}` |
| Báo cáo vi phạm | `/admin/reports` | `GET /api/admin/reports`, `POST /{id}/resolve`, `POST /{id}/dismiss` |
| Nhật ký | `/admin/audit` | `GET /api/admin/audit-logs` |

Tóm tắt quyền:
- **Chỉ SUPER_ADMIN** làm được 3 việc, cả backend lẫn frontend đều chặn:
  - `PUT /api/admin/settings`
  - `PUT /api/admin/users/{id}/role`
  - `DELETE /api/admin/knowledge-sources/{id}`

  Bằng chứng: `@PreAuthorize("hasRole('SUPER_ADMIN')")` trong `AdminSettingsController`, `AdminUserController` và
  `AdminKnowledgeSourceController`.
- Ma trận phân quyền `AdminAuthorizationIT` kiểm 21 endpoint admin mới cùng stats / health: USER bị 403, không token bị 401,
  ADMIN được phép.
- Menu admin có badge số việc chờ (lấy từ một lần gọi `/admin/stats`, hiện "99+" khi vượt 99).
- Nhật ký có thêm nhãn `QUESTION`, `MNEMONIC`, `KNOWLEDGE_SOURCE`, `APPEAL` (`b6a01cf`).
- **Nổi bật chỉ cho bộ công khai** (`1c2e5ff`): admin gỡ bộ thẻ về riêng tư (trực tiếp hoặc khi xử lý báo cáo) thì bỏ luôn cờ Nổi
  bật, audit `DECK_UNPUBLISH` ghi cả hai thay đổi; chủ bộ thẻ chuyển sang riêng tư cũng bỏ cờ; bật Nổi bật cho bộ riêng tư trả 400
  "Chỉ bộ thẻ công khai mới gắn được Nổi bật.". Giữ ở tầng code, không có migration (§8b b3). Chủ chuyển riêng tư thì bỏ cờ **không
  ghi audit** (thao tác của chủ); công khai lại không tự gắn lại Nổi bật. Dữ liệu cũ (bộ riêng tư đang mang cờ) **không được dọn**:
  admin chỉ bỏ được cờ (ô Nổi bật khoá theo cờ đã lưu; gửi lại `featured=true` cho bộ đã có cờ vẫn 200, không đổi gì; IT
  `legacy_private_featured_deck_stays_editable_and_can_be_unflagged`).
- **Form admin báo lỗi tiếng Việt** (`faf028b`, `3b0bfcb`): lọc nhật ký (ID người thao tác, ngày chưa đủ, khoảng ngày ngược), hạn
  mức riêng, cấu hình (số thập phân), tải nguồn tri thức, hạn Pro (năm 5 chữ số). Ô ngày chỉ lên URL khi gõ xong / rời ô / bấm "Lọc".
- **Health không treo** (`638b963`): `GET /api/admin/health` gọi ai-service với hạn chót 3 giây cho cả lời gọi (kể cả phân giải
  DNS); kiểm trực tiếp (lúc ai-service đang chạy, `aiService=ok`) trả về trong 0,08 s; trường hợp DNS chậm do
  `AiServiceClientHealthTest` và `AdminStatsIT` kiểm.

13 khoá cấu hình:
- 4 khoá cũ: hạn mức free / premium, thông báo, mở đăng ký.
- 3 khoá lộ trình: trần mặc định, ngưỡng qua quiz, giờ nhắc.
- 6 khoá AI / xác thực: `ocr_fallback_confidence`, `ocr_low_line_confidence`, `distractor_min_confidence`,
  `contradiction_alert_threshold`, `ai_model_primary`, `email_verification_required`.
- Khoá `ai_model_primary` **có tác dụng từ `3350f71`**: backend đọc lúc gọi (`SettingsService.aiModelPrimary`, trống / lỗi → null)
  và gửi kèm OCR dự phòng Gemini, dịch nghĩa và sinh mẹo nhớ; ai-service chỉ nhận model trong danh sách cho phép, tên lạ thì dùng
  `GEMINI_MODEL` (§3.4). Lưu tên lạ vẫn được (200, giao diện chỉ cảnh báo; §7.2). Mẹo nhớ ghi model thật đã viết vào
  `kanji_mnemonics.generated_model`.

### 3.4 ai-service

Diff `de8accb..HEAD` của ai-service: 74 file, +45 198 / −375. Số router tăng từ 5 lên 9. Router mới: `kanji_info_router`,
`radical_router` (prefix `/radicals`), `grammar_router`, `mining_router`.

| Nhóm | Endpoint mới | Module |
|---|---|---|
| Phương án nhiễu (C2, C3) | `POST /api/extract/distractors` | `kanji_similar.py`, `distractors.py` |
| Mâu thuẫn (F2) | `POST /api/extract/conflicts`; mọi item trả `docReading` / `docMeaningEn` / `docLevel` (`1d1c5e2`) | `conflicts.py` |
| Viết Kanji (E2) | `GET /api/kanji/{ch}/strokes`, `POST /api/kanji/score` (`/kanji/score-stroke` giữ làm alias deprecated) | `stroke_score.py`, `kanjidata.py` |
| Trọng âm (E4) | `GET /api/audio/pitch-reference`, `POST /api/audio/pitch-score` (bỏ route giả lập `/audio/evaluate-pitch`) | `pitch.py` |
| Hán–Việt, On/Kun (F1, C5) | `GET /api/kanji-info/han-viet-graph`, `/han-viet-suggest`, `POST /kanji-cards` | `han_viet_graph.py`, `kanji_cards.py`, `kanji_meanings.py` |
| Bộ thủ, mẹo nhớ (C4) | `GET /api/radicals`, `GET /api/radicals/{no}/kanji`, `POST /api/radicals/cards` | `radicals.py`, `radicals_214.csv` |
| Chia thể (C7), i+1 (C6) | `POST /api/grammar/conjugation-quiz`, `GET /api/grammar/health`, `POST /api/mining/i-plus-one`, `/for-terms`, `GET /api/mining/health` | `conjugate.py`, `sentence_mining.py` |

Thay đổi khác:
- Mọi router có khoá nội bộ `X-Internal-Key` (`app/core/security.py`). Khoá để trống thì không kiểm tra.
- Bóc tách chính xác hơn: tách furigana (B3), giữ danh từ ghép (B4), chọn cách đọc theo ngữ cảnh với `heteronyms.yaml` (B5),
  cấp JLPT cho cả tài liệu kèm phân bố % (B6).
- Ngưỡng OCR dự phòng được truyền theo từng request.
- **Model Gemini theo từng request** (`3350f71`, cho `ai_model_primary`): `POST /api/extract/text` nhận trường form `gemini_model`,
  `POST /api/extract/enrich` và `POST /api/radicals/cards` nhận `geminiModel` (JSON); `/radicals/cards` trả thêm `model` (model thật đã
  viết mẹo). Chỉ nhận model trong `allowed_models()` = `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `GEMINI_ALLOWED_MODELS` (biến môi
  trường mới, cách nhau dấu phẩy; đã ghi vào `.env.example` và README) và `KNOWN_MODELS` = `gemini-3.8-flash`, `gemini-3.7-flash`
  (hai model đã đo với key dự án). Tên lạ → dùng `GEMINI_MODEL`, ghi log một lần, không trả 422. Chuỗi khi lỗi: model được chọn (thử lại
  429 / 503) → `GEMINI_MODEL` → `GEMINI_FALLBACK_MODEL`; model được chọn bị Google trả 404 thì lượt đó về `GEMINI_MODEL` và bỏ qua
  model đó 30 phút (`UNUSABLE_S`); cầu dao quota theo từng model. `/extract/health` trả thêm `geminiModel`, `geminiModels`.
- Health thêm các cờ thành phần.
- Dữ liệu:
  - `build_dicts.py --only` nhận thêm `unihan_rs | unihan_def | kanjivg | kradfile | pitch`.
  - Thêm 6 file dữ liệu đã commit, trong đó có `kanji_meaning_overrides.csv`, `unihan_definitions.csv`,
    `jlpt_meaning_overrides.csv`.
  - `han_viet_overrides.csv` thêm 726 mục.
  - Mục JLPT gộp nhiều biến thể ("高校; 高等学校") được tách thành mục riêng (`467fd8e`).
- Tách chương theo bài (`7f66b34`, `4a4a409`, `f1cdf53`): xem §3.1 dòng "Chương đúng theo bài của giáo trình". Bước kiểm "bài cuối có
  phải là ghi chú không" dùng Sudachi; không có Sudachi thì quay về cách cũ (không nhận thêm bài cuối nào).

### 3.5 Frontend

Diff `de8accb..HEAD` của frontend: 213 tệp, +25 356 / −1 484, trong 17 commit (`174135e`, `b6a01cf`, `d2c42c7`, `4e1143f`,
`dc350b7`, `20a2331`, `faf028b`, `74f97cc`, `3b0bfcb`, rồi chiều 20/10 `8de6ea1`, `4232a4b`, `3350f71`, `d5e3c41`, `657d383`,
`ff82190`, `d1a581e`, `a0094a3`).
- **Route mới (10)**: `/verify-email`, `/han-viet`, `/kanji`, `/session` và 6 route admin.
- **Feature mới (5)**: `hanviet`, `insights`, `kanji`, `practice`, `quiz`.
- **Self-check**: thêm 6 module (`admin`, `learner`, `practice`, `quiz`, `manual`, `learningPath` (`d5e3c41`, async)), tổng khoảng
  835 lời gọi assert (đếm tĩnh; khoảng 780 ở `3b0bfcb`). Ở `de8accb` là khoảng 175.
- **Lỗi từ server**: hiện đúng thông báo của server thay vì câu chung theo mã HTTP (`d2c42c7`).
- **Màn 375 px**: header, bảng và biểu đồ admin cùng trang `/quiz` không còn tràn ngang.
- **Dependency mới**: 0.
- **Sửa sau kiểm trực tiếp 20/10** (`20a2331`, `faf028b`, `74f97cc`, `3b0bfcb`): chip hoàn thành không lặp, banner Thư viện, form
  admin tiếng Việt, nhãn biểu đồ không bị cắt, bản nháp khoá ô khi đang dịch lại nghĩa, thẻ thư mục không tràn ở 1024 px, đăng xuất
  rồi đăng nhập tài khoản khác không vào trang của người trước.
- **Chiều 20/10**:
  - Lộ trình: trạng thái "Trống", dải "Chưa đạt N% — Làm lại", câu thông báo nhắc làm lại (`8de6ea1`); `lib/inFlight.ts` `runOnce`
    chống bấm đúp, dải `DeckPathNotice` (spec LP-15) (`d5e3c41`); hỏi "Nộp bài đang làm dở?" trước khi kiểm tra chương nộp thay lượt
    đang mở, "Chưa có chương để kiểm tra" khi tổng 0 (`657d383`).
  - Admin: cột "Lý do khoá (lúc gửi)" + `ResolveAppealModal` theo trạng thái khoá mới nhất (`4232a4b`); gợi ý / cảnh báo "Model AI
    chính" (`3350f71`); thẻ "Lộ trình học tập" ở Tổng quan (`d5e3c41`).
  - Màn hẹp: khung thông báo nằm trong màn hình ở 320–639 px, header không tràn ở 320 px (`ff82190`); tiêu đề "Bộ thẻ đang học", nút
    "Mục tiêu học tập" (`d1a581e`), banner ôn tập và nhãn "Bảng điều khiển học viên" (`a0094a3`) không còn xuống dòng từng chữ ở
    320–1280 px.

### 3.6 Hạ tầng, dữ liệu, test

| Migration | Nội dung |
|---|---|
| V20 `learning_paths_v2` | `learning_path_cards`; `daily_cap`, `study_days`, `reminder`, `completed_at`, `last_rebalanced_at`; quiz chương; `review_logs.reaction_ms` / `path_id`; 3 khoá lộ trình; tạo lại CHECK `learning_paths.source_type` (thêm `'remedial'`) và CHECK `app_settings` (tra `pg_constraint`). **Không backfill** `learning_path_cards` cho lộ trình 1.0 (§8b b3) |
| V21 `ai_settings_and_reminder` | `last_reminded_on`; 6 khoá AI / xác thực; tạo lại CHECK `app_settings` (tra `pg_constraint`) |
| V22 `quiz_types_and_bank` | `flashcards.pos` / `distractors`; `quiz_questions`, `question_flags` |
| V23 `practice_logs` | Nhật ký luyện tập; index `quiz_results(user_id, created_at)` |
| V24 `email_verification` | `users.email_verified_at` (tài khoản cũ coi như đã xác thực), `email_verification_tokens` |
| V25 `kanji_mnemonics` | Mẹo nhớ PENDING / APPROVED / REJECTED |
| V26 `extraction_conflicts` | `extraction_items.conflicts`, `doc_reading`, `doc_meaning_en` |
| V27 `account_appeals` | Khiếu nại; mỗi email chỉ có 1 khiếu nại OPEN |
| V28 `knowledge_sources` | Nguồn tri thức chuẩn |
| V29 `appeal_locked_reason_snapshot` (20/10 chiều, `4232a4b`) | `ALTER TABLE account_appeals ADD COLUMN IF NOT EXISTS locked_reason_at_submit text` (nullable, không backfill, không CHECK; `IF NOT EXISTS` để cột đã có sẵn trên DB dùng chung không làm Flyway thất bại). `NULL` = khiếu nại gửi trước V29, `''` = lúc gửi bị khoá không ghi lý do. `MigrationUpgradePathTest` kiểm V29 chạy được khi cột đã có. Khác hẳn bản V29 "Nổi bật" đã bỏ sáng 20/10 (§8b b3) |

Số liệu backend (`de8accb..HEAD`):
- Mã chính: 146 tệp, +11 997 / −469. Có 58 endpoint mới: 37 cho người học / công khai, 21 cho admin (đợt chiều 20/10 không thêm
  endpoint, chỉ thêm trường và đổi hành vi, §3.7).
- Test: 51 tệp, gồm 27 lớp mới (14 IT, 13 unit; mới nhất `AiServiceClientGeminiModelTest`). Thêm 270 `@Test`, không xoá test nào.
- Không thêm TODO / FIXME nào.

Cách làm: backend đợt 2 chạy song song 3 làn trong worktree (`wave2/quiz`, `wave2/practice-auth`, `wave2/content`), gộp
`--no-ff` không xung đột, rồi thêm một commit tích hợp. Các worktree đã gỡ; 3 nhánh `wave2/*` vẫn còn và đã nằm trong HEAD.

### 3.7 Thay đổi không tương thích ngược

Cần báo khi gộp vào `main` hoặc khi nhánh khác của nhóm gọi các API này:
- `POST /api/auth/register` trả JSON `{message, needsVerification}` (trước đây là chuỗi).
- Tài khoản chưa xác thực email (khi `email_verification_required = true`, mặc định): đăng nhập trả 403 kèm
  `code: EMAIL_NOT_VERIFIED`, refresh trả 401 (`RefreshTokenService`), `JwtAuthenticationFilter` chặn token. Staff không bị chặn.
- `DELETE` lộ trình đang PROCESSING trả 409 ("Đang xử lý, hãy chờ xong rồi xoá.").
- ai-service: bỏ `POST /api/audio/evaluate-pitch`; `/api/kanji/score-stroke` thành alias deprecated của `/api/kanji/score`.
- ai-service: khi đặt `AI_SERVICE_KEY`, mọi router đều đòi header `X-Internal-Key`.
- Bản nháp lộ trình (20/10, `fb656a8`): "Gộp vào chương trước" vào một chương "Ngày N" tự sinh trả 400 (chương "Ngày N" được tính lại
  ở mọi thao tác nên gộp tay không giữ được; đặt tên riêng cho chương trước rồi gộp). Khi đang "Dịch lại nghĩa", `PATCH /{id}` đổi
  số ngày / trần và `PATCH /{id}/chapters/{cid}` (đổi tên chương) của **mọi** bản nháp (có chương hay không) trả 409 "Đang dịch lại
  nghĩa, hãy chờ xong." (mới ở `fb656a8`; sửa item, gộp chương và kích hoạt đã trả 409 từ trước; tên, ngày bắt đầu, ngày học, nhắc
  vẫn sửa được; giao diện khoá các ô này).
- `PATCH /api/admin/decks/{id}/flags` bật `featured=true` cho bộ không công khai **chưa có cờ** trả 400 "Chỉ bộ thẻ công khai mới
  gắn được Nổi bật." (`1c2e5ff`); bộ riêng tư còn sót cờ từ dữ liệu cũ thì gửi lại `featured=true` vẫn 200 và không đổi gì, chỉ bỏ
  cờ được. Admin gỡ về riêng tư và chủ chuyển riêng tư đều bỏ cờ Nổi bật.
- `GET /api/learning-paths/{id}` của bản nháp không có chương có thể **ghi** (chuẩn hoá bố cục cũ) khi chính chủ mở, chỉ khi bố cục
  khác (`4fce06b`). "Bố cục cũ" gồm cả các lần "Gộp vào chương trước" vào chương "Ngày N" làm bằng code trên origin (`de8accb` đã có
  `merge-up`): khi chính chủ mở, các lần gộp đó bị tách lại về bố cục chuẩn (giữ id chương còn lại). Người khác / staff GET thì không
  ghi (404 / 403).
- Chiều 20/10:
  - `chapters[].state` có thêm giá trị `"empty"` (chương ACTIVE hết thẻ trong lịch mà chưa qua; thứ tự passed > empty > review > current >
    locked > open); `POST /{id}/chapters/{cid}/quiz` trên chương rỗng trả 409 (`8de6ea1`). Client chỉ biết 5 giá trị cũ phải xử lý.
  - Loại thông báo mới `LEARNING_PATH_CHAPTER_RETRY` (payload `pathId`, `pathTitle`, `chapterId`, `chapterTitle`, `pct`, `passPct`; chỉ
    lượt trượt đầu tiên của mỗi chương; cột `type` không có CHECK nên không cần migration) (`8de6ea1`).
  - `GET /api/learning-paths/{id}` (ACTIVE) trả thêm `quizPassPct` (đọc `app_settings` mỗi request; danh sách / `today-summary` không
    trả) (`8de6ea1`). `completion.chaptersTotal` chỉ đếm chương đã qua hoặc ra được đủ min(10, số thẻ) câu nghĩa, nên có thể nhỏ hơn
    số chương (`657d383`).
  - `POST /{id}/chapters/{cid}/quiz` **luôn** trả lượt exam của chương: lượt practice / exam ít câu đang mở trên bộ đó bị nộp thay
    (chấm câu đã làm như hết hạn, có dòng `quiz_results`) rồi mới mở đề mới; đề mới cũng thiếu câu thì trả lại lượt đang mở. Trước đây
    trả bất kỳ lượt mở nào (`657d383`, NEW-17).
  - `PATCH /api/admin/users/{id}` `{locked:true, lockedReason:X}` trên tài khoản đã khoá: X không rỗng và khác lý do hiện tại → đổi lý
    do, audit `USER_LOCK_REASON` (`lockedReason {before, after}`), giữ `lockedAt`, không thu hồi phiên lần nữa; X rỗng / thiếu / trùng
    vẫn là no-op; tài khoản đã tự xoá → 409. Trước đây 200 mà lặng lẽ giữ lý do cũ (`177d764`, NEW-19).
  - Trường mới trong response: `AppealResponse.lockedReasonAtSubmit` (`4232a4b`; vắng = khiếu nại trước V29), `GET /api/admin/health`
    `aiModels {default, allowed}` (null khi ai-service tắt) (`3350f71`), `quizPassPct` ở trên.
  - ai-service: `/extract/text` nhận `gemini_model`, `/extract/enrich` và `/radicals/cards` nhận `geminiModel`; `/radicals/cards` trả
    thêm `model`; `/extract/health` thêm `geminiModel` / `geminiModels` (`3350f71`, §3.4). Chỉ thêm trường, client cũ không bị ảnh hưởng.
  - Mốc thời gian trong response của các lần ghi (khoá, Premium, cài đặt, câu hỏi, ôn tập, quiz, bóc tách, lộ trình, mẹo nhớ, luyện
    tập) làm tròn tới micro giây, trùng với lần đọc sau (`5a09e31`, NEW-22). `premiumUntil` gửi lại cùng hạn nay là no-op: trước đây
    giá trị …59.999999999Z bị DB làm tròn lên giây sau nên sinh thêm audit `USER_PREMIUM` và thông báo.

Nguồn: [hợp đồng API đợt 2](../Plan/specs/2026-10-19-hop-dong-api-dot-2.md) §3, `audio_praat_router.py`, `kanji_dtw_router.py:158`,
`app/core/security.py`.

## 4. Bảng phủ yêu cầu 1.2.1

Đối chiếu với mục "1.1.1. Yêu cầu về chức năng" (đoạn a–g) của `D:\University\PBL6\Yêu cầu chức năng.docx`.

Chú thích trạng thái:
- **Xong**: chạy được, có test tự động.
- **Xong ≠1.3**: chạy được nhưng làm khác cách mô tả ở mục 1.3 (có chủ đích, theo quyết định đã chốt).
- **Một phần**: còn thiếu phần ghi trong cột "Cách đáp ứng".
- "(cũ)": đã có trước đợt này.
- †: phần dùng dịch vụ ngoài (SMTP thật, Tesseract `jpn` / `jpn_vert`, Gemini) **chưa từng chạy thật trên máy này** (§6.2).

| Mã | Yêu cầu | Cách đáp ứng | Trạng thái | Bằng chứng |
|---|---|---|---|---|
| A1 | Đăng ký + xác thực email | Link 24 giờ, đăng nhập 403 `EMAIL_NOT_VERIFIED`, gửi lại, admin xác thực hộ, khoá `email_verification_required` | Xong † | V24, `EmailVerificationService`, `VerifyEmailPage.tsx`, `f125265` |
| A2 | Đăng nhập / đăng xuất | JWT 15 phút + refresh 3 ngày, claim `pcv` | Xong (cũ) | V7, `18d295a` |
| A3 | Quên / đổi mật khẩu | Link 30 phút, SMTP thật | Xong (cũ) † | V6, `PasswordResetService` |
| A4 | Hồ sơ, cấp JLPT | Cấp JLPT là mặc định cho bóc tách, lộ trình, i+1 | Xong | `PUT /api/auth/jlpt-level` |
| A5 | Dashboard cá nhân | Ngày học, đến hạn, thẻ mới, đã học / đã thuộc, chuỗi ngày theo múi giờ | Xong | `GET /api/reviews/activity`, `f125265`, `174135e` |
| B1 | Tải tài liệu, xử lý bất đồng bộ | Ảnh / TXT / MD / DOCX / PDF, worker `@Async`, hạn mức | Xong (cũ) | V12, `ExtractionWorker` |
| B2 | OCR chữ dọc | Tesseract `jpn` / `jpn_vert`, deskew / OSD, dự phòng **Gemini Vision** theo `ocr_fallback_confidence`. Manga / light novel: chưa xác minh | Xong ≠1.3 † | `image_reader.py`, `ExtractionService` |
| B3 | Tách furigana | PDF theo cỡ chữ / vị trí; OCR ruby trong dòng | Xong | `pdf_reader.py`, `image_reader.py`, `6a55d55` |
| B4 | Tách từ | SudachiPy mode C / A, giữ danh từ ghép, 日本 → にほん | Xong | `tokenizer.py`, `7cc8840` |
| B5 | Furigana, khử nhập nhằng | `readingSegments`, `heteronyms.yaml` (còn 1 xfail 一日中) | Xong | `heteronyms.py`, `6a55d55` |
| B6 | Phân tầng JLPT tài liệu | `levelPct`, `overallLevel`, tách mục nhiều biến thể | Xong | `pipeline.py`, `LevelDistributionBar.tsx`, `467fd8e` |
| C1 | Flashcard kèm Hán–Việt | Unihan + 726 mục sửa tay; nghĩa tiếng Việt dịch bằng Gemini | Xong † | `han_viet_overrides.csv`, `7cc8840` |
| C2 | Nhiễu Kanji giống hình | KRADFILE + bộ thủ / số nét (không dùng IDS + Levenshtein) | Xong ≠1.3 | `kanji_similar.py`, `48c1a33` |
| C3 | Nhiễu đồng âm | JMdict + JLPT | Xong | `distractors.py`, `48c1a33` |
| C4 | Thẻ theo bộ thủ, mẹo nhớ AI có duyệt | 214 bộ thủ; Gemini + mẫu dự phòng; mẹo ở PENDING tới khi admin duyệt | Xong † | V25, `e0ce4d4` |
| C5 | Thẻ On / Kun tách riêng | `/api/nlp/kanji-cards`, trang `/kanji` | Xong | `kanji_cards.py`, `KanjiLookupTab.tsx` |
| C6 | Câu i+1 | Câu chỉ có đúng 1 từ chưa biết; chỉ tìm trong tài liệu của người học | Xong | `sentence_mining.py`, `IPlusOneController` |
| C7 | Câu hỏi chia thể động từ | 12 dạng: 10 thể + kính ngữ お〜になる / khiêm nhường お〜する; dùng câu mẫu khi tài liệu không có câu phù hợp | Xong | `conjugate.py`, `48c1a33` |
| D1 | CRUD bộ thẻ | Có thư mục lồng nhau, nhập theo lô | Xong (cũ) | `DeckController`, `FolderController` |
| D2 | Chia sẻ bằng liên kết | Link `/decks/{id}` theo quyền Công khai / mời / thư mục; link riêng `/d/<token>` (`share_token`, D9, thêm 26/10) | **Xong** (26/10) | `ShareDeckModal.tsx`, `DeckShareLinkService.java`, `DeckShareLinkIT` |
| D3 | Sao chép bộ thẻ | Từ loại và phương án nhiễu được chép theo | Xong | `POST /api/decks/{id}/clone` |
| D4 | Tìm bộ thẻ công khai | Lọc theo từ khoá / cấp / chủ đề, sắp xếp, chấm sao | Xong (cũ) | `GET /api/library/decks` |
| E1 | SRS + đo phản xạ | **SM-2 rút gọn** (không phải FSRS). `reactionMs` được ghi lại nhưng không vào công thức lịch | Xong ≠1.3 | `SrsService`, `ReviewService`, V20 |
| E2 | Viết Kanji, chấm DTW | KanjiVG, lấy mẫu 32 điểm / nét, chấm từng nét | Xong | `stroke_score.py`, `KanjiCanvas.tsx` |
| E3 | Luyện phát âm | Web Speech API (D3), không lưu âm thanh | Xong ≠1.3 | `PronunciationPanel.tsx`, `lib/asr.ts` |
| E4 | Trọng âm cao thấp | F0 bằng WebAudio, mẫu kiểu từ điển kanjium; **chưa có mẫu NHK / giọng bản xứ** | **Một phần** | `pitch.py`, `lib/pitch.ts`, UC-33 `[~]` |
| E5 | Chế độ chỉ nghe | Ẩn chữ, tự đọc, phím R để nghe lại; chưa điều khiển bằng giọng | Xong | `lib/audioOnly.ts` |
| E6 | Quiz gõ IME romaji → kana | Bộ chuyển tự viết, server chuẩn hoá kana | Xong | `KanaInput.tsx`, `KanaUtil` |
| F1 | Bản đồ Hán–Việt | Chỉ mục trong bộ nhớ (không Neo4j) | Xong ≠1.3 | `han_viet_graph.py`, `/han-viet` |
| F2 | Cảnh báo mâu thuẫn | So từng trường với từ điển + nguồn chuẩn, có độ tin cậy (không NLI); chưa so giữa các tài liệu của người học | Xong ≠1.3 | `conflicts.py`, V26, UC-36 `[~]` |
| F3 | Lộ trình đề xuất | Lộ trình 2.0 dựa trên luật + dữ liệu ôn (không dùng knowledge tracing); kiểm tra chương gắn nhãn + nhắc "Chưa đạt N% — Làm lại" (quyết định D4, `8de6ea1`) | Xong ≠1.3 | §3.1 |
| F4 | Ma sát trí nhớ | Phản xạ > max(4 000 ms, 2 × trung vị cá nhân) | Xong | `/api/insights/friction` |
| G1 | Quản lý người dùng, khiếu nại | Quy tắc bậc, audit, khiếu nại, chặn thao tác trên tài khoản đã xoá | Xong | V27, `580568a` |
| G2 | Duyệt mẹo nhớ | Duyệt / từ chối có ghi chú, thông báo cho tác giả | Xong | `AdminMnemonicController` |
| G3 | Ngân hàng câu hỏi | Xem / sửa / ẩn / bỏ ẩn, xử lý báo lỗi | Xong | V22, `AdminQuestionController` |
| G4 | Nguồn tri thức chuẩn | Bảng tham chiếu có phiên bản, lưu trữ / kích hoạt (không dựng đồ thị) | Xong ≠1.3 | V28, `AdminKnowledgeSourceController` |
| G5 | Tham số AI | 4 ngưỡng, đọc lại DB ở mỗi lần gọi (không broadcast); `ai_model_primary` có tác dụng từ `3350f71` (OCR dự phòng, dịch nghĩa, mẹo nhớ; ai-service chỉ nhận model trong danh sách cho phép) | Xong ≠1.3 † | V21, `SettingsService`, `gemini.py`, `AiServiceClientGeminiModelTest` |
| G6 | Thống kê hệ thống | Hiệu suất từng engine, bước dịch nghĩa, chuỗi OCR theo ngày. "Tỷ lệ lỗi OCR" là tỷ lệ job thất bại, không phải CER | Xong | `AdminStatsService`, `d7b9955` |
| G7 | Báo cáo vi phạm | Xử lý / bỏ qua, gỡ khỏi Thư viện | Xong (cũ) | `AdminReportController` |

Tổng: 39 yêu cầu → 37 chạy được (9 yêu cầu Xong ≠1.3: B2, C2, E1, E3, F1, F2, F3, G4, G5) và 2 Một phần (D2, E4).
Nếu chấm theo đúng chữ của 1.2.1 thì E1 (nêu FSRS) là "khác yêu cầu".

Ngoài phạm vi 1.2.1, không làm: thanh toán (UC-40), Google OAuth, GraphRAG / Neo4j (UC-34, UC-35), ASR / Praat phía server.
UC-29 (xuất bộ thẻ ra Anki / CSV / PDF) cũng chưa làm.

### 4.1 Yêu cầu phi chức năng ("1.1.2" trong file docx): trạng thái

Không nằm trong phạm vi được giao (chỉ 1.2.1), ghi lại để khỏi bị hiểu là đã đạt.

| Nhóm | Chỉ tiêu trong docx | Hiện trạng |
|---|---|---|
| Hiệu năng | Báo trạng thái qua WebSocket; tương tác < 300 ms; 10 trang < 2 phút | Không có WebSocket / SSE (grep = 0); frontend polling 2 giây (`ExtractionPage.tsx`, `RoadmapDetailPage.tsx`). Độ trễ: chưa đo |
| Độ chính xác AI | OCR ≥ 95 % (CER ≤ 0,05); câu nhiễu sai < 3 %; NLI precision ≥ 90 % | Chưa đo (`ai-service/scripts/ocr_eval.py` có sẵn nhưng máy này không có `jpn`); không làm NLI |
| Bảo mật | bcrypt, token có hạn + thu hồi, ghi âm mã hoá, RBAC; JWT ≤ 24 giờ | Đạt: bcrypt (`SecurityConfig`), JWT 15 phút (`jwt.expiration=900000`), thu hồi phiên, RBAC. Không lưu ghi âm. HTTPS là việc lúc triển khai |
| Mở rộng, sẵn sàng | Vi dịch vụ; uptime ≥ 99,5 %; tự chuyển engine OCR / TTS | 3 dịch vụ tách; OCR dự phòng Gemini có; TTS là `speechSynthesis` của trình duyệt, không có dự phòng. Tải, uptime: chưa đo |
| Bảo trì | Test tự động pipeline lõi; độ phủ ≥ 70 % | Có test (§6.1); độ phủ chưa đo (không có JaCoCo / coverage trong pom, `package.json`, CI) |
| Dùng được, tương thích | Responsive ≥ 3 kích thước; IME tích hợp; Chrome / Edge / Safari | Kiểm 3 kích thước: 1280 và 375 px trên các trang chính; 1024 px chỉ ở các lượt kiểm trực tiếp 20/10, trên dashboard, lộ trình, thư viện và các trang admin tổng quan / nhật ký; chiều 20/10 dashboard và khung thông báo được đo thêm ở 320 / 414 / 640 / 768 / 900 px; IME romaji → kana có (`KanaInput.tsx`); Edge / Safari: chưa xác minh |
| Quan sát | Metric từng bước pipeline; dashboard ≤ 1 phút / lần | G6 có số liệu theo engine và chuỗi OCR theo ngày; trang tổng quan chỉ làm mới khi bấm nút, không tự cập nhật |
| Chi phí | Ưu tiên self-host; giảm ≥ 60 % lượt gọi API trả phí | SudachiPy / Tesseract chạy local, Gemini chỉ gọi khi cần; con số 60 %: chưa đo. Không dùng VOICEVOX |

## 5. Dòng thời gian commit (19–20/10/2026)

Mốc so sánh là `de8accb` "update Admin site" (= `origin/backend-feature-learnmode`). Giờ lấy theo `git log`. Nguồn số liệu của 10
commit chiều 20/10 (`8de6ea1`..`a0094a3`): commit message, log Maven trong scratchpad (`mvn_full.log` 520, `mvn-full2.log` 525,
`full-suite.log` 528) và workflow `wf_6b3512b6-0f3` (làm nốt phần thiếu), `wf_9c24c580-d98` (kiểm trực tiếp), `wf_b003b035-2e7`
(sửa NEW-17..20), `wf_5aec64e5-42f` (kiểm trực tiếp), `wf_ea36e4ab-315` (sửa NEW-21, NEW-22), `wf_fde9856d-ce2` (chỉnh dashboard);
đều ngoài repo.

Nguồn của cột "Kiểm chứng": `6a55d55`, `e6312d3`, `174135e`, `f125265`, `48c1a33`, `e0ce4d4`, `d7b9955` và `580568a` có ghi trong
commit message. Số của `bc72a91` lấy từ [file tiến trình](2026-10-19-tien-trinh.md). Số của `4e1143f`, `7cc8840`, `538d2ab`,
`dc350b7`, `409f4b4` và `467fd8e` lấy từ báo cáo của agent trong workflow `wf_39690e9d-79f` / `wf_e8322dc7-514`; số của 12 commit
ngày 20/10 (`7f66b34`..`f1cdf53`) lấy từ `wf_ca1403e7-2bf`, `wf_b6355b1d-a62`, `wf_c9fcbd9a-4b5`, `wf_ba8d78af-021`. Tất cả nằm
ngoài repo (`~/.claude/projects/...`), nên người khác không kiểm lại được bằng git. Lần chạy đầy đủ 510 test (§6.1) thì có log riêng
(`scratchpad\full.log`).

| Commit | Giờ | Phần | Nội dung | Kiểm chứng |
|---|---|---|---|---|
| `6a55d55` | 16:53 | ai-service | Bóc tách chính xác hơn; nhiễu Kanji / đồng âm, mâu thuẫn, DTW, trọng âm, Hán–Việt, On/Kun, bộ thủ, chia thể, i+1, khoá nội bộ | pytest 1235 passed, 2 skipped, 1 xfailed |
| `e6312d3` | 18:18 | backend | Lộ trình 2.0 (V20, V21), insights, bổ khuyết, nhắc học, tham số AI, proxy NLP | mvn test 326/326 |
| `bc72a91` | 18:19 | backend | `AiServiceClient.getJson/postJson/postJsonLong` dùng chung | AiServiceClientNlpTest 4/4 |
| `174135e` | 18:35 | frontend | Toàn bộ giao diện cho các chức năng mới (đợt 1 + 2) | lint + build + selfCheck xanh |
| `f125265` | 20:03 | backend (làn practice-auth) | Luyện tập, xác thực email, khiếu nại, hoạt động (V23, V24, V27) | 44 test mới; kết quả cả suite không ghi trong commit |
| `48c1a33` | 20:20 | backend (làn quiz) | Quiz đa loại, ngân hàng câu hỏi, báo lỗi, admin (V22) | 374/375; 1 test trượt do DNS của máy |
| `e0ce4d4` | 20:27 | backend (làn nội dung) | Mẹo nhớ, mâu thuẫn, nguồn chuẩn, i+1 (V25, V26, V28) | 368/369; 1 test trượt do DNS của máy |
| `b1be63a` `3cdebbd` `0cde82f` | 20:28–20:29 | merge | Gộp 3 làn `--no-ff` | — |
| `d7b9955` | 21:06 | backend | Tích hợp: thống kê admin, hiệu suất AI, health engines, ma trận phân quyền | **mvn -B test 490/490** |
| `b6a01cf` | 21:18 | frontend | Khớp hợp đồng: loại thông báo mới, nhãn audit | Không ghi trong commit |
| `1d1c5e2` | 21:46 | ai-service | Mọi item trả `docReading` / `docMeaningEn` / `docLevel` | Test mới trong `test_pipeline.py`, `test_router.py` |
| `d2c42c7` | 21:47 | frontend | Hiện đúng lỗi server, nhãn tài khoản đã xoá, chống tràn bảng admin | Thêm self-check |
| `5172ddc` | 21:47 | docs (tracked) | README: tính năng, tải dữ liệu, SMTP, xác thực email; `.env.example`; data README | — |
| `580568a` | 21:49 | backend | Chặn thao tác trên tài khoản đã xoá, từ chối email `@deleted.local` | AdminUserIT, AppealIT, SelfDeleteIT, KnowledgeSourceIT |
| `4e1143f` | 23:10 | frontend | Sửa 29 lỗi kiểm tay (LC-04..12, LP-03..07 và LP-09..11, STAFF-02..13) | lint + build + selfCheck xanh (báo cáo của agent sửa lỗi) |
| `7cc8840` | 23:11 | ai-service | Sửa LC-01 (Hán–Việt), LC-02 (nghĩa Kanji), LC-03 (日本) | pytest 1290 passed, 2 skipped, 1 xfailed |
| `538d2ab` | 23:24 | backend | Sửa LP-01, LP-02, LP-08, STAFF-01 (CORS), STAFF-14 | **mvn test 496 test / 69 lớp, 0 lỗi** |
| `dc350b7` | 23:51 | frontend | Sửa LP-10 (widget), NEW-01 (/quiz tràn ngang), NEW-02 (nhãn Thư viện) | lint + build + selfCheck xanh |
| `409f4b4` | 23:53 | backend | `today-summary` có `completedAt` + `done` (LP-10) | LearningPathIT 44/44, LearningPathReminderJobTest 3/3 |
| `467fd8e` | 23:54 | ai-service | Tách mục JLPT nhiều biến thể, sửa 3 nghĩa sai (LC-11) | pytest 1296 passed, 2 skipped, 1 xfailed; ở `467fd8e`: mvn 497/497 (§6.1) |
| `7f66b34` | 20/10 01:38 | ai-service | NEW-03: nhận tên bài bắt đầu bằng chữ trùng trợ từ ("第1課 はじめまして") khi có dấu tách hoặc khớp dãy số bài (cả dòng OCR dính liền); vẫn loại "第1課 を復習しましょう", "Lesson 1 の練習" | pytest 1301 passed, 2 skipped, 1 xfailed |
| `1f861ff` | 20/10 01:38 | backend | NEW-04: bản nháp không có chương chia lại / gộp chương "Ngày N" khi đổi số ngày, trần hoặc bỏ chọn thẻ, nên xem trước = sau kích hoạt; NEW-05: `completedAt` chính xác tới micro giây | LearningPath* 98/98 (LearningPathIT 47/47) |
| `20a2331` | 20/10 01:38 | frontend | NEW-06: bỏ chip "Đã hoàn thành" lặp; NEW-07: banner Thư viện dùng chung nhãn đánh giá; danh sách chương đang mở tải lại khi đổi ngày / trần | lint + build + selfCheck xanh |
| `4a4a409` | 20/10 04:48 | ai-service | Tách chương sau review lần 2 + 3: tiêu đề bắt đầu bằng chữ trùng trợ từ chỉ được nhận khi lấp đúng dãy số bài; trùng số → không nhận; dòng lặp trong thân bài / khoảng trắng nửa cỡ không còn là dấu hiệu tiêu đề; nhận mục lục 2 bài; không bỏ mất bài khi tiêu đề không nhận được; thuật toán tuyến tính (998 tiêu đề: 30 s → 0,05 s) | pytest 1313 passed, 2 skipped, 1 xfailed; fuzz 30 000+ tài liệu không lỗi |
| `fb656a8` | 20/10 04:48 | backend | Chương "Ngày N" của bản nháp là hàm thuần của (thẻ đã chọn, số ngày, trần): chia lại / gộp, giữ id; chương đặt tên riêng không bị nuốt; 409 khi đang dịch lại nghĩa | LearningPathIT 52/52 |
| `1c2e5ff` | 20/10 04:48 | backend | NEW-11: "Nổi bật" chỉ cho bộ công khai, giữ ở tầng code (gỡ / chuyển riêng tư thì bỏ cờ, bật cho bộ riêng tư → 400); **không có migration** (bỏ V29 "Nổi bật"; số V29 sau đó dùng cho STAFF-07 ở `4232a4b`, xem §8b b3) | AdminContentIT 12/12 |
| `638b963` | 20/10 04:48 | backend | Health ai-service có hạn chót 3 s cho cả lời gọi (kể cả phân giải DNS), trang admin không treo khi DNS chậm (lần chạy đầy đủ bắt được: DNS máy này mất ~11 s cho `ai-service.invalid`) | AiServiceClientHealthTest 4/4, AdminStatsIT 10/10 |
| `faf028b` | 20/10 04:49 | frontend | NEW-08..12: form admin báo lỗi tiếng Việt thay bong bóng trình duyệt (lọc nhật ký, hạn mức riêng, cấu hình, tải nguồn tri thức, hạn Pro), "7 ngày gần nhất" theo ngày lịch, nhãn biểu đồ OCR / "Cơ cấu Bóc tách AI" không bị cắt, "Nổi bật" theo bộ công khai, báo cáo có lời báo xử lý và tab đã xử lý không còn cột trống | lint + build + selfCheck xanh (cả TZ UTC, Los Angeles) |
| `74f97cc` | 20/10 04:49 | frontend | Bản nháp lộ trình: khoá số ngày / trần / chương khi đang dịch lại nghĩa; chỉ hiện "Gộp vào chương trước" khi hợp lệ; chương đang mở tải lại khi bố cục đổi | lint + build + selfCheck xanh |
| `4fce06b` | 20/10 06:00 | backend | Bỏ bước quét mọi bản nháp lúc khởi động (sẽ ghi vào bản nháp của mọi người trên Supabase dùng chung mỗi lần ai đó bật backend); thay bằng chuẩn hoá khi **chính chủ** mở bản nháp, chỉ ghi khi bố cục thật sự khác, bản nháp đã đúng thì đọc không khoá dòng | LearningPathIT 53/53; **mvn -B test 510 / 69 lớp, 0 lỗi** |
| `3b0bfcb` | 20/10 07:56 | frontend | NEW-14: thẻ thư mục ở dashboard không tràn ở 1024 / 1280 px; NEW-15: đăng nhập sau khi **chủ động** đăng xuất không vào trang riêng của người trước (hết phiên thì vẫn quay lại trang cũ); NEW-16: ô ngày ở Nhật ký admin chỉ lên URL khi gõ xong / rời ô / bấm "Lọc", sửa ô còn lại thì áp cả hai trong một bước | lint + build + selfCheck xanh; kiểm trên trình duyệt với API giả |
| `f1cdf53` | 20/10 08:15 | ai-service | NEW-13: dãy bài dán tay nhận đủ cả bài cuối khi tên bài bắt đầu bằng chữ giống trợ từ ("第3課 がっこう"), không còn cảnh một bài cuối yếu kéo mất cả dãy; bỏ dựa vào khoảng trắng toàn cỡ (NFKC đã đổi thành nửa cỡ); ghi chú lịch học / câu hỏi / "của bài N" ở cuối dãy không thành chương (kiểm bằng Sudachi + danh sách đóng); tiêu đề chạy đầu trang có số trang trùng với tiêu đề bài | pytest 1326 passed, 2 skipped, 1 xfailed; 5 bộ fuzz (`fuzz.py`…`fuzz5.py`, 20 000–40 000 tài liệu mỗi bộ): 0 tiêu đề giả mới, 0 mất nội dung so với mốc trước `7f66b34`; `f6.py` (20 000 tài liệu thực tế): 9 tiêu đề giả do mục lục (sách bắt đầu giữa chừng) mà bản trước (`4a4a409`) chưa sinh, 87 tài liệu ít tiêu đề hơn bản trước (bản trước tách nhầm), không mất chữ |
| `8de6ea1` | 20/10 10:17 | backend + frontend | D4: chương hết thẻ → `state=empty` ("Trống", kiểm tra trả 409); kiểm tra chương chưa đạt → dải "Chưa đạt N% — Làm lại" + thông báo `LEARNING_PATH_CHAPTER_RETRY` một lần mỗi chương; `GET /{id}` trả `quizPassPct` | LearningPathIT +2 (55); self-check; cả 4 commit `8de6ea1`..`d5e3c41`: **mvn -B test 520 / 70 lớp, 0 lỗi** (26:05 phút, trên cây làm việc ngay trước khi commit); kiểm trực tiếp `wf_9c24c580-d98` (API + giao diện 1280 / 375) |
| `4232a4b` | 20/10 10:18 | backend + frontend | STAFF-07: V29 `account_appeals.locked_reason_at_submit` (`ADD COLUMN IF NOT EXISTS`); `AppealResponse.lockedReasonAtSubmit`; cột "Lý do khoá (lúc gửi)"; `ResolveAppealModal` theo trạng thái khoá mới nhất | AppealIT +1, MigrationUpgradePathTest +1 (V29 khi cột đã có); self-check; API: snapshot giữ qua mở khoá / khoá không lý do → `''` |
| `3350f71` | 20/10 10:19 | ai-service + backend + frontend | `ai_model_primary` có tác dụng: backend gửi model cho OCR `/extract/text`, `/extract/enrich`, `/radicals/cards`; ai-service danh sách cho phép (`KNOWN_MODELS`, `GEMINI_ALLOWED_MODELS`), chuỗi model chọn → `GEMINI_MODEL` → dự phòng, 404 bỏ model 30 phút; `GET /api/admin/health` `aiModels`; gợi ý / cảnh báo ở trang Cấu hình | **pytest 1340 passed, 2 skipped, 1 xfailed**; `AiServiceClientGeminiModelTest` (lớp mới, 4 test), AdminStatsServiceTest +1, ContentAiClientTest +1, thêm kiểm trong AdminSettingsIT / AdminStatsIT / MnemonicIT; API: `aiModels` khớp ai-service, tên lạ lưu được và bị ai-service bỏ qua (chuyển model thật chỉ kiểm qua code / test vì không có khoá Gemini) |
| `d5e3c41` | 20/10 10:19 | frontend | Spec LP-13 (`runOnce` chống bấm đúp cho kích hoạt, gộp chương, cân lại, hoàn thành, thử lại, dịch lại nghĩa, kiểm tra chương và hai modal tạo; nút xác nhận của `DialogProvider` cũng chặn bấm đúp; riêng lưu cài đặt chưa qua `runOnce`, §7.2), spec LP-15 (`DeckPathNotice`, câu xác nhận xoá thẻ / bộ), thẻ "Lộ trình học tập" ở Tổng quan admin | lint + build + selfCheck xanh (module `learningPath` mới); giao diện: 3 lần bấm "Tạo lộ trình" → đúng 1 `POST …/activate` (1280, 375); dải LP-15 đúng / không nhắc bộ tự tạo; Claude tự kiểm thẻ admin |
| `657d383` | 20/10 12:30 | backend + frontend | NEW-17: kiểm tra chương luôn là bài thi của chương (lượt mở khác bị nộp thay sau hộp "Nộp bài đang làm dở?"; đề mới thiếu câu thì giữ lượt mở); NEW-18: `chaptersTotal` bỏ chương "Trống" và chương không ra đủ đề | LearningPathIT +3 (58), QuizCapabilitiesTest +1; cùng `177d764`: **mvn -B test 525 / 70 lớp, 0 lỗi** (26:56 phút); kiểm trực tiếp `wf_5aec64e5-42f` (API HIJACK, TOTAL; giao diện hộp xác nhận, đồng hồ 5 phút, đạt 80 %) |
| `177d764` | 20/10 12:31 | backend | NEW-19: admin đổi được lý do khoá của tài khoản đang khoá (audit `USER_LOCK_REASON`), khiếu nại giữ lý do lúc gửi | AdminUserIT +1; API LOCK-REASON (`wf_5aec64e5-42f`) |
| `ff82190` | 20/10 12:31 | frontend | NEW-20: khung thông báo neo mép phải màn hình dưới 640 px (trước đây lệch −46 px ở 375 px); ẩn chữ "NihonGen AI" dưới 360 px; nhóm lọc bộ thẻ xuống dòng dưới 640 px | lint + build + selfCheck xanh; đo trên trình duyệt 320 / 375 / 414 / 640 / 1280: khung luôn trong màn hình, Esc / bấm ngoài đóng được |
| `d1a581e` | 20/10 13:52 | frontend | NEW-21: tiêu đề "Bộ thẻ đang học", nhãn số bộ và nút "Mục tiêu học tập" không xuống dòng từng chữ ở 320–900 px | lint + build + selfCheck xanh; đo 320–1280 px (10 bề rộng), không cuộn ngang |
| `5a09e31` | 20/10 13:52 | backend | NEW-22: mốc thời gian làm tròn tới micro giây trước khi lưu (lockedAt, premiumUntil, updatedAt cài đặt / câu hỏi, dueAt, expiresAt, createdAt bóc tách / lộ trình / mẹo nhớ / luyện tập, activatedAt, lastRebalancedAt); `User.setPasswordChangedAt` cắt µs (token cấp ngay sau đổi mật khẩu từng bị 401 ở ~0,05 % lần) | 12 lớp test được sửa: 11 lớp so nguyên chuỗi response với lần đọc sau (9 lớp có code được sửa, cộng AppealIT / ContentReportIT kiểm hồi quy cho code không đổi), PasswordAndErrorsIT kiểm token cấp ngay sau đổi mật khẩu; +3 test (AdminUserIT, ExtractionIT, PasswordAndErrorsIT; test của PasswordAndErrorsIT trả 401 trước khi sửa); review đối kháng tìm ra lỗi `passwordChangedAt`; **mvn -B test 528 / 70 lớp, 0 failures, 0 errors, 0 skipped** (26:32 phút) |
| `a0094a3` | 20/10 13:59 | frontend | Banner ôn tập xếp theo bề rộng của chính nó (cột chữ ≥ 20rem mới đứng cạnh nút), nút "Bắt đầu" bỏ biểu tượng dưới 640 px để nút đóng không bị cắt ở 320 px; nhãn "Bảng điều khiển học viên · Trực tuyến" một dòng ở 320 px | lint + build + selfCheck xanh; đo 320 / 375 / 640 / 768 / 1024 / 1280: "Hôm nay…" tối đa 2 dòng (768 px: 4 → 1), nhãn 1 dòng (320 px: 2 → 1), không cuộn ngang |

Ở `74f97cc` (sau 9 commit đầu ngày 20/10; lần chạy thuộc đợt sửa tạo 6 commit `4a4a409`..`74f97cc`): backend `mvn -B test` 509 /
69 lớp, 0 lỗi (24:03 phút). Ở `4fce06b`: **510 test / 69 lớp, 0 failures, 0 errors, 0 skipped** (24:21 phút); ai-service lúc đó
1313 passed, 2 skipped, 1 xfailed (ở `f1cdf53`: 1326 passed); frontend lint + build + selfCheck xanh (ở `3b0bfcb`). Chiều 20/10:
backend 520 (4 commit đầu) → 525 (`657d383` + `177d764`) → **528 / 70 lớp** (`5a09e31`); ai-service **1340 passed** (`3350f71`);
frontend xanh ở `a0094a3` (§6.1).

## 6. Kiểm thử

### 6.1 Test tự động: số liệu gần nhất

| Bộ test | Lệnh | Kết quả gần nhất | Ở commit |
|---|---|---|---|
| Backend (đầy đủ) | `cd backend-core && mvn -B test` | **528 test / 70 lớp, 0 failures, 0 errors, 0 skipped**, BUILD SUCCESS, 26:32 phút (xong 13:52 ngày 20/10) | `5a09e31` (`a0094a3` sau đó không đụng backend) |
| ai-service | `venv\Scripts\python.exe -X utf8 -m pytest -q` | **1340 passed, 2 skipped, 1 xfailed**, 1 cảnh báo cũ (starlette/httpx) | `3350f71` (các commit sau không đụng ai-service) |
| Frontend | `npm run lint && npm run build && node --experimental-strip-types scripts/selfCheck.ts` | lint thoát 0; build xanh (chỉ còn cảnh báo chunk lớn có từ trước); "All self-check assertions passed successfully!" (với TZ mặc định của máy; lần chạy thêm `TZ=UTC` / `America/Los_Angeles` là ở `74f97cc`, chưa chạy lại sau đó) | `a0094a3` |
| Fuzz tách chương (ngoài repo, scratchpad) | `fuzz.py` … `fuzz5.py`, `f6.py` | Tới 40 000 tài liệu mỗi bộ: 0 lỗi chạy, 0 tiêu đề giả mới và 0 mất nội dung so với mốc trước `7f66b34`; `f6` (20 000 tài liệu thực tế): 9 tiêu đề giả do mục lục khi sách bắt đầu giữa chừng (cơ chế có sẵn ở `4a4a409`; `f1cdf53` làm lộ ra ở 9 tài liệu mà bản trước chưa sinh, §7.2); tài liệu 60–200 bài tách trong ≤ 0,2 s | `f1cdf53` |
| Smoke e2e | `npm run e2e` | Đợt này chưa chạy lại: chưa xác minh. `smoke-learning-path.mjs` vẫn là bản 1.0 | — |
| CI (GitHub Actions) | `.github/workflows/ci.yml` | **Chưa chạy** (chưa push). CI dùng Temurin 17 và Node 24, máy này dùng JDK 26 và Node 22.14. Máy này có đủ 4 file dữ liệu bị gitignore còn CI thì không, nên cách test ai-service chạy khi thiếu dữ liệu (các nhánh `skipif`) chưa từng được thử ở local | — |

Các mốc trước: 326/326 ở `e6312d3`, 490/490 ở `d7b9955`, 496/496 ở `538d2ab`, 497/497 ở `467fd8e`, 509/509 ở `74f97cc`,
510/510 ở `4fce06b`, 520/520 ở `d5e3c41` (gồm `8de6ea1`..`d5e3c41`), 525/525 ở `ff82190` (gồm `657d383`, `177d764`). ai-service: 1326 ở
`f1cdf53`, 1340 ở `3350f71`. Lần chạy
đầy đủ đầu tiên của đợt sửa này (trên cây làm việc chưa commit, trước bản sửa health, 508 test) trượt 1 test
(`AdminStatsIT.health_reports_ai_service_down_quickly`, 12,67 s vì DNS máy này mất ~11 s cho `ai-service.invalid`); đó là lỗ hổng
thật (hạn chót 2 s của client không tính DNS), đã sửa (commit `638b963`) rồi chạy lại: 509/509 trên mã sau đó commit thành
`4a4a409`..`74f97cc`.

Từ `d7b9955` tới `467fd8e` có thêm 7 `@Test`, không xoá test nào: AdminUserIT +1 và SelfDeleteIT +1 (`580568a`), AuthSecurityIT +1
và LearningPathIT +3 (`538d2ab`), LearningPathIT +1 (`409f4b4`). AppealIT và AdminSettingsIT chỉ sửa test có sẵn. 490 + 7 = 497,
khớp lần chạy ở `467fd8e`. Từ `467fd8e` tới `4fce06b` thêm 13, không xoá test nào, không thêm lớp: LearningPathIT +9 (`1f861ff` +3,
`fb656a8` +5, `4fce06b` +1), AdminContentIT +3 (`1c2e5ff`), AiServiceClientHealthTest +1 (`638b963`); 497 + 13 = 510, khớp lần chạy
ở `4fce06b`. Chiều 20/10 thêm 18, không xoá test nào, thêm 1 lớp (`AiServiceClientGeminiModelTest`, 69 → 70): `8de6ea1` +2
(LearningPathIT), `4232a4b` +2 (AppealIT, MigrationUpgradePathTest), `3350f71` +6 (AiServiceClientGeminiModelTest 4,
AdminStatsServiceTest 1, ContentAiClientTest 1) → 520; `657d383` +4 (LearningPathIT 3, QuizCapabilitiesTest 1), `177d764` +1
(AdminUserIT) → 525; `5a09e31` +3 (AdminUserIT, ExtractionIT, PasswordAndErrorsIT) → 528, khớp cả ba lần chạy.

Log đầy đủ nằm trong scratchpad của Claude
(`%TEMP%\claude\D--University-PBL6-pbl6\6dd42c2b-b7db-4249-8f6b-352d93a9cacd\scratchpad\`): `full-suite.log` (528 test ở `5a09e31`,
26:32 phút), `mvn-full2.log` (525), `mvn_full.log` (520), `full.log` (510 ở `4fce06b`), `backend-test.log` (497 ở `467fd8e`); đồng
đội không xem được; muốn có bằng chứng trên máy khác thì chạy lại.

Hai test bị skip của pytest: chưa xác minh là test nào. Nhiều khả năng có `tests/test_image_reader.py:355`
(`skipif(not image_reader.available())`, máy này không có `jpn.traineddata`). Cảnh báo duy nhất là
`StarletteDeprecationWarning` về httpx trong `fastapi.testclient`.

### 6.2 Kiểm tay và kiểm trực tiếp trên trình duyệt (đêm 19/10 – chiều 20/10)

**Cách chạy.** Chạy thật 3 dịch vụ theo [`.claude/launch.json`](../../.claude/launch.json):
- ai-service ở :8000.
- Backend profile `e2e` ở :8082, dùng Postgres nhúng. Mỗi lần chạy là một DB mới; datasource trỏ vào `e2e-guard.invalid` nên
  không thể ghi nhầm vào Supabase.
- Frontend ở :5173 với `BE_PORT=8082`.

Kiểm ở bề rộng 1280 px và 375 px (có quét `scrollWidth` > `clientWidth` để bắt tràn ngang), đủ 3 vai trò. Ba agent QA chạy song
song: người học, admin, lộ trình. Sau đó 3 agent sửa lỗi (frontend, backend, ai-service), cuối cùng 1 agent kiểm lại.

**Kết quả: 37 lỗi, gồm 4 major và 33 minor.**

| Nhóm | Mã | Số lỗi | Major | Sửa ở |
|---|---|---|---|---|
| Người học | LC-01 … LC-12 | 12 | LC-01 (Hán–Việt sai: 予定 → "NHỪ ĐỊNH"), LC-02 (nghĩa Kanji lấy nhầm nghĩa của từ: 日 → "Sunday") | LC-01..03: `7cc8840`; LC-04..12: `4e1143f`; phần dữ liệu của LC-11: `467fd8e` |
| Admin / staff | STAFF-01 … STAFF-14 | 14 | STAFF-01 (CORS chỉ nhận `localhost`, mở bằng 127.0.0.1 hay [::1] thì mọi POST bị 403) | STAFF-01, 14: `538d2ab`; STAFF-02..13: `4e1143f` |
| Lộ trình | LP-01 … LP-11 | 11 | LP-01 (lịch xem trước ở bản nháp khác lịch sau khi kích hoạt) | LP-01, 02, 08: `538d2ab`; LP-03..07, 09..11: `4e1143f`; widget của LP-10: `dc350b7` + `409f4b4` |
| Phát hiện khi kiểm lại | NEW-01, NEW-02 | 2 | — | `dc350b7` |

Kiểm lại sau đợt sửa 1 còn 4 lỗi: LC-11 phần dữ liệu, LP-10 phần widget, NEW-01, NEW-02. Cả 4 đã được sửa ở đợt 2
(`dc350b7`, `409f4b4`, `467fd8e`).

**Kiểm trực tiếp sau khi khởi động lại dịch vụ (rạng sáng 20/10, workflow `wf_8e1bb8a2-1e6`): 18/18 đạt.**
ai-service và backend-e2e được khởi động lại ở HEAD `467fd8e` (DB e2e mới), rồi kiểm bằng API và trên trình duyệt:
- Qua API (10/10): LP-01 (bản nháp 120 ngày và lịch sau kích hoạt cùng dải 1–24 / 25–42 / 43–66, số thẻ từng ngày trùng khớp;
  lộ trình 12 ngày khớp từng ngày), LP-02 (học trước 7 thẻ của ngày 2 → dự báo ngày 2 còn `newCount` 0, không đếm hai lần),
  LP-08 (rút 10 → 3 ngày: tên "Ngày N" khớp dải), LP-10 (`today-summary` có `done` + `completedAt`, lộ trình xong xếp sau),
  STAFF-01 (`[::1]`, `127.0.0.1`, `localhost` đều qua CORS; origin lạ nhận 403 JSON tiếng Việt), STAFF-14 (400
  "extraction_daily_limit_free phải từ 0 đến 1000."), LC-01 (予定 DỰ ĐỊNH, 猫 MIÊU, 郵便局 BƯU TIỆN CỤC), LC-02 (日 "day; sun;
  Japan", 字 "letter, character, word", 存 "exist…"), LC-03 (日本 にほん N5), LC-11 (高校 / 高等学校 là 2 nút, 中学校 "junior
  high school", không nhãn nào còn `;` hay `、`).
- Trên trình duyệt ở 1280 và 375 px (8/8): widget LP-10 có chip "Đã hoàn thành", không còn nút "Bắt đầu", badge không cộng;
  `/quiz` 1265/1265 và 375/375 (`scrollWidth`/`clientWidth`); Thư viện ghi "★ 4 · 1 đánh giá" và "1 lượt tải" riêng; bản đồ
  Hán–Việt; 予定 → DỰ ĐỊNH, link `/han-viet?reading=DỰ`; không lỗi console; không trang nào tràn ngang ở 375 px (`/`,
  `/roadmap`, `/quiz`, `/library`, `/han-viet`, `/kanji`).

Lần kiểm này phát hiện thêm 5 lỗi nhỏ (NEW-03..07, §10), đều đã được sửa sau đó.

**Trang staff (workflow `wf_eba150af-3cf`, admin1 = ADMIN và superadmin = SUPER_ADMIN, 1280 và 375 px): 13/14 đạt, STAFF-09 không kiểm (mục phía người học).**
- Đạt: STAFF-02..05, STAFF-07, STAFF-08, STAFF-10, STAFF-11, STAFF-13 (STAFF-06: ca tổng 0 không dựng lại được vì DB e2e đã có 13
  lượt bóc tách, chỉ kiểm qua code); phân quyền ADMIN / SUPER_ADMIN (ADMIN không thấy nút lưu cấu hình, đổi vai trò,
  xoá nguồn tri thức; gọi API thẳng nhận 403 "Bạn không có quyền thực hiện thao tác này."); 12 trang admin không tràn ngang ở
  375 và 1280 px; khoảng 40 lượt mở trang admin không có lỗi console (trừ 2 lỗi 400 do cố ý thử `/setup`).
- Không đạt: STAFF-12. Gõ "abc" vào ô "ID người thao tác" rồi bấm "Lọc" thì trình duyệt hiện bong bóng tiếng Anh ("Please match
  the requested format.") vì ô có `pattern="[0-9]*"` mà form không có `noValidate`, nên kiểm tra tiếng Việt của trang không chạy.
  Khoảng ngày ngược và `?actorId=abc` trên URL thì đã báo đúng tiếng Việt. Đưa vào đợt sửa NEW-08..12 (§10).
- Lỗi nhỏ thấy thêm: nhãn ô số liệu của biểu đồ OCR bị cắt ở 1280 px ("Tỉ lệ lỗ…", "Chuyể…"); chú thích "Hoàn thành:" của "Cơ cấu
  Bóc tách AI" bị cắt; bộ thẻ bị gỡ về riêng tư vẫn giữ cờ Featured; tab báo cáo đã xử lý có cột "Thao tác" trống và xử lý xong
  không có câu xác nhận.

**Kiểm trực tiếp lượt 2 ở HEAD `4fce06b` (sáng 20/10, workflow `wf_783c26ac-682`, DB e2e mới, 3 tác tử song song).**
- API (16/17): đạt NEW-04 (bản nháp 10 ngày ↔ 3 ↔ 10, bỏ chọn / chọn lại giữ nguyên id chương, chương đặt tên riêng giữ đúng thẻ,
  kích hoạt = xem trước cả tên, số thẻ, lịch ngày), NEW-05 (`completedAt` trùng từng ký tự), NEW-11 (gỡ về riêng tư bỏ Nổi bật, audit
  có cả hai thay đổi, bật cho bộ riêng tư → 400, chủ chuyển riêng tư cũng bỏ cờ, không có V29 "Nổi bật"), health admin 0,08 s, cùng các mục cũ
  LP-01, LP-02, LP-10, STAFF-01, STAFF-14, LC-01, LC-02, LC-03, LC-11. Tiêu đề bài dính liền kiểu OCR và các dòng "第1課 を復習しましょう"
  / "Lesson 1 の練習" trong thân bài: đúng. **Không đạt**: NEW-03 khi tên bài **cuối** bắt đầu bằng chữ giống trợ từ ("第3課 がっこう"),
  cả 3 chương đều mất (xem NEW-13).
- Trang admin (19/19, chạy trên `http://[::1]:5173` để không đè phiên đăng nhập): NEW-08 (chữ, ngày chưa đủ, khoảng ngày ngược đều
  báo tiếng Việt), form hạn mức riêng, hạn Pro (trình duyệt tự cắt năm 5 chữ số còn 4 chữ số vì `max=9999-12-31`; câu báo tiếng
  Việt cho năm sai được thử bằng giá trị gán qua JS), modal nguồn tri thức, 0.855 ở ô ngưỡng; NEW-09/10 không cắt nhãn ở
  1280 / 1024 / 375; NEW-11 ô Nổi bật khoá với bộ riêng tư; NEW-12; phân quyền ADMIN (giao diện + API 403); 13 trang admin không tràn
  ngang ở 375 và 1280, không lỗi console.
- Trang người học (10/12): bản nháp đổi số ngày / trần, danh sách chương đang mở tải lại đúng, nút gộp chỉ hiện khi hợp lệ, bỏ chọn /
  chọn lại, xem trước = kích hoạt; NEW-06, NEW-07, widget LP-10; không tràn ngang ở 375 px; console chỉ có 2 lỗi 429 (hết hạn mức 5 lượt bóc tách / 24 giờ) và 2
  lỗi 404 (cố ý mở lộ trình của người khác). **Không đạt**: NEW-03
  (như trên) và trang `/` tràn ngang 17 px ở 1024 px do thẻ thư mục (NEW-14).
- Lỗi nhỏ thấy thêm: đăng xuất rồi đăng nhập tài khoản khác bị đưa về trang riêng của người trước (NEW-15); ô ngày ở nhật ký admin gửi
  request theo từng phím (NEW-16). NEW-13..16 đã sửa ở `f1cdf53`, `3b0bfcb` (sau review đối kháng và fuzz).

**Lượt kiểm cuối buổi sáng ở HEAD `f1cdf53` (sáng 20/10; ai-service khởi động lại, frontend nạp lại; workflow `wf_a2131754-300` + Claude tự
kiểm phần admin): tất cả mục đạt.**
- Tách chương qua API thật (`POST /api/learning-paths`), 10/10: "第1課 はじめまして / 第2課 にほんのくらし / 第3課 がっこう" (khoảng
  trắng nửa cỡ), "あいさつ / にほんのくらし / でんしゃ", bản dính liền, "はじめまして / かいもの / がっこう" (bài 3 không bị nuốt), bản có
  dấu ":", "Lesson 1 … / Lesson 3 がっこう" đều ra đúng 3 chương, không "Mở đầu". Không sinh chương thừa với "第4課の予習" + từ vựng,
  "第4課 はらいしゅう", "第1課 を復習しましょう" / "Lesson 1 の練習" trong thân bài, "第1課 はどうでしたか" trong bài. Gọi thẳng
  ai-service: bài thứ 4 thật ("はなび", "はるやすみ", "にもつ", "がいこく", "りょこう") vẫn được nhận; 9 kiểu ghi chú cuối dãy không thành
  chương. Health dữ liệu ai-service đủ; bóc tách thường vẫn đúng (予定 → DỰ ĐỊNH).
- NEW-14: `/` với 4 thư mục (một thư mục tên rất dài) không tràn ở 1024 (2 cột), 1280 (3 cột), 375 (1 cột).
- NEW-15: A đang ở trang lộ trình riêng → đăng xuất → B đăng nhập cùng tab thì vào `/`, không 404; mở liên kết sâu khi chưa đăng nhập
  rồi đăng nhập vẫn quay về đúng liên kết đó.
- NEW-16 (Claude tự kiểm, admin1 trên `http://[::1]:5173`): giá trị năm dở dang Chrome phát ra khi gõ (`0002`, `0020`, `0202`) không
  đổi URL, không gửi request; rời ô với ngày đủ → đúng 1 request `from=2026-10-15`; khoảng ngày ngược → "Ngày bắt đầu phải trước hoặc
  bằng ngày kết thúc.", không request; sửa ô còn lại → áp cả hai trong 1 request. (Cửa sổ trình duyệt bị ẩn nên phím gõ thật không vào
  ô ngày; đã mô phỏng đúng các giá trị `input` mà Chrome phát ra.)
- Quét lại: 7 trang người học ở 375 px và 5 trang admin (`/admin`, `/admin/users`, `/admin/reports`, `/admin/settings`,
  `/admin/audit`) ở 1280 và 375 px không tràn ngang, không lỗi console. Phiên admin1 đã đăng xuất sau khi kiểm.
- Ghi chú môi trường: Vite trên máy này chỉ nghe IPv6, nên `http://127.0.0.1:5173` không mở được (dùng `localhost` hoặc `[::1]`).
  Profile e2e ép tắt xác thực email nhưng trang cấu hình vẫn hiện khoá `email_verification_required = true` (đúng với DB, chỉ profile
  test bỏ qua).

**Kiểm trực tiếp phần làm nốt ở HEAD `d5e3c41` (chiều 20/10, workflow `wf_9c24c580-d98` + Claude tự kiểm phần admin): API 11/11,
giao diện người học 13/13.**
- API: D4 "Trống" (xoá hết thẻ chương 3 → `state=empty`, chương khác không đổi, kiểm tra trả 409; xoá cả bộ → "empty" + `deckDeleted`),
  D4 nhắc làm lại (`quizPassPct=80`; trượt 0 % → đúng 1 thông báo RETRY, trượt lần nữa không thêm; đạt 100 % → "passed"; điểm cao nhất
  là max; chương sau vẫn học được), STAFF-07 (`lockedReasonAtSubmit` giữ nguyên sau khi mở khoá; khoá không lý do → `''`),
  `aiModels` khớp `/extract/health` của ai-service, lưu `ai_model_primary` (tên lạ vẫn 200; 41 ký tự → 400), chuyển model (chỉ kiểm
  qua code + `AiServiceClientGeminiModelTest` + bóc tách thử với tên lạ vẫn DONE, vì không có khoá Gemini), LP-01, NEW-13, STAFF-14,
  health 0,09–0,18 s, đặt mật khẩu superadmin qua `/setup`.
- Giao diện (1280 và 375 px): spec LP-13 (3 lần bấm "Tạo lộ trình" → đúng 1 `POST …/activate`), spec LP-15 (dải nhắc + link ở trang
  bộ thẻ / trang sửa của chương; bộ tự tạo trong thư mục lộ trình và bộ thường không bị nhắc; bộ thường không gọi thêm API thư mục /
  lộ trình), chương "Trống", "Chưa đạt 80% — Làm lại" mở lượt mới, thông báo nhắc dẫn về lộ trình, chương sau vẫn học được, không tràn ngang ở 375 px,
  không lỗi console.
- Claude tự kiểm admin: cột "Lý do khoá (lúc gửi)" vẫn hiện lý do gốc sau khi mở khoá; gợi ý / cảnh báo ô "Model AI chính"; thẻ "Lộ
  trình học tập" ở Tổng quan; không tràn ngang ở 375 px; console chỉ có lỗi 401 trước khi đăng nhập.
- Lỗi mới: NEW-17 (major), NEW-18, NEW-19 (API), NEW-20 (khung thông báo bị cắt ở 375 px); ghi chú: "Ghi nhớ đăng nhập" mặc định
  được chọn (quyết định sản phẩm, §7.2).

**Kiểm trực tiếp chiều 20/10, lượt 2 ở HEAD `ff82190` (workflow `wf_5aec64e5-42f`): API 10/10; giao diện người học đạt hết trừ
tiêu đề dashboard.**
- API: NEW-17 (lượt luyện tập đã làm 2 câu → kiểm tra chương trả lượt exam mới 10 câu, 300 s; lượt cũ được chấm), NEW-18
  (`chaptersTotal` 3 → 2 sau khi chương 3 thành "Trống", ở cả `GET /{id}` lẫn danh sách), NEW-19 (lý do A → B, `lockedAt` giữ nguyên,
  khiếu nại vẫn giữ A), D4 nhắc làm lại, STAFF-07, health + `aiModels`, LP-01, NEW-13, STAFF-14, staff bị 403 ở 5 API học.
- Giao diện: khung thông báo nằm trong màn hình ở 320 / 375 / 414 / 640 / 1280 px, Esc và bấm ngoài đều đóng; hộp "Nộp bài đang
  làm dở?" → bài thi có đồng hồ 4:59 → 8/10 (80 %) thì chương "Đã qua"; "1/3 chương đã qua kiểm tra" khi một chương chỉ có 1 thẻ;
  dashboard không cuộn ngang ở 320–1280 px; không lỗi console. **Không đạt**: tiêu đề "Bộ thẻ đang học" gãy 2–4 dòng ở 640–900 px
  và nút "Mục tiêu học tập" gãy 4 dòng (NEW-21).
- Ghi chú: một PATCH đổi cả lý do khoá lẫn Premium chỉ ghi audit `USER_LOCK_REASON` (§7.2); `lockedAt` trong response lần khoá có
  100 ns, lần đọc sau µs (NEW-22).

**Sửa sau lượt 2 chiều 20/10 (`wf_ea36e4ab-315`, `wf_fde9856d-ce2`):** NEW-21 (`d1a581e`) đo lại ở 320 / 375 / 640 / 768 / 820 /
900 / 960 / 1024 / 1180 / 1280 px: tiêu đề, nhãn và nút đều 1 dòng, không cuộn ngang. NEW-22 (`5a09e31`) kiểm bằng IT (528 test
xanh), chưa kiểm lại trực tiếp. `a0094a3`: ở 768 px "Hôm nay: … thẻ đến hạn · … thẻ mới" từ 4 dòng còn 1, ở 320 px nhãn bảng điều khiển từ 2 dòng còn 1,
nút đóng banner không bị cắt; trang không cuộn ngang ở 320 / 375 / 640 / 768 / 1024 / 1280 px.

**Còn chưa kiểm trực tiếp:**
- LP-07: bản sửa frontend `4e1143f`, chỉ kiểm qua code vì dải nợ chỉ hiện khi đổi đồng hồ.
- Ca "tổng 0 → Khác 0 %" của STAFF-06: DB e2e đã có lượt bóc tách nên không dựng lại được, chỉ kiểm qua code `extractionBreakdown()`.
- NEW-22 (`5a09e31`): mới kiểm bằng IT; backend-e2e đang chạy vẫn là mã `ff82190` (§8a).

Danh sách đủ 37 lỗi và trạng thái kiểm của từng lỗi: §10.

**Chưa kiểm vì môi trường.** Trên máy này chưa từng chạy thật các luồng: OCR `jpn` / `jpn_vert` (B2), Gemini Vision dự phòng,
dịch nghĩa bằng Gemini (C1), mẹo nhớ AI (C4), chuyển model Gemini thật theo `ai_model_primary` (`3350f71`; chỉ kiểm qua code +
`AiServiceClientGeminiModelTest`), gửi mail thật cho xác thực / quên mật khẩu (A1, A3). Lý do:
- `C:\Program Files\Tesseract-OCR\tessdata` chỉ có `eng` và `osd`, nên `image_reader.available()` trả false.
- Không có `ai-service/.env`, tức không có `GEMINI_API_KEY` theo cách README hướng dẫn.
- Không có `application-local.properties`, nên không có SMTP; profile `e2e` còn ép tắt xác thực email
  (`app.auth.email-verification-forced-off=true`).
- Lúc QA, trang tổng quan admin báo Gemini và Tesseract "down" (17/19 thành phần sẵn sàng).

Xem §8a a4.

## 7. Việc tồn đọng và giới hạn đã biết

### 7.1 Thiếu sót, nên sửa

| # | Vấn đề | Ảnh hưởng | Bằng chứng |
|---|---|---|---|
| 1 | ~~Test backend đầy đủ ở HEAD chưa có kết quả~~ Đã xong: mới nhất 528/528 ở `5a09e31` (`a0094a3` không đụng backend); trước đó 510/510 ở `4fce06b` | — | §6.1 |
| 2 | ~~Bản sửa backend và ai-service chưa kiểm trực tiếp trên giao diện~~ Đã kiểm trực tiếp nhiều lượt (20/10). Lượt cuối (HEAD `ff82190`) đạt hết trừ tiêu đề dashboard (NEW-21, đã sửa ở `d1a581e` và đo lại trên trình duyệt); NEW-22 (`5a09e31`) mới kiểm bằng IT. Còn LP-07 và STAFF-06 ca tổng 0 (§6.2) | — | §6.2 |
| 3 | LC-04: chặn thẻ trùng chỉ có ở frontend | Gọi API trực tiếp vẫn thêm được thẻ trùng | `DeckService.addCards` (không kiểm term trùng); `frontend/scripts/selfcheck/manual.ts` (`findCardByTerm`) |
| 4 | ~~STAFF-07: khiếu nại không lưu lý do khoá lúc gửi~~ **Đã xong** (`4232a4b`, V29 `locked_reason_at_submit`, `AppealResponse.lockedReasonAtSubmit`); kiểm trực tiếp 20/10 chiều | — | §3.3, §10 |
| 5 | ~~Khoá `ai_model_primary` chưa có tác dụng~~ **Đã xong** (`3350f71`): gửi cho OCR dự phòng / dịch nghĩa / mẹo nhớ, ai-service có danh sách cho phép. Còn lại: tên lạ vẫn lưu được (§7.2) | — | §3.4 |
| 6 | ~~Lộ trình: spec LP-15 chưa làm; spec LP-13 thiếu guard `useRef`~~ **Đã xong** (`d5e3c41`: `runOnce`, `DeckPathNotice`); giới hạn còn lại ở §7.2 | — | §3.1 |
| 7 | ~~Trang tổng quan admin chưa hiện `learningPathBreakdown`~~ **Đã xong** (`d5e3c41`, thẻ "Lộ trình học tập") | — | §3.3 |
| 8 | CSV JLPT còn dữ liệu bẩn | Furigana trên thẻ chữ Hán sai và thiếu từ đồng âm ở vài từ (ví dụ 運動 thành うんどうする) | `n4.csv` có 25 dòng cách đọc thêm する trong khi cách viết không có (ví dụ dòng 31 `運動,うんどうする`); `n5.csv` có 5 dòng "(する)"; `n4.csv:255` đảo cột; `n4.csv:507` ghi 下る さがる. Phải sửa lúc nạp vì `build_dicts` ghi đè CSV |
| 9 | Hai mục "Còn mở" trong CHANGELOG đợt 2: race hẹp khi admin sửa câu hỏi đúng lúc quiz đang sinh; đếm dư khả năng quiz chia động từ (danh từ không có `pos` mà tận cùng hàng う) | Đề thiếu hoặc lệch câu trong trường hợp hiếm | `QuizCapabilities.java:79` (`endsWithURowKana`); race: **chưa xác minh** đã xử lý chưa |
| 10 | Backend không lưu `docLevel` | "Kiểm tra lại" không đánh giá lại mâu thuẫn về cấp và ngữ pháp | `AiDtos.java`, `ConflictService.java` |
| 11 | Admin gỡ bộ thẻ khỏi Thư viện xong thì không đưa lại được | Phải nhờ chủ bộ thẻ công khai lại. Đây là lỗi hay chủ ý: **chưa xác minh** | `AdminContentController` chỉ có `POST /decks/{id}/unpublish` |
| 12 | Gửi lại email xác thực lệch D2 | Tài liệu nói một đằng, code làm một nẻo | `EmailVerificationService` (5 lần / 15 phút) so với D2 (3 lần/giờ) |
| 13 | ~~`AdminStatsIT.health_reports_ai_service_down_quickly` phụ thuộc DNS~~ Đã sửa ở `638b963`: health có hạn chót 3 s cho cả lời gọi; thêm test `health_gives_up_at_the_deadline_even_when_client_timeouts_have_not_fired` vào `AiServiceClientHealthTest` (lớp có từ `d28502f`, 3 → 4 test), không phụ thuộc DNS | — | `AiServiceClient.HEALTH_DEADLINE` |
| 14 | Đổi vai trò không áp quy tắc bậc: SUPER_ADMIN hạ được vai trò của SUPER_ADMIN khác. Chủ ý hay lỗi: **chưa xác minh** | Hai SUPER_ADMIN có thể hạ quyền lẫn nhau | `AdminUserService.changeRole` chỉ gọi `requireNotSelf` và `requireNotDeleted`, không gọi `requireBelow` |
| 15 | Bóc tách dòng danh sách từ vựng dạng "漢字 かな" ("天気 てんき", "予約 よやく") sinh thêm thẻ chỉ có cách đọc (てんき) và mảnh từ (やく từ よやく) | Thẻ rác ở chương cuối khi tài liệu có danh sách từ kèm cách đọc | Lượt kiểm cuối 20/10 (`wf_a2131754-300`), ca có dòng ghi chú "第4課の予習" kèm "天気 てんき / 旅行 りょこう / 予約 よやく": chương cuối nhận 天気, てんき, 旅行, りょこう, 予約, やく cùng 課 và 予習 (ca "第4課 はらいしゅう" thêm 課, らいしゅう); nằm ở bước tách từ của ai-service, ngoài phần tách chương |
| 16 | `failOrphans` (có từ trước đợt này) đánh FAILED **mọi** lộ trình PROCESSING và mọi job bóc tách QUEUED / RUNNING mỗi khi một backend khởi động | Trên Supabase dùng chung, một người bật backend làm hỏng job đang chạy của người khác | `LearningPathService.failOrphans`, `ExtractionService` (`@EventListener(ApplicationReadyEvent)`); production chỉ có một instance nên không ảnh hưởng |

### 7.2 Giới hạn đã biết (chấp nhận ở quy mô hiện tại)

- **D2**: chưa có link bí mật `share_token` (D9). UC-29 (xuất Anki / CSV / PDF) chưa làm. *(26/10: cả hai đã làm, xem CHANGELOG.)*
- **E4**: mẫu trọng âm là kiểu từ điển kanjium, chỉ có cho từ JLPT. Không có mẫu NHK hay giọng bản xứ.
- **Giới hạn chức năng**:
  - E1 dùng SM-2, phản xạ không vào công thức lịch.
  - E3 chỉ chạy trên Chrome, Edge và Safari; Chrome gửi âm thanh tới Google để nhận dạng.
  - E5 chưa điều khiển được bằng giọng nói.
  - C6 chỉ tìm câu trong tài liệu của người học.
  - C7 dùng câu mẫu khi tài liệu không có câu phù hợp.
  - F2 chưa so giữa các tài liệu của người học với nhau.
  - B5 còn 1 xfail: 一日中 bị tách thành 一 + 日中.
- **Lộ trình**:
  - (Đã xong chiều 20/10: chương hết thẻ có trạng thái `empty` "Trống"; D4 "nhắc làm lại nếu chưa đạt", `8de6ea1`.)
  - Chương còn "chưa tới ngày" (`locked`) mà đã có điểm trượt thì không hiện dải "Làm lại" (`ChapterTimeline` chỉ hiện khi `canQuiz`,
    tức không phải `locked`), dù API vẫn cho làm kiểm tra chương đó.
  - Spec LP-15: dải nhắc dựa vào thư mục lộ trình (`metadata.learningPathId`) + `chapters[].deckId`, nên người học chuyển bộ thẻ của
    chương ra khỏi thư mục lộ trình thì dải nhắc mất. Xoá cả bộ từ `DecksPage` / `FoldersPage` không nói gì về lộ trình (chỉ trang
    bộ thẻ có câu xác nhận riêng).
  - Lưu "Cài đặt lộ trình" (`handleSaveSettings`) chưa đi qua `runOnce` (các thao tác khác đã có).
  - `chaptersTotal` không trừ câu hỏi bị admin ẩn trong ngân hàng câu hỏi (hiếm: bộ ít nghĩa có câu bị ẩn vẫn được đếm là ra được
    đề, trong khi đề phát ra thiếu câu thì không tính là bài kiểm tra chương).
  - Tạo lộ trình là một modal (`CreateLearningPathModal.tsx`), không có wizard nhiều bước.
  - `today.suggestions[]` trong spec được thay bằng `/api/insights/next`.
  - Lộ trình bổ khuyết không lưu `sourceDeckId` của thẻ clone.
  - `review_logs.path_id` mới chỉ được ghi, chưa có chỗ nào đọc.
  - Danh sách `/roadmap` xếp theo ngày tạo (mới nhất trước), nên lộ trình vừa hoàn thành có thể đứng trên lộ trình đang học; chỉ
    widget "Lộ trình hôm nay" xếp lộ trình đã xong xuống cuối.
  - Bố cục chương "Ngày N" phụ thuộc cấp JLPT của người học (trọng số thẻ). Đổi cấp ở hồ sơ trong lúc bản nháp đang mở thì bản xem
    trước trên màn hình có thể khác lúc kích hoạt cho tới khi mở lại bản nháp (GET của chính chủ chuẩn hoá theo cấp mới): chưa xác
    minh trên giao diện.
- **Tách chương theo bài** (ưu tiên không tạo chương giả; khi không chắc thì quay về chia theo ngày như trước, **không mất chữ**):
  - Cả 3 tên bài đều bắt đầu bằng chữ giống trợ từ **và** khoảng trắng lẫn lộn (một bài viết dính, bài khác có cách) → không nhận
    chương nào (chia theo ngày). Có một tên bài bình thường làm mốc thì vẫn nhận.
  - Tài liệu chỉ 2 bài, cả 2 tên bắt đầu bằng chữ giống trợ từ và không có dấu ":" → không nhận (cần ≥ 3 bài, một tên bài bình thường
    hoặc dấu câu).
  - Bài cuối mà Sudachi đọc như "trợ từ + từ" (にもの, はいしゃ, はいく, がか, にし, にんじゃ, はなや, でぐち, でかける) chỉ được nhận khi có dấu
    câu (":"…); ở giữa dãy thì vẫn nhận. Tên bài cuối có dấu câu nhưng nằm trong danh sách câu / ghi chú (ví dụ "第4課: にほんのことば")
    vẫn bị loại.
  - Sách bắt đầu giữa chừng (không có bài 1) có trang mục lục: dòng mục lục có thể thành chương đầu (fuzz `f6`: 9 / 20 000 tài liệu;
    cơ chế có sẵn ở `4a4a409`, `f1cdf53` làm lộ ra ở nhiều tài liệu hơn, không mất chữ).
- **Tên chương "Ngày N" tự sinh** có thể chồng dải ngày ("Ngày 1" và "Ngày 1–2"): chương là các nhóm thẻ chia đều, còn tên lấy theo
  dải ngày thật của lịch; rõ hơn khi có chương đặt tên riêng ("Ngày 4", "Ngày 4–5", "Ngày 5–6"). Tên thường không trùng, trừ một ca đã biết: lộ trình rất ngắn mà mỗi phía của một chương đặt tên riêng chỉ có một chương tự sinh
  và cả hai rơi vào cùng một ngày thì hai chương cùng tên "Ngày N" (kích hoạt ra hai bộ thẻ trùng tên) cho tới khi người học đổi tên
  một chương (javadoc `mergeSameRange`).
- **Bộ giới hạn tần suất** (khiếu nại, sinh mẹo, báo lỗi câu hỏi, gửi lại email) lưu trong RAM của một instance, nên mất khi
  khởi động lại.
- **Admin** (ghi nhận chiều 20/10):
  - `ai_model_primary` nhận và lưu cả tên model lạ (200); trang Cấu hình chỉ cảnh báo, ai-service lặng lẽ dùng `GEMINI_MODEL`. Chưa
    từng chạy thật với khoá Gemini (†).
  - Một `PATCH /api/admin/users/{id}` đổi nhiều trường (ví dụ lý do khoá + Premium) chỉ ghi **một** dòng audit với một action
    (`USER_LOCK_REASON`), detail có đủ các trường; lọc nhật ký theo `USER_PREMIUM` sẽ không thấy. Cách ghi này có từ trước (khoá +
    Premium); giao diện không gửi hai trường cùng lúc.
  - Đổi lý do khoá của tài khoản đang khoá chỉ làm được qua API (trang chi tiết người dùng chỉ gửi lý do lúc khoá).
- **Đăng nhập**: ô "Ghi nhớ đăng nhập" mặc định được chọn (`useLoginForm.ts`), nên token vào `localStorage` và các tab khác cùng
  origin dùng chung phiên. Giữ như vậy (quyết định sản phẩm).
- **Môi trường kiểm trên máy này**: Vite chỉ nghe IPv6 nên `http://127.0.0.1:5173` không mở được (dùng `localhost` / `[::1]`);
  profile `e2e` ép tắt xác thực email nhưng trang Cấu hình vẫn hiện khoá `email_verification_required = true` (giá trị thật trong DB).
- **Dữ liệu ai-service**: 4 file không commit (`jmdict.sqlite`, `kanji_strokes.json`, `kradfile.csv`, `pitch_accent.csv`) phải
  tự dựng ở máy mới. Chưa có trang ghi nguồn giấy phép (KanjiVG, EDRDG, kanjium đều là CC BY-SA).
  `jlpt_meaning_overrides.csv` mới quét N5 / N4, giữ tối đa 30 dòng.
- **Hạ tầng thừa**: `docker-compose.yml` vẫn khai báo `redis` và `neo4j` không dùng; `ai-service/app/core/config.py` có
  `NEO4J_PASSWORD` mặc định `password123`.
- **Bảo mật khi triển khai**: `AI_SERVICE_KEY` mặc định để trống (không kiểm khoá). ai-service để CORS `*` (có từ trước).
- **Frontend**:
  - 18 tệp còn lớp xử lý "máy chủ chưa có endpoint" (`SERVER_PENDING_MESSAGE` / `isEndpointMissing`).
  - `ComingSoonBadge` không còn chỗ nào dùng.
  - Tab "Đội ngũ Staff" gộp và phân trang ở máy khách.
  - Bundle JS khoảng 1,29 MB (1 289 kB, gzip 351 kB; lần build chiều 20/10).
  - `npm run selfcheck` cần Node ≥ 22.18; máy này dùng 22.14 nên phải thêm cờ.
  - Tên tệp CSV xuất ở trang Báo cáo / Người dùng vẫn lấy ngày theo UTC (`toISOString().slice(0,10)`); "7 ngày gần nhất" là
    hôm nay − 7 … hôm nay (8 ngày lịch), như trước.
  - Nhật ký admin: dùng bàn phím Tab từ ô ngày sang nút "Lọc" rồi Enter có thể tạo 2 mục lịch sử trình duyệt (chuột thì 1).
  - Ở 1024 px, tab cuối ("Luyện tập") của dải tab `/profile` bị che khoảng 10 px trong khung cuộn ngang riêng của dải (trang không
    tràn ngang).
  - Ở 768 px chân vài thẻ KPI của dashboard còn chật: "Đã thuộc: 0 thẻ" và "Kỷ lục cá nhân: 1 ngày" xuống dòng, "Số bài / Bài gần
    nhất" sát nhau (thấy khi chỉnh `a0094a3`, chưa sửa; không gây cuộn ngang).

### 7.3 Tài liệu chưa theo kịp code

- `docs/LEARNING_PATH.md`: §7 "Hạn chế đã biết" và dòng 6 vẫn mô tả bản 1.0; §10 vẫn ghi "chưa kiểm tay 375 px"; chưa có trạng thái
  "Trống", `quizPassPct`, `LEARNING_PATH_CHAPTER_RETRY` (20/10 chiều).
- Kế hoạch tổng: bảng số migration lệch từ V28. Kế hoạch ghi V28 = `quiz_questions` / `question_flags`, V29 =
  `knowledge_sources`, V30 = `decks.share_token`. Thực tế `quiz_questions` / `question_flags` nằm trong V22, `knowledge_sources` là
  V28, V29 là `account_appeals.locked_reason_at_submit` (STAFF-07, `4232a4b`) và chưa có V30. V20–V27 khớp (riêng V22 chứa thêm hai
  bảng quiz). Cột trạng thái chỉ có Đ1 "đang chạy".
- `README.md` mục 2.2: thiếu `--only unihan_def` và 3 file `unihan_definitions.csv`, `kanji_meaning_overrides.csv`,
  `jlpt_meaning_overrides.csv`.
- `docs/CODEBASE_MAP.md`: chưa có `/admin/account` và `scripts/selfcheck/manual.ts` (bảng endpoint ai-service đã đủ).
- `docs/Plan/specs/2026-10-19-quyet-dinh-da-chot.md`: chưa có D13 (KRADFILE, kanjium); D11 còn ghi `question_bank` và loại
  "on-kun".
- `docs/USE_CASES_CHECKLIST.md`: câu mở đầu vẫn ghi "chưa kiểm tay trọn luồng với ai-service thật".

## 8. Kế hoạch tiếp theo

### 8a. Ngay bây giờ

| # | Việc | Vì sao | Ai | Xong khi |
|---|---|---|---|---|
| a1 | ~~Lấy kết quả `mvn -B test` đang chạy~~ **Xong**: 510/510 ở `4fce06b`; mới nhất 528/528 ở `5a09e31` | Chốt con số chính thức ở HEAD | Claude | Đã ghi vào §6.1, `CHANGELOG.md` và `Progress` |
| a2 | ~~Khởi động lại ai-service, backend-e2e và frontend (`.claude/launch.json`), rồi kiểm trực tiếp ở 1280 / 375 px~~ **Xong**: nhiều lượt. Lượt cuối (`ff82190`) đạt hết trừ tiêu đề dashboard (NEW-21, sửa ở `d1a581e`, đo lại trên trình duyệt khi sửa). NEW-03..16 (sáng) và NEW-17..22 (chiều 20/10) đã tìm thấy và đã sửa (§6.2, §10). Chưa kiểm trực tiếp: LP-07 (cần đổi đồng hồ máy), STAFF-06 ca tổng 0 và NEW-22 (`5a09e31` mới kiểm bằng IT; backend-e2e đang chạy là mã `ff82190`) | Các bản sửa backend / ai-service chưa thấy trên giao diện (§6.2) | Claude (đã dừng 20/10); phần còn lại: **người dùng** (§8a.1) | Mỗi mục có ảnh chụp hoặc kết quả `read_page` trùng kỳ vọng; phần còn lại theo bảng bàn giao §8a.1 |
| a3 | Sửa tài liệu lỗi thời (§7.3) | Nhóm đọc tài liệu sẽ hiểu sai trạng thái | Claude | Không còn dòng nào mâu thuẫn với code; README là tệp tracked nên commit riêng |
| a4 | Cài `jpn.traineddata` + `jpn_vert.traineddata`, tạo `ai-service/.env` có `GEMINI_API_KEY`, cấu hình SMTP (`application-local.properties` hoặc biến `SPRING_MAIL_*`), rồi kiểm B2 / C1 / C4 / A1 / A3 với dịch vụ thật | Các luồng † ở §4 chưa từng chạy thật (§6.2) | Người dùng cài và đặt khoá; Claude kiểm | Health báo `tesseract` và `gemini` true; OCR một ảnh chữ dọc, sinh một mẹo nhớ, nhận được mail xác thực |

Danh sách kiểm của a2 (đã chạy, kết quả ở §6.2 và cột "Kiểm trực tiếp" của §10) vẫn dùng được làm danh sách kiểm hồi quy khi
sửa tiếp: health dữ liệu ai-service; LC-01..03, LC-11; LP-01, LP-02, LP-08, LP-10; STAFF-01..14; NEW-03..22; D4 ("Trống", nhắc làm
lại), spec LP-13 / LP-15, `aiModels`. Kịch bản API của lượt chiều 20/10 nằm trong scratchpad (`gap_*.py`, `ff_*.py`). Cách dựng: 3 dịch
vụ theo §9, DB e2e mới mỗi lần bật, tài khoản staff seed của V15 (lần đầu đăng nhập phải qua `/setup`).

Lưu ý: backend-e2e đã được khởi động lại hai lần trong ngày 20/10, mỗi lần với DB e2e mới: lúc 10:23 ở `d5e3c41` và lúc 12:32 ở
`ff82190`. Bản đang chạy (nếu chưa tắt) là mã `ff82190`, nên **chưa có** bản sửa backend `5a09e31` (NEW-22); khởi động lại trước khi
kiểm lại NEW-22. Trong DB này superadmin đã đổi mật khẩu qua API (mật khẩu chỉ ghi trong `scratchpad\ff-accounts.txt`); có các học
viên thử `ff-1`..`ff-3@example.test` (`ff-3` vẫn bị khoá, lý do "FF lý do C") và vài lộ trình thử. Muốn về đúng seed V15 thì khởi
động lại backend-e2e. Cặp access / refresh token của admin1 bị in trong transcript của agent kiểm (`wf_a2131754-300`) thuộc DB nhúng
của buổi sáng: access hết hạn sau 15 phút, refresh mất cùng DB cũ khi khởi động lại, nên không còn dùng được. Supabase không bị đụng.

### 8a.1 Kiểm trực tiếp: Claude đã kiểm gì, phần còn lại bàn giao cho bạn

Theo yêu cầu ngày 20/10: Claude dừng các lượt kiểm trực tiếp tại đây; phần chưa kiểm dưới đây bạn tự làm.

**Đã kiểm trực tiếp** (3 dịch vụ chạy thật, backend profile `e2e` trên Postgres nhúng, DB mới mỗi lần bật; chi tiết từng mục ở §6.2
và cột "Kiểm trực tiếp" của §10):

| Lượt | Mã đang chạy | Phạm vi | Kết quả |
|---|---|---|---|
| Đêm 19/10 | trước `4e1143f` | Toàn bộ người học / admin / lộ trình, 1280 + 375 px | 37 lỗi → đã sửa |
| Rạng sáng 20/10 | `467fd8e` | API + người học (LC-01..03, LC-11, LP-01/02/08/10, STAFF-01/14), trang staff | 18/18; staff 13/14 (STAFF-12 → NEW-08) |
| Sáng 20/10 lượt 2 | `4fce06b` | API + người học + admin (NEW-03..12), 1280 / 1024 / 375 px | Đạt hết trừ NEW-03 (→ NEW-13) và `/` ở 1024 px (→ NEW-14) |
| Cuối buổi sáng | `f1cdf53` | Tách chương qua API thật (10 ca), NEW-14..16, quét trang admin | Đạt hết (NEW-16 Claude tự kiểm) |
| Chiều 20/10 | `d5e3c41` | 6 mục làm nốt: D4 "Trống" / nhắc làm lại, STAFF-07, `ai_model_primary`, spec LP-13 / LP-15, thẻ lộ trình ở admin | API 11/11, người học 13/13, admin (Claude tự kiểm) đạt; tìm thêm NEW-17..20 |
| Chiều 20/10 lượt 2 | `ff82190` | NEW-17..20 + hồi quy LP-01, NEW-13, D4, STAFF-07, STAFF-14, health, staff gọi API học → 403 | API 10/10; giao diện đạt hết trừ tiêu đề dashboard (NEW-21) |
| Khi sửa | `d1a581e`, `a0094a3` | Bố cục dashboard 320–1280 px | Tác tử sửa lỗi đo trên trình duyệt (chưa có lượt kiểm độc lập) |

**Bàn giao cho bạn tự kiểm** (chạy 3 dịch vụ theo §9; **khởi động lại backend-e2e trước** để có mã HEAD và DB mới, tài khoản staff
seed của V15 phải qua `/setup` ở lần đăng nhập đầu):

| # | Cần kiểm | Vì sao chưa kiểm | Cách kiểm | Kết quả cần thấy |
|---|---|---|---|---|
| u1 | NEW-22 (`5a09e31`): mốc thời gian trả về trùng lần đọc sau; đăng nhập ngay sau khi đổi mật khẩu | Mới qua IT (528/528); backend đang chạy là `ff82190` | Đổi mật khẩu ở `/admin/account` rồi dùng tiếp ngay; khoá / mở khoá một học viên; đổi hạn Pro | Không bị đăng xuất ngoài ý muốn; thời điểm hiển thị không "nhảy" sau khi tải lại |
| u2 | Dashboard `d1a581e`, `a0094a3` | Chỉ tác tử sửa lỗi đo | Mở `/` ở 320, 375, 768, 1024, 1280 px | Không chữ nào xuống dòng từng chữ, không tràn ngang |
| u3 | LP-07: dải nợ nói đúng lý do "severe" | Cần đổi đồng hồ máy | Tạo lộ trình, đổi ngày máy lùi / tiến vài ngày, mở `/roadmap/:id` | Dải nợ hiện đúng lý do (vượt trần / ngày hoặc > 20 % thẻ còn lại) |
| u4 | STAFF-06: "Cơ cấu Bóc tách AI" khi tổng = 0 | DB e2e luôn có lượt bóc tách lúc kiểm | DB mới, chưa bóc tách gì, mở `/admin` | Phần "Khác" hiện 0 %, không NaN |
| u5 | Đổi lý do khoá của tài khoản đang bị khoá | Chỉ có qua API (giao diện chưa có ô này) | `PATCH /api/admin/users/{id}` `{locked:true, lockedReason:"…"}` | Lý do mới, nhật ký có `USER_LOCK_REASON` |
| u6 | Gửi mail thật: xác thực email (A1), quên mật khẩu (A3) | Máy này không có SMTP; profile e2e ép tắt xác thực | Cấu hình `SPRING_MAIL_*` (README Bước 3), chạy backend profile thường | Nhận được mail, link mở được, đăng nhập sau khi xác thực |
| u7 | Gemini: dịch nghĩa (C1), mẹo nhớ (C4), OCR dự phòng, **đổi `ai_model_primary` có tác dụng thật** | Không có `GEMINI_API_KEY` | Tạo `ai-service/.env` có khoá, đặt `ai_model_primary = gemini-3.7-flash` ở `/admin/settings` | Health `gemini: true`; bóc tách có nghĩa tiếng Việt; log ai-service ghi model đã chọn |
| u8 | OCR chữ dọc (B2) | Tesseract thiếu `jpn` / `jpn_vert` | Cài 2 gói ngôn ngữ, tải một ảnh chữ dọc | Health `tesseract: true`; bóc tách ra từ đúng thứ tự |
| u9 | Micro: phát âm (E3), trọng âm (E4) | Tác tử không dùng được micro | Chrome / Edge thật, trang Luyện tập | Nhận dạng giọng nói, chấm trọng âm hiện kết quả |
| u10 | Trình duyệt khác, điện thoại thật | Chỉ kiểm Chrome giả lập kích thước | Edge, Safari / iPhone, Android | Các trang chính dùng được, không tràn ngang |
| u11 | Smoke tự động `npm run e2e`, `smoke-admin.mjs` | Không chạy lại trong đợt này | Lệnh ở §9 | Xanh (`smoke-learning-path.mjs` vẫn là bản 1.0, xem §8d d4) |
| u12 | Supabase thật: V20–V29 chạy trên DB chung | Mọi lượt kiểm dùng DB nhúng | Làm theo §8b b3 **sau khi** đã sao lưu và báo nhóm | `flyway_schema_history` có V20..V29 thành công; lộ trình 1.0 và người dùng cũ vẫn dùng được |

Ba dịch vụ xem trước có thể vẫn đang chạy trong app Claude (ai-service :8000, backend-e2e :8082, frontend :5173). Muốn tự chạy ở
terminal thì dừng chúng trước để tránh trùng cổng.

### 8b. Trước khi gộp / push: người dùng quyết định

| # | Việc | Vì sao | Ai | Xong khi |
|---|---|---|---|---|
| b1 | Review 44 commit (đọc tài liệu này, rồi `CHANGELOG.md`, rồi `git log de8accb..HEAD`) | Code do Claude viết. Kế hoạch tổng yêu cầu "review chéo ít nhất 2 người" mỗi gói; chưa có người nào review. Diff rất lớn (backend +12k mã chính, frontend +25k, ai-service +45k dòng) nên đọc kỹ trước: `LearningPathService.java` (2 150 dòng; từ 20/10 `get()` có thể ghi khi chính chủ mở bản nháp; `chapterState` / `chaptersTotal` đổi chiều 20/10), `QuizAttemptService.chapterExam` (kiểm tra chương nộp thay lượt đang mở), `ai-service/app/extract/gemini.py` (danh sách model cho phép, chuỗi model, bỏ model 404 30 phút), `AdminUserService.patch` (đổi lý do khoá), V29, `ai-service/app/extract/chapters.py` (tách chương, 3 commit sửa ngày 20/10), `AdminContentService` + `DeckService` (quy tắc Nổi bật chỉ ở tầng code), `AiServiceClient` (executor + hạn chót health 3 s), `LearningPathScheduler.java` (804 dòng), V20 / V21 (DROP / ADD CHECK), `SecurityConfig` + `JsonCorsProcessor`, `JwtAuthenticationFilter` (chặn email), `AdminUserService` (quy tắc bậc, §7.1 #14), `EmailVerificationService` | Người dùng (Claude giải thích hoặc sửa khi được hỏi) | Người dùng đồng ý hoặc nêu chỗ cần sửa |
| b2 | Push `backend-feature-learnmode`, mở PR vào `main`, hoặc gộp | Nhánh đi trước `origin/backend-feature-learnmode` 44 commit và trước `origin/main` 99 commit. Ref remote có thể đã cũ vì phiên này không `git fetch`; theo ref hiện có, `origin/main`, `dev`, `Backend`, `Frontend`, `backend-feature-refresh-token` đều đã nằm trong HEAD (behind = 0) | **Người dùng** (Claude chỉ làm khi được yêu cầu rõ) | Đã `git fetch` và kiểm lại độ lệch; remote có commit hoặc PR đã mở; **CI xanh** |
| b3 | Chuẩn bị Supabase: V20–V29 sẽ **tự chạy khi backend của nhánh này khởi động lần đầu** với DB chung (Flyway bật, `baseline-on-migrate=true`) | Code trên `origin/backend-feature-learnmode` chỉ tới V19. V20 tạo lại CHECK `learning_paths.source_type` và `app_settings`, V21 tạo lại CHECK `app_settings`. Supabase đã có V20 trở lên chưa: **chưa xác minh**. Rủi ro thêm: (a) V20 không backfill `learning_path_cards`, mà lộ trình ACTIVE dựng lịch hoàn toàn từ bảng này, nên lộ trình 1.0 đang ACTIVE sẽ hiện lịch trống (Supabase có dòng như vậy không: chưa xác minh); (b) V24 chỉ đánh dấu đã xác thực một lần, nên người đăng ký sau đó qua backend cũ sẽ có `email_verified_at` NULL và bị 403 khi backend mới chạy với `email_verification_required = true`; (c) đồng đội làm từ origin sẽ tự đặt V20, trùng số; (d) Supabase có thể chưa chạy cả V14–V19 (CHANGELOG 17/10 ghi "V14 chưa chạy trên Supabase"). Ghi chú 20/10: (e) V29 "Nổi bật" đã bỏ có chủ đích (quy tắc Nổi bật ở tầng code), nhưng file chưa commit `V29__featured_requires_public.sql` (CHECK `ck_decks_featured_public` + UPDATE dữ liệu) từng nằm trong working tree khoảng 01:40–02:57 ngày 20/10; nếu trong khoảng đó có ai chạy backend với Supabase thì còn dòng V29 trong `flyway_schema_history` và constraint đó (chưa xác minh; các lần chạy trong phiên đều dùng Postgres nhúng). Từ chiều 20/10 repo **có** V29 khác (`V29__appeal_locked_reason_snapshot.sql`, `4232a4b`, chỉ `ADD COLUMN IF NOT EXISTS`, có `MigrationUpgradePathTest`): nếu Supabase còn dòng V29 cũ thì checksum lệch và Flyway sẽ từ chối khởi động (cấu hình không tắt `validate-on-migrate`; suy từ cấu hình, chưa thử), phải xoá dòng / constraint cũ trước; (f) lúc khởi động nhánh này chỉ ghi Flyway V20–V29 (lần đầu) và `failOrphans` có từ trước (§7.1 #16), bản nháp cũ chỉ được chuẩn hoá khi chính chủ mở; (g) khi đang chạy, `LearningPathReminderJob` (mới ở nhánh này, phút 05 mỗi giờ) ghi thông báo + `last_reminded_on` cho lộ trình ACTIVE bật nhắc của mọi người dùng trên DB đang nối | Người dùng + nhóm | Đã báo nhóm V20–V29 đã dùng; đã chạy `SELECT version, success FROM flyway_schema_history ORDER BY installed_rank` (không có dòng V29 cũ) và kiểm không có constraint `ck_decks_featured_public`; đã sao lưu bằng `scripts/backup.ps1` (D7 nói chưa cần, nhưng nên làm vì DB dùng chung); đã có cách xử lý (a) và (b); `MIGRATION_DB_URL` trỏ vào session pooler cổng 5432 (xem `application.properties`) |
| b4 | Cấu hình môi trường thật | Thiếu `JWT_SECRET` thì backend không khởi động; thiếu SMTP thì link xác thực chỉ nằm trong log | Người dùng | Backend có `DB_URL` / `DB_USERNAME` / `DB_PASSWORD`, `JWT_SECRET` (≥ 64 byte), `CORS_ALLOWED_ORIGINS`, `FRONTEND_URL`, `AI_SERVICE_URL`, `AI_SERVICE_KEY`, `SPRING_MAIL_*` + `MAIL_FROM` (biến nào đã đặt thì không để rỗng); `ai-service/.env` có `GEMINI_API_KEY`, `TESSERACT_CMD`, và `AI_SERVICE_KEY` giống bên backend (tuỳ chọn `GEMINI_ALLOWED_MODELS` nếu Admin muốn chọn model ngoài `gemini-3.8-flash` / `gemini-3.7-flash`). Mẫu: `.env.example`, README Bước 3 |
| b5 | Dựng dữ liệu ai-service trên máy khác | 4 file không commit; thiếu thì E2 / E4 / C2 / F1 bị giảm chức năng | Người dùng / nhóm | `python -I scripts\build_dicts.py --only jmdict` (lần lượt cho `kanjivg`, `kradfile`, `pitch`), khởi động lại ai-service, `GET /api/extract/health` báo các cờ dữ liệu `true` (`tesseract` / `gemini` chỉ true khi đã cài `jpn` và đặt `GEMINI_API_KEY`) |
| b6 | Quyết định về `.claude/launch.json` và các nhánh `wave2/*` | `launch.json` chưa được theo dõi nên `git status` luôn hiện `?? .claude/`; 3 nhánh làn đã nằm trong HEAD | Người dùng | Đã commit hoặc thêm vào `.gitignore`; đã xoá hoặc giữ nhánh có chủ đích |
| b7 | Chia sẻ `docs/` và sao lưu nhánh | `docs/` bị gitignore từ `f5c00ba` (Tom2404, 18/10), nên đồng đội pull về sẽ không có spec, kế hoạch và tài liệu này của 19/10; 44 commit chỉ có trên một máy | Người dùng | Đã chọn cách chia sẻ docs (`git add -f`, bỏ dòng `docs/` ở `.gitignore:98`, hoặc ổ chung); đã có bản sao nhánh mà vẫn không push, ví dụ `git bundle create <ổ ngoài>\learnmode.bundle origin/backend-feature-learnmode..backend-feature-learnmode`. Docs bản cũ khôi phục bằng `git restore --source=f5c00ba~1 --worktree -- docs` |

### 8c. Backlog kỹ thuật (theo thứ tự ưu tiên đề xuất)

| # | Việc | Vì sao | Ai | Xong khi |
|---|---|---|---|---|
| c1 | LC-04 phía backend: `DeckService.addCards` so term đã chuẩn hoá NFKC + trim, trả 409 hoặc cờ cho phép trùng | Toàn vẹn dữ liệu không nên chỉ dựa vào frontend | Claude | Có IT cho thẻ đơn và theo lô; frontend hiện câu 409 |
| c2 | ~~STAFF-07: migration V29 thêm `account_appeals.locked_reason`, chụp giá trị lúc `POST /api/auth/appeals`~~ **Xong** (`4232a4b`: cột `locked_reason_at_submit`, `AppealResponse.lockedReasonAtSubmit`, `appealReasonView` thay cách xử lý tạm) | — | — | — |
| c3 | ~~`ai_model_primary`: gửi sang ai-service hoặc ẩn ô~~ **Xong** theo hướng gửi sang ai-service (`3350f71`, Claude tự chọn theo quy tắc tự quyết): `/extract/text`, `/extract/enrich`, `/radicals/cards` + danh sách cho phép | — | — | — |
| c4 | Làm sạch CSV JLPT lúc nạp (`classifier._read_rows`) | Đúng furigana và từ đồng âm | Claude | Có test chạy trên dữ liệu thật cho từng quy tắc (bỏ đuôi する, đảo cột, 下る) |
| c5 | ~~Đổi `app.ai-service.url` trong test sang `http://127.0.0.1:9`~~ **Không cần nữa**: `638b963` thêm hạn chót 3 s cho health và test riêng không phụ thuộc DNS | — | — | — |
| c6 | Viết test cho 2 mục "Còn mở" (race khi sửa câu hỏi, đếm dư khả năng chia động từ) rồi sửa nếu còn lỗi | Đóng nợ đợt 2 | Claude | Có test; CHANGELOG bỏ dòng "Còn mở" |
| c7 | Trang ghi nguồn dữ liệu (KanjiVG / Ulrich Apel, JMdict / KRADFILE / EDRDG, kanjium, Unihan, JLPT tanos) | Giấy phép CC BY-SA bắt buộc ghi nguồn khi triển khai công khai | Claude | Có route hoặc chân trang ghi nguồn, liên kết từ trang luyện tập / Kanji |
| c8 | Backend lưu `docLevel` | "Kiểm tra lại" đánh giá lại được cả cấp và ngữ pháp | Claude | Có migration chỉ thêm và test `ConflictIT` |
| c9 | Chốt hai điểm lệch với quyết định: D2 (5 lần / 15 phút hay 3 lần/giờ), D9 + UC-29 (làm hay ghi "Một phần" trong báo cáo) | Báo cáo và code phải khớp | **Người dùng** quyết, Claude sửa | Quyết định ghi vào `quyet-dinh-da-chot.md` |
| c10 | Cho admin đưa bộ thẻ trở lại Thư viện (nếu người dùng muốn) | Hiện gỡ xong là không hoàn tác được | Người dùng quyết, Claude làm | Có endpoint publish + nút ở chi tiết bộ thẻ admin, kèm audit |
| c11 | Dọn mã phòng thủ ở frontend (`fetchFlaggedQuestionCount`, `ComingSoonBadge`) | Backend đã đủ endpoint | Claude | lint + build + selfcheck xanh |
| c12 | Dọn hạ tầng thừa: bỏ `redis` / `neo4j` khỏi `docker-compose.yml`, bỏ mặc định `NEO4J_PASSWORD` | Không dùng; mật khẩu mặc định trong code | Claude | Compose chỉ còn dịch vụ đang dùng |
| c13 | Bóc tách danh sách từ vựng dạng "漢字 かな": ghép cách đọc vào từ đứng trước, không tạo thẻ riêng cho cách đọc / mảnh từ (§7.1 #15) | Bớt thẻ rác ở tài liệu giáo trình (danh sách từ cuối bài rất phổ biến) | Claude | Test trên dòng "天気 てんき / 予約 よやく" ra đúng 2 thẻ có cách đọc; không đổi kết quả các test bóc tách hiện có |
| c14 | `failOrphans` chỉ đánh FAILED job do chính instance này khởi chạy (ví dụ lưu id instance / thời điểm khởi động) (§7.1 #16) | Supabase dùng chung: bật backend không làm hỏng job người khác | Claude (cần người dùng đồng ý vì đổi hành vi có từ trước) | IT: job của "instance khác" không bị đụng; job mồ côi của chính mình vẫn FAILED |
| c15 | Tách chương: nhận diện mục lục khi sách bắt đầu giữa chừng; cân nhắc nới cho tài liệu 2 bài / khoảng trắng lẫn lộn (§7.2) | Giảm 9 / 20 000 tiêu đề giả và các ca chưa nhận | Claude | Fuzz `f6` 0 tiêu đề giả; không ca nào ở `test_chapters.py` đổi kết quả |
| c16 | Tên tệp CSV xuất dùng ngày theo giờ máy (như `lastDaysRange`) | Xuất lúc 0–7 giờ sáng (giờ VN) không bị lệch sang hôm trước | Claude | Self-check với `TZ=Asia/Saigon` |

Số migration (V29 đã dùng; V30 trở đi là đề xuất, chốt khi bắt tay làm; kế hoạch tổng đang ghi V29 / V30 cho việc khác, cần sửa
theo bảng này). Số trống tiếp theo: **V30**.

| V | Việc |
|---|---|
| V29 | **Đã dùng** (`4232a4b`): c2 `account_appeals.locked_reason_at_submit`, `ADD COLUMN IF NOT EXISTS`. Bản `V29__featured_requires_public.sql` của NEW-11 chưa từng commit và đã xoá, kể cả bản trong `target/classes`; trước khi chạy trên Supabase phải kiểm không có dòng V29 cũ (§8b b3) |
| V30 | c8 `docLevel` cho mục bóc tách |
| V31 | d6 `sourceDeckId` của thẻ bổ khuyết |
| V32 | D9 `decks.share_token` (nếu c9 chọn làm) |

Trước khi tạo migration mới cần hỏi nhóm số cuối trên các nhánh khác, vì đồng đội từ origin (đang ở V19) có thể đã đặt V20+.

### 8d. Hướng phát triển Lộ trình học tập

Mọi mục dưới đây đều bám vào spec 2.0 hoặc dữ liệu đã có sẵn. Ai làm: Claude, riêng d9 cần người dùng đồng ý trước. d1, d2, d3,
d5 đã xong chiều 20/10. Thứ tự đề xuất cho phần còn lại: d4, d6, d10, d7, d8, d9.

| # | Việc | Vì sao | Xong khi |
|---|---|---|---|
| d1 | ~~Spec LP-15: dải "Bộ thẻ này thuộc lộ trình X…" kèm link~~ **Xong** (`d5e3c41`, `DeckPathNotice` ở trang sửa / chi tiết bộ thẻ; self-check `learningPath.ts`; giới hạn ở §7.2) | — | — |
| d2 | ~~Spec LP-13 phía frontend: guard `useRef`~~ **Xong** (`d5e3c41`, `runOnce` cho mọi thao tác lộ trình; kiểm trực tiếp: 3 lần bấm → 1 request; riêng lưu cài đặt chưa có, §7.2) | — | — |
| d3 | ~~Trang tổng quan admin hiện `learningPathBreakdown`~~ **Xong** (`d5e3c41`, thẻ "Lộ trình học tập") | — | — |
| d4 | Mở rộng `smoke-learning-path.mjs` cho 2.0: kích hoạt có trần / ngày học → `/session` → chấm có `reactionMs` → rebalance → quiz chương → complete → `today-summary` (done) → `/insights/next` → remedial | Spec §9 bước 7; `npm run e2e` mới chỉ phủ bản 1.0. Cùng lúc mở rộng `smoke-admin.mjs` cho mnemonics / questions / knowledge-sources / appeals (hiện grep = 0) | `npm run e2e` xanh với các bước mới; `smoke-admin.mjs` đi qua endpoint admin đợt 2 |
| d5 | ~~Trạng thái chương "trống" tách khỏi `open`; nhắc "Chưa đạt N% — Làm lại"~~ **Xong** (`8de6ea1`: `state=empty`, dải "Làm lại", thông báo `LEARNING_PATH_CHAPTER_RETRY`; `657d383`: `chaptersTotal` bỏ chương "Trống") | — | — |
| d6 | Lộ trình bổ khuyết giữ `sourceDeckId` của thẻ clone | Spec §3.8: dẫn về thẻ gốc, tránh trùng ở lần bổ khuyết sau | Có cột hoặc trường mới (migration chỉ thêm), IT kiểm |
| d7 | Phân tích hiệu quả lộ trình từ `review_logs.path_id` + `reaction_ms`: tỷ lệ nhớ, phản xạ theo lộ trình / chương, so trước và sau bổ khuyết | Dữ liệu đã ghi từ V20 nhưng chưa ai đọc | Có API + widget; IT trên dữ liệu chèn |
| d8 | Nhắc học qua email (tuỳ chọn theo lộ trình) | SMTP đã có; hiện chỉ nhắc trong app | Job nhắc gửi mail khi bật, tôn trọng 1 lần/ngày |
| d9 | "Thêm vào lộ trình" cho thẻ thêm sau kích hoạt, dùng `replan` | Mạnh hơn d1. Cần người dùng đồng ý vì spec §1 xếp "chỉnh thẻ trong lộ trình" vào mục *Không làm* | Thẻ mới có dòng `learning_path_cards`, lịch còn lại được xếp lại |
| d10 | Viết lại `LEARNING_PATH.md` thành một bản 2.0 thống nhất; đổi đầu spec sang "đã triển khai" | Tài liệu 1.0 và 2.0 đang nằm chồng lên nhau | Không còn hạn chế đã sửa; có bảng đối chiếu spec LP-1..17 |

Ngoài phạm vi đã chốt, để sau: FSRS đúng công thức (đưa phản xạ vào lịch), knowledge tracing, GraphRAG / Neo4j.

### 8e. Quyết định đang chờ người dùng

| # | Cần quyết |
|---|---|
| b1 | Review 44 commit: đồng ý hay nêu chỗ cần sửa (phải xong trước b2) |
| b2 | Push / mở PR / gộp, lúc nào |
| b3 | Cách đưa V20–V29 lên Supabase (kiểm không có dòng V29 cũ) và xử lý lộ trình 1.0 + người dùng chưa có `email_verified_at` |
| b6 | `.claude/launch.json` và 3 nhánh `wave2/*` |
| b7 | Cách chia sẻ `docs/`; nơi để bản `git bundle` |
| a4 | Cài `jpn` / `jpn_vert`, cấp `GEMINI_API_KEY` và SMTP cho máy kiểm (cũng để kiểm thật `ai_model_primary`) |
| ~~c3~~ | ~~`ai_model_primary`: nối sang ai-service hay ẩn ô~~ Đã chọn nối sang ai-service (`3350f71`); người dùng có thể đổi ý |
| c9 | D2 (5 lần / 15 phút hay 3 lần/giờ); D9 + UC-29 làm hay ghi "Một phần" |
| c10 | Cho admin đưa bộ thẻ trở lại Thư viện |
| §7.1 #14 | SUPER_ADMIN có được đổi vai trò SUPER_ADMIN khác không |
| c14 | Cho phép đổi `failOrphans` (có từ trước) để không làm hỏng job của người khác trên Supabase dùng chung |
| §8c (số migration) | Báo nhóm V29 đã dùng (STAFF-07); chốt số V30–V32 với nhóm (số cuối trên các nhánh khác; Supabase không có dòng V29 cũ) |
| d9 | "Thêm vào lộ trình" (vượt mục *Không làm* của spec) |

## 9. Cách chạy lại và tiếp tục

Môi trường máy này:
- Maven `C:\Users\DELL\tools\apache-maven-3.9.16\bin\mvn`.
- JDK 26 (pom nhắm 17).
- Node 22.14, nên self-check phải chạy kèm `--experimental-strip-types`.
- ai-service venv Python 3.12 ở `ai-service\venv`.
- **Chỉ chạy một tiến trình Maven tại một thời điểm** vì các tiến trình dùng chung `target/`.

**Ba dịch vụ để kiểm tay**: dùng cấu hình trong [`.claude/launch.json`](../../.claude/launch.json) (công cụ preview của Claude
đọc tệp này). Lệnh tương đương, chạy từ thư mục gốc:

```bash
# ai-service :8000
ai-service/venv/Scripts/python.exe -X utf8 -m uvicorn app.main:app --app-dir ai-service --port 8000
# backend profile e2e :8082 (Postgres nhúng, DB mới mỗi lần, không chạm Supabase)
mvn -q -f backend-core/pom.xml spring-boot:test-run -Dspring-boot.run.profiles=e2e -Dspring-boot.run.arguments=--server.port=8082
# frontend :5173, proxy tới backend :8082
BE_PORT=8082 npm --prefix frontend run dev
```

Trong cmd (cách `.claude/launch.json` chạy) thì dòng frontend là `set BE_PORT=8082&& npm --prefix frontend run dev`.
`frontend/vite.config.ts` đọc `process.env.BE_PORT`; không đặt thì proxy trỏ về :8080.

Khi dùng DB thật thay cho e2e: `npm run dev` ở thư mục gốc bật ai-service :8000, backend :8080 và frontend :5173. Cần
`application-local.properties` hoặc biến môi trường, xem README Bước 1–4.

**Test** (giống CI, xem README "Kiểm tra trước khi push"):

```bash
(cd backend-core && mvn -B test)
(cd frontend && npm run lint && npm run build && node --experimental-strip-types scripts/selfCheck.ts)
(cd ai-service && venv/Scripts/python.exe -X utf8 -m pytest -q)
(cd backend-core && mvn -B test -Dtest=LearningPathIT)   # chạy một lớp (trong lần chạy đầy đủ lớp này mất ~6 phút)
npm run e2e        # smoke trên Postgres nhúng
BASE_URL=http://localhost:8082/api node smoke-admin.mjs   # smoke admin, cần backend e2e đang chạy ở :8082
```

Điều kiện của `npm run e2e` (`e2e.mjs`): tự chạy `mvn spring-boot:test-run` ở cổng 8082 (đổi bằng `E2E_PORT`), trùng cổng với cấu hình preview
`backend-e2e`, và là một tiến trình Maven nên không chạy cùng lúc với `mvn test`. Cần `mvn` trên PATH và ai-service ở :8000
cho `smoke-extraction.mjs`. `smoke-admin.mjs` chưa phủ endpoint admin nào của đợt 2 (d4).

**Tiếp tục với Claude**: nói "tiếp tục theo docs/Progress/2026-10-19-tong-ket-va-ke-hoach.md". Claude làm §8a trước, sau đó hỏi
các quyết định ở §8e. Theo quy tắc đã lưu, Claude chỉ commit local từng gói sau khi test xanh và **không push**.

## 10. Phụ lục: 37 lỗi kiểm tay + NEW-01..22 (phát hiện khi kiểm lại / kiểm trực tiếp / review)

Cột "Sau khi sửa" là kỳ vọng khi kiểm lại, tóm từ commit message (có trong git). Cột "Kiểm trực tiếp" lấy từ phiên kiểm lại
19/10 (`wf_39690e9d-79f`), agent sửa lỗi đợt 2 (`wf_e8322dc7-514`) và các lượt kiểm trực tiếp 20/10 (`wf_8e1bb8a2-1e6`,
`wf_eba150af-3cf`, `wf_783c26ac-682`, `wf_a2131754-300`, cùng phần Claude tự kiểm NEW-16 và quét trang admin; chiều 20/10:
`wf_9c24c580-d98`, `wf_5aec64e5-42f`, phần đo của `wf_ea36e4ab-315` / `wf_fde9856d-ce2` và phần Claude tự kiểm admin ở `d5e3c41`),
đều nằm ngoài repo. "Code" = mới kiểm qua code và test.

| Mã | Sau khi sửa | Commit | Kiểm trực tiếp |
|---|---|---|---|
| LC-01 | Âm Hán–Việt đúng (予定 → DỰ ĐỊNH, 郵便局 → BƯU TIỆN CỤC) | `7cc8840` | Có (API/trình duyệt, 20/10) |
| LC-02 | Nghĩa thẻ chữ Hán lấy từ Unihan + bảng sửa tay (日 → "day; sun; Japan") | `7cc8840` | Có (API/trình duyệt, 20/10) |
| LC-03 | 日本 đọc にほん; 日本 / 日本語 / 日本人 xếp N5 | `7cc8840` | Có (API/trình duyệt, 20/10) |
| LC-04 | Thêm từ Hán–Việt vào bộ đã có thẻ cùng term: báo trùng, khoá "Thêm thẻ" (backend chưa chặn, c1) | `4e1143f` | Có |
| LC-05 | Ô vẽ Kanji đứng yên khi vẽ | `4e1143f` | Có |
| LC-06 | Lỗi "Hãy chọn lý do." tự mất khi đã chọn lý do | `4e1143f` | Có |
| LC-07 | Nút "Tải tài liệu (AI)" không còn nhãn "Sắp ra mắt" | `4e1143f` | Có |
| LC-08 | Chip chủ đề Thư viện hiện đủ tên | `4e1143f` | Có |
| LC-09 | Ctrl+K / ⌘K focus ô tìm Thư viện; đầu trang hiện số bộ thẻ công khai thật | `4e1143f` | Có |
| LC-10 | Nhãn tuỳ chọn i+1 khớp ai-service | `4e1143f` | Có |
| LC-11 | Bản đồ Hán–Việt chỉ vẽ số viên vừa quạt + viên "+N từ"; 高校 / 高等学校 là 2 mục, 中学校 = "junior high school" | `4e1143f`, `467fd8e` | Giao diện + dữ liệu: có (20/10) |
| LC-12 | Màn bắt đầu quiz báo "bộ chỉ đủ N câu" | `4e1143f` | Có |
| LP-01 | Bản nháp xem trước bằng đúng `plan()` của lúc kích hoạt | `538d2ab` | Có (API/trình duyệt, 20/10) |
| LP-02 | Dự báo không đếm thẻ đã học trước là thẻ mới | `538d2ab` | Có (API/trình duyệt, 20/10) |
| LP-03 | "Kiểm tra chương" mang `?path=`; màn kết quả có "Về lộ trình" | `4e1143f` | Có |
| LP-04 | "Học gì tiếp" tải lại sau mỗi thao tác ghi | `4e1143f` | Có |
| LP-05 | Lỗi mở "Kiểm tra chương" hiện ngay dưới nút của chương | `4e1143f` | Có |
| LP-06 | Bản nháp báo "Chưa cấu hình khoá Gemini" (`no_api_key`) | `4e1143f` | Có |
| LP-07 | Dải nợ nói đúng lý do "severe" (vượt trần / ngày hay vượt 20 % thẻ còn lại) | `4e1143f` | Code (cần đổi đồng hồ) |
| LP-08 | Tên chương "Ngày N" / "Tuần N (ngày a–b)" đi theo dải ngày | `538d2ab` | Có (API/trình duyệt, 20/10) |
| LP-09 | "Thẻ mới hôm nay (đã học xong)" khi Mới = 0 | `4e1143f` | Có |
| LP-10 | Lộ trình đã xong chỉ có chip "Đã hoàn thành"; widget dashboard cũng vậy, badge không cộng | `4e1143f`, `dc350b7`, `409f4b4` | Có, cả widget (20/10) |
| LP-11 | Ô số ngày / trần sai báo lỗi tại ô; nút "Tạo lộ trình" nói vì sao bị khoá | `4e1143f` | Có |
| STAFF-01 | CORS nhận `localhost`, `127.0.0.1`, `[::1]`; origin bị từ chối nhận 403 JSON tiếng Việt | `538d2ab` | Có (API/trình duyệt, 20/10) |
| STAFF-02 | `/admin/account` cho staff đổi mật khẩu; `/profile` của staff dẫn tới đó | `4e1143f` | Có (trình duyệt, 20/10) |
| STAFF-03 | Staff đăng nhập không ghé Tổng quan người học (không 403) | `4e1143f` | Có (trình duyệt, 20/10) |
| STAFF-04 | Tab "Đội ngũ Staff" gồm cả ADMIN và SUPER_ADMIN | `4e1143f` | Có (trình duyệt, 20/10) |
| STAFF-05 | Khoá / mở khoá / thu hồi phiên / đổi vai trò / gỡ khỏi Thư viện đều đổi câu trạng thái | `4e1143f` | Có (trình duyệt, 20/10) |
| STAFF-06 | "Cơ cấu Bóc tách AI" khi tổng 0 hiện Khác 0 % | `4e1143f` | Code (ca tổng 0 không dựng lại được trên DB e2e đã có 13 lượt bóc tách; trình duyệt 20/10 chỉ thấy ca có dữ liệu) |
| STAFF-07 | Cột "Lý do khoá (lúc gửi)" đọc `lockedReasonAtSubmit` (V29), giữ nguyên sau khi mở / khoá lại; khiếu nại gửi trước V29 hiện lý do hiện tại kèm nhãn; modal xử lý theo trạng thái khoá mới nhất (sáng 20/10 mới có cột "Lý do khoá hiện tại" của `4e1143f`) | `4e1143f`, `4232a4b` | Có (API `wf_9c24c580-d98`, `wf_5aec64e5-42f`; giao diện Claude tự kiểm, 20/10 chiều) |
| STAFF-08 | Kết quả NONE của báo cáo là "Không làm gì" | `4e1143f` | Có (trình duyệt, 20/10) |
| STAFF-09 | Form đánh giá hiện sao + bình luận đã lưu ngay sau khi gửi | `4e1143f` | Có |
| STAFF-10 | Biểu đồ xu hướng / OCR vẽ theo bề rộng thật, đọc được ở 375 px | `4e1143f` | Có (trình duyệt, 20/10) |
| STAFF-11 | Thẻ số liệu không cắt chữ; bảng Nhật ký vừa 1280; cột thao tác dính phải | `4e1143f` | Có (trình duyệt, 20/10) |
| STAFF-12 | Nhật ký kiểm ID người thao tác và khoảng ngày | `4e1143f` | **Chưa đạt** khi gõ chữ vào ô ID (bong bóng tiếng Anh của trình duyệt), sửa ở NEW-08 |
| STAFF-13 | `/setup` kiểm mật khẩu 6–72; lỗi 400 bỏ tiền tố tên trường | `4e1143f` | Có (trình duyệt, 20/10) |
| STAFF-14 | `PUT /api/admin/settings` báo 400 tiếng Việt nêu tên khoá, kể cả thiếu khoá | `538d2ab` | Có (API/trình duyệt, 20/10) |
| NEW-01 | `/quiz` không tràn ngang ở 375 và 1280 px | `dc350b7` | Có (agent sửa lỗi + kiểm lại 20/10) |
| NEW-02 | Thẻ Thư viện ghi "★ x · n đánh giá", lượt tải ghi riêng | `dc350b7` | Có (agent sửa lỗi + kiểm lại 20/10) |
| NEW-03 | Tiêu đề bài "第1課 はじめまして" (bắt đầu bằng chữ trùng trợ từ) được nhận là chương, không còn chương "Mở đầu" giả | `7f66b34`, `4a4a409`, `f1cdf53` | Có, sau NEW-13 (API thật 20/10) |
| NEW-04 | Rút ngắn / đổi trần / bỏ chọn thẻ ở bản nháp không chương: chương "Ngày N" không trùng tên, xem trước = sau kích hoạt | `1f861ff`, `fb656a8`, `4fce06b` | Có (API + giao diện, 20/10) |
| NEW-05 | `completedAt` trả về ở `POST /complete` trùng với các lần đọc sau | `1f861ff` | Có (API, 20/10) |
| NEW-06 | Trang chi tiết lộ trình đã xong chỉ có một chip "Đã hoàn thành" | `20a2331` | Có (trình duyệt, 20/10) |
| NEW-07 | Banner "Bộ thẻ nổi bật" dùng cùng nhãn đánh giá với thẻ bộ thẻ | `20a2331` | Có (trình duyệt, 20/10) |
| NEW-08 | (STAFF-12 còn sót) Lọc nhật ký: gõ chữ / ngày chưa đủ vào ô lọc thì báo tiếng Việt, không còn bong bóng tiếng Anh của trình duyệt; các form admin khác cũng vậy | `faf028b` | Có (trình duyệt, 20/10) |
| NEW-09 | Nhãn ô số liệu biểu đồ OCR không bị cắt ở 1280 / 1024 / 375 px, có tooltip | `faf028b` | Có (trình duyệt 1280 / 1024 / 375, 20/10) |
| NEW-10 | Chú thích "Cơ cấu Bóc tách AI" ("Hoàn thành: …") không bị cắt | `faf028b` | Có (trình duyệt 1280 / 1024 / 375, 20/10) |
| NEW-11 | Gỡ bộ thẻ về riêng tư (admin hoặc chủ) thì bỏ cờ Nổi bật; không bật Nổi bật cho bộ riêng tư | `1c2e5ff`, `faf028b` | Có (API + trình duyệt, 20/10) |
| NEW-12 | Báo cáo: xử lý / bỏ qua có lời báo; tab "Đã xử lý" không còn cột "Thao tác" trống | `faf028b` | Có (trình duyệt, 20/10) |
| NEW-13 | Tên bài cuối bắt đầu bằng chữ giống trợ từ ("第3課 がっこう") không còn làm mất cả 3 chương | `f1cdf53` | Có (API thật, 10/10 ca, 20/10) |
| NEW-14 | Trang `/` không tràn ngang ở 1024 px vì thẻ thư mục | `3b0bfcb` | Có (trình duyệt 1024 / 1280 / 375, 20/10) |
| NEW-15 | Đăng xuất rồi đăng nhập tài khoản khác không bị đưa về trang riêng của người trước | `3b0bfcb` | Có (trình duyệt, 20/10) |
| NEW-16 | Ô ngày ở Nhật ký admin không gửi request theo từng phím | `3b0bfcb` | Có (Claude tự kiểm, mô phỏng giá trị gõ, 20/10) |
| NEW-17 | (major) Lượt luyện tập đang mở trên bộ của chương không còn chiếm chỗ bài kiểm tra chương (trước đây làm 10/10 mà chương không qua, không thông báo): kiểm tra chương luôn mở lượt exam, lượt cũ được nộp thay sau hộp "Nộp bài đang làm dở?" | `657d383` | Có (API HIJACK + giao diện hộp xác nhận / đồng hồ / đạt 80 %, `wf_5aec64e5-42f`) |
| NEW-18 | Chương "Trống" và chương không ra đủ đề không tính vào `chaptersTotal`, nên "N/M chương đã qua kiểm tra" tới được M/M | `657d383` | Có (API 3 → 2, đạt 2/2; giao diện "1/3" khi một chương chỉ 1 thẻ) |
| NEW-19 | Admin đổi được lý do khoá của tài khoản đang khoá (trước đây 200 mà giữ lý do cũ), có audit `USER_LOCK_REASON`; khiếu nại giữ lý do lúc gửi | `177d764` | Có (API, `wf_5aec64e5-42f`) |
| NEW-20 | Khung thông báo không bị cắt mép trái ở 375 px (trước đây lệch −46 px), header không tràn ở 320 px | `ff82190` | Có (trình duyệt 320 / 375 / 414 / 640 / 1280) |
| NEW-21 | Tiêu đề "Bộ thẻ đang học", nhãn số bộ và nút "Mục tiêu học tập" không xuống dòng từng chữ ở 320–900 px; phần còn lại (banner ôn tập ở 768 px, nhãn bảng điều khiển ở 320 px, nút đóng banner bị cắt ở 320 px) ở `a0094a3` | `d1a581e`, `a0094a3` | Có (đo trên trình duyệt 320–1280 px) |
| NEW-22 | Mốc thời gian trong response của lần ghi trùng với lần đọc sau (làm tròn µs); token cấp ngay sau đổi mật khẩu không còn bị 401 ngẫu nhiên (~0,05 %, `passwordChangedAt`, do review tìm ra) | `5a09e31` | Code + IT (528 test); chưa kiểm lại trực tiếp |
