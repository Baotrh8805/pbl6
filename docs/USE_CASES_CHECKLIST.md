# Bảng Phân Chia 7 Phân Hệ & 42 Use Case Theo 3 Sprint

> Trạng thái cập nhật 30/09/2026 theo code thực tế (commit `0d90c0f`, nhánh `Backend`): `[x]` = đã chạy được và có test;
> ghi chú in nghiêng = làm một phần. Tổng kết đợt gần nhất: [Progress/30-9.md](Progress/30-9.md).

| Sprint | Số UC | Xong | Một phần | Còn lại |
| :--- | :---: | :---: | :---: | :---: |
| Sprint 1 (UC-01 → UC-16) | 16 | 6 | 2 | 8 (chủ yếu AI: upload, OCR, NLP, sinh thẻ) |
| Sprint 2 (UC-17 → UC-29) | 13 | 5 | 0 | 8 |
| Sprint 3 (UC-30 → UC-42) | 13 | 0 | 0 | 13 |
| **Tổng** | **42** | **11** | **2** | **29** |

Dự án gồm **7 phân hệ chức năng** và **42 use case**. Để nhóm vừa làm vừa học hiệu quả mà không bị ngợp, công việc được chia làm 3 Sprint:

---

## 🏃 Sprint 1: Nền Tảng & MVP Tự Động Sinh Thẻ (Tuần 1 - 3)
*Mục tiêu: Hoàn thiện luồng tạo tài khoản, upload tài liệu đơn giản, trích xuất từ vựng và hiển thị flashcard có âm Hán-Việt.*

