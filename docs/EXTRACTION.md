# Bóc tách tài liệu tiếng Nhật → Flashcard (UC-05 → UC-12, UC-17, UC-18)

Người dùng tải ảnh / PDF / DOCX / TXT hoặc dán văn bản → hệ thống trích **từ vựng** và **mẫu ngữ pháp**, gán cách đọc
(furigana từng chữ), âm Hán-Việt, nghĩa (EN từ JMdict, VN qua Gemini), cấp JLPT → người dùng duyệt / sửa → tạo bộ thẻ
vào thư mục → học bằng SRS hiện có (không đổi thuật toán).

## 1. Luồng xử lý

```
React  QuickAiUploadModal ──POST multipart──▶ Spring  /api/extractions  (ExtractionController)
       ExtractionPage  ◀──poll 2s GET /{id}──  ExtractionService: lưu job, @Async ExtractionWorker
                                                   │ stage TEXT     POST ai-service /api/extract/text     file/text → văn bản + blocks
                                                   │ stage ANALYZE  POST ai-service /api/extract/analyze  văn bản → items (vocab/grammar + cấp)
                                                   │ stage ENRICH   POST ai-service /api/extract/enrich   Gemini: nghĩa VN + ví dụ VN (bỏ qua nếu lỗi)
                                                   ▼
                                               Postgres: extraction_jobs, extraction_items  (V12)
       "Tạo bộ thẻ" ──POST /{id}/decks──▶ DeckService.create  →  decks / flashcards (+ level, kind, reading_segments, han_viet)
```

- **File gốc không lưu**: byte chỉ sống trong lúc gọi bước TEXT. Văn bản đã trích lưu ở `extraction_jobs.extracted_text`
  để người dùng sửa lỗi OCR (`PUT /{id}/text`) rồi chạy lại từ ANALYZE, không cần tải lại.
- **Worker trong tiến trình** (`config/AsyncConfig.java`, pool 2–4 thread, hàng đợi 50): không có Redis / queue. Bảng job là
  nguồn sự thật; khởi động lại backend thì job dở dang bị đánh FAILED (`ExtractionService#failOrphans`).
- **Giới hạn**: 5 lượt / 24 giờ (free), 50 (premium) — `app.extraction.daily-limit.*`, đếm trong DB. File ≤ 15 MB, văn bản
  ≤ 50 000 ký tự, PDF ≤ 20 trang. Định dạng: TXT, MD, DOCX, PDF, PNG, JPG, WEBP (kiểm tra cả magic bytes).
- **Trạng thái** (`status`): QUEUED → RUNNING → DONE | FAILED; `stage`: QUEUED → TEXT → ANALYZE → ENRICH → DONE.

## 2. API backend (`/api/extractions`, cần JWT; job chỉ chủ sở hữu thấy, người khác = 404)

| Method | Path | Body / Query | Trả về |
|---|---|---|---|
| POST | `/api/extractions` | multipart: `file` **hoặc** `text`; `options` (chuỗi JSON, tuỳ chọn) | 202 `ExtractionJobResponse` |
| GET | `/api/extractions` | — | 50 job gần nhất của tôi |
| GET | `/api/extractions/{id}` | `includeText=true` để kèm văn bản | `ExtractionJobResponse` |
| PUT | `/api/extractions/{id}/text` | `{text}` | 202, chạy lại từ ANALYZE |
| POST | `/api/extractions/{id}/rerun` | — | 202, chạy lại từ ANALYZE (400 nếu chưa có văn bản) |
| POST | `/api/extractions/{id}/enrich` | — | 202, chỉ chạy lại bước ENRICH cho item chưa có `meaningVi` (job phải DONE và `meaningLang=vi`; 429 nếu `stats.enrichedAt` < 5 phút; không tính hạn mức ngày) |
| GET | `/api/extractions/{id}/items` | `kind=vocab\|grammar`, `level=N5..N1\|unknown`, `selected` | `ExtractionItemResponse[]` |
| PATCH | `/api/extractions/{id}/items` | `[{id, selected?, term?, reading?, meaningVi?, meaningEn?, level?}]` — chuỗi rỗng = xoá, `level:""` = bỏ cấp | toàn bộ items |
| POST | `/api/extractions/{id}/decks` | `{vocab: {title, folderId?, level?} \| null, grammar: {...} \| null}` | 201 `DeckResponse[]` |
| DELETE | `/api/extractions/{id}` | — | 204 (bộ thẻ đã tạo giữ nguyên) |

