# Nhật ký thay đổi

## 30/09/2026: Refresh token, tự đăng xuất sau 3 ngày không hoạt động (UC-02)
- **Backend** (`V7__refresh_tokens`): `POST /api/auth/login` trả thêm `refreshToken`; `POST /api/auth/refresh` đổi lấy
  access token mới và lùi hạn phiên thêm 3 ngày; `POST /api/auth/logout` thu hồi phiên. Access token rút từ 3 ngày
  xuống 15 phút (`jwt.expiration`); hạn refresh token là `jwt.refresh-expiration` (mặc định `P3D`).
  Đổi / đặt lại mật khẩu thu hồi refresh token ở mọi thiết bị. DB chỉ lưu SHA-256 của token.
- **Frontend**: `apiClient` gặp 401 thì tự gọi làm mới một lần rồi gửi lại request; chỉ đăng xuất khi refresh token
  bị từ chối (quá 3 ngày / đã thu hồi), lỗi mạng thì giữ phiên. Nút đăng xuất gọi `/auth/logout`.
- **API đổi**: `AuthResponse` có thêm `refreshToken`; `login()` của `AuthContext` nhận thêm tham số `refreshToken`.
- Test: `RefreshTokenIT` (6 test); `smoke-auth.mjs` kiểm tra refresh / logout.

# Ổn định nền tảng theo kế hoạch MoSCoW
*Ngày: 29/09/2026*

## Must have
- **CI** (`.github/workflows/ci.yml`): `mvn test` + lint / build / self-check frontend cho mọi push & PR.
- **Chống mất thẻ trong trình soạn**: không mở form khi tải bộ thẻ lỗi (trước đây lưu form trống sẽ xoá toàn bộ thẻ
  và lịch sử ôn); chế độ "Thêm thẻ" chỉ ghi thông tin bộ thẻ khi có thay đổi.
- **Validate đầu vào auth / review**: DTO có `@Valid` thay cho body `Map`; giới hạn họ tên 100, mật khẩu 6–72 ký tự;
  hết lỗi báo nhầm "Email đã được sử dụng" khi họ tên quá dài; lỗi auth trả cùng định dạng JSON.
- **"Bộ thẻ của tôi"** chỉ gồm bộ thẻ sở hữu (kể cả bản đã lưu) và bộ được chia sẻ; bộ thẻ cộng đồng chỉ ở Thư viện.
- **Quiz đáng tin**: lượt làm do server phát (`V5__quiz_attempts`), chấm trên mọi câu đã phát, nộp 1 lần, có hạn giờ;
  bỏ dở quá hạn = 0 điểm. Endpoint xem trước `/quizzes/{id}/preview` không mở lượt làm.
- Tài liệu: `SUPABASE_SETUP.md` bỏ SQL tạo bảng tay (xung đột Flyway), README sửa lệnh chạy & biến môi trường.

## Should have
- **Chia sẻ thư mục** (`V4__folder_shares`): mời theo email (xem & học cả cây con), bật/tắt "ai có link đều xem được",
  mục "Được chia sẻ với tôi".
- **Quên mật khẩu** (`V6__password_reset_tokens`): link dùng 1 lần, 30 phút; gửi qua SMTP khi có cấu hình.
- Chặn tạo tài khoản hàng loạt theo IP; lấy IP thật sau reverse proxy (`server.forward-headers-strategy=native`).
- Số liệu dashboard tự tải lại sau mọi thao tác ghi; bỏ số liệu bịa của người dùng ở Phòng thi & Lộ trình;
  lịch sử quiz trả kèm tên bộ thẻ.
- Sửa lỗi giao diện: trình độ thư mục không còn bị ép N5, số liệu thư mục con, dấu phân cách `\n` khi nhập thẻ,
  các class Tailwind chưa định nghĩa, thông báo lỗi khi ôn tập / thêm nhiều bộ thẻ.
