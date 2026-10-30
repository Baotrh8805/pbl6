# Spec: Sơ đồ chữ Hán & từ vựng (`/graph`) — nhận xét kế hoạch gốc và thiết kế nâng cấp

Ngày 30/10/2026 · nhánh `Graph` (tách từ `tudien` 694253e) · trạng thái: **đã duyệt 30/10, đang làm Đợt 1**.
Kế hoạch triển khai theo đợt: [../plans/2026-10-30-so-do-chu-han.md](../plans/2026-10-30-so-do-chu-han.md).

---

## 0. Bối cảnh

Trang `/graph` hiện là **bộ khám phá đồ thị tri thức Neo4j** 4 tab (Khám phá / Gợi ý / Hỏi đáp / Đường nối), làm 27/10 theo spec D30, kiểm thử PASS 28/10. Theo kết luận `/grill-me`, trang này sẽ trở thành **không gian chuyên về cấu tạo chữ Hán và từ ghép**, chạy từ dữ liệu từ điển tích hợp, không cần Neo4j. Bản kế hoạch được gửi (gọi là **KH gốc**) mô tả giao diện theo ảnh tham khảo khá tốt, nhưng khi đối chiếu với mã nguồn thì phần dữ liệu và API có nhiều điểm không chạy được như viết. Tài liệu này: (1) nhận xét KH gốc, (2) đề xuất nâng cấp, (3) kế hoạch viết lại theo 3 đợt.

Ba quyết định đã chốt với người dùng 30/10:
- **Q1** Thay trang `/graph`, **giữ nguyên** backend `/api/graph`, ai-service `app/graph`, job đồng bộ đêm, thẻ Admin › Đồ thị. Gỡ hẳn Neo4j là quyết định tách riêng sau.
- **Q2** Nghĩa tiếng Việt từng chữ Hán lấy **sẵn trong DB** (`dict_meanings` khoá `k:…`), **không gọi Gemini** khi mở sơ đồ; thiếu thì hiện Hán-Việt + nghĩa Anh và nút "Tra chữ này".
- **Q3** Chia **3 đợt**, mỗi đợt test xanh và chạy được độc lập.

---

## 1. Nhận xét kế hoạch gốc

### 1.1 Ưu điểm (giữ lại)

- **Đúng hướng sản phẩm**: hai chế độ Cấu tạo / Từ ghép, panel chi tiết bên phải, bố cục 2 cột, đồng bộ URL, nút quay lại, chú thích màu — bám sát ảnh mẫu và nhu cầu người học Việt (âm Hán-Việt là trục chính).
- **Đúng nguyên tắc hạ tầng**: chạy từ dữ liệu tĩnh (CSV + SQLite), không phụ thuộc Neo4j; cùng mẫu với `/kanji-info/*`, `/dict/*`, `/radicals/*` đã có.
- **Có kế hoạch kiểm thử** cả tự động lẫn tay, có ví dụ cụ thể (時 → 寺, 持, 待…).
- **Không thêm thư viện**: canvas SVG tự vẽ, hợp với repo (không có d3/reactflow, mọi đồ thị hiện tại là SVG tay).

### 1.2 Nhược điểm (đối chiếu mã nguồn)

Mức độ: 🔴 không chạy được như viết · 🟠 sai lệch với repo, phải sửa · 🟡 thiếu / mơ hồ.