`ExtractionOptions` (lưu trong `options`, mặc định điền từ hồ sơ):

```json
{ "userLevel": "N3", "levelFilter": "at_or_above", "includeGrammar": true, "includeFurigana": true,
  "includeHanViet": true, "meaningLang": "vi", "treatUnknownAs": "above", "minFrequency": 1, "ocrMode": "auto",
  "extractMode": "auto" }
```

`levelFilter`: `all` | `at_or_above` (giữ cấp ≥ trình độ của tôi và chưa rõ) | `only_unknown_to_me` (chỉ cấp cao hơn và chưa rõ).
`treatUnknownAs`: `above` (giữ, `level = null`) | `drop`.
`extractMode`: `auto` (ai-service tự nhận dạng bố cục, trả về `stats.layout`) | `list` (danh sách / bảng từ vựng: mỗi dòng
một **cụm** + nghĩa in sẵn, không tách từ bên trong, không ngữ pháp) | `prose` (văn xuôi: tách từng từ như trước).

**Tạo bộ thẻ**: mỗi loại một bộ (từ vựng → `category = goi`, ngữ pháp → `bunpou`), chỉ item `selected`. Thẻ sắp N5 → N1,
chưa rõ cấp cuối, cùng cấp thì tần suất giảm dần (thứ tự thẻ = thứ tự học). `meaning` nhiều dòng theo quy ước thẻ:
dòng 1 = nghĩa VN (không có thì EN), rồi `Hán-Việt: …`, câu ví dụ, bản dịch ví dụ. Thẻ giữ `level`, `kind`,
`readingSegments` (`[{kanji, kana}]` cho `Ruby` hiện furigana từng chữ), `hanViet`; trình soạn thẻ không gửi các trường
này thì backend giữ nguyên.

## 3. ai-service (`/api/extract/*`, chỉ backend gọi; header `X-Internal-Key` = `AI_SERVICE_KEY`, bỏ qua khi rỗng)

| Endpoint | Việc |
|---|---|
| `POST /api/extract/text` (multipart `file` hoặc `text`, `ocr_mode`) | TXT/MD: decode + NFKC; DOCX: python-docx, đọc cả `<w:ruby>`; PDF: pypdf, trang không có chữ → pypdfium2 render → OCR; ảnh: Pillow tiền xử lý (EXIF, flatten alpha, grayscale, khử bóng đổ, autocontrast, phóng to cạnh ngắn ≥ 1000 px, deskew ±5°) → Tesseract `jpn` psm 6 và `jpn_vert` psm 5 song song, chọn theo `mean_conf × min(1, dòng_trung_vị/8)`; điểm < 0.5 → OSD xoay 90/180/270 rồi đọc lại; chữ dọc sắp cột phải → trái → confidence < `OCR_FALLBACK_CONFIDENCE` (0.85) và có `GEMINI_API_KEY` → Gemini Vision nhận ảnh đã tiền xử lý (`meanConfidence=null`, `lowConfidence=true` nếu dài lệch > 3× bản Tesseract); prompt yêu cầu bảng / danh sách từ vựng xuất mỗi mục một dòng `cụm<TAB>nghĩa EN` (khai triển `[A/B`, bỏ gloss Trung/Hàn, bỏ `↔ (N)`), văn xuôi chép nguyên văn. PDF scan: tối đa 3 trang song song. Furigana nhỏ trong ảnh / `漢字（かんじ）` trong văn bản → ruby hint, không thành từ riêng. |
| `POST /api/extract/analyze` (`{text, blocks, options}`) | **Bố cục** (`entries.detect_layout`, hoặc ép bằng `extractMode`): `list` khi ≥ 3 dòng tiếng Nhật, trung vị cụm đầu dòng ≤ 20 ký tự, < 20 % dòng kết thúc câu và ≥ 50 % dòng có nghĩa / dấu tách cột (`TAB` `｜` `|`). **`list`**: mỗi dòng `cụm<TAB>nghĩa` (cũng nhận ` - ` `：` `｜` và ranh giới chữ viết; cột cụm = cột đầu tiên có tiếng Nhật nên `nghĩa<TAB>cụm` vẫn chạy; cột toàn kana → cách đọc, vd. `漢字<TAB>かんじ<TAB>kanji`; `auto` mà `list` không ra mục nào → rơi về `prose`) → `term` = cụm nguyên dạng, reading ghép Sudachi, furigana từng chữ, `pos = 句` (một từ thì POS thật + Hán-Việt), cấp = cấp khó nhất trong các từ nội dung (`levelSources[0] = phrase:<từ>`, confidence × 0.8); nghĩa EN in sẵn → `meaningEn`, nghĩa VI in sẵn (có dấu) → `meaningVi` (ENRICH bỏ qua); gloss Trung/Hàn bỏ; dòng chú thích `＊ ※` bỏ; không tách từ bên trong, không ngữ pháp. `stats.layout` cho frontend. **`prose`** (văn xuôi): tách câu → SudachiPy mode C (ứng viên) + mode A (thành phần từ ghép, furigana) → lọc POS → gộp theo lemma + tần suất → căn furigana từng chữ → Hán-Việt (Unihan `kVietnamese`) → nghĩa EN (JMdict) → cấp JLPT (5 danh sách N5–N1, mơ hồ chọn cấp dễ nhất + `levelConfidence` + `levelSources`; không có → wordfreq, confidence 0.4; vẫn không → `null`) → mẫu ngữ pháp (`grammar/patterns.yaml`, matcher trên chuỗi token) → áp `levelFilter` / `treatUnknownAs` / `minFrequency` → tối đa 600 từ + 100 mẫu. |
| `POST /api/extract/enrich` (`{targetLang, items[{ref,…}]}`) | Gemini dịch batch; `meaningEn` có sẵn (nghĩa in trong tài liệu) được dịch sát, không thay bằng nghĩa từ điển; lọc kết quả rỗng / quá dài / chứa chữ Nhật / đổi từ (generate-then-filter). Không có key → `enriched=false`, job vẫn DONE với nghĩa EN. Mọi lượt gọi Gemini (Vision lẫn dịch) gặp 429/503: thử lại sau 2 / 4 / 8 s rồi một lần ở `GEMINI_FALLBACK_MODEL` (nếu đặt); vẫn lỗi → `reason = quota` → backend ghi `stats.enrichReason`, frontend hiện nút "Dịch lại nghĩa" (`POST /api/extractions/{id}/enrich`). |
| `GET /api/extract/health` | sudachi / jmdict / jlpt / unihan / grammar / tesseract / gemini sẵn sàng chưa |

