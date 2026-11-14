"""conjugate: nhóm động từ (Sudachi + heuristic), bảng chia vàng, động từ đặc biệt, đáp án sai, nhãn tiếng Việt.

Bảng vàng tự tay kiểm theo sách giáo khoa (Minna no Nihongo / Genki): 26 五段 đủ 9 đuôi, 12 一段, 3 サ変, 3 カ変.
Sanity trên dữ liệu thật: động từ trong danh sách JLPT N5/N4 đã commit phải nhận diện được nhóm gần hết.
"""
import csv

import pytest

from app.extract import conjugate, tokenizer
from app.extract.conjugate import FORMS, analyze, forms, group_of, heuristic_group, label_vi, wrong_forms
from app.extract.jlpt import classifier

# lemma, nhóm, te, ta, nai, masu, potential, passive, causative, causative_passive
GOLDEN = [
    # 五段 — mỗi đuôi く ぐ す つ ぬ ぶ む る う
    ("書く", "godan", "書いて", "書いた", "書かない", "書きます", "書ける", "書かれる", "書かせる", "書かせられる"),
    ("聞く", "godan", "聞いて", "聞いた", "聞かない", "聞きます", "聞ける", "聞かれる", "聞かせる", "聞かせられる"),
    ("行く", "godan", "行って", "行った", "行かない", "行きます", "行ける", "行かれる", "行かせる", "行かせられる"),
    ("泳ぐ", "godan", "泳いで", "泳いだ", "泳がない", "泳ぎます", "泳げる", "泳がれる", "泳がせる", "泳がせられる"),
    ("急ぐ", "godan", "急いで", "急いだ", "急がない", "急ぎます", "急げる", "急がれる", "急がせる", "急がせられる"),
    ("話す", "godan", "話して", "話した", "話さない", "話します", "話せる", "話される", "話させる", "話させられる"),
    ("貸す", "godan", "貸して", "貸した", "貸さない", "貸します", "貸せる", "貸される", "貸させる", "貸させられる"),
    ("待つ", "godan", "待って", "待った", "待たない", "待ちます", "待てる", "待たれる", "待たせる", "待たせられる"),
    ("立つ", "godan", "立って", "立った", "立たない", "立ちます", "立てる", "立たれる", "立たせる", "立たせられる"),
    ("持つ", "godan", "持って", "持った", "持たない", "持ちます", "持てる", "持たれる", "持たせる", "持たせられる"),
    ("死ぬ", "godan", "死んで", "死んだ", "死なない", "死にます", "死ねる", "死なれる", "死なせる", "死なせられる"),
    ("遊ぶ", "godan", "遊んで", "遊んだ", "遊ばない", "遊びます", "遊べる", "遊ばれる", "遊ばせる", "遊ばせられる"),
    ("呼ぶ", "godan", "呼んで", "呼んだ", "呼ばない", "呼びます", "呼べる", "呼ばれる", "呼ばせる", "呼ばせられる"),
    ("読む", "godan", "読んで", "読んだ", "読まない", "読みます", "読める", "読まれる", "読ませる", "読ませられる"),
    ("飲む", "godan", "飲んで", "飲んだ", "飲まない", "飲みます", "飲める", "飲まれる", "飲ませる", "飲ませられる"),
    ("帰る", "godan", "帰って", "帰った", "帰らない", "帰ります", "帰れる", "帰られる", "帰らせる", "帰らせられる"),
    ("入る", "godan", "入って", "入った", "入らない", "入ります", "入れる", "入られる", "入らせる", "入らせられる"),
    ("走る", "godan", "走って", "走った", "走らない", "走ります", "走れる", "走られる", "走らせる", "走らせられる"),
    ("知る", "godan", "知って", "知った", "知らない", "知ります", "知れる", "知られる", "知らせる", "知らせられる"),
    ("切る", "godan", "切って", "切った", "切らない", "切ります", "切れる", "切られる", "切らせる", "切らせられる"),
    ("作る", "godan", "作って", "作った", "作らない", "作ります", "作れる", "作られる", "作らせる", "作らせられる"),
    ("しゃべる", "godan", "しゃべって", "しゃべった", "しゃべらない", "しゃべります", "しゃべれる", "しゃべられる",
     "しゃべらせる", "しゃべらせられる"),
    ("買う", "godan", "買って", "買った", "買わない", "買います", "買える", "買われる", "買わせる", "買わせられる"),
    ("会う", "godan", "会って", "会った", "会わない", "会います", "会える", "会われる", "会わせる", "会わせられる"),
    ("言う", "godan", "言って", "言った", "言わない", "言います", "言える", "言われる", "言わせる", "言わせられる"),
    ("使う", "godan", "使って", "使った", "使わない", "使います", "使える", "使われる", "使わせる", "使わせられる"),
    # 一段 (上一段 + 下一段, kể cả gốc 1 mora)
    ("食べる", "ichidan", "食べて", "食べた", "食べない", "食べます", "食べられる", "食べられる", "食べさせる", "食べさせられる"),
    ("見る", "ichidan", "見て", "見た", "見ない", "見ます", "見られる", "見られる", "見させる", "見させられる"),
    ("起きる", "ichidan", "起きて", "起きた", "起きない", "起きます", "起きられる", "起きられる", "起きさせる", "起きさせられる"),
    ("着る", "ichidan", "着て", "着た", "着ない", "着ます", "着られる", "着られる", "着させる", "着させられる"),
    ("寝る", "ichidan", "寝て", "寝た", "寝ない", "寝ます", "寝られる", "寝られる", "寝させる", "寝させられる"),
    ("教える", "ichidan", "教えて", "教えた", "教えない", "教えます", "教えられる", "教えられる", "教えさせる", "教えさせられる"),
    ("忘れる", "ichidan", "忘れて", "忘れた", "忘れない", "忘れます", "忘れられる", "忘れられる", "忘れさせる", "忘れさせられる"),
    ("借りる", "ichidan", "借りて", "借りた", "借りない", "借ります", "借りられる", "借りられる", "借りさせる", "借りさせられる"),
    ("出る", "ichidan", "出て", "出た", "出ない", "出ます", "出られる", "出られる", "出させる", "出させられる"),
    ("いる", "ichidan", "いて", "いた", "いない", "います", "いられる", "いられる", "いさせる", "いさせられる"),
    ("信じる", "ichidan", "信じて", "信じた", "信じない", "信じます", "信じられる", "信じられる", "信じさせる", "信じさせられる"),
    ("開ける", "ichidan", "開けて", "開けた", "開けない", "開けます", "開けられる", "開けられる", "開けさせる", "開けさせられる"),
    # サ変
    ("する", "suru", "して", "した", "しない", "します", "できる", "される", "させる", "させられる"),
    ("勉強する", "suru", "勉強して", "勉強した", "勉強しない", "勉強します", "勉強できる", "勉強される", "勉強させる", "勉強させられる"),
    ("紹介する", "suru", "紹介して", "紹介した", "紹介しない", "紹介します", "紹介できる", "紹介される", "紹介させる", "紹介させられる"),
    # カ変 (kanji / kana / ghép qua て)
    ("来る", "kuru", "来て", "来た", "来ない", "来ます", "来られる", "来られる", "来させる", "来させられる"),
    ("くる", "kuru", "きて", "きた", "こない", "きます", "こられる", "こられる", "こさせる", "こさせられる"),
    ("持ってくる", "kuru", "持ってきて", "持ってきた", "持ってこない", "持ってきます", "持ってこられる", "持ってこられる",
     "持ってこさせる", "持ってこさせられる"),
]
GOLDEN_FORMS = ("te", "ta", "nai", "masu", "potential", "passive", "causative", "causative_passive")


