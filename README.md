# PBL6 - Nền tảng tự động sinh Flashcard/Quiz từ tài liệu tiếng Nhật

Dự án hỗ trợ sinh viên CNTT - Tiếng Nhật và người học tiếng Nhật biến tài liệu tự sưu tầm (ảnh chụp sách, PDF, DOCX,
văn bản) thành bộ thẻ, bài kiểm tra và lộ trình học theo ngày, kèm luyện viết Kanji, luyện phát âm và trọng âm. Lõi xử lý
là OCR, tách từ tiếng Nhật và dữ liệu từ điển mở (JMdict, Unihan, KanjiVG, KRADFILE, kanjium); Gemini chỉ dùng để dịch
nghĩa / ví dụ sang tiếng Việt, OCR dự phòng và gợi ý mẹo nhớ, nên thiếu key Gemini hệ thống vẫn chạy.

---

## Tính năng chính

Trạng thái từng use case (xong / một phần / chưa làm) ở `docs/USE_CASES_CHECKLIST.md`; các lớp bảo mật và việc phải làm khi triển khai ở `docs/SECURITY.md`. Lưu ý: thư mục `docs/` nằm trong
`.gitignore` từ 18/10/2026 nên các liên kết `docs/...` trong README chỉ mở được trên máy đã có bản tài liệu cục bộ.

> **Điểm nhấn: Lộ trình học tập 2.0** (`/roadmap`, chi tiết ở `docs/LEARNING_PATH.md`)
> - Tải một tài liệu → AI tách chương → bản nháp sửa được (đổi tên, gộp chương, bỏ mục) → kích hoạt thành thư mục, mỗi
>   chương một bộ thẻ, và lịch học theo ngày.
> - Lịch xếp theo từng thẻ: trần thẻ/ngày (mặc định 50, quản trị chỉnh được), chọn ngày học trong tuần, trọng số độ khó theo
>   cấp JLPT so với trình độ người học, dự báo khối lượng ôn để ngày sau không dồn; gợi ý số ngày từ số thẻ.
> - Phiên học hợp nhất mỗi ngày (`/session`): thẻ đến hạn → thẻ nợ → thẻ mới, một nút "Bắt đầu"; học trễ thì học bù,
>   cân lại lịch hoặc kéo dài.
> - Kiểm tra cuối chương (quiz, đạt từ 80 % thì gắn nhãn qua chương, không chặn chương sau), hai thước đo "đã học" / "đã thuộc",
>   chốt hoàn thành.
> - Đo thời gian phản xạ mỗi lần chấm → ma sát trí nhớ; điểm yếu từ 4 tín hiệu (hay quên, ease thấp, phản xạ chậm, sai quiz);
>   gợi ý "Học gì tiếp"; **lộ trình bổ khuyết** dựng từ thẻ yếu nhất, không cần tài liệu.
> - Thông báo trong app: bản nháp sẵn sàng / lỗi, qua chương, hoàn thành, nhắc học mỗi ngày theo giờ quản trị đặt.
>   Lộ trình lỗi chạy lại được mà không tốn lượt bóc tách.

**1. Quản lý tài khoản**
- Đăng ký bằng email + xác thực email (link 24 giờ, gửi lại được; quản trị bật / tắt), đăng nhập JWT (access token 15 phút,
  refresh token hạn trượt 3 ngày), đăng xuất thu hồi phiên.
- Hồ sơ và cấp JLPT hiện tại, đổi mật khẩu, quên mật khẩu qua email, tự xoá tài khoản; tài khoản bị khoá gửi khiếu nại được.
- Chống dò mật khẩu (theo IP + email) và chặn tạo tài khoản hàng loạt (theo IP). Chưa có đăng nhập Google.

