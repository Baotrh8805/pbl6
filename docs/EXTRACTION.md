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
| DELETE | `/api/extractions/{id}` | — | 204 (bộ thẻ đã tạo giữ nguyên); 409 nếu là job của Lộ trình học tập |

Job có cột `purpose` (V13): `extraction` (mặc định) hoặc `learning_path`. Job của lộ trình **không** hiện ở `GET /api/extractions`,
dùng chung hạn mức ngày, và chỉ xoá được qua `DELETE /api/learning-paths/{id}` — xem [LEARNING_PATH.md](LEARNING_PATH.md).

`ExtractionOptions` (lưu trong `options`, mặc định điền từ hồ sơ):

```json
{ "userLevel": "N3", "levelFilter": "at_or_above", "includeGrammar": true, "includeFurigana": true,
  "includeHanViet": true, "meaningLang": "vi", "treatUnknownAs": "above", "minFrequency": 1, "ocrMode": "auto",
  "extractMode": "auto", "splitChapters": false }
```

`splitChapters` (mặc định `false`; Lộ trình học tập bật sẵn): ai-service tách tài liệu theo tiêu đề chương (`第1課`, `Unit 1`,
heading DOCX…) và phân tích từng chương, mỗi item mang `chapter`. Xem [LEARNING_PATH.md](LEARNING_PATH.md).

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
| `POST /api/extract/text` (multipart `file` hoặc `text`, `ocr_mode`, `ocr_fallback_confidence?` 0..1) | (`blocks[].heading`: cấp heading của đoạn DOCX, `null` nếu không phải heading. `meta` luôn có `truncatedPages` — số trang PDF bị bỏ quá 20, 0 nếu không — và `ocrFallbackConfidence` = ngưỡng thực dùng; `ocr_fallback_confidence` ngoài [0, 1] / NaN / inf / không phải số → 422, rỗng → `OCR_FALLBACK_CONFIDENCE`.) TXT/MD: decode + NFKC; DOCX: python-docx, đọc cả `<w:ruby>`; PDF: pypdf, trang không có chữ → pypdfium2 render → OCR, furigana trong text layer → `blocks[].rubies` (B3, xem dưới); ảnh: Pillow tiền xử lý (EXIF, flatten alpha, grayscale, khử bóng đổ, autocontrast, phóng to cạnh ngắn ≥ 1000 px, deskew ±5°) → Tesseract `jpn` psm 6 và `jpn_vert` psm 5 song song, chọn theo `mean_conf × min(1, dòng_trung_vị/8)`; điểm < 0.5 → OSD xoay 90/180/270 rồi đọc lại; chữ dọc sắp cột phải → trái → confidence < `OCR_FALLBACK_CONFIDENCE` (0.85) và có `GEMINI_API_KEY` → Gemini Vision nhận ảnh đã tiền xử lý (`meanConfidence=null`, `lowConfidence=true` nếu dài lệch > 3× bản Tesseract); prompt yêu cầu bảng / danh sách từ vựng xuất mỗi mục một dòng `cụm<TAB>nghĩa EN` (khai triển `[A/B`, bỏ gloss Trung/Hàn, bỏ `↔ (N)`), văn xuôi chép nguyên văn. PDF scan: tối đa 3 trang song song. Furigana nhỏ trong ảnh / `漢字（かんじ）` trong văn bản → ruby hint, không thành từ riêng. |
| `POST /api/extract/analyze` (`{text, blocks, options}`) | (Mọi item có `chapter: int\|null`; khi `splitChapters` bật: tách chương trước, `stats.chaptersDetected` + `stats.chapters[{index,title,vocab,grammar}]`, gộp trùng theo lần xuất hiện đầu.) **Bố cục** (`entries.detect_layout`, hoặc ép bằng `extractMode`): `list` khi ≥ 3 dòng tiếng Nhật, trung vị cụm đầu dòng ≤ 20 ký tự, < 20 % dòng kết thúc câu và ≥ 50 % dòng có nghĩa / dấu tách cột (`TAB` `｜` `|`). **`list`**: mỗi dòng `cụm<TAB>nghĩa` (cũng nhận ` - ` `：` `｜` và ranh giới chữ viết; cột cụm = cột đầu tiên có tiếng Nhật nên `nghĩa<TAB>cụm` vẫn chạy; cột toàn kana → cách đọc, vd. `漢字<TAB>かんじ<TAB>kanji`; `auto` mà `list` không ra mục nào → rơi về `prose`) → `term` = cụm nguyên dạng, reading ghép Sudachi, furigana từng chữ, `pos = 句` (một từ thì POS thật + Hán-Việt), cấp = cấp khó nhất trong các từ nội dung (`levelSources[0] = phrase:<từ>`, confidence × 0.8); nghĩa EN in sẵn → `meaningEn`, nghĩa VI in sẵn (có dấu) → `meaningVi` (ENRICH bỏ qua); gloss Trung/Hàn bỏ; dòng chú thích `＊ ※` bỏ; không tách từ bên trong, không ngữ pháp. `stats.layout` cho frontend. **`prose`** (văn xuôi): tách câu → SudachiPy mode C (ứng viên) + mode A (thành phần từ ghép, furigana) → lọc POS → gộp theo lemma + tần suất → căn furigana từng chữ → Hán-Việt (Unihan `kVietnamese`) → nghĩa EN (JMdict) → cấp JLPT (5 danh sách N5–N1, mơ hồ chọn cấp dễ nhất + `levelConfidence` + `levelSources`; không có → wordfreq, confidence 0.4; vẫn không → `null`) → mẫu ngữ pháp (`grammar/patterns.yaml`, matcher trên chuỗi token) → áp `levelFilter` / `treatUnknownAs` / `minFrequency` → tối đa 600 từ + 100 mẫu (`splitChapters` và tách được ≥ 2 chương: 900 từ chia theo chương, xem `LEARNING_PATH.md` §3). **Mâu thuẫn tài liệu ↔ tham chiếu (F2)**: mọi item có `conflicts[{field: reading \| furigana \| meaning \| level \| grammar, document, reference, source: jlpt_list \| jmdict \| unihan \| sudachi \| grammar \| admin:<sourceId>, confidence, note_vi}]` và `stats.conflicts` / `stats.conflictsByField`; mọi item (vocab lẫn grammar, cả hai bố cục, **kể cả khi `warnConflicts` tắt**) còn có khai báo của tài liệu `docReading` (cột kana / ruby / kana ghi liền sau cụm — không phải cách đọc Sudachi), `docMeaningEn` (nghĩa in sẵn, chỉ khi là tiếng Anh) và `docLevel` (tag cấp trên dòng của thẻ; `docLevel` tuỳ chọn là cấp chung nên **không** chép vào item), `null` khi tài liệu không ghi — backend lưu (`doc_reading` / `doc_meaning_en`, mục nguồn tri thức) rồi gửi nguyên item lại `/extract/conflicts` (cùng tên khoá); chỉ so cái **tài liệu khai báo** (cột kana / ruby / kana ghi liền sau cụm, nghĩa EN in sẵn, tag `(N4)` trên dòng; văn xuôi chỉ ruby DOCX / ngoặc — cách đọc Sudachi và gloss từ điển không bao giờ bị đổ cho tài liệu; cụm đầu dòng bị cắt mất chữ số `4時 → 時` không khai báo gì); "không tìm thấy tham chiếu" không phải mâu thuẫn; số đếm + lượng từ (`4時`, `一分`) và tên riêng ngoài JLPT không so cách đọc. Tuỳ chọn: `warnConflicts` (mặc định true), `conflictMinConfidence` (0.6 — `meaning` / `grammar` / `furigana` ở 0.5 chỉ hiện khi hạ ngưỡng), `references[{term, reading?, meaning?, level?, sourceId?}]` (mục quản trị ghi đè từ điển: khớp → im, trái → 0.95), `docLevel` (cấp chung của tài liệu: chỉ từ / mẫu **khó hơn ≥ 2 cấp** mới đáng ngờ; tag trên dòng là khai báo riêng, lệch chiều nào cũng báo). Cách đọc: `jlpt_list` 0.9 (0.75 khi thiếu `jmdict.sqlite`) / `jmdict` 0.8 / `unihan` 0.6; cấp 0.6. |
| `POST /api/extract/conflicts` (`{items[{ref, term, kind?, reading?, meaningEn?, meaningVi?, level?, readingSegments?, rubies?, docReading?, docMeaningEn?, docLevel?, docLevelScope?: item \| document}], references?, minConfidence?}`) | Kiểm tra lại mâu thuẫn cho thẻ cũ (vd. khi quản trị thêm mục tham chiếu), cùng luật với `/analyze`: `{items[{ref, conflicts[]}], stats{items, conflicts, conflictsByField}}`. `docReading` / `docMeaningEn` ba trạng thái: **không gửi** → `reading` / `meaningEn` của thẻ được coi là của tài liệu; `null` → tài liệu không khai báo → không so; giá trị → so giá trị đó (backend nên gửi lại đúng cái `/analyze` trả: item đã lưu gửi nguyên, khoá thừa bị bỏ qua, cho cùng cảnh báo với cùng `references` / ngưỡng; muốn kiểm theo cấp chung thì tự gửi `docLevel` + `docLevelScope: document`). ≤ 1 000 mục (hơn → 400); `docLevelScope` lạ → 422. |
| `POST /api/extract/enrich` (`{targetLang, items[{ref,…}]}`) | Gemini dịch batch; `meaningEn` có sẵn (nghĩa in trong tài liệu) được dịch sát, không thay bằng nghĩa từ điển; lọc kết quả rỗng / quá dài / chứa chữ Nhật / đổi từ (generate-then-filter). Không có key → `enriched=false`, job vẫn DONE với nghĩa EN. Mọi lượt gọi Gemini (Vision lẫn dịch) gặp 429/503: thử lại sau 2 / 4 / 8 s rồi một lần ở `GEMINI_FALLBACK_MODEL` (nếu đặt), tổng ≤ 150 s; model chính hết quota → **2 phút sau đi thẳng model dự phòng**; cả hai hỏng → **tạm ngưng gọi Gemini 2 phút** (`quota` ngay, OCR dùng Tesseract); vẫn lỗi → `reason = quota` → backend ghi `stats.enrichReason`, frontend hiện nút "Dịch lại nghĩa" (`POST /api/extractions/{id}/enrich`). |
| `POST /api/extract/distractors` (`{items[{ref, term, reading?, meaning?, level?}], kinds?, minConfidence?, k?}`) | Phương án gây nhiễu có căn cứ (UC-20, C2/C3) cho một lô thẻ (≤ 1 000 mục, hơn → 400). Trả `{items[{ref, kanjiLookalike[], homophones[]}], stats{withLookalike, withHomophone}}`; mỗi ứng viên `{term, reading, meaning, level, confidence}`, chỉ giữ `confidence ≥ minConfidence` (mặc định 0.6), tối đa `k` (mặc định 3, 1..10). `kinds` ⊆ `kanji_lookalike`, `homophone` (mặc định cả hai; kind lạ → 400). **Kanji giống hình** (`kanji_similar.py`): điểm = 0.7 × Jaccard thành phần KRADFILE + 0.3 × (cùng bộ thủ + lệch nét Unihan), thay từng chữ trong từ và **chỉ giữ chuỗi là từ thật** (danh sách JLPT → JMdict) khác nghĩa; `confidence = 0.5 × độ giống + 0.5 × (1 JLPT / 0.6 JMdict phổ biến / 0.4 khác)`; thiếu `kradfile.csv` → chỉ cùng bộ thủ lệch ≤ 2 nét (điểm ≤ 0.3, confidence ≈ 0.6–0.65); từ toàn kana không có. **Đồng âm** (`distractors.py`): danh sách JLPT (0.9) → JMdict phổ biến (0.75) → khác (0.55), loại chính từ đó và dạng thêm / bớt okurigana của nó (待 ↔ 待つ), từ toàn kana, từ cùng nghĩa (biến thể chữ viết) và ứng viên trùng nghĩa nhau. `meaning` gửi kèm (cột nghĩa của thẻ, thường tiếng Việt) chỉ **bổ sung** gloss EN từ điển của từ khi so nghĩa, không thay thế (so nghĩa VI với gloss EN thì bộ lọc tắt im lặng). Thiếu dữ liệu → danh sách rỗng, không lỗi (không bịa). **Sau khi dựng `kradfile.csv` phải khởi động lại ai-service**: `kanjidata` cache cả bảng rỗng và `kanji_similar` cache xếp hạng, nên health báo `kradfile=true` ngay (chỉ stat file) nhưng giống hình vẫn chạy fallback bộ thủ tới khi restart. |
| `GET /api/extract/health` | sudachi / jmdict / jlpt / unihan / grammar / tesseract / gemini sẵn sàng chưa; thêm `radicals` / `kradfile` / `kanjivg` / `pitch` (dữ liệu chữ Hán LP-17) — `false` cho tới khi chạy `build_dicts.py --only unihan_rs` / `kradfile` / `kanjivg` / `pitch` (như `jmdict`); chỉ kiểm tra file có mặt, không nạp dữ liệu; `distractors` = có JMdict **hoặc** danh sách JLPT (sinh được ít nhất đồng âm); cờ tính năng LP-17: `kanjiStrokes` (= `kanjivg`, luyện viết), `hanVietGraph` / `kanjiCards` (bảng Unihan đã commit → `true`), `conjugation` (thuần quy tắc, luôn `true`); `conflicts` (F2: có danh sách JLPT hoặc JMdict → `true`); `radicalCards` (C4: bảng `radicals_214.csv` đã commit → `true`; khác `radicals` = `unihan_rs.csv`); `mining` (C6: chỉ cần Sudachi → `true`) |
| `GET /api/kanji/{ch}/strokes` | Nét mẫu KanjiVG của đúng một chữ Hán để vẽ hướng dẫn / animation: `{kanji, strokeCount, strokes: [[[x, y] × 32] mỗi nét]}` (hộp 0..1 cả chữ, theo thứ tự viết); 404 khi không phải một chữ Hán hoặc chưa có `kanji_strokes.json` |
| `POST /api/kanji/score` (`{kanji, strokes: [[{x, y, t?}, …] …]}` theo thứ tự vẽ, toạ độ canvas bất kỳ) | Chấm nét viết bằng DTW (`stroke_score.py`): `{kanji, totalScore, isCorrectOrder, feedback (vi), perStroke[{index, score, wrongDirection, expectedIndex\|null}], missing[], extra[], strokeCount}`. Khung đưa bản vẽ về hệ mẫu chọn trong nhiều giả thuyết hộp bao (thiếu / thừa nét trên biên không kéo giãn nét khác), điểm hình tách khỏi điểm vị trí (lệch ≤ 0.1 chữ chỉ trừ nhẹ), hai nét gần giống nhau lệch tay không bị coi là sai thứ tự; tổng có sàn 20 khi ≥ nửa số nét vẽ đúng. 413 khi > 40 nét / > 500 điểm một nét; 422 khi toạ độ NaN / Infinity hoặc nét rỗng; 404 khi chưa có nét mẫu. `POST /api/kanji/score-stroke` (body cũ `user_strokes`) chỉ còn là alias deprecated |
| `GET /api/kanji-info/han-viet-graph?reading=&level?=&limit=30` | Đồ thị âm Hán-Việt → chữ → từ (F1): `{query, nodes[{id: "r:NHẬT" \| "k:日" \| "w:日本", type, label, …}], edges[{from, to, type: has_kanji \| in_word}]}`; gõ không dấu (`nhan`) → mọi âm gấp dấu (NHAN, NHÂN, NHẬN…), gõ có dấu → đúng âm đó; `level` chỉ giữ từ ở cấp đó hoặc dễ hơn; âm lạ → `nodes` rỗng (200); `level` lạ → 400 |
| `GET /api/kanji-info/han-viet-suggest?q=&limit=10` | Autocomplete âm Hán-Việt: `{query, items[{reading, count, kanji[≤ 5]}]}`, âm nhiều từ JLPT lên trước, khớp đúng dấu trước rồi gấp dấu |
| `POST /api/kanji-info/kanji-cards` (`{kanji: [str] ≤ 200, userLevel?}`) | Thẻ chữ Hán (C5): `{items[{kanji, hanViet, radical{no, strokes}, on[{reading, examples[≤ 3]}], kun[{reading, okurigana, examples}], meaningEn, strokeCount}]}`; ví dụ là từ JLPT có chữ, gán theo cách đọc qua căn furigana (okurigana phải khớp kana theo sau, cách đọc dài nhất thắng); mục không phải một chữ Hán bị bỏ qua; > 200 → 422, `userLevel` lạ → 400 |
| `POST /api/grammar/conjugation-quiz` (`{verbs[{term, reading?}], forms?, perVerb: 1..5, exampleSentences?, seed}`) | Quiz chia động từ (C7): `{items[{term, lemma, reading, group, form, formLabelVi, prompt, correct, options[4], example}], skipped[{term, reason}]}`; nhóm từ Sudachi (heuristic đuôi kana khi không có), 12 dạng (て / た / ない / ます / khả năng / bị động / sai khiến / sai khiến bị động / ý chí / mệnh lệnh / お〜になる / お〜する), đáp án sai = lỗi người học + quy tắc nhóm khác (ある → あらない đứng đầu), xác định theo `seed`; > 200 động từ hoặc `forms` lạ → 400. `GET /api/grammar/health` → `{sudachi, conjugation}` |
| `POST /api/radicals/cards` (`{kanji: [str] ≤ 200, levels?: [N5..N1], withMnemonic?: true}`) | Thẻ bộ thủ + mẹo nhớ (C4): `{items[{kanji, hanViet, meaningEn, strokeCount, radical{no, char, nameVi, meaningVi, hanViet} \| null, mnemonicVi, mnemonicSource: gemini \| template \| null, examples[{term, reading, meaning, level}] ≤ 3}], groups[{radical, kanji[]}], reason: null \| no_key \| quota \| error}`. Mẹo nhớ Gemini (một lượt cho cả lô, batch 40, lọc `gemini.mnemonic_ok`: ≤ 300 ký tự, phải nhắc âm Hán-Việt hoặc tên bộ, không chữ Nhật nào ngoài chữ đó và bộ của nó kể cả dạng viết trong chữ 氵 艹 辶…) — thiếu key / hết quota / bị lọc → `radicals.template_mnemonic` (xác định, không bao giờ rỗng, ≤ 200 ký tự), **mọi mẹo đều qua admin duyệt ở backend trước khi công khai**. `meaningEn` bỏ nghĩa phụ tố / lượng từ (人 "-ian…", 回 "counter for…") → cột JLPT → mục JLPT khác của đúng chữ đó (人 → "man, person") → `null`; mẹo mẫu ghi gloss là `nghĩa tiếng Anh "…"` (nghĩa tiếng Việt là nghĩa bộ thủ). `levels` chỉ xếp ví dụ đúng cấp lên trước; mục không phải một chữ Hán bị bỏ qua; > 200 → 422, `levels` lạ → 400. `withMnemonic=false` → không gọi Gemini. |
| `GET /api/radicals` · `GET /api/radicals/{no}/kanji?levels=N5,N4` | Bảng 214 bộ thủ Khang Hi `{items[{no, char (khối Kangxi ⽔), unified (chữ CJK 水 — dạng JIS 戸 青 麦 黄 黒 cho 5 bộ), strokes, nameVi, meaningVi, hanViet}]}` (rỗng khi thiếu `radicals_214.csv`, health `radicalCards=false`); chữ JLPT thuộc một bộ `{radical, levels, items[{kanji, level (cấp dễ nhất của từ chứa chữ), strokeCount}]}` cấp dễ → khó rồi ít nét trước; `no` ngoài 1..214 → 422, bộ không có trong bảng → 404, `levels` lạ → 400 |
| `POST /api/mining/i-plus-one` (`{text ≤ 50 000 ký tự, knownLemmas?: [str] ≤ 20 000, userLevel?: N5..N1, assumeLevelKnown?: true, maxUnknown?: 1..3, limit?: 1..1000}`) | Khai thác câu i+1 (C6): câu trong tài liệu có đúng `maxUnknown` từ nội dung chưa biết → `{items[{sentence, target{lemma, surface, reading, level, meaningEn, readingSegments}, unknownCount, knownCount, length, score}], stats{sentences, kept}}` (`kept` đếm trước `limit`). Đã biết = trong `knownLemmas` (kể cả dạng giáo trình 勉強する / 静かな → lemma 勉強 / 静か) hoặc, khi `assumeLevelKnown`, cấp ≤ `userLevel`; từ chưa biết đếm theo lemma (câu lặp từ mới hai lần vẫn là i+1); chuỗi OOV (rác OCR) không bao giờ làm từ đích; điểm = 0.5 × ngắn + 0.25 × có trong JLPT + 0.25 × tần suất wordfreq. Văn bản > 50 000 ký tự → 413, `userLevel` lạ → 400. `GET /api/mining/health` → `{sudachi, mining}` |
| `POST /api/mining/for-terms` (`{text, terms: [str] ≤ 500, knownLemmas?, userLevel?, assumeLevelKnown?}`) | Với từng từ của trang trích xuất, câu tốt nhất trong tài liệu chứa nó mà mọi từ nội dung **khác** đều đã biết (cấp của chính từ đó không xét) → `{items[{term, sentence \| null, target \| null}]}` theo đúng thứ tự `terms`. Khớp qua lemma / surface (見る ↔ 見ました) hoặc chuỗi con **đúng ranh giới token** (本 không nằm trong 日本, 学生 không nằm trong 留学生; cụm 勉強する vẫn khớp); chỉ mục lemma → câu dựng một lần nên 500 từ × 50 000 ký tự ≈ 1–1,5 s (phần lớn là tách từ Sudachi, như `/i-plus-one`) |
| `GET /api/audio/pitch-reference?word=&reading?=` | Mẫu trọng âm Tokyo (E4): `{word, reading, accentType, moras[{mora, level: H \| L}]}` từ kanjium (`pitch_accent.csv`); cách đọc làm sạch như `moraSplit` bên frontend (NFKC, bỏ dấu câu / khoảng trắng) rồi mới đòi toàn kana; 404 khi chưa có dữ liệu, 400 khi từ có kanji mà không kèm cách đọc kana |
| `POST /api/audio/pitch-score` (`{word, reading?, accentType?, contour: [{t, f0\|null}] ≤ 2 000}`) | Chấm đường F0 trình duyệt đã ước lượng (không nhận file âm thanh): `{…, pct, userHL[], refHL[], wrongMora[], voicedRatio, feedback}` bằng đúng thuật toán `frontend/src/lib/pitch.ts` (quantizeHL / pitchScore); `accentType` gửi kèm thay cho tra cứu kanjium; NaN f0 = khung không có thanh |