def test_golden_table_has_enough_coverage():
    assert len(GOLDEN) >= 40
    assert {row[1] for row in GOLDEN} == set(conjugate.GROUPS)


@pytest.mark.parametrize("row", GOLDEN, ids=[r[0] for r in GOLDEN])
def test_golden_group_and_forms(row):
    lemma, group, *expected = row
    assert group_of(lemma) == group
    got = forms(lemma, group)
    assert [got[f] for f in GOLDEN_FORMS] == expected
    assert set(got) == set(FORMS)


# ----------------------------------------------------------------------------- nhận diện nhóm

def test_analyze_normalises_conjugated_input_and_sa_nouns():
    assert analyze("食べました").lemma == "食べる"
    assert analyze("食べました").reading == "たべる"
    assert analyze("書いて").lemma == "書く"
    assert analyze("持ってきた").lemma == "持ってくる"
    info = analyze("勉強")
    assert (info.lemma, info.reading, info.group) == ("勉強する", "べんきょうする", "suru")
    assert analyze("勉強", "べんきょう").reading == "べんきょうする"
    # cách đọc caller gửi được giữ khi mục đã ở dạng từ điển
    assert analyze("切る", "きる").reading == "きる"
    assert analyze("切る").reading == "きる"


def test_analyze_keeps_voice_auxiliaries_as_derived_ichidan_verbs():
    # Sudachi tách 知らせる = 知ら + せる(助動詞); phải là động từ 一段 riêng, không rút về 知る
    assert analyze("知らせる").lemma == "知らせる"
    assert analyze("知らせる").group == "ichidan"
    assert analyze("知らせる").reading == "しらせる"
    assert analyze("知らせた").lemma == "知らせる"
    assert group_of("聞かせる") == "ichidan"
    assert group_of("思われる") == "ichidan"
    assert forms("知らせる", "ichidan")["te"] == "知らせて"
    assert forms("知らせる", "ichidan", "しらせる")["humble_o_suru"] == "お知らせする"
    # trợ động từ thì / lịch sự vẫn được bỏ
    assert analyze("書かない").lemma == "書く"
    assert analyze("行きたい").lemma == "行く"


