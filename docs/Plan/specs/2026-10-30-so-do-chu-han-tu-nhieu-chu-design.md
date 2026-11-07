# Spec: Sơ đồ chữ Hán — tra bằng từ nhiều chữ, kana và Hán-Việt nhiều âm (chế độ "Phân tích từ")

Ngày 30/10/2026 · nhánh `Graph` · trạng thái: **đã làm 30/10** (pytest / NlpIT / selfcheck / lint / build xanh; API ai-service thật kiểm 10 câu tìm), **chưa bấm thử trên trình duyệt**; kế hoạch [../plans/2026-10-30-so-do-chu-han-tu-nhieu-chu.md](../plans/2026-10-30-so-do-chu-han-tu-nhieu-chu.md). Mở rộng spec gốc
[2026-10-30-so-do-chu-han-design.md](2026-10-30-so-do-chu-han-design.md) (§3.4 hợp đồng API, §3.5 frontend).

---

## 0. Vấn đề

`kanji_diagram.resolve()` lấy chữ Hán đầu tiên gặp được, âm Hán-Việt chỉ hiểu một âm. Đo ngày 30/10:

| Gõ | Hiện tại |
| :--- | :--- |
| `学生`, `学生です`, `日本語` | Vẽ chữ đầu, chữ còn lại biến mất không báo |
| `がくせい` | "Không tìm thấy" |
| `học sinh`, `HOC SINH` | "Không tìm thấy" |
| `học` | Đúng: ứng viên 学 學 斈 |

Sơ đồ chỉ biết "chữ", không biết "từ".

## 1. Quyết định đã chốt với người dùng (grill 30/10)

- **W1 — Hướng kết hợp.** Thanh chọn chữ cho mọi câu tìm là từ nhiều chữ, cộng chế độ thứ ba **"Phân tích từ"** cho từ 2–4 chữ.
- **W2 — Làm luôn kana và Hán-Việt nhiều âm** trong đợt này, có bước "chọn từ" khi một câu tìm ứng với nhiều từ.
- **W3 — Gõ từ 2–4 chữ thì mở thẳng "Phân tích từ"**; thanh chọn chữ nằm trên sơ đồ, bấm chữ thì sang Cấu tạo của chữ đó.
- **W4 — Cắt câu tìm bằng cụm chữ Hán liền nhau đầu tiên** (không tra từ điển). Cụm dài hơn 4 chữ: chỉ thanh chọn chữ, vẽ
  Cấu tạo chữ đầu, không có Phân tích từ.

Ngoài phạm vi: tách câu thành nhiều từ (`日本語能力試験` → 日本語 + 能力 + 試験), tra từ có okurigana như một từ (`食べる` vẫn
là chữ 食), kana lẫn đuôi ngữ pháp (`がくせいです` không ra 学生), Hán-Việt viết liền không dấu cách (`hocsinh`).

---

## 2. Phân giải câu tìm (ai-service, `kanji_diagram.resolve`)

Thứ tự xét, dừng ở luật đầu tiên khớp:

| # | Câu tìm | Kết quả |
| :--- | :--- | :--- |
| R1 | Có chữ Hán thật | Lấy cụm chữ Hán liền nhau đầu tiên (bỏ 々〆ヶ khỏi cụm nhưng không cắt cụm). 1 chữ → tâm chữ. 2–4 chữ khác nhau → **từ**. ≥ 5 chữ → tâm chữ đầu, `chars` đủ cụm. |
| R2 | Toàn kana (hiragana / katakana, bỏ khoảng trắng) | Tra từ có cách đọc đó: từ JLPT (`classifier.homophones_jlpt`) rồi JMdict thông dụng (`entries.kana`, `common=1`), chỉ giữ từ có chữ Hán và 1–4 chữ Hán. 1 từ → như R1 với từ đó. Nhiều từ → `wordCandidates`. |
| R3 | Hán-Việt 1 âm | Như hiện nay (`candidates` chữ). |
| R4 | Hán-Việt 2–4 âm (tách theo khoảng trắng) | Với mỗi âm lấy tập chữ (`han_viet_graph.kanji_for`, có dấu thì khớp đúng, không dấu thì khớp gập dấu). Ứng viên = từ trong `han_viet_graph.words_of(c)` với c thuộc tập âm đầu, có đúng n chữ, chữ thứ i thuộc tập âm i. 1 từ → như R1. Nhiều từ → `wordCandidates`. |
| R5 | Khác | Rỗng như hiện nay. |

Một từ có chữ lặp (`時時`) hoặc chứa 々 (`人々`) được coi là từ nhưng node chữ khử trùng.
`wordCandidates` tối đa **12**, xếp: từ JLPT trước (cấp dễ → khó), rồi JMdict thông dụng, rồi theo `han_viet_graph._word_sort_key`.
Mỗi ứng viên: `{term, reading, hanViet, jlpt, meaningEn, key}` (key như từ ghép: `w:<id>` hoặc `w:jlpt:<từ>|<đọc>`).

