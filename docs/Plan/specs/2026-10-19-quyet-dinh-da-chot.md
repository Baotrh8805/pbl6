# Quyết định đã chốt với người dùng (19/10/2026, chế độ "grill me")

Phạm vi: phủ đủ mục **1.2.1 Yêu cầu về chức năng** của "Yêu cầu chức năng.docx"; **không** cần làm y hệt mục 1.3
(Neo4j, IDS/Levenshtein, NLI, FSRS đúng công thức); **không đụng** code đang chạy tốt.

| # | Câu hỏi | Quyết định | Hệ quả thiết kế |
|---|---|---|---|
| D1 | Hạn chót | **Hơn 1 tháng** | Làm đủ 1.2.1 ở mức chạy thật, có test; không cắt bớt vì thời gian |
| D2 | Xác thực email khi đăng ký (A1) | **Có SMTP thật → chặn cứng** | Tài khoản mới `email_verified_at = null` không đăng nhập được tới khi bấm link (token 24 giờ, gửi lại tối đa 3 lần/giờ); thiếu `spring.mail.host` thì link ghi log (như quên mật khẩu) — dev vẫn chạy được |
| D3 | Phát âm (E3) / trọng âm (E4) | **Trình duyệt** | Web Speech API (`SpeechRecognition` lang ja-JP) + `speechSynthesis`; cao độ F0 bằng WebAudio autocorrelation; chấm điểm so khớp kana/mora + đường F0 với mẫu (mẫu = TTS ghi lại hoặc mẫu cao độ theo kiểu trọng âm 平板/頭高/中高/尾高 từ dữ liệu); ai-service chỉ lưu kết quả, không nhận file ghi âm |
| D4 | Kiểm tra cuối chương (Lộ trình 2.0) | **Chỉ gắn nhãn**, không chặn chương sau | `quiz_passed_at`; nhắc làm lại nếu chưa đạt |
| D5 | Mẹo nhớ bộ thủ (C4) | **Gemini + mẫu dự phòng** | Hết quota → sinh theo mẫu từ bộ thủ + âm Hán–Việt; mọi mẹo ở trạng thái `PENDING`, admin duyệt (G2) rồi mới công khai |
| D6 | Mâu thuẫn tài liệu (F2) + nguồn chuẩn (G4) | **Từ điển + tài liệu chuẩn admin tải** | So cách đọc / nghĩa / cấp JLPT / mẫu ngữ pháp với JMdict + JLPT + patterns.yaml; admin tải bộ thẻ "chuẩn" (`knowledge_sources`) làm nguồn ưu tiên; cảnh báo kèm độ tin cậy ở trang bóc tách và bản nháp lộ trình |
| D7 | Migration trên Supabase dùng chung | **Cứ thêm khi cần, chưa cần sao lưu** | Migration chỉ thêm cột/bảng, dùng `IF NOT EXISTS`/`DO $$` an toàn; không xoá dữ liệu |
| D8 | Staff có học không | **Giữ nguyên: staff không học** | Không đổi SecurityConfig/AZ-10 |
| D9 | Link chia sẻ bộ thẻ (D2) | **Người đã đăng nhập** mở được | `decks.share_token` (null = tắt); có token = xem + học + sao chép dù private; chủ tạo/đổi/thu hồi; chưa đăng nhập → login rồi quay lại `/d/<token>` |
| D10 | Dữ liệu viết Kanji (E2) | **Dùng KanjiVG** (CC BY-SA 3.0) | `build_dicts.py --only kanjivg` tải và rút gọn thành `kanjivg_strokes.json` (không commit), DTW từng nét trong ai-service; ghi nguồn + giấy phép vào `data/README.md` |
| D11 | Ngân hàng câu hỏi (G3, C2, C3, C7) | **Lưu ngân hàng theo thẻ** | Bảng `quiz_questions` + `question_flags` (V22; loại: nghĩa / kanji giống hình / đồng âm / cách đọc tự gõ / chia thể — không có loại on-kun; sửa 27/10 theo code); người học báo lỗi câu; admin xem/sửa/gỡ; quiz bốc từ ngân hàng, thiếu thì sinh thêm |
| D12 | Lộ trình 2.0: ngày nghỉ trong tuần + trần thẻ/ngày | **Giữ cả hai** | Mặc định 7 ngày/tuần; trần mặc định **50** (đổi từ 30 ngày 19/10 chiều: trần tính cả thẻ ôn dự báo nên 30 chỉ còn ~5–8 thẻ mới/ngày; admin chỉnh được qua `learning_path_daily_cap_default`); hiện ở bản nháp và cài đặt lộ trình |
| D13 | Dữ liệu chữ Hán ngoài JLPT / Unihan (E2, C2, C3) | **Được tải KRADFILE (EDRDG) và kanjium (CC BY-SA)** — người dùng đồng ý 19/10, ghi bù 27/10 | `build_dicts.py --only kradfile\|pitch`, file không commit; ghi nguồn ở `/about/data` |

