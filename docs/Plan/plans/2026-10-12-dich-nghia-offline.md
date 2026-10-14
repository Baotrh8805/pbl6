# Kế hoạch triển khai: dịch nghĩa EN → VI offline bằng NLLB (CTranslate2), gỡ Gemini khỏi bước dịch

> **Trạng thái: ĐÃ HOÀN TÁC (12/10/2026), không có trong code.** Đã làm thử rồi gỡ theo yêu cầu; bước ENRICH vẫn dùng Gemini.
> Giữ file này làm tài liệu tham khảo, đừng thực thi lại khi chưa hỏi lại nhóm.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bước ENRICH dịch gloss tiếng Anh (và câu ví dụ tiếng Nhật) sang tiếng Việt bằng model NLLB-200 chạy trong ai-service, không cần key, có bộ nhớ dịch; Gemini chỉ còn dùng cho Vision OCR.

**Architecture:** `translator.py` bọc CTranslate2 + SentencePiece (singleton lười); `tm.py` là bộ nhớ dịch SQLite; `enrich.py` gom logic ENRICH (gộp trùng → tra TM → dịch → lọc → lưu TM) và giữ nguyên hợp đồng `POST /api/extract/enrich` nên backend không đổi. Model tải bằng `scripts/build_dicts.py --models` (ghim commit), không commit vào git.

**Tech Stack:** Python 3.14 (`ai-service/venv`), FastAPI, `ctranslate2>=4.8.0`, `sentencepiece>=0.2.0`, SQLite stdlib; frontend React/TS chỉ đổi chuỗi.

**Spec:** `docs/Plan/specs/2026-10-12-dich-nghia-offline-design.md`

**Không commit** trong lúc thực hiện (anh/chị commit khi duyệt). Model và TM nằm ngoài git.

## Global Constraints

- Chỉ thêm 2 dependency: `ctranslate2>=4.8.0`, `sentencepiece>=0.2.0` (đã có wheel cp314 win_amd64). Không torch, không transformers.
- Model: `JustFrederik/nllb-200-distilled-600M-ct2-int8`, commit `302d78f00e6fdb50a1064059df7c392b735e9d05`, 4 file `model.bin`, `config.json`, `shared_vocabulary.txt`, `sentencepiece.bpe.model`; thư mục `ai-service/app/extract/data/models/nllb-200-distilled-600M-ct2-int8/`. Giấy phép CC-BY-NC 4.0 phải ghi trong `data/README.md`.
- Tham số dịch: `compute_type="int8"`, `inter_threads=1`, `intra_threads=min(4, os.cpu_count() or 1)`, `beam_size=2`, `max_decoding_length=96`, `max_batch_size=32`, đầu vào cắt 300 ký tự. Mã ngôn ngữ `eng_Latn`, `jpn_Jpan`, `vie_Latn`.
- **Không bao giờ** dịch `term` tiếng Nhật rời (Q4); câu ví dụ dịch khi `example` ≥ 8 ký tự và kết thúc bằng `。！？!?.` hoặc ≥ 12 ký tự, và có chữ Nhật.
- Hợp đồng `/enrich` không đổi: vào `{targetLang, items[{ref, term, reading, pos, meaningEn, example}]}`, ra `{enriched, items[{ref, meaningVi, exampleVi}], reason}`; `reason ∈ {null, "no_model", "error"}`. Lọc `MAX_MEANING_CHARS = 120`, `MAX_EXAMPLE_CHARS = 500`, không chữ Nhật.
- Gemini Vision OCR (`gemini.vision_transcribe`, retry, `GEMINI_FALLBACK_MODEL`) **giữ nguyên** (Q1 = A).
- Model không nạp lúc khởi động; CI không có model → test thật tự skip, test logic dùng mock. Test chạy: `cd ai-service && PYTHONIOENCODING=utf-8 ./venv/Scripts/python.exe -m pytest <path> -q`.
- Chuỗi người dùng thấy bằng tiếng Việt.

