# Kế hoạch triển khai: Sơ đồ chữ Hán — từ nhiều chữ, kana, Hán-Việt nhiều âm ("Phân tích từ")

> **Cho agent thực thi:** BẮT BUỘC dùng superpowers:subagent-driven-development (khuyên dùng) hoặc superpowers:executing-plans,
> làm từng task. Các bước dùng checkbox `- [ ]` để theo dõi.

Ngày 30/10/2026 · nhánh `Graph` · trạng thái: **đã làm 30/10** (pytest / NlpIT / selfcheck / lint / build xanh; API ai-service thật kiểm 10 câu tìm), **chưa bấm thử trên trình duyệt**.

**Mục tiêu:** gõ `学生`, `がくせい` hay `học sinh` thì sơ đồ hiểu là một từ: vẽ chế độ "Phân tích từ", có thanh chọn chữ và bước
chọn từ khi một câu tìm ứng với nhiều từ.

**Kiến trúc:** ai-service quyết định câu tìm là chữ / từ / danh sách chọn (`resolve`) và dựng payload chế độ `word`; backend
chuyển tiếp tham số mới, ghép nghĩa Việt cho các trường mới và cache theo `q|mode|k`; frontend thêm tab, thanh chọn chữ, khung chọn
từ, panel từ và bố cục `wordLayout`.

**Công nghệ:** FastAPI + pytest (ai-service), Spring Boot + JUnit/Mockito + Postgres nhúng (backend), React 19 + TS + selfcheck Node.

**Spec:** [../specs/2026-10-30-so-do-chu-han-tu-nhieu-chu-design.md](../specs/2026-10-30-so-do-chu-han-tu-nhieu-chu-design.md)
(đọc cùng spec gốc [../specs/2026-10-30-so-do-chu-han-design.md](../specs/2026-10-30-so-do-chu-han-design.md)).

## Điều kiện trước khi bắt đầu

- **Index git phải sạch.** Ngày 30/10 còn 172 file test đang ở trạng thái "đã gỡ khỏi Git" trong index (lệnh `git rm --cached` của
  phiên trước, `.gitignore` đã được trả lại nhưng index thì chưa). Commit bất kỳ khi index như vậy sẽ xoá toàn bộ test khỏi repo.
  Người dùng quyết định: `git restore --staged .` rồi `git status` không còn dòng `D ` nào. **Không bắt đầu Task 1 khi chưa xong.**
- Mỗi commit dùng `git add <đúng các file của task>`; tài liệu dưới `docs/` cần `git add -f` (thư mục bị gitignore).

## Ràng buộc chung (từ spec)

- Cụm chữ Hán liền nhau đầu tiên của câu tìm; từ = **2–4** chữ khác nhau; ≥ 5 chữ → không có chế độ word.
- `wordCandidates` tối đa **12**, JLPT trước (cấp dễ → khó), rồi JMdict thông dụng, rồi `han_viet_graph._word_sort_key`.
- `mode`: `structure` | `compounds` | `word` | rỗng (= tự chọn); lạ → 400. `k`: một chữ Hán, dài > 2 đơn vị UTF-16 → 400;
  không thuộc cụm → dùng chữ đầu. `mode=word` khi không phải từ 2–4 chữ → trả như `structure`, trường `mode` ghi chế độ thực tế.
- Payload giữ mọi trường cũ, thêm `chars`, `selectedChar`, `word`, `wordCandidates`; ở `word`: `center = "w:<từ>"`, `detail = null`,
  `candidates = []`.
- Không gọi Gemini; nghĩa Việt chỉ từ `dict_meanings` trong **một** truy vấn; cache backend 10 phút theo `q|mode|k`.
- Chế độ word **không** vẽ họ chỉ âm / từ ghép; mở thêm chữ dùng `mode=structure`.
- Không thêm thư viện; không migration.

## Trọng tâm review (đầu vào dễ hỏng mà spec ngầm định)