Dữ liệu: `ai-service/app/extract/data/` — JLPT CSV (commit), `unihan_vietnamese.csv` (commit), `jmdict.sqlite` (**không
commit**, tạo bằng `python scripts/build_dicts.py`). Nguồn và giấy phép trong `data/README.md`.

## 4. Cài đặt

- Backend: `AI_SERVICE_URL` (mặc định `http://localhost:8000`), `AI_SERVICE_KEY` (tuỳ chọn), `AI_SERVICE_READ_TIMEOUT` (`PT3M`).
- ai-service: `pip install -r requirements.txt`, `python scripts/build_dicts.py` (tải JLPT / Unihan / JMdict, cần mạng một lần),
  `GEMINI_API_KEY` (tuỳ chọn, model `GEMINI_MODEL`, mặc định `gemini-3.8-flash`; `GEMINI_FALLBACK_MODEL` tuỳ chọn, vd.
  `gemini-3.8-flash-lite`, dùng khi model chính 429/503 sau 3 lần thử lại), Tesseract 5 + traineddata `jpn`, `jpn_vert` (Windows: đặt `TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe`).
  Không có Tesseract nhưng có `GEMINI_API_KEY`: ảnh / PDF scan chép thẳng bằng Gemini Vision. Thiếu cả hai: job FAILED
  với thông điệp "OCR engine unavailable: chưa cài Tesseract… và không có GEMINI_API_KEY"; các nguồn khác vẫn chạy.

## 5. Trường hợp biên

