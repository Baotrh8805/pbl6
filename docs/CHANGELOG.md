# Nhật ký thay đổi

## 30/10/2026 (khuya): Thư viện cộng đồng — sửa thiếu sót sau rà soát "Cộng đồng & Khám phá"
Rà soát ba trang Thư viện / Từ điển / Sơ đồ chữ Hán; người dùng chọn làm nhóm A (Thư viện). Không có migration. Đề xuất để sau:
Từ điển (Sổ tay tạo bộ thẻ / xuất CSV, "Báo cáo của tôi", tìm theo nghĩa Việt / Anh), cộng đồng (trang tác giả, hữu ích / báo cáo từng
bình luận Thư viện, tìm theo nội dung thẻ), học sâu (hoạt hình thứ tự nét, từ của ngày, lọc JLPT khi tra từ).
- **Bỏ chữ cứng sai sự thật**: "+ Audio", "Tokyo Accent", "SRS Interval: 3 Ngày", nhãn "MIỄN PHÍ" trên mọi thẻ, "kèm audio & ví dụ";
  ô tìm không còn hứa tìm theo từ khoá Kanji trong thẻ (backend chỉ tìm tên / mô tả / tác giả).
- **Bộ lọc trên URL** (`?q=&level=&cat=&tab=&sort=&page=`, `libraryParams.ts`): Back quay lại bộ lọc trước, chia sẻ được link, quay lại
  qua sidebar khôi phục bộ lọc (`lib/searchMemory.ts`); "Đặt lại bộ lọc" đặt lại cả sắp xếp.
- **Không lưu trùng**: lưu lần hai → 409 `DECK_ALREADY_SAVED`; thẻ / banner / xem trước hiện "Đã lưu · Mở" (`savedDeckId`); lượt tải
  đếm theo người lưu (`count(DISTINCT owner)`), bản trùng cũ không đếm hai lần.
- **Phổ biến** cần TB ≥ 4,5 **và** ≥ 3 lượt đánh giá.
- Kiểm: LibraryDeckIT +2 (7 xanh) cùng 7 lớp IT liên quan; selfcheck `library.ts` +14; lint / tsc / build xanh. **Chưa bấm thử trên trình duyệt.**
- **Sửa lỗi kẹt trang (Từ điển, Thư viện)**: khôi phục trạng thái đã nhớ chạy lại sau mỗi lần đổi tab / bộ lọc vì effect phụ thuộc
  `setSearchParams` (react-router đổi danh tính mỗi khi URL đổi) → bấm "Từ vựng" / "Câu" bị kéo về `?tab=kanji&k=結`; tab Từ vựng (URL
  trống) còn bị coi là "đang chờ khôi phục" nên không vẽ. Gom vào hook `lib/useSearchMemory.ts`: chỉ khôi phục cho đúng mục lịch sử
  lúc vào trang (`location.key`), một lần.

## 30/10/2026 (tối): Sơ đồ chữ Hán — tra bằng từ nhiều chữ, kana, Hán-Việt nhiều âm ("Phân tích từ")
Spec [Plan/specs/2026-10-30-so-do-chu-han-tu-nhieu-chu-design.md](Plan/specs/2026-10-30-so-do-chu-han-tu-nhieu-chu-design.md), kế hoạch
[Plan/plans/2026-10-30-so-do-chu-han-tu-nhieu-chu.md](Plan/plans/2026-10-30-so-do-chu-han-tu-nhieu-chu.md). Không có migration, không thêm thư
viện. Trước đây gõ `学生` chỉ vẽ 学, `がくせい` và `học sinh` báo không tìm thấy.
- **ai-service** `kanji_diagram`: phân giải câu tìm theo cụm chữ Hán liền nhau đầu tiên (2–4 chữ là từ, ≥ 5 chỉ chọn chữ), toàn kana
  (từ JLPT rồi JMdict thông dụng, từ JMdict chỉ giữ khi mọi chữ thuộc bộ chữ JLPT để bỏ dạng cũ 學生 / 髮), Hán-Việt 2–4 âm có / không
  dấu; nhiều từ → `wordCandidates` (≤ 12). Chế độ mới `word`: tâm là từ, mỗi chữ cùng thành phần trực tiếp, không họ chỉ âm / từ ghép.
  `mode` trống = tự chọn, `k` = chữ chọn trong từ; payload thêm `chars`, `selectedChar`, `word`, `wordCandidates`.
- **backend**: chuyển `mode` trống / `k` xuống ai-service, `k` > 2 ký tự → 400, cache theo `q|mode|k`, ghép nghĩa Việt cho từ,
  các chữ của từ và ứng viên từ trong cùng một truy vấn `dict_meanings`.
- **frontend**: tab "Phân tích từ" (chỉ khi từ 2–4 chữ), thanh chọn chữ trên sơ đồ, khung chọn từ, panel từ (thẻ từ + mỗi chữ có
  công thức, bộ, "Xem cấu tạo"), bố cục `wordLayout`. URL `?q=学生`, `?q=学生&mode=structure&k=生`.
- **Kiểm**: pytest 36 (quét mọi từ JLPT 2–4 chữ ở chế độ word: không node trùng / cạnh treo / tự nối), NlpIT 8 + AiServiceClientNlpTest 4,
  selfcheck / lint / tsc / build xanh; ai-service thật: 学生, 日本語, がくせい, học sinh → Phân tích từ; かみ → 5 ứng viên;
  日本語能力試験 → Cấu tạo 日 + thanh chọn chữ; `?q=時&mode=word` → Cấu tạo. **Chưa bấm thử trên trình duyệt.**
- **Không mất câu tìm khi rời trang**: mục sidebar dẫn về `/graph` không kèm `?q=` nên quay lại là trang trống. Trang nhớ q / mode / k
  gần nhất trong sessionStorage của tab (`diagramMemory.ts`) và khôi phục bằng `replace` khi mở `/graph` trống; selfcheck +6.
- **Từ điển cũng vậy**: `/dictionary` nhớ tab + tham số của tab (q / e, s, t / dir, k / sub / r, reading / level) và khôi phục **một
  lần lúc vào trang** (xoá ô tìm thì URL trống là ý người dùng, không bị đè). Đọc / ghi dùng chung `lib/searchMemory.ts`; selfcheck +6.
- **Bố cục sơ đồ rộng và thoáng hơn** (ảnh người dùng 企業): bỏ đoạn giải thích đầu trang, khung sơ đồ cao tối đa 78vh (trước 70vh);
  Phân tích từ quạt thành phần ra ngoài trong ≤ 150°, cách nhau ≥ 84 (trước 60, quạt tới 300° nên lấn chữ bên cạnh), nới bán kính khi
  nhiều thành phần; vòng tròn nhỏ lại (tâm 36→30, thành phần 26→22, chữ 22→20); nhãn cạnh 11→8,5 px, nét mảnh hơn. selfcheck +3.
- **Từ 2 chữ không còn trải ngang**: hai chữ gần tâm hơn (vòng 0,15 thay 0,24), thành phần quạt chéo lên / xuống (120–220°, ép ngang
  0,7 / giãn dọc 1,15), bán kính nới tới khi không đè node đã đặt. Khung vừa sơ đồ rộng / cao: 企業 2,42 → 1,23; 学生 2,03 → 1,13;
  鬱学 1,82 → 1,02 (từ 3–4 chữ giữ nguyên, đã gần vuông). selfcheck +4.
- **Mũi tên ngắn còn ~60%** (yêu cầu người dùng): các vòng không còn theo tỉ lệ cạnh khung (0,24 / 0,4 / 0,3 / 0,43) mà theo độ dài
  mũi tên mong muốn + phần nằm trong hai node, chỉ nới khi đông node (không đè). Mũi tên trung bình: 時 Cấu tạo 288 → 179, Từ ghép
  100 → 65, 企業 65 → 37, 学生 64 → 36, 図書館員 72 → 46, 鬱学 115 → 73. Từ 2 chữ quạt 170–240° không ép trục (rộng / cao 1,27–1,33).
  Độ dài mũi tên đo bằng `visibleArrowLength` dùng chung với canvas; selfcheck +12. Node mở thêm (dấu +) giữ khoảng cách cũ.

## 30/10/2026: Sơ đồ chữ Hán thay trang `/graph` (Đợt 1–3, nhánh `Graph`)
Spec [Plan/specs/2026-10-30-so-do-chu-han-design.md](Plan/specs/2026-10-30-so-do-chu-han-design.md), kế hoạch
[Plan/plans/2026-10-30-so-do-chu-han.md](Plan/plans/2026-10-30-so-do-chu-han.md). Không có migration. Quyết định: thay giao diện người học
của đồ thị Neo4j bằng sơ đồ cấu tạo chữ Hán chạy từ dữ liệu tĩnh; backend / ai-service / Admin của Neo4j giữ nguyên; nghĩa Việt từng chữ
lấy từ `dict_meanings`, không gọi Gemini khi mở sơ đồ.
- **Dữ liệu**: `kanji_parts.csv` (commit, 6 315 chữ) dựng từ KanjiVG bằng `build_dicts.py --only kanji_parts` — con trực tiếp theo thứ tự
  viết, biến thể → chữ gốc, vị trí, bộ (`kvg:radical`), **phần chỉ âm** (`kvg:phon` chuẩn hoá về một chữ). KRADFILE không dùng được cho
  việc này vì phẳng (時 chỉ có 寸 土 日, không có 寺). Phủ 1 908 / 1 971 chữ JLPT, 1 065 chữ có chỉ âm; họ 寺 ra đủ 時 持 待 特 等 詩 侍.
- **ai-service**: `kanjidata.parts()` / `phon_family()` (cờ health `kanjiParts`); `kanji_diagram.py` + `GET /api/kanji-info/diagram?q=&mode=`:
  tra bằng chữ Hán hoặc âm Hán-Việt (nhiều chữ → `candidates`), chế độ `structure` (thành phần, bộ KanjiVG hoặc Unihan, họ chỉ âm trong
  JLPT ≤ 12 — cạnh `phon` khi trùng âm On, `family` khi chỉ cùng phần) và `compounds` (≤ 12 từ, JLPT trước, kèm `key` JMdict / JLPT),
  `detail` cho panel (On / Kun, bộ, công thức, "làm phần chỉ âm", từ ghép). Test 22 + 5 + 14 + 2.
- **Backend**: `GET /api/nlp/kanji-diagram` (USER) → `NlpService.kanjiDiagram`: kiểm q ≤ 32 / mode, ghép `meaningVi` cho mọi node chữ,
  từ, ứng viên và detail bằng **một** truy vấn `dict_meanings`, cache 10 phút theo q|mode. `NlpIT` + 1, `AiServiceClientNlpTest` + 1.
- **Frontend**: `/graph` viết lại — tab Cấu tạo / Từ ghép, ô tìm + chip, `?q=&mode=`; `KanjiDiagramCanvas` (SVG: tâm xanh dương, thành
  phần cam, bộ viền đỏ, họ chỉ âm vàng, từ ghép tím, mũi tên + nhãn cạnh, chú thích); `KanjiDiagramPanel` (avatar, Hán-Việt, nghĩa Việt
  hoặc Anh, JLPT, "Bắt đầu lại từ chữ này", "Tra chữ này", On / Kun, công thức, Từ có chữ, Làm phần chỉ âm, chọn chữ khi âm nhiều chữ);
  bố cục theo cung tất định `diagramLayout.ts` (selfcheck `diagram.ts`). **Gỡ** `KnowledgeGraphSvg`, `GraphNodePanel`, `GraphAskPanel`,
  `GraphRecommendations`, `GraphPathFinder`, `GraphBits`, `useGraphAsync`, `lib/graphLayout.ts`, `selfcheck/graph.ts`; `graphService` /
  `graph.types` chỉ còn phần Admin. Sidebar: "Sơ Đồ Chữ Hán".
- **Đợt 2 — tương tác canvas** (`useViewBox`): cuộn chuột phóng quanh con trỏ (wheel gắn native, không passive), kéo nền pan, pinch
  hai ngón, nút + − ⤢, phím + − 0 (kẹp 0,4×–3×); kéo node sắp lại; huy hiệu **+** / đúp chuột mở thêm liên kết (gọi lại API cho chữ
  đó, `mergeDiagram` khử trùng, `placeAround` đặt quanh node mẹ), "Mở thêm 1 tầng" (≤ 8 node), "Thu gọn"; nút "← Quay lại [chữ
  trước]"; Shift+Enter đổi tâm; `aria-live`. Trạng thái mở thêm / kéo gắn với khoá q|mode.
- **Đợt 3**: heuristic **"chỉ âm?"** cho chữ KanjiVG không đánh dấu `kvg:phon` (part là chữ Hán thật, không phải bộ / bộ thủ Khang Hi,
  trùng ≥ 1 trong 2 âm On chính; 117 chữ JLPT, nét đứt + dấu hỏi + ghi chú, `guess` / `phonGuess` trong payload); autocomplete âm
  Hán-Việt (datalist, `/nlp/han-viet-suggest`); thêm từ ghép vào bộ thẻ (tái dùng `AddWordToDeckModal`).
- **Hiệu năng** (đo in-process TestClient, máy dev 8 GB): lần đầu 1,5 s (nạp bảng), sau đó Cấu tạo 8–23 ms, Từ ghép ~10 ms, âm nhiều
  chữ (THANH) 85 ms; backend cache 10 phút. **Chưa kiểm tay trên trình duyệt** (xem báo cáo `Plan/reports/2026-10-30-so-do-chu-han.md`).

## 28/10/2026 (chiều): Dịch offline dự phòng + tab Dịch không bao giờ báo lỗi (D34)
Người dùng yêu cầu: luôn trả bản dịch, không bao giờ báo lỗi cho người học. Không có migration. Đảo phần "không dịch offline" của D33.
- **Gỡ "Báo bản dịch sai"** (V40, revert 1ac673d): người dùng chốt báo cáo chỉ dành cho tra từ điển.
- **ai-service**: `app/extract/offline_mt.py` — facebook/m2m100_418M (MIT) chạy CTranslate2 int8 (~470 MB, `models/mt/`, không commit),
  tách câu, tên người → romaji, lọc đầu ra, beam tự hạ theo hạn chót, không bao giờ ném; nạp sẵn ở luồng nền lúc khởi động
  (`OFFLINE_MT_PRELOAD`). `/api/dict/translate-text`: không có bản Gemini → bản offline (`engine` "offline", `reason` giữ nguyên);
  Gemini hạ hạn chót 26 → 16 s để kịp 30 s backend chờ. `scripts/fetch_offline_mt.py` (tải + chuyển), `requirements-ml.txt` thêm
  `ctranslate2`, `sentencepiece`. **Lớp dự phòng thứ hai**: bản PyTorch gốc (`models/mt/m2m100_418M`, giữ lại theo yêu cầu) chạy khi
  CTranslate2 thiếu / hỏng — nạp nền nếu không kịp, câu ngắn 2–3,5 s, 1 000 ký tự 16 s. Sửa kèm: romaji trợ từ は / へ là "wa" / "e"; 私 đọc わたし. Đo: câu ngắn < 1 s, 1 000 ký tự ~9 s;
  opus-mt-ja-vi bị loại vì bịa nghĩa. Test `test_offline_mt.py` (11 ca, 1 ca dùng mô hình thật nếu đã tải) + 1 ca router.
- **Backend**: `translateText` luôn 200 — ai-service sập / quá giờ → `state UNAVAILABLE` (hoàn lượt), dịch quá nhanh → `BUSY` (không gọi
  ai-service) thay 503 / 429; chỉ bản Gemini vào bộ nhớ dịch; trường `engine`. `DictionaryRateLimiter.tryTranslateBurst`. `DictionaryIT`
  cập nhật + 1 ca bản offline không cache.
- **Frontend**: nhãn "dịch máy offline" + ghi chú nguồn / lý do; BUSY / UNAVAILABLE / lỗi mạng là lời nhắn xám với nút Thử lại, không
  chữ đỏ; bấm Dịch lại cùng câu vẫn gửi lại; selfcheck thêm khẳng định "không báo lỗi".

## 28/10/2026: Dịch câu / đoạn Nhật ↔ Việt trong từ điển (tab Dịch, D33)
Spec [Plan/specs/2026-10-28-dich-cau-design.md](Plan/specs/2026-10-28-dich-cau-design.md). Một migration chỉ thêm: **V39** (bảng
`dict_text_translations` bộ nhớ dịch chung, khoá `dictionary_translate_hourly_limit` = 20). Đảo quyết định 26/10 "Dịch ngược Việt →
Nhật bằng AI → bỏ qua" thành làm cả hai chiều.
- **Nguyên tắc (yêu cầu của người dùng: bản dịch phải trôi chảy, đúng nghĩa)**: bản dịch luôn do Gemini dịch **cả đoạn** (ngữ cảnh,
  chủ ngữ bị bỏ, trật tự, kính ngữ, thành ngữ); phần phân tích từng cụm (Sudachi + JMdict + JLPT) chỉ là lớp hỗ trợ học, **không bao
  giờ ghép thành câu**; hết lượt / không khoá / AI lỗi → chỉ phân tích + nói rõ lý do. Nghĩa theo ngữ cảnh của từng cụm xin trong cùng
  lời gọi để phần phân tích khớp bản dịch; có "dịch sát nghĩa theo cụm" thu gọn; kiểm tra sau dịch (đúng ngôn ngữ, độ dài, cách đọc AI
  so với Sudachi).
- **ai-service**: `app/extract/translate_text.py` (tự nhận hướng, `analyse` gom trợ động từ / て sau động từ – tính từ thành một cụm
  với furigana / romaji / JLPT / khoá JMdict / gloss Anh, `clean_result` lọc đầu ra Gemini + gắn nghĩa theo ngữ cảnh, `romaji_of`,
  `reading_agrees`), `gemini.translate_text` (hai prompt + schema, hồ sơ tương tác 20 s + hạn chót 26 s không cooldown toàn cục),
  `POST /api/dict/translate-text` (luôn 200, `reason` khi thiếu bản dịch, `withAi=false` chỉ phân tích). Test `test_translate_text.py`
  (15 ca) + 2 ca router trong `test_dictionary.py`.