## Review Focus

1. Hai request `/enrich` đến cùng lúc khi model chưa nạp → chỉ nạp một lần, không lỗi — Task 1 `test_lazy_load_is_thread_safe` (mock `ctranslate2.Translator` đếm số lần khởi tạo).
2. Thư mục model có đủ tên file nhưng `model.bin` hỏng → `/enrich` trả `enriched=false, reason="error"`, server không chết, lần sau vẫn thử lại được — Task 1 `test_corrupt_model_reports_error`.
3. Gloss model không dịch được, trả nguyên chuỗi ("OK", "PC") → không ghi thành nghĩa VI — Task 3 `test_identity_translation_dropped`.
4. File `translations.sqlite` lỗi (khoá / hỏng) → ENRICH vẫn dịch, chỉ mất cache — Task 2 `test_tm_failure_is_swallowed`.
5. Câu ví dụ là rác OCR không có chữ Nhật, hoặc term có `example` trùng `term` (chế độ list không có example) → không gọi dịch — Task 3 `test_example_rules`.

---

### Task 1: `translator.py`, tải model, dependency, test thật

**Files:**
- Create: `ai-service/app/extract/translator.py`, `ai-service/tests/test_translator.py`
- Modify: `ai-service/requirements.txt`, `ai-service/scripts/build_dicts.py` (`--models`, hàm `build_models`), `ai-service/app/extract/data/README.md`, `.gitignore`
- Model: copy 4 file đã tải trong spike từ `C:\Users\Admin\AppData\Local\Temp\claude\d--Chap-7-PBL6-Code-final-pbl6\4778cb96-b403-41b6-a1b9-0e23ea9cbc4f\scratchpad\nllb_dl\` vào `ai-service/app/extract/data/models/nllb-200-distilled-600M-ct2-int8/`; cài `./venv/Scripts/python.exe -m pip install ctranslate2 sentencepiece` (wheel sẵn ở `...\scratchpad\wheels\`).

**Interfaces:**
- Produces:
  - `translator.MODEL_DIR: Path`, `translator.REQUIRED_FILES = ("model.bin", "config.json", "shared_vocabulary.txt", "sentencepiece.bpe.model")`, `translator.ENGINE = "nllb-200-distilled-600M-ct2-int8"`, `translator.MAX_INPUT_CHARS = 300`.
  - `class TranslatorError(RuntimeError)` với `.reason ∈ {"no_model", "error"}`.
  - `available() -> bool` — đủ 4 file, mỗi file > 0 byte (không nạp model).
  - `translate(texts: list[str], src: str = "eng_Latn", tgt: str = "vie_Latn") -> list[str]` — cùng độ dài `texts`; chuỗi rỗng/trắng → `""` không qua model; nạp lười dưới `threading.Lock`; lỗi nạp/dịch → `TranslatorError("error")`, thiếu model → `TranslatorError("no_model")`; sau lỗi nạp, lần gọi sau thử nạp lại.
  - `_load() -> tuple[ctranslate2.Translator, sentencepiece.SentencePieceProcessor]` (module-level, để test mock).
  - `build_dicts.py --only models` / `--models` tải 4 file từ `https://huggingface.co/JustFrederik/nllb-200-distilled-600M-ct2-int8/resolve/302d78f00e6fdb50a1064059df7c392b735e9d05/<file>` qua `_download` sẵn có, báo lỗi nếu `model.bin` < 500 MB.

- [ ] **Step 1: Viết test**