| # | Mức | Vấn đề | Bằng chứng |
|---|---|---|---|
| N1 | 🔴 | **KRADFILE không cho ra "thành phần chỉ âm"**. Nó là tập phẳng các *bộ gõ radkfile* (~250 ký hiệu), không phải phân rã theo tầng. 時 chỉ có `寸 土 日`, 持 chỉ có `寸 土 扌` — **không có 寺**. Ví dụ trung tâm của KH gốc (`時 → 寺`) không tìm được. | `kanjidata.components("時") == ('寸','土','日')` (đã chạy thử 30/10) |
| N2 | 🔴 | **Heuristic "âm On trùng" bắt sót quá nửa họ chữ**. Họ 寺: 時ジ 持ジ 侍ジ 詩シ 待タイ 特トク 等トウ → trùng âm On chỉ 3/7; test của KH gốc kỳ vọng đủ 7 nên sẽ đỏ ngay. | probe 30/10 trên `kanji_readings` + `han_viet` |
| N3 | 🔴 | **Không có nghĩa tiếng Việt từng chữ Hán** trong ai-service (chỉ `kanji_meanings.py` tiếng Anh + Hán-Việt; 214 bộ thủ có `meaning_vi`). Panel hứa "nghĩa tiếng Việt (chùa)" không có nguồn. | `ai-service/app/extract/data/*`; backend `dict/*.csv` chỉ khoá `w:` |
| N4 | 🟠 | **Route ai-service `/kanji/diagram` nằm nhầm nhóm**: prefix `/kanji` thuộc router chấm nét viết (`kanji_dtw_router.py`), mọi router đều dưới `/api`. Nhóm đúng là `/api/kanji-info/*`. | `app/main.py:45-57`, `kanji_dtw_router.py:32` |
| N5 | 🟠 | **Backend không có `NlpClient`/`WebClient`**; có `AiServiceClient` (RestClient, 4 biến thể timeout) + `NlpService` + `NlpController` đã sở hữu `/api/nlp`. KH gốc lại đặt tên `KanjiDiagramController` nhưng route `/api/nlp/kanji-diagram` → mâu thuẫn nội bộ, trùng mapping. | `AiServiceClient.java:252-330`, `NlpController.java:33` |
| N6 | 🟠 | **"Khách tra cứu công khai" trái mô hình bảo mật**: mọi route học tập đều `ROLE_USER`, chưa có endpoint public nào ngoài auth; `NlpService` không có rate limiter theo IP. Trang `/graph` vốn nằm sau `ProtectedRoute` nên public cũng vô nghĩa. | `SecurityConfig.java:71-91` |
| N7 | 🟠 | **"Cache ngắn hạn" không nói bằng gì**: repo không có Spring Cache/Caffeine; mẫu có sẵn là `TtlCache` (10 phút / 500 mục) trong `NlpService`. | `TtlCache.java`, `NlpService.java:36-42` |
| N8 | 🟠 | **Mục tiêu "<50 ms" không đạt với truy vấn từ ghép** như KH gốc mô tả: `word_forms LIKE '%ch%'` quét toàn bảng 0,17–0,27 s. JMdict cũng **không có cột độ thông dụng** (`pri/nf/ichi`), chỉ có `common` boolean; "sắp theo độ thông dụng" phải dùng `wordfreq` (đã có `han_viet_graph.word_frequency`). | `dictionary.py:395-397`, schema `build_dicts.py:236-335` |
| N9 | 🟠 | **Bỏ sót mã có thể tái dùng**: `kanji_cards.card()` (On/Kun/bộ/số nét), `han_viet_graph.words_of()` (từ chứa chữ, đã cache, JLPT trước), `han_viet_graph.suggest()` (autocomplete Hán-Việt), `dictionary.kanji()` (thẻ + 10 từ ví dụ), frontend `hanVietUtils.edgePath/pillWidth`, mẫu node SVG có `role="button"` + halo, `useSwipe` (pointer capture). KH gốc viết lại từ đầu. | xem §3.2 |
| N10 | 🟠 | **Xoá 4 tab Neo4j nhưng không nói đến phần mồ côi**: `selfcheck/graph.ts` test `graphLayout.ts`; `AdminGraphCard` dùng `graphService`; `graph.types.ts`; `syncGraphMe()` gọi khi mở trang; tài liệu USE_CASES / ARCHITECTURE / CODEBASE_MAP / spec D30 ghi `/graph` là Neo4j. | báo cáo khảo sát 30/10 |
| N11 | 🟡 | **Cấp JLPT từng chữ** không có nguồn trực tiếp (không có KANJIDIC); repo suy ra "cấp của từ JLPT dễ nhất chứa chữ". KH gốc coi như sẵn có; phải ghi rõ là ước lượng. | `classifier.entries_containing` |
| N12 | 🟡 | **Tham số `depth` phía server** làm payload phình và khó cache; "mở rộng theo tầng" phía client bằng cách gọi lại cùng endpoint cho node được mở (đã cache) đơn giản hơn. | — |
| N13 | 🟡 | **Thiếu hành vi khi thiếu dữ liệu**: `jmdict.sqlite` bị gitignore, dựng tại máy; nếu thiếu thì chế độ Từ ghép rỗng — cần nói rõ, và dữ liệu cấu tạo phải **commit** để chế độ Cấu tạo luôn chạy (như `kradfile.csv`). | `.gitignore:86-88` |
| N14 | 🟡 | **Zoom/pan/kéo thả chưa có gì trong repo** (chỉ pointer drag ở `useSwipe`, `KanjiCanvas`); KH gốc không ước lượng công sức, cũng không nói đến bàn phím / `prefers-reduced-motion` / mobile. | grep `wheel|zoom` = 0 |
| N15 | 🟡 | **Tra bằng âm Hán-Việt nhiều chữ** (THỜI → 時, 詩? không; nhưng THANH → 青 清 声 晴…): KH gốc không nói chọn chữ nào. Cần trả `candidates`. | `han_viet_graph.graph()` |

