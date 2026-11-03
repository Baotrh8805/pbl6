"""Sơ đồ chữ Hán (spec 2026-10-30 §3.4): app/extract/kanji_diagram.py trên dữ liệu đã commit (kanji_parts.csv, Unihan, JLPT).
Từ ghép lấy từ danh sách JLPT nên không cần jmdict.sqlite; khoá JMdict chỉ kiểm khi có file."""
import pytest

from app.extract import han_viet, jmdict, kanji_diagram, kanjidata
from app.extract.jlpt import classifier

needs_real = pytest.mark.skipif(
    not (kanjidata.PARTS_FILE.exists() and han_viet.DATA_FILE.exists() and (classifier.DATA_DIR / "n5.csv").exists()),
    reason="chưa có kanji_parts.csv / unihan_vietnamese.csv / jlpt/n5.csv (python scripts/build_dicts.py)")

pytestmark = needs_real


def _nodes(payload, type_=None):
    return {n["id"]: n for n in payload["nodes"] if type_ is None or n["type"] == type_}


def _edges(payload):
    return {(e["from"], e["to"], e["type"]) for e in payload["edges"]}


# ----------------------------------------------------------------------------- resolve: chữ Hán hoặc âm Hán-Việt

def test_resolve_kanji_and_first_kanji_of_word():
    r = kanji_diagram.resolve("時")
    assert r["center"] == "時" and r["candidates"] == [] and r["term"] is None and r["chars"] == ["時"]
    assert kanji_diagram.resolve(" 時間 ")["center"] == "時"      # dán cả từ → chữ đầu là chữ mặc định
    e = kanji_diagram.resolve("々")
    assert e["center"] is None and e["candidates"] == [] and e["term"] is None


def test_resolve_han_viet_many_kanji_gives_candidates():
    r = kanji_diagram.resolve("THANH")
    assert r["center"] is None
    chars = [c["kanji"] for c in r["candidates"]]
    assert {"青", "清"} <= set(chars)
    assert len(chars) == len(set(chars)) <= kanji_diagram.MAX_CANDIDATES
    first = r["candidates"][0]
    assert set(first) == {"kanji", "hanViet", "jlpt", "meaningEn"} and first["hanViet"] == "THANH"
    # cấp dễ trước: không có chữ N1 đứng trước chữ N5
    idx = [classifier.level_index(c["jlpt"]) for c in r["candidates"]]
    assert idx == sorted(idx)


def test_resolve_han_viet_without_diacritics_and_unknown():
    r = kanji_diagram.resolve("thoi")
    assert r["center"] == "時" or "時" in [c["kanji"] for c in r["candidates"]]
    for q in ("xyzxyz", ""):
        e = kanji_diagram.resolve(q)
        assert e == {"center": None, "candidates": [], "term": None, "chars": [], "wordCandidates": []}, q


def test_resolve_word_from_kanji_run():
    r = kanji_diagram.resolve(" 学生です。")
    assert r["term"] == "学生" and r["chars"] == ["学", "生"] and r["center"] == "学"
    assert kanji_diagram.resolve("食べる")["term"] is None and kanji_diagram.resolve("食べる")["center"] == "食"
    long = kanji_diagram.resolve("日本語能力試験")
    assert long["term"] is None and long["center"] == "日" and len(long["chars"]) == 7
    assert kanji_diagram.resolve("人々")["chars"] == ["人"] and kanji_diagram.resolve("人々")["term"] == "人々"   # spec §2: 々 vẫn là từ
    assert kanji_diagram.resolve("時時")["term"] == "時時" and kanji_diagram.resolve("時時")["chars"] == ["時"]


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


# ----------------------------------------------------------------------------- structure

def test_structure_toki_parts_radical_phon_and_family():
    p = kanji_diagram.structure("時")
    nodes, edges = _nodes(p), _edges(p)
    center = nodes["k:時"]
    assert center["type"] == "center" and center["hanViet"] == "THỜI" and center["jlpt"] == "N5"
    assert nodes["k:日"]["type"] == "component" and nodes["k:日"]["role"] == "radical"
    assert nodes["k:寺"]["type"] == "component" and nodes["k:寺"]["role"] == "phon"
    assert nodes["k:寺"]["expandable"] is True and nodes["k:寺"]["position"] == "right"
    assert ("k:日", "k:時", "radical") in edges and ("k:寺", "k:時", "phon") in edges
    family = _nodes(p, "phonetic")
    assert {"k:持", "k:待", "k:特", "k:等", "k:詩", "k:侍"} <= set(family)
    assert "k:時" not in family and "k:寺" not in family
    assert family["k:持"]["sameOn"] is True and family["k:待"]["sameOn"] is False
    assert ("k:寺", "k:持", "phon") in edges and ("k:寺", "k:待", "family") in edges
    assert p["stats"]["kanji"] == len(nodes) and p["stats"]["words"] == 0 and p["stats"]["parts"] is True


