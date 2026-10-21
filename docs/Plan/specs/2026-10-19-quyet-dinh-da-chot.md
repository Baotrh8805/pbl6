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
| D11 | Ngân hàng câu hỏi (G3, C2, C3, C7) | **Lưu ngân hàng theo thẻ** | Bảng `question_bank` (loại: nghĩa / kanji giống hình / đồng âm / chia thể / on-kun); người học báo lỗi câu; admin xem/sửa/gỡ; quiz bốc từ ngân hàng, thiếu thì sinh thêm |
| D12 | Lộ trình 2.0: ngày nghỉ trong tuần + trần thẻ/ngày | **Giữ cả hai** | Mặc định 7 ngày/tuần; trần mặc định **50** (đổi từ 30 ngày 19/10 chiều: trần tính cả thẻ ôn dự báo nên 30 chỉ còn ~5–8 thẻ mới/ngày; admin chỉnh được qua `learning_path_daily_cap_default`); hiện ở bản nháp và cài đặt lộ trình |

Ngoài phạm vi (không nằm trong 1.2.1): thanh toán (UC-40), Google OAuth, GraphRAG/Neo4j thật, ASR/Praat phía server.