1. **Câu tìm có khoảng trắng / dấu câu quanh chữ Hán** (`" 学生。"`) → vẫn là từ 学生. Test thêm ở Task 1.
2. **Katakana** (`ガクセイ`) phải ra như hiragana. Test thêm ở Task 1.
3. **Hán-Việt hoa / thường / thừa khoảng trắng** (`"  Học   SINH "`) → 学生. Test thêm ở Task 1.
4. **Từ có chữ lặp hoặc 々** (`人々`, `時時`) không sinh node trùng / cạnh tự nối. Phủ bởi quét JLPT ở Task 2, thêm ca `人々`.
5. **Back / Forward giữa chip chữ và Phân tích từ** không lẫn trạng thái mở thêm / zoom (khoá overlay phải gồm `k`). Test tay ở
   Task 5, và khoá `q|mode|k` kiểm trong selfcheck Task 4 qua hàm thuần `diagramKey`.

---

### Task 1: ai-service — phân giải câu tìm (R1–R5)

**Files:**
- Modify: `ai-service/app/extract/kanji_diagram.py` (khối `resolve`)
- Test: `ai-service/tests/test_kanji_diagram.py` (khối resolve; sửa 3 test resolve cũ vì kiểu trả về thêm khoá)

**Interfaces:**
- Produces:
  - `resolve(q: str) -> dict` với khoá cố định `{"center": str|None, "candidates": list[dict], "term": str|None,
    "chars": list[str], "wordCandidates": list[dict]}`. `center` = chữ khi tâm là chữ; `term` = từ 2–4 chữ khi tâm là từ (lúc đó
    `center` = chữ đầu của từ, để `structure` / `compounds` dùng mặc định); `chars` = cụm chữ Hán đã khử 々 / trùng.
  - `kanji_run(text: str) -> list[str]`: cụm chữ Hán thật liền nhau đầu tiên (々〆ヶ không cắt cụm, bị bỏ khỏi kết quả), khử trùng giữ thứ tự.
  - `word_candidate(w: dict) -> dict` từ một mục `han_viet_graph.words_of`: `{term, reading, hanViet, jlpt, meaningEn, key}` (key qua `_word_key` sẵn có).
  - `MAX_WORD_CHARS = 4`, `MAX_WORD_CANDIDATES = 12`.

- [ ] **Bước 1: viết test hỏng**

```python
def test_resolve_word_from_kanji_run():
    r = kanji_diagram.resolve(" 学生です。")
    assert r["term"] == "学生" and r["chars"] == ["学", "生"] and r["center"] == "学"
    assert kanji_diagram.resolve("食べる")["term"] is None and kanji_diagram.resolve("食べる")["center"] == "食"
    long = kanji_diagram.resolve("日本語能力試験")
    assert long["term"] is None and long["center"] == "日" and len(long["chars"]) == 6
    assert kanji_diagram.resolve("人々")["chars"] == ["人"]

def test_resolve_kana_gives_word_or_candidates():
    assert kanji_diagram.resolve("がくせい")["term"] == "学生"
    assert kanji_diagram.resolve("ガクセイ")["term"] == "学生"
    r = kanji_diagram.resolve("かみ")
    terms = [w["term"] for w in r["wordCandidates"]]
    assert r["term"] is None and len(terms) >= 2 and "紙" in terms and len(terms) <= kanji_diagram.MAX_WORD_CANDIDATES
    assert set(r["wordCandidates"][0]) == {"term", "reading", "hanViet", "jlpt", "meaningEn", "key"}
    jl = [w["jlpt"] is not None for w in r["wordCandidates"]]
    assert jl == sorted(jl, reverse=True)          # JLPT trước

def test_resolve_han_viet_multi_syllable():
    for q in ("học sinh", "hoc sinh", "  Học   SINH "):
        assert kanji_diagram.resolve(q)["term"] == "学生", q
    assert kanji_diagram.resolve("xyz abc")["term"] is None
```

Sửa 3 test resolve cũ: so `r["center"]` / `r["candidates"]` thay vì so cả dict.

- [ ] **Bước 2: chạy, xác nhận hỏng**

Chạy: `venv/Scripts/python -m pytest tests/test_kanji_diagram.py -k resolve -q`
Mong đợi: FAIL (`KeyError: 'term'`).

