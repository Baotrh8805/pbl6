# Hướng Dẫn & Quy Tắc Phát Triển Dự Án Cho Nhóm (Team Guidelines)

Tài liệu này quy định các chuẩn mực lập trình, quy trình làm việc trên Git và bảng theo dõi tiến độ tổng thể của dự án **PBL6 - Nền tảng tự động sinh Flashcard/Quiz từ tài liệu tiếng Nhật**.

---

## 📊 1. Bảng Theo Dõi Tiến Độ Dự Án (Progress Tracker)

Toàn bộ dự án gồm **7 phân hệ** và **42 use case** (chia làm 3 Sprint chi tiết tại [USE_CASES_CHECKLIST.md](USE_CASES_CHECKLIST.md)).
Tổng kết từng đợt nằm trong [docs/Progress/](Progress/) (mới nhất: [30-9.md](Progress/30-9.md)).

### Tiến độ hiện tại (Cập nhật 30/09/2026, commit `0d90c0f` trên nhánh `Backend`):
- **Tổng tiến độ toàn dự án:** ~**31%** (12/42 use case xong, 1 làm một phần)
- **Sprint 1 (Nền tảng & MVP):** ~**48%** (7/16 xong, 1 một phần). Phần còn thiếu chủ yếu là AI (upload, OCR, sinh thẻ), lùi sang sau theo quyết định của nhóm.
- **Sprint 2:** ~**40%** (5/13: quiz, SRS, Thư viện cộng đồng). **Sprint 3:** chưa bắt đầu.
- **Chất lượng:** 55 test backend đạt; CI chạy test backend + lint/build/selfcheck frontend cho mọi push/PR.

| Phân hệ | Use Cases | Trạng thái hiện tại | Thành phần phụ trách |
| :--- | :--- | :---: | :--- |
| **Phân hệ 1: Tài khoản & Auth** | UC-01 -> UC-04 | 🟢 85% | Xong: đăng ký email, đăng nhập JWT + Refresh Token (không vào web 3 ngày thì tự đăng xuất), hồ sơ & JLPT, đổi mật khẩu, quên mật khẩu qua email. Chưa có: Google OAuth. |
| **Phân hệ 2: Xử lý tài liệu & NLP** | UC-05 -> UC-10 | 🟡 15% | `ai-service`: prototype tách từ / Furigana / Hán-Việt (từ điển mẫu). OCR mock. Chưa upload file, backend chưa gọi AI service. |
| **Phân hệ 3: Sinh học liệu AI** | UC-11 -> UC-13 | 🟡 33% | Sửa thẻ thủ công (UC-13) xong. Chưa tích hợp LLM sinh thẻ / ví dụ. |
| **Phân hệ 4: Quản lý & Chia sẻ Bộ thẻ** | UC-14 -> UC-16, UC-27 -> UC-29 | 🟢 85% | Xong: CRUD bộ thẻ / thẻ, thư mục lồng nhau, chia sẻ bộ thẻ & thư mục, Thư viện cộng đồng (tìm, chấm sao, lưu bản sao). Chưa có: xuất Anki/CSV (UC-29). |
| **Phân hệ 5: Luyện tập đa giác quan** | UC-22 -> UC-26, UC-30 -> UC-33 | 🟡 35% | Xong: SRS (UC-26), Quiz chấm ở server có hạn giờ (UC-19, UC-25). DTW Kanji & Praat còn là khung sườn / mock; chưa có Canvas. |
| **Phân hệ 6: Lộ trình & GraphRAG** | UC-34 -> UC-37 | 🔴 5% | Trang Lộ trình hiển thị tiến độ theo cấp JLPT từ dữ liệu thật; chưa có Neo4j / GraphRAG. |
| **Phân hệ 7: Quản trị & Thanh toán** | UC-38 -> UC-42 | 🔴 0% | Chưa triển khai. |
| **Giao diện người dùng (Frontend)** | Toàn bộ UI Web | 🟢 | React + Vite: mọi màn hình gọi API thật, trừ tải lên AI (khoá, "Sắp ra mắt"). |

### Việc cần làm tiếp (theo thứ tự ưu tiên)
1. **Đổi mật khẩu DB Supabase** (đã bị lộ trong lịch sử git), rồi cập nhật `application-local.properties` của từng thành viên. Xem [SUPABASE_SETUP.md](SUPABASE_SETUP.md#4-đổi-mật-khẩu-database-khi-nghi-bị-lộ).
2. **Sao lưu DB trước khi chạy backend bản mới**: migration `V4`–`V6` tự chạy trên Supabase ở lần khởi động kế tiếp.
3. **Thử giao diện trên trình duyệt** các màn hình vừa đổi: trình soạn bộ thẻ, thư mục & chia sẻ, quiz, quên / đặt lại mật khẩu.
4. **Cấu hình SMTP** để gửi email quên mật khẩu thật. Xem [SUPABASE_SETUP.md](SUPABASE_SETUP.md#5-gửi-email-quên-mật-khẩu-smtp).
5. **Nhánh `Frontend` / `dev`**: cập nhật theo API đã đổi (quiz cần `attemptId`, `GET /api/decks` không còn trả bộ thẻ cộng đồng). Chi tiết ở [Progress/30-9.md](Progress/30-9.md).
6. Việc sau: phân hệ AI (upload, OCR, sinh thẻ), xuất Anki/CSV (UC-29), Google OAuth.

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
  - `controller/`: Chỉ đón nhận HTTP Request, gọi Service và trả về `ResponseEntity<?>`.
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
   - `main`: Nhánh ổn định, chỉ merge code khi đã kiểm thử chạy được cả Backend & AI.
   - `dev`: Nhánh gộp để thử chung trước khi lên `main`.
   - `Backend`: Nhánh backend (bản mới nhất gồm cả frontend đã cập nhật theo API mới).
   - `Frontend`: Nhánh chuyên trách xây dựng giao diện người dùng.
   - `backend-feature-...`: Các nhánh làm tính năng backend mới.
2. **Quy chuẩn đặt tên Commit (Conventional Commits):**
   - `feat: <nội dung>`: Thêm tính năng mới (vd: `feat: them api crud deck cho hoc vien`).
   - `fix: <nội dung>`: Sửa lỗi (vd: `fix: sua loi het han jwt token`).
   - `docs: <nội dung>`: Cập nhật tài liệu (vd: `docs: cap nhat huong dan ket noi supabase`).
   - `refactor: <nội dung>`: Tối ưu, cơ cấu lại code mà không đổi logic.
3. **Trước khi Push code lên GitHub:**
   - Chạy thử lệnh build để đảm bảo không gãy dự án:
     - Backend: `mvn test` (test tích hợp chạy trên Postgres nhúng, không cần Supabase)
     - Frontend: `npm run lint && npm run build && npm run selfcheck`
     - CI (`.github/workflows/ci.yml`) chạy lại đúng các lệnh này cho mọi push / pull request.
     - AI: Chạy thử `uvicorn` không báo lỗi cú pháp.
