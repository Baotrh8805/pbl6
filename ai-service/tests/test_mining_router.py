"""POST /mining/i-plus-one và /mining/for-terms qua TestClient: router gắn vào app riêng (main.py do pha fix đăng ký).

Kiểm tra hợp đồng {items, stats} / {items: [{term, sentence, target}]}, các tuỳ chọn đi tới hàm thuần, mã lỗi
(413 văn bản dài, 400 cấp lạ, 422 cỡ lô / tham số) và khoá nội bộ.
"""
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import mining_router
from app.core.config import settings
from app.extract import sentence_mining

app = FastAPI()
app.include_router(mining_router.router, prefix=settings.API_V1_STR)
client = TestClient(app)
URL_I1 = "/api/mining/i-plus-one"
URL_TERMS = "/api/mining/for-terms"

SHORT_I1 = "新しい政策を見ました。"
LONG_I1 = "昨日は友達と一緒に新しい政策を見に行きました。"
PARAGRAPH = "猫が寝ている。" + SHORT_I1 + "経済は厳しい。" + "政府は新しい政策を導入した。\n" + LONG_I1 + "猫が寝ている。"


def _post(url, **body):
    r = client.post(url, json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_i_plus_one_contract_and_defaults():
    body = _post(URL_I1, text=PARAGRAPH)
    assert set(body) == {"items", "stats"}
    assert body["stats"] == {"sentences": 5, "kept": 2}
    assert [it["sentence"] for it in body["items"]] == [SHORT_I1, LONG_I1]
    it = body["items"][0]
    assert set(it) == {"sentence", "target", "unknownCount", "knownCount", "length", "score"}
    assert it["target"]["lemma"] == "政策" and it["target"]["level"] == "N1"
    assert it["target"]["readingSegments"] == [{"kanji": "政", "kana": "せい"}, {"kanji": "策", "kana": "さく"}]
    assert body == sentence_mining.mine_report(PARAGRAPH, [], "N5")   # router chỉ kiểm tra rồi gọi hàm thuần


def test_i_plus_one_options_reach_the_miner():
    assert [it["sentence"] for it in _post(URL_I1, text=PARAGRAPH, knownLemmas=["経済"])["items"]][0] == "経済は厳しい。"
    assert _post(URL_I1, text=PARAGRAPH, knownLemmas=["政策"], userLevel="N4")["items"] == []
    assert _post(URL_I1, text=PARAGRAPH, userLevel="N1")["items"] == []
    assert _post(URL_I1, text=PARAGRAPH, userLevel="")["stats"]["kept"] == 2      # rỗng = mặc định N5
    assert _post(URL_I1, text=PARAGRAPH, userLevel=None)["stats"]["kept"] == 2
    two = _post(URL_I1, text=PARAGRAPH, maxUnknown=2)["items"]
    assert [it["sentence"] for it in two] == ["経済は厳しい。"] and two[0]["unknownCount"] == 2
    body = _post(URL_I1, text=PARAGRAPH, knownLemmas=["猫"], assumeLevelKnown=False)
    assert [it["target"]["lemma"] for it in body["items"]] == ["寝る"]
    # limit cắt items, stats.kept vẫn đếm đủ
    body = _post(URL_I1, text=PARAGRAPH, limit=1)
    assert len(body["items"]) == 1 and body["stats"]["kept"] == 2


def test_for_terms_contract():
    body = _post(URL_TERMS, text=PARAGRAPH, terms=["政策", "経済", "猫", "ない語"])
    assert set(body) == {"items"}
    assert [it["term"] for it in body["items"]] == ["政策", "経済", "猫", "ない語"]
    assert body["items"][0]["sentence"] == SHORT_I1 and body["items"][0]["target"]["lemma"] == "政策"
    assert body["items"][1] == {"term": "経済", "sentence": None, "target": None}
    assert body["items"][2]["sentence"] == "猫が寝ている。"
    assert body["items"][3]["sentence"] is None
    assert _post(URL_TERMS, text=PARAGRAPH, terms=["経済"], knownLemmas=["厳しい"])["items"][0]["sentence"] == "経済は厳しい。"
    assert _post(URL_TERMS, text=PARAGRAPH, terms=["経済"], userLevel="N4")["items"][0]["sentence"] == "経済は厳しい。"
    assert _post(URL_TERMS, text=PARAGRAPH, terms=[]) == {"items": []}


def test_validation_errors():
    too_long = "あ" * (mining_router.MAX_TEXT_CHARS + 1)
    assert client.post(URL_I1, json={"text": too_long}).status_code == 413
    assert client.post(URL_TERMS, json={"text": too_long, "terms": ["政策"]}).status_code == 413
    r = client.post(URL_I1, json={"text": "あ" * mining_router.MAX_TEXT_CHARS})   # đúng ngưỡng, một "câu" quá dài → bỏ
    assert r.status_code == 200 and r.json() == {"items": [], "stats": {"sentences": 0, "kept": 0}}
    assert client.post(URL_I1, json={"text": ""}).status_code == 422
    assert client.post(URL_I1, json={}).status_code == 422
    r = client.post(URL_I1, json={"text": PARAGRAPH, "userLevel": "N6"})
    assert r.status_code == 400 and "N6" in r.json()["detail"]
    assert client.post(URL_TERMS, json={"text": PARAGRAPH, "terms": ["政策"], "userLevel": "n5"}).status_code == 400
    assert client.post(URL_I1, json={"text": PARAGRAPH, "maxUnknown": 0}).status_code == 422
    assert client.post(URL_I1, json={"text": PARAGRAPH, "maxUnknown": mining_router.MAX_UNKNOWN + 1}).status_code == 422
    assert client.post(URL_I1, json={"text": PARAGRAPH, "limit": 0}).status_code == 422
    assert client.post(URL_I1, json={"text": PARAGRAPH, "limit": mining_router.MAX_LIMIT + 1}).status_code == 422
    assert client.post(URL_TERMS, json={"text": PARAGRAPH, "terms": ["政策"] * (mining_router.MAX_TERMS + 1)}).status_code == 422
    assert client.post(URL_TERMS, json={"text": PARAGRAPH, "terms": ["政策"] * mining_router.MAX_TERMS}).status_code == 200


def test_internal_key_required_when_configured(monkeypatch):
    monkeypatch.setattr(settings, "AI_SERVICE_KEY", "s3cret")
    assert client.post(URL_I1, json={"text": PARAGRAPH}).status_code == 401
    assert client.post(URL_TERMS, json={"text": PARAGRAPH, "terms": []}, headers={"X-Internal-Key": "nope"}).status_code == 401
    assert client.post(URL_I1, json={"text": PARAGRAPH}, headers={"X-Internal-Key": "s3cret"}).status_code == 200
    assert client.get("/api/mining/health").status_code == 401


def test_health_flags():
    r = client.get("/api/mining/health")
    assert r.status_code == 200
    assert r.json() == {"sudachi": True, "mining": True}
    assert mining_router.available() == sentence_mining.available() is True