Dữ liệu: `ai-service/app/extract/data/` — JLPT CSV (commit), `unihan_vietnamese.csv` (commit), `jmdict.sqlite` (**không
commit**, tạo bằng `python scripts/build_dicts.py`). Nguồn và giấy phép trong `data/README.md`.

**Furigana trong PDF / ảnh (B3)** — `blocks[].rubies = [{base, reading}]` (cùng khoá với DOCX, pipeline dùng làm cách đọc
tài liệu khai báo):

- **PDF có chữ** (`pdf_reader.strip_furigana`): trang có cả kanji lẫn kana mới duyệt từng ký tự PDFium (cỡ chữ thực = cỡ
  `Tf` × hệ số ma trận, hộp "loose"). Cụm kana < 0.7 × trung vị cỡ chữ **không phải kana** của trang và < 0.7 × chữ gốc,
  nằm sát trên (ngang) / sát phải (dọc) một cụm kanji liền (chồng ≥ 50 % theo trục dòng) → bỏ khỏi văn bản, ghi ruby; văn
  bản trang đó dựng lại từ luồng ký tự PDFium (cùng dòng thì nối liền, hai chữ cách > 0.5 em giữ một dấu cách như
  `extract_text()`, khác dòng thì xuống dòng). Trang không có furigana / API ký tự lỗi → `extract_text()` y như trước.
