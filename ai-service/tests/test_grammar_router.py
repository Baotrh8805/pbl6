"""POST /grammar/conjugation-quiz qua TestClient: router gắn vào app riêng (main.py do pha fix đăng ký).

Kiểm tra hợp đồng {items, skipped}, 4 phương án xáo xác định theo seed, lọc dạng, ví dụ từ tài liệu / câu mẫu,
lý do bỏ qua, mã lỗi và khoá nội bộ.
"""
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import grammar_router
from app.core.config import settings
from app.extract import conjugate

app = FastAPI()
app.include_router(grammar_router.router, prefix=settings.API_V1_STR)
client = TestClient(app)
URL = "/api/grammar/conjugation-quiz"


def _post(**body):
    r = client.post(URL, json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_quiz_contract_and_options():
    body = _post(verbs=[{"term": "食べる"}, {"term": "書く"}, {"term": "来る"}, {"term": "勉強する"}], seed=7)
    assert body["skipped"] == []
    assert len(body["items"]) == 4
    assert [it["group"] for it in body["items"]] == ["ichidan", "godan", "kuru", "suru"]
    for it in body["items"]:
        assert set(it) == {"term", "lemma", "reading", "group", "form", "formLabelVi", "prompt", "correct",
                           "options", "example"}
        assert it["form"] in conjugate.FORMS
        assert it["formLabelVi"] == conjugate.label_vi(it["form"])
        assert len(it["options"]) == 4 and len(set(it["options"])) == 4
        assert it["correct"] in it["options"]
        assert it["correct"] == conjugate.forms(it["lemma"], it["group"], it["reading"])[it["form"]]
        assert it["prompt"].startswith("Chia động từ 「") and it["formLabelVi"] in it["prompt"]
        assert it["correct"] in it["example"]
    tabe = body["items"][0]
    assert (tabe["term"], tabe["lemma"], tabe["reading"]) == ("食べる", "食べる", "たべる")
    assert "（たべる）" in tabe["prompt"]


def test_deterministic_by_seed_and_independent_per_verb():
    req = dict(verbs=[{"term": "書く"}, {"term": "食べる"}, {"term": "する"}], perVerb=3, seed=42)
    a, b = _post(**req), _post(**req)
    assert a == b
    # đổi seed: cùng tập (lemma, dạng) có thể khác, nhưng mỗi item vẫn hợp lệ và đáp án không đổi theo dạng
    c = _post(**{**req, "seed": 43})
    assert {(it["lemma"], it["form"], it["correct"]) for it in c["items"]} <= {
        (lemma, f, v) for lemma in ("書く", "食べる", "する")
        for f, v in conjugate.forms(lemma, conjugate.group_of(lemma)).items() if v}
    # thêm động từ khác vào SAU không đổi câu hỏi của động từ đầu (RNG theo vị trí + lemma)
    d = _post(verbs=[{"term": "書く"}, {"term": "食べる"}, {"term": "する"}, {"term": "読む"}], perVerb=3, seed=42)
    assert d["items"][:9] == a["items"]


def test_forms_filter_and_per_verb():
    body = _post(verbs=[{"term": "食べる"}, {"term": "書く"}, {"term": "来る"}, {"term": "勉強する"}], forms=["te"])
    assert [it["correct"] for it in body["items"]] == ["食べて", "書いて", "来て", "勉強して"]
    assert all(it["form"] == "te" for it in body["items"])
    body = _post(verbs=[{"term": "読む"}], forms=["te", "ta", "nai"], perVerb=5)
    assert sorted(it["form"] for it in body["items"]) == ["nai", "ta", "te"]   # perVerb lớn hơn số dạng → lấy hết
    body = _post(verbs=[{"term": "読む"}], perVerb=2, seed=1)
    assert len(body["items"]) == 2 and len({it["form"] for it in body["items"]}) == 2


def test_examples_from_document_or_template():
    sentences = ["昨日は寿司を食べた。", "本を読んでください。", "  "]
    body = _post(verbs=[{"term": "食べる"}, {"term": "書く"}, {"term": "読む"}], forms=["ta"],
                 exampleSentences=sentences)
    ex = {it["lemma"]: it["example"] for it in body["items"]}
    assert ex["食べる"] == "昨日は寿司を食べた。"
    assert ex["書く"] == "昨日、書いた。"          # câu mẫu
    assert ex["読む"] == "昨日、読んだ。"          # 読んで trong tài liệu không phải dạng た
    body = _post(verbs=[{"term": "来る"}], forms=["te"])
    assert body["items"][0]["example"] == "来てください。"


def test_skipped_reasons():
    body = _post(verbs=[{"term": "日本語"}, {"term": "  "}, {"term": "食べる"}, {"term": "ある"}], forms=["potential"])
    assert body["skipped"] == [
        {"term": "日本語", "reason": "not_a_verb"},
        {"term": "", "reason": "empty"},
        {"term": "ある", "reason": "no_forms"},
    ]
    assert [it["correct"] for it in body["items"]] == ["食べられる"]
    # cùng lemma sau chuẩn hoá (書きます → 書く) → bỏ mục sau
    body = _post(verbs=[{"term": "書く"}, {"term": "書きます"}])
    assert body["skipped"] == [{"term": "書きます", "reason": "duplicate"}]
    assert len(body["items"]) == 1


def test_reading_passthrough_and_sa_noun():
    body = _post(verbs=[{"term": "切る", "reading": "きる"}, {"term": "勉強", "reading": "ベンキョウ"}], forms=["te"])
    kiru, benkyou = body["items"]
    assert (kiru["group"], kiru["reading"], kiru["correct"]) == ("godan", "きる", "切って")
    assert (benkyou["term"], benkyou["lemma"], benkyou["reading"], benkyou["correct"]) == (
        "勉強", "勉強する", "べんきょうする", "勉強して")


def test_special_verbs_through_endpoint():
    body = _post(verbs=[{"term": "くださる"}, {"term": "いらっしゃる"}, {"term": "ご覧になる"}], forms=["imperative", "masu"],
                 perVerb=2)
    got = {(it["lemma"], it["form"]): it["correct"] for it in body["items"]}
    assert got[("くださる", "imperative")] == "ください"
    assert got[("いらっしゃる", "masu")] == "いらっしゃいます"
    assert got[("ご覧になる", "masu")] == "ご覧になります"
    assert ("ご覧になる", "imperative") not in got


def test_validation_errors():
    assert client.post(URL, json={"verbs": [{"term": "書く"}] * 201}).status_code == 400
    r = client.post(URL, json={"verbs": [{"term": "書く"}], "forms": ["te", "foo"]})
    assert r.status_code == 400 and "foo" in r.json()["detail"]
    assert client.post(URL, json={"verbs": [{"term": "書く"}], "perVerb": 0}).status_code == 422
    assert client.post(URL, json={"verbs": [{"term": "書く"}], "perVerb": 6}).status_code == 422
    assert client.post(URL, json={"verbs": [{"term": ""}]}).status_code == 422
    assert _post(verbs=[]) == {"items": [], "skipped": []}
    assert _post(verbs=[{"term": "書く"}], forms=[])["items"]   # forms rỗng = mặc định mọi dạng


def test_internal_key_required_when_configured(monkeypatch):
    monkeypatch.setattr(settings, "AI_SERVICE_KEY", "s3cret")
    assert client.post(URL, json={"verbs": [{"term": "書く"}]}).status_code == 401
    assert client.post(URL, json={"verbs": [{"term": "書く"}]}, headers={"X-Internal-Key": "nope"}).status_code == 401
    assert client.post(URL, json={"verbs": [{"term": "書く"}]}, headers={"X-Internal-Key": "s3cret"}).status_code == 200
    assert client.get("/api/grammar/health").status_code == 401


def test_health_flags():
    r = client.get("/api/grammar/health")
    assert r.status_code == 200
    assert set(r.json()) == {"sudachi", "conjugation"}
    assert r.json()["conjugation"] == grammar_router.available() == conjugate.available()


def test_build_quiz_is_pure_and_bounded():
    many = [{"term": t} for t in ["書く", "読む", "食べる", "見る", "する", "来る"]]
    out = grammar_router.build_quiz(many, None, 5, None, 0)
    assert 6 <= len(out["items"]) <= 30
    assert out == grammar_router.build_quiz(many, None, 5, None, 0)