- [ ] **Bước 3: cài đặt trong `kanji_diagram.py`**

- R1 dùng `kanji_run`; `term` chỉ khi 2 ≤ len ≤ `MAX_WORD_CHARS`; `"".join(run)` là term **sau** khử 々 thì sai với `人々` —
  term lấy nguyên chuỗi gốc của cụm (gồm 々), `chars` mới khử.
- R2: `is_kana_only(text.replace(" ", ""))` → ứng viên = `classifier.homophones_jlpt(kata_to_hira(...))` (cấp dễ → khó) rồi
  JMdict `SELECT kanji, kana, gloss FROM entries WHERE common=1 AND kanji IS NOT NULL AND kana=?` (đọc qua `jmdict.DATA_FILE`, chế độ
  `?mode=ro` như `han_viet_graph._jmdict_index`, lỗi sqlite → bỏ qua); giữ từ có 1–`MAX_WORD_CHARS` chữ Hán; khử trùng theo term.
- R4: tách `text.split()` khi 2–4 âm; tập chữ âm i = hợp các chữ của `han_viet_graph.kanji_for(âm_i)`; ứng viên từ
  `words_of(c)` với c thuộc tập âm 0, `len(term) == n` và `term[i]` thuộc tập âm i; khử trùng; xếp `_word_sort_key`.
- R2 / R4: 1 ứng viên → xử lý như R1 với term đó; nhiều → `wordCandidates` (≤ 12) qua `word_candidate`.
- Thứ tự luật đúng như bảng §2 spec; R3 / R5 giữ code cũ.

- [ ] **Bước 4: chạy lại**

Chạy: `venv/Scripts/python -m pytest tests/test_kanji_diagram.py -q`
Mong đợi: PASS toàn file (test structure / compounds cũ không đổi vì `diagram` chưa sửa).

- [ ] **Bước 5: commit**

```bash
git add ai-service/app/extract/kanji_diagram.py ai-service/tests/test_kanji_diagram.py
git commit -m "ai-service: sơ đồ chữ Hán phân giải từ nhiều chữ, kana và Hán-Việt nhiều âm (spec 30/10 từ nhiều chữ §2)"
```

---

### Task 2: ai-service — chế độ `word`, tham số `k`, route

**Files:**
- Modify: `ai-service/app/extract/kanji_diagram.py` (`MODES`, `word_diagram`, `diagram`)
- Modify: `ai-service/app/api/kanji_info_router.py` (`get_diagram`)
- Test: `ai-service/tests/test_kanji_diagram.py`, `ai-service/tests/test_kanji_info_router.py`

**Interfaces:**
- Consumes: `resolve`, `word_candidate`, `kanji_run` (Task 1); `_real_parts`, `_phon_of`, `_role`, `_kanji_node`, `_word_key` sẵn có.
- Produces:
  - `MODES = ("structure", "compounds", "word")`.
  - `word_diagram(term: str) -> dict` → `{nodes, edges, word, stats}` (node / cạnh theo §4 spec; `word` theo §3 spec, mỗi
    `word.chars[i]` = `{kanji, hanViet, meaningEn, jlpt, formula, radical}` với `formula` = `[{part, original, position, role, hanViet, guess?}]` như `detail`).
  - `diagram(q: str, mode: str | None = None, k: str | None = None) -> dict`: payload cũ + `chars`, `selectedChar`, `word`,
    `wordCandidates`; `mode` trong payload là chế độ thực tế.
  - Route `GET /api/kanji-info/diagram?q=&mode=&k=`: `mode` rỗng / thiếu → `None`; `k` `max_length=2`.

- [ ] **Bước 1: test hỏng**