- Không phải furigana: cụm kana mà **kanji phía đối diện** (trên ruby ngang / phải ruby dọc) gần hơn hẳn gốc (khe < 0.5 ×
  khe tới gốc) — bảng từ vựng in cách đọc **dưới** từ, trước đây bị gắn nhầm làm ruby cho từ hàng sau (chỉ so "gần hơn"
  thì Word tiếng Nhật mặc định — 10.5pt, lưới 18pt, ruby cách gốc và dòng trên đều ~1.1pt — mất furigana). Cụm **một**
  ký tự chỉ thử theo hướng chữ của trang (bước tiến của các cặp ký tự thân bài liền nhau): trên trang ngang, dấu chú thích
  ア nâng lên / ノ nhỏ sau 第一課 không còn bị đọc là ruby dọc.
- Quyết định "PDF scan" (< 30 ký tự / trang → OCR) đếm trên text layer **trước** khi bỏ furigana: tờ từ vựng ngắn dày ruby
  (12 từ hai chữ + furigana: 72 ký tự, bỏ ruby còn 24) vẫn là PDF có chữ, không bị đem OCR / 503 khi không có OCR.
- **Ảnh (Tesseract)**: từ toàn kana thấp < 0.6 × chiều cao trung vị các từ có kanji của dòng, nằm trên (ngang) / phải (dọc)
  từ kanji → bỏ khỏi dòng, thành ruby hint (gốc có okurigana: `{行き, いき}`; ruby chỉ phủ một phần từ → bỏ, không hint).

