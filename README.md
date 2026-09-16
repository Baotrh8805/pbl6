# PBL6 - Nền tảng tự động sinh Flashcard/Quiz từ tài liệu tiếng Nhật

Dự án ứng dụng trí tuệ nhân tạo (AI), thị giác máy tính và đồ thị tri thức (GraphRAG) hỗ trợ sinh viên CNTT - Tiếng Nhật và người học tiếng Nhật tự động tạo học liệu, luyện viết Kanji và luyện phát âm chuẩn xác.

---

## 🏗️ Kiến Trúc Hệ Thống (Architecture Overview)

Hệ thống được chia thành 3 phần độc lập (Service-oriented):

1. **`frontend/` (React + TypeScript + Vite):**
   - Hỗ trợ giao diện Web & Mobile Web (Responsive).
   - Tích hợp HTML5 Canvas để vẽ và nhận diện nét viết chữ Kanji.
   - Hỗ trợ Web Audio API ghi âm phát âm trực tiếp.
   - Tải ảnh trang sách tiếng Nhật lên để xử lý OCR.

2. **`backend-core/` (Java 17/21 - Spring Boot 3):**
   - Quản lý định danh (User Authentication / JWT).
   - CRUD bộ thẻ (Decks), thẻ từ vựng (Flashcards), bộ bài kiểm tra (Quiz).
   - Kết nối cơ sở dữ liệu chính: **Supabase (PostgreSQL)**.
   - Đóng vai trò Gateway trung chuyển dữ liệu từ Frontend sang AI Service.
   - Tích hợp cổng thanh toán (PayOS / VNPay).

3. **`ai-service/` (Python 3.10+ - FastAPI):**
   - **OCR Engine:** Tiếp nhận ảnh, tiền xử lý và nhận dạng chữ dọc tiếng Nhật (Tatechugaki).
   - **NLP Engine:** Tách từ (Sudachi / MeCab), sinh phiên âm Furigana, ánh xạ âm Hán - Việt.
   - **Kanji Scoring:** Chấm điểm nét viết chữ Hán dựa trên thuật toán DTW (Dynamic Time Warping).
   - **Pitch & Pronunciation:** Đánh giá phát âm và cao độ trọng âm (Pitch Accent) sử dụng Praat / Parselmouth.
   - **GraphRAG:** Đối soát mâu thuẫn tài liệu dựa trên Knowledge Graph (Neo4j).

---

## 🚀 Khởi Động Nhanh Cho Cả Nhóm

### Bước 1: Khởi động cơ sở dữ liệu hạ tầng (Docker)
Nếu chạy offline cục bộ (không dùng cloud):
```bash
docker compose up -d
```
Lệnh trên sẽ khởi tạo:
- **PostgreSQL:** Cổng `5432`
- **Redis:** Cổng `6379`
- **Neo4j:** Cổng `7474` (giao diện web: `http://localhost:7474`) và `7687` (Bolt)

*(Nếu nhóm dùng **Supabase Cloud**, chỉ cần điền thông tin Supabase vào file `backend-core/src/main/resources/application.properties`)*

---

### Bước 2: Chạy AI Service (Python FastAPI)
```bash
cd ai-service
python3 -m venv venv
source venv/bin/activate  # Trên Windows dùng: venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```
Truy cập tài liệu API tự động (Swagger): `http://localhost:8000/docs`

---

### Bước 3: Chạy Backend Core (Java Spring Boot)
```bash
cd backend-core
./mvnw spring-boot:run
```
Backend sẽ khởi động tại: `http://localhost:8080`

---

### Bước 4: Chạy Frontend (React)
```bash
cd frontend
npm install
npm run dev
```
Giao diện sẽ chạy tại: `http://localhost:5173`

---

## 👥 Phân Công Nhiệm Vụ 3 Sprint
Xem chi tiết lộ trình 42 use cases tại thư mục `docs/USE_CASES_CHECKLIST.md`.