```python
def test_word_mode_gakusei():
    p = kanji_diagram.diagram("学生")
    assert p["mode"] == "word" and p["center"] == "w:学生" and p["detail"] is None and p["candidates"] == []
    assert p["chars"] == ["学", "生"] and p["selectedChar"] is None
    assert p["word"]["term"] == "学生" and p["word"]["reading"] == "がくせい" and p["word"]["hanViet"] == "HỌC SINH"
    e = _edges(p)
    assert ("w:学生", "k:学", "contains") in e and ("w:学生", "k:生", "contains") in e
    assert ("k:子", "k:学", "radical") in e and _nodes(p)["k:生"]["type"] == "kanji"
    assert not _nodes(p, "phonetic") and not [n for n in p["nodes"] if n["type"] == "word" and n["id"] != "w:学生"]
    assert [f["part"] for f in p["word"]["chars"][0]["formula"]] == ["⺍", "冖", "子"]

def test_word_mode_k_and_fallbacks():
    s = kanji_diagram.diagram("学生", "structure", "生")
    assert s["mode"] == "structure" and s["center"] == "k:生" and s["selectedChar"] == "生" and s["chars"] == ["学", "生"]
    assert kanji_diagram.diagram("学生", "structure", "水")["center"] == "k:学"    # k ngoài cụm → chữ đầu
    one = kanji_diagram.diagram("時", "word")
    assert one["mode"] == "structure" and one["center"] == "k:時"
    assert kanji_diagram.diagram("時")["mode"] == "structure"
    assert kanji_diagram.diagram("日本語能力試験")["mode"] == "structure" and kanji_diagram.diagram("日本語能力試験")["word"] is None
    cands = kanji_diagram.diagram("かみ")
    assert cands["center"] is None and cands["wordCandidates"] and cands["nodes"] == []

def test_word_mode_never_breaks_across_jlpt_words():
    bad = []
    for term in sorted({e[0] for ch in classifier.jlpt_kanji_set() for e in classifier.entries_containing(ch)}):
        run = kanji_diagram.kanji_run(term)
        if not (2 <= len(run) <= 4) or "".join(run) != term:
            continue
        p = kanji_diagram.diagram(term, "word")
        ids = [n["id"] for n in p["nodes"]]
        keys = [(e["from"], e["to"], e["type"]) for e in p["edges"]]
        if len(ids) != len(set(ids)) or len(keys) != len(set(keys)) or any(a == b for a, b, _ in keys) \
                or any(a not in ids or b not in ids for a, b, _ in keys):
            bad.append(term)
    assert bad == []
```

Router (`test_kanji_info_router.py`): fake `diagram(q, mode=None, k=None)` ghi `calls["diagram"] = (q, mode, k)`;
`GET ?q=学生` → `("学生", None, None)`; `?q=学生&mode=word&k=生` → `("学生", "word", "生")`; `?mode=tree` → 400;
`?k=` dài 3 ký tự → 422. Sửa test cũ `test_diagram_params_and_defaults` cho bộ ba.

- [ ] **Bước 2: chạy, xác nhận hỏng** — `pytest tests/test_kanji_diagram.py tests/test_kanji_info_router.py -q`: FAIL.

- [ ] **Bước 3: cài đặt**

- `diagram`: `m = mode or ("word" if r["term"] else "structure")`; `m == "word"` mà không có `term` → `"structure"`; mode ngoài
  `MODES` → `ValueError` (router đổi 400 như cũ, kiểm trong route trước khi gọi). Chữ vẽ cho structure / compounds = `k` nếu
  `k in r["chars"]`, không thì `r["center"]`. `selectedChar` = chữ đó (None ở word). `word` có ở mọi chế độ khi `term` có.
- `word_diagram`: reading của từ = `classifier.entries_of(term)` đầu tiên, không có thì JMdict thông dụng đầu tiên, không có →
  `None`; khử trùng node theo id, bỏ cạnh tự nối, giữ node chữ khi part trùng một chữ trong từ.
- Route: `mode: Optional[str] = Query(None)`, chuỗi rỗng coi như `None`; `k: Optional[str] = Query(None, max_length=2)`.

- [ ] **Bước 4: chạy** — `pytest tests/test_kanji_diagram.py tests/test_kanji_info_router.py tests/test_kanjidata_parts.py -q`: PASS.

- [ ] **Bước 5: commit** — `git add` 4 file trên; message: `ai-service: chế độ "Phân tích từ" (mode word) + tham số k cho sơ đồ chữ Hán (spec 30/10 từ nhiều chữ §3–4)`.