**2. Tiếp nhận & xử lý tài liệu**
- Tải ảnh (PNG / JPG / WEBP), TXT / MD / DOCX / PDF (≤ 15 MB) hoặc dán văn bản; hạn mức lượt bóc tách mỗi 24 giờ theo gói Free / Premium.
- OCR Tesseract chữ ngang và chữ dọc (`jpn_vert`), Gemini Vision dự phòng khi độ tin cậy thấp.
- Tách từ SudachiPy, furigana từng chữ theo ngữ cảnh (cả từ một cách viết nhiều cách đọc), âm Hán-Việt, cấp JLPT N5–N1
  cho từng mục và cả tài liệu, nhận diện mẫu ngữ pháp.

**3. Sinh học liệu bằng AI**
- Duyệt / sửa / bỏ chọn kết quả bóc tách rồi tạo bộ thẻ; nghĩa tiếng Anh từ JMdict, nghĩa và dịch ví dụ tiếng Việt qua Gemini.
- Câu ví dụ i+1 chọn từ chính tài liệu (chỉ một từ chưa thuộc mỗi câu).
- Phương án nhiễu có căn cứ: chữ Hán giống hình (KRADFILE + bộ thủ / số nét Unihan), từ đồng âm (JMdict / JLPT), kèm độ tin cậy.
- Thẻ chữ Hán (On / Kun, bộ thủ, số nét), bảng 214 bộ thủ, mẹo nhớ tiếng Việt (Gemini, hết quota thì theo mẫu) — mẹo chỉ
  công khai sau khi quản trị duyệt.

**4. Quản lý & chia sẻ bộ thẻ**
- Tạo / sửa / xoá bộ thẻ, thư mục lồng nhau, nhập thẻ bằng cách dán từ Excel / Anki / Quizlet.
- Chia sẻ bộ thẻ / thư mục qua email (xem hoặc sửa), link thư mục công khai.
- Thư viện cộng đồng: tìm, lọc, chấm sao + bình luận, sao chép về tài khoản, báo cáo vi phạm. Chưa có xuất file (Anki / CSV / PDF).

**5. Luyện tập đa giác quan & chấm điểm**
- Lật thẻ + ôn tập ngắt quãng (SRS, SM-2 cải tiến); dashboard cá nhân: chuỗi ngày học (hiện tại / kỷ lục), thẻ đến hạn và
  thẻ mới tính từ lịch sử ôn tập + quiz thật.
- Quiz 5 loại (nghĩa, chữ Hán giống hình, từ đồng âm, cách đọc tự gõ, chia động từ), trộn loại trong một lượt, chấm ở
  server, có hạn giờ; người học báo lỗi câu hỏi.
- Luyện viết Kanji trên canvas: nét mẫu KanjiVG, chấm DTW từng nét (đúng nét, sai hướng, sai thứ tự, thiếu / thừa nét).
- Luyện phát âm bằng Web Speech API (đọc mẫu + nhận dạng giọng nói ja-JP, cần Chrome / Edge / Safari) và trọng âm cao thấp
  (đường F0 tách bằng WebAudio, so mẫu H/L theo mora từ kanjium); thống kê luyện tập ở trang hồ sơ. Âm thanh không bao giờ
  gửi lên server của hệ thống (riêng nhận dạng giọng nói, trình duyệt như Chrome tự gửi âm thanh tới dịch vụ nhận dạng của nó).

**6. Cá nhân hoá lộ trình & tri thức**
- Lộ trình học tập 2.0 (khung trên).
- Cảnh báo mâu thuẫn tài liệu: cách đọc / nghĩa / cấp JLPT / mẫu ngữ pháp tài liệu ghi được so với JMdict, danh sách JLPT,
  danh mục ngữ pháp và nguồn tri thức chuẩn do quản trị tải lên, kèm độ tin cậy; "Kiểm tra lại" khi nguồn chuẩn đổi.
- Bản đồ Hán-Việt (`/han-viet`): âm Hán-Việt → chữ Hán → từ vựng, dựng từ Unihan + JLPT + JMdict.