## 3. Hợp đồng API

Endpoint giữ nguyên: ai-service `GET /api/kanji-info/diagram`, backend `GET /api/nlp/kanji-diagram`.

**Tham số**

| Tham số | Giá trị | Ghi chú |
| :--- | :--- | :--- |
| `q` | ≤ 32 ký tự | Như cũ |
| `mode` | `structure` \| `compounds` \| **`word`** \| rỗng | **Rỗng = tự chọn**: câu tìm là từ 2–4 chữ → `word`, còn lại → `structure`. Lạ → 400. |
| **`k`** | một chữ Hán, tuỳ chọn | Chữ được chọn trong từ cho `structure` / `compounds` (`?q=学生&mode=structure&k=生`). Không thuộc cụm của `q` → bỏ qua, dùng chữ đầu. Dài hơn 2 đơn vị UTF-16 → 400. |

`mode=word` khi câu tìm không phải từ 2–4 chữ → trả về như `structure`, trường `mode` trong payload ghi chế độ thực tế;
frontend thấy khác thì sửa URL bằng `replace`.

**Payload** — giữ mọi trường cũ, thêm:

```jsonc
{
  "mode": "word",                     // chế độ thực tế
  "center": "w:学生",                 // word: id node từ; structure / compounds: "k:X" như cũ
  "chars": ["学", "生"],              // cụm chữ Hán của câu tìm (khử 々 / trùng); [] khi không phải chữ Hán
  "selectedChar": "学",               // chữ đang vẽ ở structure / compounds; null ở word
  "word": {                           // null khi không phải từ
    "term": "学生", "reading": "がくせい", "hanViet": "HỌC SINH", "jlpt": "N5",
    "meaningEn": "student", "key": "w:1206900",
    "chars": [{ "kanji": "学", "hanViet": "HỌC", "meaningEn": "study", "jlpt": "N5",
                "formula": [{ "part": "⺍", "role": "part" }, …], "radical": { … } }, …]
  },
  "wordCandidates": [ { "term": "紙", "reading": "かみ", … } ]   // R2 / R4 nhiều từ; [] còn lại
}
```

Ở chế độ `word`, `detail` là `null` (panel dùng `word`); `candidates` (chữ) luôn `[]`.
Cách đọc của từ khi gõ chữ Hán: cách đọc JLPT nếu có, không thì JMdict thông dụng đầu tiên, không có → `null`.

**Backend** (`NlpService.kanjiDiagram`): `DIAGRAM_MODES` thêm `word`; `mode` rỗng gửi rỗng xuống ai-service (để ai-service tự
chọn) thay vì ép `structure`; kiểm `k`; khoá cache `q|mode|k`; `withMeaningVi` ghép thêm `word` (khoá `word.key`), `word.chars[*]`
(khoá `k:X`) và `wordCandidates[*]` (khoá `key`) trong cùng một truy vấn `dict_meanings`.

## 4. Sơ đồ "Phân tích từ"

**Nội dung** (ai-service `word_diagram(term)`):

- Tâm: node `w:学生`, type `word`, nhãn là từ, kèm `reading`, `hanViet`, `jlpt`, `key`.
- Mỗi chữ: node `k:学`, type `kanji`, `expandable` theo `kanji_parts.csv`; cạnh `w:学生 → k:学` type `contains`.
- Thành phần trực tiếp của từng chữ (`_real_parts`, bỏ part lặp, vai radical / phon / part, chỉ âm đoán mang `guess` như Cấu tạo):
  node type `component`, cạnh `part → chữ` type theo vai.
- Chữ không có dòng trong `kanji_parts.csv` (chữ đơn như 生, 日) chỉ có node chữ, không thành phần. Ví dụ `学生`: 学 ← ⺍ 冖 子 (bộ 子), 生 đứng một mình.
- **Không** vẽ họ chỉ âm và từ ghép ở chế độ này (giữ sơ đồ nhỏ: ≤ 4 chữ × ~4 phần ≈ 20 node).
- Part dùng chung giữa hai chữ (日 trong 明日 nếu cả hai có): một node, hai cạnh. Part trùng một chữ khác trong từ: giữ node chữ,
  thêm cạnh; không bao giờ cạnh tự nối.

**Bố cục** (frontend, hàm thuần `wordLayout` trong `diagramLayout.ts`): tâm giữa; n chữ chia đều trên vòng R = 0,24 cạnh,
bắt đầu từ trái (2 chữ: trái – phải, 3 chữ: tam giác, 4 chữ: chữ thập), thứ tự theo từ; thành phần của mỗi chữ quạt ra phía
ngoài (xa tâm) bằng `placeAround`. Tất định, làm tròn 1 chữ số như `sectorLayout`.