---

### Task 3: backend — tham số mới, ghép nghĩa Việt, cache

**Files:**
- Modify: `backend-core/src/main/java/com/pbl6/flashcard/service/NlpService.java` (`DIAGRAM_MODES`, `kanjiDiagram`, `withMeaningVi`)
- Modify: `backend-core/src/main/java/com/pbl6/flashcard/service/AiServiceClient.java` (`kanjiDiagram`)
- Modify: `backend-core/src/main/java/com/pbl6/flashcard/controller/NlpController.java` (`kanjiDiagram`)
- Test: `backend-core/src/test/java/com/pbl6/flashcard/controller/NlpIT.java`, `.../service/AiServiceClientNlpTest.java`

**Interfaces:**
- Consumes: payload Task 2.
- Produces:
  - `AiServiceClient.kanjiDiagram(String q, String mode, String k)`: `mode` / `k` null hoặc rỗng → **không** gửi tham số đó.
  - `NlpService.kanjiDiagram(String q, String mode, String k)`: `DIAGRAM_MODES = List.of("structure", "compounds", "word")`;
    mode rỗng → `null` (không ép structure); `k` trim, rỗng → null, `k.length() > 2` → 400; cache key `"diagram|" + q + "|" + m + "|" + k`.
  - `withMeaningVi` thêm khoá: `word.key`, `word.chars[*].kanji` (k:X), `wordCandidates[*].key`; ghi `meaningVi` vào đúng các object đó.
  - Controller: thêm `@RequestParam(required = false) String k`.

- [ ] **Bước 1: test hỏng**

`AiServiceClientNlpTest`: `client.kanjiDiagram("学生", null, null)` → query chỉ có `q` (không có `mode`, `k`);
`client.kanjiDiagram("学生", "structure", "生")` → `mode=structure`, `k=生`.

`NlpIT` thêm `kanji_diagram_word_mode_meaning_and_cache_key()`:
- seed `dict_meanings` cho `w:1206900` ("học sinh"), `k:学` ("học"), `w:9999` ("giấy");
- stub `ai.kanjiDiagram("学生", null, null)` trả payload có `word{key:"w:1206900", chars:[{kanji:"学"}]}`, `wordCandidates:[]`;
  gọi `?q=学生` → `word.meaningVi == "học sinh"`, `word.chars[0].meaningVi == "học"`;
- stub `ai.kanjiDiagram("かみ", null, null)` trả `wordCandidates:[{key:"w:9999"}]` → `wordCandidates[0].meaningVi == "giấy"`;
- gọi `?q=学生&mode=structure&k=生` hai lần → `verify(ai, times(1)).kanjiDiagram("学生", "structure", "生")`;
- `?q=学生&k=学生x` → 400, `never().kanjiDiagram(eq("学生"), any(), eq("学生x"))`; `?mode=word` hợp lệ.
Sửa các `kanjiDiagram(..., ...)` cũ trong `NlpIT` sang ba tham số (`"時", "structure", null`; ca không có mode → `null`).

- [ ] **Bước 2: chạy, xác nhận hỏng** — `cd backend-core && mvn -q test -Dtest=NlpIT,AiServiceClientNlpTest`: lỗi biên dịch / FAIL.
  (Nếu `NoClassDefFound AiServiceClient`: xoá `target/test-classes/com/pbl6/flashcard/controller/NlpIT*.class` rồi chạy lại.)

- [ ] **Bước 3: cài đặt** theo Interfaces; giữ một truy vấn `dictionary.meanings(keys)`.

- [ ] **Bước 4: chạy** — lệnh trên: NlpIT, AiServiceClientNlpTest xanh.

- [ ] **Bước 5: commit** — `git add` 5 file; message: `backend: sơ đồ chữ Hán mode word / tham số k, ghép nghĩa Việt cho từ và ứng viên từ, cache q|mode|k`.

---

### Task 4: frontend — kiểu dữ liệu, service, bố cục `wordLayout`