**7. Quản trị hệ thống** (Admin Panel `/admin`, vai trò ADMIN / SUPER_ADMIN; tài khoản quản trị không dùng tính năng học)
- Thống kê người dùng, bộ thẻ, lượt AI, lộ trình; hiệu suất từng engine đọc văn bản và bước dịch nghĩa, chuỗi lỗi OCR theo ngày,
  tình trạng từng thành phần ai-service.
- Người dùng: khoá / mở khoá, đổi vai trò, thu hồi phiên, xác thực email hộ, cấp Premium, hạn mức riêng.
- Kiểm duyệt: bộ thẻ công khai, bình luận, báo cáo vi phạm, ngân hàng câu hỏi (sửa / ẩn câu bị báo lỗi), mẹo nhớ, nguồn tri
  thức chuẩn, khiếu nại tài khoản.
- Cấu hình đổi lúc chạy (`app_settings`: hạn mức, thông báo, mở đăng ký, tham số lộ trình, tham số AI, xác thực email),
  nhật ký audit mọi thao tác ghi, sao lưu DB bằng `scripts/backup.*`. Chưa có cổng thanh toán (Premium do quản trị cấp tay).

---

## 🏗️ Kiến Trúc Hệ Thống (Architecture Overview)

Hệ thống được chia thành 3 phần độc lập (Service-oriented):

1. **`frontend/` (React 19 + TypeScript + Vite + Tailwind):**

   - Giao diện Web & Mobile Web (Responsive).
   - HTML5 Canvas để vẽ nét chữ Kanji, hiển thị nét mẫu KanjiVG.
   - Web Speech API (đọc mẫu, nhận dạng giọng nói) và WebAudio (ước lượng cao độ F0) chạy trong trình duyệt:
     âm thanh không gửi lên backend / ai-service, chỉ gửi kết quả nhận dạng / đường cao độ đã tách để chấm và ghi nhật ký
     (nhận dạng giọng nói của Chrome tự gửi âm thanh tới dịch vụ của Google — việc của trình duyệt, không phải của app).
   - Tải ảnh trang sách / tài liệu tiếng Nhật lên để bóc tách.
2. **`backend-core/` (Java 17 - Spring Boot 3.5):**

   - Định danh: JWT access / refresh token, xác thực email, phân quyền USER / ADMIN / SUPER_ADMIN.
   - Bộ thẻ, thư mục, thư viện, SRS, quiz đa loại + ngân hàng câu hỏi, lộ trình học, luyện tập, thông báo, Admin Panel + audit.
   - Cơ sở dữ liệu duy nhất: **PostgreSQL** (Supabase hoặc Postgres cục bộ), schema do Flyway quản lý.
   - Gateway trung chuyển dữ liệu từ Frontend sang AI Service (khoá nội bộ `AI_SERVICE_KEY`), gửi email qua SMTP.
   - Chưa tích hợp cổng thanh toán (PayOS / VNPay nằm ngoài phạm vi).