def test_analyze_retries_kana_verbs_sudachi_mislabels_alone():
    # かける / はく đứng một mình Sudachi gán 名詞; thêm こと ép ngữ cảnh động từ
    assert group_of("かける") == "ichidan"
    assert group_of("はく") == "godan"
    assert group_of("きく") == "godan"
    assert analyze("かける").lemma == "かける"
    # danh từ thật không bị ép thành động từ
    for noun in ("いす", "にく", "なつ", "ます", "です"):
        assert group_of(noun) is None, noun


def test_group_of_special_verbs_before_sudachi():
    # Sudachi tách おっしゃる = おる + しゃる, ご覧になる = ご覧 + に + なる → bảng đặc biệt phải thắng
    assert group_of("おっしゃる") == "godan"
    assert group_of("ご覧になる") == "godan"
    assert group_of("差し上げる") == "ichidan"
    assert group_of("拝見する") == "suru"
    assert group_of("ある") == "godan"
    # 居る đọc いる (上一段) — không được alias về khiêm nhường ngữ おる (五段); 居ます phải rút về cùng lemma / nhóm
    assert (analyze("居る").group, analyze("居る").reading) == ("ichidan", "いる")
    assert (analyze("居ます").lemma, analyze("居ます").group) == ("居る", "ichidan")
    assert (forms("居る", "ichidan")["honorific_o_ni_naru"], forms("居る", "ichidan")["humble_o_suru"]) == ("いらっしゃる", "おる")
    assert group_of("おる") == "godan" and forms("おる", "godan")["humble_o_suru"] is None


@pytest.mark.parametrize("term", ["日本語", "きれい", "", "   ", "食べ物", "とても"])
def test_group_of_non_verbs_is_none(term):
    assert group_of(term) is None


def test_compound_flag_only_for_te_chains_of_godan_ichidan():
    assert analyze("連れていく").compound is True
    assert analyze("持ってくる").compound is False
    assert analyze("勉強する").compound is False
    assert analyze("食べる").compound is False