Ngoài phạm vi (không nằm trong 1.2.1): thanh toán (UC-40), Google OAuth, ASR/Praat phía server. ~~GraphRAG/Neo4j thật~~ → làm
đúng đề cương từ 27/10 (**D30**, xem cuối tài liệu).

## 26/10/2026: Từ điển Nhật–Việt cộng đồng (grill me 4 vòng, 16 câu)

Spec: [2026-10-26-tu-dien-design.md](2026-10-26-tu-dien-design.md) (bảng đầy đủ + quyết định kỹ thuật K1–K10); kế hoạch:
[../plans/2026-10-26-tu-dien-va-viec-con-lai.md](../plans/2026-10-26-tu-dien-va-viec-con-lai.md). Tính năng ngoài 1.2.1, đề xuất UC-43..45.

| # | Câu hỏi | Quyết định | Hệ quả thiết kế |
|---|---|---|---|
| D14 | Phạm vi trang Từ điển | **Từ vựng + gộp Hán tự (`/kanji`) + Hán-Việt (`/han-viet`) + Sổ tay** thành `/dictionary` dạng tab | Route cũ redirect giữ tham số; không viết lại hai trang cũ; tab Ngữ pháp / Câu ví dụ để sau |
| D15 | Nguồn nghĩa tiếng Việt | **Dịch sẵn ~8 000 từ JLPT bằng script 1 lần (commit CSV) + Gemini dịch khi tra lần đầu, lưu vĩnh viễn** | `dict_meanings` ở Postgres; admin sửa; không khoá Gemini → nghĩa Anh |
| D16 | Hàng chờ admin | **Mục bị báo cáo lên đầu, rồi mục chỉ có nghĩa Anh / nghĩa máy chưa kiểm** | `/admin/dictionary` tab Hàng chờ xếp 3 nhóm |
| D17 | Câu ví dụ | **Tatoeba qua "JMdict with examples" + Gemini dịch khi tra; thêm câu từ tài liệu người học** | Dựng lại `jmdict.sqlite` (JMdict đầy đủ, có id) |
| D18 | Hướng tra | **Nhật (kanji / kana / romaji) ↔ Việt + Anh** | Romaji → kana ở frontend; Anh = FTS gloss (ai-service); Việt = `dict_meanings` (backend) |
| D19 | Bình luận | **Phẳng + Hữu ích; sửa / xoá của mình; báo cáo bình luận; admin ẩn / xoá** | Không trả lời lồng |
| D20 | Báo cáo từ điển | **Trường sai + đề xuất sửa + ghi chú; admin Áp dụng đề xuất / sửa tay / từ chối; thông báo người báo** | `dict_reports` (ENTRY / COMMENT) |
| D21 | Quyền sửa từ điển gốc | **ADMIN và SUPER_ADMIN sửa trực tiếp**, audit + lịch sử + hoàn tác | Không duyệt hai cấp |
| D22 | Tầm ảnh hưởng bản sửa | **Toàn hệ thống** (bóc tách, dịch nghĩa, mâu thuẫn, thẻ chữ Hán) | Ghi đè đẩy backend → ai-service; bóc tách lấy nghĩa Việt từ từ điển trước khi gọi Gemini |
| D23 | Nghĩa máy chưa kiểm | **Hiện ngay, KHÔNG nhãn "bản dịch máy"**, chỉ nút báo lỗi | MACHINE / VERIFIED chỉ dùng nội bộ |
| D24 | Đăng nhập | **Phải đăng nhập** | Staff dùng qua `/admin/dictionary` (D8 giữ) |
| D25 | Nối với phần học | **Thêm vào bộ thẻ + lịch sử + sổ tay + popup tra nhanh** | Dùng lại `AddWordToDeckModal`, `DeckService.addCards` |
| D26 | Hạn mức Gemini lúc tra | **Mọi người, trần theo giờ / tài khoản** (`dictionary_ai_hourly_limit` = 30); từ đã có bản dịch không tính | Hết trần vẫn tra, hiện nghĩa Anh |
| D27 | Việc cũ đưa vào plan | **Cả 4 nhóm** (D9 + UC-29; hiệu quả lộ trình + nhắc email; nợ nhỏ + trang ghi nguồn; CI / smoke / failOrphans / tài liệu) | Phần B của kế hoạch |
| D28 | Hạn, cách viết plan | **Từ điển ~2 tuần; plan chỉ liệt kê việc, không chia ngày** | — |
| D29 | Chữ Hán | **Bình luận / báo cáo cho cả từ vựng và từng chữ Hán** | Khoá `w:` và `k:` |