---

## 2. Đề xuất nâng cấp

### D1 — Nguồn dữ liệu cấu tạo: **KanjiVG** thay KRADFILE (giải N1, N2)

KanjiVG (đã dùng cho nét viết, zip 22,7 MB có sẵn trong `scripts/.download_cache/`) chứa cây phân rã có tầng và **đánh dấu thành phần chỉ âm**:

```xml
<g kvg:element="時">
  <g kvg:element="日" kvg:position="left" kvg:radical="general">
  <g kvg:element="寺" kvg:position="right" kvg:phon="寺">
```

Số liệu kiểm trên 1.971 chữ JLPT (30/10): **1.971/1.971** có cây phân rã, **1.805** có vị trí, **1.137 (58 %)** có `kvg:phon`, 670 thành phần chỉ âm khác nhau; họ 寺 ra đủ **時 持 待 特 等 詩 侍**. Giấy phép CC BY-SA 3.0 đã được chấp nhận khi dùng nét viết; ghi thêm vào `data/README.md`.

→ Thêm bước `--only kanji_parts` vào `scripts/build_dicts.py` sinh **`app/extract/data/kanji_parts.csv`** (commit, ~6.700 dòng ≈ 250 KB): `kanji,parts,positions,radical_part,phon`. `parts` là **con trực tiếp** của nhóm gốc (giữ biến thể 扌 nhưng ghi kèm `kvg:original` 手 để nối với chữ gốc); `phon` chuẩn hoá: lấy token đầu trước `/`, bỏ hậu tố `V`, `T`, số, `right/left`, chỉ giữ nếu còn đúng 1 chữ CJK (165/670 giá trị cần chuẩn hoá, vd. `之V` → 之).

Chữ **không có `kvg:phon`** (42 %): không bịa; sơ đồ vẫn vẽ thành phần + bộ. Heuristic phụ (nhãn "có thể là chỉ âm", đường nét đứt): thành phần là chữ Hán có âm On hoặc Hán-Việt trùng với chữ tâm.

### D2 — Nhãn trung thực cho "họ chữ mượn âm"

Họ chữ = các chữ có cùng `phon`. Mỗi chữ trong họ có cờ `sameOn` (trùng ≥1 âm On với thành phần chỉ âm) → cạnh **"chỉ âm"** liền; không trùng → cạnh nét đứt nhãn **"cùng phần chỉ âm"**. Tránh dạy sai (待 không đọc ジ).

### D3 — API nằm trong khung sẵn có (giải N4–N7)

- ai-service: `GET /api/kanji-info/diagram` trong `kanji_info_router.py`; logic ở module mới `app/extract/kanji_diagram.py`.
- backend: thêm `AiServiceClient.kanjiDiagram()`, `NlpService.kanjiDiagram()` (kiểm tham số, `TtlCache` khoá `diagram|q|mode`, **ghép nghĩa Việt** từ `DictionaryStore.meanings(keys)`), `NlpController` `GET /api/nlp/kanji-diagram`. `ROLE_USER`, không public.
- Bỏ `depth`; mở rộng = client gọi lại endpoint với chữ được mở (D7).

### D4 — Nghĩa tiếng Việt (giải N3, theo Q2)