3. **`ai-service/` (Python 3.10+ - FastAPI):**

   - **OCR Engine:** Tesseract (`jpn` / `jpn_vert`, chữ ngang và chữ dọc Tatechugaki), dự phòng Gemini Vision khi độ tin cậy thấp.
   - **NLP Engine:** Tách từ (SudachiPy), furigana từng chữ, âm Hán-Việt (Unihan), nghĩa (JMdict + Gemini dịch sang tiếng Việt),
     phân cấp JLPT N5–N1 và nhận diện mẫu ngữ pháp → sinh bộ thẻ. Xem [docs/EXTRACTION.md](docs/EXTRACTION.md).
   - **Kanji Scoring:** Chấm nét viết bằng DTW (Dynamic Time Warping) từng nét so với nét mẫu KanjiVG
     (`app/extract/stroke_score.py`, `/api/kanji/*`).
   - **Pitch Accent:** Trình duyệt gửi đường F0 đã tách; ai-service lượng tử H/L theo mora và so với kiểu trọng âm kanjium
     (`app/extract/pitch.py`, `/api/audio/pitch-*`). Không dùng Praat / Parselmouth.
   - **Học liệu:** phương án nhiễu (KRADFILE + Unihan + JMdict / JLPT), chia động từ theo quy tắc, thẻ chữ Hán, bộ thủ + mẹo
     nhớ, khai thác câu i+1.
   - **Mâu thuẫn tài liệu ↔ tham chiếu:** cảnh báo so trực tiếp với từ điển (JMdict, danh sách JLPT, danh mục ngữ pháp) và nguồn
     tri thức chuẩn do quản trị tải lên (`app/extract/conflicts.py`); bản đồ âm Hán-Việt → chữ → từ là chỉ mục trong bộ nhớ
     (`app/extract/han_viet_graph.py`).
   - **Đồ thị tri thức + GraphRAG trên Neo4j (27/10, D30):** `app/graph/` dựng đồ thị từ – chữ Hán – bộ thủ – âm Hán-Việt – mẫu
     ngữ pháp – câu ví dụ trên Neo4j (`docker compose up -d neo4j`), backend đồng bộ bộ thẻ / lịch ôn / lộ trình từ Postgres sang,
     truy vấn Cypher (lân cận, đường nối, gợi ý, mâu thuẫn giữa bộ thẻ) và hỏi đáp GraphRAG (Gemini; thiếu khoá → trả lời mẫu từ
     đồ thị). Trang `/graph`; Admin › Tổng quan dựng lại / đồng bộ. Spec `docs/Plan/specs/2026-10-27-do-thi-tri-thuc-neo4j-design.md`.

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
(cd ai-service && python -m pytest -q)          # test cần Tesseract / Gemini tự bỏ qua khi thiếu
```

## 🚀 Khởi Động Nhanh Cho Cả Nhóm

### Bước 1: Khởi động cơ sở dữ liệu hạ tầng (Docker)

Nếu chạy offline cục bộ (không dùng cloud):

```bash
docker compose up -d postgres
```

Lệnh trên khởi tạo **PostgreSQL** ở cổng `5432`. `docker-compose.yml` còn khai báo Redis (`6379`) và Neo4j (`7474` / `7687`)
từ thiết kế ban đầu, nhưng hiện không code nào dùng tới; `docker compose up -d` (không tên dịch vụ) sẽ bật cả hai, chỉ tốn RAM.

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

AI Service đảm nhận bóc tách tài liệu tiếng Nhật (tách từ, furigana, Hán-Việt, cấp JLPT, ngữ pháp), OCR ảnh / PDF scan,
dịch nghĩa tiếng Việt, chấm nét Kanji, chấm trọng âm, phương án nhiễu cho quiz, tra cứu chữ Hán / bộ thủ và cảnh báo mâu
thuẫn. Backend gọi nó qua `http://localhost:8000`; không có nó thì bộ thẻ, ôn tập, quiz loại "nghĩa", thư viện và Admin Panel
vẫn chạy, còn các tính năng cần AI báo *Không kết nối được dịch vụ AI* (503).

**2.1. Tạo môi trường Python và cài thư viện** (Python 3.10 trở lên; đã kiểm tra với 3.12 và 3.14)

```bash
cd ai-service
python -m venv venv
venv\Scripts\activate          # Windows   |   macOS / Linux: source venv/bin/activate
pip install -r requirements.txt
```

Thư viện chính: FastAPI, SudachiPy + từ điển `sudachidict_core`, python-docx, pypdf, pypdfium2, Pillow, pytesseract,
wordfreq, google-genai. Lần cài đầu tải khoảng 300 MB.

**2.2. Tải dữ liệu từ điển** (một lần, cần mạng, mất vài phút)

```bash
python scripts/build_dicts.py                  # dựng tất cả
python scripts/build_dicts.py --only kanjivg   # chỉ một nguồn: jlpt | unihan | unihan_rs | jmdict | kanjivg | kradfile | pitch
```

