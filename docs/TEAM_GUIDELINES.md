# Hướng Dẫn & Quy Tắc Phát Triển Dự Án Cho Nhóm (Team Guidelines)

Tài liệu này quy định các chuẩn mực lập trình, quy trình làm việc trên Git và bảng theo dõi tiến độ tổng thể của dự án **PBL6 - Nền tảng tự động sinh Flashcard/Quiz từ tài liệu tiếng Nhật**.

---

## 📊 1. Bảng Theo Dõi Tiến Độ Dự Án (Progress Tracker)

Toàn bộ dự án gồm **7 phân hệ** và **42 use case** (chia làm 3 Sprint chi tiết tại [USE_CASES_CHECKLIST.md](USE_CASES_CHECKLIST.md)).
Tổng kết từng đợt nằm trong [docs/Progress/](Progress/) (mới nhất: [30-9.md](Progress/30-9.md)).

### Tiến độ hiện tại (Cập nhật 14/10/2026, nhánh `backend-feature-learnmode`; phần bóc tách AI chưa commit lúc viết):
- **Tổng tiến độ toàn dự án:** ~**62%** (26/42 use case xong, 1 làm một phần)
- **Sprint 1 (Nền tảng & MVP):** ~**94%** (15/16 xong, 1 một phần: UC-01 chưa có Google OAuth). Đã có luồng AI: tải tài liệu → OCR → bóc tách → bộ thẻ.
- **Sprint 2:** ~**54%** (7/13: quiz, SRS, Thư viện cộng đồng, OCR chữ dọc, phân cấp JLPT). **Sprint 3:** ~**31%** (4/13: Admin Panel UC-38, 39, 41, 42).
- **Chất lượng:** CI chạy `mvn test` + lint/build/selfcheck frontend + `pytest` ai-service cho mọi push/PR.

| Phân hệ | Use Cases | Trạng thái hiện tại | Thành phần phụ trách |
| :--- | :--- | :---: | :--- |
| **Phân hệ 1: Tài khoản & Auth** | UC-01 -> UC-04 | 🟢 85% | Xong: đăng ký email, đăng nhập JWT + Refresh Token (không vào web 3 ngày thì tự đăng xuất), hồ sơ & JLPT, đổi mật khẩu, quên mật khẩu qua email. Chưa có: Google OAuth. |
| **Phân hệ 2: Xử lý tài liệu & NLP** | UC-05 -> UC-10 | 🟢 90% | Xong: tải ảnh / PDF / DOCX / TXT / dán văn bản, OCR Tesseract (chữ ngang + dọc) với Gemini Vision dự phòng, SudachiPy, furigana từng chữ, Hán-Việt, JMdict. Chưa có ảnh chụp thật để đo OCR (chỉ có ảnh tổng hợp). Xem [EXTRACTION.md](EXTRACTION.md). |
| **Phân hệ 3: Sinh học liệu AI** | UC-11 -> UC-13 | 🟢 90% | Xong: bóc tách → duyệt / sửa → tạo bộ thẻ (UC-11), nghĩa VN + dịch ví dụ qua Gemini (UC-12), sửa thẻ tay (UC-13). Còn mở: giao diện kết quả kiểu "Sửa bộ thẻ" (spec 13/10, chưa làm). |
| **Phân hệ 4: Quản lý & Chia sẻ Bộ thẻ** | UC-14 -> UC-16, UC-27 -> UC-29 | 🟢 85% | Xong: CRUD bộ thẻ / thẻ, thư mục lồng nhau, chia sẻ bộ thẻ & thư mục, Thư viện cộng đồng (tìm, chấm sao, lưu bản sao). Chưa có: xuất Anki/CSV (UC-29). |
| **Phân hệ 5: Luyện tập đa giác quan** | UC-22 -> UC-26, UC-30 -> UC-33 | 🟡 35% | Xong: SRS (UC-26), Quiz chấm ở server có hạn giờ (UC-19, UC-25). DTW Kanji & Praat còn là khung sườn / mock; chưa có Canvas. |
| **Phân hệ 6: Lộ trình & GraphRAG** | UC-34 -> UC-37 | 🟡 25% | UC-37 một phần: Lộ trình học tập từ tài liệu (tách chương → thư mục + bộ thẻ/chương → lịch theo ngày, trang `/roadmap`); chưa cá nhân hoá theo điểm yếu, chưa có Neo4j / GraphRAG. |
| **Phân hệ 7: Quản trị & Thanh toán** | UC-38 -> UC-42 | 🟢 80% | Xong (17/10): Admin Panel `/admin` cho 3 vai trò staff (VIEWER / ADMIN / SUPER_ADMIN, không dùng tính năng học): thống kê, người dùng (khoá, premium, hạn mức AI, đổi vai trò), kiểm duyệt bộ thẻ / bình luận / job, báo cáo vi phạm, cấu hình runtime, audit log; script sao lưu `pg_dump`. Chưa có: thanh toán (UC-40). |
| **Giao diện người dùng (Frontend)** | Toàn bộ UI Web | 🟢 | React + Vite: mọi màn hình gọi API thật, kể cả tải lên AI (`/extractions`). |