@pytest.mark.parametrize("term, reading, expected", [
    ("たべる", None, "ichidan"), ("みる", None, "ichidan"), ("おきる", None, "ichidan"),
    ("かく", None, "godan"), ("はなす", None, "godan"), ("かう", None, "godan"),
    ("かえる", None, "godan"), ("はいる", None, "godan"), ("しる", None, "godan"), ("しゃべる", None, "godan"),
    ("べんきょうする", None, "suru"), ("論ずる", None, "suru"), ("もってくる", None, "kuru"), ("来る", None, "kuru"),
    ("見る", None, None),            # kanji trước る, không có cách đọc → không đoán bừa
    ("見る", "みる", "ichidan"), ("切る", "きる", "godan"), ("食べる", "たべる", "ichidan"),
    ("日本", None, None), ("きれい", None, None),
])
def test_heuristic_group(term, reading, expected):
    assert heuristic_group(term, reading) == expected


def test_group_of_falls_back_to_heuristic_without_sudachi(monkeypatch):
    monkeypatch.setattr(tokenizer, "available", lambda: False)
    assert group_of("たべる") == "ichidan"
    assert group_of("かく") == "godan"
    assert group_of("食べる") == "ichidan"      # okurigana べ (hàng e) đủ để đoán
    assert group_of("見る", "みる") == "ichidan"
    assert group_of("見る") is None               # kanji sát る, không có cách đọc → không đoán
    assert conjugate.available() is False


# ----------------------------------------------------------------------------- dạng đặc biệt / bất quy tắc

def test_full_paradigm_suru_and_kuru():
    assert forms("する", "suru") == {
        "te": "して", "ta": "した", "nai": "しない", "masu": "します", "potential": "できる", "passive": "される",
        "causative": "させる", "causative_passive": "させられる", "volitional": "しよう", "imperative": "しろ",
        "honorific_o_ni_naru": "なさる", "humble_o_suru": "いたす"}
    assert forms("来る", "kuru") == {
        "te": "来て", "ta": "来た", "nai": "来ない", "masu": "来ます", "potential": "来られる", "passive": "来られる",
        "causative": "来させる", "causative_passive": "来させられる", "volitional": "来よう", "imperative": "来い",
        "honorific_o_ni_naru": "いらっしゃる", "humble_o_suru": "参る"}
    kana = forms("くる", "kuru")
    assert (kana["volitional"], kana["imperative"], kana["humble_o_suru"]) == ("こよう", "こい", "まいる")


def test_irregular_exceptions():
    assert forms("行く", "godan")["te"] == "行って"
    assert forms("いく", "godan")["ta"] == "いった"
    assert forms("歩いていく", "godan")["te"] == "歩いていって"
    aru = forms("ある", "godan")
    assert (aru["nai"], aru["te"], aru["masu"]) == ("ない", "あって", "あります")
    assert aru["potential"] is None and aru["passive"] is None and aru["imperative"] is None
    assert aru["volitional"] is None
    assert forms("問う", "godan")["te"] == "問うて"
    assert forms("できる", "ichidan")["potential"] is None
    assert forms("分かる", "godan")["potential"] is None
    # 愛する: khả năng 愛せる; 論ずる ≈ 論じる
    assert (forms("愛する", "suru")["potential"], forms("愛する", "suru")["te"]) == ("愛せる", "愛して")
    assert (forms("論ずる", "suru")["te"], forms("論ずる", "suru")["potential"]) == ("論じて", "論じられる")


def test_aru_type_honorific_verbs_use_i_onbin():
    assert forms("くださる", "godan")["imperative"] == "ください"
    assert forms("くださる", "godan")["masu"] == "くださいます"
    assert forms("いらっしゃる", "godan")["masu"] == "いらっしゃいます"
    assert forms("いらっしゃる", "godan")["imperative"] == "いらっしゃい"
    assert forms("いらっしゃる", "godan")["te"] == "いらっしゃって"
    assert forms("いらっしゃる", "godan")["potential"] is None
    assert forms("なさる", "godan")["imperative"] == "なさい"
    assert forms("おっしゃる", "godan")["masu"] == "おっしゃいます"
    assert forms("おっしゃる", "godan")["imperative"] == "おっしゃい"


