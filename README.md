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

   - **OCR Engine:** Tesseract (`jpn` / `jpn_vert`, chữ ngang và chữ dọc Tatechugaki), dự phòng Gemini Vision khi độ tin cậy thấp.
   - **NLP Engine:** Tách từ (SudachiPy), furigana từng chữ, âm Hán-Việt (Unihan), nghĩa (JMdict + Gemini dịch sang tiếng Việt),
     phân cấp JLPT N5–N1 và nhận diện mẫu ngữ pháp → sinh bộ thẻ. Xem [docs/EXTRACTION.md](docs/EXTRACTION.md).
   - **Kanji Scoring:** Chấm điểm nét viết chữ Hán dựa trên thuật toán DTW (Dynamic Time Warping).
   - **Pitch & Pronunciation:** Đánh giá phát âm và cao độ trọng âm (Pitch Accent) sử dụng Praat / Parselmouth.
   - **GraphRAG:** Đối soát mâu thuẫn tài liệu dựa trên Knowledge Graph (Neo4j).

---

## ⚡ Chạy nhanh Frontend + Backend bằng 1 lệnh

Tại thư mục gốc dự án:

```bash
npm run dev      # bật cả ai-service :8000 (nếu đã tạo ai-service/venv), chạy song song Backend (:8080) và Frontend (:5173)
npm run smoke    # kiểm chứng register -> login end-to-end qua proxy Vite
npm run e2e      # smoke test trên Postgres nhúng (không ghi vào Supabase)
npm run smoke:extraction   # bóc tách tài liệu end-to-end, cần backend + ai-service thật đang chạy
```

Log các tiến trình có tiền tố `[AI]` / `[BE]` / `[FE]`. Nhấn Ctrl+C là tắt tất cả.
Script tự giải phóng cổng 8000/8080/5173 trước khi start, nên không còn lỗi
`Port 8080 was already in use` do tiến trình mồ côi từ lần chạy trước.
Yêu cầu: JDK 17+, Maven 3.9+, Node 22.18+, `npm install` trong `frontend/`, và (để có AI) Python 3.10+ với
`ai-service/venv` đã cài theo Bước 2. Chưa có venv thì script bỏ qua ai-service và vẫn chạy BE/FE.
Backend cần cấu hình database + `jwt.secret` trước (xem Bước 1), thiếu `jwt.secret` app không khởi động.
Ba dịch vụ chạy cùng lúc cần khoảng 4 GB RAM trống (2 JVM + Vite + Python với từ điển Sudachi).

### Kiểm tra trước khi push (CI chạy lại đúng các lệnh này)

```bash
(cd backend-core && mvn test)                   # test tích hợp trên Postgres nhúng
(cd frontend && npm run lint && npm run build && npm run selfcheck)
```

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

Trỏ backend vào Postgres cục bộ bằng file `backend-core/src/main/resources/application-local.properties`
(nằm trong `.gitignore`, không commit):

```properties
spring.datasource.url=jdbc:postgresql://localhost:5432/pbl6_db
spring.datasource.username=postgres
spring.datasource.password=password123
jwt.secret=<chuỗi ngẫu nhiên >= 64 byte, ví dụ: openssl rand -base64 64>
```

*(Nếu nhóm dùng **Supabase Cloud**: xem [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md). Không ghi mật khẩu
vào `application.properties` vì file này được commit. Bảng do Flyway tự tạo khi backend khởi động, không tạo tay.)*

---

### Bước 2: Cài và chạy AI Service (Python FastAPI)

AI Service đảm nhận bóc tách tài liệu tiếng Nhật (tách từ, furigana, Hán-Việt, cấp JLPT, ngữ pháp), OCR ảnh / PDF scan và
dịch nghĩa tiếng Việt. Backend gọi nó qua `http://localhost:8000`; không có nó thì mọi tính năng khác vẫn chạy, chỉ
"Tải tài liệu & bóc tách AI" báo *Không kết nối được dịch vụ AI*.

**2.1. Tạo môi trường Python và cài thư viện** (Python 3.10 trở lên; đã kiểm tra với 3.12 và 3.14)

```bash
cd ai-service
python -m venv venv
venv\Scripts\activate          # Windows   |   macOS / Linux: source venv/bin/activate
pip install -r requirements.txt
```

Thư viện chính: FastAPI, SudachiPy + từ điển `sudachidict_core`, python-docx, pypdf, pypdfium2, Pillow, pytesseract,
wordfreq, google-genai. Lần cài đầu tải khoảng 300 MB.

