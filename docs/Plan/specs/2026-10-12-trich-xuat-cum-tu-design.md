# Plan: trích xuất theo **cụm từ** và dùng **nghĩa có sẵn** trong tài liệu

Ngày 12/10/2026 · nhánh `backend-feature-learnmode` · trạng thái: **đã triển khai 12/10/2026 (kế hoạch: `docs/Plan/plans/2026-10-12-trich-xuat-cum-tu.md`), chưa commit**.

## 0. Hiện trạng (đo thật trên ảnh bảng từ vựng "ngân hàng")

| Bước | Hiện tại | Hệ quả |
|---|---|---|
| TEXT (ảnh) | Tesseract đọc bảng song ngữ được `conf 0.51` → fallback Gemini Vision. Prompt hiện tại: *"Transcribe the Japanese text… omit…"* | Gemini chỉ chép **tiếng Nhật**, cột nghĩa EN/ZH/KO **mất ngay từ bước này**. |
| ANALYZE | Tách câu → Sudachi mode C → giữ từng từ | `銀行でお金を下ろす` → `銀行` / `お金` / `下ろす`; `高くつく` → `高い` / `つく`; chú thích `＊公共料金＝電気代、ガス代…` → `電気` / `ガス` / `水道` / `電話`. Ra **36 từ + 2 ngữ pháp** thay vì ~20 mục như bảng. |
| ENRICH | Gemini tự nghĩ nghĩa VN từ `term` + gloss JMdict | Không biết nghĩa gốc tài liệu ("withdraw some money from your account"). |
| Tesseract-only (không có Gemini) | Dòng lẫn chữ Trung/Hàn/Latin đọc sai | 84 từ, hơn nửa `suspect`. Không phải mục tiêu chính của plan này. |

Đã kiểm tra: `furigana.align` chạy đúng trên cả cụm (`銀行でお金を下ろす` → 銀/ぎん, 行/こう, でお, 金/かね, を, 下/お, ろす),
nhưng `classify` trả `None` cho cụm (không có trong danh sách JLPT) và `han_viet` trên cụm cho chuỗi vô nghĩa
(`NGÂN HÀNH KIM HẠ`) → cần quy tắc riêng cho cụm (mục 2.4).

## 1. Mục tiêu và tiêu chí nghiệm thu

1. **Ảnh mẫu** → đúng các mục như bảng, mỗi mục một cụm: `銀行でお金を下ろす`, `銀行でお金を引き出す`, `預ける`, `銀行口座`,
   `自動で引き落とされる`, `授業料を払い込む`, `家賃を振り込む`, `振込`, `公共料金を支払う`, `支払い`, `手数料がかかる`, `収入`, `支出`,
   `赤字`, `黒字`, `外食する`, `自炊する`, `高くつく`, `栄養がかたよる`, `バランスが取れた食事` (20 mục).
   `meaningEn` = gloss trong ảnh; `meaningVi` = bản dịch sát gloss đó. Chú thích `＊公共料金＝…` **bị bỏ**, không thành từ.
2. **Văn xuôi** (đoạn văn, bài đọc, DOCX giáo trình) → hành vi **giữ nguyên**, toàn bộ test hiện có pass.
3. **Danh sách dán tay** kiểu `単語<TAB>nghĩa`, `単語 - nghĩa`, `単語：nghĩa tiếng Việt`, `単語｜nghĩa` → cũng ra cụm + nghĩa;
   nghĩa tiếng Việt trong tài liệu được dùng thẳng làm `meaningVi`, **không** gọi Gemini cho mục đó.
4. Người dùng sửa văn bản (`PUT /{id}/text`) rồi chạy lại vẫn ra cụm (mọi suy luận nằm ở ANALYZE, không phụ thuộc ảnh).
5. Gemini hết quota khi dịch → job vẫn DONE với nghĩa EN, người dùng bấm **"Dịch lại nghĩa"** sau mà không mất chỉnh sửa (2.7).

## 2. Thiết kế

### 2.1 Khái niệm "bố cục" (`layout`): `list` hay `prose`

Quyết định ở **ANALYZE** (không phải TEXT) vì `extracted_text` là nguồn sự thật người dùng sửa được. Tính trên các dòng
có tiếng Nhật:

- `list` khi **đủ cả**: ≥ 3 dòng; **trung vị** độ dài phần tiếng Nhật ≤ 20 ký tự; < 20 % dòng kết thúc bằng `。！？`;
  và (≥ 50 % dòng có phần nghĩa không phải tiếng Nhật **hoặc** ≥ 50 % dòng có tách cột `TAB`/`｜`/`|`).
