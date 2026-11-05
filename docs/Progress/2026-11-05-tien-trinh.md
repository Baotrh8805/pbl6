# Tiến trình cập nhật 05/11/2026: Tối ưu học tập Flashcard, Xáo thẻ 2 chiều, Nhập thẻ thông minh & Trải nghiệm người dùng

> Tài liệu ghi nhận các hạng mục phát triển, cải tiến và hoàn thiện hệ thống trên nhánh `test2` và các nhánh liên quan tính đến ngày 05/11/2026.
> Các mốc trước: [2026-10-19-tien-trinh.md](2026-10-19-tien-trinh.md), [2026-10-19-tong-ket-va-ke-hoach.md](2026-10-19-tong-ket-va-ke-hoach.md).

---

## 1. Tóm tắt kết quả kiểm tra chất lượng

| Kiểm tra | Kết quả | Ghi chú |
| :--- | :--- | :--- |
| **Frontend TypeScript check** | **0 errors, 0 warnings** | Kiểm tra biên dịch sạch trên `StudyPage.tsx`, `importParser.ts`, `ShortcutHelpModal.tsx`, `studyUtils.ts` |
| **Lint & Syntax check** | Đạt chuẩn | Không còn warning dependency React Compiler, không còn biến/import thừa |
| **Kiểm thử trải nghiệm người dùng (UI/UX)** | Đạt yêu cầu | Đã kiểm chứng trực quan trên giao diện học tập: phím tắt <kbd>S</kbd>, menu tùy chọn phân tầng, lật thẻ kiểu Quizlet, xáo trộn 2 chiều, nhập danh sách thẻ |

---

## 2. Chi tiết các hạng mục đã hoàn thành

### A. Tối ưu hóa trải nghiệm học tập Flashcard (`StudyPage.tsx`)
1. **Thiết kế lại Menu tùy chọn học tập theo cấu trúc phân tầng trực quan**:
   * **Tầng 1 - Chế độ học**:
     * *Đọc*: Học qua nhận diện mặt chữ, hiển thị đầy đủ tùy chọn hiển thị mặt thẻ.
     * *Nghe*: Chuyên sâu luyện nghe phát âm (ẩn chữ mặt trước, chỉ phát âm thanh và hiển thị Kanji khi lật).
   * **Tầng 2 - Mặt trước thẻ**:
     * Cho phép linh hoạt chọn hiển thị: **Kanji**, **Hiragana** (Cách đọc), hoặc **Định nghĩa**.
     * Ở chế độ Nghe: Cố định mặt trước là Kanji (ẩn chữ luyện nghe) để tránh xung đột logic.
   * **Tầng 3 - Cách hiển thị khi lật (áp dụng cho chế độ Đọc)**:
     * *Hiện cả hai mặt (Mặc định)*: Nửa trên giữ mặt trước, nửa dưới mở rộng hiển thị đáp án.
     * *Lật thẻ (Kiểu Quizlet)*: Mặt trước biến mất hoàn toàn khi lật, mặt sau hiển thị toàn màn hình thẻ và ngược lại, phù hợp cho người học muốn tập trung tuyệt đối vào nghĩa / ví dụ.
   * **Tầng 4 - Kiểu hiển thị cách đọc**:
     * *Trên đầu chữ (Ruby Furigana)*: Phiên âm nhỏ đặt ngay trên đầu chữ Hán tương ứng.
     * *Cùng định nghĩa (Stacked/Mazii style)*: Tách thành 2 tầng riêng biệt (tầng trên chữ Hiragana to rõ ràng, tầng dưới là định nghĩa tiếng Việt). Chỉ hiển thị khi chọn mặt trước là Kanji và ở chế độ hiện cả hai mặt.
2. **Chuẩn hóa định dạng hiển thị nghĩa thẻ**:
   * Loại bỏ cơ chế tự động tách dòng đầu in đậm chữ to làm lệch bố cục; nghĩa của thẻ giờ đây được hiển thị đồng đều, trang nhã và dễ đọc.

---

### B. Cơ chế Xáo trộn thẻ (Shuffle) 2 chiều linh hoạt & thông minh
1. **Hoạt động 2 chiều (Toggle Mode)**:
   * **Bật (ON)**: Xáo trộn ngẫu nhiên thứ tự các thẻ còn lại trong phiên học (đảm bảo thẻ kế tiếp khác thẻ hiện tại để tạo hiệu ứng trực quan tức thì).
   * **Tắt (OFF)**: Khôi phục chính xác các thẻ còn lại về **đúng y thứ tự ban đầu** của bộ thẻ / bài học (dựa trên bảng chỉ mục gốc `cardOrderMap`).