- Dọn: bỏ dependency Redis / WebFlux chưa dùng, component `DeckModal` không dùng, gom hằng số cấp JLPT,
  thông báo lỗi thư mục sang tiếng Việt.

---

# Nhật ký thay đổi: Xây dựng API Quản lý Thư mục (Folder)
*Ngày hoàn thành: 22/09/2026*

## Tóm tắt
Đã hoàn tất việc xây dựng toàn bộ hệ thống API Quản lý Thư mục (Bộ thẻ Flashcard) ở phía Backend theo mô hình 3 lớp chuẩn của Spring Boot. API này phục vụ trực tiếp cho màn hình Dashboard bên phía Frontend.

## Chi tiết các thành phần đã thêm / chỉnh sửa

### 1. Tầng Model (Thực thể CSDL)
- **`Folder.java`**: Tạo bảng `folders` lưu trữ thông tin thư mục.
  - Các trường cơ bản: `id`, `title`, `description`, `level`, `accessType`.
  - Các trường đặc biệt (Hybrid Approach): 
    - `isPinned` (boolean): Phục vụ tính năng Ghim thư mục (truy vấn tốc độ cao).
    - `metadata` (TEXT): Chứa chuỗi JSON để lưu trữ các thông tin cấu hình giao diện tùy chỉnh từ Frontend (màu sắc, icon, ảnh bìa...) mà không làm phình to cấu trúc CSDL.
  - Quan hệ: Khóa ngoại `user_id` liên kết với bảng `User`.

### 2. Tầng Data Transfer Object (DTO)
- **`FolderRequest.java`**: Quy định cấu trúc dữ liệu Frontend gửi lên khi Tạo/Sửa thư mục (Có validation kiểm tra `title` không được để trống).
- **`FolderResponse.java`**: Quy định cấu trúc dữ liệu trả về cho Frontend. 
  - *Lưu ý kiến trúc:* Đã loại bỏ toàn bộ các trường hardcode UI (như `iconBg`, `tagColor`) ra khỏi Response để tuân thủ triệt để nguyên tắc RESTful API chuẩn. Trách nhiệm render màu sắc và icon mặc định được giao hoàn toàn cho Frontend xử lý.

### 3. Tầng Repository (Truy xuất CSDL)
- **`FolderRepository.java`**: Thêm hàm `findByUser(User user)` để truy xuất toàn bộ thư mục thuộc quyền sở hữu của một cá nhân cụ thể.

### 4. Tầng Service (Xử lý nghiệp vụ)
- **`FolderService.java`**: Xử lý logic lõi.
  - Khởi tạo thư mục mới.
  - Kiểm tra bảo mật chặt chẽ: Trong các hàm Cập nhật (Update) và Xóa (Delete), hệ thống bắt buộc kiểm tra xem người đang thực hiện hành động có phải là **chủ sở hữu** của thư mục đó không. Báo lỗi nếu không có quyền.

### 5. Tầng Controller (Giao tiếp API)
- **`FolderController.java`**: Cung cấp 4 Endpoints chính (Yêu cầu JWT Token ở Header):
  - `GET /api/folders`: Lấy danh sách thư mục của User hiện tại.
  - `POST /api/folders`: Tạo thư mục mới.
  - `PUT /api/folders/{id}`: Cập nhật thông tin thư mục.
  - `DELETE /api/folders/{id}`: Xóa thư mục.

### 6. Cấu hình hệ thống
- Thêm file **`application-local.properties`** (đã được cấu hình ẩn trong `.gitignore`) để truyền biến môi trường mật khẩu Database, giúp Server kết nối thành công với Supabase.

---
**Ghi chú cho Frontend Team:** 
- Khi gọi API `/api/folders`, Frontend có thể tận dụng trường `metadata` để nhét bất kỳ JSON cấu hình UI nào vào (ví dụ: `{"color": "red", "icon": "star"}`).
- Cần tự map các giá trị mặc định cho UI nếu `metadata` rỗng.