def test_structure_detail_for_panel():
    d = kanji_diagram.structure("時")["detail"]
    assert d["kanji"] == "時" and d["hanViet"] == "THỜI" and d["strokeCount"] == 10 and d["jlpt"] == "N5"
    assert "ジ" in d["on"] and "とき" in d["kun"]
    assert d["radical"]["no"] == 72 and d["radical"]["char"] == "日" and d["radical"]["nameVi"]
    assert [(f["part"], f["role"]) for f in d["formula"]] == [("日", "radical"), ("寺", "phon")]
    assert d["formula"][0]["hanViet"] == "NHẬT" and d["formula"][1]["hanViet"] == "TỰ"
    assert d["phon"] == "寺" and d["phonOf"] == []                 # 時 không làm chỉ âm cho chữ JLPT nào
    assert d["compounds"] and d["compounds"][0]["term"]              # panel "Từ có chữ" ở cả hai chế độ


def test_structure_tera_variant_phon_and_phon_of():
    p = kanji_diagram.structure("寺")
    d = p["detail"]
    assert [(f["part"], f["role"]) for f in d["formula"]] == [("土", "phon"), ("寸", "radical")]
    assert d["phon"] == "之"
    assert _nodes(p)["k:土"]["phon"] == "之"                        # part là biến thể của chỉ âm 之
    assert {x["kanji"] for x in d["phonOf"]} >= {"時", "持", "待", "特", "等", "詩", "侍"}
    same = {x["kanji"]: x["sameOn"] for x in d["phonOf"]}
    assert same["持"] is True and same["待"] is False


def test_structure_without_phon_has_no_family():
    p = kanji_diagram.structure("明")
    assert _nodes(p, "phonetic") == {}
    assert [f["part"] for f in p["detail"]["formula"]] == ["日", "月"]
    assert p["detail"]["phon"] is None


def test_structure_guesses_phon_when_kanjivg_has_none():
    # 但: KanjiVG không đánh dấu kvg:phon; part 旦 (タン) trùng âm On chính với 但 (タン) và không phải bộ → "có thể là chỉ âm"
    p = kanji_diagram.structure("但")
    n = _nodes(p)["k:旦"]
    assert n["role"] == "phon" and n["guess"] is True
    assert ("k:旦", "k:但", "phon") in _edges(p)
    f = {x["part"]: x for x in p["detail"]["formula"]}
    assert f["旦"]["role"] == "phon" and f["旦"]["guess"] is True and f["亻"]["role"] == "radical"
    assert p["detail"]["phon"] == "旦" and p["detail"]["phonGuess"] is True
    # part đã đánh dấu kvg:phon thật thì không có cờ guess
    assert "guess" not in _nodes(kanji_diagram.structure("時"))["k:寺"]
    assert kanji_diagram.structure("時")["detail"]["phonGuess"] is False


def test_structure_guess_skips_radicals_and_rare_readings():
    # 太: part 大 trùng âm タイ nhưng 大 là bộ thủ Khang Hi (và là bộ của 太) → không đoán; 明: 日 / 月 không trùng âm → không đoán
    for ch in ("太", "明"):
        p = kanji_diagram.structure(ch)
        assert all(not n.get("guess") for n in p["nodes"]), ch
        assert p["detail"]["phon"] is None and p["detail"]["phonGuess"] is False, ch
    # 体: 本 chỉ trùng âm On hiếm (ホン không phải âm chính của 体) → không đoán
    assert kanji_diagram.structure("体")["detail"]["phon"] is None


def test_structure_never_duplicates_nodes_or_self_links_across_jlpt():
    # review 30/10 C1 / I1 / M1: part trùng chữ tâm (侵 備 稲 陰, 王 partial), họ chỉ âm trùng thành phần (溶 → 容), part lặp (三)
    jl = classifier.jlpt_kanji_set()
    bad = []
    for ch in sorted(jl):
        p = kanji_diagram.structure(ch)
        ids = [n["id"] for n in p["nodes"]]
        if len(ids) != len(set(ids)):
            bad.append((ch, "node trùng id"))
        if any(e["from"] == e["to"] for e in p["edges"]):
            bad.append((ch, "cạnh tự nối"))
        keys = [(e["from"], e["to"], e["type"]) for e in p["edges"]]
        if len(keys) != len(set(keys)):
            bad.append((ch, "cạnh trùng"))
        d = p["detail"]
        if d["phon"] == ch or any(f["part"] == ch for f in d["formula"]):
            bad.append((ch, "tự tham chiếu"))
    assert bad == []
    assert "k:侵" not in {n["id"] for n in kanji_diagram.structure("侵")["nodes"] if n["type"] != "center"}
    assert kanji_diagram.structure("侵")["detail"]["phon"] is None
    sol = kanji_diagram.structure("溶")
    assert [n["id"] for n in sol["nodes"]].count("k:容") == 1
    assert sum(1 for e in kanji_diagram.structure("三")["edges"]) == 1


def test_structure_single_kanji_only_center():
    p = kanji_diagram.structure("日")
    assert list(_nodes(p)) == ["k:日"] and p["edges"] == []
    assert p["detail"]["formula"] == [] and p["stats"]["kanji"] == 1