- **Backend**: `POST /api/dictionary/translate` (`DictionaryService.translateText`: chuẩn hoá khoảng trắng, hướng auto, chống dồn 10 /
  phút, bộ nhớ dịch theo sha256 không gắn người dùng, trần giờ riêng `tryAcquireTranslate`, gộp lời gọi trùng, `state` OK / OFF / LIMIT /
  AI_DOWN, `dictVi` áp lúc đọc), `DictionaryAiClient.translateText`, `DictionaryStore` (text translation CRUD + prune),
  `DictionaryRateLimiter` (translateAi / translateBurst), `SettingsService` + `SettingsResponse` khoá mới (tuỳ chọn khi PUT),
  `HousekeepingJob` xoá bộ nhớ dịch không dùng 30 ngày. Test: `DictionaryIT` +3, `AdminSettingsIT` (16 dòng seed, khoá 0..1000),
  `HousekeepingIT` (mảng 10).
- **Frontend**: tab **Dịch** (`TranslateTab.tsx`: ô nhiều dòng, hướng, Ctrl + Enter, thẻ bản dịch chép / nghe, cách đọc + romaji,
  cách dịch khác, ghi chú, sát nghĩa, phân tích câu với `<ruby>` + popover tra nhanh + bảng từng cụm), gợi ý "Dịch cả câu" ở tab Từ
  vựng (`looksLikeSentence`) và tab Câu, ô cấu hình "Lượt dịch câu AI / giờ" ở Admin › Cấu hình › Từ điển, đoạn riêng tư ở
  `/about/data`; hàm thuần `dictUtils.ts` + selfcheck `dictionary.ts`.
- **Smoke**: `smoke-admin.mjs` mục "dịch câu" (200 có `state` / `tokens` hoặc 503 khi ai-service tắt; 400 rỗng / hướng lạ / quá dài;
  khoá cấu hình).
- **Chưa làm / giới hạn**: chưa chạy với khoá Gemini thật (máy dev không có khoá) — chất lượng hai prompt cần kiểm tay; không dịch
  offline (D33); chưa có nút báo bản dịch sai, chưa có lịch sử dịch theo người dùng (chủ ý).

## 27/10/2026 (đêm): Kiểm duyệt bình luận bằng AI (ViHSD + ViHOS) và mô hình trí nhớ HLR trong ôn tập (D31, D32)
Spec [Plan/specs/2026-10-27-kiem-duyet-ai-va-hlr-design.md](Plan/specs/2026-10-27-kiem-duyet-ai-va-hlr-design.md), kế hoạch
[Plan/plans/2026-10-27-kiem-duyet-ai-va-hlr.md](Plan/plans/2026-10-27-kiem-duyet-ai-va-hlr.md). Một migration chỉ thêm cột / bảng:
**V38** (`mod_*` trên `dict_comments` / `deck_ratings` / `kanji_mnemonics`, `users.comment_locked_until`, bảng `dict_sensitive`,
`reviews.seen / correct / last_reviewed_at / recall_p / hlr_brake` lấp từ `review_logs`).

**Model tự huấn luyện (ai-service)** — file lớn ở `ai-service/models/` (không commit, `scripts/fetch_models.py`), xác minh 27/10:
- ViHSD 3 lớp (0 sạch / 1 xúc phạm / 2 thù ghét): dùng checkpoint tốt nhất epoch 12 (test 0,8437; file `hatespeech_model.pt` là epoch cuối,
  quá khớp), tokenizer Keras dựng lại đúng (độ chính xác khớp notebook), chạy lại bằng **numpy** (`app/moderation/vihsd.py`, khớp Keras
  trên 6 584 câu test, 12 ms/câu) — không cần TensorFlow / torch.
- ViHOS đánh dấu từ vi phạm: PhoBERT-base + token classification (`app/moderation/vihos.py`, cần `requirements-ml.txt`: torch CPU +
  transformers; ≈ 100 ms/câu, +400 MB RAM; `MODERATION_SPANS=0` tắt). Vị trí từ trả về theo ký tự gốc để backend che đúng chỗ.
- HLR portable logistic (`app/hlr/model.py`, JSON trọng số đã commit, khớp bản torch qua fixture). Đo được đường cong gần phẳng theo thời
  gian nên **không lập lịch bằng khoảng ôn của model** (D32 đổi): SM-2 lập lịch, HLR chỉ **phanh** (p < 0,8235 → khoảng ôn không tăng),
  hiển thị độ nhớ và tín hiệu "sắp quên".
- Endpoint mới `POST /api/moderation/check`, `GET /api/moderation/info`, `POST /api/hlr/predict`, `GET /api/hlr/info`; cờ health
  `moderation`, `moderationSpans`, `hlr`. Test `test_moderation_*.py`, `test_hlr.py`.

**Backend**
- Bình luận từ điển (từ + chữ Hán) và bình luận đánh giá bộ thẻ được chấm **đồng bộ** lúc gửi (`ModerationService`, timeout 3 s):
  `CLEAN` đăng; `FLAGGED` (nhãn 1, hoặc nhãn 2 chưa đủ điều kiện, hoặc từ đánh dấu rất chắc) đăng nhưng **người khác thấy bản che từ**
  (`đ∗∗`) và vào hàng chờ admin; `BLOCKED` (nhãn 2 với p ≥ 0,8 **và** ≥ 1 từ đánh dấu, mục từ không nhạy cảm) **chỉ chủ thấy**, trả 201 với
  `moderation.status`, sửa gửi lại được; ai-service lỗi → `PENDING`, `ModerationRescanJob` quét lại mỗi 5 phút (50 dòng). Mục từ
  **nhạy cảm** (nhãn JMdict vulg / X / derog / sens / sl hoặc công tắc admin `dict_sensitive`) → thù ghét chỉ gắn cờ. 3 lần bị chặn / 24 giờ
  → khoá bình luận mềm 24 giờ (429 `COMMENT_LOCKED`, thông báo `MOD_COMMENT_LOCKED`). Tên hiển thị hồ sơ có từ xấu → 400 `NAME_REJECTED`.
  Mẹo nhớ kanji chỉ nhận nhãn AI cho hàng chờ duyệt. BLOCKED quá 30 ngày → `HousekeepingJob` xoá.
- Admin: `GET /api/admin/moderation` (hàng chờ, lọc trạng thái / loại / tìm), `/counts`, `POST …/{kind}/{id}/ignore | restore | hide`,
  `DELETE …/{kind}/{id}`, `POST /api/admin/moderation/rescan`, `GET/PUT /api/admin/dictionary/entries/{key}/sensitive`; `AdminStats.openModeration`
  (badge); chi tiết người dùng có `commentLockedUntil` + `moderationBlocked30d`, PATCH `{commentLocked}`; audit `MOD_*`, `DICT_SENSITIVE`,
  `USER_COMMENT_LOCK / UNLOCK`; thông báo `MOD_COMMENT_BLOCKED` (chặn muộn), `MOD_COMMENT_RESTORED`.
- HLR: `ReviewService.apply` cập nhật `seen / correct / last_reviewed_at`, gọi `HlrClient` (timeout 3 s, lỗi → SM-2 thuần), ghi `recall_p`
  (p trước lượt chấm) và `hlr_brake`; `ReviewResponse` thêm `recallBefore`, `hlrBrake`, `scheduler`; hoàn tác tính lại từ nhật ký;
  `GET /api/decks/{id}/recall` (503 `HLR_UNAVAILABLE` khi ai-service lỗi); phiên lộ trình xếp thẻ đến hạn theo p tăng dần (`SessionResponse.Card.recall`);
  tín hiệu điểm yếu `low_recall` (p < 0,7). `AiServiceClient.postJsonQuick` (kết nối 1 s, đọc 3 s).
- Test: `ModerationPolicyTest`, `ModerationIT` (11 ca), `ReviewHlrIT` (5 ca), `SrsBrakeTest`.

**Frontend**
- Bình luận từ điển / đánh giá: dải trạng thái (chưa đăng + từ bị đánh dấu + sửa gửi lại; chờ admin; chưa kiểm), ghi chú "từ đang được che"
  cho người khác; lỗi 429 / 400 hiện câu của server.
- Admin › **Kiểm duyệt AI** (`/admin/moderation`, badge `openModeration`): tab Chờ xem / AI chặn / AI gắn cờ / Chưa kiểm / Đã xử lý, lọc
  loại, tìm; từ bị đánh dấu tô đỏ (`ModerationText`), nhãn + p, tác giả (số lần bị chặn 24 h, đang khoá), đích (mục từ nhạy cảm / bộ thẻ);
  Bỏ qua · Khôi phục · Ẩn (ghi chú) · Xoá; Quét lại. Công tắc "mục nhạy cảm" ở `DictEntryEditor`; badge AI ở Admin mẹo nhớ và tab bình luận
  từ điển; chi tiết người dùng: khoá / mở khoá bình luận.
- Học: sau mỗi lượt chấm "Ôn lại sau N ngày · trước khi ôn bạn được dự đoán nhớ x % · (phanh)"; chi tiết bộ thẻ chip "Độ nhớ ≈ x % · n thẻ
  sắp quên" (`DeckRecallChip`, ẩn khi 503); Insights thêm lý do "Sắp quên"; thông báo `MOD_*`. Hàm thuần `lib/moderation.ts` + selfcheck
  `moderation.ts`.

## 27/10/2026 (tối): B5–B9 của kế hoạch 26/10 — nợ kỹ thuật, failOrphans theo instance, độ phủ, smoke 2.0, tài liệu
Hai migration chỉ thêm cột: **V36** `extraction_items.doc_level`, **V37** `extraction_jobs.instance_id` + `learning_paths.instance_id`.

**B5 nợ kỹ thuật nhỏ** (mỗi mục một commit)
- B5.1 (LC-04): thuật ngữ / cách đọc thẻ lưu và so trùng sau **NFKC + trim** (ｶﾀｶﾅ = カタカナ, " 学校 " = "学校"); thuật ngữ trùng
  với thẻ đang có hoặc trong cùng lô → **409 `DUPLICATE_TERM`** ở tạo bộ, thêm lô (`?allowDuplicate=true`) và PUT bộ (chỉ soát thẻ
  mới, bộ cũ vốn có thẻ trùng vẫn sửa được); `DeckRequest.allowDuplicate` cho qua. Bóc tách / lộ trình tạo bộ nội bộ luôn cho phép
  trùng. Test `DeckCardsIT`.
- B5.2: lưu **cấp tài liệu khai báo** `doc_level` (V36, từ `docLevel` của ai-service); "Kiểm tra lại" mâu thuẫn giờ đánh giá lại cả
  **level** (từ vựng) và **grammar** (mẫu ngữ pháp) cho item có `doc_level`, gửi `docLevel` sang ai-service; job cũ không có cột
  giữ cảnh báo cũ. Test `ConflictIT`.
- B5.3 (ai-service): làm sạch CSV JLPT lúc nạp (`classifier.clean_row`): bỏ "(する)" thừa ở cách đọc n5 (結婚 けっこん), bỏ đuôi
  する lẫn vào cách đọc danh từ (運動 うんどうする → うんどう, 30 dòng; động từ đọc する như 擦る giữ nguyên), đảo lại hai cột
  `n4.csv:255` (あいさつする,挨拶), cặp sai 下る/さがる → 下がる. Test từng quy tắc + trên dữ liệu thật.
- B5.4: "Lưu" cài đặt lộ trình đi qua `runOnce` (hai lần bấm chỉ một PATCH).
- B5.5: Admin > Người dùng: tài khoản **đang khoá** có ô "Đổi lý do khoá" (PATCH `{locked: true, lockedReason}`, audit
  `USER_LOCK_REASON`); hàm thuần `lockReasonPatch` + selfcheck.
- B5.6: tên tệp CSV xuất (Admin báo cáo, người dùng; tên dự phòng khi xuất bộ thẻ) theo **giờ máy** (`lib/dateFile.ts`) thay vì
  UTC của `toISOString` (23:30 giờ VN không còn thành ngày hôm sau); selfcheck chạy với `TZ=Asia/Saigon`.
- B5.7: bỏ dịch vụ **Redis** khỏi `docker-compose.yml` (không code nào dùng); **Neo4j giữ lại** (D30 dùng thật, khác kế hoạch gốc);
  backend ghi WARN lúc khởi động khi `AI_SERVICE_KEY` rỗng ở profile khác e2e / test (`config/AiServiceKeyWarning`).
- B5.8: chương "chưa tới ngày" (sau khi cân lại lịch) mà có điểm kiểm tra trượt vẫn hiện dải **"Chưa đạt N% — Làm lại"**; dải LP-15
  ở trang bộ thẻ so `chapters[].deckId` của mọi lộ trình ACTIVE (`activePathIds`) nên bộ **đã rời thư mục lộ trình** vẫn được nhắc.
- B5.9: dọn lớp "endpoint chưa có" của đợt 2 (`SERVER_PENDING_MESSAGE`, `isEndpointMissing`, `pendingAware`, `rethrow`,
  `AdminPendingNotice`, `isPendingError`) và `ComingSoonBadge` ở 24 tệp: backend đã đủ endpoint nên 404 / 405 là lỗi thật, hiện
  đúng câu của server; selfcheck tương ứng rút gọn.

**B8 `failOrphans` theo instance** (V37): mỗi backend có `app.instance-id` (biến `INSTANCE_ID`, mặc định hostname) ghi vào job bóc tách
(lúc tạo, chạy lại, bắt đầu chạy) và lộ trình PROCESSING. Khởi động lại chỉ đánh FAILED việc dở dang **của chính instance** hoặc dòng
chưa ghi instance (trước V37) quá **30 phút**; nhiều backend chung một DB không đánh hỏng việc đang chạy của nhau (trước đây mọi job
QUEUED / RUNNING đều bị FAILED). Test `OrphanJobsIT` (job / lộ trình của mình, của instance khác, chưa ghi instance cũ / mới).

**B6 CI, độ phủ**: `jacoco-maven-plugin` 0.8.13 (`prepare-agent` + `report` ở pha test, chỉ đo `com/pbl6/**`, không ngưỡng) → báo cáo
`backend-core/target/site/jacoco/index.html`; CI tải lên artifact `jacoco-report` sau job backend. Lần đo đầu (598 test, 27/10):
**90 % lệnh, 77 % nhánh, 92 % dòng**, 9/402 lớp chưa chạm — ghi ở tài liệu tổng kết 19/10 §4.1. Job ai-service trên CI đã có pytest từ trước.

**B7 smoke / e2e 2.0**: `smoke-learning-path.mjs` kích hoạt có trần thẻ + ngày học → `/session` → chấm có `reactionMs` + `pathId`
(ngoài khoảng → 400) → cân lại lịch → kiểm tra chương → `complete` 409 khi còn thẻ → `today-summary` + `/insights/next` → bổ khuyết
(201 hoặc 400 khi chưa đủ thẻ yếu). `smoke-admin.mjs` thêm mẹo nhớ (gửi → hàng chờ → duyệt → mẹo công khai), ngân hàng câu hỏi, nguồn
tri thức chuẩn (tải → list → chi tiết → lưu trữ → xoá: ADMIN 403, SUPER_ADMIN 204), khiếu nại (khoá → khiếu nại → giải quyết UNLOCK → đăng nhập lại), từ điển
admin (stats / hàng chờ / tìm). `npm run e2e` chạy thêm `smoke-admin.mjs`.

**B9 tài liệu đi sau code**: mục 21/10 bên dưới (OCR hạ cấp, Gemini quá tải, sửa văn bản gốc lộ trình, V30, secret); `LEARNING_PATH.md`
cập nhật lên 2.0 (trạng thái, hạn chế, kiểm tay, "Trống", `quizPassPct`, `LEARNING_PATH_CHAPTER_RETRY`); `CODEBASE_MAP.md`
(`/admin/account`, `selfcheck/manual.ts`, mục B5–B8); `README.md` 2.2 (`--only unihan_def`, 3 file overrides); `Plan/README.md` cột trạng
thái; tài liệu tổng kết 19/10 §7.3 đóng từng dòng; `quyet-dinh-da-chot.md` thêm D13, sửa D11; checklist bỏ câu "chưa kiểm tay".

## 27/10/2026 (chiều): Đồ thị tri thức trên Neo4j + GraphRAG (UC-34, UC-35) — quyết định D30
Thay quyết định 19/10 ("GraphRAG / Neo4j ngoài phạm vi") bằng **D30: làm đúng đề cương** — Neo4j thật, đồng bộ Postgres → Neo4j,
truy vấn Cypher, hỏi đáp GraphRAG. Spec [Plan/specs/2026-10-27-do-thi-tri-thuc-neo4j-design.md](Plan/specs/2026-10-27-do-thi-tri-thuc-neo4j-design.md),
kế hoạch [Plan/plans/2026-10-27-do-thi-tri-thuc-neo4j.md](Plan/plans/2026-10-27-do-thi-tri-thuc-neo4j.md). **Không migration Postgres**
(đồng bộ chỉ đọc). Neo4j chạy bằng `docker compose up -d neo4j` (dịch vụ có sẵn, `neo4j:5-community` ≥ 5.23); tắt Neo4j thì mọi API
đồ thị trả 503 `GRAPH_UNAVAILABLE`, phần còn lại của app không ảnh hưởng.

