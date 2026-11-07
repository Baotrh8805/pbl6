Dịch

# Plan: dịch nghĩa EN → VI **offline** bằng NLLB + CTranslate2, gỡ Gemini khỏi bước dịch

Ngày 12/10/2026 · nhánh `backend-feature-learnmode` · trạng thái: **ĐÃ THỬ RỒI HOÀN TÁC 12/10/2026 theo yêu cầu của người dùng — KHÔNG có trong code**. Gemini vẫn là engine dịch
nghĩa VN (bước ENRICH). Giữ lại để tham khảo kết quả spike ở mục 0 nếu sau này cần dịch offline.
Tiếp nối [2026-10-12-trich-xuat-cum-tu-design.md](2026-10-12-trich-xuat-cum-tu-design.md) (bước ENRICH, nút "Dịch lại nghĩa").

## 0. Kết quả spike (đã chạy thật trên máy này, ngoài project)

| Hạng mục                                                                                                                | Kết quả                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wheel Python 3.14 Windows                                                                                                 | `ctranslate2 4.8.2` và `sentencepiece 0.2.2` đều có wheel `cp314-win_amd64` → cài được vào venv hiện tại, **không cần torch**                                                                                                                                                                                                                                                                                      |
| Model A: Argos`translate-en_vi-1_9` (OPUS-MT, CC-BY 4.0, 75 MB)                                                         | 22 gloss / 0,46 s nhưng chất lượng kém: "payment" → "thanh", "a bank charge" → "sạc ngân hàng", "expenditure" → "Sự bóc lột", "eat out" → "Ăn đi". Tiền xử lý (tách sense, thêm dấu chấm) không cứu được →**loại**                                                                                                                                                                                      |
| Model B:`JustFrederik/nllb-200-distilled-600M-ct2-int8` (NLLB-200, **CC-BY-NC 4.0**, 600 MB, commit `302d78f0`) | 22/27 gloss đúng nghĩa: "withdraw some money from your account" → "rút tiền từ tài khoản của bạn", "bank transfer" → "chuyển khoản ngân hàng", "a bank charge" → "một khoản phí ngân hàng", "eat out" → "ăn ngoài". Sai ở thành ngữ ("in the red" → "màu đỏ") và từ đa nghĩa ("study" → "nghiên cứu"). Nạp 1,8 s; beam 2: 0,07 s/gloss khi lô toàn gloss ngắn, nhưng **review đo lại trên mục thật: 0,14–0,25 s/gloss, ≈ 0,4 s/mục có cả ví dụ → 600 mục ≈ 4 phút** → backend phải gửi theo lô 100 (xem CHANGELOG) |
| NLLB dịch thẳng Nhật → Việt                                                                                          | Câu đầy đủ tốt ("昨日は友達と一緒に映画を見に行きました。" → "Hôm qua tôi đã đi xem phim với bạn bè."),**từ / cụm rời sai nặng** ("預ける" → "Để tôi cho anh") → chỉ dùng cho câu ví dụ, không bao giờ dịch term                                                                                                                                                                                       |

Gemini hiện dùng ở 2 chỗ: (1) dịch nghĩa ENRICH, (2) Vision OCR fallback khi Tesseract đọc kém. Trên chính ảnh bảng
"ngân hàng" anh/chị gửi, Tesseract chỉ đạt conf 0,51 và cho 84 từ rác (hơn nửa `suspect`); 20 cụm đúng là nhờ Gemini
Vision chép lại. Vì vậy "Vision OCR đang tốt" = Gemini đang tốt → xem **Q1**.

## 1. Mục tiêu và tiêu chí nghiệm thu

1. ENRICH chạy **không cần key, không rate limit**: cài model một lần (`python scripts/build_dicts.py --models`), job với
   fixture ảnh ngân hàng ra 20 cụm có `meaningVi` từ engine offline, `stats.enriched = true`.
2. Chất lượng trên fixture `bank_vocab.txt`: ≥ 18/20 nghĩa VI chấp nhận được (theo bảng spike), không có nghĩa chứa chữ Nhật
   hoặc rỗng (lọc `filter_enriched` giữ nguyên).
3. Cùng gloss chỉ dịch một lần: lần thứ hai gặp "bank account" (tài liệu khác, người dùng khác) lấy từ bộ nhớ dịch, không gọi model.
4. Thiếu model → job vẫn DONE với nghĩa EN, `enrichReason = "no_model"`, nút "Dịch lại nghĩa" hiện kèm hướng dẫn cài;
   cài xong bấm là dịch được, không chạy lại ANALYZE.
5. Test hiện có pass; CI (không có model) chạy bằng mock và tự skip test thật.

## 2. Thiết kế

### 2.1 Engine: `ai-service/app/extract/translator.py`

- Singleton lười như Sudachi/JMdict: `available() -> bool` (thư mục model có đủ `model.bin`, `sentencepiece.bpe.model`,
  `shared_vocabulary.txt`, `config.json`), `translate(texts: list[str], src: str = "eng_Latn", tgt: str = "vie_Latn") -> list[str]`.