```python
# ai-service/tests/test_translator.py
import threading
from types import SimpleNamespace

import pytest

from app.extract import translator

needs_model = pytest.mark.skipif(not translator.available(), reason="chưa tải model (scripts/build_dicts.py --models)")

# (gloss, các từ khoá chấp nhận — khớp ít nhất một) lấy từ spike 12/10/2026
GLOSSES = [
    ("withdraw some money from your account", ["rút", "tài khoản"]),
    ("put money in a bank account", ["tài khoản ngân hàng"]),
    ("bank account", ["tài khoản ngân hàng"]),
    ("be paid by automatic bank transfer", ["chuyển khoản", "tự động"]),
    ("pay tuition fees with a bank transfer", ["học phí"]),
    ("transfer a monthly rent", ["thuê", "hàng tháng"]),
    ("bank transfer", ["chuyển khoản"]),
    ("pay the utility charges", ["phí"]),
    ("payment", ["thanh toán"]),
    ("a bank charge", ["phí ngân hàng"]),
    ("income/revenue", ["thu nhập"]),
    ("expenditure", ["chi"]),
    ("deficit / in the red", ["thâm hụt"]),
    ("profits / in the black", ["lợi nhuận"]),
    ("eat out", ["ăn ngoài"]),
    ("cook one's own meals", ["nấu"]),
    ("costly", ["đắt", "tốn"]),
    ("a poor diet", ["ăn", "kém"]),
    ("a balanced meal", ["cân bằng"]),
    ("school", ["trường"]),
]


@needs_model
def test_translate_glosses_meet_quality_bar():
    out = translator.translate([g for g, _ in GLOSSES])
    assert len(out) == len(GLOSSES)
    ok = sum(1 for (_, keys), vi in zip(GLOSSES, out) if any(k in vi.lower() for k in keys))
    assert ok >= 18, list(zip([g for g, _ in GLOSSES], out))
    assert all("▁" not in vi and vi == vi.strip() for vi in out)


@needs_model
def test_translate_japanese_sentence_and_empty():
    out = translator.translate(["昨日は友達と一緒に映画を見に行きました。", "", "   "], src="jpn_Jpan")
    assert "phim" in out[0].lower() and out[1] == "" and out[2] == ""


@needs_model
def test_long_input_is_cut_not_crashed():
    out = translator.translate(["bank account " * 100])
    assert out[0]


def test_no_model_reason(monkeypatch, tmp_path):
    monkeypatch.setattr(translator, "MODEL_DIR", tmp_path / "missing")
    monkeypatch.setattr(translator, "_engine", None)
    assert translator.available() is False
    with pytest.raises(translator.TranslatorError) as exc:
        translator.translate(["x"])
    assert exc.value.reason == "no_model"


def test_corrupt_model_reports_error(monkeypatch, tmp_path):
    d = tmp_path / "m"; d.mkdir()
    for f in translator.REQUIRED_FILES:
        (d / f).write_bytes(b"junk")
    monkeypatch.setattr(translator, "MODEL_DIR", d)
    monkeypatch.setattr(translator, "_engine", None)
    assert translator.available() is True
    for _ in range(2):                      # lần sau vẫn thử lại, không kẹt ở trạng thái lỗi
        with pytest.raises(translator.TranslatorError) as exc:
            translator.translate(["bank"])
        assert exc.value.reason == "error"


def test_lazy_load_is_thread_safe(monkeypatch):
    loads = []

    class _Sp:
        def encode(self, s, out_type=str): return list(s)
        def decode_pieces(self, p): return "".join(p)

    class _Tr:
        def __init__(self): loads.append(1)
        def translate_batch(self, toks, **kw):
            return [SimpleNamespace(hypotheses=[["vie_Latn", "x"]]) for _ in toks]

    monkeypatch.setattr(translator, "available", lambda: True)
    monkeypatch.setattr(translator, "_build_engine", lambda: (_Tr(), _Sp()))
    monkeypatch.setattr(translator, "_engine", None)
    results = []
    ts = [threading.Thread(target=lambda: results.append(translator.translate(["a"]))) for _ in range(8)]
    [t.start() for t in ts]; [t.join() for t in ts]
    assert len(loads) == 1 and results == [["x"]] * 8
```

- [ ] **Step 2: Chạy test, xác nhận fail** — `pytest tests/test_translator.py -q` → `ModuleNotFoundError: app.extract.translator`.

