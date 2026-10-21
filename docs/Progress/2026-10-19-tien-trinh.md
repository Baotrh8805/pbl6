# Tiến trình 19–20/10/2026 (nhật ký theo thời gian; trạng thái hiện tại ở §9 và tài liệu tổng kết)

Mục tiêu: phủ đủ mục 1.2.1 "Yêu cầu chức năng" + Lộ trình học tập 2.0 + hoàn thiện Admin/Super admin.
Tài liệu liên quan (đều trong `docs/`, bị gitignore nên chỉ có trên máy này):
- Quyết định đã chốt: [Plan/specs/2026-10-19-quyet-dinh-da-chot.md](../Plan/specs/2026-10-19-quyet-dinh-da-chot.md)
- Spec Lộ trình 2.0: [Plan/specs/2026-10-19-lo-trinh-hoc-tap-2-design.md](../Plan/specs/2026-10-19-lo-trinh-hoc-tap-2-design.md)
- Kế hoạch tổng: [Plan/plans/2026-10-19-ke-hoach-tong-1-2-1.md](../Plan/plans/2026-10-19-ke-hoach-tong-1-2-1.md)
- Hợp đồng API đợt 2: [Plan/specs/2026-10-19-hop-dong-api-dot-2.md](../Plan/specs/2026-10-19-hop-dong-api-dot-2.md)

## 1. Đã xong và đã commit (nhánh `backend-feature-learnmode`, local, CHƯA push)

| Commit | Nội dung | Kiểm chứng |
|---|---|---|
| `6a55d55` | ai-service: tách furigana PDF/OCR, khử nhập nhằng cách đọc, cấp JLPT toàn tài liệu, câu nhiễu Kanji giống hình + đồng âm, mâu thuẫn tài liệu, chấm nét Kanji (DTW/KanjiVG), trọng âm (kanjium), bản đồ Hán-Việt, thẻ On/Kun, 214 bộ thủ + mẹo nhớ, chia thể động từ, câu i+1, khoá nội bộ mọi router | pytest 1235 passed |
| `e6312d3` | backend: Lộ trình học tập 2.0 (V20, V21), điểm yếu, ma sát trí nhớ, học gì tiếp, lộ trình bổ khuyết, nhắc học, tham số AI, proxy NLP | mvn test 326/326 |
| `bc72a91` | backend: hàm gọi ai-service dùng chung `getJson/postJson/postJsonLong` | AiServiceClientNlpTest 4/4 |
| `174135e` | frontend: toàn bộ giao diện đợt 1 + đợt 2 (lộ trình 2.0, quiz đa loại, luyện tập, Kanji, Hán-Việt, xác thực email, khiếu nại, các trang admin mới) | lint + build + selfCheck xanh |

Dữ liệu ai-service đã dựng (gitignore, chỉ có trên máy): `jmdict.sqlite`, `kanji_strokes.json`, `kradfile.csv`,
`pitch_accent.csv`; `unihan_rs.csv`, `radicals_214.csv` đã commit.

## 2. (Lịch sử, đã xong tối 19/10, xem §5) Backend đợt 2 (V22–V28) trên 3 worktree

Workflow: `docs/.workflows/backend-wave2.js` (run id `wf_2e4e621b-358`), đã DỪNG theo yêu cầu.