Script tải vào cache `scripts/.download_cache/` (đã gitignore) rồi dựng vào `app/extract/data/`. Một phần dữ liệu đã commit
sẵn, phần còn lại phải tự tải vì dung lượng hoặc giấy phép chia sẻ lại:

| File trong `app/extract/data/` | Commit? | `--only` | Nguồn | Giấy phép |
| :--- | :---: | :--- | :--- | :--- |
| `jlpt/n5.csv … n1.csv` | Có | `jlpt` | Danh sách từ vựng JLPT (elzup/jlpt-word-list, gốc tanos.co.uk) | CC BY 4.0 |
| `unihan_vietnamese.csv`, `unihan_japanese.csv` | Có | `unihan` | Unicode Unihan (`kVietnamese`, `kJapanese`) | Unicode License |
| `unihan_rs.csv` | Có | `unihan_rs` | Unihan (`kRSUnicode`, `kTotalStrokes`: bộ thủ + số nét) | Unicode License |
| `radicals_214.csv`, `han_viet_overrides.csv`, `heteronyms.yaml` | Có | — (biên soạn tay, sửa trực tiếp) | Nhóm tự biên soạn | — |
| `jmdict.sqlite` (~4 MB) | **Không** | `jmdict` | JMdict (bản `jmdict-eng-common` của scriptin/jmdict-simplified) | EDRDG licence (CC BY-SA 4.0) |
| `kanji_strokes.json` (~9 MB) | **Không** | `kanjivg` | KanjiVG © Ulrich Apel, chỉ giữ kanji trong từ vựng JLPT | **CC BY-SA 3.0** |
| `kradfile.csv` (~300 KB) | **Không** | `kradfile` | KRADFILE / kradfile-u của EDRDG | **EDRDG licence** (CC BY-SA 4.0) |
| `pitch_accent.csv` (~200 KB) | **Không** | `pitch` | kanjium (`accents.txt`), lọc theo từ vựng JLPT | **CC BY-SA 4.0** |

Các giấy phép CC BY-SA bắt buộc ghi nguồn (KanjiVG / Ulrich Apel, EDRDG, kanjium) và chia sẻ cùng giấy phép khi phân phối
dữ liệu; giao diện hiện chưa có trang ghi nguồn, cần bổ sung trước khi triển khai công khai. Chi tiết định dạng từng file và
cách tải tay khi EDRDG đổi đường dẫn: [ai-service/app/extract/data/README.md](ai-service/app/extract/data/README.md).

Thiếu dữ liệu không làm service dừng — tính năng tương ứng giảm dần và `GET /api/extract/health` báo cờ `false`:

| Thiếu | Cờ health | Ảnh hưởng |
| :--- | :--- | :--- |
| `jmdict.sqlite` | `jmdict` | Nghĩa tiếng Anh lấy từ cột nghĩa của danh sách JLPT (từ ngoài JLPT không có nghĩa); bản đồ Hán-Việt, từ đồng âm và cảnh báo mâu thuẫn chỉ còn dựa trên danh sách JLPT |
| `kanji_strokes.json` | `kanjivg`, `kanjiStrokes` | Luyện viết Kanji không có nét mẫu và không chấm điểm (404 "Chưa có dữ liệu nét mẫu"); vẫn vẽ, hoàn tác, đếm nét được |
| `kradfile.csv` | `kradfile` | Chữ Hán giống hình chỉ còn tín hiệu yếu (cùng bộ thủ, lệch ≤ 2 nét) → ít phương án nhiễu "giống hình" hơn, độ tin cậy thấp hơn |
| `pitch_accent.csv` | `pitch` | Không có mẫu trọng âm chuẩn (404) → không chấm trọng âm, chỉ nghe mẫu và tự so đường cao độ; luyện phát âm không ảnh hưởng |

Bảng dữ liệu nạp lười một lần: dựng file mới xong phải **khởi động lại ai-service**.

**2.3. Tạo file cấu hình `ai-service/.env`** (nằm trong `.gitignore`, không commit; mẫu ở `.env.example` gốc dự án)