| Trường hợp | Xử lý |
|---|---|
| Chữ dọc | chạy `jpn` và `jpn_vert`, chọn theo confidence × độ dài dòng; sắp cột phải → trái; Gemini fallback |
| Ảnh nghiêng / xoay 90–180° không EXIF | deskew projection profile; OSD khi cả hai lượt đọc kém (CER ~1.0 → ~0.03–0.05) |
| Ảnh bóng đổ, nền trong suốt | khử nền bằng chia cho nền ước lượng; flatten alpha lên trắng |
| Trang ngang 2 cột | tìm rãnh trắng dọc rộng ≥ 1.5 dòng ở giữa trang → OCR từng nửa, nối trái → phải (Tesseract tự nó gộp 2 cột thành 1 dòng ở mọi psm) |
| Furigana trong ảnh / DOCX / ngoặc | loại khối kana nhỏ theo bbox; `<w:ruby>` và `漢字（かな）` → cách đọc chuẩn |
| Từ ghép | Sudachi C vs A: có trong từ điển → giữ; không → tách thành phần |
| Động từ chia | `term` = dictionary form, `surface` = dạng gặp |
| Đa đọc (行く / 行う) | tra `(lemma, reading)` trước |
| Cấp mơ hồ / chưa rõ | cấp dễ nhất + `levelConfidence`, `levelSources`; chưa rõ → `null`, tuỳ `treatUnknownAs` |
| ai-service chết / timeout | job FAILED + thông điệp; "Chạy lại" dùng văn bản đã lưu |
| Backend restart | job dở dang → FAILED "Máy chủ đã khởi động lại…" |
| Không có Gemini key | OCR chỉ Tesseract (+ cảnh báo `lowConfidence`), nghĩa EN, job vẫn DONE |

## 5b. Hạn chế đã biết và việc chưa làm

- **Chưa đo trên ảnh chụp thật**: mọi số CER ở mục 6 là ảnh tổng hợp (`ocr_eval.py --real DIR` sẵn sàng khi có ảnh + đáp án).
- **Phụ thuộc Gemini** cho nghĩa VN và OCR dự phòng: hết quota (429/503) thì job vẫn DONE với nghĩa EN, bấm "Dịch lại nghĩa".
  Thử dịch offline (NLLB) đã làm rồi hoàn tác 12/10 — xem [Plan/README.md](Plan/README.md).
- **File gốc không lưu** trên server; "Phân tích lại" dùng văn bản đã trích (sửa được). Spec 13/10 đề xuất lưu file gốc —
  chưa duyệt, chưa làm.
- Giao diện: thanh tiến trình xuyên trang, trang danh sách nâng cấp và trang kết quả kiểu "Sửa bộ thẻ" mới là spec trong
  [Plan/specs/](Plan/specs/), chưa có code.

## 6. Test

- Backend: `ExtractionIT` (ai-service giả lập bằng `@MockitoBean AiServiceClient`): chạy nền → DONE → lọc / PATCH items →
  tạo 2 bộ thẻ đúng thứ tự + metadata → sửa văn bản chạy lại → AI lỗi → FAILED → rerun; kiểm tra đuôi / magic bytes; 404 job
  người khác; 429 vượt giới hạn (`app.extraction.daily-limit.free=3` trong `application-test.properties`).
- ai-service: `cd ai-service && python -m pytest -q` (furigana, classifier, tokenizer, docx ruby, grammar, pipeline, entries,
  gemini, image/pdf reader, router). Test cần Tesseract tự skip khi thiếu; `test_vision_fixture.py` gọi Gemini thật chỉ khi
  `RUN_GEMINI_TESTS=1` (tốn quota). CI (Python 3.12) không có Tesseract / Gemini / `jmdict.sqlite`.
- Smoke end-to-end: `npm run smoke:extraction` (cần backend + ai-service thật; `npm run e2e` cũng chạy nó trên DB cô lập).
- Tay: chạy ai-service + `npm run dev`, Dashboard → "Tải tài liệu & bóc tách AI" → dán đoạn văn → trang `/extractions/:id`.

### Đo chất lượng OCR (`ai-service/scripts/ocr_eval.py`)

Sinh ảnh tổng hợp có seed cố định từ từ vựng JLPT (11 nhóm × `--n` ảnh), chạy `image_reader.read_image`, in CER / tỉ lệ
Gemini / thời gian / vocab F1 (so tập từ `pipeline.analyze` của text OCR với text gốc). `--gemini` mới gọi Gemini (tốn
quota), `--real DIR` thêm ảnh thật (`a.png` + `a.txt`), `--set image_reader.MIN_SHORT_SIDE=1500` để A/B hằng số,
`--json` để so trước/sau. Chạy từ `ai-service/`: `venv/Scripts/python.exe scripts/ocr_eval.py`.

**Baseline 2026-10-10** (chỉ Tesseract `jpn`/`jpn_vert` bản fast, không Gemini, `--n 6`, 66 ảnh, ảnh **tổng hợp** — chưa
có ảnh thật nên số trên ảnh chụp thật có thể xấu hơn):

