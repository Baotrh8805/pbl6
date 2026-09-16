# Hướng Dẫn Thiết Lập Supabase Cho Dự Án PBL6

## 1. Đăng ký & Tạo dự án trên Supabase
1. Truy cập [https://supabase.com](https://supabase.com) và đăng nhập (bằng GitHub).
2. Nhấn **New Project**, đặt tên ví dụ: `pbl6-japanese-platform`.
3. Lưu lại **Database Password** (Mật khẩu cơ sở dữ liệu).
4. Chọn Region: `Singapore (ap-southeast-1)` để tốc độ mạng từ Việt Nam nhanh nhất.

---

## 2. Lấy thông tin kết nối cho Java Spring Boot
1. Trong Dashboard của Supabase, vào mục **Project Settings** -> **Database**.
2. Tìm phần **Connection string** -> chọn tab **JDBC** hoặc **URI**.
3. Copy chuỗi kết nối và cập nhật vào `backend-core/src/main/resources/application.properties`:
```properties
spring.datasource.url=jdbc:postgresql://aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require
spring.datasource.username=postgres.xxxxxxx
spring.datasource.password=[MẬT_KHẨU_BẠN_ĐÃ_ĐẶT]
```

---

## 3. Tạo các bảng cơ sở dữ liệu mẫu (SQL Schema)
Truy cập vào mục **SQL Editor** trong Supabase và chạy đoạn script SQL sau:

```sql
-- 1. Bảng Người dùng
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    jlpt_level VARCHAR(10) DEFAULT 'N5',
    is_premium BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Bảng Bộ thẻ (Decks)
CREATE TABLE IF NOT EXISTS decks (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Bảng Thẻ từ vựng (Flashcards)
CREATE TABLE IF NOT EXISTS flashcards (
    id BIGSERIAL PRIMARY KEY,
    deck_id BIGINT REFERENCES decks(id) ON DELETE CASCADE,
    kanji VARCHAR(100) NOT NULL,
    furigana VARCHAR(255) NOT NULL,
    han_viet VARCHAR(255),
    meaning TEXT NOT NULL,
    jlpt_level VARCHAR(10),
    example_sentence TEXT,
    example_meaning TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Bảng Kết quả luyện viết Kanji (DTW)
CREATE TABLE IF NOT EXISTS kanji_practice_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    kanji VARCHAR(10),
    score DOUBLE PRECISION,
    feedback TEXT,
    practiced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

---

## 4. Cấu hình Supabase Storage (Lưu File Ảnh & Âm Thanh)
1. Trong Dashboard Supabase, vào mục **Storage** -> nhấn **New bucket**.
2. Tạo 2 bucket:
   - `documents`: Lưu ảnh chụp tài liệu (OCR). Để chế độ **Public** hoặc **Private** tùy nhu cầu.
   - `audio-recordings`: Lưu file `.wav` thu âm luyện phát âm của học viên.