**Furigana theo ngữ cảnh (B5)** — item của `/api/extract/analyze` (vocab lẫn grammar) **luôn** có thêm:

- `readingNote`: `null`, hoặc `"khử nhập nhằng theo ngữ cảnh: <cue>"` khi cách đọc bị đổi bởi bảng từ đồng tự dị âm
  (`data/heteronyms.yaml`, ~29 từ: 辛い からい / つらい, 開く あく / ひらく, 一日 いちにち / ついたち…). Khi đổi:
  `levelConfidence` − 0.1 (sàn 0), `levelSources` thêm `heteronym:<cue>` ở **cuối**, cấp JLPT tra theo cách đọc mới
  (辛い からい N5 ≠ つらい N3). Chỉ đổi khi một cách đọc có **nhiều cue khớp nhất duy nhất** trong cửa sổ ±30 ký tự (chuỗi
  con); không cue / hoà → giữ Sudachi; cách đọc tài liệu khai báo (ruby / cột kana) không bao giờ bị đổi. Cue chỉ dùng cụm
  có trợ từ / cấu trúc (人気のな → ひとけ, 大事になってしま → おおごと, あの方が → かた), không dùng danh từ chủ đề đi được
  với cả hai cách đọc (夜 / 公園 cho 人気, 時代 cho 今日 — từng lật nhầm câu đúng của Sudachi).
