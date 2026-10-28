# Thiết kế: Dịch câu / đoạn Nhật ↔ Việt trong từ điển (tab Dịch)

28/10/2026, nhánh `tudien`. **Trạng thái: đã làm** (code + test ai-service / backend / frontend / smoke 28/10; **chưa kiểm tay trên
trình duyệt với khoá Gemini thật** — máy dev không có khoá, prompt mới được kiểm bằng Gemini giả). Grill-me tắt: người dùng chốt
nguyên tắc ở §2 ("dịch phải trôi chảy và đúng nghĩa"), phần còn lại Claude tự quyết. Quyết định: **D33** trong
[2026-10-19-quyet-dinh-da-chot.md](2026-10-19-quyet-dinh-da-chot.md). Gói nhỏ, không có kế hoạch riêng.

Spec từ điển 26/10 ([2026-10-26-tu-dien-design.md](2026-10-26-tu-dien-design.md) §1) từng ghi `[Dịch ngược Việt → Nhật bằng AI] → bỏ
qua`; tài liệu này đảo lại quyết định đó cho **cả hai chiều**.

## 1. Mục tiêu và phạm vi

- Người học dán một **câu hoặc đoạn ngắn (≤ 1 000 ký tự)** tiếng Nhật → bản dịch tiếng Việt tự nhiên; hoặc tiếng Việt → câu tiếng Nhật
  (thể lịch sự mặc định) kèm cách đọc hiragana và romaji.
- Dưới bản dịch là **phân tích câu Nhật theo cụm từ**: cách đọc (furigana theo run kanji), romaji, từ loại, bậc JLPT, **nghĩa theo đúng
  ngữ cảnh câu**; bấm cụm để tra nhanh / mở mục từ điển.
- Hết lượt, admin tắt, không có khoá Gemini hay AI lỗi: **vẫn trả phân tích câu** và nói rõ vì sao không có bản dịch.
- Ngoài phạm vi (D33): dịch offline (spike NLLB 12/10 dịch sát chữ, sai thành ngữ, giấy phép CC-BY-NC vướng gói Pro UC-40), dịch tài
  liệu dài, dịch ngay trong màn học, lịch sử dịch theo người dùng, dịch sang tiếng Anh.

## 2. Nguyên tắc: dịch cả câu, không bao giờ ghép từ

Ghép nghĩa từ điển của từng từ không thành bản dịch: tiếng Nhật bỏ chủ ngữ, trật tự SOV, trợ từ quyết định vai nghĩa, một từ nhiều nghĩa
tuỳ ngữ cảnh, kính ngữ và thành ngữ — câu ghép không trôi chảy và sai nghĩa. Vì vậy:

1. **Bản dịch luôn do Gemini dịch CẢ đoạn** (một lời gọi cho toàn bộ văn bản, kể cả 2–3 câu, để giữ mạch và chủ ngữ nhất quán).
   Prompt nêu rõ: dịch ý không dịch chữ, suy chủ ngữ bị bỏ, giữ sắc thái lịch sự, không thêm chú thích; câu mơ hồ trả thêm tối đa 2
   cách hiểu; một ghi chú ngữ pháp ngắn khi có ích.
2. **Phân tích từng cụm là lớp hỗ trợ học, tách bạch với bản dịch**: Sudachi tách từ, JMdict tra mục, JLPT xếp bậc, furigana / romaji
   tính tại chỗ (không tốn quota). Để lớp này **khớp bản dịch** thay vì nghĩa từ điển chung chung, cùng lời gọi Gemini xin **nghĩa theo
   ngữ cảnh** cho từng cụm đã tách (gửi chỉ số `i`, model trả `{i, meaning}`); không có AI thì rơi về nghĩa Việt của từ điển
   (`dict_meanings`), rồi gloss tiếng Anh.
3. **Hai mức hiển thị**: bản dịch tự nhiên ở trên; "dịch sát nghĩa theo cụm" (theo trật tự Nhật, cách bằng ` / `) thu gọn bên dưới để
   thấy câu Nhật được xây thế nào.
4. **Kiểm tra sau dịch**: bản Việt không còn chữ Nhật, bản Nhật phải có chữ Nhật, không trùng câu nguồn, trần độ dài; Việt → Nhật so
   cách đọc AI ghi với cách đọc Sudachi ghép từ các cụm (`readingAgrees`, lệch thì giao diện nhắc đối chiếu).
5. Khi không có bản dịch, giao diện **không bịa câu**: hiện phân tích + dòng trạng thái (OFF / LIMIT / AI_DOWN).

## 3. ai-service

