# Bảng Phân Chia 7 Phân Hệ & 42 Use Case Theo 3 Sprint

> Trạng thái rà lại 19/10/2026 theo code thực tế (nhánh `backend-feature-learnmode`, sau khi tích hợp backend đợt 2 và khớp
> frontend — hợp đồng [Plan/specs/2026-10-19-hop-dong-api-dot-2.md](Plan/specs/2026-10-19-hop-dong-api-dot-2.md)): `[x]` = đã chạy
> được và có test tự động (backend `mvn test`, ai-service `pytest`, frontend `npm run selfcheck`); `[~]` = làm một phần (ghi chú nói
> rõ phần thiếu); `[ ]` = chưa làm. Các mục đợt 2 có test backend (ai-service giả lập) và self-check frontend, **chưa kiểm tay trọn
> luồng với ai-service thật**. Phạm vi theo [Plan/specs/2026-10-19-quyet-dinh-da-chot.md](Plan/specs/2026-10-19-quyet-dinh-da-chot.md):
> thanh toán (UC-40), Google OAuth, GraphRAG / Neo4j (UC-34, UC-35) và ASR / Praat phía server nằm **ngoài phạm vi** — vẫn ghi
> là chưa làm / làm một phần ở dưới cho trung thực, không tính là xong. Tiến trình gần nhất:
> [Progress/2026-10-19-tien-trinh.md](Progress/2026-10-19-tien-trinh.md).

| Sprint | Số UC | Xong | Một phần | Còn lại |
| :--- | :---: | :---: | :---: | :---: |
| Sprint 1 (UC-01 → UC-16) | 16 | 15 | 1 | 0 |
| Sprint 2 (UC-17 → UC-29) | 13 | 13 | 0 | 0 |
| Sprint 3 (UC-30 → UC-42) | 13 | 8 | 2 | 3 |
| **Tổng** | **42** | **36** | **3** | **3** |

Một phần: UC-01 (chưa có Google OAuth), UC-33 (mẫu trọng âm là kiểu từ điển, không phải giọng bản xứ), UC-36 (chưa so giữa
các tài liệu của người học với nhau). Còn lại: UC-34 + UC-35 (Neo4j / GraphRAG), UC-40 (thanh toán).

Dự án gồm **7 phân hệ chức năng** và **42 use case**. Để nhóm vừa làm vừa học hiệu quả mà không bị ngợp, công việc được chia làm 3 Sprint:

---

## 🏃 Sprint 1: Nền Tảng & MVP Tự Động Sinh Thẻ (Tuần 1 - 3)
*Mục tiêu: Hoàn thiện luồng tạo tài khoản, upload tài liệu đơn giản, trích xuất từ vựng và hiển thị flashcard có âm Hán-Việt.*