Backend ghép `meaningVi` cho mọi node chữ Hán (`k:X`) và từ ghép (khoá `w:<id>` / `w:jlpt:…` do ai-service trả) từ `dict_meanings` bằng **một** truy vấn `meanings(keys)`. Thiếu → `meaningVi: null`; panel hiện Hán-Việt + `meaningEn` + nút "Tra chữ này →" (từ điển sẽ dịch và lưu, lần sau sơ đồ có nghĩa). Seed `jmdict_common_meaning_vi.csv` (29.656 dòng) phủ gần hết từ ghép `common`.

### D5 — Hiệu năng thực tế (giải N8)

Mục tiêu: backend cache hit < 20 ms; ai-service lạnh < 150 ms cho chế độ Cấu tạo (toàn bộ chỉ số trong bộ nhớ), < 400 ms cho Từ ghép lần đầu mỗi chữ (`words_of` cache theo chữ). Từ ghép lấy từ `han_viet_graph.words_of(ch)` (JLPT trước, rồi JMdict `common=1`, cap 50) rồi lấy **12** từ xếp theo cấp JLPT dễ → khó, rồi `word_frequency` giảm dần.

### D6 — Tái dùng frontend (giải N9, N14)

- Bố cục **theo cung** (deterministic): tâm ở giữa; thành phần cấu tạo ở cung trái-dưới; họ chữ mượn âm quạt bên phải; từ ghép xếp vòng. Hàm thuần trong `diagramLayout.ts` để selfcheck test được (thay `selfcheck/graph.ts`).
- Dùng lại `edgePath`, `pillWidth` (`lib/hanVietUtils.ts`), mẫu node `<g role="button" tabIndex=0>` + halo, màu token Tailwind (`fill-primary-container`…), `JlptChip`.
- Zoom/pan: hook riêng `useViewBox` (wheel quanh con trỏ, kéo nền để pan, `setPointerCapture` như `useSwipe`), không thêm dependency. Kéo thả node: ghi đè vị trí vào `Map<id,{x,y}>`; kéo < 4 px coi là bấm.

### D7 — Mở rộng và lịch sử

- Node có `expandable: true` (có dữ liệu cấu tạo hoặc có từ ghép) hiện huy hiệu `+`. Bấm `+` / đúp chuột → gọi `fetchKanjiDiagram(X, mode)` rồi **gộp** nodes/edges (khử trùng theo `id`), node mới đặt quanh X. "Mở thêm 1 tầng" = mở tuần tự tối đa 8 node lá expandable (đều qua cache backend). "Thu gọn" = về payload gốc.
- "Bắt đầu lại từ chữ này" = `setParams({q: X})` (push history) → nút "← Quay lại [chữ trước]" dùng ngăn xếp nội bộ + `navigate(-1)`; Back của trình duyệt cũng hoạt động vì URL đổi.

### D8 — Dọn Neo4j frontend có kiểm soát (theo Q1, giải N10)

Xoá: `KnowledgeGraphSvg`, `GraphNodePanel`, `GraphAskPanel`, `GraphRecommendations`, `GraphPathFinder`, `useGraphAsync`, `lib/graphLayout.ts`, `selfcheck/graph.ts`, hàm người dùng trong `graphService.ts` (`exploreGraph`, `fetchGraphPath`, `fetchGraphRecommend`, `fetchGraphConflicts`, `askGraph`, `syncGraphMe`). Giữ: hàm admin trong `graphService.ts` + kiểu `GraphStatus` cho `AdminGraphCard`, `GraphBits.tsx` nếu `JlptChip/EmptyNote` còn dùng. Backend/ai-service/docker **không đụng**. Tài liệu: ghi rõ UC-34/35 chỉ còn API + Admin, giao diện người học đã thay.

### D9 — Tra bằng Hán-Việt (giải N15)

`q` là chữ Hán → tâm ngay. `q` là âm Hán-Việt → ai-service dùng `han_viet_graph` tìm chữ: 1 chữ → tâm; nhiều chữ → trả `candidates: [{kanji, hanViet, jlpt, meaningEn}]` (xếp JLPT dễ trước), `center: null`; frontend hiện hàng chip chọn chữ. Autocomplete ô tìm kiếm dùng lại `/api/nlp/han-viet-suggest`.