- `ctranslate2.Translator(dir, device="cpu", compute_type="int8", inter_threads=1, intra_threads=min(4, os.cpu_count()))`;
  token nguồn `[src] + sp.encode(text) + ["</s>"]`, `target_prefix=[[tgt]]`, `beam_size=2`, `max_decoding_length=96`,
  `max_batch_size=32`. Bỏ `tgt`/`</s>` ở đầu ra, thay `▁` bằng khoảng trắng, strip.
- Đầu vào được cắt ≤ 300 ký tự; chuỗi rỗng → "" (không gọi model). Lỗi nạp model → `TranslatorError("no_model" | "error")`.
- RAM khi nạp ≈ 1 GB; nạp lần đầu ≈ 2 s ở request ENRICH đầu tiên (không nạp lúc khởi động để test/CI nhẹ).

### 2.2 Phân phối model: `scripts/build_dicts.py --models`

- Tải 4 file từ `https://huggingface.co/JustFrederik/nllb-200-distilled-600M-ct2-int8/resolve/302d78f00e6fdb50a1064059df7c392b735e9d05/<file>`
  (ghim commit) vào `ai-service/app/extract/data/models/nllb-200-distilled-600M-ct2-int8/` (thêm vào `.gitignore` như `jmdict.sqlite`),
  dùng cache `scripts/.download_cache/` sẵn có, kiểm tra kích thước file sau tải.
- `data/README.md`: ghi nguồn, giấy phép **CC-BY-NC 4.0** (phi thương mại, đủ cho đồ án; xem Q2) và cách xoá.
- `GET /api/extract/health` thêm `translator: bool`.

### 2.3 Bước ENRICH mới (`extract_router.py` + `app/extract/enrich.py`)

Hợp đồng `POST /api/extract/enrich` **không đổi** (`{targetLang, items[{ref, term, reading, pos, meaningEn, example}]}` →
`{enriched, items[{ref, meaningVi, exampleVi}], reason}`), backend/frontend không phải đổi luồng.

Với mỗi item:

1. `meaningVi` = dịch `meaningEn` (gloss in sẵn trong tài liệu hoặc JMdict). Không có `meaningEn` → bỏ qua item (Gemini
   trước đây có thể "đoán" từ `term`; NLLB dịch term rời sai nặng nên **không** làm — mục đó giữ nghĩa trống như khi không có key).
2. `exampleVi` = dịch `example` **Nhật → Việt** (`jpn_Jpan`) chỉ khi `example` ≥ 8 ký tự và có dấu kết câu hoặc ≥ 12 ký tự
   (câu đầy đủ của chế độ `prose`); chế độ `list` không có example nên không tốn gì.
3. Gộp trùng trong một request (hai cụm cùng gloss "withdraw some money…" dịch một lần) và tra bộ nhớ dịch (2.4) trước.
4. Lọc như cũ (`filter_enriched`: rỗng / > 120 ký tự / chứa chữ Nhật → bỏ), thêm: kết quả trùng y nguyên nguồn (model
   không dịch) → bỏ.
5. `reason`: `no_model` khi thiếu file model, `error` khi model lỗi; không còn `quota` / `no_api_key`.

### 2.4 Bộ nhớ dịch (translation memory): `ai-service/app/extract/data/translations.sqlite`

- Bảng `tm(src_lang, tgt_lang, source_key, target, engine, created_at)`, khoá chính `(src_lang, tgt_lang, source_key)`;
  `source_key` = gloss strip + gộp khoảng trắng + lowercase. Chỉ lưu kết quả đã qua lọc 2.3.
- SQLite cùng kiểu `jmdict.py` (kết nối + `threading.Lock`), gitignored, tạo tự động. Không migration backend.
- Có thể dùng chung cho mọi engine sau này (`engine` = `nllb-600m-int8`).

### 2.5 Gỡ Gemini — phạm vi theo Q1

**Phương án A (đề xuất)**: gỡ Gemini khỏi ENRICH (`gemini.translate_items`, `_TRANSLATE_PROMPT`, test tương ứng), **giữ**
`gemini.vision_transcribe` làm fallback OCR tuỳ chọn (không có key → chỉ Tesseract, như hiện nay). Retry/model dự phòng vừa
làm vẫn phục vụ Vision. Env: `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL` giữ, chú thích lại là "chỉ cho OCR".

**Phương án B** (nếu anh/chị chọn): xoá `gemini.py`, `google-genai` khỏi `requirements.txt`, mọi `GEMINI_*`, nhánh fallback
trong `image_reader.py` (`_gemini_only`, `_gemini_blocks`, `_gemini_plausible`, `gemini_error` / `geminiError` trong `TextResult`
và frontend), `ocr_eval.py --gemini`, `test_gemini.py`, `test_vision_fixture.py`, các đoạn docs. Hệ quả: ảnh bảng song ngữ
như ảnh mẫu rơi về Tesseract (84 từ rác) cho tới khi có OCR khác; `extractMode=list` vẫn giúp phần nào nhưng gloss EN do
Tesseract đọc ("bank transfcr") kém.

