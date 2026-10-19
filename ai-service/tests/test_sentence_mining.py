"""sentence_mining trên Sudachi + CSV JLPT thật (đã commit); JMdict có hay không chỉ đổi câu chữ của meaningEn
(cột meaning JLPT là fallback) nên test chỉ kiểm tra từ khoá chung của hai nguồn.

Đoạn mẫu thiết kế theo cấp JLPT của từng từ nội dung (người học N5, assumeLevelKnown):
  猫が寝ている。                      0 từ lạ (猫 / 寝る N5)
  新しい政策を見ました。               1: 政策 (N1)          → i+1
  経済は厳しい。                       2: 経済 (N4) + 厳しい (N4)
  昨日は友達と映画を見に行きました。    0
  政府は新しい政策を導入した。          3: 政府 (N3) + 政策 (N1) + 導入 (N1)
  毎日勉強する。                       0 (勉強 N5; する bổ trợ)
  昨日は友達と一緒に新しい政策を見に行きました。   1: 政策 → i+1 nhưng dài hơn
  猫が寝ている。                       trùng → bỏ
"""
import sys

import pytest

from app.extract import sentence_mining as sm
from app.extract.jlpt import classifier

try:
    from tests.test_pipeline import PARAGRAPH as PIPELINE_PARAGRAPH
except Exception:   # test_pipeline đổi tên fixture → bỏ qua test dùng nó thay vì hỏng cả file
    PIPELINE_PARAGRAPH = None

SHORT_I1 = "新しい政策を見ました。"
LONG_I1 = "昨日は友達と一緒に新しい政策を見に行きました。"
TWO_UNKNOWN = "経済は厳しい。"
PARAGRAPH = (
    "猫が寝ている。"
    + SHORT_I1
    + TWO_UNKNOWN
    + "昨日は友達と映画を見に行きました。"
    + "政府は新しい政策を導入した。"
    + "毎日勉強する。\n"
    + "This line has no Japanese.\n"
    + LONG_I1
    + "猫が寝ている。"
)
TARGET_KEYS = {"lemma", "surface", "reading", "level", "meaningEn", "readingSegments"}
ITEM_KEYS = {"sentence", "target", "unknownCount", "knownCount", "length", "score"}


def _sentences(items):
    return [it["sentence"] for it in items]


# ----------------------------------------------------------------------------- tách câu / tập đã biết

def test_split_sentences_matches_pipeline_and_fallback(monkeypatch):
    from app.extract.pipeline import split_sentences as pipeline_split
    sents = sm.split_sentences(PARAGRAPH)
    assert sents == pipeline_split(PARAGRAPH)
    assert len(sents) == 8 and all("This line" not in s for s in sents)
    # pipeline không nạp được → bản sao tại chỗ cho cùng kết quả
    monkeypatch.setitem(sys.modules, "app.extract.pipeline", None)
    assert sm.split_sentences(PARAGRAPH) == sents
    assert sm.split_sentences("") == []


def test_known_set_merges_user_lemmas_and_jlpt_levels():
    user_only = sm.known_set(["経済", " 政策 ", "", "～ている"], "N5", assume_level_known=False)
    assert user_only == {"経済", "政策", "ている"}
    n5 = sm.known_set(["経済", "政策"], "N5", assume_level_known=True)
    assert {"経済", "政策", "猫", "寝る", "学校", "新しい"} <= n5
    assert "政府" not in n5 and "厳しい" not in n5          # N3 / N4
    n3 = sm.known_set([], "N3")
    assert {"政府", "厳しい", "経済"} <= n3 and "政策" not in n3   # 政策 là N1
    assert len(n5) < len(n3) < len(sm.known_set([], "N1"))
    assert sm.known_set([], "bogus") == sm.known_set([], "N5")      # cấp lạ → mặc định N5
    # thẻ ghi dạng giáo trình (勉強する, 散歩をする, 静かな) → thêm dạng lemma Sudachi (勉強, 散歩, 静か); する / な trần không bị cắt rỗng
    assert sm.known_set(["勉強する", "散歩をする", "静かな", "する", "な"], "N5", assume_level_known=False) == {
        "勉強する", "勉強", "散歩をする", "散歩", "静かな", "静か", "する", "な"}