def test_special_honorific_and_humble_verbs_conjugate():
    assert forms("召し上がる", "godan")["te"] == "召し上がって"
    assert forms("召し上がる", "godan")["passive"] is None
    goran = forms("ご覧になる", "godan")
    assert (goran["te"], goran["nai"], goran["masu"]) == ("ご覧になって", "ご覧にならない", "ご覧になります")
    assert goran["imperative"] is None and goran["honorific_o_ni_naru"] is None
    assert forms("伺う", "godan")["te"] == "伺って"
    assert forms("申す", "godan")["masu"] == "申します"
    assert (forms("いただく", "godan")["te"], forms("いただく", "godan")["ta"]) == ("いただいて", "いただいた")
    assert (forms("拝見する", "suru")["te"], forms("拝見する", "suru")["potential"]) == ("拝見して", "拝見できる")
    assert forms("差し上げる", "ichidan")["te"] == "差し上げて"
    assert forms("参る", "godan")["masu"] == "参ります"
    # động từ đã là kính ngữ thì không có kính ngữ / khiêm nhường nữa
    for v, g in [("召し上がる", "godan"), ("伺う", "godan"), ("拝見する", "suru"), ("差し上げる", "ichidan")]:
        assert forms(v, g)["honorific_o_ni_naru"] is None and forms(v, g)["humble_o_suru"] is None


@pytest.mark.parametrize("lemma, group, honorific, humble", [
    ("食べる", "ichidan", "召し上がる", "いただく"),
    ("飲む", "godan", "召し上がる", "いただく"),
    ("行く", "godan", "いらっしゃる", "参る"),
    ("来る", "kuru", "いらっしゃる", "参る"),
    ("いる", "ichidan", "いらっしゃる", "おる"),
    ("見る", "ichidan", "ご覧になる", "拝見する"),
    ("言う", "godan", "おっしゃる", "申す"),
    ("する", "suru", "なさる", "いたす"),
    ("くれる", "ichidan", "くださる", None),
    ("あげる", "ichidan", None, "差し上げる"),
    ("もらう", "godan", None, "いただく"),
    ("聞く", "godan", "お聞きになる", "伺う"),
    ("会う", "godan", "お会いになる", "お目にかかる"),
    ("着る", "ichidan", "お召しになる", None),
    ("寝る", "ichidan", "お休みになる", None),
    ("書く", "godan", "お書きになる", "お書きする"),
    ("読む", "godan", "お読みになる", "お読みする"),
    ("待つ", "godan", "お待ちになる", "お待ちする"),
    ("借りる", "ichidan", "お借りになる", "拝借する"),
    ("勉強する", "suru", "ご勉強になる", "ご勉強する"),
    ("説明する", "suru", "ご説明になる", "ご説明する"),
    ("電話する", "suru", "お電話になる", "お電話する"),
    ("コピーする", "suru", "コピーなさる", "コピーいたす"),
    ("持ってくる", "kuru", "持っていらっしゃる", "持ってまいる"),
    ("出る", "ichidan", None, None),          # gốc 1 mora: お出になる / お出する không dùng
    ("連れていく", "godan", None, None),
])
def test_keigo_forms(lemma, group, honorific, humble):
    got = forms(lemma, group, compound=(lemma == "連れていく"))
    assert got["honorific_o_ni_naru"] == honorific
    assert got["humble_o_suru"] == humble


def test_keigo_uses_reading_for_mora_count():
    # 見る: không có cách đọc thì đếm ký tự gốc (見 = 1) → None; có cách đọc みる cũng 1 mora → None
    assert "お見になる" not in forms("見る", "ichidan").values()
    assert "お見になる" not in forms("見る", "ichidan", reading="みる").values()
    assert forms("書く", "godan", reading="かく")["honorific_o_ni_naru"] == "お書きになる"