### Phân hệ 1: Quản lý tài khoản (Auth & Profiles)
- [~] UC-01: Đăng ký tài khoản (Email / Google OAuth). *(Email + xác thực email (đợt 2): link 24 giờ dùng 1 lần, chưa xác thực thì đăng nhập 403 `EMAIL_NOT_VERIFIED`, gửi lại 5 lần / 15 phút ngay trên form đăng nhập, admin xác thực hộ, bật/tắt bằng khoá `email_verification_required` (mặc định bật); gửi mail thật khi cấu hình SMTP, chưa cấu hình thì link ghi vào log backend. **Chưa có Google OAuth** (ngoài phạm vi); 27/10: chính sách mật khẩu 27/10 (8–72 ký tự, chữ + số + ký tự đặc biệt), email chưa xác thực đăng ký lại được và tự xoá sau 48 giờ, khoá đăng nhập theo email khi dò mật khẩu)*
- [x] UC-02: Đăng nhập & cấp JWT Access/Refresh Token. *(access token 15 phút + refresh token hạn trượt 3 ngày: không vào web quá 3 ngày thì tự đăng xuất; có đăng xuất thu hồi phiên; chống dò mật khẩu theo IP + email)*
- [x] UC-03: Quản lý thông tin cá nhân & trình độ JLPT hiện tại. *(kèm tự xoá tài khoản ở tab Bảo mật)*
- [x] UC-04: Đổi mật khẩu / Khôi phục tài khoản. *(quên mật khẩu gửi email thật khi đã cấu hình SMTP, xem [SUPABASE_SETUP.md](SUPABASE_SETUP.md#5-gửi-email-quên-mật-khẩu-smtp); chưa cấu hình thì link chỉ ghi vào log backend. Tài khoản bị khoá gửi khiếu nại từ trang đăng nhập, admin mở khoá / bác ở `/admin/appeals` (đợt 2))*

### Phân hệ 2: Tiếp nhận & Xử lý tài liệu (Cơ bản)
- [x] UC-05: Tải lên hình ảnh tài liệu tiếng Nhật (JPG/PNG). *(PNG/JPG/WEBP ≤ 15 MB, OCR Tesseract + Gemini fallback; xem [EXTRACTION.md](EXTRACTION.md))*
- [x] UC-06: Tải lên tài liệu dạng văn bản / PDF. *(TXT/MD/DOCX/PDF hoặc dán văn bản)*
- [x] UC-07: OCR nhận dạng văn bản tiếng Nhật cơ bản. *(cần cài Tesseract; không có thì Gemini Vision nếu có key, thiếu cả hai thì job báo lỗi rõ)*
- [x] UC-08: Tách từ tiếng Nhật (Sudachi / MeCab). *(SudachiPy mode A/C)*
- [x] UC-09: Tự động gán phiên âm Furigana cho từ vựng. *(căn từng chữ, `readingSegments`; cách đọc theo ngữ cảnh cho từ một cách viết nhiều cách đọc — `heteronyms.yaml`)*
- [x] UC-10: Tra cứu và tự động gán âm Hán-Việt tương ứng. *(Unihan kVietnamese + bảng sửa tay `han_viet_overrides.csv`)*

### Phân hệ 3: Sinh học liệu bằng AI (Cơ bản)
- [x] UC-11: Tự động sinh bộ Flashcard từ danh sách từ vựng OCR. *(duyệt / sửa / bỏ chọn rồi tạo bộ thẻ vào thư mục)*
- [x] UC-12: Tự động tạo ví dụ và dịch nghĩa câu ví dụ. *(ví dụ = câu trong tài liệu; nghĩa VN + dịch ví dụ qua Gemini khi có `GEMINI_API_KEY`; đợt 2: gợi ý câu i+1 (chỉ một từ chưa thuộc) để thay ví dụ — `GET /api/extractions/{id}/i-plus-one`)*
- [x] UC-13: Chỉnh sửa thủ công nội dung Flashcard sau khi AI tạo. *(sửa thủ công thẻ trong trình soạn / trang bộ thẻ)*

### Phân hệ 4: Quản lý & Chia sẻ bộ thẻ (Cơ bản)
- [x] UC-14: Tạo mới / sửa / xóa Bộ thẻ (Deck). *(kèm thư mục lồng nhau, nhập thẻ bằng cách dán từ Excel / Anki / Quizlet)*
- [x] UC-15: Xem danh sách bộ thẻ cá nhân.
- [x] UC-16: Chế độ lật thẻ học từ vựng (Flip Flashcard).

---

## 🏃 Sprint 2: Luyện Tập Đa Giác Quan & Quiz Thông Minh (Tuần 4 - 6)
*Mục tiêu: Tích hợp chấm nét vẽ Kanji (DTW), OCR chữ dọc, phân tầng JLPT và sinh trắc nghiệm có câu nhiễu.*

### Tiếp nối Phân hệ 2 & 3:
- [x] UC-17: OCR tài liệu chữ dọc (Tatechugaki) và xử lý phân đoạn văn bản. *(`jpn_vert`, tự chọn theo confidence × độ dài dòng, sắp cột phải → trái; deskew + OSD + khử bóng; đo bằng `ai-service/scripts/ocr_eval.py`)*
- [x] UC-18: Phân loại cấp độ từ vựng/ngữ pháp theo 5 bậc JLPT (N5 - N1). *(danh sách JLPT + wordfreq fallback; mơ hồ → cấp dễ nhất kèm độ tin cậy; cấp toàn tài liệu)*
- [x] UC-19: Tự động sinh bài kiểm tra trắc nghiệm (Quiz) từ bộ thẻ. *(đợt 2: 5 loại câu — nghĩa, chữ Hán giống hình, từ đồng âm, cách đọc tự gõ, chia động từ; trộn loại trong một lượt; thẻ không hỗ trợ loại đã chọn hoặc ai-service tắt → câu nghĩa; câu đã sinh lưu ở ngân hàng câu hỏi theo thẻ)*
- [x] UC-20: AI sinh các phương án gây nhiễu (distractors) có căn cứ ngôn ngữ học (dễ nhầm Kanji, cách đọc onyomi/kunyomi). *(ai-service `/extract/distractors`: chữ giống hình theo thành phần KRADFILE + bộ thủ / số nét Unihan, từ đồng âm theo JMdict / JLPT, mỗi phương án có độ tin cậy; `POST /api/decks/{id}/distractors` ghi vào thẻ. Dựa trên dữ liệu ngôn ngữ, không dùng LLM; thiếu `kradfile.csv` thì chỉ còn tín hiệu cùng bộ thủ)*
- [x] UC-21: Cơ chế Sinh-rồi-lọc (Generate-then-filter) kiểm tra chất lượng câu hỏi. *(lọc tự động: ngưỡng `distractor_min_confidence`, loại phương án trùng / không chứa đáp án, thẻ không đủ điều kiện rơi về câu nghĩa; lọc người: người học báo lỗi câu → admin sửa / ẩn ở `/admin/questions`, câu đã ẩn không bao giờ được phát lại. Không có mô hình chấm chất lượng câu)*

### Phân hệ 5: Luyện tập đa giác quan & Chấm điểm
- [x] UC-22: Giao diện vẽ nét Kanji trên màn hình cảm ứng / Canvas. *(panel luyện viết `KanjiWritePanel` mở từ trang tra chữ Hán `/kanji`, trang bộ thẻ và màn hình học; nét mẫu KanjiVG `GET /api/practice/kanji/{ch}/strokes` — cần dựng `kanji_strokes.json` bằng `build_dicts.py --only kanjivg`, thiếu thì vẫn vẽ được nhưng không có mẫu / không chấm)*
- [x] UC-23: Thuật toán DTW (Dynamic Time Warping) so khớp thứ tự và hình dáng nét viết Kanji. *(`ai-service/app/extract/stroke_score.py`: resample 32 điểm, chọn khung, DTW từng cặp nét)*
- [x] UC-24: Chấm điểm và đưa ra phản hồi nét viết (đúng nét, sai hướng, sai thứ tự). *(`POST /api/practice/kanji/score`: điểm từng nét, `wrongDirection`, `isCorrectOrder`, nét thiếu / thừa, nhận xét tiếng Việt; ghi `practice_logs`)*
- [x] UC-25: Làm bài Quiz trắc nghiệm và tính điểm trực tiếp. *(chấm ở server, có hạn giờ, mỗi lượt nộp 1 lần; đợt 2: câu cách đọc tự gõ chấm sau chuẩn hoá kana)*
- [x] UC-26: Thuật toán lặp lại ngắt quãng (Spaced Repetition System - SRS) nhắc ôn từ vựng. *(SM-2 cải tiến; đo thời gian phản xạ mỗi lần chấm (Lộ trình 2.0); dashboard có thẻ đến hạn, chuỗi ngày học)*

### Tiếp nối Phân hệ 4:
- [x] UC-27: Chia sẻ bộ thẻ công khai cho cộng đồng người học. *(Thư viện cộng đồng + chấm sao / bình luận; chia sẻ bộ thẻ / thư mục qua email (xem & học hoặc sửa), link thư mục công khai. Link riêng cho từng bộ thẻ `/d/<token>` (`share_token`, quyết định D9): người đã đăng nhập mở link được quyền xem; chủ tạo / đổi / tắt ở hộp Chia sẻ (26/10); link đặt được mật khẩu (27/10))*
- [x] UC-28: Tìm kiếm và sao chép bộ thẻ của người khác về tài khoản mình.
- [x] UC-29: Xuất dữ liệu bộ thẻ ra file (Anki format / CSV / PDF). *(menu Xuất ở trang bộ thẻ: CSV UTF-8 cho Excel, tệp TSV nhập vào Anki, trang in `/decks/:id/print` để lưu PDF bằng trình duyệt (26/10); CSV mặc định không dòng tiêu đề, tuỳ chọn kèm (27/10))*

---

## 🏃 Sprint 3: Tính Năng Đột Phá, Praat & GraphRAG (Tuần 7 - 9)
*Mục tiêu: Đánh giá ngữ điệu phát âm (Praat), đồ thị tri thức Neo4j, phát hiện mâu thuẫn tài liệu và báo cáo thống kê.*
*(Kế hoạch gốc. Theo quyết định 19/10: phát âm / trọng âm làm trong trình duyệt thay cho Praat; không dùng Neo4j / GraphRAG — mâu thuẫn tài liệu so với từ điển + nguồn tri thức chuẩn.)*

### Tiếp nối Phân hệ 5 (Luyện phát âm):
- [x] UC-30: Thu âm giọng đọc từ vựng / câu tiếng Nhật của người học. *(thu qua micro ngay trong trình duyệt (`PronunciationPanel`, mở từ trang bộ thẻ và màn hình học); theo quyết định 19/10 âm thanh không lưu và không gửi lên backend / ai-service, chỉ gửi kết quả chấm — riêng nhận dạng giọng nói của Chrome tự gửi âm thanh tới dịch vụ của Google)*
- [x] UC-31: Phân tích ASR nhận dạng giọng nói. *(Web Speech API của trình duyệt — `frontend/src/lib/asr.ts`, chỉ Chrome / Edge / Safari; chấm bằng độ giống Levenshtein giữa transcript và cách đọc chuẩn sau chuẩn hoá kana, ghi `POST /api/practice/pronunciation`; không có ASR phía server)*
- [x] UC-32: Trích xuất đường bao cao độ F0 (Pitch Accent) bằng Praat / Parselmouth. *(F0 ước lượng bằng WebAudio + tự tương quan trong trình duyệt — `lib/pitch.ts` — thay cho Praat / Parselmouth theo quyết định 19/10; ai-service không dùng Praat)*
- [~] UC-33: So sánh biểu đồ cao độ của học viên với người bản xứ và chấm điểm khách quan. *(`POST /api/practice/pitch/score` so đường F0 lượng tử H/L theo mora với mẫu trọng âm chuẩn kanjium (tệp `pitch_accent.csv` không commit, tạo bằng `ai-service/scripts/build_dicts.py --only pitch`; thiếu thì 404, giao diện chỉ cho nghe mẫu TTS và tự so); **mẫu là kiểu trọng âm từ điển, không phải bản ghi giọng người bản xứ**)*

### Phân hệ 6: Cá nhân hóa lộ trình & GraphRAG
- [ ] UC-34: Xây dựng đồ thị tri thức (Knowledge Graph) từ vựng - ngữ pháp trên Neo4j. *(không làm: Neo4j ngoài phạm vi theo quyết định 19/10, không code nào dùng Neo4j. Có "bản đồ Hán-Việt" âm → chữ → từ (`/han-viet`, `/api/nlp/han-viet-graph`, chỉ mục trong bộ nhớ dựng từ Unihan + JLPT + JMdict) nhưng đó không phải đồ thị tri thức từ vựng – ngữ pháp)*
- [ ] UC-35: Ứng dụng GraphRAG truy vấn ngữ cảnh học tập theo đồ thị. *(không làm, ngoài phạm vi; "Học gì tiếp" của Lộ trình 2.0 dựa trên luật + dữ liệu ôn tập, không phải GraphRAG)*
- [~] UC-36: Phát hiện mâu thuẫn kiến thức giữa các tài liệu tự sưu tầm của người học. *(đợt 2: mỗi mục bóc tách được so cái tài liệu tự ghi (cách đọc / furigana / nghĩa EN / cấp / mẫu ngữ pháp) với tham chiếu — JMdict, danh sách JLPT, danh mục ngữ pháp + nguồn tri thức chuẩn admin tải lên ở `/admin/knowledge` — kèm độ tin cậy, ngưỡng `contradiction_alert_threshold`; hiện ở trang bóc tách và bản nháp lộ trình; "Kiểm tra lại" khi nguồn chuẩn đổi (đánh giá lại cách đọc / nghĩa từ `doc_reading` / `doc_meaning_en` đã lưu, cấp và ngữ pháp giữ cảnh báo lúc phân tích). **Chưa so giữa các tài liệu của chính người học với nhau**)*
- [x] UC-37: Đề xuất lộ trình học bổ khuyết các điểm yếu của từng cá nhân. *(Lộ trình 2.0: lộ trình theo tài liệu có lịch theo thẻ, phiên học hợp nhất, cân lại khi học trễ, kiểm tra chương; `/api/insights/weaknesses` (sai nhiều, ease thấp, phản xạ chậm, sai quiz), ma sát trí nhớ, "học gì tiếp", `POST /api/learning-paths/remedial` dựng lộ trình bổ khuyết từ thẻ yếu nhất, nhắc học mỗi ngày bằng thông báo trong app; xem [LEARNING_PATH.md](LEARNING_PATH.md) mục 9–11)*

### Phân hệ 7: Quản trị hệ thống & Thương mại hóa
- [x] UC-38: Dashboard quản trị: thống kê số lượng người dùng, bộ thẻ, lượt tạo AI. *(Admin Panel `/admin`, 17/10/2026; đợt 2: hàng đợi kiểm duyệt (báo lỗi câu hỏi, mẹo nhớ, khiếu nại), hiệu suất từng engine đọc văn bản, bước dịch nghĩa, chuỗi lỗi OCR theo ngày, cờ thành phần ai-service (`GET /api/admin/health`), phân loại lộ trình)*
- [x] UC-39: Quản lý giới hạn lượt gọi AI (Rate limit) cho tài khoản Free vs Pro. *(lượt bóc tách / 24 giờ theo gói ở `app_settings` (đổi lúc chạy) + hạn mức riêng từng tài khoản; giới hạn sinh mẹo nhớ 10 lần / giờ; Premium do admin cấp tay (chưa có thanh toán))*
- [ ] UC-40: Tích hợp cổng thanh toán gói Pro (PayOS / VietQR / VNPay Sandbox). *(không làm, ngoài phạm vi theo quyết định 19/10)*
- [x] UC-41: Quản lý báo cáo nội dung sai lệch / vi phạm bản quyền từ người dùng. *(nút "Báo cáo" trên bộ thẻ public; admin resolve / dismiss; đợt 2: báo lỗi câu hỏi quiz, kiểm duyệt mẹo nhớ trước khi công khai)*
- [x] UC-42: Sao lưu và khôi phục dữ liệu hệ thống. *(`scripts/backup.ps1|sh` (pg_dump) + quy trình `pg_restore` trong SUPABASE_SETUP.md; Admin Panel cảnh báo khi bản sao lưu cuối quá 48 giờ (`app.backup.marker`, test `BackupStatusTest`); không có nút sao lưu / khôi phục trên giao diện, script không có test tự động)*

### Phân hệ 8: Từ điển cộng đồng (26/10/2026; ngoài 1.2.1)
- [x] UC-43: Tra từ điển Nhật–Việt (từ vựng, Hán tự, Hán-Việt, nghĩa Việt, trọng âm, ví dụ Tatoeba + bản dịch, sổ tay, lịch sử, tra nhanh từ màn học, thêm vào bộ thẻ). *(spec [Plan/specs/2026-10-26-tu-dien-design.md](Plan/specs/2026-10-26-tu-dien-design.md); nghĩa Việt dịch sẵn JLPT + Gemini khi tra, lưu `dict_meanings`; 26/10 tối thêm tra dạng đã chia, ~37 000 nghĩa Việt và 26 316 câu ví dụ dịch sẵn, tab Câu, vẽ chữ Hán để tra)*
- [x] UC-44: Bình luận chia sẻ kiến thức dưới mỗi mục từ / chữ Hán (phẳng, Hữu ích, sửa / xoá của mình, báo cáo bình luận; admin ẩn / xoá).
- [x] UC-45: Báo lỗi cách đọc / Hán-Việt / nghĩa / ví dụ kèm đề xuất sửa; admin và super admin xem hàng chờ (mục bị báo cáo và mục chưa có nghĩa Việt lên đầu), áp dụng đề xuất hoặc sửa thẳng từ điển gốc, bản sửa có hiệu lực toàn hệ thống (bóc tách, thẻ chữ Hán, cảnh báo mâu thuẫn), có lịch sử + hoàn tác + audit.
  *(26/10: có test tự động — ai-service `tests/test_dictionary.py`, backend `DictionaryIT` + `ExtractionIT`, frontend self-check `dictionary.ts`; dịch Gemini thật chưa chạy vì máy không có khoá, phần đó bàn giao kiểm tay)*