def test_known_textbook_forms_count_as_known():
    # 勉強する khai báo nhưng Sudachi lemma là 勉強 → trước đây bị đếm là lạ (cùng 毎日 → 2 từ lạ → rơi)
    report = sm.mine_report("毎日日本語を勉強します。", ["勉強する", "日本語"], "N5", assume_level_known=False)
    assert report["stats"]["kept"] == 1 and report["items"][0]["target"]["lemma"] == "毎日"
    assert sm.mine_report("毎日日本語を勉強します。", ["勉強", "日本語"], "N5", assume_level_known=False)["stats"]["kept"] == 1


def test_repeated_new_word_is_still_i_plus_one():
    # từ lạ dùng hai lần trong câu là MỘT từ chưa biết (câu minh hoạ tốt), không phải i+2
    report = sm.mine_report("毎朝ジョギングをして、夜もジョギングをする。", [], "N5")
    assert report["stats"] == {"sentences": 1, "kept": 1}
    item = report["items"][0]
    assert item["target"]["lemma"] == "ジョギング" and item["unknownCount"] == 1
    assert sm.mine("毎朝ジョギングをして、夜もジョギングをする。", [], "N5", max_unknown=2) == []


# ----------------------------------------------------------------------------- mine

def test_exactly_one_unknown_kept_two_dropped():
    items = sm.mine(PARAGRAPH, [], "N5")
    assert _sentences(items) == [SHORT_I1, LONG_I1]        # ngắn hơn xếp trước; câu trùng / 0 / 2 / 3 từ lạ bị bỏ
    short = items[0]
    assert set(short) == ITEM_KEYS and set(short["target"]) == TARGET_KEYS
    assert short["target"]["lemma"] == short["target"]["surface"] == "政策"
    assert short["target"]["reading"] == "せいさく" and short["target"]["level"] == "N1"
    assert "policy" in short["target"]["meaningEn"]
    assert short["target"]["readingSegments"] == [{"kanji": "政", "kana": "せい"}, {"kanji": "策", "kana": "さく"}]
    assert (short["unknownCount"], short["knownCount"], short["length"]) == (1, 2, len(SHORT_I1))   # 新しい, 見る
    assert items[1]["knownCount"] == 6 and items[1]["length"] == len(LONG_I1)
    assert 0 < items[1]["score"] < short["score"] <= 1


def test_known_lemmas_remove_unknowns():
    # 経済 đã biết → 経済は厳しい。 chỉ còn 厳しい lạ → được giữ, dạng chia của surface vẫn là lemma
    items = sm.mine(PARAGRAPH, ["経済"], "N5")
    assert TWO_UNKNOWN in _sentences(items)
    kibishii = next(it for it in items if it["sentence"] == TWO_UNKNOWN)
    assert kibishii["target"]["lemma"] == "厳しい" and kibishii["target"]["level"] == "N4"
    assert kibishii["knownCount"] == 1
    # 政策 đã biết → hai câu i+1 cũ không còn từ lạ → rơi
    assert SHORT_I1 not in _sentences(sm.mine(PARAGRAPH, ["政策"], "N5"))
    assert sm.mine(PARAGRAPH, ["政策", "経済", "厳しい"], "N5") == []
    # khai báo bằng surface / có khoảng trắng cũng được
    assert TWO_UNKNOWN in _sentences(sm.mine(PARAGRAPH, [" 経済 "], "N5"))


def test_user_level_n2_treats_easier_levels_as_known():
    items = sm.mine(PARAGRAPH, [], "N2")
    assert _sentences(items) == [SHORT_I1, LONG_I1]        # 政策 N1 vẫn lạ; 経済 / 厳しい (N4) đã biết → 0 từ lạ
    assert TWO_UNKNOWN not in _sentences(items)
    # 政府は新しい政策を導入した。: 政府 (N3) đã biết, còn 政策 + 導入 (N1) = 2 → vẫn rơi
    assert sm.mine(PARAGRAPH, [], "N1") == []              # N1 biết hết


def test_assume_level_known_false_uses_only_known_lemmas():
    assert sm.mine(PARAGRAPH, [], "N5", assume_level_known=False) == []   # mọi từ nội dung đều lạ → không câu nào đúng 1
    items = sm.mine(PARAGRAPH, ["猫"], "N5", assume_level_known=False)
    assert _sentences(items) == ["猫が寝ている。"]
    assert items[0]["target"]["lemma"] == "寝る" and items[0]["target"]["surface"] == "寝"
    assert items[0]["target"]["reading"] == "ねる"          # cách đọc của dạng từ điển, không phải của 寝