```env
# Gemini: dịch nghĩa / ví dụ sang tiếng Việt, OCR dự phòng, mẹo nhớ bộ thủ. Lấy key tại https://aistudio.google.com/apikey
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
| `GEMINI_API_KEY` | Thẻ có nghĩa tiếng Anh (JMdict), không có nghĩa / ví dụ tiếng Việt; mẹo nhớ bộ thủ sinh theo mẫu thay vì Gemini |
| Tesseract          | Ảnh / PDF scan được OCR bằng Gemini Vision (cần key); thiếu cả hai thì chỉ nhận TXT / DOCX / PDF có chữ |

Model Gemini: Google đổi model khá thường xuyên. Nếu log ai-service báo `Gemini 404 NOT_FOUND`, đổi `GEMINI_MODEL`
sang model mà key của bạn thấy (ví dụ `gemini-3.7-flash`); `503 UNAVAILABLE` là model đang quá tải, thử lại sau.
SUPER_ADMIN đổi được model chính lúc chạy ở Admin > Cấu hình > Model AI chính (backend gửi kèm mỗi lượt OCR / dịch nghĩa /
mẹo nhớ); chỉ nhận model trong `geminiModels` của `/api/extract/health` (mặc định `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`
và hai model đã đo `gemini-3.8-flash` / `gemini-3.7-flash`; model khác thêm bằng `GEMINI_ALLOWED_MODELS` sau khi tự gọi
thử với key), tên khác bị bỏ qua và ai-service dùng `GEMINI_MODEL` — trang cấu hình gợi ý danh sách này và cảnh báo tên
bị bỏ qua. Model đã chọn mà quá tải / hết quota thì lượt đó thử `GEMINI_MODEL` rồi mới tới model dự phòng; Google trả 404
(model đã ngừng) thì ai-service dùng `GEMINI_MODEL` và bỏ qua model đó 30 phút.

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

Mở `http://localhost:8000/api/extract/health` (khi đặt `AI_SERVICE_KEY` thì phải gửi header `X-Internal-Key`), mong đợi mọi cờ `true`:

```json
{"sudachi": true, "jmdict": true, "jlpt": true, "unihan": true, "grammar": true, "tesseract": true, "gemini": true,
 "radicals": true, "kradfile": true, "kanjivg": true, "pitch": true, "distractors": true, "kanjiStrokes": true,
 "hanVietGraph": true, "kanjiCards": true, "conjugation": true, "conflicts": true, "radicalCards": true, "mining": true}
```

`jmdict` / `kanjivg` / `kradfile` / `pitch` là `false` → chưa chạy `build_dicts.py` cho nguồn đó (bảng ở 2.2); `tesseract: false` →
chưa cài hoặc `TESSERACT_CMD` sai (hay gặp nhất là trỏ vào thư mục thay vì `tesseract.exe`); `gemini: false` → chưa có
`GEMINI_API_KEY`. Đổi `.env` xong phải khởi động lại service. Trang chủ Admin Panel (`/admin`) hiện lại các cờ này qua
`GET /api/admin/health` của backend.

Swagger: `http://localhost:8000/docs` (chỉ khi chưa đặt `AI_SERVICE_KEY`, hoặc đặt thêm `AI_SERVICE_DOCS=1`). Chưa đặt khoá thì
ai-service chỉ nhận request từ chính máy đó (localhost); trên máy chủ thật phải đặt `AI_SERVICE_KEY` giống nhau ở backend và
ai-service. Test: `python -m pytest -q` (các test cần Tesseract tự bỏ qua nếu chưa cài).

Ở thư mục gốc, `npm run dev` tự bật ai-service bằng `ai-service/venv` nếu đã tạo, nên sau khi cài xong chỉ cần một lệnh.
Chi tiết luồng bóc tách, API và các trường hợp biên: [docs/EXTRACTION.md](docs/EXTRACTION.md).

### Bước 3: Chạy Backend Core (Java Spring Boot)