### Việc cần làm tiếp (theo thứ tự ưu tiên)
1. **Đổi mật khẩu DB Supabase** (đã bị lộ trong lịch sử git), rồi cập nhật `application-local.properties` của từng thành viên. Xem [SUPABASE_SETUP.md](SUPABASE_SETUP.md#4-đổi-mật-khẩu-database-khi-nghi-bị-lộ).
2. **Sao lưu DB trước khi chạy backend bản mới**: migration `V4`–`V6` tự chạy trên Supabase ở lần khởi động kế tiếp.
3. **Thử giao diện trên trình duyệt** các màn hình vừa đổi: trình soạn bộ thẻ, thư mục & chia sẻ, quiz, quên / đặt lại mật khẩu.
4. **Cấu hình SMTP** để gửi email quên mật khẩu thật. Xem [SUPABASE_SETUP.md](SUPABASE_SETUP.md#5-gửi-email-quên-mật-khẩu-smtp).
5. **Nhánh `Frontend` / `dev`**: cập nhật theo API đã đổi (quiz cần `attemptId`, `GET /api/decks` không còn trả bộ thẻ cộng đồng). Chi tiết ở [Progress/30-9.md](Progress/30-9.md).
6. **Bóc tách AI** (nhánh `backend-feature-learnmode`): commit, rồi mỗi thành viên làm theo [README bước 2](../README.md) (venv, `build_dicts.py`, `ai-service/.env`, Tesseract). Cần `GEMINI_API_KEY` riêng của từng người, không commit key.
7. **Chờ duyệt** 3 spec giao diện ngày 13/10 trong [Plan/](Plan/README.md) (thanh tiến trình, trang danh sách, kết quả kiểu "Sửa bộ thẻ").
8. Việc sau: xuất Anki/CSV (UC-29), Google OAuth, distractor có căn cứ (UC-20), Kanji DTW / phát âm thật.

---

## 📐 2. Quy Tắc Viết Code (Coding Conventions)

### A. Quy tắc chung (Áp dụng cho mọi thành viên)
1. **Nguyên tắc YAGNI & K.I.S.S:** Chỉ viết những gì use case yêu cầu, không tạo thêm tầng trừu tượng (abstraction) dư thừa.
2. **Không commit rác:** Tuyệt đối không commit thư mục `venv/`, `node_modules/`, `target/`, `.DS_Store`, file log hay `.env` chứa mật khẩu bí mật lên Git.
3. **Mã hóa UTF-8:** Mọi tệp nguồn phải lưu ở định dạng UTF-8 để hiển thị đúng tiếng Nhật và tiếng Việt có dấu.

---

### B. Quy tắc Java (Spring Boot 3 - `backend-core`)
- **Phiên bản:** Java 17+, Spring Boot 3.5.x.
- **Đổi schema DB:** chỉ qua file Flyway mới `V<n>__mo_ta.sql`, không sửa migration đã chạy, không tạo bảng tay.
- **Cấu trúc gói:**
  - `model/`: Chứa các JPA Entity tương ứng bảng cơ sở dữ liệu.
  - `repository/`: Kế thừa `JpaRepository<Entity, ID>`, chỉ chứa truy vấn DB.
  - `dto/`: Request/Response Payload, có gắn validation annotations (`@NotBlank`, `@Email`, `@Size`).
  - `service/`: Chứa toàn bộ nghiệp vụ (Business Logic). Không viết query DB hay parse HTTP tại đây.
  - `controller/`: Chỉ đón nhận HTTP Request, gọi Service và trả về kết quả. **Không import `repository/`, không trả entity ra ngoài** (dùng DTO trong `dto/`); không chứa nghiệp vụ như đếm số lần thử, đổi lỗi, kiểm tra quyền.
  - Lỗi nghiệp vụ do Service ném `ResponseStatusException` (kèm thông báo tiếng Việt); `ApiExceptionHandler` đổi thành JSON `{status, error, message}`.
  - Thuật toán thuần (`SrsService`, `QuizService`) giữ dạng hàm tĩnh, không chạm DB, có unit test riêng; phần truy cập DB đi kèm nằm ở service riêng (`ReviewService`, `QuizAttemptService`).
  - Mỗi controller một nhóm tài nguyên (`DeckController`, `StudyController`, `FolderController`...); một service không nên dài quá ~400 dòng, quá thì tách theo nghiệp vụ.
  - `config/` & `security/`: Cấu hình hệ thống, Spring Security, JWT.
- **Đặt tên (Naming):**
  - Class/Interface: `PascalCase` (vd: `FlashcardService`, `UserRepository`).
  - Method/Variable: `camelCase` (vd: `findByEmail`, `accessToken`).
  - Hằng số: `UPPER_SNAKE_CASE` (vd: `JWT_EXPIRATION`).
- **RESTful API URL:**
  - Danh từ số nhiều, chữ thường, nối bằng gạch ngang, theo tiền tố `/api/` đang dùng: `/api/decks`, `/api/folders`, `/api/auth/forgot-password`.
  - Lỗi trả về định dạng JSON chung `{status, error, message}` (qua `ApiExceptionHandler`), thông báo bằng tiếng Việt.
  - Swagger tắt mặc định; bật ở máy dev bằng `SWAGGER_ENABLED=true` (hoặc trong `application-local.properties`).

---

### C. Quy tắc Python (FastAPI - `ai-service`)
- **Phiên bản:** Python 3.10+ (Đang chạy môi trường ảo `venv`).
- **Kiểu dữ liệu:** Bắt buộc dùng Type Hints và `pydantic.BaseModel` cho mọi Request/Response.
- **Tổ chức Router:**
  - Router chức năng đặt trong thư mục `app/api/` (vd: `nlp_router.py`, `kanji_dtw_router.py`).
  - Các hàm tính toán nặng nên chuyển vào `app/services/` hoặc `app/utils/` để giữ router gọn gàng.
- **Chạy service:** Luôn kích hoạt môi trường ảo trước khi chạy:
  ```powershell
  cd ai-service
  .\venv\Scripts\activate
  uvicorn app.main:app --reload --port 8000
  ```

---

### D. Quy tắc Frontend (React + TypeScript - `frontend`)
- **Công nghệ:** React 19, TypeScript, Vite, Tailwind CSS 3 theo hệ màu Stitch.
- **Hệ màu chuẩn dự án (Lấy từ Stitch Design System "NihonGen AI"):**
  - **Primary (Aizome Indigo):** `#1B2A4A` (Màu xanh chàm chủ đạo).
  - **Secondary (Matcha Jade):** `#059669` (Màu xanh ngọc cho trạng thái nhớ thẻ/thành công).
  - **Accent (Torii Vermilion):** `#E11D48` (Màu đỏ cổng Torii cho nút hành động chính, streak).
  - **Canvas Base:** `#F8FAFC` (Màu nền chống mỏi mắt).
- **Tương tác API:** Mọi lời gọi API qua Backend phải có Interceptor tự động gắn `Authorization: Bearer <token>` vào header.

---

## 🌿 3. Quy Trình Làm Việc Trên Git (Git Workflow)

1. **Phân chia nhánh:**
   - `main`: Nhánh ổn định. Chỉ nhận merge từ `dev` khi CI xanh và Backend + Frontend chạy được cùng nhau (phần AI chỉ bắt buộc khi thay đổi có đụng tới AI).
   - `dev`: Nhánh gộp để thử chung trước khi lên `main`. **Mỗi task tách nhánh từ `dev`** và quay lại `dev` qua Pull Request.
   - `Backend` / `Frontend`: nhánh tích hợp theo mảng (đang dùng); nhánh mới ưu tiên theo mẫu bên dưới.
   - `backend-feature-<ten-ngan>` / `frontend-feature-<ten-ngan>`: làm tính năng mới (vd: `backend-feature-refresh-token`).
   - `backend-fix-<ten-ngan>` / `frontend-fix-<ten-ngan>`: sửa lỗi.
   - `docs-<ten-ngan>`: chỉ sửa tài liệu.
2. **Quy chuẩn đặt tên Commit (Conventional Commits):**
   - `feat: <nội dung>`: Thêm tính năng mới (vd: `feat: them api crud deck cho hoc vien`).
   - `fix: <nội dung>`: Sửa lỗi (vd: `fix: sua loi het han jwt token`).
   - Ghi mã use case trong ngoặc khi có (vd: `feat: them refresh token (UC-02)`). Mỗi commit một việc, không gom nhiều việc không liên quan.
   - `docs: <nội dung>`: Cập nhật tài liệu (vd: `docs: cap nhat huong dan ket noi supabase`).
   - `refactor: <nội dung>`: Tối ưu, cơ cấu lại code mà không đổi logic.
3. **Trước khi Push code lên GitHub:**
   - Chạy thử lệnh build để đảm bảo không gãy dự án:
     - Backend: `mvn test` (test tích hợp chạy trên Postgres nhúng, không cần Supabase)
     - Frontend: `npm run lint && npm run build && npm run selfcheck`
     - CI (`.github/workflows/ci.yml`) chạy lại đúng các lệnh này cho mọi push / pull request.
     - AI: `python -m compileall -q ai-service/app` (CI cũng chạy) và chạy thử `uvicorn` không báo lỗi.
4. **Pull Request & review:**
   - PR vào `dev`, tiêu đề theo quy ước commit. Mô tả nêu: mã UC, đã đổi gì, cách kiểm chứng (test nào, đã bấm thử màn hình nào).
   - Cần **ít nhất 1 người khác duyệt** (không tự duyệt PR của mình) và **CI xanh** mới được merge; merge xong xoá nhánh.
   - Người duyệt kiểm: đúng cấu trúc thư mục / quy tắc đặt tên ở mục 2, không lộ bí mật, có test cho logic mới, không thêm dependency khi chưa cần.
   - **Đổi API** (thêm / đổi field, đổi endpoint): ghi vào mục "API đã đổi" của `docs/Progress/` để nhánh khác cập nhật theo.
   - **Thêm migration** (`V<n>__...sql`): nêu rõ trong PR; trước khi chạy backend mới trên Supabase phải sao lưu DB và báo cả nhóm.
   - Cập nhật `docs/USE_CASES_CHECKLIST.md`, bảng tiến độ ở mục 1 và `docs/CHANGELOG.md` trong cùng PR hoàn thành một use case.
