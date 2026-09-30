# Hướng Dẫn & Quy Tắc Phát Triển Dự Án Cho Nhóm (Team Guidelines)

Tài liệu này quy định các chuẩn mực lập trình, quy trình làm việc trên Git và bảng theo dõi tiến độ tổng thể của dự án **PBL6 - Nền tảng tự động sinh Flashcard/Quiz từ tài liệu tiếng Nhật**.

---

## 📊 1. Bảng Theo Dõi Tiến Độ Dự Án (Progress Tracker)

Toàn bộ dự án gồm **7 phân hệ** và **42 use case** (chia làm 3 Sprint chi tiết tại [USE_CASES_CHECKLIST.md](file:///d:/Chap_7/PBL6/Code_final/pbl6/docs/USE_CASES_CHECKLIST.md)).

### Tiến độ hiện tại (Cập nhật 29/09/2026, theo code thực tế):
- **Tổng tiến độ toàn dự án:** ~**30%** (11/42 use case xong, 2 làm một phần)
- **Tiến độ Sprint 1 (Nền tảng & MVP):** ~**45%** — phần còn thiếu chủ yếu là AI (upload, OCR, sinh thẻ), lùi sang sau theo quyết định của nhóm.

| Phân hệ | Use Cases | Trạng thái hiện tại | Thành phần phụ trách |
| :--- | :--- | :---: | :--- |
| **Phân hệ 1: Tài khoản & Auth** | UC-01 -> UC-04 | 🟢 85% | Xong: đăng ký email, đăng nhập JWT, hồ sơ & JLPT, đổi mật khẩu, quên mật khẩu qua email. Chưa có: Google OAuth, Refresh Token. |
| **Phân hệ 2: Xử lý tài liệu & NLP** | UC-05 -> UC-10 | 🟡 15% | `ai-service`: prototype tách từ / Furigana / Hán-Việt (từ điển mẫu). OCR mock. Chưa upload file, backend chưa gọi AI service. |
| **Phân hệ 3: Sinh học liệu AI** | UC-11 -> UC-13 | 🟡 33% | Sửa thẻ thủ công (UC-13) xong. Chưa tích hợp LLM sinh thẻ / ví dụ. |
| **Phân hệ 4: Quản lý & Chia sẻ Bộ thẻ** | UC-14 -> UC-16, UC-27 -> UC-29 | 🟢 85% | Xong: CRUD bộ thẻ / thẻ, thư mục lồng nhau, chia sẻ bộ thẻ & thư mục, Thư viện cộng đồng (tìm, chấm sao, lưu bản sao). Chưa có: xuất Anki/CSV (UC-29). |
| **Phân hệ 5: Luyện tập đa giác quan** | UC-22 -> UC-26, UC-30 -> UC-33 | 🟡 35% | Xong: SRS (UC-26), Quiz chấm ở server có hạn giờ (UC-19, UC-25). DTW Kanji & Praat còn là khung sườn / mock; chưa có Canvas. |
| **Phân hệ 6: Lộ trình & GraphRAG** | UC-34 -> UC-37 | 🔴 5% | Trang Lộ trình hiển thị tiến độ theo cấp JLPT từ dữ liệu thật; chưa có Neo4j / GraphRAG. |
| **Phân hệ 7: Quản trị & Thanh toán** | UC-38 -> UC-42 | 🔴 0% | Chưa triển khai. |
| **Giao diện người dùng (Frontend)** | Toàn bộ UI Web | 🟢 | React + Vite: mọi màn hình gọi API thật, trừ tải lên AI (khoá, "Sắp ra mắt"). |

---

## 📐 2. Quy Tắc Viết Code (Coding Conventions)

### A. Quy tắc chung (Áp dụng cho mọi thành viên)
1. **Nguyên tắc YAGNI & K.I.S.S:** Chỉ viết những gì use case yêu cầu, không tạo thêm tầng trừu tượng (abstraction) dư thừa.
2. **Không commit rác:** Tuyệt đối không commit thư mục `venv/`, `node_modules/`, `target/`, `.DS_Store`, file log hay `.env` chứa mật khẩu bí mật lên Git.
3. **Mã hóa UTF-8:** Mọi tệp nguồn phải lưu ở định dạng UTF-8 để hiển thị đúng tiếng Nhật và tiếng Việt có dấu.

---

### B. Quy tắc Java (Spring Boot 3 - `backend-core`)
- **Phiên bản:** Java 17+, Spring Boot 3.2.x.
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
  - Danh từ số nhiều, chữ thường, nối bằng gạch ngang: `/api/v1/flashcards`, `/api/v1/decks`.
  - Luôn mở khóa Swagger và cập nhật chú thích `@Operation` để Frontend dễ đọc API.

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
- **Công nghệ:** React 18/19, TypeScript, Vite, Tailwind CSS hoặc Vanilla CSS theo hệ màu Stitch.
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