def test_max_unknown_two_picks_best_target():
    items = sm.mine(PARAGRAPH, [], "N5", max_unknown=2)
    assert _sentences(items) == [TWO_UNKNOWN]              # câu đúng 1 từ lạ không còn đạt
    assert items[0]["unknownCount"] == 2 and items[0]["knownCount"] == 0
    assert items[0]["target"]["lemma"] in {"経済", "厳しい"}


def test_limit_dedupe_and_stats():
    report = sm.mine_report(PARAGRAPH, [], "N5", limit=1)
    assert _sentences(report["items"]) == [SHORT_I1]
    assert report["stats"] == {"sentences": 7, "kept": 2}  # 8 câu tiếng Nhật, 1 trùng; kept đếm trước limit
    # lặp cùng câu i+1 nhiều lần → một item
    assert len(sm.mine(SHORT_I1 * 5, [], "N5")) == 1
    assert sm.mine("", [], "N5") == [] and sm.mine_report("", [], "N5")["stats"] == {"sentences": 0, "kept": 0}
    assert sm.mine(PARAGRAPH, [], "N5", limit=0) == []
    # "câu" không có dấu câu dài hơn MAX_SENTENCE_CHARS bị bỏ (Sudachi từ chối chuỗi > 49 149 byte), câu còn lại vẫn xét
    blob = "あ" * (sm.MAX_SENTENCE_CHARS + 1)
    assert sm.mine_report(blob + "\n" + SHORT_I1, [], "N5")["stats"] == {"sentences": 1, "kept": 1}
    assert sm.mine_report("あ" * sm.MAX_TEXT_CHARS, [], "N5") == {"items": [], "stats": {"sentences": 0, "kept": 0}}


def test_score_prefers_shorter_sentences_and_listed_targets(monkeypatch):
    short = sm._score(len(SHORT_I1), "政策", True)
    assert sm._score(len(LONG_I1), "政策", True) < short
    assert sm._score(len(SHORT_I1), "政策", False) < short
    assert sm._score(5, "政策", True) == sm._score(sm.IDEAL_LEN, "政策", True)   # dưới IDEAL_LEN không thưởng thêm
    # wordfreq lỗi / thiếu → điểm tần suất 0, không ném
    monkeypatch.setattr(sm.han_viet_graph, "word_frequency", lambda term: 0.0)
    assert sm._score(len(SHORT_I1), "政策", True) == round(0.5 * 1 / (1 + 1 / 20) + 0.25, 3)


def test_oov_noise_never_becomes_target():
    assert sm.mine("覆公を払う。", ["払う"], "N5") == []        # 覆公 là chuỗi lạ duy nhất → bỏ câu
    assert sm.mine("覆公を払う。", [], "N5") == []             # 2 từ lạ
    items = sm.mine("お金を払う。", [], "N5")
    assert len(items) == 1 and items[0]["target"]["lemma"] == "払う"


def test_function_words_and_numbers_are_not_candidates():
    # 彼 (代名詞 N4), 3 (数詞), だ / は / が (trợ từ) không tính; 猫 / 好き N5 → 0 từ lạ → không giữ
    assert sm.mine("彼は3匹の猫が好きだ。", [], "N5") == []
    # て + いる bổ trợ không tính dù いる có cấp N2 ở một danh sách
    assert sm.mine("猫が寝ている。", [], "N5") == []


@pytest.mark.skipif(PIPELINE_PARAGRAPH is None, reason="tests.test_pipeline.PARAGRAPH không nạp được")
def test_pipeline_paragraph_targets_follow_user_level():
    # N5: 日本語 (wordfreq N3) lạ ở câu 1 và 3; こと (N4) lạ ở câu 5
    targets = {it["sentence"]: it["target"]["lemma"] for it in sm.mine(PIPELINE_PARAGRAPH, [], "N5")}
    assert set(targets.values()) == {"日本語", "こと"} and len(targets) == 3
    # N4: こと đã biết, 日本語 vẫn lạ
    assert {it["target"]["lemma"] for it in sm.mine(PIPELINE_PARAGRAPH, [], "N4")} == {"日本語"}
    assert sm.mine(PIPELINE_PARAGRAPH, [], "N3") == []
    assert sm.mine(PIPELINE_PARAGRAPH, ["日本語"], "N4") == []


# ----------------------------------------------------------------------------- mine_for_terms