**Files:**
- Modify: `frontend/src/types/kanjiDiagram.types.ts`
- Modify: `frontend/src/services/kanjiDiagramService.ts`
- Modify: `frontend/src/features/graph/diagramLayout.ts`
- Test: `frontend/scripts/selfcheck/diagram.ts`

**Interfaces:**
- Produces:
  - `KanjiDiagramMode = "structure" | "compounds" | "word"`.
  - `KanjiDiagramResponse` thêm `chars: string[]`, `selectedChar: string | null`, `word: KanjiDiagramWordInfo | null`,
    `wordCandidates: KanjiDiagramWord[]`; `KanjiDiagramWordInfo = KanjiDiagramWord & { chars: KanjiDiagramWordChar[] }`;
    `KanjiDiagramWordChar = { kanji; hanViet; meaningEn; meaningVi?; jlpt; formula: KanjiDiagramFormulaPart[]; radical: KanjiDiagramRadical | null }`.
  - `fetchKanjiDiagram(q: string, mode?: KanjiDiagramMode | null, k?: string | null, signal?)`: không gửi `mode` / `k` khi null.
  - `wordLayout(nodes, edges, centerId: string, size: number): DiagramPositions` (thuần, tất định, làm tròn 1 chữ số).
  - `diagramKey(q: string, mode: KanjiDiagramMode | null, k: string | null): string` = `` `${q}|${mode ?? ""}|${k ?? ""}` ``.
  - `WORD_MIN_CHARS = 2`, `WORD_MAX_CHARS = 4`.

- [ ] **Bước 1: selfcheck hỏng** — trong `runDiagramChecks`:
  - 2 chữ: chữ thứ nhất có `x` < tâm, chữ thứ hai `x` > tâm; 3 / 4 chữ: mọi chữ cách tâm ≈ `0.24 * size` (sai số 1).
  - mỗi thành phần cách tâm xa hơn chữ của nó (cạnh part → chữ); hai lần gọi cùng đầu vào cho kết quả bằng nhau (`JSON.stringify`).
  - `diagramKey("学生", null, null) !== diagramKey("学生", "structure", "生")`.
- [ ] **Bước 2:** `cd frontend && npm run selfcheck` → FAIL (`wordLayout` chưa có).
- [ ] **Bước 3: cài đặt** — chữ (node có cạnh `contains` từ tâm, theo thứ tự cạnh) trên vòng R = 0,24 cạnh, góc bắt đầu 180°
  (bên trái) chia đều 360°/n; thành phần của mỗi chữ = `placeAround(vị trí chữ, ids, positions hiện có, 90)`; node còn lại → vòng ngoài như `sectorLayout`.
- [ ] **Bước 4:** `npm run selfcheck && npm run lint && ./node_modules/.bin/tsc -b` → xanh (tsc có thể báo lỗi ở trang vì kiểu mode mới:
  sửa tối thiểu `MODES` trong `KnowledgeGraphPage.tsx` để biên dịch, giao diện thật ở Task 5).
- [ ] **Bước 5: commit** — `git add` 4 file (+ trang nếu sửa); message: `frontend: kiểu dữ liệu + wordLayout cho chế độ Phân tích từ của sơ đồ chữ Hán`.

---

### Task 5: frontend — tab "Phân tích từ", thanh chọn chữ, chọn từ, panel từ

**Files:**
- Modify: `frontend/src/pages/KnowledgeGraphPage.tsx`
- Modify: `frontend/src/features/graph/components/KanjiDiagramCanvas.tsx`
- Modify: `frontend/src/features/graph/components/KanjiDiagramPanel.tsx`
- Create: `frontend/src/features/graph/components/WordAnalysisPanel.tsx`
- Create: `frontend/src/features/graph/components/DiagramCharBar.tsx`