- `exampleSegments`: `[{text, reading | null}]` furigana cho câu ví dụ theo token Sudachi (run kanji mang cách đọc trong câu,
  okurigana / kana / dấu câu là chữ thường — kể cả っ viết ra: 待って → 待/ま + って, 引っ越し → 引/ひ っ 越/こ し);
  `"".join(text) == example`; `null` khi không có ví dụ hoặc `includeFurigana = false` (khi đó `readingSegments` cũng
  `null`, nhưng cách đọc vẫn được khử nhập nhằng). Thẻ từ đồng tự dị âm gộp mọi lần xuất hiện nên câu ví dụ là câu
  **đầu tiên đọc đúng cách đọc của thẻ** (cửa sổ của chính câu chọn cách đọc đó; cách đọc không đổi thì câu không có cue
  cũng hợp) → thẻ 開く あく không còn lấy ví dụ 窓を開いて (開/ひら).
- Cách đọc dạng từ điển của từ đã chia suy từ cách đọc trong câu (`furigana.swap_okurigana`: 開い ひらい → 開く ひらく).
- backend hiện chưa lưu `readingNote` / `exampleSegments` (khoá lạ bị bỏ qua); `levelConfidence` / `levelSources` đã lưu.

**Cấp JLPT toàn tài liệu (B6)** — `stats` của `/api/extract/analyze` có thêm, đếm **mọi ứng viên** trước khi áp
`levelFilter` / `treatUnknownAs` / `minFrequency` / cap (nên không đổi theo trình độ người dùng; `stats.byLevel` cũ vẫn
đếm item giữ lại như trước):