- [ ] **Step 3: Cài dependency, thêm vào `requirements.txt`** (sau `pyyaml`): `ctranslate2>=4.8.0`, `sentencepiece>=0.2.0`. Run: `./venv/Scripts/python.exe -m pip install ctranslate2 sentencepiece`; Expected: `Successfully installed ctranslate2-4.8.2 sentencepiece-0.2.2`.

- [ ] **Step 4: Viết `translator.py`** — `_engine: Optional[tuple] = None`, `_lock = threading.Lock()`, `_build_engine()` tạo `ctranslate2.Translator(str(MODEL_DIR), device="cpu", compute_type="int8", inter_threads=1, intra_threads=min(4, os.cpu_count() or 1))` + `SentencePieceProcessor(model_file=...)`; `_load()` double-checked lock; `translate` mã hoá `[src] + sp.encode(text[:MAX_INPUT_CHARS], out_type=str) + ["</s>"]`, `target_prefix=[[tgt]] * n`, `beam_size=2`, `max_decoding_length=96`, `max_batch_size=32`; giải mã bỏ `tgt`/`</s>`, `decode_pieces`, thay `▁` bằng khoảng trắng, strip. Docstring tiếng Việt như các module khác.

- [ ] **Step 5: Copy model vào `data/models/...`, thêm `.gitignore`** (`ai-service/app/extract/data/models/`, `ai-service/app/extract/data/translations.sqlite`), **`build_dicts.py`**: `MODELS_DIR`, `NLLB_REPO`, `NLLB_COMMIT`, `NLLB_FILES`, `build_models()` (dùng `_download` vào `CACHE_DIR / "nllb" / f`, rồi copy sang `MODELS_DIR`; kiểm tra `model.bin` ≥ 500 MB, sai → `SystemExit` với thông báo), `--only` thêm lựa chọn `models`, cờ `--models` = chỉ model (**không** nằm trong mặc định "tất cả" để `build_dicts.py` không tự tải 600 MB; ghi rõ trong README). **`data/README.md`**: dòng bảng cho model (không commit, 600 MB, nguồn HF + commit, giấy phép **CC-BY-NC 4.0**, phi thương mại) và `translations.sqlite` (tự tạo).

- [ ] **Step 6: Chạy test, xác nhận pass** — `pytest tests/test_translator.py -q` → 6 passed (không skip vì model đã copy). Ghi thời gian chạy.

---

### Task 2: `tm.py` — bộ nhớ dịch SQLite

**Files:**
- Create: `ai-service/app/extract/tm.py`, `ai-service/tests/test_tm.py`

**Interfaces:**
- Produces: `tm.DB_FILE: Path` (mặc định `data/translations.sqlite`), `tm.normalize_key(s: str) -> str` (strip, gộp khoảng trắng, lowercase), `tm.lookup(src_lang: str, tgt_lang: str, sources: list[str]) -> dict[str, str]` (khoá = chuỗi nguồn **gốc** như truyền vào, chỉ có mục trúng), `tm.store(src_lang: str, tgt_lang: str, pairs: dict[str, str], engine: str) -> None` (INSERT OR REPLACE), `tm.reset()` (đóng kết nối, cho test). Mọi lỗi sqlite trong `lookup`/`store` được log `warning` và nuốt (`lookup` trả `{}`). Bảng `tm(src_lang TEXT, tgt_lang TEXT, source_key TEXT, target TEXT, engine TEXT, created_at TEXT, PRIMARY KEY(src_lang, tgt_lang, source_key))`, kết nối `check_same_thread=False` + `threading.Lock` như `jmdict.py`.

- [ ] **Step 1: Viết test**