2. **Đồng bộ hóa 100% ba luồng tương tác**:
   * **Phím tắt <kbd>S</kbd>**: Bấm lần 1 để xáo (bật), bấm lần 2 để về ban đầu (tắt).
   * **Nút biểu tượng 🔀 trên thanh Header**: Bấm để toggle trạng thái; khi bật, nút chuyển sang màu xanh dương nổi bật (`bg-blue-100 text-blue-700`).
   * **Ô Checkbox trong Menu `...`**: `[x] Xáo trộn thứ tự thẻ` tự động đồng bộ theo phím <kbd>S</kbd> và nút header. Người dùng có thể click trực tiếp để bật/tắt.
   * **Nút đổi kiểu xáo**: Cung cấp thêm nút *"Đổi sang thứ tự xáo khác"* khi đang ở chế độ xáo để người học đổi thứ tự ngẫu nhiên mới nếu muốn.
3. **Làm sạch giao diện học tập**:
   * Loại bỏ toàn bộ các dòng chữ thông báo toast thừa dưới chân thẻ khi xáo/khôi phục thẻ, giữ cho không gian học tập luôn tinh gọn, tập trung.
4. **Cập nhật Bảng phím tắt (`ShortcutHelpModal.tsx`)**:
   * Cập nhật mô tả phím <kbd>S</kbd>: *"Bật / tắt xáo trộn thứ tự thẻ"*.

---

### C. Cải tiến bóc tách và nhập thẻ thông minh (`importParser.ts`, `ImportCardsModal.tsx`)
1. **Khắc phục lỗi mất định nghĩa từ vựng không có Kanji**:
   * Trước đây, các từ mượn Katakana hoặc từ không có chữ Kanji (ví dụ: `ソフト`, `ライバル`) khi dán theo định dạng `Thuật ngữ | Nội dung...` bị thuật toán hiểu nhầm phần sau `|` là cách đọc (do không có dấu gạch ngang `-`), dẫn đến ô định nghĩa bị rỗng.
2. **Cơ chế bóc tách thông minh mới**:
   * Hàm `isPureKana`: Nhận diện chính xác văn bản tiếng Nhật thuần Kana (Hiragana, Katakana, trường âm `ー`, nakaguro `・`).
   * Hàm `extractLeadingKanaReading`: Tự động nhận diện và tách phần cách đọc ở đầu chuỗi nghĩa dạng `<Kana> - <Nội dung>`.
   * **Smart Fallback**: Nếu ô định nghĩa bị rỗng mà ô cách đọc có chứa nội dung (và không phải pure Kana) $\rightarrow$ tự động điều chuyển toàn bộ nội dung sang ô định nghĩa, bảo toàn 100% dữ liệu nhập cho người học.

---

### D. Tích hợp mô hình dịch cục bộ HY-MT & Cải thiện UI/UX
1. **Mô hình dịch HY-MT (Japanese - Vietnamese)**:
   * Hỗ trợ dịch câu và từ vựng tiếng Nhật sang tiếng Việt với mô hình dịch cục bộ (nhánh `translation`), tăng tính chủ động và giảm phụ thuộc vào API bên ngoài.
2. **Cải tiến giao diện My Deck & Folder UX**:
   * Chuẩn hóa hiển thị thư mục, phân cấp bộ thẻ và các thao tác quản lý thẻ cá nhân.
3. **Cải tiến Sơ đồ cấu tạo chữ Hán (Kanji Diagram)**:
   * Chế độ *Phân tích từ* (từ 2–4 chữ), tra cứu bằng âm Hán-Việt, tối ưu độ dài mũi tên, góc quạt thành phần và khả năng tương tác canvas (zoom quanh trỏ chuột, pan, kéo node).

---

## 3. Danh sách tệp tin thay đổi chính

| Tệp tin | Thay đổi chính |
| :--- | :--- |
| `frontend/src/pages/StudyPage.tsx` | Menu phân tầng (Đọc/Nghe, Kanji/Hira/Định nghĩa, Hiện 2 mặt/Quizlet, Ruby/Stacked), xáo thẻ 2 chiều đồng bộ, bỏ thông báo chữ thừa |
| `frontend/src/features/decks/editor/importParser.ts` | Bổ sung `isPureKana`, `extractLeadingKanaReading`, smart fallback bảo toàn định nghĩa |
| `frontend/src/features/decks/components/ImportCardsModal.tsx` | Cập nhật nhãn hướng dẫn tùy chọn nhận diện cách đọc tự động |
| `frontend/src/features/study/studyUtils.ts` | Đăng ký phím tắt `S` / `KeyS` cho hành động shuffle |
| `frontend/src/features/study/components/ShortcutHelpModal.tsx` | Cập nhật nhãn phím tắt <kbd>S</kbd>: "Bật / tắt xáo trộn thứ tự thẻ" |
| `frontend/src/lib/jaUtils.ts` | Bổ sung tiện ích phân loại kiểu Furigana, tách POS thuật ngữ |

---

## 4. Kế hoạch tiếp theo
- [ ] Tiếp tục theo dõi phản hồi người dùng về trải nghiệm lật thẻ và xáo thẻ trong các phiên học lộ trình dài hạn.
- [ ] Rà soát và bổ sung test tự động (Vitest) cho các trường hợp biên của `importParser` và `handleToggleShuffle`.
- [ ] Kiểm tra tính tương thích trên thiết bị di động (màn hình hẹp 375px) đối với menu tùy chọn học tập phân tầng.