- `byLevelAll`: `{N5..N1, unknown}` = từ vựng + ngữ pháp, **cùng hình với `byLevel`** (`Record<string, number>`);
  `byLevelAllVocab` / `byLevelAllGrammar` cùng hình, tách theo loại (không lồng vào `byLevelAll` để client cộng dồn được).
  Một **term** đếm một lần: cùng term ở nhiều chương, hay ở hai POS (大変 形状詞 / 副詞 là hai item) là một ứng viên, nên
  `byLevelAll` có thể nhỏ hơn `byLevel`; ngữ pháp đếm cả khi `includeGrammar` tắt (nút hiển thị không đổi cấp tài liệu).
- `levelPct`: `{N5..N1}` % trên các ứng viên **có cấp** (từ vựng + ngữ pháp), làm tròn 0.1 → tổng ≈ 100 (±0.2); không có
  ứng viên có cấp → toàn 0.
- `overallLevel`: cấp L thấp nhất (N5 → N1) sao cho N5..L gom ≥ 80 % **từ vựng có cấp** ("80 % từ vựng ở cấp ≤ L");
  dưới 10 từ có cấp → `null`. `overallRule = "cumulative80"` ghi tên quy tắc để client không phải đoán.

## 4. Cài đặt

- Backend: `AI_SERVICE_URL` (mặc định `http://localhost:8000`), `AI_SERVICE_KEY` (tuỳ chọn), `AI_SERVICE_READ_TIMEOUT` (`PT3M`).
- ai-service: `pip install -r requirements.txt`, `python scripts/build_dicts.py` (tải JLPT / Unihan / JMdict, cần mạng một lần),
  `GEMINI_API_KEY` (tuỳ chọn, model `GEMINI_MODEL`, mặc định `gemini-3.8-flash`; `GEMINI_FALLBACK_MODEL` tuỳ chọn, vd.
  `gemini-3.8-flash-lite`, dùng khi model chính 429/503 sau 3 lần thử lại), Tesseract 5 + traineddata `jpn`, `jpn_vert` (Windows: đặt `TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe`).
  Không có Tesseract nhưng có `GEMINI_API_KEY`: ảnh / PDF scan chép thẳng bằng Gemini Vision. Thiếu cả hai: job FAILED
  với thông điệp "OCR engine unavailable: chưa cài Tesseract… và không có GEMINI_API_KEY"; các nguồn khác vẫn chạy.