```python
# ai-service/tests/test_tm.py
import pytest
from app.extract import tm


@pytest.fixture(autouse=True)
def tmp_db(monkeypatch, tmp_path):
    monkeypatch.setattr(tm, "DB_FILE", tmp_path / "tm.sqlite")
    tm.reset()
    yield
    tm.reset()


def test_store_and_lookup_normalizes_key():
    tm.store("eng_Latn", "vie_Latn", {"Bank account": "tài khoản ngân hàng"}, "test")
    assert tm.lookup("eng_Latn", "vie_Latn", ["  bank   ACCOUNT ", "payment"]) == {"  bank   ACCOUNT ": "tài khoản ngân hàng"}
    assert tm.lookup("jpn_Jpan", "vie_Latn", ["bank account"]) == {}
    assert tm.normalize_key("  Bank   Account ") == "bank account"


def test_store_replaces_existing():
    tm.store("eng_Latn", "vie_Latn", {"payment": "thanh"}, "old")
    tm.store("eng_Latn", "vie_Latn", {"payment": "thanh toán"}, "new")
    assert tm.lookup("eng_Latn", "vie_Latn", ["payment"]) == {"payment": "thanh toán"}


def test_tm_failure_is_swallowed(monkeypatch, tmp_path):
    bad = tmp_path / "bad.sqlite"; bad.write_bytes(b"not a database")
    monkeypatch.setattr(tm, "DB_FILE", bad); tm.reset()
    tm.store("eng_Latn", "vie_Latn", {"a": "b"}, "x")          # không ném
    assert tm.lookup("eng_Latn", "vie_Latn", ["a"]) == {}
```

- [ ] **Step 2: Chạy test, xác nhận fail** — `ModuleNotFoundError: app.extract.tm`.
- [ ] **Step 3: Viết `tm.py`** theo Interfaces (tạo bảng khi mở, `CREATE TABLE IF NOT EXISTS`).
- [ ] **Step 4: Chạy test, xác nhận pass** — 3 passed.

---

### Task 3: `enrich.py` — logic ENRICH với mock translator

**Files:**
- Create: `ai-service/app/extract/enrich.py`, `ai-service/tests/test_enrich.py`
- Modify: `ai-service/app/api/extract_router.py` (`/enrich` gọi `enrich.enrich_items`; `filter_enriched` chuyển sang `enrich.py`, router `from app.extract.enrich import filter_enriched` để test cũ `test_enrich_filters_bad_outputs` vẫn import được; `/health` thêm `"translator": translator.available()`)
- Test: `ai-service/tests/test_router.py` (sửa `test_enrich_without_key` → `test_enrich_without_model`, health thêm khoá `translator`)

**Interfaces:**
- Consumes: Task 1 `translator.available/translate/TranslatorError/ENGINE`, Task 2 `tm.lookup/store`.
- Produces: `enrich.enrich_items(items: list[dict], target_lang: str = "vi") -> dict` = `{"enriched": bool, "items": list[{ref, meaningVi, exampleVi}], "reason": Optional[str]}`; `enrich.filter_enriched(raw, known_refs)` (chuyển nguyên từ router); `enrich.wants_example(example: Optional[str]) -> bool`; hằng `LANG_CODES = {"vi": "vie_Latn", "en": "eng_Latn"}`, `GLOSS_SRC = "eng_Latn"`, `EXAMPLE_SRC = "jpn_Jpan"`.

Luồng `enrich_items`: `items` rỗng → `{True, [], None}`; `not translator.available()` → `{False, [], "no_model"}`; gom `gloss_src = {meaningEn.strip()}` của item có `meaningEn`, `ex_src = {example}` của item `wants_example`; mỗi nhóm: `tm.lookup` → phần thiếu (bỏ trùng, giữ thứ tự) → `translator.translate` → `TranslatorError` → `{False, [], e.reason}`; kết quả mới qua lọc (rỗng, có chữ Nhật, hoặc `normalize_key(out) == normalize_key(src)` → bỏ) rồi `tm.store(..., ENGINE)`; dựng output theo item, `filter_enriched` cuối cùng; `enriched=True`.

- [ ] **Step 1: Viết test**