**Tương tác:** chọn node như cũ; **+ / đúp chuột trên chữ** mở thêm bằng `mode=structure` của chữ đó (thêm họ chỉ âm và phần
còn thiếu), không dùng `mode=word`. Shift+Enter trên chữ → đổi tâm sang chữ đó (Cấu tạo).

## 5. Frontend

- **Tab "Phân tích từ"** (icon `join_inner`) chỉ hiện khi `chars.length` 2–4. URL: `?q=学生` (mode rỗng = tự chọn),
  `?q=学生&mode=structure&k=生`. Tab Cấu tạo / Từ ghép trên câu tìm là từ dùng `k` (mặc định chữ đầu).
- **Thanh chọn chữ** trên canvas khi `chars.length ≥ 2`: chip `学生` (về Phân tích từ, ẩn khi > 4 chữ) + chip từng chữ;
  bấm chip chữ → `mode=structure&k=X` (push history). Chip đang vẽ có viền primary. Cụm > 4 chữ hiện thêm dòng xám
  "Từ dài hơn 4 chữ: chọn từng chữ để xem cấu tạo".
- **Chọn từ** (`wordCandidates`): khung như danh sách chữ ứng viên hiện có — mỗi dòng: từ (ruby cách đọc), Hán-Việt, nghĩa,
  cấp JLPT; bấm → `?q=<từ>` (vào Phân tích từ). Tiêu đề: "«がくせい» ứng với n từ — chọn một từ".
- **Panel ở Phân tích từ** (`WordAnalysisPanel`): thẻ từ (ruby, Hán-Việt, nghĩa Việt hoặc Anh, JLPT, "Thêm vào bộ thẻ", "Mở trong
  từ điển"), rồi mỗi chữ một khối gọn: chữ, Hán-Việt, nghĩa, công thức `⺍ + 冖 + 子`, nút "Xem cấu tạo" (→ chip chữ đó).
  Chọn node chữ / thành phần trên sơ đồ → thẻ gọn hiện có (`KanjiCard`).
- Canvas: node tâm type `word` vẽ viên lớn hơn (cỡ chữ 22, bán kính 22) khi là tâm; chú thích chế độ word: tâm từ, chữ trong từ,
  thành phần, cạnh bộ / chỉ âm / thành phần.
- Chỗ đang ngầm coi tâm là chữ Hán (`centerLabel`, `expand` dùng `mode` hiện tại, `activate` recenter) sửa theo §4.
- Autocomplete Hán-Việt giữ như cũ (chỉ gợi ý âm đơn); placeholder: "Gõ chữ Hán, từ (学生), kana hoặc âm Hán-Việt (học sinh)".
- Chip "Thử": thêm `学生`, `học sinh`.

## 6. Kiểm thử

| Tầng | Ca |
| :--- | :--- |
| pytest `test_kanji_diagram.py` | R1: `学生` → từ; `学生です` → 学生; `食べる` → chữ 食; `日本語能力試験` → tâm 日, chars 6, không word. R2: `がくせい` → 学生; `かみ` → ≥ 2 wordCandidates gồm 紙 / 神 / 髪, ≤ 12, JLPT trước. R4: `học sinh` và `hoc sinh` → 学生; âm lạ → rỗng. `k`: `学生 + structure + k=生` vẽ 生; `k` ngoài cụm → chữ đầu. `mode=word` trên 1 chữ → mode thực tế structure. Quét toàn bộ từ JLPT 2–4 chữ ở chế độ word: không node trùng id, không cạnh treo / tự nối / trùng. |
| pytest `test_kanji_info_router.py` | mode rỗng tự chọn; `word`; `k` dài → 400 |
| backend `NlpIT` | mode rỗng chuyển rỗng; `word` ghép meaningVi cho `word`, `word.chars`, `wordCandidates`; cache theo `q\|mode\|k`; `k` dài → 400 |
| frontend selfcheck `diagram.ts` | `wordLayout`: 2 / 3 / 4 chữ đúng hướng, thành phần nằm xa tâm hơn chữ của nó, tất định |
| Kiểm tay | `学生`, `日本語`, `がくせい`, `かみ`, `học sinh`, `日本語能力試験`, Back / Forward giữa chip chữ, mở thêm chữ ở Phân tích từ |

## 7. Rủi ro

- **Hán-Việt nhiều âm phụ thuộc chỉ mục từ** của `han_viet_graph` (JLPT + JMdict, mỗi chữ ≤ `JMDICT_PER_KANJI` từ). Từ hiếm có
  thể không ra; chấp nhận, panel gợi ý gõ chữ Hán.
- **Thiếu `jmdict.sqlite`**: R2 / R4 chỉ còn từ JLPT, cách đọc của từ ngoài JLPT là `null`. Không lỗi.
- **Đổi nghĩa mode rỗng ở backend** (trước ép `structure`): URL cũ `?q=時` vẫn ra Cấu tạo vì 時 là một chữ; `?q=学生` cũ (từng ra
  Cấu tạo 学) nay ra Phân tích từ — đúng ý W3.