**ai-service** (`app/graph/`, tầng duy nhất nối Neo4j; driver `neo4j` 5.x trong `requirements.txt`)
- `builder.py` dựng **lớp tham chiếu** từ dữ liệu sẵn có: `Word` (JLPT + JMdict common), `Kanji`, `Radical` (214), `Component`
  (KRADFILE), `HanViet`, `Grammar` (`patterns.yaml`), `Sentence` (câu ví dụ + bản dịch Việt); quan hệ `CONTAINS`, `HAS_RADICAL`,
  `HAS_COMPONENT`, `READ_AS`, `HOMOPHONE_OF`, `LOOKS_LIKE`, `EXAMPLE_OF`, `USES_GRAMMAR` (tokenizer + matcher chạy trên từng câu).
  Dựng thật trên máy dev: **73 giây** (101 giây khi máy đang chạy bộ test backend) — 23 202 từ (dạng viết theo JMdict: ご飯 chứ
  không phải 御飯 của danh sách JLPT), 2 652 chữ Hán, 1 455 âm Hán-Việt, 121 mẫu ngữ pháp, 15 571 câu; 35 932 CONTAINS, ~9 100
  HAS_COMPONENT, ~5 800 LOOKS_LIKE, 17 932 EXAMPLE_OF, 11 301 USES_GRAMMAR, 1 225 HOMOPHONE_OF. Chạy nền
  (`POST /api/graph/build`), ghi node `Meta`.
- `sync.py` nhận **lớp người học** từ backend theo lô 2 000 dòng cùng mã `run` (`POST /api/graph/sync`) rồi `POST /sync/finish`
  xoá node / quan hệ không thuộc run (toàn bộ hoặc chỉ của một người): `User` (chỉ id + cấp, **không PII**), `Deck`, `Card`
  (khớp mục từ qua `dictionary.key_for`, lưu `wordKey` + `kanji` để dựng lại lớp tham chiếu nối lại được bằng Cypher), `REVIEWS`
  (lịch ôn + số lần quên 30 ngày), `Path` / `Chapter` / `SCHEDULES`, nghĩa Việt từ `dict_meanings` đặt lên `Word.vi`.
- `queries.py` Cypher tham số hoá: `resolve` (id có tiền tố / một chữ Hán / mẫu ngữ pháp / âm Hán-Việt kể cả không dấu / từ theo
  dạng viết, cách đọc, **dạng gốc** 食べました → 食べる, tiền tố), `explore` (lân cận hai bậc theo kế hoạch từng loại tâm, thẻ của
  người khác không bao giờ lộ, gắn `learner {cards, reviewed, due, again30d}`), `path` (`shortestPath` ≤ 6 bước chỉ qua quan hệ lớp
  tham chiếu), `recommend` (từ mới từ chữ đã học, chữ Hán hay sai kèm bộ thủ + chữ giống hình, từ đồng âm dễ nhầm), `conflicts`
  (cùng thuật ngữ khác cách đọc / trỏ hai mục từ khác giữa các bộ của mình), `status`.
- `rag.py` GraphRAG: nhận diện thực thể (Sudachi + chữ Hán + âm Hán-Việt viết hoa + `〜mẫu`), nhánh đồ thị (lân cận + ngữ cảnh học
  của người hỏi) ⊕ nhánh văn bản (FTS gloss, tìm câu theo tiếng Việt, tìm Nhật) → `fuse` (cộng điểm khi cùng xuất hiện) → Gemini
  với prompt tiếng Việt trích nguồn `[n]`; không có khoá / hết quota → `template_answer` ghép từ ngữ cảnh (`model: "template"`).
- Router `app/api/graph_router.py` (`/api/graph/*`, X-Internal-Key); `GET /api/extract/health` thêm cờ `graph`. Test: `test_graph_builder_sync.py`,
  `test_graph_queries_rag.py`, `test_graph_router.py` (FakeGraph, 45 test, không cần Neo4j) + `test_graph_live.py` chạy trên Neo4j
  riêng khi đặt `NEO4J_TEST_URI` (đã chạy xanh trên `neo4j:5-community` cổng 7688).

**backend-core** (`service/graph/`): `GraphAiClient`, `GraphSyncService` (JDBC theo trang → lô; staff và tài khoản đã xoá không
đồng bộ), `GraphService` (userId từ JWT; hạn mức hỏi 20 / giờ, khám phá 120 / phút, tự đồng bộ 1 / phút; đồng bộ **lười** dữ liệu
của người xem khi cũ hơn 10 phút; 503 `GRAPH_UNAVAILABLE`), `GraphSyncJob` (`app.graph.sync-cron`, mặc định 03:50 giờ VN),
`controller/GraphController.java` (`GET /api/graph/explore|path|recommend|conflicts`, `POST /api/graph/ask`, `POST /api/graph/sync/me`),
`controller/AdminGraphController.java` (`GET /api/admin/graph/status`, `POST /build`, `POST /sync`, audit `GRAPH_BUILD` /
`GRAPH_SYNC`), `GET /api/admin/health` thêm `graph`. Test `GraphIT` (5).

**frontend**: trang **`/graph` "Đồ thị tri thức"** (mục mới trong thanh bên): tab Khám phá (ô tìm + đồ thị SVG bố cục lực tất định
`lib/graphLayout.ts`, màu theo loại node, viền theo tình trạng học, bảng chi tiết + quan hệ + "Khám phá từ đây" / "Mở trong từ
điển" / "Thêm vào bộ thẻ"), Gợi ý cho bạn (ba nhóm + mâu thuẫn giữa bộ thẻ), Hỏi đáp (GraphRAG: trả lời với mốc `[n]` bấm nhảy tới
nguồn, đồ thị con), Đường nối (shortestPath). Admin › Tổng quan: chấm "Đồ thị (Neo4j)" + hộp trạng thái với nút "Dựng lại đồ thị" /
"Đồng bộ dữ liệu học". Tệp: `pages/KnowledgeGraphPage.tsx`, `features/graph/`, `services/graphService.ts`, `types/graph.types.ts`,
`features/admin/components/AdminGraphCard.tsx`; selfcheck `scripts/selfcheck/graph.ts`.

## 27/10/2026: Sửa theo danh sách lỗi của người kiểm thử + siết bảo mật
Một migration mới: **V35** (`decks.created_at / updated_at / share_password_hash`, `flashcards.created_at`, chỉ thêm cột). Tổng hợp các
lớp bảo vệ ở [SECURITY.md](SECURITY.md).

**Đăng ký / bảo mật tài khoản**
- Mật khẩu phải 8–72 ký tự, có chữ, số và ký tự đặc biệt (`PasswordPolicy`, `@StrongPassword`): đăng ký, đổi, đặt lại mật khẩu,
  `/setup` của staff; frontend báo sớm cùng quy tắc (`lib/passwordRules.ts`). Mật khẩu đã đặt trước đó không bị ép đổi.
- Tài khoản đăng ký mà chưa bấm link xác thực: **đăng ký lại cùng email được** (nhận mật khẩu / họ tên mới, gửi lại link; dòng
  người dùng giữ nguyên id), và **tự xoá sau 48 giờ** (`HousekeepingJob`, 03:30 mỗi đêm). Admin > Người dùng có bộ lọc + nhãn
  "Chưa xác thực" (`?verified=false`, cột `emailVerified`). Quyết định logic: tài khoản chưa xác thực vẫn tồn tại trong 48 giờ để
  người thật kịp bấm link / gửi lại, sau đó coi như chưa từng đăng ký.
- Email xác thực "không nhận được": máy chủ chưa cấu hình SMTP thì link chỉ ghi log — dashboard admin hiện chấm đỏ
  "Email (chưa cấu hình SMTP)", `GET /api/admin/health` thêm `mail`. Cách cấu hình: [SUPABASE_SETUP.md §5](SUPABASE_SETUP.md).
- Khoá đăng nhập theo email: sai mật khẩu 20 lần / 15 phút từ mọi IP → 429 kể cả khi sau đó nhập đúng (thêm vào lớp 5 lần / phút
  theo IP + email). Header bảo mật cho mọi phản hồi API: `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`,
  `Content-Security-Policy` (trừ Swagger), HSTS khi HTTPS.

**Tổng quan**
- Badge ở mục "Bộ Thẻ Của Tôi" đếm **bộ thẻ** có thẻ đến hạn ("N bộ cần ôn") và bấm vào mở danh sách bộ thẻ cần ôn
  (`/decks?filter=due`); nút "Ôn tập ngay" của banner cũng vậy; banner ghi "trong N bộ thẻ". Số liệu `metrics.dueDecks`.