**Interfaces:**
- Consumes: Task 4 (`fetchKanjiDiagram`, `wordLayout`, `diagramKey`, kiểu mới).
- Produces:
  - `DiagramCharBar({ word: string | null, chars: string[], active: string | null, onWord(): void, onChar(ch: string): void })`:
    chip từ (ẩn khi `chars.length > 4` hoặc `word` null) + chip từng chữ, chip đang vẽ viền primary; > 4 chữ hiện dòng
    "Từ dài hơn 4 chữ: chọn từng chữ để xem cấu tạo".
  - `WordAnalysisPanel({ word: KanjiDiagramWordInfo, onChar(ch): void, onAddWord(w: HanVietWordNode): void })` theo §5 spec.
  - `KanjiDiagramCanvas` thêm prop `layout: "sector" | "word"`; node tâm type `word` vẽ cỡ chữ 22, bán kính 22; chú thích chế độ word:
    "từ đang xét", "chữ trong từ", "thành phần", cạnh bộ / chỉ âm / thành phần.

- [ ] **Bước 1: trang** — URL: `mode` đọc thô (`null` khi thiếu), `k` từ `?k=`; `mode` thực tế lấy từ `data.mode`, khác URL (và URL
  có mode) → `go({mode: data.mode}, true)`. Khoá overlay / chọn node = `diagramKey(q, modeUrl, k)`. Tab "Phân tích từ"
  (icon `join_inner`) chỉ khi `data.chars.length` 2–4. `go` nhận thêm `k` (rỗng → xoá); đổi `q` luôn xoá `k`.
  Bấm chip chữ → `go({mode: "structure", k: ch})`; chip từ → `go({mode: null, k: ""})`. `expand` luôn gọi
  `fetchKanjiDiagram(ch, "structure")` khi trang đang ở word, giữ `mode` khi ở structure / compounds. `centerLabel` đọc
  `data.word?.term ?? data.center?.slice(2)`. Placeholder và chip "Thử" (`学生`, `học sinh`) theo §5 spec.
- [ ] **Bước 2: chọn từ** — `data.center == null && data.wordCandidates.length` → khung "«q» ứng với n từ — chọn một từ"
  (dòng: ruby, Hán-Việt, nghĩa, `LevelChip`); bấm → `draw(term)`. Panel bên phải cùng danh sách.
- [ ] **Bước 3: panel** — `KanjiDiagramPanel`: ở word và node chọn là tâm → `WordAnalysisPanel`; node khác → thẻ gọn cũ.
  "Xem cấu tạo" trong panel = `onChar`.
- [ ] **Bước 4: kiểm** — `npm run lint && npm run build && npm run selfcheck` xanh. Kiểm tay (dev server, ai-service + backend thật):
  `学生` (Phân tích từ, chip 学 生), bấm 生 → Cấu tạo 生 rồi Back về Phân tích từ với zoom về khung vừa; `日本語`; `がくせい`;
  `かみ` (chọn từ); `học sinh`; `日本語能力試験` (chỉ chip chữ + dòng xám); `時` (không có tab Phân tích từ); mở thêm 学 ở Phân tích từ.
  Ghi kết quả vào `docs/Plan/reports/2026-10-30-so-do-chu-han.md` mục mới.
- [ ] **Bước 5: commit** — `git add` 5 file; message: `frontend: chế độ Phân tích từ, thanh chọn chữ và chọn từ cho sơ đồ chữ Hán (spec 30/10 từ nhiều chữ §5)`.

---

### Task 6: tài liệu

**Files:** `docs/CHANGELOG.md`, `docs/Plan/README.md`, spec này (dòng trạng thái), kế hoạch này (dòng trạng thái), `docs/USE_CASES_CHECKLIST.md` (UC sơ đồ chữ Hán: thêm tra bằng từ / kana / Hán-Việt nhiều âm).

- [ ] Ghi CHANGELOG mục 30/10 "Sơ đồ chữ Hán: Phân tích từ" (luật phân giải, mode word, tham số k, không migration, kết quả test).
- [ ] Đổi trạng thái spec / kế hoạch / dòng Plan README thành "Đã làm 30/10, chưa kiểm tay" (hoặc "đã kiểm tay" nếu Task 5 bước 4 xong).
- [ ] `git add -f` các file trên; commit `docs: sơ đồ chữ Hán Phân tích từ — CHANGELOG, trạng thái spec / kế hoạch`.