def test_forms_unknown_group_or_empty_lemma():
    assert all(v is None for v in forms("食べる", "weird").values())
    assert all(v is None for v in forms("", "godan").values())
    assert all(v is None for v in forms("日本", "godan").values())   # không phải đuôi u


# ----------------------------------------------------------------------------- đáp án sai

@pytest.mark.parametrize("row", GOLDEN, ids=[r[0] for r in GOLDEN])
@pytest.mark.parametrize("form", FORMS)
def test_wrong_forms_properties(row, form):
    lemma, group = row[0], row[1]
    correct = forms(lemma, group)[form]
    wrongs = wrong_forms(lemma, group, form)
    if correct is None:
        assert wrongs == []
        return
    assert 2 <= len(wrongs) <= 3
    assert correct not in wrongs
    assert lemma not in wrongs
    assert len(set(wrongs)) == len(wrongs)
    assert all(w and w.strip() == w for w in wrongs)
    assert not (conjugate.alternatives(lemma, group, form) & set(wrongs))
    assert wrongs == wrong_forms(lemma, group, form)   # xác định


@pytest.mark.parametrize("lemma, group, form, expected", [
    ("書く", "godan", "te", "書って"),              # 五段 coi như つ/る
    ("書く", "godan", "te", "書て"),                # 五段 coi như 一段
    ("行く", "godan", "te", "行いて"),              # quên ngoại lệ 行く
    ("食べる", "ichidan", "te", "食べって"),        # 一段 coi như 五段
    ("食べる", "ichidan", "nai", "食べらない"),
    ("食べる", "ichidan", "potential", "食べれる"),  # ら抜き
    ("書く", "godan", "passive", "書かせる"),       # đổi chỗ bị động ↔ sai khiến
    ("書く", "godan", "causative", "書かれる"),
    ("食べる", "ichidan", "causative", "食べられる"),
    ("話す", "godan", "causative_passive", "話さされる"),   # rút gọn sai với đuôi す
    ("食べる", "ichidan", "causative_passive", "食べさせれる"),
    ("食べる", "ichidan", "honorific_o_ni_naru", "お食べになる"),
    ("食べる", "ichidan", "honorific_o_ni_naru", "いただく"),
    ("見る", "ichidan", "humble_o_suru", "お見する"),
    ("見る", "ichidan", "humble_o_suru", "ご覧になる"),
    ("書く", "godan", "honorific_o_ni_naru", "お書きする"),
    ("勉強する", "suru", "humble_o_suru", "ご勉強になる"),
    ("する", "suru", "nai", "さない"),
    ("来る", "kuru", "potential", "来れる"),
    ("くる", "kuru", "nai", "きない"),
    ("食べる", "ichidan", "imperative", "食べれ"),
    ("書く", "godan", "volitional", "書よう"),
])
def test_wrong_forms_contain_common_learner_errors(lemma, group, form, expected):
    assert expected in wrong_forms(lemma, group, form)


def test_wrong_forms_never_use_valid_alternatives():
    assert "読まされる" not in wrong_forms("読む", "godan", "causative_passive", k=10)
    assert "食べよ" not in wrong_forms("食べる", "ichidan", "imperative", k=10)
    assert "勉強なさる" not in wrong_forms("勉強する", "suru", "honorific_o_ni_naru", k=10)
    assert "お書きいたす" not in wrong_forms("書く", "godan", "humble_o_suru", k=10)


def test_wrong_forms_edge_cases():
    assert wrong_forms("ある", "godan", "potential") == []       # dạng không tồn tại
    assert wrong_forms("書く", "godan", "te", k=0) == []
    assert wrong_forms("書く", "godan", "nope") == []
    assert len(wrong_forms("書く", "godan", "te", k=6)) == 6