def test_mine_for_terms_returns_best_sentence_per_term():
    out = sm.mine_for_terms(PARAGRAPH, ["政策", "経済", "猫", "見る", "存在しない語", ""], [], "N5")
    assert [o["term"] for o in out] == ["政策", "経済", "猫", "見る", "存在しない語", ""]
    by_term = {o["term"]: o for o in out}
    assert by_term["政策"]["sentence"] == SHORT_I1              # không phải câu 導入 (còn 政府 / 導入 lạ), không phải câu dài
    assert by_term["政策"]["target"]["level"] == "N1" and set(by_term["政策"]["target"]) == TARGET_KEYS
    assert by_term["経済"] == {"term": "経済", "sentence": None, "target": None}   # 厳しい còn lạ
    assert by_term["猫"]["sentence"] == "猫が寝ている。"          # từ đã biết vẫn có câu: cấp của chính từ không xét
    assert by_term["見る"]["sentence"] == "昨日は友達と映画を見に行きました。"   # khớp qua lemma của dạng đã chia
    assert by_term["見る"]["target"]["surface"] == "見" and by_term["見る"]["target"]["reading"] == "みる"
    assert by_term["存在しない語"]["sentence"] is None and by_term[""]["sentence"] is None


def test_mine_for_terms_respects_known_lemmas_level_and_phrases():
    assert sm.mine_for_terms(PARAGRAPH, ["経済"], ["厳しい"], "N5")[0]["sentence"] == TWO_UNKNOWN
    assert sm.mine_for_terms(PARAGRAPH, ["経済"], [], "N4")[0]["sentence"] == TWO_UNKNOWN   # 厳しい N4 đã biết
    # cụm nhiều token khớp theo chuỗi con; từ bên trong cụm không tính là "từ khác"
    (hit,) = sm.mine_for_terms(PARAGRAPH, ["勉強する"], [], "N5")
    assert hit["sentence"] == "毎日勉強する。"
    assert hit["target"]["lemma"] == hit["target"]["surface"] == "勉強する"
    assert hit["target"]["reading"] == "べんきょうする"
    assert hit["target"]["readingSegments"][0] == {"kanji": "勉", "kana": "べん"}
    assert sm.mine_for_terms("", ["政策"], [], "N5") == [{"term": "政策", "sentence": None, "target": None}]
    assert sm.mine_for_terms(PARAGRAPH, [], [], "N5") == []


def test_mine_for_terms_substring_must_align_with_token_boundaries():
    # 本 không nằm trong 日本, 学生 không nằm trong 留学生: chuỗi con chỉ tính khi khớp ranh giới token Sudachi
    assert sm.mine_for_terms("日本は大きいです。", ["本"], [], "N5")[0]["sentence"] is None
    assert sm.mine_for_terms("留学生が来ました。", ["学生"], [], "N5")[0]["sentence"] is None
    assert sm.mine_for_terms("会社員です。電話番号を書く。", ["会社", "電話"], [], "N5") == [
        {"term": "会社", "sentence": None, "target": None}, {"term": "電話", "sentence": None, "target": None}]
    # cùng câu có cả dạng nằm trong từ khác lẫn dạng đứng riêng → lần xuất hiện đứng riêng được nhận
    # (日本 là N3 nên khai báo đã biết, để câu chỉ còn 本 là từ đang học)
    (hit,) = sm.mine_for_terms("日本の本を読む。", ["本"], ["日本"], "N5")
    assert hit["sentence"] == "日本の本を読む。" and hit["target"]["lemma"] == "本"
    (hit,) = sm.mine_for_terms("学生が来ました。", ["学生"], [], "N5")
    assert hit["sentence"] == "学生が来ました。"
    # cụm nhiều token vẫn khớp theo ranh giới (勉強する = 勉強 + する)
    assert sm.mine_for_terms("毎日勉強する。", ["勉強する"], [], "N5")[0]["sentence"] == "毎日勉強する。"


def test_available_and_graceful_without_jmdict(monkeypatch):
    assert sm.available() is True
    monkeypatch.setattr(sm.jmdict, "lookup", lambda lemma, reading=None: None)
    items = sm.mine(PARAGRAPH, [], "N5")
    assert items and items[0]["target"]["meaningEn"] == classifier.meaning_hint("政策")   # cột meaning của CSV JLPT
    monkeypatch.setattr(sm, "meaning_hint", lambda lemma, reading=None: None)
    assert sm.mine(PARAGRAPH, [], "N5")[0]["target"]["meaningEn"] is None