- Dữ liệu `app/extract/data/` nạp lười **một lần** và cache cả khi file thiếu (`kanjidata` giữ bảng rỗng, `kanji_similar`
  giữ xếp hạng, `jmdict.lookup` giữ kết quả `None`): dựng / cập nhật file bằng `build_dicts.py` (vd. `--only kradfile`)
  xong phải **khởi động lại ai-service**; `/health` chỉ stat file nên báo `true` ngay dù dữ liệu chưa được nạp.

## 5. Trường hợp biên

| Trường hợp | Xử lý |
|---|---|
| Chữ dọc | chạy `jpn` và `jpn_vert`, chọn theo confidence × độ dài dòng; sắp cột phải → trái; Gemini fallback |
| Ảnh nghiêng / xoay 90–180° không EXIF | deskew projection profile; OSD khi cả hai lượt đọc kém (CER ~1.0 → ~0.03–0.05) |
| Ảnh bóng đổ, nền trong suốt | khử nền bằng chia cho nền ước lượng; flatten alpha lên trắng |
| Trang ngang 2 cột | tìm rãnh trắng dọc rộng ≥ 1.5 dòng ở giữa trang → OCR từng nửa, nối trái → phải (Tesseract tự nó gộp 2 cột thành 1 dòng ở mọi psm) |
| Furigana trong ảnh / DOCX / ngoặc / PDF | loại khối kana nhỏ theo bbox; `<w:ruby>` và `漢字（かな）` → cách đọc chuẩn; PDF có chữ: kana nhỏ sát trên / phải cụm kanji → `rubies` (B3); bảng in cách đọc dưới từ giữ nguyên |
| Từ đồng tự dị âm (辛い, 開く, 一日…) | cue ngữ cảnh trong `heteronyms.yaml` (B5) → `readingNote`, confidence − 0.1; không cue / hoà → cách đọc Sudachi |
| Từ ghép | Sudachi C vs A (B4): mode C trả về **một morpheme có trong SudachiDict** (`is_oov() == False`: 自動販売機, 銀行口座, 東京大学) → giữ nguyên kể cả khi không có `jmdict.sqlite` hay JMdict bản common không có mục; chỉ cụm OOV mới xét tách: có trong JLPT / JMdict → giữ, mọi thành phần có → tách, còn lại giữ. Từ ghép giữ nguyên mà JLPT / JMdict / wordfreq không có → cấp khó nhất của thành phần (`levelSources[0] = phrase:<từ>`, confidence × 0.8, như cụm trong bố cục danh sách: 銀行口座 → N2, 電気代 → N5) nên không rơi khi `treatUnknownAs = drop`; `meaningEn` vẫn `null` (ENRICH dịch từ) và trên OCR **không** `suspect` chỉ vì thiếu nghĩa từ điển — chỉ cụm OOV (覆公) mới vậy |
| Động từ chia | `term` = dictionary form, `surface` = dạng gặp |
| Đa đọc (行く / 行う) | tra `(lemma, reading)` trước |
| Cấp mơ hồ / chưa rõ | cấp dễ nhất + `levelConfidence`, `levelSources`; chưa rõ → `null`, tuỳ `treatUnknownAs` |
| ai-service chết / timeout | bước TEXT / ANALYZE: job FAILED + thông điệp; bước ENRICH (kể cả `Read timed out`): job vẫn DONE với nghĩa EN, `enrichReason = error`; "Chạy lại" dùng văn bản đã lưu |
| Gemini Vision suy thoái (lặp `·····` hàng chục nghìn ký tự, thấy trên trang mục lục scan 14/10) | gộp ký tự lặp ≥ 10 lần còn 3; bản Gemini dài > 3× Tesseract và > 3 000 ký tự → giữ Tesseract, `geminiError = implausible` |
| Backend restart | job dở dang → FAILED "Máy chủ đã khởi động lại…" |
| Không có Gemini key | OCR chỉ Tesseract (+ cảnh báo `lowConfidence`), nghĩa EN, job vẫn DONE |

