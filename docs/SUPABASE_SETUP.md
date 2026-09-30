# Hướng Dẫn Thiết Lập Supabase Cho Dự Án PBL6

## 1. Đăng ký & Tạo dự án trên Supabase
1. Truy cập [https://supabase.com](https://supabase.com) và đăng nhập (bằng GitHub).
2. Nhấn **New Project**, đặt tên ví dụ: `pbl6-japanese-platform`.
3. Lưu lại **Database Password** (Mật khẩu cơ sở dữ liệu). **Không** ghi mật khẩu vào file được commit.
4. Chọn Region: `Singapore (ap-southeast-1)` để tốc độ mạng từ Việt Nam nhanh nhất.

---

## 2. Cấu hình kết nối cho Spring Boot
Mọi thông tin bí mật nằm trong `backend-core/src/main/resources/application-local.properties`
(đã có trong `.gitignore`) hoặc biến môi trường. Tuyệt đối không sửa mật khẩu vào `application.properties`.

Trong Dashboard Supabase: **Project Settings -> Database -> Connection string (JDBC)**, rồi tạo file:

```properties
# Transaction pooler (cổng 6543): app dùng khi chạy. prepareThreshold=0 là bắt buộc với pooler này.
spring.datasource.url=jdbc:postgresql://aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require&prepareThreshold=0
spring.datasource.username=postgres.<project-ref>
spring.datasource.password=<mật khẩu database>

# Session pooler (cổng 5432): chỉ Flyway dùng để chạy migration (cần giữ lock theo phiên).
app.migration.url=jdbc:postgresql://aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require

# Tối thiểu 64 byte, sinh ngẫu nhiên, ví dụ: openssl rand -base64 64
jwt.secret=<chuỗi bí mật riêng của môi trường>

# Bật Swagger ở máy dev
springdoc.api-docs.enabled=true
springdoc.swagger-ui.enabled=true
```

Tương đương bằng biến môi trường: `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `MIGRATION_DB_URL`, `JWT_SECRET`,
`SWAGGER_ENABLED`, `CORS_ALLOWED_ORIGINS`.

---

## 3. Schema cơ sở dữ liệu: KHÔNG tạo bảng bằng tay
Schema do **Flyway** quản lý (`backend-core/src/main/resources/db/migration`). Backend tự chạy migration
khi khởi động, Hibernate chỉ kiểm tra entity khớp schema (`ddl-auto=validate`).

- Database mới tinh: chỉ cần khởi động backend, Flyway tạo toàn bộ bảng và nạp bộ thẻ Thư viện mẫu.
- **Không** chạy script SQL tạo bảng nào trong SQL Editor: bảng tạo tay lệch với migration sẽ làm
  Flyway đánh dấu nhầm baseline và backend không khởi động được.
- Muốn đổi schema: thêm file `V<n+1>__mo_ta.sql` mới, không sửa file migration đã chạy.

---

## 4. Đổi mật khẩu database (khi nghi bị lộ)
1. Dashboard Supabase -> **Project Settings -> Database -> Reset database password**.
2. Cập nhật `spring.datasource.password` trong `application-local.properties` của từng thành viên
   (và biến `DB_PASSWORD` trên máy chủ triển khai).

---

## 5. Gửi email quên mật khẩu (SMTP)
Chưa cấu hình thì link đặt lại mật khẩu chỉ được ghi vào log backend (dòng WARN), đủ dùng khi dev.
Muốn gửi email thật (ví dụ Gmail), thêm vào `application-local.properties`:

```properties
spring.mail.host=smtp.gmail.com
spring.mail.port=587
spring.mail.username=<email gửi>@gmail.com
spring.mail.password=<App password 16 ký tự, không phải mật khẩu Gmail>
spring.mail.properties.mail.smtp.auth=true
spring.mail.properties.mail.smtp.starttls.enable=true
app.mail.from=<email gửi>@gmail.com
app.frontend-url=http://localhost:5173
```

- App password: bật **2-Step Verification** cho tài khoản Google, rồi tạo tại https://myaccount.google.com/apppasswords.
- **Không** đặt `spring.mail.host` trong `application.properties`, kể cả để trống: có key này là backend bật gửi mail
  thật và không còn ghi link ra log.
- Trên máy chủ: dùng biến môi trường `SPRING_MAIL_HOST`, `SPRING_MAIL_PORT`, `SPRING_MAIL_USERNAME`,
  `SPRING_MAIL_PASSWORD`, `SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH`, `SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_ENABLE`,
  `MAIL_FROM`, và `FRONTEND_URL` = địa chỉ frontend thật (nếu không, link trong email trỏ về localhost).

---

## 6. Cấu hình Supabase Storage (dự kiến cho tính năng AI)
Chưa được code sử dụng. Khi làm OCR / luyện phát âm:
1. Trong Dashboard Supabase, vào mục **Storage** -> nhấn **New bucket**.
2. Tạo 2 bucket (để **Private**):
   - `documents`: Lưu ảnh chụp tài liệu (OCR).
   - `audio-recordings`: Lưu file `.wav` thu âm luyện phát âm của học viên.