def test_structure_family_capped_and_jlpt_only():
    p = kanji_diagram.structure("放")                                # họ 方: 8 chữ JLPT (訪 放 防 妨 房 芳 倣 肪)
    family = _nodes(p, "phonetic")
    assert 3 <= len(family) <= kanji_diagram.MAX_FAMILY and "k:放" not in family
    jl = classifier.jlpt_kanji_set()
    assert all(n["label"] in jl for n in family.values())
    # chữ 方 làm tâm: không có part nào mang chỉ âm nên không có họ trên sơ đồ, nhưng panel liệt kê "làm phần chỉ âm (N)"
    d = kanji_diagram.structure("方")["detail"]
    assert {"放", "防", "訪"} <= {x["kanji"] for x in d["phonOf"]} and len(d["phonOf"]) <= kanji_diagram.MAX_FAMILY


# ----------------------------------------------------------------------------- compounds

def test_compounds_toki_words_and_other_kanji():
    p = kanji_diagram.compounds("時")
    words, edges = _nodes(p, "word"), _edges(p)
    assert {"w:時間", "w:時代", "w:時計"} <= set(words)
    assert len(words) <= kanji_diagram.MAX_WORDS
    w = words["w:時間"]
    assert w["reading"] == "じかん" and w["jlpt"] == "N5" and w["hanViet"] == "THỜI GIAN" and w["meaningEn"]
    assert w["key"] is None or w["key"].startswith("w:")
    if jmdict.available():
        assert w["key"].startswith("w:") and w["key"][2:].isdigit()
    assert ("k:時", "w:時間", "compound") in edges
    assert _nodes(p)["k:間"]["type"] == "kanji" and ("w:時間", "k:間", "contains") in edges
    assert "k:時" in _nodes(p, "center")
    assert p["stats"]["words"] == len(words) and p["stats"]["jmdict"] is jmdict.available()
    assert p["detail"]["kanji"] == "時"                              # panel vẫn đủ chi tiết ở chế độ từ ghép


def test_compounds_sorted_easy_first():
    p = kanji_diagram.compounds("時")
    levels = [classifier.level_index(n["jlpt"]) for n in p["nodes"] if n["type"] == "word"]
    assert levels == sorted(levels)


# ----------------------------------------------------------------------------- diagram(q, mode)

def test_diagram_shape_and_modes():
    p = kanji_diagram.diagram("時", "compounds")
    assert set(p) == {"query", "mode", "center", "candidates", "nodes", "edges", "detail", "stats",
                      "chars", "selectedChar", "word", "wordCandidates"}
    assert p["chars"] == ["時"] and p["selectedChar"] == "時" and p["word"] is None and p["wordCandidates"] == []
    assert p["query"] == "時" and p["mode"] == "compounds" and p["center"] == "k:時"
    s = kanji_diagram.diagram("時", "structure")
    assert s["mode"] == "structure" and "k:寺" in _nodes(s)


def test_diagram_candidates_and_unknown_are_empty_graphs():
    p = kanji_diagram.diagram("THANH", "structure")
    assert p["center"] is None and p["candidates"] and p["nodes"] == [] and p["edges"] == [] and p["detail"] is None
    q = kanji_diagram.diagram("abc", "structure")
    assert q == {"query": "abc", "mode": "structure", "center": None, "candidates": [], "nodes": [], "edges": [],
                 "detail": None, "stats": {"kanji": 0, "words": 0, "parts": kanjidata.availability()["kanjiParts"],
                                           "jmdict": jmdict.available()},
                 "chars": [], "selectedChar": None, "word": None, "wordCandidates": []}


def test_diagram_rejects_bad_mode():
    with pytest.raises(ValueError):
        kanji_diagram.diagram("時", "tree")


# ----------------------------------------------------------------------------- chế độ word (spec từ nhiều chữ §3–4)

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
    assert p["stats"]["words"] == 1 and p["stats"]["kanji"] == len(p["nodes"]) - 1


def test_word_mode_k_and_fallbacks():
    s = kanji_diagram.diagram("学生", "structure", "生")
    assert s["mode"] == "structure" and s["center"] == "k:生" and s["selectedChar"] == "生" and s["chars"] == ["学", "生"]
    assert s["word"]["term"] == "学生"                              # thanh chọn chữ vẫn có từ để quay về
    assert kanji_diagram.diagram("学生", "structure", "水")["center"] == "k:学"    # k ngoài cụm → chữ đầu
    one = kanji_diagram.diagram("時", "word")
    assert one["mode"] == "structure" and one["center"] == "k:時"
    assert kanji_diagram.diagram("時")["mode"] == "structure"
    long = kanji_diagram.diagram("日本語能力試験")
    assert long["mode"] == "structure" and long["word"] is None and len(long["chars"]) == 7
    cands = kanji_diagram.diagram("かみ")
    assert cands["center"] is None and cands["wordCandidates"] and cands["nodes"] == []
    h = kanji_diagram.diagram("色々")
    assert h["mode"] == "word" and h["center"] == "w:色々" and [n["id"] for n in h["nodes"]].count("k:色") == 1


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