### 3.1 `app/extract/translate_text.py` (mới, thuần, test không cần Gemini)

| Hàm | Việc |
|---|---|
| `detect_direction(text)` | có chữ Nhật → `ja-vi`, không thì `vi-ja` (văn bản trộn coi là Nhật) |
| `analyse(text)` | token Sudachi mode C **gom trợ động từ / て・で nối sau động từ – tính từ** thành một cụm (食べ + まし + た → 食べました, lemma 食べる); mỗi cụm `{i, surface, lemma, reading, romaji, rubies, key (w:<id> JMdict), jlpt, pos, posVi, particle, symbol, glossEn, meaning: None}`; dấu / số / Latin là `symbol` (không tra, không xin nghĩa); trần `MAX_TOKENS` 400 |
| `ai_words(tokens)` | danh sách cụm gửi Gemini xin nghĩa theo ngữ cảnh (bỏ `symbol`), tối đa `MAX_AI_WORDS` 150 |
| `clean_result(raw, direction, tokens)` | lọc đầu ra Gemini → `{translation, literal, alternatives[{text, reading, note}] ≤ 2, notes ≤ 300, reading}`; None khi bản dịch rỗng / sai ngôn ngữ / quá 3 000 ký tự; `literal` bỏ nếu còn chữ Nhật hay trùng bản dịch; gắn `words[{i, meaning}]` vào token (chỉ số lạ, nghĩa rỗng / còn chữ Nhật / quá 80 ký tự, cụm là dấu → bỏ) |
| `romaji_of(tokens)`, `reading_agrees(tokens, reading)` | romaji cả câu từ cách đọc Sudachi (cách khoảng trắng, dấu dính từ trước); so phần kana cách đọc AI với Sudachi → True / False / None |

### 3.2 `gemini.translate_text(text, direction, words, model)` → `(JSON thô, model đã trả lời)`

- Hai prompt (`_TEXT_PROMPT_JA_VI`, `_TEXT_PROMPT_VI_JA`) + hai JSON schema (`_TEXT_SCHEMA`), `response_mime_type` JSON, temperature 0,2.
  Chiều Việt → Nhật: thể です・ます trừ khi văn bản rõ là thân mật / tiêu đề, ưu tiên từ vựng N5–N3, kanji có okurigana, katakana cho
  từ mượn; trả `reading` hiragana cả câu và phương án khác (thể thường / lịch sự hơn) kèm nhãn Việt.
- **Hồ sơ gọi tương tác** `TEXT_PROFILE` (timeout 20 s, thử lại 1 lần sau 2 s) + hạn chót chung `TEXT_DEADLINE_S` = 26 s (backend chỉ đọc
  30 s): hết hạn → `GeminiError("budget", retryable)` → router trả `aiOverloaded`, **không** đặt `_cooldown_until` toàn cục (một câu
  dịch chậm không được tắt dịch nghĩa từ điển của mọi người 2 phút như hồ sơ mặc định). Chuỗi model / 404 / quota như mọi lời gọi khác.
- `_parse_json_object`: nhận code fence và danh sách một phần tử; không phải object → `GeminiError("error")`.

### 3.4 Dịch máy offline dự phòng (D34, bổ sung 28/10)

Người dùng yêu cầu: luôn có bản dịch, không bao giờ báo lỗi cho người học. Khi không có bản Gemini (không khoá, `withAi=false` vì
admin tắt / hết lượt, quota, quá tải, hết hạn chót, đầu ra không qua lọc), router gọi `offline_mt.translate` — vẫn dịch **cả câu**
(seq2seq), không ghép nghĩa từng từ.