### Phân hệ 1: Quản lý tài khoản (Auth & Profiles)
- [ ] UC-01: Đăng ký tài khoản (Email / Google OAuth). *(đã có Email; chưa có Google OAuth)*
- [ ] UC-02: Đăng nhập & cấp JWT Access/Refresh Token. *(đã có JWT Access Token; chưa có Refresh Token)*
- [x] UC-03: Quản lý thông tin cá nhân & trình độ JLPT hiện tại.
- [x] UC-04: Đổi mật khẩu / Khôi phục tài khoản. *(quên mật khẩu gửi email thật khi đã cấu hình SMTP, xem [SUPABASE_SETUP.md](SUPABASE_SETUP.md#5-gửi-email-quên-mật-khẩu-smtp); chưa cấu hình thì link chỉ ghi vào log backend)*

### Phân hệ 2: Tiếp nhận & Xử lý tài liệu (Cơ bản)
- [ ] UC-05: Tải lên hình ảnh tài liệu tiếng Nhật (JPG/PNG).
- [ ] UC-06: Tải lên tài liệu dạng văn bản / PDF.
- [ ] UC-07: OCR nhận dạng văn bản tiếng Nhật cơ bản.
- [ ] UC-08: Tách từ tiếng Nhật (Sudachi / MeCab).
- [ ] UC-09: Tự động gán phiên âm Furigana cho từ vựng.
- [ ] UC-10: Tra cứu và tự động gán âm Hán-Việt tương ứng.

### Phân hệ 3: Sinh học liệu bằng AI (Cơ bản)
- [ ] UC-11: Tự động sinh bộ Flashcard từ danh sách từ vựng OCR.
- [ ] UC-12: Tự động tạo ví dụ và dịch nghĩa câu ví dụ.
- [x] UC-13: Chỉnh sửa thủ công nội dung Flashcard sau khi AI tạo. *(sửa thủ công thẻ trong trình soạn / trang bộ thẻ)*

### Phân hệ 4: Quản lý & Chia sẻ bộ thẻ (Cơ bản)
- [x] UC-14: Tạo mới / sửa / xóa Bộ thẻ (Deck).
- [x] UC-15: Xem danh sách bộ thẻ cá nhân.
- [x] UC-16: Chế độ lật thẻ học từ vựng (Flip Flashcard).

---

## 🏃 Sprint 2: Luyện Tập Đa Giác Quan & Quiz Thông Minh (Tuần 4 - 6)
*Mục tiêu: Tích hợp chấm nét vẽ Kanji (DTW), OCR chữ dọc, phân tầng JLPT và sinh trắc nghiệm có câu nhiễu.*

### Tiếp nối Phân hệ 2 & 3:
- [ ] UC-17: OCR tài liệu chữ dọc (Tatechugaki) và xử lý phân đoạn văn bản.
- [ ] UC-18: Phân loại cấp độ từ vựng/ngữ pháp theo 5 bậc JLPT (N5 - N1).
- [x] UC-19: Tự động sinh bài kiểm tra trắc nghiệm (Quiz) từ bộ thẻ. *(sinh đề từ bộ thẻ bằng thuật toán, chưa dùng AI)*
- [ ] UC-20: AI sinh các phương án gây nhiễu (distractors) có căn cứ ngôn ngữ học (dễ nhầm Kanji, cách đọc onyomi/kunyomi).
- [ ] UC-21: Cơ chế Sinh-rồi-lọc (Generate-then-filter) kiểm tra chất lượng câu hỏi.

### Phân hệ 5: Luyện tập đa giác quan & Chấm điểm
- [ ] UC-22: Giao diện vẽ nét Kanji trên màn hình cảm ứng / Canvas.
- [ ] UC-23: Thuật toán DTW (Dynamic Time Warping) so khớp thứ tự và hình dáng nét viết Kanji.
- [ ] UC-24: Chấm điểm và đưa ra phản hồi nét viết (đúng nét, sai hướng, sai thứ tự).
- [x] UC-25: Làm bài Quiz trắc nghiệm và tính điểm trực tiếp. *(chấm ở server, có hạn giờ, mỗi lượt nộp 1 lần)*
- [x] UC-26: Thuật toán lặp lại ngắt quãng (Spaced Repetition System - SRS) nhắc ôn từ vựng.

### Tiếp nối Phân hệ 4:
- [x] UC-27: Chia sẻ bộ thẻ công khai cho cộng đồng người học. *(kèm chia sẻ bộ thẻ / thư mục qua email, quyền xem & học)*
- [x] UC-28: Tìm kiếm và sao chép bộ thẻ của người khác về tài khoản mình.
- [ ] UC-29: Xuất dữ liệu bộ thẻ ra file (Anki format / CSV / PDF).

---

## 🏃 Sprint 3: Tính Năng Đột Phá, Praat & GraphRAG (Tuần 7 - 9)
*Mục tiêu: Đánh giá ngữ điệu phát âm (Praat), đồ thị tri thức Neo4j, phát hiện mâu thuẫn tài liệu và báo cáo thống kê.*

### Tiếp nối Phân hệ 5 (Luyện phát âm):
- [ ] UC-30: Thu âm giọng đọc từ vựng / câu tiếng Nhật của người học.
- [ ] UC-31: Phân tích ASR nhận dạng giọng nói.
- [ ] UC-32: Trích xuất đường bao cao độ F0 (Pitch Accent) bằng Praat / Parselmouth.
- [ ] UC-33: So sánh biểu đồ cao độ của học viên với người bản xứ và chấm điểm khách quan.

### Phân hệ 6: Cá nhân hóa lộ trình & GraphRAG
- [ ] UC-34: Xây dựng đồ thị tri thức (Knowledge Graph) từ vựng - ngữ pháp trên Neo4j.
- [ ] UC-35: Ứng dụng GraphRAG truy vấn ngữ cảnh học tập theo đồ thị.
- [ ] UC-36: Phát hiện mâu thuẫn kiến thức giữa các tài liệu tự sưu tầm của người học.
- [ ] UC-37: Đề xuất lộ trình học bổ khuyết các điểm yếu của từng cá nhân.

### Phân hệ 7: Quản trị hệ thống & Thương mại hóa
- [ ] UC-38: Dashboard quản trị: thống kê số lượng người dùng, bộ thẻ, lượt tạo AI.
- [ ] UC-39: Quản lý giới hạn lượt gọi AI (Rate limit) cho tài khoản Free vs Pro.
- [ ] UC-40: Tích hợp cổng thanh toán gói Pro (PayOS / VietQR / VNPay Sandbox).
- [ ] UC-41: Quản lý báo cáo nội dung sai lệch / vi phạm bản quyền từ người dùng.
- [ ] UC-42: Sao lưu và khôi phục dữ liệu hệ thống.