### D10 — Suy giảm có chủ đích (giải N13)

`kanji_parts.csv` commit → Cấu tạo luôn chạy. Thiếu `jmdict.sqlite` → `compounds` trả `items: []` + `stats.jmdict: false`, panel hiện "Chưa dựng từ điển JMdict trên máy này". Thiếu `kanji_parts.csv` → `structure` chỉ có bộ thủ (từ `unihan_rs`) + cờ `stats.parts: false`. Cờ `kanjiParts` thêm vào `/extract/health`.

---

## 3. Kế hoạch đã viết lại

### 3.1 Mục tiêu & ngoài phạm vi

**Mục tiêu**: `/graph` = "Sơ đồ chữ Hán" với 2 chế độ (Cấu tạo / Từ ghép), canvas SVG tương tác, panel chi tiết, lịch sử, tra bằng chữ hoặc âm Hán-Việt; chạy không cần Neo4j; nghĩa Việt từ DB có sẵn.

**Ngoài phạm vi**: gỡ Neo4j backend/ai-service; dịch Gemini khi mở sơ đồ; dark mode (repo chưa có); lưu bố cục người dùng; thêm thẻ vào bộ từ sơ đồ (có thể tái dùng `AddWordToDeckModal` ở đợt sau).

### 3.2 Kiến trúc & mã tái dùng

```
frontend /graph (KnowledgeGraphPage, viết lại)
  ├─ KanjiDiagramCanvas  (SVG, diagramLayout.ts, useViewBox.ts)
  ├─ KanjiDiagramPanel   (chi tiết chữ / từ đang chọn)
  └─ kanjiDiagramService.fetchKanjiDiagram(q, mode)  → GET /api/nlp/kanji-diagram
backend NlpController → NlpService.kanjiDiagram (kiểm tham số, TtlCache, ghép meaningVi từ DictionaryStore.meanings)
  → AiServiceClient.kanjiDiagram → GET /api/kanji-info/diagram (X-Internal-Key)
ai-service kanji_info_router → app/extract/kanji_diagram.py
  ├─ kanji_parts.csv (MỚI, KanjiVG)      → thành phần, vị trí, bộ, chỉ âm, chỉ số ngược phon → chữ
  ├─ kanjidata.radical_strokes + radicals.radical_of → bộ thủ 214
  ├─ kanji_cards.card → On/Kun, số nét, meaningEn, hanViet
  ├─ classifier (jlpt_kanji_set, entries_containing) → cấp JLPT ước lượng
  └─ han_viet_graph.words_of / word_frequency / suggest → từ ghép, tra âm Hán-Việt
```

Mã tái dùng (đường dẫn): `ai-service/app/extract/kanji_cards.py:155 card()`, `han_viet_graph.py words_of() / word_frequency() / suggest()`, `radicals.py radical_of()`, `kanjidata.py radical_strokes()`, `jlpt/classifier.py`; `backend-core/.../NlpService.java` (`cached`, `query`, `upstream`, mẫu `withPublicMnemonics`), `AiServiceClient.hanVietSuggest()` làm mẫu, `DictionaryStore.meanings(Collection)`, `DictionaryKeys`; `frontend/src/lib/hanVietUtils.ts edgePath/pillWidth`, `features/study/useSwipe.ts` (pointer capture), `features/graph/components/GraphBits.tsx JlptChip`, `services/kanjiService.ts` (mẫu service), `pages/DictionaryPage.tsx:46-64` (mẫu `go()` URL).

### 3.3 Dữ liệu: `kanji_parts.csv`

Sinh bởi `build_dicts.py --only kanji_parts` từ zip KanjiVG trong cache (tải lại nếu thiếu, cùng `_latest_kanjivg_asset`). Mỗi chữ trong zip (không chỉ JLPT) một dòng:

| cột | ví dụ 時 | ghi chú |
|---|---|---|
| `kanji` | 時 | |
| `parts` | `日 寺` | con trực tiếp của nhóm gốc, theo thứ tự tài liệu (= thứ tự viết) |
| `originals` | `- -` | `kvg:original` của từng part nếu là biến thể (持: `手 -`), `-` nếu không |
| `positions` | `left right` | `kvg:position`, `-` nếu thiếu |
| `radical_part` | 日 | part có `kvg:radical` (ưu tiên `general`, rồi `tradit`, `nelson`); trống nếu không |
| `phon` | 寺 | đã chuẩn hoá, trống nếu không có / không chuẩn hoá được |