def test_kana_keigo_tables_apply_only_to_the_matching_group():
    """Khoá kana trong bảng kính ngữ là của một động từ cụ thể: きる 五段 là 切る → お切りになる / お切りする theo quy tắc,
    không phải おめしになる của 着る (一段); 一段 vẫn tra bảng. Quiz dựa vào nhóm Sudachi phát hiện nên đáp án phải theo nhóm."""
    godan = forms("きる", "godan", "きる")
    assert (godan["honorific_o_ni_naru"], godan["humble_o_suru"]) == ("おきりになる", "おきりする")
    ichidan = forms("きる", "ichidan", "きる")
    assert (ichidan["honorific_o_ni_naru"], ichidan["humble_o_suru"]) == ("おめしになる", None)
    assert forms("ねる", "godan", "ねる")["honorific_o_ni_naru"] == "おねりになる"        # 練る, không phải 寝る
    assert forms("いる", "ichidan", "いる")["humble_o_suru"] == "おる"                     # 居る vẫn đúng bảng
    assert forms("切る", "godan", "きる")["honorific_o_ni_naru"] == "お切りになる"
    # đáp án đúng của 切る không được lọt vào đáp án sai; quiz 五段 có thể dùng おめしになる (của 着る) làm đáp án sai
    assert "おきりになる" not in wrong_forms("きる", "godan", "honorific_o_ni_naru", k=10, reading="きる")
    if tokenizer.available():
        group = group_of("きる")
        want = "おきりになる" if group == "godan" else "おめしになる"
        assert forms("きる", group, "きる")["honorific_o_ni_naru"] == want


def test_aru_nai_distractor_is_the_regular_rule_form():
    """ある là động từ duy nhất có ない bất quy tắc: đáp án sai đầu tiên phải là あらない (áp quy tắc 五段 — lỗi N5 kinh
    điển); với động từ thường dạng quy tắc là đáp án đúng nên không lọt vào đáp án sai."""
    assert wrong_forms("ある", "godan", "nai")[0] == "あらない"
    assert wrong_forms("有る", "godan", "nai")[0] == "有らない"
    assert "ない" not in wrong_forms("ある", "godan", "nai", k=10)
    assert "書かない" not in wrong_forms("書く", "godan", "nai", k=10)


# ----------------------------------------------------------------------------- nhãn

def test_label_vi():
    assert label_vi("te") == "thể て"
    assert label_vi("ta") == "thể た"
    assert label_vi("passive") == "thể bị động"
    assert label_vi("causative_passive") == "thể bị động sai khiến"
    assert label_vi("honorific_o_ni_naru").startswith("kính ngữ")
    assert label_vi("unknown") == "unknown"
    assert set(conjugate.LABELS_VI) == set(FORMS)


# ----------------------------------------------------------------------------- dữ liệu thật

@pytest.mark.skipif(not classifier.available() or not tokenizer.available(), reason="cần JLPT CSV + Sudachi")
def test_jlpt_n5_n4_verbs_mostly_recognised():
    verbs: list[tuple[str, str]] = []
    for level in ("n5", "n4"):
        with open(classifier.DATA_DIR / f"{level}.csv", encoding="utf-8", newline="") as fh:
            for row in csv.DictReader(fh):
                expr, reading, meaning = row["expression"].strip(), row["reading"].strip(), row["meaning"]
                if meaning.startswith("to ") and expr[-1:] in conjugate._A and "〜" not in expr:
                    verbs.append((expr, reading))
    assert len(verbs) >= 150
    recognised = [(v, r, group_of(v, r)) for v, r in verbs]
    ok = [x for x in recognised if x[2]]
    assert len(ok) / len(verbs) >= 0.9, [x for x in recognised if not x[2]][:20]
    for v, r, g in ok:
        f = forms(v, g, r)
        assert f["te"] and f["te"].endswith(("て", "で")), (v, g, f["te"])
        assert f["masu"] and f["masu"].endswith("ます"), (v, g, f["masu"])
        assert wrong_forms(v, g, "te", reading=r), (v, g)