```python
# ai-service/tests/test_enrich.py
import pytest
from app.extract import enrich, tm, translator


@pytest.fixture(autouse=True)
def isolated(monkeypatch, tmp_path):
    monkeypatch.setattr(tm, "DB_FILE", tmp_path / "tm.sqlite"); tm.reset()
    monkeypatch.setattr(translator, "available", lambda: True)
    yield
    tm.reset()


def _fake(table, calls):
    def translate(texts, src="eng_Latn", tgt="vie_Latn"):
        calls.append((src, list(texts)))
        return [table.get(t, "") for t in texts]
    return translate


def test_dedupes_and_uses_translation_memory(monkeypatch):
    calls = []
    monkeypatch.setattr(translator, "translate", _fake({"bank account": "tài khoản ngân hàng", "payment": "thanh toán"}, calls))
    items = [{"ref": "1", "term": "銀行口座", "meaningEn": "bank account"},
             {"ref": "2", "term": "口座", "meaningEn": "bank account"},
             {"ref": "3", "term": "支払い", "meaningEn": "payment"}]
    r = enrich.enrich_items(items, "vi")
    assert r["enriched"] is True and r["reason"] is None
    assert [(i["ref"], i["meaningVi"]) for i in r["items"]] == [("1", "tài khoản ngân hàng"), ("2", "tài khoản ngân hàng"), ("3", "thanh toán")]
    assert calls == [("eng_Latn", ["bank account", "payment"])]
    calls.clear()
    assert enrich.enrich_items(items[:1], "vi")["items"][0]["meaningVi"] == "tài khoản ngân hàng"
    assert calls == []                                         # lần 2 trúng bộ nhớ dịch


def test_items_without_gloss_skipped_and_examples_translated(monkeypatch):
    calls = []
    monkeypatch.setattr(translator, "translate", _fake({"to study": "học", "毎日勉強します。": "Mỗi ngày tôi học."}, calls))
    items = [{"ref": "a", "term": "勉強", "meaningEn": "to study", "example": "毎日勉強します。"},
             {"ref": "b", "term": "逝得", "meaningEn": None, "example": None},
             {"ref": "c", "term": "外食する", "meaningEn": "", "example": "外食する"}]
    r = enrich.enrich_items(items, "vi")
    assert r["items"] == [{"ref": "a", "meaningVi": "học", "exampleVi": "Mỗi ngày tôi học."}]
    assert sorted(calls) == [("eng_Latn", ["to study"]), ("jpn_Jpan", ["毎日勉強します。"])]


def test_example_rules():
    assert enrich.wants_example("毎日勉強します。") is True
    assert enrich.wants_example("私は毎日日本語学校で勉強します") is True       # ≥ 12 ký tự, không dấu kết
    assert enrich.wants_example("外食する") is False                         # ngắn, không dấu kết
    assert enrich.wants_example("bank transfcr 123456") is False            # không có chữ Nhật
    assert enrich.wants_example(None) is False


def test_identity_translation_dropped(monkeypatch):
    monkeypatch.setattr(translator, "translate", _fake({"OK": "OK", "PC": "pc", "kanji": "漢字"}, []))
    items = [{"ref": "1", "term": "オーケー", "meaningEn": "OK"}, {"ref": "2", "term": "パソコン", "meaningEn": "PC"},
             {"ref": "3", "term": "漢字", "meaningEn": "kanji"}]
    r = enrich.enrich_items(items, "vi")
    assert r["enriched"] is True and r["items"] == []
    assert tm.lookup("eng_Latn", "vie_Latn", ["OK", "PC", "kanji"]) == {}      # không lưu rác vào TM


def test_no_model_and_engine_error(monkeypatch):
    monkeypatch.setattr(translator, "available", lambda: False)
    assert enrich.enrich_items([{"ref": "1", "term": "x", "meaningEn": "x"}], "vi") == {"enriched": False, "items": [], "reason": "no_model"}
    monkeypatch.setattr(translator, "available", lambda: True)

    def boom(texts, src="eng_Latn", tgt="vie_Latn"):
        raise translator.TranslatorError("error")
    monkeypatch.setattr(translator, "translate", boom)
    assert enrich.enrich_items([{"ref": "1", "term": "x", "meaningEn": "bank"}], "vi")["reason"] == "error"
    assert enrich.enrich_items([], "vi") == {"enriched": True, "items": [], "reason": None}
```