Hàm thuần trong `build_dicts.py`: `parse_kanjivg_parts(svg_text) -> dict | None`, `normalise_phon(raw) -> str | None` (test bằng fixture SVG 時, 持, 寺, 侍 trong `tests/fixtures/kanjivg/`).

Nạp trong `kanjidata.py` (cùng `_cache` + lock): `parts(ch) -> Parts | None`, `phon_family(comp) -> tuple[str,...]` (chỉ số ngược dựng lúc nạp), `availability()` thêm `kanji_parts`.

### 3.4 Hợp đồng API

`GET /api/nlp/kanji-diagram?q=時&mode=structure|compounds` (mặc định `structure`; `q` ≤ 32 ký tự; sai mode → 400; âm lạ → 200 với `center: null, candidates: []`).

```jsonc
{
  "query": "時", "mode": "structure",
  "center": "k:時",                 // null khi phải chọn
  "candidates": [],                 // [{kanji, hanViet, jlpt, meaningEn}] khi q là âm nhiều chữ
  "nodes": [
    {"id":"k:時","type":"center","label":"時","hanViet":"THỜI","meaningEn":"time","meaningVi":"thời gian, giờ",
     "jlpt":"N5","expandable":true},
    {"id":"k:寺","type":"component","label":"寺","hanViet":"TỰ","role":"phon","position":"right","expandable":true,...},
    {"id":"k:日","type":"component","label":"日","role":"radical","radicalNo":72,"position":"left",...},
    {"id":"k:持","type":"phonetic","label":"持","sameOn":true,...},
    {"id":"k:待","type":"phonetic","label":"待","sameOn":false,...}
    // mode=compounds: {"id":"w:1315920","type":"word","label":"時間","reading":"じかん","hanViet":"THỜI GIAN",
    //                  "jlpt":"N5","meaningVi":"thời gian","key":"w:1315920"} + {"id":"k:間","type":"kanji",...}
  ],
  "edges": [
    {"from":"k:寺","to":"k:時","type":"phon"},        // "chỉ âm" xanh lá
    {"from":"k:日","to":"k:時","type":"radical"},     // "bộ" đỏ
    {"from":"k:寺","to":"k:持","type":"phon"},
    {"from":"k:寺","to":"k:待","type":"family"}       // "cùng phần chỉ âm" nét đứt
    // compounds: {"from":"k:時","to":"w:…","type":"compound"}, {"from":"w:…","to":"k:間","type":"contains"}
  ],
  "detail": {                        // chữ tâm, để panel không gọi thêm
    "kanji":"時","hanViet":"THỜI","on":["ジ"],"kun":["とき"],"strokeCount":10,"jlpt":"N5",
    "radical":{"no":72,"char":"日","nameVi":"nhật","meaningVi":"mặt trời, ngày"},
    "formula":[{"part":"日","hanViet":"NHẬT","role":"radical"},{"part":"寺","hanViet":"TỰ","role":"phon"}],
    "phonOf":[],                     // chữ này làm phần chỉ âm cho ai (với 寺: 時 持 待 特 等 詩 侍)
    "compounds":[...12 từ như node word...]
  },
  "stats": {"kanji":7,"words":0,"parts":true,"jmdict":true}
}
```

Backend chỉ **ghép** `meaningVi` (không đổi cấu trúc), cache 10 phút theo `q|mode` **sau** khi ghép (dữ liệu dùng chung, không theo user; admin sửa nghĩa thì mới nhất sau ≤10 phút — chấp nhận). Nghĩa Việt của các chữ không phải tâm cũng ghép (một truy vấn `IN`).

### 3.5 Frontend