- Ngược lại `prose` → đi nhánh cũ nguyên vẹn.
- Tuỳ chọn mới `extractMode: "auto" | "list" | "prose"` (mặc định `auto`) để người dùng ép. Thêm ở ai-service + backend
  `ExtractionOptions`; nút chọn ở frontend là Should (mục 4).
- `stats.layout` trả về để frontend hiện "Nhận dạng: danh sách từ vựng".

### 2.2 Định dạng dòng-mục trong `text`

Mỗi mục một dòng: `<cụm tiếng Nhật><TAB><nghĩa>`. Chú thích là dòng riêng bắt đầu `＊` / `※` / `*`. Đây cũng là định dạng
Gemini Vision xuất ra (2.3) và là thứ người dùng thấy / sửa trong ô văn bản. Parser (2.4) chấp nhận thêm các dấu tách
`｜ | ： : — – -` và **ranh giới chữ viết** (hết chữ Nhật → bắt đầu Latin / Hangul / chữ Hán không phải tiếng Nhật) để
xử lý dòng Tesseract và văn bản dán tay không có TAB.

### 2.3 TEXT – prompt Gemini Vision mới cho bảng từ vựng (`gemini.py`)

Thay `_TRANSCRIBE_PROMPT` bằng prompt yêu cầu:

- Văn xuôi → chép nguyên văn như cũ.
- Bảng / danh sách từ vựng → mỗi **mục** một dòng `headword<TAB>gloss`; gloss lấy tiếng Anh (hoặc tiếng Việt nếu có),
  **bỏ** gloss tiếng Trung / Hàn, bỏ furigana nhỏ, bỏ ký hiệu `↔ ⇔ ➔ ●` và nhãn `(N)` `(V)`.
- Ô có nhiều lựa chọn (`お金を[下ろす / 引き出す`) → **khai triển** thành các cụm đầy đủ, dùng chung gloss.
- Mục ở cột phải (`↔ 預ける`, `➔ 振込`) là mục riêng, kèm gloss của nó.
- Chú thích (`＊公共料金＝…`) giữ nguyên thành dòng riêng bắt đầu `＊` (ANALYZE sẽ bỏ; giữ trong văn bản để người dùng thấy đủ).

Một lần gọi như cũ, không tăng chi phí. `_gemini_plausible` chỉ đếm ký tự tiếng Nhật nên không bị gloss làm lệch.

### 2.4 ANALYZE – module mới `app/extract/entries.py` + nhánh `list` trong `pipeline.analyze`

`entries.py` (thuần hàm, dễ test):

- `detect_layout(lines) -> "list" | "prose"` theo 2.1.
- `parse_line(line) -> Entry | None`: `headwords: list[str]`, `gloss: str | None`, `gloss_lang: "en" | "vi" | None`.
  - Dòng chú thích (bắt đầu `＊ ※ *` hoặc chứa `＝`) → `None` (**bỏ**, quyết định Q4).
  - Bỏ bullet / số thứ tự đầu dòng, ký hiệu `↔ ⇔ ➔ → ● ○ ・`, nhãn `(N) (V) (adj)`.
  - `A／B`, `A/B`, `A・B` giữa hai cụm tiếng Nhật → 2 headword cùng gloss; cụm có phần chung đứng trước ngoặc
    (`銀行でお金を[下ろす/引き出す`) → ghép phần chung vào từng lựa chọn.
  - Ngôn ngữ gloss: có dấu tiếng Việt (`ăâđêôơư` + thanh) → `vi`; Latin thường → `en`; Hangul hoặc chữ Hán không có
    cách đọc tiếng Nhật trong `unihan_japanese.csv` (vd `银 账 户`) → bỏ gloss. Chỉ lấy **đoạn nghĩa đầu tiên**, phần
    đuôi (chữ Trung/Hàn Tesseract đọc nhầm) bỏ.
  - Dòng chỉ có chữ không phải tiếng Nhật → bỏ (dòng Tesseract rác / dòng tiếng Anh đơn lẻ).

Nhánh `list` trong `analyze` (từng mục; **không** tách thêm từ bên trong cụm — Q1):