```python
# sửa trong ai-service/tests/test_router.py
def test_enrich_without_model(monkeypatch):
    from app.extract import translator
    monkeypatch.setattr(translator, "available", lambda: False)
    r = client.post("/api/extract/enrich", json={"targetLang": "vi", "items": [{"ref": "1", "term": "語", "meaningEn": "word"}]})
    assert r.status_code == 200 and r.json() == {"enriched": False, "items": [], "reason": "no_model"}
# health: assert set(body) == {..., "gemini", "translator"}
```

- [ ] **Step 2: Chạy test, xác nhận fail** — `ModuleNotFoundError: app.extract.enrich`.
- [ ] **Step 3: Viết `enrich.py`, nối router, health** theo Interfaces.
- [ ] **Step 4: Chạy test** — `pytest tests/test_enrich.py tests/test_router.py -q` → pass.

---

### Task 4: Gỡ Gemini khỏi bước dịch

**Files:**
- Modify: `ai-service/app/extract/gemini.py` (xoá `BATCH_SIZE`, `_LANG_NAME`, `_TRANSLATE_PROMPT`, `_TRANSLATE_SCHEMA`, `_parse_json_list`, `translate_items`; docstring đầu file: "Vision OCR fallback"), `ai-service/tests/test_gemini.py`, `ai-service/app/core/config.py` + `.env.example` (chú thích `GEMINI_*` = chỉ cho OCR ảnh)

**Interfaces:**
- Consumes: không. Produces: `gemini` chỉ còn `available`, `vision_transcribe`, `GeminiError`, `_generate`, `RETRY_DELAYS`, `_sleep`, `MODEL`.

- [ ] **Step 1: Sửa test** — xoá `_echo_translate`, `test_translate_batches_of_40_and_parses_json`, `test_translate_accepts_code_fence_and_dict_wrapper`, `test_invalid_json_is_error`, `test_enrich_filters_bad_outputs` (đã có `test_identity_translation_dropped` + `filter_enriched` dùng qua Task 3; chuyển nó sang `test_enrich.py` với import `from app.extract.enrich import filter_enriched`), `test_enrich_reports_gemini_failure`, `test_enrich_no_key`; các test dùng `translate_items` để kiểm tra lỗi/retry (`test_quota_mapping`, `test_generic_error_mapping_hides_details`, `test_no_api_key`, `test_retry_exhausted_keeps_quota_reason`) đổi sang `gemini.vision_transcribe(b"png", "image/png", "auto")`, giữ nguyên assertion về `reason`/số lần gọi; `test_prompts_mention_vocab_table_and_source_gloss` bỏ nửa dịch, đổi tên `test_vision_prompt_mentions_vocab_table`.
- [ ] **Step 2: Chạy test, xác nhận fail** — các test mới gọi `vision_transcribe` pass sẵn; test import `translate_items` nào còn sót sẽ lộ ra. Expected: 0 test còn tham chiếu `translate_items` (`grep -n translate_items ai-service/tests` rỗng).
- [ ] **Step 3: Gỡ code trong `gemini.py`, sửa chú thích config/.env** — `grep -rn "translate_items\|_TRANSLATE_PROMPT" ai-service/app` rỗng.
- [ ] **Step 4: Chạy toàn bộ** — `pytest -q` → tất cả pass (kể cả `test_vision_fixture` skip).

---

### Task 5: Frontend chuỗi thông báo + docs