**2.2. Tải dữ liệu từ điển** (một lần, cần mạng, mất 1–3 phút)

```bash
python scripts/build_dicts.py
```

Script tải và dựng vào `app/extract/data/`: 5 danh sách từ vựng JLPT N5–N1, bảng âm Hán-Việt (Unihan) và từ điển
JMdict (`jmdict.sqlite`, khoảng 4 MB, không commit). Thiếu bước này thì từ vựng không có nghĩa tiếng Anh.
Nguồn và giấy phép dữ liệu: `app/extract/data/README.md`.

**2.3. Tạo file cấu hình `ai-service/.env`** (nằm trong `.gitignore`, không commit; mẫu ở `.env.example` gốc dự án)

```env
# Gemini: dịch nghĩa / ví dụ sang tiếng Việt và OCR dự phòng. Lấy key tại https://aistudio.google.com/apikey
GEMINI_API_KEY=AIza...
GEMINI_MODEL=gemini-3.8-flash

# Tesseract (OCR ảnh / PDF scan). Windows: trỏ tới file tesseract.exe, KHÔNG phải thư mục
TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe

# Khoá nội bộ backend <-> ai-service (tuỳ chọn; đặt giống AI_SERVICE_KEY bên backend)
AI_SERVICE_KEY=
```

Cả hai khoá đều tuỳ chọn:

| Thiếu gì         | Hệ quả                                                                                                             |
| :----------------- | :------------------------------------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY` | Thẻ có nghĩa tiếng Anh (JMdict), không có nghĩa / ví dụ tiếng Việt                                        |
| Tesseract          | Ảnh / PDF scan được OCR bằng Gemini Vision (cần key); thiếu cả hai thì chỉ nhận TXT / DOCX / PDF có chữ |

Model Gemini: Google đổi model khá thường xuyên. Nếu log ai-service báo `Gemini 404 NOT_FOUND`, đổi `GEMINI_MODEL`
sang model mà key của bạn thấy (ví dụ `gemini-3.7-flash`); `503 UNAVAILABLE` là model đang quá tải, thử lại sau.

**2.4. Cài Tesseract 5** (chỉ cần khi muốn OCR ảnh / PDF scan không qua Gemini)

- Windows: tải bộ cài tại https://github.com/UB-Mannheim/tesseract/wiki. Trong bước *Choose Components* mở mục
  *Additional language data (download)* và tick **Japanese** cùng **Japanese (vertical)**. Sau đó đặt `TESSERACT_CMD` như trên.
  Quên tick thì tải `jpn.traineddata` và `jpn_vert.traineddata` từ https://github.com/tesseract-ocr/tessdata vào
  `C:\Program Files\Tesseract-OCR\tessdata\`.
- macOS: `brew install tesseract tesseract-lang`. Ubuntu / Debian: `sudo apt install tesseract-ocr tesseract-ocr-jpn tesseract-ocr-jpn-vert`.
- Kiểm tra: `tesseract --list-langs` phải liệt kê `jpn` và `jpn_vert`.

**2.5. Chạy và kiểm tra**

```bash
python -m uvicorn app.main:app --reload --port 8000
```

Mở `http://localhost:8000/api/extract/health`, mong đợi:

```json
{"sudachi": true, "jmdict": true, "jlpt": true, "unihan": true, "grammar": true, "tesseract": true, "gemini": true}
```

`jmdict: false` → chưa chạy `build_dicts.py`; `tesseract: false` → chưa cài hoặc `TESSERACT_CMD` sai (hay gặp nhất là
trỏ vào thư mục thay vì `tesseract.exe`); `gemini: false` → chưa có `GEMINI_API_KEY`. Đổi `.env` xong phải khởi động lại service.

Swagger: `http://localhost:8000/docs`. Test: `python -m pytest -q` (các test cần Tesseract tự bỏ qua nếu chưa cài).

Ở thư mục gốc, `npm run dev` tự bật ai-service bằng `ai-service/venv` nếu đã tạo, nên sau khi cài xong chỉ cần một lệnh.
Chi tiết luồng bóc tách, API và các trường hợp biên: [docs/EXTRACTION.md](docs/EXTRACTION.md).

### Bước 3: Chạy Backend Core (Java Spring Boot)

```bash
cd backend-core
mvn spring-boot:run
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