## 27/10/2026: Đồ thị tri thức Neo4j + GraphRAG (UC-34, UC-35)

Spec: [2026-10-27-do-thi-tri-thuc-neo4j-design.md](2026-10-27-do-thi-tri-thuc-neo4j-design.md); kế hoạch
[../plans/2026-10-27-do-thi-tri-thuc-neo4j.md](../plans/2026-10-27-do-thi-tri-thuc-neo4j.md).

| # | Câu hỏi | Quyết định | Hệ quả |
|---|---|---|---|
| D30 | UC-34 / UC-35 (19/10 ghi "ngoài phạm vi") | **Làm đúng đề cương**: Neo4j thật (`docker compose up -d neo4j`), đồng bộ Postgres → Neo4j qua ai-service, truy vấn Cypher, GraphRAG với Gemini (thiếu khoá → trả lời mẫu từ đồ thị) | Thêm một dịch vụ Docker khi triển khai; ai-service là tầng duy nhất nối Neo4j; không migration Postgres; nhánh "văn bản" của hợp nhất song song dùng FTS / tìm câu, không nhúng vector |

## 27/10/2026 (đêm): Kiểm duyệt bình luận bằng AI + mô hình trí nhớ HLR

Spec: [2026-10-27-kiem-duyet-ai-va-hlr-design.md](2026-10-27-kiem-duyet-ai-va-hlr-design.md); kế hoạch
[../plans/2026-10-27-kiem-duyet-ai-va-hlr.md](../plans/2026-10-27-kiem-duyet-ai-va-hlr.md). Grill me 5 vòng, 16 câu; từ câu 16 người dùng giao tự quyết.

| # | Câu hỏi | Quyết định | Hệ quả |
|---|---|---|---|
| D31 | Kiểm duyệt văn bản người dùng bằng ViHSD (3 lớp) + ViHOS (từ vi phạm) | Mục tốt + thù ghét → **chặn nhưng giữ hàng chờ admin** (tác giả thấy lý do, sửa gửi lại; admin khôi phục; tự xoá 30 ngày); nhãn 1 → đăng + cờ; "nhạy cảm" = **JMdict vulg/X/derog/sens/sl + công tắc admin** → đăng + cờ; chặn chỉ khi **hai model cùng đồng ý** (p2 ≥ 0,8 và ≥ 1 từ); chấm **đồng bộ 3 s, lỗi → PENDING + job 5 phút**; phạm vi bình luận từ điển + đánh giá bộ thẻ + mẹo nhớ (chỉ nhãn) + tên hồ sơ (400); FLAGGED công khai **che từ**; 3 lần chặn / 24 h → **khoá bình luận 24 h** | V38 cột `mod_*`, bảng `dict_sensitive`, trang `/admin/moderation`, badge `openModeration`; model chạy ở ai-service (`models/`, không commit; PhoBERT cần `requirements-ml.txt`) |
| D32 | HLR (`best-halflife-portable.pt`) trong lịch ôn | Ban đầu "HLR lập lịch chính, SM-2 dự phòng"; sau khi đo đường cong gần phẳng theo thời gian (khoảng ôn suy biến 0 ↔ 95 ngày) đổi thành **SM-2 lập lịch, HLR phanh + hiển thị**: p < 0,8235 → khoảng ôn không tăng; độ nhớ, "sắp quên" (p < 0,7), thẻ đến hạn xếp p thấp trước; bỏ cài đặt mục tiêu p; thành thạo giữ ≥ 21 ngày; numpy trong ai-service | V38 `reviews.seen/correct/last_reviewed_at/recall_p/hlr_brake`, `/api/hlr/predict`, `GET /api/decks/{id}/recall`, tín hiệu `low_recall` |