**Bộ thẻ của tôi**
- Danh sách bộ thẻ: sắp xếp (mặc định **mới cập nhật trước**, rồi mới tạo / tên / cấp / nhiều thẻ), lọc theo thời gian cập nhật
  (hôm nay / 7 / 30 ngày), nút "Cần ôn (N)". Thẻ bộ thẻ bản gọn theo đề xuất: hàng chip (cấp, số thẻ, "Hôm nay / Hôm qua / N ngày
  trước", nợ ôn, nguồn) + menu ⋯ (Ôn, Kiểm tra, Sửa, Chia sẻ, Đưa ra khỏi thư mục, Xoá), tiêu đề và mô tả 2 dòng (`DeckCard`).
  Thẻ thư mục ở Thư mục học cùng dáng (`FolderCard`).
- Trang bộ thẻ: sắp xếp thẻ (thứ tự / mới thêm / cũ nhất) và lọc thẻ thêm trong hôm nay / 7 / 30 ngày (`flashcards.created_at`).
- Tạo / sửa bộ thẻ: khối **Quyền truy cập** (Riêng tư / Công khai) + ô "sau khi lưu mở hộp Chia sẻ" để mời theo email hoặc tạo link.
  Link riêng **có thể đặt mật khẩu** (4–72 ký tự, BCrypt): người mở link phải nhập đúng (`403 SHARE_PASSWORD_REQUIRED /
  SHARE_PASSWORD_WRONG`, sai 10 lần / 15 phút → 429); chủ và người đã có quyền không cần. Trang `/d/<token>` hỏi mật khẩu.
- Nhập dữ liệu: thêm phần thứ ba **"Giữa thuật ngữ và cách đọc"** (cột riêng cùng dấu / trong ngoặc 食べる（たべる） / sau dấu `/` /
  tuỳ chỉnh / không có cách đọc); ô "Tùy chỉnh" để trống với gợi ý mờ thay vì điền sẵn `\n\n`; trống thì dùng dấu mặc định.
- Thêm bộ thẻ vào thư mục > "Tạo bộ thẻ mới": mở trình tạo bộ thẻ đầy đủ với thư mục đã chọn sẵn (trước đây tạo một bộ rỗng).

**Học**
- Bộ đã học xong (không còn thẻ đến hạn): nút chính thành **"Ôn lại cả bộ"** (chế độ học nhanh, không đổi lịch) thay vì mở phiên
  rỗng; thêm **"Học lại từ đầu"** = `DELETE /api/decks/{id}/progress` xoá lịch ôn của mình với bộ đó (nhật ký giữ). Màn kết thúc
  phiên có link "Ôn lại cả bộ ngay".
- Xuất CSV: **mặc định không có dòng tiêu đề cột**; menu Xuất có ô "CSV kèm dòng tên cột" (`?header=true`).

**Test**: backend `AccountHardeningIT` 5 (mật khẩu yếu, đăng ký lại email chưa xác thực, dọn tài khoản 48 giờ + lọc admin, khoá theo
email từ nhiều IP, header + health), `PasswordPolicyTest`, `DeckShareLinkIT` +2 (mật khẩu link; mốc thời gian + đặt lại tiến độ),
`AuthValidationIT` / `HousekeepingIT` cập nhật; mật khẩu dùng trong test / smoke đổi sang `Secret123!`. Frontend selfcheck
`qa2710.ts` (chính sách mật khẩu, nhãn thời gian, sắp xếp / lọc bộ thẻ và thẻ, nhập dữ liệu với dấu cách đọc riêng).

## 26/10/2026: Từ điển — tra dạng chia, câu ví dụ tiếng Việt, tab Câu, vẽ chữ, mở rộng nghĩa
Năm cải tiến sau khi rà từ điển (Phần A). Không có migration.

- **Tra dạng đã chia**: tìm 食べました / 読んで / 高かった / 勉強しています ra 食べる / 読む / 高い / 勉強. ai-service: khi q không trùng
  dạng viết nào, lấy dạng gốc (lemma Sudachi) của các từ nội dung theo thứ tự trong câu (bỏ động từ phụ する / いる đứng sau), mục của
  dạng gốc đứng đầu rồi tới kết quả tiền tố; response thêm `deinflected {query, lemmas}`, backend chuyển tiếp, giao diện ghi chú
  "đang hiện trước mục của dạng gốc". Sudachi lỗi → tìm như cũ.
- **Câu ví dụ tiếng Việt**: `ai-service/app/extract/data/example_vi.csv` — 26 316 câu Tatoeba dịch sẵn (Claude, chưa rà tay). Mục từ
  trả `viSeed`; backend dùng khi chưa có bản admin / Gemini (`dict_example_vi`) và câu chưa bị admin sửa, nên không gọi AI cho các câu
  này nữa. Nghĩa Việt đã lưu thắng bản dịch sẵn.
- **Mở rộng nghĩa Việt**: `jmdict_example_words_meaning_vi.csv` — 14 068 mục có câu ví dụ mà chưa có nghĩa Việt (nạp lúc khởi động như
  hai file cũ, `MACHINE / SEED`). Tổng nghĩa Việt dịch sẵn ~37 000 mục. 27 / 43 dòng JLPT chưa khớp được gán tay về mục JMdict.
- **Tab Câu** (`/dictionary?tab=sentences&s=…`): tìm câu ví dụ theo cụm — chữ Nhật khớp đúng chuỗi, tiếng Anh khớp từ đầu một từ, tiếng
  Việt có / không dấu (theo bản dịch sẵn); câu ngắn trước, tô cụm khớp, nghe câu, bấm từ trong câu để mở mục. ai-service
  `GET /api/dict/sentences`, backend `GET /api/dictionary/sentences` (áp ghi đè câu, ẩn câu admin đã ẩn, bản dịch đã lưu thắng).
- **Vẽ chữ Hán để tra**: ô vẽ ở tab Từ vựng (chữ chọn được nối vào ô tìm) và tab Hán tự (mở chữ đó). ai-service `handwriting.py` +
  `POST /api/dict/handwriting`: so nét đã chuẩn hoá với nét mẫu KanjiVG (~2 000 chữ), lọc theo số nét ±2, ghép nét tối ưu (Hungarian),
  cộng phần đúng thứ tự khi đủ nét. Đo trên 120 chữ ngẫu nhiên: đúng hạng 1 khi vẽ có nhiễu 120/120, đổi thứ tự nét 120/120, thiếu một
  nét 111/120 (118/120 trong 5 gợi ý); ~200 ms / lần. Backend `POST /api/dictionary/handwriting` (120 lượt / phút / người).
- **Test**: ai-service `test_dictionary.py` +9 (dạng chia, bản dịch sẵn, tab Câu, router), `test_handwriting.py` 8 (bộ nét giả + một
  test dữ liệu thật tự bỏ qua khi thiếu tệp); backend `DictionaryIT` +4 (chuyển tiếp dạng gốc, bản dịch sẵn / admin thắng, tab Câu,
  vẽ chữ); selfcheck `dictionary.ts` (ghi chú dạng gốc, tô cụm). Kiểm trên trình duyệt (localhost): tra 食べました, tab Câu Nhật / Anh /
  Việt không dấu, bấm từ trong câu, vẽ 十 bằng sự kiện con trỏ ra 十 đầu danh sách, 375 px không tràn.
- **Chưa làm / giới hạn**: bản dịch câu và nghĩa mới chưa có người rà; vẽ chữ chỉ nhận ~2 000 chữ có trong KanjiVG đã lọc theo JLPT;
  tô cụm không tô khi gõ không dấu (server vẫn tìm ra).

## 26/10/2026: Nhắc học qua email theo lộ trình (B4)
Kế hoạch [Plan/plans/2026-10-26-tu-dien-va-viec-con-lai.md](Plan/plans/2026-10-26-tu-dien-va-viec-con-lai.md) B4. Một migration mới:
**V34** (`learning_paths.remind_email boolean NOT NULL DEFAULT false`, chỉ thêm cột).

- **backend**: `PATCH /api/learning-paths/{id}` nhận `remindEmail`, response có `remindEmail`. `LearningPathReminderJob` sau khi gửi
  nhắc trong app gửi thêm **một email / người / lượt**, gộp các lộ trình vừa được nhắc mà bật `remind_email` (đọc lại cột lúc gửi):
  tiêu đề nêu tổng số thẻ hôm nay, thân liệt kê từng lộ trình (ngày học, thẻ mới / đến hạn / nợ) kèm link `/roadmap/{id}` và chỉ
  chỗ tắt. Tối đa một email / lộ trình / ngày nhờ `last_reminded_on` sẵn có. Email soạn trong giao dịch của người đó nhưng **gửi
  sau commit**; bỏ qua tài khoản bị khoá / đã xoá / chưa xác thực email. Thiếu SMTP: một dòng log mỗi lượt, không gửi.
  `MailService` thêm `isConfigured()` và `sendNotice(...)` (thư không chứa token, lỗi gửi chỉ ghi log).
- **frontend**: Cài đặt lộ trình thêm công tắc **Nhắc thêm qua email** dưới "Nhắc học mỗi sáng" (mờ đi khi tắt nhắc trong app).
- **Test**: `LearningPathReminderJobIT` +1 (JavaMailSender giả: bật theo lộ trình, gộp 2 lộ trình một thư, chạy bù không gửi lại,
  tài khoản khoá không nhận, tắt một lộ trình thì thư hôm sau chỉ còn lộ trình kia), `LearningPathReminderJobTest` +4 (gửi sau
  commit, thiếu SMTP / khoá / chưa xác thực không gửi, soạn nội dung), `MailServiceTest` +2; selfcheck `settingsPatch` +3.
  Chưa gửi thử qua SMTP thật (máy dev không có cấu hình SMTP).

## 26/10/2026: Hiệu quả lộ trình (B3)
Kế hoạch [Plan/plans/2026-10-26-tu-dien-va-viec-con-lai.md](Plan/plans/2026-10-26-tu-dien-va-viec-con-lai.md) B3. **Không có migration**:
`review_logs.path_id` / `reaction_ms` đã có từ V20 và client đã gửi từ lộ trình 2.0.

- **backend**: `GET /api/insights/path-effect/{pathId}` (`PathEffectService`, JDBC gộp ở DB): theo chương và tổng — số thẻ đã học,
  lượt ôn, tỷ lệ "Lại", trung vị phản xạ, tỷ lệ nhớ sau 7 ngày; so trước / sau lộ trình bổ khuyết theo mốc thời gian tạo bổ khuyết
  đầu tiên. Lượt học nhanh không tính. `GET /api/admin/stats` thêm `pathEffect {inPath, outside}` (lượt ôn trong / ngoài lộ trình
  trong cửa sổ `days`). Chi tiết định nghĩa ở [LEARNING_PATH.md](LEARNING_PATH.md) bảng API.
- **frontend**: khung **Hiệu quả học** ở trang lộ trình đang học (4 số tổng, bảng theo chương, hai thanh "Lại" trước / sau bổ khuyết +
  nhận xét giảm / tăng / không đổi / chưa đủ dữ liệu, cần ≥ 5 lượt mỗi bên); tải lại ngầm sau mỗi lượt chấm. Thẻ "Lộ trình học tập"
  ở Tổng quan admin thêm dòng ôn trong / ngoài lộ trình.
- **Test**: backend `PathEffectIT` 2 (dữ liệu chèn có mốc thời gian: chương, tổng, nhớ 7 ngày, chia trước / sau, loại cram, 404 / 403,
  khối admin); frontend selfcheck `learningPath.ts` (đọc response hỏng, định dạng, xu hướng). Kiểm trên trình duyệt (localhost, lộ
  trình thật dựng qua ai-service + bổ khuyết): số khớp API, 375 px không tràn, hai thanh cùng thước đo. Thẻ admin chưa xem trên
  trình duyệt (môi trường thử không có tài khoản admin), chỉ kiểm qua test.

## 26/10/2026: Link chia sẻ bộ thẻ (D9) + xuất bộ thẻ (UC-29)
Kế hoạch [Plan/plans/2026-10-26-tu-dien-va-viec-con-lai.md](Plan/plans/2026-10-26-tu-dien-va-viec-con-lai.md) B1, B2. Một migration
mới: **V33** (`decks.share_token varchar(43)` + chỉ mục unique một phần, chỉ thêm cột).

- **Link riêng (B1, D9)**: chủ bộ thẻ tạo / đổi / tắt link `/d/<token>` (32 byte ngẫu nhiên base64url) ở hộp Chia sẻ; người đã đăng
  nhập mở link → `POST /api/decks/share-link/{token}/accept` thêm dòng `deck_shares` quyền Chỉ xem (xem, học, sao chép dù bộ riêng tư)
  rồi chuyển tới `/decks/{id}`. Người đã được mời giữ quyền cũ (EDITOR không bị hạ), chủ mở link của mình không đổi gì. Đổi link =
  link cũ hết hiệu lực; tắt link không gỡ người đã vào (gỡ ở danh sách). Chưa đăng nhập → trang đăng nhập rồi quay lại đúng link.
  Token sai / đã thu hồi / bộ đã xoá → 404. API: `GET/POST/DELETE /api/decks/{id}/share-link` (chỉ chủ), `DeckShareLinkService`.
- **Xuất bộ thẻ (B2, UC-29)**: `GET /api/decks/{id}/export?format=csv|anki` (ai xem được bộ thẻ đều xuất được, `DeckExportService`).
  CSV UTF-8 có BOM `term,reading,meaning,level,han_viet,pos` (trích dẫn RFC 4180, ô bắt đầu bằng `= + - @` thêm `'` để Excel không chạy
  công thức); Anki = TSV có tiêu đề `#separator:tab` / `#html:true` (mặt trước thuật ngữ, mặt sau cách đọc + nghĩa + Hán-Việt, escape
  HTML, xuống dòng = `<br>`); tên tệp `<tên-bộ-không-dấu>-<ngày VN>.csv` / `-anki.txt`. PDF: trang in `/decks/:id/print` (bảng thẻ,
  CSS in, nút "In / Lưu PDF"). Frontend: menu **Xuất** ở trang bộ thẻ (`DeckExportMenu`, tự neo trái / phải theo chỗ trống).
- **Test**: backend `DeckShareLinkIT` 3 (tạo / đổi / tắt / nhận / token sai / bộ đã xoá / giữ EDITOR / staff 403 / xuất CSV, Anki,
  400, 404) + `DeckExportServiceTest` 3; frontend `scripts/selfcheck/deckShare.ts` (URL link, tên tệp từ `Content-Disposition`).
  Kiểm trên trình duyệt (localhost, tài khoản thử): tạo link → người khác đăng nhập qua link → vào bộ thẻ với quyền xem; link sai báo
  lỗi; tải CSV / Anki đúng tên và nội dung; trang in; 375 px không tràn.

## 26/10/2026: Từ điển Nhật–Việt cộng đồng (UC-43..45)
Spec / kế hoạch: [Plan/specs/2026-10-26-tu-dien-design.md](Plan/specs/2026-10-26-tu-dien-design.md),
[Plan/plans/2026-10-26-tu-dien-va-viec-con-lai.md](Plan/plans/2026-10-26-tu-dien-va-viec-con-lai.md) (phần A). Quyết định D14–D29.
Một migration mới: **V32** (chỉ thêm bảng `dict_*` + 2 khoá cấu hình; mở rộng CHECK khoá `app_settings` như V21).

- **Bảo mật / git**: `application-local.properties` (mật khẩu Supabase, JWT secret) đã bị commit từ 21/10 → gỡ khỏi git, trả lại dòng
  `.gitignore` (`8701745`). **Phải đổi mật khẩu DB và JWT secret** vì lịch sử git vẫn còn bản cũ. Đã gộp `origin/a` (`ac7dc9c`, 25/10).
- **Dữ liệu**: `jmdict.sqlite` dựng lại từ bản JMdict đầy đủ có ví dụ Tatoeba (`jmdict-examples-eng`, 218 930 mục, 32 362 câu, FTS5;
  ~197 MB, gitignore; `--dict-scope compact` cho file nhỏ hơn). Bảng `entries` cũ giữ nguyên nên bóc tách không đổi kết quả.
  Nghĩa tiếng Việt dịch sẵn (Claude viết): 7 972 từ JLPT + 21 806 nhóm từ phổ biến JMdict (29 655 dòng), đã map `entry_key`
  (99 % khớp mục JMdict) bằng `scripts/map_dict_vi_keys.py`; backend nạp vào `dict_meanings` lúc khởi động (`DictionarySeedLoader`,
  status MACHINE, không bao giờ đè bản admin).
- **ai-service**: `/api/dict/{search, entries, kanji, key, tokenize, translate, overrides}` (`dictionary.py`, `dict_router.py`); tìm
  Nhật (kana ↔ katakana, chính xác rồi tiền tố) và Anh (FTS); lớp ghi đè của admin `overrides.py` (RAM + `data/dict_overrides.json`)
  áp vào Hán-Việt, nghĩa chữ, gloss JMdict, cách đọc khi bóc tách; item `/extract/analyze` thêm `dictKey`; health thêm 4 cờ `dict*`;
  `gemini.translate_dictionary`.
- **backend**: `/api/dictionary/*` (USER) tra cứu gộp 4 lớp (gốc → ghi đè → nghĩa Việt → cộng đồng), dịch lúc tra có trần theo giờ
  (`dictionary_ai_hourly_limit`, mặc định 30; người học không thấy nhãn "máy dịch", D23), bình luận + Hữu ích, báo lỗi mục / bình
  luận, sổ tay, lịch sử tra (300 / người); `/api/admin/dictionary/*` (ADMIN, SUPER_ADMIN) hàng chờ (bị báo cáo → chỉ có nghĩa Anh →
  nghĩa máy chưa kiểm), sửa nghĩa Việt / xác nhận / dịch lại, ghi đè dữ liệu gốc, bản dịch ví dụ, áp đề xuất một nút, hoàn tác, ẩn /
  xoá bình luận, lịch sử, đồng bộ ai-service (`DictionaryOverridePublisher`: sau commit + 10 phút / lần); audit target `DICTIONARY`;
  thông báo `DICT_REPORT_RESOLVED`, `DICT_COMMENT_HIDDEN`; thống kê admin thêm `openDictReports`, `dict`. Bóc tách lấy nghĩa Việt có
  sẵn trong từ điển trước khi gọi Gemini, nghĩa Gemini mới được lưu lại (`stats.fromDictionary`).
- **frontend**: trang `/dictionary` (tab Từ vựng / Hán tự / Hán-Việt / Sổ tay; `/kanji`, `/han-viet` chuyển hướng giữ tham số),
  chi tiết mục (Hán-Việt theo chữ, JLPT, trọng âm, nghĩa Việt / Anh, câu ví dụ + dịch, tra từng từ trong câu, câu từ tài liệu của mình,
  thêm vào bộ thẻ, sổ tay, báo lỗi, bình luận), nút tra từ điển ở màn học, `/admin/dictionary` (hàng chờ, tìm & sửa, bình luận, lịch
  sử, ngăn sửa), tab Từ điển ở `/admin/reports`, hai khoá ở Cấu hình (tuỳ chọn), trang `/about/data` ghi nguồn / giấy phép.
- **Test**: ai-service **1383 passed** (+17 `test_dictionary.py`, hai test hợp đồng cập nhật khoá mới); backend `DictionaryIT` 12 + 1 test
  mới ở `ExtractionIT`; frontend lint + build + self-check (module `dictionary.ts`) xanh.
- **Chưa kiểm**: dịch Gemini thật (máy không có khoá), V32 trên Supabase, giao diện trên điện thoại thật.

## 25/10/2026: thao tác khi học flashcard
Spec / kế hoạch: [Plan/specs/2026-10-25-thao-tac-hoc-the-design.md](Plan/specs/2026-10-25-thao-tac-hoc-the-design.md),
[Plan/plans/2026-10-25-thao-tac-hoc-the.md](Plan/plans/2026-10-25-thao-tac-hoc-the.md). Một migration mới: **V31**. Không đổi thuật toán SRS.

- **Trang học** (`StudyPage`, `features/study/*`): chạm vào thẻ / Space / Enter để lật qua lại hai mặt, chấm bằng phím 1 2 3 4;
  vuốt trái = Lại, phải = Tốt trên màn hình cảm ứng; thẻ "Lại" gặp lại sau 3 thẻ (trước: cuối hàng đợi); thanh tiến độ + bộ đếm
  Mới · Ôn · Học lại; màn tổng kết (thời gian, phân bố 4 mức, thẻ bấm Lại nhiều nhất, "Luyện lại n thẻ này" ở chế độ Luyện); phím `?`
  mở bảng phím tắt; F5 giữa phiên học tiếp hàng đợi dở (`sessionStorage`, 12 giờ).
- **Hoàn tác lượt chấm**: Z / Ctrl+Z / nút ↶, tối đa 20 bước mỗi phiên. `POST /api/reviews/undo {cardId}` → 204; 409 khi không có gì để
  hoàn tác (quá 30 phút, lượt quiz, lượt ghi trước V31, lượt của người khác). V31 thêm `review_logs.prev_*` (lịch ngay trước lượt chấm);
  hoàn tác ghi lại lịch cũ (hoặc xoá dòng `reviews` nếu là lượt đầu) và xoá log, nên heatmap / chuỗi ngày không đếm lượt đã bỏ.
- Test: `ReviewSrsIT` thêm 3 test hoàn tác; `scripts/selfcheck/study.ts`.

## 21/10/2026: OCR hạ cấp, Gemini quá tải, sửa văn bản gốc của lộ trình, V30 (ghi bù 27/10 theo `git show --stat`)
- **ai-service** (`346f9bd`, `2bfa0ea`, `e74f235`): hồ sơ gọi Gemini riêng cho OCR (timeout 30 giây, 1 lần thử lại, hạn chót chung
  của cả tài liệu); **OCR hạ cấp**: Tesseract chạy trước, Gemini Vision chỉ khi độ tin cậy thấp; Gemini quá tải / hết quota thì giữ
  bản Tesseract và gắn `meta.ocrDegraded`, không có bản dự phòng thì 503 `aiOverloaded`.
- **backend** (`245b670`, `93fbb44`, `9159357`): `AiServiceException` nhận biết 503 `aiOverloaded`; **V30** `extraction_jobs.failure_kind`
  — `AI_OVERLOADED` không tính vào hạn mức bóc tách 24 giờ; sửa văn bản xoá `blocks` OCR cũ; lộ trình **sửa văn bản gốc rồi phân tích
  lại** (`GET/PUT /api/learning-paths/{id}/text`), response thêm `job.ocrDegraded / failureKind`, thông báo kèm `ocrDegraded`.
- **frontend** (`9224960`): lộ trình cảnh báo OCR hạ cấp, bảng sửa văn bản gốc (`PathSourceTextPanel`), thông điệp AI quá tải.
- **docs** (`af73be8`): đưa toàn bộ tài liệu dự án lên nhánh. Commit này lỡ mang theo `application-local.properties` (mật khẩu Supabase,
  `JWT_SECRET`): tệp đã được gỡ khỏi git, nhưng lịch sử vẫn còn → **phải đổi khoá** (SECURITY.md §4, việc 1).

## 20/10/2026 (chiều): hoàn tất phần còn thiếu của Lộ trình học tập / Admin
Tổng kết và kế hoạch: [Progress/2026-10-19-tong-ket-va-ke-hoach.md](Progress/2026-10-19-tong-ket-va-ke-hoach.md) (§3, §5, §6.2, §10).
10 commit `8de6ea1`..`a0094a3` (10:17–13:59), HEAD `a0094a3`, 44 commit kể từ `de8accb`; vẫn chỉ ở local, chưa push. Một migration
mới: **V29** (chỉ thêm cột, khác bản V29 "Nổi bật" đã bỏ buổi sáng). Mỗi bản sửa tới `5a09e31` qua 1 lượt review đối kháng.

- **Lộ trình học tập**:
  - `8de6ea1` (D4): chương ACTIVE hết thẻ mà chưa qua kiểm tra có `state=empty` ("Trống", không nút học / kiểm tra; kiểm tra trả
    409). Kiểm tra chương chưa đạt: dải "Chưa đạt N% — Làm lại" và thông báo `LEARNING_PATH_CHAPTER_RETRY` một lần mỗi chương;
    `GET /api/learning-paths/{id}` trả `quizPassPct`. Vẫn chỉ gắn nhãn, không chặn chương sau.
  - `657d383` (NEW-17, major; NEW-18): kiểm tra chương luôn là bài thi của chương. Trước đây lượt luyện tập đang mở (24 giờ) được trả
    lại, làm 10/10 mà chương không qua. Nay lượt mở khác bị nộp thay (chấm như hết hạn) sau hộp "Nộp bài đang làm dở?"; đề mới cũng thiếu
    câu thì giữ lượt mở. `completion.chaptersTotal` bỏ chương "Trống" và chương không ra đủ min(10, số thẻ) câu nghĩa.
  - `d5e3c41` (spec LP-13, LP-15): `runOnce` chống bấm đúp cho các thao tác lộ trình (kích hoạt, gộp chương, cân lại, hoàn thành,
    thử lại, dịch lại nghĩa, kiểm tra chương; chưa có cho lưu cài đặt), hai modal tạo và nút xác nhận của `DialogProvider`; dải "Bộ
    thẻ này thuộc lộ trình «X»…" ở trang bộ thẻ / trang sửa của chương, câu xác nhận xoá thẻ / bộ nói rõ thẻ rời lịch. Spec Lộ trình 2.0 nay đủ 18/18 dòng.
- **Admin**:
  - `4232a4b` (STAFF-07): V29 `ALTER TABLE account_appeals ADD COLUMN IF NOT EXISTS locked_reason_at_submit text`; khiếu nại chụp lý do
    khoá lúc gửi (`''` = khoá không lý do, `NULL` = gửi trước V29); `AppealResponse.lockedReasonAtSubmit`; cột "Lý do khoá (lúc gửi)";
    modal xử lý theo trạng thái khoá mới nhất.
  - `3350f71`: `ai_model_primary` có tác dụng cho OCR dự phòng / dịch nghĩa / mẹo nhớ. ai-service nhận `gemini_model` (`/extract/text`)
    / `geminiModel` (`/extract/enrich`, `/radicals/cards`), chỉ trong danh sách cho phép (`GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`,
    `GEMINI_ALLOWED_MODELS` mới, `gemini-3.8-flash`, `gemini-3.7-flash`); tên lạ → `GEMINI_MODEL`; chuỗi model chọn → `GEMINI_MODEL` →
    dự phòng, 404 thì bỏ model đó 30 phút. `GET /api/admin/health` thêm `aiModels {default, allowed}`; trang Cấu hình gợi ý và cảnh báo.
  - `177d764` (NEW-19): `PATCH /api/admin/users/{id}` `{locked:true, lockedReason}` đổi được lý do của tài khoản đang khoá (audit
    `USER_LOCK_REASON`, giữ `lockedAt`); trước đây 200 mà giữ lý do cũ.
  - `d5e3c41`: thẻ "Lộ trình học tập" ở Tổng quan (`learningPathBreakdown`).
- **Màn hẹp** (frontend): `ff82190` (NEW-20) khung thông báo nằm trong màn hình ở 320–639 px, header không tràn ở 320 px; `d1a581e`
  (NEW-21) tiêu đề "Bộ thẻ đang học" và nút "Mục tiêu học tập" không xuống dòng từng chữ; `a0094a3` banner ôn tập theo bề rộng của
  chính nó (768 px: 4 dòng → 1), nút đóng không bị cắt và nhãn bảng điều khiển một dòng ở 320 px.
- **Backend** `5a09e31` (NEW-22): mốc thời gian làm tròn tới micro giây trước khi lưu, response của lần ghi trùng lần đọc sau
  (lockedAt, premiumUntil, updatedAt cài đặt / câu hỏi, dueAt, expiresAt, createdAt…); `premiumUntil` gửi lại cùng hạn không còn
  sinh audit / thông báo thừa; `User.setPasswordChangedAt` cắt µs (token cấp ngay sau đổi mật khẩu từng bị 401 ở ~0,05 % lần).
- **Kiểm trực tiếp**: HEAD `d5e3c41` (`wf_9c24c580-d98`): API 11/11, giao diện người học 13/13 (1280 / 375 px), Claude tự kiểm
  admin; tìm ra NEW-17..20. HEAD `ff82190` (`wf_5aec64e5-42f`): API 10/10, giao diện đạt hết trừ tiêu đề dashboard (NEW-21, đã sửa).
  Chuyển model Gemini thật chỉ kiểm qua code / test (máy không có khoá Gemini).
- **Test**: backend `mvn -B test` 520 → 525 → **528 / 70 lớp, 0 lỗi** (`5a09e31`, 26:32 phút; +18 test, +1 lớp
  `AiServiceClientGeminiModelTest`); ai-service **1340 passed, 2 skipped, 1 xfailed** (`3350f71`); frontend lint + build + self-check
  xanh (`a0094a3`; module self-check mới `learningPath`).
- **Đóng các mục "Còn mở"** của 19/10 và sáng 20/10: STAFF-07, `ai_model_primary`, spec LP-13 / LP-15, D4 "nhắc làm lại", chương
  "trống", `learningPathBreakdown` trên giao diện.
- **Còn mở** (chi tiết §7 tài liệu tổng kết): LC-04 backend; CSV JLPT; đổi vai trò không kiểm bậc; tên model lạ vẫn lưu được (chỉ
  cảnh báo); dải LP-15 mất khi chuyển bộ thẻ khỏi thư mục lộ trình, xoá cả bộ từ trang Bộ thẻ / Thư mục không nhắc lộ trình; lưu cài
  đặt lộ trình chưa qua `runOnce`; chương `locked` có điểm trượt không hiện dải "Làm lại"; một PATCH đổi nhiều trường chỉ ghi một
  action audit (có từ trước); "Ghi nhớ đăng nhập" mặc định chọn (quyết định sản phẩm); `chaptersTotal` không trừ câu hỏi bị ẩn (hiếm);
  chân thẻ KPI dashboard còn chật ở 768 px; đổi lý do khoá của tài khoản đang khoá chỉ làm được qua API (trang chi tiết người dùng
  chưa có ô); NEW-22 mới kiểm bằng IT, chưa kiểm trực tiếp; chuyển model Gemini thật chưa chạy (máy không có khoá); trước khi chạy
  V29 trên Supabase phải kiểm không còn dòng V29 cũ. Các mục còn mở của buổi sáng (thẻ rác "漢字 かな", `failOrphans`, giới hạn
  tách chương, LP-07) không đổi.
- **Bàn giao kiểm trực tiếp** (theo yêu cầu của người dùng, 20/10): Claude dừng các lượt kiểm trực tiếp. Các lượt đã kiểm và 12 việc
  còn lại để người dùng tự kiểm (NEW-22 trên dịch vụ thật, dashboard mới, LP-07, STAFF-06 ca 0, đổi lý do khoá qua API, SMTP, Gemini /
  `ai_model_primary` thật, OCR chữ dọc, micro, trình duyệt khác, smoke `npm run e2e`, Supabase thật) nằm ở
  [tài liệu tổng kết §8a.1](Progress/2026-10-19-tong-ket-va-ke-hoach.md).

## 20/10/2026 (sáng): Kiểm trực tiếp sau khi khởi động lại dịch vụ, sửa NEW-03..16, an toàn cho Supabase dùng chung
Tổng kết và kế hoạch: [Progress/2026-10-19-tong-ket-va-ke-hoach.md](Progress/2026-10-19-tong-ket-va-ke-hoach.md) (§6.2, §10). Mọi
commit vẫn chỉ ở local trên `backend-feature-learnmode` (chưa push). Không có migration mới (vẫn tới V28). Máy mất nguồn lúc 02:01
giữa một workflow; đã chạy lại từ đúng chỗ dở, không mất thay đổi.

- **Kiểm trực tiếp** (ai-service, backend e2e, frontend chạy thật; 1280 / 1024 / 375 px; USER / ADMIN / SUPER_ADMIN): các bản sửa
  LC-01..03, LC-11, LP-01, LP-02, LP-08, LP-10, STAFF-01..08, STAFF-10, 11, 13, 14 đạt trên dịch vụ thật; STAFF-12 trượt ở lượt đầu
  (bong bóng tiếng Anh của trình duyệt), sửa ở NEW-08 (`faf028b`) rồi đạt; STAFF-09 không kiểm lại ngày 20/10; ca tổng 0 của
  STAFF-06 mới kiểm qua code. Mỗi lượt kiểm tìm thêm lỗi; sửa xong lại kiểm, lượt cuối đạt hết.
- **Lộ trình học tập**:
  - `7f66b34`, `4a4a409`, `f1cdf53` (ai-service, NEW-03 / NEW-13): tách chương nhận tên bài bắt đầu bằng chữ giống trợ từ
    ("第1課 はじめまして", "第3課 がっこう", bản OCR dính liền) khi lấp đúng dãy số bài; không nhận câu / ghi chú / mục lục
    ("第1課 を復習しましょう", "第4課の予習", "第4課 はらいしゅう"); một bài cuối yếu không còn kéo mất cả dãy; bỏ dựa vào khoảng trắng
    toàn cỡ (NFKC đã đổi); thuật toán tuyến tính. 4 lượt review đối kháng + 5 bộ fuzz tới 40 000 tài liệu: 0 tiêu đề giả mới, 0 mất
    nội dung so với trước `7f66b34`; bộ `f6` (20 000 tài liệu thực tế) còn 9 tiêu đề giả do mục lục khi sách bắt đầu giữa chừng.
  - `1f861ff`, `fb656a8`, `4fce06b` (backend, NEW-04 / NEW-05): chương "Ngày N" của bản nháp không có chương là hàm thuần của
    (thẻ đã chọn, số ngày, trần), tính lại ở mọi thao tác ghi, giữ id; chương đặt tên riêng giữ thẻ; gộp tay vào chương "Ngày N" trả
    400; đang "Dịch lại nghĩa" thì PATCH số ngày / trần trả 409 cho mọi bản nháp; bản nháp lưu từ bản cũ được chuẩn hoá khi **chính
    chủ** mở (bỏ bước quét mọi bản nháp lúc khởi động, vốn sẽ ghi vào dữ liệu của mọi người trên Supabase dùng chung);
    `completedAt` chính xác tới micro giây.
  - `20a2331`, `74f97cc` (frontend, NEW-06 / NEW-07): một chip "Đã hoàn thành", banner Thư viện cùng nhãn đánh giá, bản nháp khoá ô
    số ngày / trần khi đang dịch lại nghĩa, danh sách chương đang mở tải lại khi bố cục đổi.
- **Admin**:
  - `1c2e5ff` (backend, NEW-11): Nổi bật chỉ cho bộ công khai (gỡ / chuyển riêng tư bỏ cờ, bật cho bộ riêng tư → 400). Bản sửa đầu có
    tạo migration V29 (CHECK + UPDATE dữ liệu) — **đã bỏ** vì Supabase dùng chung (quyết định D7); quy tắc giữ ở tầng code.
  - `638b963` (backend): health ai-service có hạn chót 3 s cho cả lời gọi, kể cả DNS (lần chạy test đầy đủ bắt được DNS chậm ~11 s).
  - `faf028b`, `3b0bfcb` (frontend, NEW-08..12, NEW-16): mọi form admin báo lỗi tiếng Việt thay bong bóng tiếng Anh của trình duyệt
    (STAFF-12 còn sót), nhãn biểu đồ OCR / "Cơ cấu Bóc tách AI" không bị cắt, lời báo xử lý báo cáo, ô ngày Nhật ký chỉ lên URL khi
    gõ xong.
- **Người học** (`3b0bfcb`, NEW-14 / NEW-15): thẻ thư mục ở dashboard không tràn ở 1024 px; đăng xuất rồi đăng nhập tài khoản khác
  không vào trang riêng của người trước.
- **Test**: backend `mvn -B test` **510 / 69 lớp, 0 lỗi** (`4fce06b`); ai-service **1326 passed, 2 skipped, 1 xfailed**
  (`f1cdf53`); frontend lint + build + self-check xanh (`3b0bfcb`).
- **Còn mở** (chi tiết §7 của tài liệu tổng kết): thẻ rác khi bóc tách dòng "漢字 かな"; `failOrphans` (có từ trước) làm hỏng job của
  người khác trên DB dùng chung; giới hạn còn lại của tách chương (2 bài, khoảng trắng lẫn lộn, mục lục khi sách bắt đầu giữa chừng); LP-07 chưa kiểm trực tiếp (cần
  đổi đồng hồ); trước khi chạy V29 (nay là V29 của STAFF-07, mục chiều 20/10) phải kiểm Supabase không có dòng V29 / constraint
  `ck_decks_featured_public` từ bản V29 đã bỏ; dữ liệu cũ "bộ riêng tư mang cờ Nổi bật" không được dọn (admin bỏ cờ tay). Các mục
  "Còn mở" của 19/10: LC-04 backend, CSV JLPT, đổi vai trò vẫn mở; STAFF-07, `ai_model_primary`, spec LP-13 / LP-15, D4 **đã đóng
  chiều 20/10** (mục trên); mục "chưa kiểm trực tiếp sau khi khởi động lại" đã đóng.

## 19/10/2026 (khuya, tới 00:21 20/10): Khớp hợp đồng, đợt dọn, kiểm tay trên trình duyệt + sửa lỗi
Tổng kết và kế hoạch tiếp theo: [Progress/2026-10-19-tong-ket-va-ke-hoach.md](Progress/2026-10-19-tong-ket-va-ke-hoach.md). Mọi commit
vẫn chỉ ở local trên `backend-feature-learnmode` (chưa push). Không có migration mới (vẫn tới V28).

- **Khớp frontend – backend đợt 2** (`b6a01cf`):
  - `notificationService` thêm `MNEMONIC_REVIEWED` (dẫn tới `/kanji?k=`) và `LEARNING_PATH_READY / _FAILED / _REMINDER /
    _CHAPTER_PASSED / _COMPLETED` (dẫn tới `/roadmap/:id`). Trước đây các loại này rơi vào nhánh "Thông báo: <TYPE>", không có link.
  - Nhật ký admin có nhãn `QUESTION`, `MNEMONIC`, `KNOWLEDGE_SOURCE`, `APPEAL`.
- **Đợt dọn**:
  - `1d1c5e2` (ai-service): mọi item của `/extract/analyze` (từ vựng lẫn ngữ pháp, cả hai bố cục) trả công khai `docReading` /
    `docMeaningEn` / `docLevel` (`null` = tài liệu không ghi). Gửi lại nguyên các trường này cho `/extract/conflicts` thì ra cùng
    cảnh báo.
  - `d2c42c7` (frontend):
    - `apiErrorText` ưu tiên message thật của server, nên 409 của mẹo nhớ (trần 3 / 50), báo lỗi câu hỏi và câu nhiễu hiện đúng
      câu; riêng 503 vẫn dùng câu thân thiện.
    - Tài khoản đã tự xoá có nhãn "Đã xoá" và bị ẩn các thao tác; CSV thêm cột `da_xoa`.
    - Admin ở 375 px không còn tràn ngang.
  - `580568a` (backend):
    - `AdminUserResponse` luôn có `deleted`.
    - Tài khoản đã xoá trả 409 khi mở khoá / Premium / hạn mức / đổi vai trò. Với PATCH (mở khoá / Premium / hạn mức), quy tắc
      bậc (403) vẫn được kiểm trước. Với PUT đổi vai trò, trước 409 chỉ có bước chặn tự đổi chính mình (400); đổi vai trò không
      kiểm bậc.
    - Khiếu nại UNLOCK tài khoản đã xoá trả 409 và rollback, nên khiếu nại vẫn OPEN.
    - Đăng ký `*@deleted.local` trả 400.
  - `5172ddc` (README, `.env.example`, data README): danh sách tính năng, cách tải dữ liệu từ điển, SMTP và xác thực email.
  - Đóng được 3 mục "Còn mở" của đợt 2 backend (mục ngay dưới): `docReading` / `docMeaningEn`, mở khoá tài khoản đã xoá +
    `@deleted.local`, câu 409 của mẹo nhớ.
- **Kiểm tay trên trình duyệt**:
  - Cách chạy: ai-service :8000, backend profile e2e :8082 (Postgres nhúng), frontend :5173 với `BE_PORT=8082`; cấu hình ở
    `.claude/launch.json`, chưa commit.
  - Phạm vi: 1280 px và 375 px, đủ vai trò USER / ADMIN / SUPER_ADMIN.
  - Kết quả: **37 lỗi** gồm 12 LC (người học), 14 STAFF (admin), 11 LP (lộ trình); 4 lỗi major là LC-01, LC-02, STAFF-01, LP-01.
    Mã LP-01..11 ở đây là mã lỗi kiểm tay, **khác** LP-1..17 của spec.
  - `4e1143f` (frontend, 29 lỗi):
    - LC-04..12: chặn thêm thẻ trùng khi thêm từ Hán–Việt, ô vẽ Kanji đứng yên, chip chủ đề, Ctrl+K, nhãn i+1, bản đồ
      Hán–Việt hiện "+N từ", quiz báo số câu tối đa.
    - LP-03..07, 09..11: "Kiểm tra chương" mang `?path=`, "Học gì tiếp" tải lại, câu lỗi đúng chỗ, `no_api_key`, lý do "severe",
      chip "Đã hoàn thành", lỗi tại ô nhập.
    - STAFF-02..13: `/admin/account`, `PublicRoute` chờ hồ sơ, tab staff gộp ADMIN + SUPER_ADMIN, câu trạng thái, nhãn "Lý do
      khoá hiện tại", biểu đồ / bảng vừa khung, `/setup` kiểm mật khẩu 6–72.
    - Thêm `scripts/selfcheck/manual.ts`.
  - `538d2ab` (backend):
    - LP-01: bản nháp xem trước bằng đúng `plan()` của lúc kích hoạt.
    - LP-02: dự báo không đếm thẻ đã học trước là thẻ mới.
    - LP-08: tên chương "Ngày N" / "Tuần N (ngày a–b)" đi theo dải ngày và ghi xuống DB.
    - STAFF-01: CORS mặc định thêm `127.0.0.1` và `[::1]` cổng 5173; origin bị từ chối nhận 403 JSON tiếng Việt
      (`JsonCorsProcessor`).
    - STAFF-14: `PUT /api/admin/settings` kiểm mọi khoá ở service, lỗi 400 tiếng Việt nêu tên khoá.
  - `7cc8840` (ai-service):
    - LC-01: `han_viet_overrides.csv` thêm 726 mục cho mọi chữ trong từ vựng JLPT N5–N1.
    - LC-02: thêm `kanji_meanings.py` với thứ tự nguồn `kanji_meaning_overrides.csv` → `unihan_definitions.csv`
      (`build_dicts --only unihan_def`) → JMdict.
    - LC-03: 日本 đọc にほん; 日本 / 日本語 / 日本人 xếp N5.
  - Kiểm lại còn 4 lỗi, đã sửa:
    - `dc350b7` (frontend): LP-10 widget có chip "Đã hoàn thành" và badge bỏ lộ trình đã xong; NEW-01 `/quiz` gom vệt trang trí
      vào lớp `overflow-x-clip`; NEW-02 thẻ Thư viện ghi "★ x · n đánh giá", lượt tải ghi riêng.
    - `409f4b4` (backend): `GET /api/learning-paths/today-summary` thêm `completedAt` (NON_NULL) và `done`; lộ trình đã xong
      xếp cuối.
    - `467fd8e` (ai-service): LC-11 tách mục JLPT gộp nhiều biến thể ("高校; 高等学校", "行く" いく / ゆく…); thêm
      `jlpt_meaning_overrides.csv` (中学校, 辞典, ～人).
- **Test**:
  - Backend: `538d2ab` 496 test / 69 lớp, 0 lỗi; `409f4b4` LearningPathIT 44/44, LearningPathReminderJobTest 3/3.
  - ai-service: `7cc8840` 1290 passed; HEAD 1296 passed, 2 skipped, 1 xfailed.
  - Frontend: HEAD lint, build và self-check xanh (build có cảnh báo chunk 1,27 MB).
  - `mvn -B test` đầy đủ ở HEAD `467fd8e`: **497 test / 69 lớp, 0 failures, 0 errors, 0 skipped** (xong 00:21 ngày 20/10,
    26:42 phút). 490 ở `d7b9955` + 7 `@Test` thêm sau đó.
  - CI chưa chạy (chưa push).
- **Còn mở**:
  - Các bản sửa backend / ai-service chưa kiểm trực tiếp sau khi khởi động lại dịch vụ.
  - LC-04 phía backend (`DeckService.addCards` vẫn nhận thẻ trùng).
  - STAFF-07 (khiếu nại không lưu lý do khoá lúc gửi).
  - CSV JLPT còn cách đọc kèm する, dòng đảo cột, `下る さがる`.
  - `ai_model_primary` chưa có tác dụng.
  - Spec LP-15 chưa làm; spec LP-13 thiếu guard ở frontend.
  - D4 "nhắc làm lại nếu chưa đạt" chưa làm.
  - Đổi vai trò không kiểm bậc (SUPER_ADMIN đổi được vai trò SUPER_ADMIN khác): chủ ý hay lỗi chưa xác minh.
  - Danh sách đầy đủ ở tài liệu tổng kết §7; 37 lỗi kiểm tay ở §10.

## 19/10/2026 (khuya): Đợt 2 — backend (3 làn + tích hợp)
Hợp đồng: [Plan/specs/2026-10-19-hop-dong-api-dot-2.md](Plan/specs/2026-10-19-hop-dong-api-dot-2.md). Chỉ `backend-core`; ba làn làm song song
trong worktree rồi gộp `--no-ff` vào `backend-feature-learnmode` (không xung đột), sau đó một commit tích hợp. Migration V22–V28 (chỉ thêm).
- **Làn quiz** (`wave2/quiz`, §1 — C2, C3, C7, E6, G3; V22): quiz 5 loại (`meaning`, `kanji_lookalike`, `homophone`, `reading` tự gõ chuẩn hoá
  kana, `conjugation`) chọn qua `questionTypes`; `GET /api/decks/{id}/quiz-capabilities`, `POST /api/decks/{id}/distractors` (ai-service
  `/extract/distractors`, ngưỡng `distractor_min_confidence`); ngân hàng câu hỏi `quiz_questions` (dùng lại câu cũ, câu admin sửa giữ qua
  `extra.supersedes`, câu ẩn không bao giờ phát), báo lỗi câu `POST /api/quiz-questions/{id}/flags` (409 trùng, 429 > 20/giờ), admin
  `/api/admin/questions` + `/question-flags/{id}/resolve` có audit. Từ loại + phương án nhiễu đi theo bản sao (bóc tách, nhân bản, bổ khuyết).
- **Làn luyện tập + tài khoản** (`wave2/practice-auth`, §2, §3, §6, §7; V23, V24, V27): `/api/practice/*` (nét KanjiVG, chấm DTW, mẫu / chấm
  trọng âm, ghi phát âm, thống kê; âm thanh không lên server); xác thực email (đăng nhập 403 `EMAIL_NOT_VERIFIED`, gửi lại 5 lần / 15 phút,
  admin xác thực hộ, mail gửi SAU khi commit token, timeout SMTP mặc định); khiếu nại tài khoản bị khoá (`POST /api/auth/appeals` công khai
  202 chung, `/api/admin/appeals` resolve UNLOCK theo quy tắc bậc / dismiss; tài khoản đã tự xoá không khiếu nại / mở khoá được);
  `GET /api/reviews/activity` (ngày học, đến hạn hôm nay, thẻ mới, chuỗi ngày theo tz).
- **Làn nội dung** (`wave2/content`, §4, §5, §9; V25, V26, V28): mẹo nhớ bộ thủ (sinh qua ai-service / mẫu, người học tự viết; 10 lượt sinh
  / giờ, ≤ 50 PENDING / người; admin `/api/admin/mnemonics` duyệt / từ chối có thông báo `MNEMONIC_REVIEWED`; `/api/nlp/radicals/cards` trả
  mẹo đã duyệt); cảnh báo mâu thuẫn `extraction_items.conflicts` + "Kiểm tra lại" cho bóc tách / lộ trình (chỉ đánh giá lại trường tài liệu
  khai báo); nguồn tri thức chuẩn `/api/admin/knowledge-sources` (xoá: SUPER_ADMIN); câu ví dụ i+1 `/api/extractions/{id}/i-plus-one` (áp cho
  job lộ trình chỉ khi DRAFT).
- **Tích hợp**:
  - `GET /api/admin/stats` thêm `openQuestionFlags`, `pendingMnemonics`, `openAppeals` (hàm đếm của từng làn) và G6 §8: `ai.engines[]`
    `{engine, total, failed, lowConfidence, avgConfidence, avgSeconds}`, `ai.enrich {total, enriched, quota, error}`, `ocrSeries[]`
    `{date, ocrJobs, failed, lowConfidence, geminiFallback, errorRate}` (đủ `days` phần tử) — native query trên `extraction_jobs.text_meta` /
    `stats`, cửa sổ `days`, chỉ job DONE/FAILED; engine của dòng cũ suy từ `source_type`; OCR chỉ ảnh / PDF scan (bỏ `pdf-text`);
    `errorRate` 0..1, `null` khi ngày không có OCR.
  - `GET /api/admin/health` thêm `engines` (cờ boolean từ body `/api/extract/health`, `AiServiceClient.healthBody()` client 2 giây, một lời gọi
    cho cả `aiService`); ai-service tắt → `{}`. Hợp đồng §8 ghi rõ vị trí này (thống kê không chờ ai-service).
  - `Notification.MNEMONIC_REVIEWED` thay hằng riêng trong `MnemonicService` (các làn khác không thêm loại thông báo).
  - `AdminAuthorizationIT`: ma trận thêm 21 endpoint admin đợt 2 + `stats` / `health` (USER 403, không token 401, ADMIN được, xoá nguồn tri thức chỉ SUPER_ADMIN)
    + API học tập mới chặn staff. Hợp đồng §4 / §9 ghi thêm 429 / 409 của mẹo nhớ và 409 của i+1 trên lộ trình đã kích hoạt.
- **Test**: `AdminStatsIT` (+2: hàng đợi kiểm duyệt; engine / enrich / chuỗi OCR từ job chèn bằng JDBC, cửa sổ 30 / 90 ngày, ranh giới ngày
  VN; health `engines` rỗng khi ai-service tắt), `AdminStatsServiceTest` (+3), `AiServiceClientHealthTest` (+1).
  `mvn -B test`: **490 test, 0 lỗi** (DNS `ai-service.invalid` của máy đã nhanh lại nên `health_reports_ai_service_down_quickly` qua). Commit:
  làn `48c1a33`, `f125265`, `e0ce4d4`; merge `b1be63a`, `3cdebbd`, `0cde82f`; tích hợp `d7b9955`. Chưa push; worktree làn đã gỡ, nhánh giữ.
- **Còn mở**: ai-service chưa trả `docReading` / `docMeaningEn` trên item (nguồn chuẩn từ vựng chưa có cách đọc, "Kiểm tra lại" job mới
  không kiểm được gì); `PATCH /api/admin/users/{id} {locked:false}` vẫn mở khoá được tài khoản đã tự xoá, đăng ký vẫn nhận `@deleted.local`;
  race hẹp khi admin sửa câu hỏi đúng lúc một lượt quiz đang sinh; đếm `conjugation` có thể dư với danh từ không có `pos` tận cùng hàng う;
  frontend coi mọi 409 khi gửi mẹo là "đã có 3 mẹo chờ duyệt cho chữ này" nên 409 mới (đủ 50 mẹo PENDING / người) hiện sai câu, chưa kiểm frontend hiện 429 / 409 của sinh mẹo và 409 của i+1 ra sao; chưa kiểm tay trọn luồng với ai-service thật.

## 19/10/2026 (khuya): Đợt 2 — giao diện (frontend)
Hợp đồng: [Plan/specs/2026-10-19-hop-dong-api-dot-2.md](Plan/specs/2026-10-19-hop-dong-api-dot-2.md). Chỉ `frontend/`; endpoint chưa có trên máy chủ
(404 "No static resource…" / 405 / 501) hiện câu bình tĩnh "Tính năng đang được cập nhật trên máy chủ…" thay vì lỗi đỏ.
- **Frontend đợt 2**: quiz đa loại + báo lỗi câu hỏi, admin `/admin/questions` (G3); luyện viết chữ Hán / phát âm + tab thống kê luyện tập
  (§2); xác thực email + khiếu nại khoá tài khoản (§3, §6); mẹo nhớ chữ Hán / bộ thủ phía người học và trang duyệt `/admin/mnemonics` (§4);
  nguồn tri thức `/admin/knowledge`, mâu thuẫn + "Kiểm tra lại" và câu i+1 trên trang bóc tách / bản nháp lộ trình (§5, F2); dashboard
  AI + biểu đồ OCR, cấu hình 13 khoá (§8, WP-G5); `/kanji`, `/han-viet`, tab "Phản xạ chậm". Self-check: `runAdminChecks`,
  `runQuizChecks`, `runPracticeChecks`, `runLearnerChecks`. 0 dependency mới.
- **Sửa sau rà soát**: `/admin` trắng trang (TDZ `ctx` trong `useGsap`; khung admin thêm `AdminErrorBoundary`); bảng admin và bảng
  `sr-only` của biểu đồ không còn nới rộng trang ở 375 px (`relative` trên vùng cuộn của `AdminTableShell`, `sr-only` đặt trên div bọc);
  khiếu nại của tài khoản đã xoá (trường vắng do NON_NULL) chuẩn hoá về null; một nguồn "chưa có endpoint" `lib/apiErrorInfo` (404 nghiệp
  vụ như báo lỗi câu của thẻ đã xoá giờ hiện đúng lỗi server); "Kiểm tra lại" khi máy chủ chưa có endpoint báo trung tính `role="status"`;
  nhãn nút "Xử lý / Chi tiết" khớp chữ hiển thị (WCAG 2.5.3); trang mẹo nhớ / khiếu nại dùng số việc chờ của `AdminLayout` (không gọi
  `/admin/stats` lần hai); tách `QuizPage` (màn bắt đầu, xem lại, `useTypingAutosave`) và `AdminQuestionDetail`; bỏ export chết.
  `npm run lint && npm run build && node --experimental-strip-types scripts/selfCheck.ts` xanh; chưa kiểm tay với backend thật.

## 19/10/2026 (đêm): Lộ trình 2.0 — điểm yếu, bổ khuyết, nhắc học (backend) + sửa sau rà soát
Spec §3.7–3.9, §4.2, §4.4 · tài liệu: [LEARNING_PATH.md](LEARNING_PATH.md) mục 11. Chỉ backend; mọi endpoint / trường cũ giữ nguyên.
- **API mới `/api/insights`** (USER): `GET /weaknesses?days=` (4 tín hiệu `lapses` / `low_ease` / `slow` / `quiz_wrong`, chỉ bộ còn xem
  được, gom theo cấp / loại / chữ Hán / bộ, `canRemedial`, `suggestedDays`), `GET /friction` (thẻ phản xạ chậm), `GET /next?date=` ("học gì
  tiếp": `path_today` → `due` → `catchup` → `remedial` → `next_chapter` → `library`).
- **`POST /api/learning-paths/remedial`** `{days 3..30, groupBy level|kind|kanji|deck, title?}` → lộ trình ACTIVE `source_type=remedial`
  từ ≤ 150 thẻ yếu nhất (< 8 → 409), mỗi nhóm một chương + bộ thẻ clone trong thư mục "Bổ khuyết dd/MM/yyyy"; không job, không hạn mức.
- **Nhắc học** `LearningPathReminderJob` → `LEARNING_PATH_REMINDER` (chỉ trong app), tối đa 1 lần / lộ trình / ngày nhờ
  `learning_paths.last_reminded_on` (V21, `ADD COLUMN IF NOT EXISTS`).
- **Sửa sau rà soát**:
  - Job nhắc không còn một giao dịch dài sửa entity đã nạp từ đầu lượt (UPDATE cả dòng từ bản cũ đè PATCH `reminder` / `dailyCap` /
    `totalDays`, reset `completedAt`, xoá lộ trình giữa lượt → `StaleStateException` rollback nhắc của mọi người): giờ mỗi người dùng một
    giao dịch, lộ trình được giành bằng `claimReminder` (UPDATE có điều kiện chỉ cột `last_reminded_on`). Lỗi một người không hỏng cả
    lượt; job chạy bù các giờ sau giờ cấu hình trong ngày; lộ trình kích hoạt sau giờ nhắc được nhắc từ hôm sau. Cron đọc
    `app.learning-path.reminder-cron` (test đặt `-` để cron thật không chạy giữa IT).
  - `/next` mục `due`: thẻ của lộ trình đã chốt hoàn thành (vẫn status ACTIVE) / chưa bắt đầu không còn biến mất khỏi mọi gợi ý; chỉ đếm
    thẻ trong bộ còn xem được (bộ bị thu hồi chia sẻ không còn kẹt số đến hạn). Mục `library` bỏ cả bộ public đã học trực tiếp.
  - `/friction` dùng đúng quy tắc §3.7 như lý do `slow`: > 4 000 ms **và** > 2 × trung vị cá nhân (trước là "hoặc", hai trang bất đồng).
  - `suggestedDays` tính trên 150 thẻ lộ trình bổ khuyết sẽ lấy (trước tính trên cả 500 thẻ → gợi ý quá dài).
  - Câu practice bấm "Bỏ qua câu này" tính là sai quiz (khớp việc đã chấm sai + ghi "again"); Javadoc / tài liệu sửa theo.
- **Test**: `InsightIT` (6: thêm cửa sổ `days` + mốc 14 ngày, bỏ trống exam / practice, trần 150 thẻ, biên ma sát cho 3 kiểu trung vị
  cá nhân, lộ trình đã hoàn thành trong `/next`, bộ Thư viện đã học), `LearningPathIT` (+ `remedial` gom theo bộ / loại, chủ đề bộ, SRS
  thẻ gốc), `LearningPathReminderJobIT` (3: giờ cấu hình 9, chạy bù, before / rest / after, kích hoạt sau giờ nhắc),
  `LearningPathReminderJobTest` (mới, unit), `InsightGroupingTest` (khẳng định chính xác nhóm tràn vào "Khác"), `NlpIT` (+ 422 → 400, 403 → 503).

## 19/10/2026 (tối): WP-G5 tham số AI + proxy tra cứu NLP — backend
- **Dữ liệu** (`V21__ai_settings_and_reminder.sql`, cộng dồn): ngoài `learning_paths.last_reminded_on`, tạo lại CHECK khoá `app_settings`
  (tra `pg_constraint` như V20) và seed 6 khoá: `ocr_fallback_confidence` 0.85, `ocr_low_line_confidence` 0.75, `distractor_min_confidence` 0.6,
  `contradiction_alert_threshold` 0.7, `ai_model_primary` "" (ai-service tự chọn), `email_verification_required` true (D2; gói xác thực email đọc sau).
- **Cấu hình** (`GET/PUT /api/admin/settings`): trả và nhận đủ 13 khoá (tên JSON = tên khoá); PUT vẫn chỉ SUPER_ADMIN, đòi mọi khoá, kiểm
  khoảng khoá V20/V21 ở `SettingsService.update` (400 tiếng Việt nêu tên khoá, gom nhiều lỗi), chỉ ghi + audit khoá đổi; số thực lưu dạng gọn
  ("0.85", "1"). `SettingsService.getDouble(key)` / `getDouble(key, fallback)`.
- **Bóc tách**: `textMeta.lowLines` lọc theo `ocr_low_line_confidence` (đọc lúc trả response, cả trang admin; hỏng → hằng 0.75);
  `ExtractionService.startJob` đọc `ocr_fallback_confidence` (hỏng → 0.85, kẹp 0..1) → `ExtractionWorker` → `AiServiceClient.extractText(..., ocrFallbackConfidence)`
  gửi field `ocr_fallback_confidence` sang `/api/extract/text`; ngưỡng đã dùng ghi ở `textMeta.ocrFallbackConfidence`.
- **API mới `/api/nlp`** (USER; staff 403): `GET /han-viet-graph?reading=&level=&limit=`, `GET /han-viet-suggest?q=&limit=`,
  `POST /kanji-cards {kanji, userLevel?}`, `GET /radicals`, `GET /radicals/{no}/kanji?levels=`, `POST /radicals/cards {kanji, withMnemonic}`
  (withMnemonic luôn false tới khi có kiểm duyệt mẹo nhớ). Trả nguyên JSON ai-service; GET cache 10 phút / 500 mục dùng chung; ai-service
  400/422 → 400, 404 → 404, còn lại (kể cả 401 sai khoá nội bộ) → 503.
- **Test**: `AdminSettingsIT` (13 khoá, ST-06/08–11), `ExtractionIT.ocr_thresholds_come_from_settings`, `NlpIT`, `AiServiceClientNlpTest`, `TtlCacheTest`.

## 19/10/2026 (chiều): Lộ trình học tập 2.0 — backend
Spec: [Plan/specs/2026-10-19-lo-trinh-hoc-tap-2-design.md](Plan/specs/2026-10-19-lo-trinh-hoc-tap-2-design.md) · tài liệu: [LEARNING_PATH.md](LEARNING_PATH.md) (mục 5 bảng API + mục 9).
Chỉ backend (`backend-core`); frontend 1.0 vẫn chạy nguyên vì mọi trường / endpoint cũ giữ nguyên, trường mới null bị bỏ (NON_NULL).
- **Dữ liệu** (`V20__learning_paths_v2.sql`): bảng `learning_path_cards` (lịch **theo thẻ**: `seq`, `scheduled_day`, `weight`, CASCADE theo
  thẻ / chương / lộ trình — LP-5); `learning_paths` thêm `daily_cap` (5–200, mặc định 50), `study_days` (mask T2..CN), `reminder`,
  `completed_at`, `last_rebalanced_at`, `source_type` nhận `remedial`; `learning_path_chapters` thêm `quiz_best_pct`, `quiz_passed_at`;
  `review_logs` thêm `reaction_ms`, `path_id`; `app_settings` thêm `learning_path_daily_cap_default` (50), `learning_path_quiz_pass_pct` (80),
  `learning_path_reminder_hour` (7). CHECK của V13 / V14 được tra theo `pg_constraint` nên chạy được cả Postgres nhúng lẫn Supabase.
- **Thuật toán** (`LearningPathScheduler`, thuần): `weight` (cấp thẻ so với trình độ, ngữ pháp +0.2), `plan` (chia theo thẻ với quota chạy,
  trần **tải** = mới + 0.9 × ôn dự báo, gộp chương nhỏ, nới quota ×1.15 tối đa 10 vòng, `overflow`), `forecast` (sóng ôn 1/3/7/17/40 ngày,
  lịch thật cho thẻ đã học), `rebalance` (không nợ = không đổi; `extend`), `replan` (đổi khung lịch: chỉ thẻ chưa học), `dateForDay` /
  `dayIndexFor` theo mask ngày nghỉ, `suggestDays` (số ngày nhỏ nhất mà lịch phẳng không vượt trần, 3–90).
- **API `/api/learning-paths`** (mọi endpoint ghi nhận `?date=` của máy khách, LP-11; mọi thao tác ghi khoá dòng `FOR UPDATE`, LP-13):
  `POST /` thêm `dailyCap?`, `studyDays?`; `GET /` một truy vấn batch (LP-7) + `today{newCount, dueCount, behindCount}` + `completion`;
  `GET /today-summary` (widget Tổng quan / badge, LP-16); `GET /{id}` thêm `completion`, `chapters[].{learned, mastered, state, quizBestPct,
  quizPassedAt}`, `today.state = rest`, `tasks[].cardIds`, `forecast[]`, bản nháp có `suggestedDays` / `overCap`; `PATCH /{id}` thêm
  `dailyCap / studyDays / reminder`, ACTIVE đổi khung → xếp lại thẻ chưa học; `POST /{id}/activate` ghi `learning_path_cards`;
  **mới**: `GET /{id}/session?kind=today|catchup|due|chapter` (phiên hợp nhất: đến hạn → nợ → mới, `mode` từng thẻ), `POST /{id}/rebalance`,
  `POST /{id}/retry` (FAILED chạy lại từ ANALYZE, **không tốn lượt**, LP-6), `POST /{id}/enrich` (dịch lại nghĩa, cooldown 5 phút),
  `POST /{id}/chapters/{cid}/quiz` (bài kiểm tra chương = quiz exam min(10, số thẻ)), `POST /{id}/complete`. `DELETE /{id}`: PROCESSING →
  409, giữ dòng job ở `CANCELLED` (xoá trắng văn bản) để không hoàn lượt hạn mức (LP-10); `create()` bọc một giao dịch cho cặp job + path.
- **Liên quan**: `POST /api/reviews` nhận `reactionMs?` (0–600000) và `pathId?` → `review_logs` (không đổi SRS); `QuizAttemptService.close()`
  phát `QuizSubmittedEvent` → `quizBestPct` / `quizPassedAt` + thông báo `LEARNING_PATH_CHAPTER_PASSED` (chỉ exam đủ cỡ);
  thông báo `LEARNING_PATH_READY / FAILED / COMPLETED` (kể cả FAILED do khởi động lại); Housekeeping không xoá job lộ trình (LP-1), chỉ xoá trắng
  `extracted_text` khi ACTIVE > 90 ngày và dọn job mồ côi; `nightly()` có `@Transactional` (trước đây `run()` gọi từ `this` không có giao
  dịch); `GET /api/admin/stats` thêm `learningPathBreakdown{active, completed, failed, remedial, draft}`; `ExtractionService.deleteJob`
  cho xoá job lộ trình mồ côi sau 24 giờ.
- **Test**: `LearningPathSchedulerTest` (44, S-01…S-05), `LearningPathIT` (37: IT-01…IT-04, LP-7/10/11/13, session / rebalance / retry /
  enrich / quiz / complete / khởi động lại), `LearningPathCardRepositoryIT`, `HousekeepingIT` (IT-05), `ReviewSrsIT` (reactionMs),
  `AdminStatsIT` (breakdown); `AdminSettingsIT.migration_seeds_exactly_seven_rows` cập nhật theo 3 khoá mới. Toàn bộ: `mvn test` 19/10 (14:39–14:51, 12 phút 43 s): **292 test / 44 lớp**, 1 lỗi duy nhất là `AdminSettingsIT` ST-08 (đếm 4 dòng `app_settings`, V20 thêm 3 → 7) đã sửa như trên; chạy lại lớp đó 9/9 xanh → 292/292, 0 lỗi, 0 bỏ qua.
- **Chưa làm trong đợt này** (phần còn lại của spec 2.0): `InsightService` + `/api/insights/{weaknesses, friction, next}` (§3.7, §3.9),
  lộ trình bổ khuyết `POST /remedial` (§3.8; DB đã nhận `source_type = remedial`), job nhắc `LEARNING_PATH_REMINDER` (§4.4, loại thông báo đã
  khai báo), 3 khoá lộ trình trên `/api/admin/settings` (`SettingsResponse` vẫn 4 khoá — sửa qua DB), LP-17 (ai-service). Giao diện (§6) ở mục ngay dưới.

## 19/10/2026: Lộ trình học tập 2.0 — giao diện (frontend)
Spec: [Plan/specs/2026-10-19-lo-trinh-hoc-tap-2-design.md](Plan/specs/2026-10-19-lo-trinh-hoc-tap-2-design.md) · tài liệu: [LEARNING_PATH.md](LEARNING_PATH.md) mục 10.
- **Frontend**: route `/session` (phiên hợp nhất `today|catchup|due|chapter`, hàng đợi đa bộ thẻ, chip Mới/Ôn/Luyện, đo thời gian
  phản xạ → `reactionMs` + `pathId`, luyện phát âm / viết ngay trên thẻ); trang ACTIVE dựng lại (`ProgressSummary`, `BehindBanner`,
  `TodaySessionPanel`, `WorkloadChart`, `ChapterTimeline` + kiểm tra chương, `PathSettingsDrawer`); bản nháp có gợi ý số ngày / trần /
  ngày học / "Dịch lại nghĩa"; FAILED có "Chạy lại"; widget "Lộ trình hôm nay" + badge sidebar qua `useTodaySummary` (`/today-summary`).
  0 dependency mới; `npm run lint && npm run build && npm run selfcheck` xanh.
- Sửa sau review (cùng ngày): mốc tối thiểu số ngày trong Cài đặt tính như `placeFrom` server (`replanFromDay`, theo ngày bắt đầu /
  ngày học đang chọn); poll trang chi tiết đi qua cùng `refreshSeq` với tải lại sau ghi; "Dịch lại nghĩa" nhận cả job FAILED còn item
  và chỉ đếm ngược theo `enrichedAt`; modal tạo không gửi `dailyCap` khi để trống (dùng mặc định quản trị); phiên chương thêm "Luyện n"
  và tiêu đề kết thúc theo loại phiên; "Học bù (n)" trên widget ngày nghỉ; `MAX_REACTION_MS` một nguồn ở `lib/srs.ts`; `dayIndexFor`
  nhận mặt nạ ngày học; bỏ `pathProgress` / `unreviewedInTasks` / `minDaysForActive` không còn dùng. Chưa kiểm tay 375 px (cần backend).

## 17/10/2026: Admin Panel (UC-38, UC-39, UC-41, UC-42)
Spec: [Plan/specs/2026-10-17-admin-panel-design.md](Plan/specs/2026-10-17-admin-panel-design.md) · plan: [Plan/plans/2026-10-17-admin-panel.md](Plan/plans/2026-10-17-admin-panel.md).
- **Vai trò**: `USER` (người học) + staff `ADMIN` / `SUPER_ADMIN` (`RoleHierarchy`). Một tài khoản một vai trò: staff gọi API học
  tập bị 403, người học không vào `/api/admin/**`. Khoá tài khoản (`users.locked_at`) chặn ở đăng nhập, JWT filter và refresh.
  `AuthResponse` có `role`; `@PreAuthorize` từ chối → 403 (trước đây sẽ thành 500).
- **Backend** (`V14__admin_panel.sql`): `app_settings` (hạn mức bóc tách free/premium **đổi lúc chạy**, thông báo hệ thống,
  mở/đóng đăng ký; bỏ property `app.extraction.daily-limit.*`), `users.extraction_daily_limit` (hạn mức riêng), `content_reports`
  (1 báo cáo OPEN / người / bộ thẻ, 10 báo cáo / giờ), `admin_audit_logs` (mọi thao tác ghi, cùng transaction).
  API: `/api/admin/stats|health|users|decks|ratings|extractions|reports|audit-logs|settings`, `/api/announcement`,
  `POST /api/library/decks/{id}/reports`. Gắn featured mới tự bỏ cờ bộ cũ (DB chỉ cho một bộ nổi bật); xoá job đang chạy → 409.
- **Frontend**: `AdminLayout` riêng (`/admin/*`, 8 trang: tổng quan với biểu đồ CSS, người dùng + chi tiết, nội dung 3 tab + chi tiết
  bộ thẻ, báo cáo + modal xử lý, nhật ký, cấu hình), đăng nhập điều hướng theo vai trò, nút "Báo cáo" trên bộ thẻ public,
  banner thông báo trong `AppLayout`. 0 dependency mới.
- **Sao lưu**: `scripts/backup.ps1` / `backup.sh` (pg_dump custom, giữ 14 bản), quy trình khôi phục và tạo Super admin đầu tiên
  trong [SUPABASE_SETUP.md](SUPABASE_SETUP.md).
- Test: `AdminAuthorizationIT` (ma trận vai trò × endpoint), `AccountLockIT`, `AdminUserIT`, `AdminContentIT`, `ContentReportIT`
  (kể cả 2 admin xử lý cùng lúc), `AdminSettingsIT`, `AdminStatsIT`, `AdminAuditIT`, `AdminStatsServiceTest`; selfcheck `roles.ts`,
  `adminUtils.ts`. `mvn test`: 216 test xanh.
- Review toàn nhánh (reviewer độc lập) tìm 2 lỗi đã sửa cùng ngày: `/api/admin/health` thiếu `X-Internal-Key` nên luôn báo AI
  "down" khi có `AI_SERVICE_KEY` (`AiServiceClientHealthTest`); lọc nhật ký theo ngày dùng nửa đêm UTC thay vì giờ VN (`AdminAuditIT`).
  Thay đổi phụ cho người học: `DELETE /api/extractions/{id}` với job đang chạy nay trả 409 (UI đã ẩn nút từ trước).
- **Chiều 17/10: bỏ vai trò VIEWER** (còn `USER / ADMIN / SUPER_ADMIN`; `/api/admin/**` cần ADMIN; `@PreAuthorize` chỉ còn cho đổi vai trò và sửa cấu hình). V14 chưa chạy trên Supabase nên sửa thẳng CHECK trong V14.
- `V15__seed_admin_accounts.sql`: 2 tài khoản khởi tạo `superadmin@nihongen.local` / `superadmin` (SUPER_ADMIN) và `admin1@nihongen.local` / `admin1` (ADMIN); đổi mật khẩu sau lần đầu đăng nhập.
- **Việc cần làm khi deploy**: sao lưu DB, kiểm `SELECT email, role FROM users WHERE role <> 'USER'` trước V14, tạo tài khoản
  admin riêng rồi `UPDATE users SET role = 'SUPER_ADMIN' …`. Giao diện admin chưa kiểm tay trên trình duyệt trong đợt này.

## 14/10/2026: Lộ trình học tập từ tài liệu (UC-37, bản theo tài liệu)
Spec: [Plan/specs/2026-10-14-lo-trinh-hoc-tap-design.md](Plan/specs/2026-10-14-lo-trinh-hoc-tap-design.md) · tài liệu: [LEARNING_PATH.md](LEARNING_PATH.md).
- **ai-service**: `extract/chapters.py` (tách chương theo `第N課` / `Unit N` / heading DOCX), `pipeline.analyze` nhận
  `splitChapters` (phân tích từng chương, gộp trùng; `item.chapter`, `stats.chapters`, `stats.chaptersDetected`), `/text` trả `blocks[].heading`.
- **Backend**: `V13__learning_paths.sql` (`learning_paths`, `learning_path_chapters`, `extraction_jobs.purpose`,
  `extraction_items.chapter_no/chapter_id`); `LearningPathService`, `LearningPathScheduler` (chia ngày, hàm thuần),
  `ExtractionJobFinishedEvent`, `LearningPathController` (`/api/learning-paths`: tạo, danh sách, chi tiết, sửa, gộp chương,
  bỏ thẻ, kích hoạt, xoá). Job lộ trình ẩn khỏi `GET /api/extractions`; `DELETE /api/extractions/{id}` → 409 với job này.
- **Frontend**: trang `/roadmap` thay hẳn bằng danh sách lộ trình + modal tạo; `/roadmap/:id` (đang xử lý / bản nháp / đang học
  với "Hôm nay" và nợ); `StudyPage` nhận `?range=a-b&path=`; tách dùng chung `SourceFields`, `ExtractionOptionsFields`, `LevelBadge`.
- Test: `LearningPathSchedulerTest`, `LearningPathIT`, `test_chapters.py`, `roadmapUtils` (selfcheck), `smoke-learning-path.mjs`
  (thêm vào `npm run e2e`).
- **Kiểm thử thật (Chrome + ai-service thật) với văn bản mẫu và PDF scan Nihongo Soumatome N2 Goi (trang 1–18)** → báo cáo
  [Plan/reports/2026-10-14-kiem-thu-lo-trinh.md](Plan/reports/2026-10-14-kiem-thu-lo-trinh.md). Lỗi tìm thấy và sửa cùng ngày:
  - Gemini treo/quá tải làm job FAILED dù dịch nghĩa không fatal → ngân sách 150 s, bọc `RestClientException`, `enrich` bắt `RuntimeException`.
  - OCR 18 trang scan vượt 3 phút khi Gemini hết quota → model chính hết quota thì đi thẳng model dự phòng 2 phút; cả hai hỏng thì tạm ngưng Gemini 2 phút.
  - Gemini Vision sinh 50 000 dấu chấm dẫn ở trang mục lục → gộp ký tự lặp, từ chối bản Gemini phình bất thường.
  - Tách chương: thêm `N日目` / `第N週`; bỏ mục lục (kể cả OCR 2 mục/dòng), lời nói đầu, cách dùng sách, hộp ví dụ trước bài 1,
    phụ lục; `stats.skippedSections` → bản nháp hiện "Đã bỏ qua: …".

## 14/10/2026: Cập nhật tài liệu cho đợt "Bóc tách AI" (chưa đổi code)
- Cập nhật `README.md` (cài ai-service, Tesseract, `build_dicts.py`, `.env`), `EXTRACTION.md`, `CODEBASE_MAP.md`,
  `TEAM_GUIDELINES.md`, `USE_CASES_CHECKLIST.md`; thêm [Plan/README.md](Plan/README.md) làm mục lục spec / kế hoạch.
- **Trạng thái các spec trong `docs/Plan/`**: `trich-xuat-cum-tu` đã làm (xem mục 12/10 bên dưới); `dich-nghia-offline` đã thử
  rồi **hoàn tác** (xem ngay dưới); 3 spec ngày 13/10 (thanh tiến trình, giao diện trang `/extractions`, kết quả kiểu "Sửa bộ
  thẻ") **mới là thiết kế, chưa triển khai, chờ duyệt**.

## 12/10/2026: Thử dịch nghĩa offline (NLLB + CTranslate2) rồi HOÀN TÁC
- Đã dựng thử engine dịch EN → VI offline thay Gemini ở bước ENRICH, sau đó **gỡ hoàn toàn theo yêu cầu**: không còn
  `translator.py` / `tm.py` / `enrich.py`, không thêm `ctranslate2` / `sentencepiece` vào `requirements.txt`, không có
  `--models` trong `build_dicts.py`. Bước ENRICH vẫn là Gemini (kèm thử lại + `GEMINI_FALLBACK_MODEL`, mục bên dưới).
- Còn lại duy nhất: spec + kế hoạch trong `docs/Plan/` (đánh dấu "đã hoàn tác") và hai dòng `.gitignore`
  (`app/extract/data/models/`, `translations.sqlite`) để file model / bộ nhớ dịch còn trên máy dev không bị commit nhầm.
  Xoá thư mục `ai-service/app/extract/data/models/` (≈ 600 MB) nếu cần giải phóng ổ đĩa.

## 12/10/2026: Bảng / danh sách từ vựng → trích theo **cụm**, dùng nghĩa in sẵn; dự phòng khi Gemini hết quota
Spec: [Plan/specs/2026-10-12-trich-xuat-cum-tu-design.md](Plan/specs/2026-10-12-trich-xuat-cum-tu-design.md).
- **ai-service** `extract/entries.py` (mới): `parse_line` tách mỗi dòng thành cụm + nghĩa (TAB / `｜` / ` - ` / `：` /
  ranh giới chữ viết; cột cụm = cột đầu tiên có tiếng Nhật nên `nghĩa<TAB>cụm` vẫn chạy; cột toàn kana → cách đọc
  cho bảng 3 cột; khai triển `A[B/C`; bỏ `↔ (N)`, bullet, chú thích `＊ ※`; gloss Trung/Hàn bỏ — chữ Hán không có cách
  đọc tiếng Nhật trong Unihan); `detect_layout` nhận dạng `list` / `prose` (câu ví dụ song ngữ `…です。 I am…` vẫn là
  `prose`; `auto` mà `list` không ra mục nào thì rơi về `prose`).
- Sau review: "Dịch lại nghĩa" thành công thì xoá `stats.enrichReason` cũ (trước đây banner hết quota hiện mãi).
- Sửa sau khi chạy thật (Gemini `gemini-3.7/3.8-flash` quá tải, job rơi về bản Tesseract rác): (1) gloss chỉ được nhận khi có
  ít nhất một từ tiếng Anh thật (wordfreq zipf ≥ 3) — bỏ "el", "ME", "OO pm fd 24" từ dòng Tesseract; (2) mã 504
  `DEADLINE_EXCEEDED` cũng thử lại rồi sang `GEMINI_FALLBACK_MODEL` như 503; đo 12/10: `gemini-3.5-flash-lite` trả đúng
  định dạng trong 2 s nên dùng làm model dự phòng. Thứ tự OCR không đổi: Tesseract trước, Gemini chỉ khi conf < 0,85.
- `pipeline.py`: tuỳ chọn `extractMode` (`auto|list|prose`), `stats.layout`; nhánh `list` không tách từ bên trong cụm,
  không ngữ pháp, `pos = 句`, cấp = cấp khó nhất của từ bên trong (`jlpt.phrase_level`, `levelSources[0] = phrase:<từ>`),
  nghĩa EN/VI in sẵn → `meaningEn` / `meaningVi` (VI có dấu mới nhận). Ảnh bảng "ngân hàng" thật: 20 cụm đúng như bảng
  (trước: 36 từ rời + 2 ngữ pháp, chú thích bị tách thành 4 từ).
- `gemini.py`: prompt Vision xuất bảng từ vựng dạng `cụm<TAB>nghĩa`; prompt dịch giữ sát nghĩa gốc; thử lại 429/503
  (2/4/8 s) rồi `GEMINI_FALLBACK_MODEL` (env mới, tuỳ chọn); hết lượt vẫn giữ `reason = quota`.
- **Backend**: `ExtractionOptions.extractMode`; `POST /api/extractions/{id}/enrich` chạy lại riêng bước dịch cho item
  chưa có nghĩa VI (không phân tích lại, không tính hạn mức ngày, cách nhau ≥ 5 phút → `stats.enrichedAt`).
- **Frontend**: ô "Bố cục tài liệu" trong modal tải lên; huy hiệu "Nhận dạng: danh sách từ vựng" và nút "Dịch lại nghĩa"
  trên trang kết quả khi `enrichReason` là `quota` / `error`.
- Test: `test_entries.py` (mới, 11), `test_pipeline.py` +5, `test_classifier.py` +2, `test_gemini.py` +5, `test_router.py` +1,
  `test_vision_fixture.py` (chạy thật khi `RUN_GEMINI_TESTS=1`, fixture `tests/fixtures/vocab_table.png`), `ExtractionIT` +2.

## 11/10/2026: Thẻ sạch hơn khi nguồn là OCR (ảnh bảng song ngữ), PDF có chữ không bị OCR nhầm
- **PDF** `readers/pdf_reader.py`: chỉ OCR khi text layer gần như rỗng (< 30 ký tự/trang). Trước đây PDF tiếng Việt/Anh có
  chữ thật (tỉ lệ chữ Nhật < 20%) bị coi là scan và OCR bằng `jpn` → văn bản rác.
- **Ví dụ trên thẻ** `pipeline.py`: với dòng OCR, ví dụ = cụm tiếng Nhật liền mạch quanh từ (cắt ở chữ Latin / ký hiệu /
  chữ số ASCII); bỏ nếu cụm ≤ từ + 1 ký tự hoặc dòng conf < 0.40; lần đầu không có ví dụ thì lấy ở lần xuất hiện sau. Ngữ
  pháp lấy cụm dài nhất của dòng. Văn bản thường / DOCX / PDF có chữ giữ nguyên câu như cũ.
- **Mục đáng ngờ** (`suspect`, chỉ OCR): không có nghĩa trong từ điển, từ 1 ký tự trên dòng conf < 0.75, hoặc không rõ cấp
  JLPT trên dòng conf < 0.60 → backend lưu `selected=false` (vẫn hiện, tick lại được). Ảnh bảng song ngữ thật: 84 từ,
  34 chọn sẵn (trước: 91 từ chọn hết, gồm 具 / 戸 / 肌 / 逝得…).
- **OCR** `image_reader.py`: chèn khoảng trắng giữa hai từ Latin liền nhau ("met money from your account" thay vì
  "metmoneyfrom…"); CER bộ tổng hợp không đổi (0.044). Thử lại `jpn+eng` trên ảnh thật: chữ Anh tốt hơn nhưng mất chữ Nhật
  (を, 人) → vẫn loại.
- **Báo lỗi Gemini**: `textMeta.geminiError` (chỉ có khi OCR kém mà Gemini không chép lại được) và `stats.enrichReason`
  hiện thành cảnh báo trong `ExtractedTextPanel` (vd. "AI (Gemini) đã hết hạn mức…").
- Test: `test_pipeline.py` +6, `test_image_reader.py` +2, `test_pdf_reader.py` +1, `ExtractionIT` kiểm tra `selected=false`.

## 10/10/2026: Nâng độ chính xác OCR ảnh / PDF scan (UC-05, 07, 17)
- **ai-service** `readers/image_reader.py` (chỉ Pillow + numpy, không thêm thư viện): flatten PNG trong suốt lên nền trắng;
  khử bóng đổ (`_flatten_background`); deskew ±5° (projection profile, có biên 1.2× tránh xoay nhầm chữ dọc); hỏi OSD xoay
  90/180/270 khi cả hai lượt đọc đều kém; điểm chọn hướng phạt dòng < 8 ký tự; 2 lượt `jpn`/`jpn_vert` và 3 trang PDF chạy
  song song (20 trang: 44 s → 22 s); lọc furigana bỏ dấu câu trước khi xét kana-only; NFKC cho text OCR; Gemini nhận ảnh
  đã tiền xử lý, kết quả Gemini `meanConfidence=null` và `lowConfidence=true` nếu độ dài lệch > 3× bản Tesseract.
- **Đo**: `ai-service/scripts/ocr_eval.py` (ảnh tổng hợp 12 nhóm, CER / tỉ lệ Gemini / thời gian / vocab F1; `--gemini`,
  `--real DIR`, `--set`). Chỉ Tesseract: CER 0.355 → 0.095; có Gemini ≈ 0.05. Bảng từng bước và các thử nghiệm bị loại
  (`jpn+eng`, `--oem 1`, Otsu, psm 3/4/11, dừng sớm) ở [EXTRACTION.md](EXTRACTION.md) §6. Chưa xử lý được trang ngang 2 cột
  (Tesseract gộp 2 cột thành một dòng; Gemini đọc đúng).
- **Tách 2 cột**: rãnh trắng dọc ≥ 1.5 dòng ở giữa trang → OCR từng nửa, nối trái → phải (two_col CER 0.58 → 0.03;
  Tesseract tự nó gộp 2 cột thành 1 dòng ở mọi psm).
- **Soát dòng nghi sai**: ai-service trả `blocks[].lines[] = {text, conf}`; backend (`ExtractionJobResponse`) rút
  `textMeta.lowLines` (conf < 0.75, ≤ 50 dòng) thay vì gửi cả `blocks`; FE `ExtractedTextPanel` liệt kê, bấm vào là bôi
  đen đúng dòng trong ô văn bản để sửa rồi "Phân tích lại".
- **API đổi**: `meanConfidence` có thể `null` khi `engine=gemini` (FE đã xử lý `!= null`); `textMeta.lowLines` (tuỳ chọn).
- Test: `test_image_reader.py` thêm 12 test (alpha, NFKC, nền, deskew, OSD, furigana, 2 cột, Gemini plausibility, lines);
  `ExtractionIT` kiểm tra `lowLines`.

## 07/10/2026: Bóc tách tài liệu tiếng Nhật → từ vựng / ngữ pháp / cấp JLPT → bộ thẻ (UC-05 → 12, 17, 18)
- **Backend** (`V12__extraction_jobs`): bảng `extraction_jobs` / `extraction_items`; `flashcards` thêm `level`, `kind`,
  `reading_segments`, `han_viet`. API `/api/extractions` (tạo job multipart, poll, sửa văn bản chạy lại, duyệt / PATCH item,
  tạo bộ thẻ qua `DeckService.create`, xoá). Worker `@Async` 3 giai đoạn TEXT → ANALYZE → ENRICH gọi ai-service bằng
  `RestClient` (`AiServiceClient`); file gốc không lưu. Giới hạn 5 / 50 lượt mỗi 24 giờ (`app.extraction.daily-limit.*`).
- **ai-service**: gói `app/extract/` thật (SudachiPy, furigana từng chữ, Hán-Việt Unihan, JMdict, 5 danh sách JLPT + wordfreq,
  catalog ngữ pháp YAML, DOCX/PDF/TXT reader, Tesseract + Gemini Vision fallback, Gemini dịch nghĩa VN) với
  `POST /api/extract/text|analyze|enrich`, `GET /api/extract/health`; `scripts/build_dicts.py` tải dữ liệu từ điển.
- **Frontend**: modal "Tải tài liệu & bóc tách AI" mở khoá (file hoặc dán văn bản + tuỳ chọn), trang `/extractions/:id`
  (tiến trình, sửa văn bản OCR, duyệt từ vựng / ngữ pháp theo cấp, tạo bộ thẻ), `/extractions` lịch sử; `Ruby` nhận
  `segments` để hiện furigana theo từng chữ.
- **API đổi**: `CardResponse` / `DeckRequest.Card` có thêm `level`, `kind`, `readingSegments`, `hanViet` (tuỳ chọn; không gửi = giữ nguyên).
- Test: `ExtractionIT` (4 test, ai-service giả lập); pytest trong `ai-service/tests/`. Tài liệu: [EXTRACTION.md](EXTRACTION.md).

## 03/10/2026: Đánh giá bộ thẻ có bình luận
- **Backend** (`V10__deck_rating_comments`): bảng `deck_ratings` có sẵn từ V3 nay thêm `comment` (<= 500 ký tự, CHECK) và
  `created_at`; vẫn một đánh giá mỗi người mỗi bộ thẻ (UNIQUE `deck_id,user_id`). Thêm `GET /api/library/decks/{id}/ratings`
  (tổng hợp + `mine` + danh sách phân trang, tên hiển thị = `full_name` hoặc phần trước `@` của email) và
  `DELETE /api/library/decks/{id}/rating`.
- **API đổi**: `PUT .../rating` nhận thêm `comment` (tuỳ chọn); gửi lại mà không có `comment` sẽ xoá bình luận cũ.
- **Frontend**: `DeckRatings` + `DeckRatingForm` + `RatingStars` dùng ở trang chi tiết bộ thẻ (bộ public) và hộp xem trước
  Thư viện; `lib/ratingUtils.ts` có kiểm tra trong `selfCheck`.
- Test: `DeckRatingIT` (4 test); `MigrationUpgradePathTest` chạy qua V10.

## 30/09/2026: Refresh token, tự đăng xuất sau 3 ngày không hoạt động (UC-02)
- **Backend** (`V7__refresh_tokens`): `POST /api/auth/login` trả thêm `refreshToken`; `POST /api/auth/refresh` đổi lấy
  access token mới và lùi hạn phiên thêm 3 ngày; `POST /api/auth/logout` thu hồi phiên. Access token rút từ 3 ngày
  xuống 15 phút (`jwt.expiration`); hạn refresh token là `jwt.refresh-expiration` (mặc định `P3D`).
  Đổi / đặt lại mật khẩu thu hồi refresh token ở mọi thiết bị. DB chỉ lưu SHA-256 của token.
- **Frontend**: `apiClient` gặp 401 thì tự gọi làm mới một lần rồi gửi lại request; chỉ đăng xuất khi refresh token
  bị từ chối (quá 3 ngày / đã thu hồi), lỗi mạng thì giữ phiên. Nút đăng xuất gọi `/auth/logout`.
- **API đổi**: `AuthResponse` có thêm `refreshToken`; `login()` của `AuthContext` nhận thêm tham số `refreshToken`.
- Test: `RefreshTokenIT` (6 test); `smoke-auth.mjs` kiểm tra refresh / logout.

## 30/09/2026: Sửa lỗi tồn đọng và đưa code về đúng guideline
- **Lỗi**: thư mục được chia sẻ nay hiện đúng số bộ thẻ / số thẻ của thư mục con (`GET /api/decks?folderId=` của thư mục
  được chia sẻ trả bộ thẻ của cả cây con, kèm `folderId`); trang chi tiết bộ thẻ không còn nháy "Đang tải" sau khi sửa thẻ
  (`useAsync` có tham số `reload`).
- **Cấu trúc backend**: `AuthController` chỉ còn nhận / trả, giới hạn số lần thử và đổi lỗi chuyển vào `AuthService` /
  `PasswordResetService`; API trả DTO (`UserResponse`, `ReviewResponse`, `ShareMemberResponse`, `FolderMemberResponse`,
  `QuizResultResponse`, `QuizOutcomeResponse`) thay vì entity / record của repository; `StudyController` tách thành
  `DeckController` (bộ thẻ, thẻ, chia sẻ) và `StudyController` (ôn tập, quiz); `DeckService` tách `ReviewService`,
  `QuizAttemptService`. URL và JSON giữ nguyên, trừ ngoại lệ ở mục "API đã đổi".
- **API đã đổi**: bộ thẻ trong danh sách của thư mục được chia sẻ có `folderId` (trước đây luôn `null` với người xem);
  các endpoint khác vẫn `null`.
- **Frontend**: gom `getInitials` (`lib/textUtils.ts`) và `flattenFolders` (`folderTree.ts`) về một bản.
- **CI**: thêm job kiểm cú pháp `ai-service` (`python -m compileall`). **Guideline**: thêm quy trình PR / review, mẫu
  tên nhánh, quy tắc controller / service / DTO.

# Ổn định nền tảng theo kế hoạch MoSCoW
*Ngày: 29/09/2026*

## Must have
- **CI** (`.github/workflows/ci.yml`): `mvn test` + lint / build / self-check frontend cho mọi push & PR.
- **Chống mất thẻ trong trình soạn**: không mở form khi tải bộ thẻ lỗi (trước đây lưu form trống sẽ xoá toàn bộ thẻ
  và lịch sử ôn); chế độ "Thêm thẻ" chỉ ghi thông tin bộ thẻ khi có thay đổi.
- **Validate đầu vào auth / review**: DTO có `@Valid` thay cho body `Map`; giới hạn họ tên 100, mật khẩu 6–72 ký tự;
  hết lỗi báo nhầm "Email đã được sử dụng" khi họ tên quá dài; lỗi auth trả cùng định dạng JSON.
- **"Bộ thẻ của tôi"** chỉ gồm bộ thẻ sở hữu (kể cả bản đã lưu) và bộ được chia sẻ; bộ thẻ cộng đồng chỉ ở Thư viện.
- **Quiz đáng tin**: lượt làm do server phát (`V5__quiz_attempts`), chấm trên mọi câu đã phát, nộp 1 lần, có hạn giờ;
  bỏ dở quá hạn = 0 điểm. Endpoint xem trước `/quizzes/{id}/preview` không mở lượt làm.
- Tài liệu: `SUPABASE_SETUP.md` bỏ SQL tạo bảng tay (xung đột Flyway), README sửa lệnh chạy & biến môi trường.

## Should have
- **Chia sẻ thư mục** (`V4__folder_shares`): mời theo email (xem & học cả cây con), bật/tắt "ai có link đều xem được",
  mục "Được chia sẻ với tôi".
- **Quên mật khẩu** (`V6__password_reset_tokens`): link dùng 1 lần, 30 phút; gửi qua SMTP khi có cấu hình.
- Chặn tạo tài khoản hàng loạt theo IP; lấy IP thật sau reverse proxy (`server.forward-headers-strategy=native`).
- Số liệu dashboard tự tải lại sau mọi thao tác ghi; bỏ số liệu bịa của người dùng ở Phòng thi & Lộ trình;
  lịch sử quiz trả kèm tên bộ thẻ.
- Sửa lỗi giao diện: trình độ thư mục không còn bị ép N5, số liệu thư mục con, dấu phân cách `\n` khi nhập thẻ,
  các class Tailwind chưa định nghĩa, thông báo lỗi khi ôn tập / thêm nhiều bộ thẻ.
- Dọn: bỏ dependency Redis / WebFlux chưa dùng, component `DeckModal` không dùng, gom hằng số cấp JLPT,
  thông báo lỗi thư mục sang tiếng Việt.

---

# Nhật ký thay đổi: Xây dựng API Quản lý Thư mục (Folder)
*Ngày hoàn thành: 22/09/2026*

## Tóm tắt
Đã hoàn tất việc xây dựng toàn bộ hệ thống API Quản lý Thư mục (Bộ thẻ Flashcard) ở phía Backend theo mô hình 3 lớp chuẩn của Spring Boot. API này phục vụ trực tiếp cho màn hình Dashboard bên phía Frontend.

## Chi tiết các thành phần đã thêm / chỉnh sửa

### 1. Tầng Model (Thực thể CSDL)
- **`Folder.java`**: Tạo bảng `folders` lưu trữ thông tin thư mục.
  - Các trường cơ bản: `id`, `title`, `description`, `level`, `accessType`.
  - Các trường đặc biệt (Hybrid Approach): 
    - `isPinned` (boolean): Phục vụ tính năng Ghim thư mục (truy vấn tốc độ cao).
    - `metadata` (TEXT): Chứa chuỗi JSON để lưu trữ các thông tin cấu hình giao diện tùy chỉnh từ Frontend (màu sắc, icon, ảnh bìa...) mà không làm phình to cấu trúc CSDL.
  - Quan hệ: Khóa ngoại `user_id` liên kết với bảng `User`.

### 2. Tầng Data Transfer Object (DTO)
- **`FolderRequest.java`**: Quy định cấu trúc dữ liệu Frontend gửi lên khi Tạo/Sửa thư mục (Có validation kiểm tra `title` không được để trống).
- **`FolderResponse.java`**: Quy định cấu trúc dữ liệu trả về cho Frontend. 
  - *Lưu ý kiến trúc:* Đã loại bỏ toàn bộ các trường hardcode UI (như `iconBg`, `tagColor`) ra khỏi Response để tuân thủ triệt để nguyên tắc RESTful API chuẩn. Trách nhiệm render màu sắc và icon mặc định được giao hoàn toàn cho Frontend xử lý.

### 3. Tầng Repository (Truy xuất CSDL)
- **`FolderRepository.java`**: Thêm hàm `findByUser(User user)` để truy xuất toàn bộ thư mục thuộc quyền sở hữu của một cá nhân cụ thể.

### 4. Tầng Service (Xử lý nghiệp vụ)
- **`FolderService.java`**: Xử lý logic lõi.
  - Khởi tạo thư mục mới.
  - Kiểm tra bảo mật chặt chẽ: Trong các hàm Cập nhật (Update) và Xóa (Delete), hệ thống bắt buộc kiểm tra xem người đang thực hiện hành động có phải là **chủ sở hữu** của thư mục đó không. Báo lỗi nếu không có quyền.

### 5. Tầng Controller (Giao tiếp API)
- **`FolderController.java`**: Cung cấp 4 Endpoints chính (Yêu cầu JWT Token ở Header):
  - `GET /api/folders`: Lấy danh sách thư mục của User hiện tại.
  - `POST /api/folders`: Tạo thư mục mới.
  - `PUT /api/folders/{id}`: Cập nhật thông tin thư mục.
  - `DELETE /api/folders/{id}`: Xóa thư mục.

### 6. Cấu hình hệ thống
- Thêm file **`application-local.properties`** (đã được cấu hình ẩn trong `.gitignore`) để truyền biến môi trường mật khẩu Database, giúp Server kết nối thành công với Supabase.

---
**Ghi chú cho Frontend Team:** 
- Khi gọi API `/api/folders`, Frontend có thể tận dụng trường `metadata` để nhét bất kỳ JSON cấu hình UI nào vào (ví dụ: `{"color": "red", "icon": "star"}`).
- Cần tự map các giá trị mặc định cho UI nếu `metadata` rỗng.