| Nhóm | CER mean | ≤5% | vocab F1 | p50 / ảnh |
|---|---|---|---|---|
| clean_h (ngang, sạch) | 0.023 | 100% | 0.912 | 2.3 s |
| clean_v (dọc) | 0.034 | 67% | 0.921 | 1.8 s |
| small_text (độ phân giải thấp) | 0.021 | 100% | 0.929 | 2.6 s |
| skew (nghiêng 2–5°) | 0.077 | 33% | 0.837 | 2.2 s |
| rot90 (không EXIF) | 0.996 | 0% | 0.000 | 2.7 s |
| rot180 (không EXIF) | 1.035 | 0% | 0.009 | 3.0 s |
| lowcontrast | 0.182 | 67% | 0.784 | 2.3 s |
| shadow (bóng đổ) | 0.624 | 0% | 0.371 | 2.1 s |
| noise | 0.056 | 67% | 0.850 | 2.1 s |
| furigana | 0.281 | 50% | 0.784 | 1.9 s |
| two_col (2 cột) | 0.580 | 0% | 0.913 | 1.9 s |
| **Tất cả** | **0.355** (med 0.087) | 44% | 0.665 | p95 3.2 s |

**Các bước nâng cấp đã đo** (cùng bộ ảnh, chỉ Tesseract; nhóm `alpha` = PNG nền trong suốt thêm từ bước 1):

| Bước | Thay đổi | Kết quả | Giữ? |
|---|---|---|---|
| 1 | Flatten alpha lên nền trắng trước grayscale | alpha CER 1.000 → 0.062 | ✔ |
| 1 | NFKC cho text OCR ảnh + Gemini (`text_reader.normalize`) | không đổi CER tổng hợp (ảnh font Nhật chuẩn), thống nhất với txt/pdf/docx | ✔ |
| 1 | `jpn+eng` cho lượt ngang | tổng 0.331 → 0.355, skew 0.077 → 0.187 | ✘ |
| 1 | `--oem 1 -c user_defined_dpi=300` | giống hệt mặc định | ✘ |
| 2 | Deskew ±5° bằng projection profile (Pillow + numpy, ~200 ms), chỉ xoay khi điểm góc tốt nhất > 1.2× điểm 0° | skew 0.077 → 0.023; clean_v không đổi (không có biên 1.2× thì clean_v 0.034 → 0.042) | ✔ |
| 2 | OSD (`image_to_osd`, `osd.traineddata`) khi điểm hướng tốt nhất < 0.5 → xoay 90/180/270 rồi đọc lại | rot90 0.996 → 0.045, rot180 1.035 → 0.028; ảnh sạch không gọi OSD | ✔ |
| | **Sau bước 2** | **tổng CER 0.355 → 0.163** (med 0.087 → 0.040, ≤5%: 44% → 61%, vocab F1 0.665 → 0.833) | |
| 3 | `_orientation_score` chia độ dài dòng trung vị cho 8 thay vì 4 (đo: đúng hướng ≥ 11 ký tự, sai hướng 3–5) | hết chọn nhầm dọc ở ảnh ngang: lowcontrast 0.182 → 0.038, shadow 0.624 → 0.484 | ✔ |
| 3 | Dừng sớm sau lượt ngang | **không làm**: trang dọc nhiều cột đọc ngang vẫn cho conf 0.73–0.80 và dòng dài = số cột → sẽ bỏ nhầm lượt dọc | ✘ |
| 3 | 2 lượt jpn/jpn_vert chạy song song (`ThreadPoolExecutor`, mỗi lượt là 1 tiến trình tesseract) + OCR `PAGE_WORKERS=3` trang PDF song song | PDF 20 trang (máy 4 nhân): 44 s → 22 s; kết quả không đổi | ✔ |
| | **Sau bước 3** | **tổng CER 0.139**, vocab F1 0.860 | |
| 4 | Khử nền (`_flatten_background`: max-filter + blur trên bản 1/4 rồi chia ảnh cho nền; Pillow + numpy, ~10–60 ms) | shadow 0.484 → 0.073; các nhóm khác không đổi | ✔ |
| 4 | Nhị phân hoá Otsu tự làm | shadow có cải thiện thêm khi đi kèm khử nền (0.076 → 0.028) nhưng clean_h 0.023 → 0.028 và không giúp gì nếu đứng một mình (Tesseract đã tự Otsu) | ✘ |
| 4 | Lọc furigana: bỏ dấu câu/ký tự không phải kana-kanji trước khi xét "dòng toàn kana" (Tesseract gộp cả hàng ruby thành một dòng có `。、`) | furigana 0.281 → 0.170 | ✔ |
| | **Sau bước 4** | **tổng CER 0.095** (med 0.033, ≤5%: 69%, vocab F1 0.885) | |
| 5 | Ngưỡng fallback | giữ 0.85 (xem hiệu chỉnh bên dưới); không thêm tín hiệu phụ | – |
| 5 | Gửi Gemini ảnh đã khử nền/deskew/xoay đúng thay vì bytes gốc | `--n 3 --gemini`: tổng 0.054 → 0.052, clean_v 0.044 → 0.016, p95 Gemini 15.5 s → 10.6 s | ✔ |
| 5 | Kết quả Gemini: `mean_confidence=None` (trước giữ số của Tesseract → FE hiện "63%" cho văn bản không phải của Tesseract); `low_confidence=True` nếu độ dài lệch > 3× bản Tesseract; không có chữ Nhật → giữ bản Tesseract | 9 ảnh fallback: Gemini CER 0 ở 8/9, tỉ lệ độ dài 0.98–1.06 (chưa gặp ảo giác) | ✔ |
| 6 | psm 3 / 4 / 11 cho lượt ngang, psm 3 cho lượt dọc | two_col không đổi (0.585): Tesseract gộp 2 cột thành 1 dòng ở mọi psm vì chữ Nhật không có khoảng trắng giữa từ; psm 3/4 làm furigana tệ hơn (0.17 → 0.27/0.33), psm 11 phá hẳn (0.80) | ✘ (giữ 6/5) |
| 7 | Hậu xử lý sửa ký tự dễ nhầm (一↔ー, カ↔力, ロ↔口…) / từ điển | **không làm**: lỗi còn lại (trừ two_col) = 108 thay thế + 23 chèn + 3 xoá trên 4104 ký tự, là đuôi dài kanji hình gần (自→目, 末→未, 鼠→還, mỗi cặp ≤ 2 lần); các cặp trong danh sách chỉ xuất hiện 2 lần → bảng sửa chữa được ~1.5% lỗi còn lại | ✘ |

