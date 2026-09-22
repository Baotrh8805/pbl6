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
