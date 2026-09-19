# Bản Đồ Mã Nguồn & Tra Cứu Tệp Code (Codebase Map)

Tài liệu này tóm tắt chức năng chi tiết của **toàn bộ các file trong dự án**, giúp các thành viên trong nhóm biết chính xác: **"Khi muốn sửa hay thêm một tính năng cụ thể thì phải vào tệp nào?"**

---

## 🔍 1. Bảng Tra Cứu Nhanh: "Muốn Sửa Gì Thì Vào Đâu?"

| Mục tiêu cần sửa / thêm | Tệp cần mở | Ghi chú |
| :--- | :--- | :--- |
| **Đổi mật khẩu / Đổi thời hạn JWT (Token 3 ngày)** | [JwtTokenProvider.java](file:///d:/Chap_7/PBL6/Code_final/pbl6/backend-core/src/main/java/com/pbl6/flashcard/security/JwtTokenProvider.java) | Sửa hằng số `JWT_SECRET` và `JWT_EXPIRATION`. |
| **Mở khóa thêm API công khai (không cần login)** | [SecurityConfig.java](file:///d:/Chap_7/PBL6/Code_final/pbl6/backend-core/src/main/java/com/pbl6/flashcard/config/SecurityConfig.java) | Thêm route vào `.requestMatchers(...).permitAll()`. |
| **Sửa logic Đăng ký, Mã hóa mật khẩu, Phân quyền** | [AuthService.java](file:///d:/Chap_7/PBL6/Code_final/pbl6/backend-core/src/main/java/com/pbl6/flashcard/service/AuthService.java) | Hàm `login()` và `register()`. |
| **Đổi chuỗi kết nối Supabase Database / Đổi Port** | [application.properties](file:///d:/Chap_7/PBL6/Code_final/pbl6/backend-core/src/main/resources/application.properties) | `spring.datasource.url`, `username`, `password`. |
| **Thêm trường thông tin cho User (Avatar, Ngày sinh...)** | [User.java](file:///d:/Chap_7/PBL6/Code_final/pbl6/backend-core/src/main/java/com/pbl6/flashcard/model/User.java) | Entity Hibernate mapping với bảng `users` trên DB. |
| **Tạo Entity mới cho Bộ thẻ (Decks) / Flashcard** | Thêm mới vào thư mục [model/](file:///d:/Chap_7/PBL6/Code_final/pbl6/backend-core/src/main/java/com/pbl6/flashcard/model) | Cần tạo thêm `Deck.java`, `Flashcard.java`. |
| **Thêm thư viện Java (Maven)** | [pom.xml](file:///d:/Chap_7/PBL6/Code_final/pbl6/backend-core/pom.xml) | Khai báo `<dependency>` mới rồi chạy `mvn compile`. |
| **Bổ sung từ điển âm Hán - Việt cho Kanji** | [nlp_router.py](file:///d:/Chap_7/PBL6/Code_final/pbl6/ai-service/app/api/nlp_router.py) | Cập nhật từ điển `HAN_VIET_DICT` hoặc nạp SQLite. |
| **Điều chỉnh thuật toán chấm nét vẽ Kanji (DTW)** | [kanji_dtw_router.py](file:///d:/Chap_7/PBL6/Code_final/pbl6/ai-service/app/api/kanji_dtw_router.py) | Hàm `score_kanji_strokes()` tính khoảng cách DTW. |
| **Tích hợp Model OCR tiếng Nhật thật** | [ocr_router.py](file:///d:/Chap_7/PBL6/Code_final/pbl6/ai-service/app/api/ocr_router.py) | Thay thế đoạn code Mock bằng Manga-OCR / Gemini Vision. |
| **Tích hợp Praat chấm phát âm F0** | [audio_praat_router.py](file:///d:/Chap_7/PBL6/Code_final/pbl6/ai-service/app/api/audio_praat_router.py) | Thay thế dữ liệu giả lập bằng thư viện `parselmouth`. |
| **Thêm Router hoặc thay đổi CORS ở AI Service** | [main.py](file:///d:/Chap_7/PBL6/Code_final/pbl6/ai-service/app/main.py) | Đăng ký router mới qua `app.include_router()`. |
| **Cấu hình biến môi trường AI (Port, Tiền tố API)** | [config.py](file:///d:/Chap_7/PBL6/Code_final/pbl6/ai-service/app/core/config.py) | Lớp `Settings` kế thừa `BaseSettings`. |

---

## ☕ 2. Chi Tiết Từng File Tại `backend-core/` (Java Spring Boot)

Mã nguồn nằm tại: [backend-core/src/main/java/com/pbl6/flashcard/](file:///d:/Chap_7/PBL6/Code_final/pbl6/backend-core/src/main/java/com/pbl6/flashcard/)

### 🚀 Điểm khởi chạy & Cấu hình:
- **[FlashcardApplication.java](file:///d:/Chap_7/PBL6/Code_final/pbl6/backend-core/src/main/java/com/pbl6/flashcard/FlashcardApplication.java)**:
  - Điểm khởi động chính của ứng dụng (`main()`). Chứa annotation `@SpringBootApplication`.
- **[config/SecurityConfig.java](file:///d:/Chap_7/PBL6/Code_final/pbl6/backend-core/src/main/java/com/pbl6/flashcard/config/SecurityConfig.java)**:
  - Cấu hình Spring Security 6: Tắt CSRF (vì dùng JWT Stateless), mở khóa CORS cho mọi nguồn (`*`), cấu hình đường dẫn công khai (`/api/auth/**`, `/swagger-ui/**`), cấu hình `BCryptPasswordEncoder` và gắn `JwtAuthenticationFilter` vào chuỗi filter.
- **[config/SwaggerConfig.java](file:///d:/Chap_7/PBL6/Code_final/pbl6/backend-core/src/main/java/com/pbl6/flashcard/config/SwaggerConfig.java)**:
  - Tự động sinh giao diện tài liệu OpenAPI Swagger tại `http://localhost:8080/swagger-ui/index.html`. Cấu hình nút gắn Bearer JWT Token để test API ngay trên trình duyệt.
- **[resources/application.properties](file:///d:/Chap_7/PBL6/Code_final/pbl6/backend-core/src/main/resources/application.properties)**:
  - Cấu hình kết nối cơ sở dữ liệu Supabase PostgreSQL qua Transaction Pooler (port 6543), cấu hình Hibernate `ddl-auto=update` và port server 8080.
- **[pom.xml](file:///d:/Chap_7/PBL6/Code_final/pbl6/backend-core/pom.xml)**:
  - Quản lý phụ thuộc: Spring Web, Spring Data JPA, Spring Security, Validation, PostgreSQL Driver, Spring WebFlux (WebClient để gọi AI Service), JJWT 0.11.5, Swagger UI.

### 👤 Định danh & Tài khoản (Auth & User):
- **[controller/AuthController.java](file:///d:/Chap_7/PBL6/Code_final/pbl6/backend-core/src/main/java/com/pbl6/flashcard/controller/AuthController.java)**:
  - Cung cấp 2 API REST công khai:
    - `POST /api/auth/register`: Đăng ký tài khoản mới.
    - `POST /api/auth/login`: Xác thực tài khoản và trả về JWT Access Token.
- **[service/AuthService.java](file:///d:/Chap_7/PBL6/Code_final/pbl6/backend-core/src/main/java/com/pbl6/flashcard/service/AuthService.java)**:
  - Nghiệp vụ kiểm tra email trùng lặp, mã hóa mật khẩu bằng BCrypt, lưu User vào DB và gọi `AuthenticationManager` để kiểm tra đăng nhập.
- **[model/User.java](file:///d:/Chap_7/PBL6/Code_final/pbl6/backend-core/src/main/java/com/pbl6/flashcard/model/User.java)**:
  - Thực thể JPA tương ứng với bảng `users` trên Supabase. Chứa các trường: `id`, `email`, `password_hash`, `full_name`, `jlpt_level`, `is_premium`, `role`, `created_at`.
- **[model/Role.java](file:///d:/Chap_7/PBL6/Code_final/pbl6/backend-core/src/main/java/com/pbl6/flashcard/model/Role.java)**:
  - Enum phân quyền người dùng: `USER`, `ADMIN`.
- **[repository/UserRepository.java](file:///d:/Chap_7/PBL6/Code_final/pbl6/backend-core/src/main/java/com/pbl6/flashcard/repository/UserRepository.java)**:
  - Giao diện truy vấn Spring Data JPA với bảng `users`. Chứa hàm tiện ích `findByEmail(email)` và `existsByEmail(email)`.

### 🛡️ Bảo mật JWT:
- **[security/JwtTokenProvider.java](file:///d:/Chap_7/PBL6/Code_final/pbl6/backend-core/src/main/java/com/pbl6/flashcard/security/JwtTokenProvider.java)**:
  - Chịu trách nhiệm sinh JWT token sử dụng thuật toán HMAC-SHA512 với thời hạn 3 ngày (259.200.000 ms), giải mã token lấy email và xác thực tính toàn vẹn của token.
- **[security/JwtAuthenticationFilter.java](file:///d:/Chap_7/PBL6/Code_final/pbl6/backend-core/src/main/java/com/pbl6/flashcard/security/JwtAuthenticationFilter.java)**:
  - Bộ lọc HTTP chặn mọi request, bóc tách chuỗi `Bearer <token>` từ header `Authorization`, xác thực hợp lệ và nạp đối tượng `UsernamePasswordAuthenticationToken` vào `SecurityContextHolder`.
- **[security/CustomUserDetails.java](file:///d:/Chap_7/PBL6/Code_final/pbl6/backend-core/src/main/java/com/pbl6/flashcard/security/CustomUserDetails.java)**:
  - Adapter chuyển đổi đối tượng `User` của dự án thành đối tượng `UserDetails` mà Spring Security hiểu được.
- **[security/CustomUserDetailsService.java](file:///d:/Chap_7/PBL6/Code_final/pbl6/backend-core/src/main/java/com/pbl6/flashcard/security/CustomUserDetailsService.java)**:
  - Thực thi phương thức `loadUserByUsername(email)` để tìm kiếm người dùng trong DB khi xác thực.

### 📦 DTO (Data Transfer Objects):
- **[dto/AuthRequest.java](file:///d:/Chap_7/PBL6/Code_final/pbl6/backend-core/src/main/java/com/pbl6/flashcard/dto/AuthRequest.java)**: Dữ liệu gửi lên khi đăng nhập (`email`, `password`).
- **[dto/AuthResponse.java](file:///d:/Chap_7/PBL6/Code_final/pbl6/backend-core/src/main/java/com/pbl6/flashcard/dto/AuthResponse.java)**: Dữ liệu trả về khi đăng nhập thành công (`accessToken`, `tokenType = "Bearer"`).
- **[dto/RegisterRequest.java](file:///d:/Chap_7/PBL6/Code_final/pbl6/backend-core/src/main/java/com/pbl6/flashcard/dto/RegisterRequest.java)**: Dữ liệu gửi lên khi đăng ký (`email`, `password`, `fullName`).

---

## 🐍 3. Chi Tiết Từng File Tại `ai-service/` (Python FastAPI)

Mã nguồn nằm tại: [ai-service/app/](file:///d:/Chap_7/PBL6/Code_final/pbl6/ai-service/app/)

- **[main.py](file:///d:/Chap_7/PBL6/Code_final/pbl6/ai-service/app/main.py)**:
  - Điểm khởi tạo ứng dụng FastAPI, cấu hình CORS Middleware, đăng ký các router nghiệp vụ và cung cấp endpoint kiểm tra tình trạng server `GET /`.
- **[core/config.py](file:///d:/Chap_7/PBL6/Code_final/pbl6/ai-service/app/core/config.py)**:
  - Định nghĩa lớp `Settings` chứa các tham số: Tên service (`PBL6 AI Service`), tiền tố API (`API_V1_STR = "/api"`), phiên bản (`VERSION = "1.0.0"`).
- **[api/nlp_router.py](file:///d:/Chap_7/PBL6/Code_final/pbl6/ai-service/app/api/nlp_router.py)**:
  - **Endpoint**: `POST /api/nlp/analyze`
  - **Chức năng**: Nhận vào câu/đoạn tiếng Nhật, dùng thư viện `pykakasi` để phân tích tách từ, tạo phiên âm Furigana (Hiragana), Romaji và tự động tra cứu âm Hán - Việt từ danh sách `HAN_VIET_DICT`.
- **[api/kanji_dtw_router.py](file:///d:/Chap_7/PBL6/Code_final/pbl6/ai-service/app/api/kanji_dtw_router.py)**:
  - **Endpoint**: `POST /api/kanji/score-stroke`
  - **Chức năng**: Nhận tọa độ chuỗi nét viết của học sinh từ màn hình vẽ Canvas, áp dụng thuật toán DTW (`fastdtw` kết hợp `scipy.spatial.distance.euclidean`) để so khớp với nét mẫu và chấm điểm từ 0 - 100.
- **[api/ocr_router.py](file:///d:/Chap_7/PBL6/Code_final/pbl6/ai-service/app/api/ocr_router.py)**:
  - **Endpoint**: `POST /api/ocr/process-image`
  - **Chức năng**: Nhận file ảnh tài liệu tiếng Nhật tải lên (hỗ trợ chế độ chữ dọc hoặc chữ ngang). Hiện tại đang trả về dữ liệu mẫu (mock structure) để chuẩn bị gắn model OCR thật.
- **[api/audio_praat_router.py](file:///d:/Chap_7/PBL6/Code_final/pbl6/ai-service/app/api/audio_praat_router.py)**:
  - **Endpoint**: `POST /api/audio/evaluate-pitch`
  - **Chức năng**: Nhận file âm thanh ghi âm phát âm của người học (.wav/.mp3), trả về độ chính xác và đường bao cao độ F0 (Pitch Accent contour). Đang cấu trúc hóa mock để sẵn sàng kết nối thư viện Praat.
- **[requirements.txt](file:///d:/Chap_7/PBL6/Code_final/pbl6/ai-service/requirements.txt)**:
  - Khai báo danh sách các thư viện Python cần thiết (`fastapi`, `uvicorn`, `scipy`, `numpy`, `fastdtw`, `pykakasi`...).

---

## 🗄️ 4. Cơ Sở Hạ Tầng & Tài Liệu (`docs/` & Root)

- **[docker-compose.yml](file:///d:/Chap_7/PBL6/Code_final/pbl6/docker-compose.yml)**:
  - Cấu hình chạy các container Docker cục bộ khi cần chạy offline: PostgreSQL 16 (port 5432), Redis 7 (port 6379) và Neo4j 5 Community (port 7474, 7687 cho GraphRAG).
- **[README.md](file:///d:/Chap_7/PBL6/Code_final/pbl6/README.md)**:
  - Tổng quan đề tài, kiến trúc 3 tầng và hướng dẫn khởi động nhanh toàn dự án.
- **[docs/ARCHITECTURE.md](file:///d:/Chap_7/PBL6/Code_final/pbl6/docs/ARCHITECTURE.md)**:
  - Bản vẽ kiến trúc chi tiết luồng xử lý giữa Client ➔ Spring Boot ➔ Supabase ➔ AI Service ➔ Neo4j. Mô tả 3 mẫu hình kết hợp AI: *Dự phòng theo ngưỡng tin cậy*, *Sinh-rồi-lọc (Generate-then-filter)* và *Hợp nhất song song (Parallel Fusion)*.
- **[docs/SUPABASE_SETUP.md](file:///d:/Chap_7/PBL6/Code_final/pbl6/docs/SUPABASE_SETUP.md)**:
  - Hướng dẫn thiết lập Database Supabase Cloud: Script SQL khởi tạo 4 bảng ban đầu (`users`, `decks`, `flashcards`, `kanji_practice_logs`) và cách tạo Storage bucket cho file ảnh OCR và âm thanh.
- **[docs/USE_CASES_CHECKLIST.md](file:///d:/Chap_7/PBL6/Code_final/pbl6/docs/USE_CASES_CHECKLIST.md)**:
  - Danh mục toàn diện 7 phân hệ và 42 use cases phân bổ theo lộ trình 3 Sprint để nhóm đối soát khi làm bài tập lớn.
- **[docs/TEAM_GUIDELINES.md](file:///d:/Chap_7/PBL6/Code_final/pbl6/docs/TEAM_GUIDELINES.md)**:
  - Hướng dẫn quy tắc code (Java, Python, Frontend), quy chuẩn commit Git và bảng đo lường tiến độ hoàn thành của nhóm.
- **[docs/CODEBASE_MAP.md](file:///d:/Chap_7/PBL6/Code_final/pbl6/docs/CODEBASE_MAP.md)**: *(Chính là tệp tài liệu này)*.