- **Trang** `pages/KnowledgeGraphPage.tsx` viết lại: header gồm tab `Cấu tạo | Từ ghép` (role=tablist, phím mũi tên như `DictionaryPage`), ô tìm + gợi ý Hán-Việt (`fetchHanVietSuggest` sẵn có) + chip nhanh `時 寺 青 工 生 THỜI`. URL: `?q=&mode=` (`structure` mặc định thì bỏ `mode`), `sel=` cho node đang chọn (tuỳ chọn). Bố cục: canvas `flex-1 min-h-[32rem]`, panel `w-[22rem]` cố định; dưới `lg` panel xuống dưới canvas.
- **`features/graph/components/KanjiDiagramCanvas.tsx`**: props `{data, extra (node/edge đã mở), selectedId, positionsOverride, viewBox, onSelect, onExpand, onDragNode, onZoom…}`. Node: tâm xanh dương r=36, thành phần cam r=26, chỉ âm vàng r=26, từ ghép tím pill (`pillWidth`), chữ ghép trắng viền xám r=22, bộ thủ viền đỏ. Cạnh có mũi tên (`<marker>`), nhãn giữa cạnh, `edgePath` cong. Huy hiệu `+` xanh lá góc trên phải khi `expandable` và chưa mở. Thanh công cụ góc trên phải `+ − ⤢`; góc trên trái nút quay lại; đáy: thống kê + `Mở thêm 1 tầng` / `Thu gọn` + chú thích. Tôn trọng `prefers-reduced-motion` (đã có rule toàn cục).
- **`diagramLayout.ts`** (thuần): `sectorLayout(nodes, edges, centerId, size)`, `mergeDiagram(base, extra)`, `placeAround(anchor, newIds, existing)`, `fitViewBox(positions, pad)`. Test trong `scripts/selfcheck/diagram.ts` (thay `graph.ts`).
- **`useViewBox.ts`**: `{viewBox, zoomIn, zoomOut, fit, onWheel, onPointerDown/Move/Up}`; giới hạn scale 0,4–3.
- **`KanjiDiagramPanel.tsx`**: avatar chữ lớn, Hán-Việt in hoa, `meaningVi ?? meaningEn`, `JlptChip`; nút `🔄 Bắt đầu lại từ chữ này`, `Tra chữ này →` (`/dictionary?tab=kanji&k=X`, tham số đã xác minh); Âm On/Kun; **Cấu tạo** dạng `[日 NHẬT · bộ] + [寺 TỰ · chỉ âm] = 時`; **Từ có chữ (N)** (furigana `<ruby>`, Hán-Việt, nghĩa Việt, bấm → chuyển mode compounds hoặc mở từ điển `/dictionary?k=…`); **Làm phần chỉ âm (N)** chip bấm được. Khi chọn node từ ghép: hiện nghĩa + các chữ cấu thành. Khi `candidates` ≠ rỗng: panel đổi thành "Chọn chữ".
- **`services/kanjiDiagramService.ts`** + **`types/kanjiDiagram.types.ts`**; import tương đối `.ts` như các service khác để selfcheck nạp được.
- Sidebar: `DashboardSidebar.tsx:171` đổi nhãn `Đồ Thị Tri Thức` → `Sơ Đồ Chữ Hán`, icon `account_tree`.

### 3.8 Rủi ro còn lại

| Rủi ro | Giảm thiểu |
|---|---|
| 42 % chữ JLPT không có `kvg:phon` → sơ đồ "nghèo" | Vẫn có thành phần + bộ + từ ghép; heuristic đợt 3; có thể bổ sung `phon_overrides.csv` tay như `han_viet_overrides.csv` |
| Nghĩa Việt rỗng với chữ chưa ai tra | Hiện nghĩa Anh + Hán-Việt, nút tra; theo dõi tỉ lệ rỗng, nếu cao thì seed CSV (phương án Q2 thứ 3) sau |
| Payload chữ có họ lớn (莫, 方: 8 chữ) + 12 từ + chữ ghép ≈ 40 node | Cap: họ ≤ 12, từ ≤ 12, chữ ghép khử trùng; đủ cho canvas 720² |
| Canvas tự viết zoom/pan trên touch | Đợt 2 kiểm trên điện thoại thật; giữ nút `+ − ⤢` làm đường dự phòng |
| Xoá mã Neo4j frontend làm lệch tài liệu | Mục 1.8 sửa tài liệu cùng commit |