| Mục | Chọn |
|---|---|
| Mô hình | `facebook/m2m100_418M`, giấy phép **MIT**, hai chiều ja ↔ vi. Chạy **CTranslate2 int8** (`models/mt/m2m100_418M-ct2`, ~470 MB, không commit) — lúc chạy chỉ cần `ctranslate2` + `sentencepiece`, không cần torch |
| Đã loại | `Helsinki-NLP/opus-mt-ja-vi` (Apache-2.0, chỉ Nhật → Việt): bịa nghĩa nhiều hơn khi đo ("日本語の勉強は難しいですが…" → "Vì vậy, tôi sẽ cho bạn thấy một số ví dụ."); NLLB (CC-BY-NC, D33); m2m100_1.2B (5 GB, chậm ~3 lần trên CPU) |
| Tiền xử lý | tách câu (giữ xuống dòng, cắt mềm câu > 300 ký tự), tên người Nhật (Sudachi 固有名詞・人名) → romaji (田中 → Tanaka; không đổi thì mô hình dịch thành "Tanja") |
| Tốc độ (máy dev 16 luồng) | nạp 2–3 s (nạp sẵn ở luồng nền lúc khởi động, `OFFLINE_MT_PRELOAD=0` để tắt); câu ngắn < 1 s; 1 000 ký tự Nhật → Việt ~9 s beam 4 (PyTorch fp32 cũ: 45 s) |
| Hạn chót | backend đọc 30 s → Gemini hạ còn 12 s / lượt, hạn chót 16 s; router cho bản offline tới mốc 27 s kể từ lúc nhận request; beam tự hạ 4 → 2 → 1 khi gấp, quá hạn thì thôi (vẫn trả phân tích câu) |
| Lọc | câu Việt còn chữ Nhật / câu Nhật không có chữ Nhật → bỏ; cụm lặp ≥ 4 lần → gọn; quá nửa số câu hỏng → không có bản dịch |
| Đánh dấu | `engine` "offline", `model` "offline:m2m100_418M-ct2"; `reason` vẫn ghi vì sao không có bản Gemini. Việt → Nhật: cách đọc ghép từ Sudachi (`reading_of`), `readingAgrees` = null |

Chất lượng đo 28/10 (16 câu thường gặp): đa số đúng ý ("Xin lỗi, nhà ga ở đâu?", "今週末は家族と一緒に京都に行きます。"), có lỗi từ
(傘 → "gương", 先生 → "bác sĩ", sushi → スーシー) — giao diện luôn ghi "dịch máy offline… có thể sát chữ hoặc chưa chính xác".
Kèm theo: romaji trợ từ は / へ đọc "wa" / "e"; 私 đọc わたし (Sudachi cho わたくし).

### 3.3 `POST /api/dict/translate-text` (`dict_router.py`, khoá nội bộ như mọi route `/dict/*`)

| Vào | `{text ≤ 1000 (422), direction: auto \| ja-vi \| vi-ja, geminiModel?, withAi: true}`; `text` toàn khoảng trắng → 400 |
|---|---|
| Ra (**luôn 200**) | `{direction, source, translation, literal, alternatives, notes, reading, romaji, readingAgrees, tokens[], model, engine: ai \| offline \| null, reason}` |
| `reason` | `null` có bản Gemini; `no_api_key` / `quota` / `aiOverloaded` / `error` (kể cả bản dịch không qua lọc) / `skipped` (`withAi=false`: backend hết lượt hay tắt) — khi đó `translation` là bản offline (§3.4) nếu dịch được |
| `tokens` | ja-vi: phân tích câu **nguồn** (luôn có, kể cả khi không dịch được); vi-ja: phân tích câu Nhật **AI trả** (rỗng khi không có bản dịch) |

Trả 200 kèm `reason` (khác `/dict/translate` trả 503) vì nửa còn lại — phân tích câu — vẫn có giá trị cho người học.

## 4. Backend

### 4.1 Migration `V39__dict_text_translations.sql` (chỉ thêm)

- `dict_text_translations(text_hash PK = sha256(hướng + '\n' + câu đã chuẩn hoá), direction, source_text, result (JSON ai-service đã
  lọc), model, hit_count, created_at, last_hit_at)` + index `last_hit_at`. **Không gắn người dùng.**
- `app_settings.dictionary_translate_hourly_limit` = 20 (CHECK khoá tạo lại như V21 / V32), tách khỏi `dictionary_ai_hourly_limit` để
  dịch câu không "ăn" lượt dịch nghĩa khi tra.

### 4.2 `DictionaryService.translateText(uid, text, direction)`

1. Chuẩn hoá: gộp khoảng trắng / dòng trống, `strip`; **không đổi chữ** (giữ dấu câu Nhật). Rỗng / quá 1 000 / hướng lạ → 400.
2. `auto` → có chữ Nhật (`DictionaryKeys.hasJapanese`) là `ja-vi`, không thì `vi-ja`.
3. Chống dồn `DictionaryRateLimiter.checkTranslateBurst` 10 / phút (tính cả lượt trúng bộ nhớ dịch) → 429.
4. Bộ nhớ dịch theo hash: trúng → `touch` (hit_count, last_hit_at), `state = OK`, `cached = true`, **không tốn lượt**.
5. Chưa có: trần 0 → `withAi=false`, `OFF`; `tryAcquireTranslate` hết → `withAi=false`, `LIMIT`; còn → gọi ai-service với `withAi=true`
   (gộp lời gọi trùng đang chạy qua `inflight`, chờ tối đa 35 s). ai-service không tới được → hoàn lượt, 503 "Dịch vụ dịch tạm thời
   không khả dụng". `reason` null → lưu cache (`result` = JSON đã lọc, `model`); `no_api_key` → hoàn lượt, `OFF`; còn lại → `AI_DOWN`
   (lượt vẫn tính như dịch lúc tra).