```bash
cd backend-core
mvn spring-boot:run
```

Backend sẽ khởi động tại: `http://localhost:8080`

**Gửi email (SMTP) và xác thực email.** Backend gửi email cho hai luồng: xác thực email khi đăng ký và quên mật khẩu.
Khai báo SMTP bằng biến môi trường (máy chủ) hoặc các khoá `spring.mail.*` / `app.*` tương ứng trong
`application-local.properties` (máy dev); xem mẫu ở `.env.example` và hướng dẫn Gmail ở
[docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md#5-gửi-email-quên-mật-khẩu-smtp):

| Biến môi trường | Khoá tương ứng | Ý nghĩa |
| :--- | :--- | :--- |
| `SPRING_MAIL_HOST`, `SPRING_MAIL_PORT` | `spring.mail.host`, `spring.mail.port` | Máy chủ SMTP (Gmail: `smtp.gmail.com`, `587`). **Có `host` mới bật gửi mail thật** |
| `SPRING_MAIL_USERNAME`, `SPRING_MAIL_PASSWORD` | `spring.mail.username`, `spring.mail.password` | Tài khoản gửi (Gmail: App password 16 ký tự, không phải mật khẩu Gmail) |
| `SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH`, `SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_ENABLE` | `spring.mail.properties.mail.smtp.auth`, `...starttls.enable` | Đặt `true` cho cổng 587 (STARTTLS) |
| `MAIL_FROM` | `app.mail.from` | Địa chỉ người gửi, mặc định `no-reply@nihongen.local` |
| `FRONTEND_URL` | `app.frontend-url` | Gốc của link trong email (`/verify-email`, `/reset-password`), mặc định `http://localhost:5173`; trên máy chủ phải là địa chỉ frontend thật |
| `MAIL_CONNECT_TIMEOUT_MS`, `MAIL_TIMEOUT_MS` | `mail.smtp.connectiontimeout`, `mail.smtp.timeout` / `writetimeout` | Thời gian chờ SMTP (mặc định 5 000 / 10 000 ms) để máy chủ mail treo không kéo treo request đăng ký / quên mật khẩu |

- **Không** đặt `spring.mail.host` trong `application.properties` hay biến `SPRING_MAIL_HOST` rỗng: có khoá này (kể cả
  giá trị trống) là bật gửi mail thật.
  Chưa cấu hình SMTP thì link xác thực / đặt lại mật khẩu được ghi vào log backend (dòng WARN), **chỉ khi `FRONTEND_URL` là
  localhost** (máy dev); máy chủ thật chỉ ghi lỗi "không gửi được email", không lộ link.
- Xác thực email do khoá `email_verification_required` trong bảng `app_settings` quyết định (**mặc định `true`**), đổi ở
  Admin Panel > Cấu hình (SUPER_ADMIN), có hiệu lực ngay. Bật: tài khoản mới phải bấm link (hạn 24 giờ, dùng 1 lần) mới đăng
  nhập được — trước đó đăng nhập trả 403 `EMAIL_NOT_VERIFIED`, trang đăng nhập cho gửi lại link (tối đa 5 lần / 15 phút);
  quản trị có thể xác thực hộ ở trang chi tiết người dùng. Tắt: đăng ký xong đăng nhập được ngay. Tài khoản quản trị không bị chặn.
- Máy dev chưa có SMTP mà vẫn bật xác thực: lấy link trong log backend, hoặc tắt khoá trên ở Admin Panel.
- Property `app.auth.email-verification-forced-off=true` (mặc định `false`) ép coi như khoá đang tắt; **chỉ** profile e2e
  (`application-e2e.properties`, dùng bởi `npm run e2e`) bật nó vì smoke test đăng ký rồi đăng nhập ngay, không có hộp thư.
  Môi trường thật không đặt property này.

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

Xem chi tiết lộ trình 42 use cases và trạng thái hiện tại tại `docs/USE_CASES_CHECKLIST.md`.