### 2.6 Backend / frontend

- Backend: không đổi luồng. `enrichReason` chỉ là chuỗi → `no_model` đi qua bình thường. Cooldown 5 phút của `/enrich`
  giữ (giờ bảo vệ CPU thay vì quota).
- Frontend: `geminiReasonText` → `enrichReasonText` với thêm `no_model`: "Máy chủ chưa cài model dịch (chạy
  `python scripts/build_dicts.py --models`)"; thông điệp cạnh nút "Dịch lại nghĩa" bỏ chữ "AI hết hạn mức". Nếu chọn B: xoá
  cảnh báo `geminiError` trong `ExtractedTextPanel`.

### 2.7 Không đổi

ANALYZE (`list` / `prose`), schema DB, API backend, Tesseract, SRS.

## 3. Thay đổi theo tệp

| Tệp                                                                                                        | Việc                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ai-service/requirements.txt`                                                                             | thêm`ctranslate2>=4.8.0`, `sentencepiece>=0.2.0`; (B) bỏ `google-genai`                                                                        |
| `ai-service/app/extract/translator.py` **(mới)**                                                   | engine NLLB theo 2.1                                                                                                                                   |
| `ai-service/app/extract/tm.py` **(mới)**                                                           | bộ nhớ dịch SQLite theo 2.4                                                                                                                         |
| `ai-service/app/extract/enrich.py` **(mới)**                                                       | `enrich_items(items, target_lang) -> (items, reason)` theo 2.3; chuyển `filter_enriched` từ router sang đây                                    |
| `ai-service/app/api/extract_router.py`                                                                    | `/enrich` gọi `enrich.enrich_items`; `/health` thêm `translator`                                                                             |
| `ai-service/app/extract/gemini.py`                                                                        | (A) bỏ phần dịch; (B) xoá file                                                                                                                     |
| `ai-service/scripts/build_dicts.py`                                                                       | `--models` tải model (ghim commit)                                                                                                                  |
| `ai-service/app/extract/data/README.md`, `.gitignore`                                                   | model +`translations.sqlite`                                                                                                                         |
| `ai-service/tests/test_translator.py` **(mới)**                                                    | test thật, skip khi thiếu model: 20 gloss fixture ≥ 18 đạt (so với danh sách chấp nhận), Nhật→Việt câu ví dụ, chuỗi rỗng              |
| `ai-service/tests/test_enrich.py` **(mới)**                                                        | mock`translator.translate`: gộp trùng, bộ nhớ dịch (gọi model đúng 1 lần), bỏ item không có `meaningEn`, `no_model`, lọc chữ Nhật |
| `ai-service/tests/test_gemini.py`, `test_router.py`                                                     | (A) bỏ test dịch, giữ test Vision/retry; (B) xoá                                                                                                   |
| `frontend/src/features/extraction/extractionUtils.ts`, `ExtractedTextPanel.tsx`, `ExtractionPage.tsx` | `enrichReasonText`, thông điệp `no_model`                                                                                                       |
| `.env.example`, `docs/EXTRACTION.md`, `docs/CHANGELOG.md`, `docs/CODEBASE_MAP.md`, `README.md`    | cài model, giấy phép, (A/B) biến Gemini                                                                                                            |

## 4. Thứ tự thực hiện

1. `translator.py` + `build_dicts.py --models` + test thật (model đã tải sẵn trong spike, copy vào `data/models/`).
2. `tm.py` + `enrich.py` + test mock; nối vào router; chạy lại test cũ.
3. Gỡ Gemini theo Q1; frontend chuỗi thông báo; docs; chạy toàn bộ `pytest`, `mvn test`, `npm run lint/build`.
4. Chạy thật fixture ảnh ngân hàng qua `/text → /analyze → /enrich`, ghi 20 nghĩa VI vào `CHANGELOG`.

## 5. Quyết định đã chốt (12/10/2026)

- **Q1 – Phạm vi gỡ Gemini**: **A** — chỉ gỡ khỏi bước dịch, giữ Gemini Vision làm fallback OCR tuỳ chọn như hiện tại
  (chưa có cách bỏ giới hạn key free cho Vision ngoài trả phí hoặc VLM cục bộ cần GPU; xem lại sau).
- **Q2 – Giấy phép model**: đồng ý dùng NLLB-200 (CC-BY-NC 4.0, phi thương mại) cho đồ án; ghi rõ trong `data/README.md`.
- **Q3 – Câu ví dụ** (chế độ `prose`): dịch Nhật → Việt bằng NLLB.
- **Q4 – Mục không có nghĩa EN**: để trống, không dịch term rời.

## 6. Ngoài phạm vi

GPU, ngôn ngữ đích khác VI, thay Gemini Vision bằng OCR/VLM cục bộ (nếu chọn B, cần plan riêng), dịch lại hàng loạt các
job cũ.