6. Áp `dictVi` (nghĩa Việt `dict_meanings` theo `key`) lên từng cụm **lúc đọc** — bản cache không giữ nghĩa cũ khi admin sửa.
7. Trả thêm `state`, `cached`, `aiLeft`, `aiLimit`; bỏ `reason`.

### 4.3 API người học `POST /api/dictionary/translate` (ROLE_USER, `DictionaryController`)

| Vào | `{text ≤ 1000, direction?: auto \| ja-vi \| vi-ja}` (`DictDtos.TranslateTextRequest`) |
|---|---|
| Ra | như §3.3 trừ `reason`, cộng `tokens[].dictVi`, `state: OK \| OFF \| LIMIT \| AI_DOWN`, `cached`, `aiLeft`, `aiLimit` |
| Lỗi | 400 rỗng / quá dài / hướng lạ; 401 chưa đăng nhập; 429 dịch quá nhanh; 503 ai-service không tới được |

### 4.4 Cấu hình, dọn dẹp

- `SettingsService.dictionaryTranslateHourlyLimit()` (0..1000, tuỳ chọn khi PUT như hai khoá từ điển V32); trang Admin › Cấu hình › Từ điển
  thêm ô "Lượt dịch câu AI / giờ".
- `HousekeepingJob` xoá dòng bộ nhớ dịch có `last_hit_at` quá 30 ngày (`KEEP_TEXT_TRANSLATIONS`, phần tử thứ 10 của mảng kết quả).

## 5. Frontend

- Tab **Dịch** trong `/dictionary` (`features/dictionary/components/TranslateTab.tsx`, icon `g_translate`), trạng thái trên URL
  `?tab=translate&t=…&dir=ja-vi|vi-ja` (tự nhận thì bỏ `dir`). Ô nhập nhiều dòng (đếm ký tự / 1 000), nhóm nút hướng (Tự nhận / Nhật →
  Việt / Việt → Nhật, hiện hướng đoán khi tự nhận), chỉ dịch khi bấm **Dịch** hoặc Ctrl + Enter (mỗi lượt tốn hạn mức).
- Kết quả: hướng + "từ bộ nhớ dịch" + lượt còn lại; dòng trạng thái (`translateStateNote`) khi không có bản dịch; thẻ bản dịch (chép,
  nghe khi là tiếng Nhật), cách đọc + romaji + nhắc khi `readingAgrees === false`, "Cách dịch khác" (kèm cách đọc / nhãn), "Ghi chú",
  `<details>` "Dịch sát nghĩa theo cụm"; **Phân tích câu**: câu Nhật nối liền với furigana (`<ruby>` theo run kanji), cụm có mục từ điển
  gạch chấm → `DictPopover` → mở ở tab Từ vựng; bảng từng cụm (cụm + dạng gốc + JLPT · cách đọc / romaji / từ loại · nghĩa theo
  `tokenMeaning`: AI → từ điển → gloss Anh (ghi "(nghĩa tiếng Anh)") → trợ từ hiện từ loại).
- Gợi ý sang tab Dịch: ô tìm tab Từ vựng nhận cả câu Nhật (`looksLikeSentence`: có dấu câu hoặc ≥ 10 ký tự) → "Dịch cả câu và phân tích
  từng cụm"; tab Câu không có câu ví dụ chứa cụm trông như câu → "Dịch cả câu này".
- Trang ghi nguồn `/about/data` và chân tab Dịch nói rõ câu được gửi tới Gemini và lưu bộ nhớ dịch 30 ngày không gắn tài khoản.
- Hàm thuần ở `dictUtils.ts` (`detectTranslateDirection`, `translateDirectionLabel`, `translateStateNote`, `looksLikeSentence`,
  `tokenMeaning`, `TRANSLATE_MAX_CHARS`) kiểm bằng `scripts/selfcheck/dictionary.ts`.

## 6. Bảo mật, riêng tư (xem [../../SECURITY.md](../../SECURITY.md) §3c)

- Câu người học nhập **được gửi sang Google Gemini** (như dịch nghĩa / ví dụ, OCR dự phòng, mẹo nhớ) — chỉ khi còn lượt và có khoá.
- Bộ nhớ dịch không gắn người dùng, không có API đọc lại, dọn sau 30 ngày; ai-service chỉ nhận khoá nội bộ; văn bản bị cắt trần ở cả hai
  tầng; đầu ra Gemini qua lọc trước khi lưu / hiện.