## 5b. Hạn chế đã biết và việc chưa làm

- **Chưa đo trên ảnh chụp thật**: mọi số CER ở mục 6 là ảnh tổng hợp (`ocr_eval.py --real DIR` sẵn sàng khi có ảnh + đáp án).
- **Phụ thuộc Gemini** cho nghĩa VN và OCR dự phòng: hết quota (429/503) thì job vẫn DONE với nghĩa EN, bấm "Dịch lại nghĩa".
  Thử dịch offline (NLLB) đã làm rồi hoàn tác 12/10 — xem [Plan/README.md](Plan/README.md).
- **File gốc không lưu** trên server; "Phân tích lại" dùng văn bản đã trích (sửa được). Spec 13/10 đề xuất lưu file gốc —
  chưa duyệt, chưa làm.
- **Furigana PDF (B3)**: ruby trên heading có cỡ ≥ 0.7 × trung vị trang (ruby 9pt trên heading 18pt, thân bài 10.5pt) chưa
  nhận → ruby còn lẫn trong văn bản như trước; chữ dọc dùng font CID Identity-V chưa có test (chỉ dựng được PDF dọc đặt
  từng ký tự); trang ngang có cột dọc phụ: ruby một ký tự trong cột dọc chỉ được thử theo hướng chính của trang; cách đọc
  in sát dòng sau gần ngang bằng sát từ của nó (khe chênh < 2 lần) vẫn có thể bị đọc là ruby của dòng sau.
- **B5**: `一日中家にいた` — Sudachi tách 一 + 日中 (にっちゅう) + 家 (か) nên ra item 日中 にっちゅう và ruby sai; bảng đồng tự
  dị âm không có token 一日 để xét (test `xfail`, cần ghép cụm cố định trước khi tách từ). Cách đọc số trong câu ví dụ theo
  Sudachi (四月 → よん + がつ). Cue là heuristic chuỗi con: thẻ đã đổi luôn có `readingNote` + confidence thấp để xem lại.
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