**Files:**
- Modify: `frontend/src/features/extraction/extractionUtils.ts` (thêm `enrichReasonText`, giữ `geminiReasonText` cho OCR), `frontend/src/features/extraction/components/ExtractedTextPanel.tsx:93-98`, `frontend/src/pages/ExtractionPage.tsx` (banner + `canReEnrich` thêm `no_model`), `docs/EXTRACTION.md` (§3 hàng `/enrich`, §4 cài model, health `translator`), `docs/CHANGELOG.md` (mục 12/10/2026 thêm phần "Dịch offline"), `docs/CODEBASE_MAP.md` (dòng 99 thêm `translator`, `tm`, `enrich`), `README.md` (nếu có hướng dẫn `GEMINI_API_KEY` → thêm bước `--models`)

**Interfaces:**
- Produces: `enrichReasonText(reason: string): string` — `no_model` → "Máy chủ chưa cài model dịch (chạy `python scripts/build_dicts.py --models`)", `quota` → "AI (Gemini) đã hết hạn mức", `no_api_key` → "Chưa cấu hình AI dịch", mặc định → "Dịch nghĩa gặp lỗi". `canReEnrich` khi `enrichReason ∈ {"quota", "error", "no_model"}`; banner `ExtractionPage`: "{enrichReasonText(reason)} nên chưa dịch được nghĩa tiếng Việt, thẻ tạm dùng nghĩa tiếng Anh." (bỏ câu trùng trong `ExtractedTextPanel` cho `enrichReason`, giữ cảnh báo `geminiError` của OCR).

- [ ] **Step 1: Sửa 3 file frontend** theo Interfaces.
- [ ] **Step 2: Kiểm tra** — `cd frontend && npx oxlint && npx tsc -b && npm run build` → 0 lỗi.
- [ ] **Step 3: Docs** — 4 file, cùng giọng hiện có; CHANGELOG ghi kết quả spike (bảng ở spec §0) ngắn gọn.

---

### Task 6: Chạy thật end-to-end và ghi kết quả

**Files:**
- Create: `ai-service/tests/test_enrich_real.py` (skip khi `not translator.available()`)

- [ ] **Step 1: Viết test**

```python
# ai-service/tests/test_enrich_real.py
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from app.extract import translator
from app.main import app

pytestmark = pytest.mark.skipif(not translator.available(), reason="chưa tải model")
client = TestClient(app)


def test_bank_fixture_text_analyze_enrich():
    text = (Path(__file__).parent / "fixtures" / "bank_vocab.txt").read_text(encoding="utf-8")
    body = client.post("/api/extract/text", data={"text": text}).json()
    a = client.post("/api/extract/analyze", json={"text": body["text"], "blocks": body["blocks"], "options": {"levelFilter": "all"}}).json()
    assert a["stats"]["layout"] == "list" and a["stats"]["vocab"] == 20
    items = [{"ref": str(it["position"]), "term": it["term"], "meaningEn": it["meaningEn"], "example": it["example"]} for it in a["items"]]
    e = client.post("/api/extract/enrich", json={"targetLang": "vi", "items": items}).json()
    assert e["enriched"] is True and e["reason"] is None
    assert len(e["items"]) >= 18
    by_ref = {i["ref"]: i["meaningVi"] for i in e["items"]}
    print({it["term"]: by_ref.get(str(it["position"])) for it in a["items"]})
    assert "tài khoản ngân hàng" in by_ref["4"].lower()        # 銀行口座
```

- [ ] **Step 2: Chạy** — `PYTHONIOENCODING=utf-8 pytest tests/test_enrich_real.py -q -s` → pass; chép 20 nghĩa VI in ra vào mục CHANGELOG.
- [ ] **Step 3: Chạy toàn bộ** — `pytest -q` (ai-service), `cd backend-core && mvn -q test` (không đổi code nhưng xác nhận), `cd frontend && npx oxlint && npx tsc -b`. Ghi số liệu thật vào báo cáo.