| Làn | Worktree / nhánh | Bước 1 | Bước 2 |
|---|---|---|---|
| quiz | `D:\University\PBL6\pbl6-w1` / `wave2/quiz` | XONG (V22, pos + distractors, quiz-capabilities, sinh câu nhiễu, KanaUtil, QuizAiClient) | DỞ (loại câu hỏi trong QuizService/QuizAttemptService, cờ báo lỗi, admin ngân hàng câu hỏi) |
| practice-auth | `D:\University\PBL6\pbl6-w2` / `wave2/practice-auth` | XONG (V23 practice_logs + /api/practice/**, /api/reviews/activity + streak) | DỞ (V24 xác thực email, V27 khiếu nại) |
| content | `D:\University\PBL6\pbl6-w3` / `wave2/content` | XONG (V25 mẹo nhớ + duyệt, gộp mẹo đã duyệt vào thẻ bộ thủ) | DỞ (V26 cảnh báo mâu thuẫn, V28 nguồn tri thức, i+1) |

(Lúc đó) thay đổi của các làn chưa commit, nằm trong từng worktree. Nay đã commit và gộp (§5); thư mục `pbl6-w1/w2/w3` đã gỡ, chỉ
còn 3 nhánh `wave2/*`.
Sau bước 2: review → sửa + chạy toàn bộ test trong worktree → commit trên nhánh làn → gộp vào `backend-feature-learnmode`,
thêm thống kê admin (openQuestionFlags, pendingMnemonics, openAppeals) + hiệu suất AI/tỷ lệ lỗi OCR, ma trận phân quyền,
chạy toàn bộ test, commit → so khớp frontend với backend thật.

## 3. Cách tiếp tục

Không dùng nữa: workflow `backend-wave2.js` (`wf_2e4e621b-358`) đã chạy xong và gộp (§5), worktree đã gỡ; đừng chạy lại. Muốn
tiếp tục, nói "tiếp tục theo docs/Progress/2026-10-19-tong-ket-va-ke-hoach.md" (tổng kết §9).

Sau khi backend đợt 2 xong còn: kiểm tay trên trình duyệt (1280 px và 375 px) với cả 3 dịch vụ đang chạy, cập nhật
README/.env.example (SMTP, khoá xác thực email), `docs/USE_CASES_CHECKLIST.md`, `docs/CHANGELOG.md`.

## 4. Môi trường máy
- Maven: `C:\Users\DELL\tools\apache-maven-3.9.16\bin\mvn` (đã thêm vào PATH người dùng; terminal mới mới thấy).
- JDK 26 (pom nhắm 17, chạy được). Node 22.14: selfCheck chạy bằng `node --experimental-strip-types scripts/selfCheck.ts`.
- ai-service venv: `ai-service\venv` (Python 3.12).

## 5. Cập nhật (tối 19/10, sau khi chạy tiếp)
- Backend đợt 2 XONG và đã gộp: làn f125265 (luyện tập, xác thực email, khiếu nại, hoạt động), 48c1a33 (quiz đa loại + ngân hàng câu hỏi),
  e0ce4d4 (mẹo nhớ, mâu thuẫn, nguồn chuẩn, i+1); merge b1be63a/3cdebbd/0cde82f; tích hợp d7b9955 (thống kê admin, hiệu suất AI,
  ma trận phân quyền) — `mvn test` 490/490; khớp frontend–backend b6a01cf. Worktree đã gỡ, nhánh `wave2/*` còn giữ.
- Đợt dọn (đã xong 21:46–21:49: `1d1c5e2`, `580568a`, `d2c42c7`, `5172ddc`): ai-service trả doc*, chặn thao tác trên tài khoản
  đã xoá, thông báo lỗi máy chủ trên frontend, README/.env.example.
- Còn lại: kiểm tay trên trình duyệt (1280/375 px) với 3 dịch vụ chạy thật, sửa lỗi phát hiện, tài liệu cuối.

## 6. Kiểm tay trên trình duyệt (đêm 19/10)
- Đợt dọn đã commit: 580568a (chặn thao tác trên tài khoản đã xoá), 5172ddc (tài liệu tính năng, cài dữ liệu, SMTP).
- Kiểm tay 3 dịch vụ chạy thật (ai-service :8000, backend profile e2e :8082 trên Postgres nhúng, frontend :5173 với
  BE_PORT=8082), 1280 px và 375 px, đủ vai trò USER / ADMIN / SUPER_ADMIN: tìm thấy 37 lỗi.
- Đã sửa và commit: 4e1143f (frontend), 538d2ab (backend), 7cc8840 (ai-service: Hán-Việt ghi đè, nghĩa Kanji).
- Kiểm lại còn 4 lỗi, đã sửa bằng workflow `wf_e8322dc7-514` (commit ở §7: `dc350b7`, `409f4b4`, `467fd8e`): LC-11 (mục JLPT ghép "高校; 高等学校", nghĩa sai
  中学校), LP-10 (widget "Lộ trình hôm nay" vẫn hiện lộ trình đã xong), NEW-01 (trang /quiz tràn ngang),
  NEW-02 (thẻ Thư viện hiện số lượt tải như số đánh giá). Test và kiểm trực tiếp sau đó: §7, §8.
- Cấu hình máy chủ xem trước: `.claude/launch.json` (chưa commit, chỉ dùng trên máy này).

## 7. Cập nhật (00:15 ngày 20/10): đã sửa 4 lỗi cuối, xem tài liệu tổng kết
- 4 lỗi còn lại của mục 6 đã sửa và commit:
  - `dc350b7` (frontend): LP-10 widget, NEW-01, NEW-02.
  - `409f4b4` (backend): `today-summary` có `completedAt` / `done`.
  - `467fd8e` (ai-service): LC-11 tách mục JLPT nhiều biến thể.
- Test ở `467fd8e` (HEAD lúc đó; số mới nhất ở §8): backend `mvn -B test` **497 test / 69 lớp, 0 lỗi** (xong 00:21 ngày 20/10); ai-service 1296 passed,
  2 skipped, 1 xfailed; frontend lint, build và self-check xanh. CI chưa chạy (chưa push).
- Tổng kết toàn bộ việc đã làm, bảng phủ 1.2.1, việc tồn đọng và kế hoạch tiếp theo:
  [2026-10-19-tong-ket-va-ke-hoach.md](2026-10-19-tong-ket-va-ke-hoach.md).

## 8. Cập nhật (sáng 20/10): kiểm trực tiếp sau khi khởi động lại, sửa NEW-03..16 — đã xong
- Khởi động lại 3 dịch vụ, kiểm trực tiếp nhiều lượt (API, người học, admin; 1280 / 1024 / 375 px); lượt cuối đạt hết.
- 12 commit mới: `7f66b34`, `1f861ff`, `20a2331`, `4a4a409`, `fb656a8`, `1c2e5ff`, `638b963`, `faf028b`, `74f97cc`, `4fce06b`,
  `3b0bfcb`, `f1cdf53` (HEAD). Chi tiết: CHANGELOG mục 20/10 và tài liệu tổng kết §5, §10.
- Máy mất nguồn lúc 02:01 giữa workflow; chạy lại từ chỗ dở (bản sao các script ở `docs/.workflows/`).
- Bỏ migration V29 "Nổi bật" (số V29 chiều 20/10 dùng cho STAFF-07, chỉ thêm cột, §9) và bỏ bước quét bản nháp lúc khởi động để
  không ghi vào Supabase dùng chung (quyết định D7).
- Test cuối: backend 510 / 69 lớp, 0 lỗi; ai-service 1326 passed, 2 skipped, 1 xfailed; frontend xanh.
- Việc tiếp theo và các quyết định chờ người dùng: tài liệu tổng kết §8 (đặc biệt §8b, §8e).

## 9. Cập nhật (chiều 20/10): làm nốt phần còn thiếu của Lộ trình / Admin — đã xong
- 10 commit mới: `8de6ea1` (D4 "Trống" + "Chưa đạt N% — Làm lại"), `4232a4b` (STAFF-07, migration V29), `3350f71`
  (`ai_model_primary` có tác dụng), `d5e3c41` (spec LP-13 / LP-15, thẻ lộ trình ở Tổng quan admin), `657d383`, `177d764`,
  `ff82190`, `d1a581e`, `5a09e31`, `a0094a3` (HEAD; NEW-17..22 và chỉnh dashboard ở màn hẹp). 44 commit kể từ `de8accb`, chưa push.
- Kiểm trực tiếp 2 lượt.
  - HEAD `d5e3c41`: API 11/11, giao diện người học 13/13. Tìm thêm NEW-17..20, sửa ở `657d383`, `177d764`, `ff82190`.
  - HEAD `ff82190`: API 10/10; giao diện đạt hết trừ tiêu đề dashboard (NEW-21, sửa ở `d1a581e`). Ghi nhận NEW-22, sửa ở
    `5a09e31` và mới kiểm bằng IT.
- Test cuối: backend 528 / 70 lớp, 0 lỗi; ai-service 1340 passed, 2 skipped, 1 xfailed; frontend xanh.
- Chi tiết: CHANGELOG mục "20/10/2026 (chiều)" và tài liệu tổng kết §5, §6.2, §7, §10.

## 10. Bàn giao (chiều 20/10)
- Code xong, HEAD `a0094a3`, 44 commit local (chưa push). Test đầy đủ gần nhất: backend 528 / 70 lớp ở `5a09e31`, ai-service 1340
  passed, frontend xanh.
- Theo yêu cầu, Claude dừng kiểm trực tiếp; đã kiểm gì và 12 việc còn lại để người dùng tự kiểm: tài liệu tổng kết §8a.1.