| 6b | Tách 2 cột theo rãnh trắng dọc (`_column_gutter`: profile cột, rãnh ≥ 1.5× chiều cao dòng nằm trong 1/4–3/4 bề rộng chữ) → OCR từng nửa, nối trái → phải; chỉ áp dụng cho lượt ngang | two_col 0.580 → 0.027; nhóm khác không đổi | ✔ |
| | **Sau bước 6b** | **tổng CER 0.049** (med 0.030, ≤5%: 78%, vocab F1 0.884) | |

| 8 | Confidence theo dòng: `blocks[].lines[]={text,conf}` → backend rút `textMeta.lowLines` (conf < 0.75, ≤ 50) → FE liệt kê dòng nghi sai, bấm để chọn trong ô sửa | không đo CER; tận dụng vòng sửa tay + "Phân tích lại" sẵn có | ✔ |

Việc còn mở: **chưa có ảnh chụp thật** để đo — mọi số trên là ảnh tổng hợp (`--real DIR` sẵn sàng khi có ảnh + đáp án).

Hiệu chỉnh lại ngưỡng fallback sau bước 4 (22/72 ảnh còn CER > 5%): 0.80 bắt 3 ảnh sai, 0.85 bắt 11 (5 báo nhầm),
0.88 bắt 15 nhưng 21 báo nhầm, 0.90 bắt 20 nhưng 28 báo nhầm. 6/11 ảnh sót ở 0.85 là two_col (conf 0.83–0.93, sai
thứ tự đọc nên conf không phản ánh) → **giữ 0.85**, không thêm tín hiệu phụ.

Hiệu chỉnh ngưỡng fallback 0.85 trên baseline (trước khi nâng cấp): 37/66 ảnh có CER > 5%, ngưỡng gắn cờ 30 ảnh (26 trúng, 4 báo nhầm ở
ảnh sạch), **bỏ sót 11 ảnh sai** (two_col 5/6 với conf trung bình 0.88, shadow 3/6). Mean confidence của Tesseract
không phản ánh việc sai thứ tự đọc cột hay mất chữ vì bóng đổ.