| Trường | Cách tính |
|---|---|
| `term` / `surface` | headword đã làm sạch (giữ nguyên dạng, **không** lemma hoá). |
| `reading` | ruby từ nguồn nếu có, nếu không ghép reading Sudachi mode C (`reading_of`). |
| `readingSegments` | `align(term, reading)` (đã chạy tốt trên cụm). |
| `hanViet` | chỉ khi headword là **một từ** (1 token nội dung, không có trợ từ); cụm → `null`. |
| `pos` | 1 token → `pos1` của Sudachi; cụm → `"句"`. |
| `level` | headword có trong danh sách JLPT → như cũ. Không có → **cấp cao nhất** trong các từ nội dung của cụm (Q5), `levelConfidence = min(conf) × 0.8`, `levelSources` thêm `phrase:<từ quyết định>`; không từ nào có cấp → `null`. |
| `meaningEn` / `meaningVi` | từ gloss theo `gloss_lang`. Không có gloss → JMdict tra **cả cụm**; vẫn không có → `null` (ENRICH lo). |
| `example` | `null` (cụm tự nó là ví dụ). |
| `frequency` | gộp headword trùng. |
| `suspect` | như cũ theo conf OCR; thêm: `term` còn ký tự không phải tiếng Nhật, hoặc > 40 ký tự. |

`levelFilter` / `treatUnknownAs` / `minFrequency` / giới hạn 600 áp như cũ. **Ngữ pháp**: ở `list` không chạy matcher (Q3).

### 2.5 ENRICH – dịch sát gloss gốc, không dịch lại thứ đã có

- `gemini.py` `_TRANSLATE_PROMPT`: thêm quy tắc *"`meaningEn` là nghĩa gốc trong tài liệu của người học → dịch sát
  nghĩa đó sang tiếng Việt, không thay bằng nghĩa từ điển khác"*.
- `ExtractionWorker.enrich` (Java): **bỏ qua** item đã có `meaningVi` (gloss tiếng Việt trong tài liệu, hoặc người dùng đã sửa).
- `filter_enriched` giữ nguyên (generate-then-filter).

### 2.6 Không đổi

Schema DB (`term` 200, `example` 500 đủ), luồng tạo bộ thẻ, trang kết quả (cụm hiện qua `Ruby` như từ), SRS, Tesseract.

### 2.7 Dự phòng khi Gemini hết quota (Q2, không thêm dependency)

Thực tế khi chạy thử hôm nay Gemini trả `503 UNAVAILABLE` liên tiếp 2 lần rồi mới thành công, nên dự phòng cần cả 429 lẫn 503.

1. **Thử lại có giãn cách** trong `gemini._generate`: tối đa 3 lần cho `429` / `503`, chờ 2 s → 4 s → 8 s. Tổng ≤ 15 s,
   nằm trong `AI_SERVICE_READ_TIMEOUT` (3 phút).
2. **Model dự phòng** `GEMINI_FALLBACK_MODEL` (tuỳ chọn, mặc định rỗng; gợi ý `gemini-3.8-flash-lite` — quota riêng theo model):
   hết lượt thử lại ở model chính → thử một lần ở model dự phòng, cho cả dịch nghĩa lẫn Vision OCR.
3. **Dịch lại sau** khi vẫn thất bại: job DONE với nghĩa EN, `stats.enrichReason = "quota"`. Thêm `POST /api/extractions/{id}/enrich`
   chỉ chạy lại bước ENRICH cho item **chưa có `meaningVi`** (không chạy lại ANALYZE nên không mất chỉnh sửa / tick chọn).
   Frontend hiện nút **"Dịch lại nghĩa"** khi `enrichReason` là `quota` / `error`. Không tính vào hạn mức ngày (job cũ,
   không tốn OCR); chặn gọi lại trong 5 phút cho mỗi job để tránh spam.
4. Thẻ tạo ra dùng `meaningVi ?? meaningEn` nên người học luôn có nghĩa (EN) ngay cả khi 1–3 đều thất bại.

Không chọn: dịch máy offline (Argos ~ hàng trăm MB model) hay API dịch miễn phí bên thứ ba (cũng giới hạn, thêm phụ thuộc).

## 3. Thay đổi theo tệp

