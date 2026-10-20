"""Router /radicals: app FastAPI cục bộ (main.py do fix phase đăng ký), tầng dữ liệu thay bằng bảng giả / hàm giả để
kiểm tra hợp đồng HTTP — hình dạng thẻ, nhóm theo bộ, mẹo Gemini → template khi thiếu / lỗi, tham số, mã lỗi, khoá
nội bộ. Một test cuối skipif đi xuyên tới dữ liệu thật."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import radical_router
from app.core.config import settings
from app.extract import gemini, han_viet, han_viet_graph, kanji_cards, kanjidata, radicals
from app.extract.jlpt import classifier

app = FastAPI()
app.include_router(radical_router.router, prefix=settings.API_V1_STR)
client = TestClient(app)
URL = "/api/radicals/cards"

RS_CSV = ("char,radical_no,residual_strokes,total_strokes\n海,85,6,9\n湖,85,9,12\n火,86,0,4\n花,140,4,7\n学,39,5,8\n")
TABLE = ("no,char,unified,strokes,name_vi,meaning_vi,han_viet\n"
         "39,⼦,子,3,tử,con cái,TỬ\n85,⽔,水,4,thủy,nước,THỦY\n86,⽕,火,4,hỏa,lửa,HỎA\n140,⾋,艸,6,thảo,cỏ,THẢO\n")
HV = {"海": "HẢI", "湖": "HỒ", "火": "HỎA", "花": "HOA", "学": "HỌC"}
MEANING = {"海": "sea; ocean", "湖": "lake", "火": "fire", "花": "flower"}
JLPT = {
    "海": [("海", "うみ", "sea", "N5"), ("海岸", "かいがん", "coast", "N4"), ("海外", "かいがい", "abroad", "N3"),
          ("航海", "こうかい", "voyage", "N3"), ("海", "うみ", "sea (dup)", "N1")],
    "湖": [("湖", "みずうみ", "lake", "N4")],
    "火": [("火曜日", "かようび", "Tuesday", "N5"), ("火事", "かじ", "fire", "N4")],
    "花": [("花", "はな", "flower", "N5")],
}
FREQ = {"海外": 5.0, "航海": 3.0}


@pytest.fixture
def data(tmp_path, monkeypatch):
    (tmp_path / "rs.csv").write_text(RS_CSV, encoding="utf-8")
    (tmp_path / "radicals.csv").write_text(TABLE, encoding="utf-8")
    monkeypatch.setattr(kanjidata, "RS_FILE", tmp_path / "rs.csv")
    monkeypatch.setattr(radicals, "DATA_FILE", tmp_path / "radicals.csv")
    monkeypatch.setattr(han_viet, "han_viet", lambda term: HV.get(term))
    monkeypatch.setattr(kanji_cards, "_meaning_en", lambda ch: MEANING.get(ch))
    monkeypatch.setattr(classifier, "entries_containing", lambda ch: list(JLPT.get(ch, [])))
    monkeypatch.setattr(classifier, "jlpt_kanji_set", lambda: frozenset(JLPT))
    monkeypatch.setattr(han_viet_graph, "word_frequency", lambda term: FREQ.get(term, 0.0))
    kanjidata.reset()
    radicals.reset()
    yield tmp_path
    kanjidata.reset()
    radicals.reset()


@pytest.fixture
def fake_gemini(monkeypatch):
    """Thay gemini.generate_mnemonics: ghi lại items gửi lên, trả theo kịch bản đặt trước."""
    box = {"calls": [], "result": {"items": [], "reason": None}}

    def generate(items, model=None):
        box["calls"].append(items)
        box.setdefault("models", []).append(model)
        return box["result"]
    monkeypatch.setattr(gemini, "generate_mnemonics", generate)
    return box


def _post(**body):
    r = client.post(URL, json=body)
    assert r.status_code == 200, r.text
    return r.json()


# ----------------------------------------------------------------------------- POST /cards

def test_cards_contract_gemini_and_template_mix(data, fake_gemini):
    fake_gemini["result"] = {"items": [{"kanji": "海", "mnemonicVi": "Bộ Thủy là nước, biển HẢI mênh mông."}], "reason": None}
    body = _post(kanji=["海", "火", "海", "あ", "花道", "", "龘"], levels=["N3"])
    umi, hi, rare = body["items"]
    assert set(umi) == {"kanji", "hanViet", "meaningEn", "strokeCount", "radical", "mnemonicVi", "mnemonicSource", "examples"}
    assert umi["kanji"] == "海" and umi["hanViet"] == "HẢI" and umi["meaningEn"] == "sea; ocean" and umi["strokeCount"] == 9
    assert umi["radical"] == {"no": 85, "char": "水", "nameVi": "thủy", "meaningVi": "nước", "hanViet": "THỦY"}
    assert umi["mnemonicVi"] == "Bộ Thủy là nước, biển HẢI mênh mông." and umi["mnemonicSource"] == "gemini"
    # ví dụ ≤ 3, mỗi từ một lần: đúng cấp N3 trước (thông dụng trước: 海外 > 航海), rồi dễ → khó
    assert umi["examples"] == [
        {"term": "海外", "reading": "かいがい", "meaning": "abroad", "level": "N3"},
        {"term": "航海", "reading": "こうかい", "meaning": "voyage", "level": "N3"},
        {"term": "海", "reading": "うみ", "meaning": "sea", "level": "N5"},
    ]
    # 火: Gemini không trả → template nhắc bộ và âm
    assert hi["mnemonicSource"] == "template" and "Hỏa" in hi["mnemonicVi"] and "HỎA" in hi["mnemonicVi"]
    assert hi["radical"]["no"] == 86 and len(hi["examples"]) == 2
    # 龘: không bộ, không âm, không nghĩa → thẻ rỗng nhưng vẫn có mẹo mẫu; không gửi lên Gemini
    assert rare == {"kanji": "龘", "hanViet": None, "meaningEn": None, "strokeCount": None, "radical": None,
                    "mnemonicVi": rare["mnemonicVi"], "mnemonicSource": "template", "examples": []}
    assert rare["mnemonicVi"]
    assert [it["kanji"] for it in fake_gemini["calls"][0]] == ["海", "火"]
    assert fake_gemini["calls"][0][0] == {"kanji": "海", "hanViet": "HẢI", "radicalName": "thủy", "radicalChar": "水",
                                          "radicalVariants": ["氵", "氺"], "meaningEn": "sea; ocean",
                                          "examples": ["海外", "航海", "海"]}
    assert body["groups"] == [{"radical": umi["radical"], "kanji": ["海"]}, {"radical": hi["radical"], "kanji": ["火"]},
                              {"radical": None, "kanji": ["龘"]}]
    assert body["reason"] is None


@pytest.mark.parametrize("reason", ["quota", "error", "no_key"])
def test_cards_fall_back_to_template_with_reason(data, fake_gemini, reason):
    fake_gemini["result"] = {"items": [], "reason": reason}
    body = _post(kanji=["海", "湖", "花"])
    assert body["reason"] == reason
    assert all(it["mnemonicSource"] == "template" and it["mnemonicVi"] for it in body["items"])
    assert "Thủy" in body["items"][0]["mnemonicVi"] and "HẢI" in body["items"][0]["mnemonicVi"]
    assert len({it["mnemonicVi"] for it in body["items"]}) == 3
    assert [g["kanji"] for g in body["groups"]] == [["海", "湖"], ["花"]]


def test_cards_forward_gemini_model_and_report_writer(data, fake_gemini):
    # Admin > Cấu hình > Model AI chính: geminiModel tới Gemini; "model" trả về là model đã viết mẹo (backend ghi
    # generated_model), None khi mọi mẹo là mẫu dù Gemini có được gọi
    fake_gemini["result"] = {"items": [{"kanji": "海", "mnemonicVi": "Bộ Thủy là nước, biển HẢI mênh mông."}],
                             "reason": None, "model": "gemini-2.5-pro"}
    body = _post(kanji=["海"], geminiModel="gemini-2.5-pro")
    assert fake_gemini["models"] == ["gemini-2.5-pro"] and body["model"] == "gemini-2.5-pro"
    fake_gemini["result"] = {"items": [], "reason": "quota", "model": "gemini-2.5-pro"}
    body = _post(kanji=["海"])
    assert fake_gemini["models"][-1] is None and body["model"] is None


def test_cards_without_mnemonic_skip_gemini(data, fake_gemini):
    body = _post(kanji=["海"], withMnemonic=False)
    assert fake_gemini["calls"] == []
    assert body["items"][0]["mnemonicVi"] is None and body["items"][0]["mnemonicSource"] is None
    assert body["reason"] is None


def test_cards_examples_default_easiest_first_and_dedupe(data, fake_gemini):
    body = _post(kanji=["海"], withMnemonic=False)
    assert [e["term"] for e in body["items"][0]["examples"]] == ["海", "海岸", "海外"]
    body = _post(kanji=["海"], levels=["N4", "N1"], withMnemonic=False)
    assert [e["term"] for e in body["items"][0]["examples"]] == ["海岸", "海", "海外"]   # N4 đúng cấp trước; N1 chỉ là từ trùng


def test_cards_empty_and_limits(data, fake_gemini):
    assert _post(kanji=[]) == {"items": [], "groups": [], "reason": None, "model": None}
    assert fake_gemini["calls"] == []
    assert client.post(URL, json={"kanji": ["海"] * (radical_router.MAX_KANJI + 1)}).status_code == 422
    assert client.post(URL, json={"kanji": ["海"], "levels": ["N9"]}).status_code == 400
    assert client.post(URL, json={"kanji": "海"}).status_code == 422


def test_cards_meaning_drops_affix_glosses_and_falls_back_to_jlpt(data, fake_gemini, monkeypatch):
    # JMdict chọn mục phụ tố cho 人 ("-ian…") / lượng từ cho 回: thẻ và prompt Gemini không được mang nghĩa đó
    gloss = {"海": "-ian (e.g. Italian); -er (e.g. performer)", "火": "counter for occurrences; a time, an instance",
             "湖": "Our ~ (e.g., Hotel)"}
    monkeypatch.setattr(kanji_cards, "_meaning_en", lambda ch: gloss.get(ch))
    monkeypatch.setattr(classifier, "meaning_hint", lambda ch, reading=None: {"海": "person", "湖": "counter for people"}.get(ch))
    monkeypatch.setattr(classifier, "entries_of", lambda term: [("おん", "honorific ~", "N2")] if term == "湖" else [])
    body = _post(kanji=["海", "火", "湖"])
    umi, hi, mizuumi = body["items"]
    assert umi["meaningEn"] == "person"                      # JMdict toàn phụ tố → cột meaning JLPT
    assert hi["meaningEn"] == "a time, an instance"          # bỏ sense lượng từ, giữ nghĩa thật
    assert mizuumi["meaningEn"] is None                      # cả hai nguồn đều phụ tố → không nghĩa, thẻ vẫn có mẹo
    assert "Our" not in mizuumi["mnemonicVi"] and "HỒ" in mizuumi["mnemonicVi"]
    assert [it.get("meaningEn") for it in fake_gemini["calls"][0]] == ["person", "a time, an instance", None]


def test_cards_ignore_bad_gemini_items(data, fake_gemini):
    fake_gemini["result"] = {"items": [{"kanji": "湖", "mnemonicVi": ""}, {"kanji": "??", "mnemonicVi": "x"}], "reason": None}
    body = _post(kanji=["湖"])
    assert body["items"][0]["mnemonicSource"] == "template"


# ----------------------------------------------------------------------------- GET /radicals, GET /radicals/{no}/kanji

def test_get_table(data):
    r = client.get("/api/radicals")
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert [it["no"] for it in items] == [39, 85, 86, 140]
    assert items[1] == {"no": 85, "char": "⽔", "unified": "水", "strokes": 4, "nameVi": "thủy", "meaningVi": "nước",
                        "hanViet": "THỦY"}


def test_get_kanji_by_radical_levels_and_errors(data):
    r = client.get("/api/radicals/85/kanji")
    assert r.status_code == 200, r.text
    assert r.json() == {"radical": {"no": 85, "char": "水", "nameVi": "thủy", "meaningVi": "nước", "hanViet": "THỦY"},
                        "levels": None,
                        "items": [{"kanji": "海", "level": "N5", "strokeCount": 9}, {"kanji": "湖", "level": "N4", "strokeCount": 12}]}
    assert client.get("/api/radicals/85/kanji", params={"levels": ["N4"]}).json()["items"] == [
        {"kanji": "湖", "level": "N4", "strokeCount": 12}]
    assert client.get("/api/radicals/85/kanji", params={"levels": "N4,N5"}).json()["levels"] == ["N4", "N5"]
    assert client.get("/api/radicals/85/kanji", params={"levels": ""}).json()["levels"] is None
    assert client.get("/api/radicals/85/kanji", params={"levels": "N0"}).status_code == 400
    assert client.get("/api/radicals/1/kanji").status_code == 404      # bảng giả không có bộ 1
    assert client.get("/api/radicals/0/kanji").status_code == 422
    assert client.get("/api/radicals/215/kanji").status_code == 422


# ----------------------------------------------------------------------------- khoá nội bộ, health

def test_internal_key_required(monkeypatch, data, fake_gemini):
    monkeypatch.setattr(settings, "AI_SERVICE_KEY", "s3cret")
    assert client.post(URL, json={"kanji": ["海"]}).status_code == 401
    assert client.get("/api/radicals").status_code == 401
    assert client.get("/api/radicals/85/kanji", headers={"X-Internal-Key": "wrong"}).status_code == 401
    assert client.get("/api/radicals", headers={"X-Internal-Key": "s3cret"}).status_code == 200


def test_available_flag(data, tmp_path, monkeypatch):
    assert radical_router.available()
    monkeypatch.setattr(radicals, "DATA_FILE", tmp_path / "missing.csv")
    radicals.reset()
    assert not radical_router.available()
    assert client.get("/api/radicals").json() == {"items": []}
    body = _post(kanji=["海"], withMnemonic=False)
    assert body["items"][0]["radical"] is None and body["groups"] == [{"radical": None, "kanji": ["海"]}]


# ----------------------------------------------------------------------------- dữ liệu thật

needs_real = pytest.mark.skipif(not (kanjidata.RS_FILE.exists() and (classifier.DATA_DIR / "n5.csv").exists()),
                                reason="chưa có unihan_rs.csv / jlpt/n5.csv")


@needs_real
def test_real_data_umi(monkeypatch):
    monkeypatch.setattr(gemini, "generate_mnemonics", lambda items, model=None: {"items": [], "reason": "no_key", "model": None})
    kanjidata.reset()
    radicals.reset()
    body = _post(kanji=["海", "火"])
    umi = body["items"][0]
    strokes = kanjidata.radical_strokes("海")[1]   # Unihan kTotalStrokes đếm 10 (dạng 毋), không phải 9 như sách Nhật
    assert umi["hanViet"] == "HẢI" and umi["strokeCount"] == strokes and umi["radical"]["no"] == 85
    assert umi["radical"]["nameVi"] == "thủy" and umi["examples"][0]["term"] == "海"
    assert umi["mnemonicSource"] == "template" and "HẢI" in umi["mnemonicVi"] and body["reason"] == "no_key"
    r = client.get("/api/radicals/85/kanji", params={"levels": "N5"}).json()
    assert {"kanji": "海", "level": "N5", "strokeCount": strokes} in r["items"]
    assert len(client.get("/api/radicals").json()["items"]) == 214


@needs_real
def test_real_data_hito_meaning_skips_counter_entries(monkeypatch):
    # 人: nghĩa của chữ (Unihan kDefinition) đứng trước JMdict — JMdict chỉ có mục phụ tố (じん "-ian…") và mục JLPT đầu
    # là じん / にん "counter for people" (nhánh lọc phụ tố của hai nguồn đó có test riêng ở trên)
    monkeypatch.setattr(gemini, "generate_mnemonics", lambda items, model=None: {"items": [], "reason": "no_key", "model": None})
    kanjidata.reset()
    radicals.reset()
    (hito,) = _post(kanji=["人"])["items"]
    assert hito["meaningEn"].startswith("man; people")
    assert "-ian" not in hito["mnemonicVi"] and "counter" not in hito["mnemonicVi"] and "NHÂN" in hito["mnemonicVi"]