## 7. Kiểm thử

| Tầng | Test |
|---|---|
| ai-service | `tests/test_translate_text.py` (15 ca: hướng, gom trợ động từ / て / です sau danh từ không gom, dấu / Latin, trần token, romaji + so cách đọc, lọc đầu ra hai chiều, prompt / schema / hồ sơ 20 s, code fence, lỗi, hạn chót không cooldown, thử lại 503); `tests/test_dictionary.py` 2 ca router (`/dict/translate-text` không AI / `withAi=false` / vi-ja; có AI hai chiều, nghĩa theo ngữ cảnh, `readingAgrees`, romaji, `quota` / `budget` → `aiOverloaded` / bản dịch còn chữ Nhật → `error`) |
| backend | `DictionaryIT` 3 ca (dịch một lần rồi cache cho cả người khác + `dictVi` áp lúc đọc; OFF / trần 0 / AI_DOWN → LIMIT / tự nhận hướng; 400 / 401 / 503 hoàn lượt / 429 chống dồn); `AdminSettingsIT` (16 dòng seed, khoá tuỳ chọn 0..1000); `HousekeepingIT` (mảng 10 phần tử) |
| frontend | `npm run lint`, `npm run build`, selfcheck `dictionary.ts` (hướng, nhãn, ghi chú trạng thái, nhận câu, thứ tự nghĩa, khoá cấu hình) |
| smoke | `smoke-admin.mjs` mục "dịch câu": 200 có `state` / `tokens` (ai-service tắt → 503), 400 rỗng / hướng lạ / quá dài, khoá cấu hình trong `GET /admin/settings` |

Chưa kiểm: chất lượng bản dịch với Gemini thật (prompt hai chiều, nghĩa theo ngữ cảnh), hiển thị `<ruby>` trên trình duyệt thật.

## 8. Vận hành

- Cần `GEMINI_API_KEY` ở ai-service; model theo `GEMINI_MODEL` / Admin › Model AI chính như mọi lời gọi. Một lượt dịch ≈ 1 lời gọi,
  prompt ~0,5–2 nghìn token (câu + danh sách cụm), trả lời ~0,3–1 nghìn token; bộ nhớ dịch làm câu lặp (bài tập, câu mẫu) miễn phí.
- Admin chỉnh `dictionary_translate_hourly_limit` (0 = tắt, chỉ phân tích) ở Cấu hình › Từ điển; chống dồn đổi bằng
  `app.rate-limit.dict-translate.max / window` (mặc định 10 / PT1M).

### Bổ sung D34 (28/10): không bao giờ báo lỗi

- `DictionaryService.translateText` không ném vì dịch vụ phía sau: ai-service không tới được / quá giờ / trả rỗng → 200 với
  `state = UNAVAILABLE` (hoàn lượt); chống dồn 10 / phút → `state = BUSY` (câu đã có trong bộ nhớ dịch vẫn trả, câu mới không gọi
  ai-service) thay cho 429. Chỉ còn 400 khi văn bản rỗng / > 1 000 ký tự / hướng lạ — giao diện chặn trước.
- Chỉ bản Gemini (`reason` null, `engine` khác "offline") vào bộ nhớ dịch chung; cache cũ không có `engine` được gắn "ai" lúc đọc.
- Frontend: `translateStateNote(state, aiLeft, aiLimit, engine)` — bản offline nói rõ nguồn + lý do; BUSY / UNAVAILABLE / lỗi mạng
  là lời nhắn xám nhẹ nhàng với nút **Thử lại**, không có chữ "lỗi", không có chữ đỏ; bấm Dịch lại cùng câu vẫn gửi lại.

## 9. Hạn chế, việc sau

- Chất lượng phụ thuộc Gemini; câu mơ hồ / thành ngữ có thể sai — chân tab có nhắc. Bản dịch máy offline (D34) kém hơn rõ: sai từ,
  sát chữ; chỉ là dự phòng để người học luôn có bản dịch.
- Nghĩa theo ngữ cảnh chỉ cho 150 cụm đầu; đoạn dài hơn dùng nghĩa từ điển / gloss Anh cho phần sau.
- Chưa có lịch sử dịch theo người dùng (chủ ý: không lưu câu người học theo tài khoản); chưa thêm câu dịch vào bộ thẻ trực tiếp (đi qua
  popover → mục từ → "Thêm vào bộ thẻ").