| Tệp | Việc |
|---|---|
| `ai-service/app/extract/entries.py` **(mới)** | `detect_layout`, `parse_line`, tách headword / gloss / ngôn ngữ gloss, lọc chữ Hán không phải tiếng Nhật. |
| `ai-service/app/extract/pipeline.py` | `analyze`: đọc `extractMode`, gọi `detect_layout`; nhánh `list` dựng item theo 2.4; `stats.layout`; nhánh `prose` không đổi. Tách phần dựng item vocab hiện có thành hàm dùng chung. |
| `ai-service/app/extract/jlpt/classifier.py` | hàm `phrase_level(tokens)` (cấp cao nhất của từ nội dung). |
| `ai-service/app/extract/gemini.py` | prompt chép `headword<TAB>gloss`; prompt dịch ưu tiên gloss gốc; retry 429/503; `GEMINI_FALLBACK_MODEL`. |
| `ai-service/app/core/config.py`, `.env.example` | `GEMINI_FALLBACK_MODEL`. |
| `ai-service/app/extract/readers/image_reader.py` | `_gemini_blocks` giữ từng dòng (mỗi dòng một mục). |
| `ai-service/app/api/extract_router.py` | `ExtractionOptions.extractMode`. |
| `ai-service/tests/test_entries.py` **(mới)** | parser: TAB / `｜` / ` - ` / `：` / ranh giới chữ viết, `(N)`, `↔`, `A/B`, ngoặc khai triển, gloss VI / EN / ZH / KO, dòng chú thích bị bỏ, dòng rác. |
| `ai-service/tests/test_pipeline.py` | thêm: fixture văn bản Gemini của ảnh mẫu (20 mục, nghĩa EN, cấp cụm, không có từ con), danh sách dán tay có nghĩa VI, văn xuôi không đổi, `extractMode` ép. |
| `ai-service/tests/test_gemini.py` | prompt dịch có `meaningEn`; retry 429/503; fallback model (mock). |
| `ai-service/tests/fixtures/vocab_table.png` **(mới)** + `.expected.json` | ảnh mẫu này làm fixture thật đầu tiên; test tích hợp bỏ qua khi thiếu Gemini. |
| `backend-core/.../dto/extraction/ExtractionOptions.java` | `extractMode` (mặc định `auto`). |
| `backend-core/.../service/ExtractionWorker.java` | `enrich`: bỏ item đã có `meaningVi`; hàm `enrichOnly(jobId)`. |
| `backend-core/.../service/ExtractionService.java`, `ExtractionController.java` | `POST /{id}/enrich` (chủ job, job DONE, cách lần trước ≥ 5 phút). |
| `backend-core/src/test/.../ExtractionIT.java` | item có `meaningVi` không bị ghi đè; `/enrich` chỉ dịch item thiếu nghĩa VI. |
| `frontend/.../extractionUtils.ts`, `api.types.ts`, `ExtractionPage`, modal tuỳ chọn | `extractMode`, huy hiệu "Danh sách từ vựng", nút "Dịch lại nghĩa" (Should). |
| `docs/EXTRACTION.md`, `docs/CHANGELOG.md` | cập nhật mục 2, 3 (ANALYZE list/prose, `/enrich`, biến môi trường mới). |

## 4. Thứ tự thực hiện (TDD từng bước, mỗi bước chạy được riêng)

1. **`entries.py` + test** (thuần, không cần Gemini/Tesseract).
2. **Nhánh `list` trong `pipeline.analyze` + test** trên fixture văn bản Gemini của ảnh mẫu và danh sách dán tay.
3. **Gemini**: prompt Vision mới, prompt dịch, retry + model dự phòng; test mock; chạy tay trên ảnh mẫu, ghi fixture.
4. **Backend**: `extractMode`, bỏ qua enrich khi đã có `meaningVi`, endpoint `/enrich`, test IT.
5. **Frontend (Should)**: `extractMode` trong modal, huy hiệu layout, nút "Dịch lại nghĩa".
6. Docs + chạy toàn bộ `pytest`, `mvn test`, `npm run lint/build`.

## 5. Quyết định đã chốt (12/10/2026)

- **Q1** – Chế độ `list` **không** tách thêm từ bên trong cụm. Muốn từ đơn → `extractMode = prose`.
- **Q2** – Nghĩa EN trong tài liệu **có** dịch sang VI; kèm dự phòng khi hết quota (mục 2.7).
- **Q3** – Ngữ pháp **tắt** ở chế độ `list`.
- **Q4** – Chú thích `＊…` **bỏ hẳn**.
- **Q5** – Cấp JLPT của cụm = cấp **cao nhất** của từ bên trong.

## 6. Ngoài phạm vi

- Cải thiện Tesseract trên bảng song ngữ (vẫn best-effort; Gemini là đường chính cho ảnh loại này).
- Tách cột bảng bằng bbox Tesseract (chỉ cần nếu chạy không Gemini; để sau).
- Sinh ví dụ mới cho cụm, nghĩa đa ngôn ngữ ngoài EN/VI, dịch máy offline.
