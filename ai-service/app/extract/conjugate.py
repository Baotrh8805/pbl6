"""Chia động từ tiếng Nhật cho quiz ngữ pháp (C7): nhóm, bảng dạng chia, đáp án sai có căn cứ, nhãn tiếng Việt.

Nhóm động từ lấy từ 活用型 của Sudachi (``Token.conj_type`` = pos[4]: 五段-カ行 / 上一段-バ行 / 下一段-ア行 /
サ行変格 / カ行変格); Sudachi là nguồn duy nhất phân biệt được 切る (五段) với 着る (上一段). Bảng động từ kính ngữ /
khiêm nhường ngữ tra TRƯỚC Sudachi vì おっしゃる bị tách thành おる+しゃる và ご覧になる thành ご覧+に+なる.
Khi không có Sudachi (hoặc từ OOV) rơi về suy đoán theo đuôi kana: đuôi る với âm trước ở hàng i/e → 一段, trừ danh
sách 五段 quen thuộc (帰る, 入る, 知る…); đuôi khác → 五段.

Mọi hàm đều thuần (không I/O ngoài tokenizer nạp lười); dạng không tự nhiên (お見になる, いらっしゃれる…) trả None để
router bỏ qua cặp (động từ, dạng) đó thay vì bịa. Đáp án sai sinh bằng cách áp quy tắc của NHÓM KHÁC và các lỗi
người học hay mắc (書く→書って, 食べる→食べらない, ら抜き 食べれる, đổi chỗ bị động ↔ sai khiến), luôn ≠ đáp án đúng
và ≠ các biến thể cũng đúng (読まされる = 読ませられる).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from app.extract import tokenizer
from app.extract.jachars import is_kana, is_kanji, kata_to_hira

GROUPS = ("godan", "ichidan", "suru", "kuru")
FORMS = ("te", "ta", "nai", "masu", "potential", "passive", "causative", "causative_passive",
         "volitional", "imperative", "honorific_o_ni_naru", "humble_o_suru")

LABELS_VI = {
    "te": "thể て",
    "ta": "thể た",
    "nai": "thể ない",
    "masu": "thể ます",
    "potential": "thể khả năng",
    "passive": "thể bị động",
    "causative": "thể sai khiến",
    "causative_passive": "thể bị động sai khiến",
    "volitional": "thể ý chí",
    "imperative": "thể mệnh lệnh",
    "honorific_o_ni_naru": "kính ngữ お〜になる",
    "humble_o_suru": "khiêm nhường ngữ お〜する",
}

# ----------------------------------------------------------------------------- bảng kana 五段 (đuôi u → a / i / e / o)
_A = {"う": "わ", "く": "か", "ぐ": "が", "す": "さ", "つ": "た", "ぬ": "な", "ぶ": "ば", "む": "ま", "る": "ら"}
_I = {"う": "い", "く": "き", "ぐ": "ぎ", "す": "し", "つ": "ち", "ぬ": "に", "ぶ": "び", "む": "み", "る": "り"}
_E = {"う": "え", "く": "け", "ぐ": "げ", "す": "せ", "つ": "て", "ぬ": "ね", "ぶ": "べ", "む": "め", "る": "れ"}
_O = {"う": "お", "く": "こ", "ぐ": "ご", "す": "そ", "つ": "と", "ぬ": "の", "ぶ": "ぼ", "む": "も", "る": "ろ"}
_TE = {"う": "って", "く": "いて", "ぐ": "いで", "す": "して", "つ": "って", "ぬ": "んで", "ぶ": "んで", "む": "んで", "る": "って"}
_TE_ENDINGS = ("って", "いて", "んで", "して", "いで")   # mọi âm tiện 五段; sai đuôi âm tiện là lỗi phổ biến nhất

_I_ROW = set("いきしちにひみりぎじぢびぴ")
_E_ROW = set("えけせてねへめれげぜでべぺ")

# 五段 đuôi る mà âm trước ở hàng i/e (heuristic không phân biệt được với 一段). Khoá theo cách đọc hiragana;
# cặp đồng âm nghiêng về nghĩa gặp nhiều hơn (きる → 切る); いる / ねる / しめる / ふける để 一段 (居る / 寝る / 閉める / 更ける).
_GODAN_IRU_ERU = frozenset("""
かえる はいる はしる しる きる かぎる ける へる あせる しゃべる にぎる すべる まじる まいる
いらっしゃる おっしゃる なさる くださる ござる ちる てる ひねる しげる あざける ののしる
おちいる めいる くつがえる さえぎる いじる かじる よぎる にじる なじる そしる みなぎる たぎる ほとばしる けずる
""".split())

# Kango hay đi với お〜 thay vì ご〜 (お電話する, お食事になる)
_O_KANGO = frozenset({"電話", "掃除", "食事", "返事", "約束", "料理", "洗濯", "散歩", "風呂", "化粧", "支度", "世話"})

# Động từ không có thể khả năng tự nhiên (trạng thái / bản thân đã là khả năng)
_NO_POTENTIAL = frozenset({"ある", "有る", "できる", "出来る", "分かる", "わかる", "要る", "見える", "聞こえる"})

_KEIGO_NONE = {"passive": None, "causative": None, "causative_passive": None,
               "honorific_o_ni_naru": None, "humble_o_suru": None}
_ARU_HONORIFIC_NONE = {**_KEIGO_NONE, "potential": None, "volitional": None}


def _aliases(table: dict[str, tuple], aliases: dict[str, str]) -> dict[str, tuple]:
    """Thêm khoá kana (và biến thể viết) trỏ về cùng mục để tra bằng cách người dùng gõ."""
    out = dict(table)
    for alias, canon in aliases.items():
        out[alias] = table[canon]
    return out


# Động từ đặc biệt: lemma → (nhóm, cách đọc, ghi đè dạng). Ghi đè None = dạng không dùng trong quiz.
# いらっしゃる / おっしゃる / なさる / くださる / ござる: 五段 nhưng ます và mệnh lệnh biến âm い (いらっしゃいます, ください).
_SPECIAL: dict[str, tuple[str, str, dict[str, Optional[str]]]] = _aliases({
    "いらっしゃる": ("godan", "いらっしゃる", {**_ARU_HONORIFIC_NONE, "masu": "いらっしゃいます", "imperative": "いらっしゃい"}),
    "おっしゃる": ("godan", "おっしゃる", {**_ARU_HONORIFIC_NONE, "masu": "おっしゃいます", "imperative": "おっしゃい"}),
    "なさる": ("godan", "なさる", {**_ARU_HONORIFIC_NONE, "masu": "なさいます", "imperative": "なさい"}),
    "くださる": ("godan", "くださる", {**_ARU_HONORIFIC_NONE, "masu": "くださいます", "imperative": "ください"}),
    "ござる": ("godan", "ござる", {**_ARU_HONORIFIC_NONE, "masu": "ございます", "imperative": None}),
    "召し上がる": ("godan", "めしあがる", dict(_KEIGO_NONE)),
    "ご覧になる": ("godan", "ごらんになる", {**_KEIGO_NONE, "volitional": None, "imperative": None}),
    "お休みになる": ("godan", "おやすみになる", {**_KEIGO_NONE, "volitional": None, "imperative": None}),
    "伺う": ("godan", "うかがう", dict(_KEIGO_NONE)),
    "申す": ("godan", "もうす", dict(_KEIGO_NONE)),
    "いただく": ("godan", "いただく", dict(_KEIGO_NONE)),
    "拝見する": ("suru", "はいけんする", dict(_KEIGO_NONE)),
    "差し上げる": ("ichidan", "さしあげる", dict(_KEIGO_NONE)),
    "参る": ("godan", "まいる", dict(_KEIGO_NONE)),
    "いたす": ("godan", "いたす", dict(_KEIGO_NONE)),
    "おる": ("godan", "おる", dict(_KEIGO_NONE)),
    "存じる": ("ichidan", "ぞんじる", dict(_KEIGO_NONE)),
    "お目にかかる": ("godan", "おめにかかる", {**_KEIGO_NONE, "volitional": None, "imperative": None}),
    "拝借する": ("suru", "はいしゃくする", dict(_KEIGO_NONE)),
    # ある: phủ định là ない; bị động / sai khiến / mệnh lệnh / kính ngữ không dùng
    "ある": ("godan", "ある", {**_KEIGO_NONE, "potential": None, "imperative": None, "volitional": None}),
    "有る": ("godan", "ある", {**_KEIGO_NONE, "potential": None, "imperative": None, "volitional": None}),
    "できる": ("ichidan", "できる", {**_KEIGO_NONE, "potential": None, "volitional": None, "imperative": None}),
    "出来る": ("ichidan", "できる", {**_KEIGO_NONE, "potential": None, "volitional": None, "imperative": None}),
}, {
    "めしあがる": "召し上がる", "ごらんになる": "ご覧になる", "御覧になる": "ご覧になる", "おやすみになる": "お休みになる",
    "うかがう": "伺う", "もうす": "申す", "頂く": "いただく", "はいけんする": "拝見する", "さしあげる": "差し上げる",
    # 居る KHÔNG alias về おる: thường đọc いる (上一段, Sudachi quyết định), chỉ khiêm nhường ngữ của nó mới là おる
    "まいる": "参る", "致す": "いたす", "ぞんじる": "存じる", "おめにかかる": "お目にかかる",
    "はいしゃくする": "拝借する", "下さる": "くださる", "御座る": "ござる",
})

# Động từ thường → kính ngữ / khiêm nhường ngữ đặc biệt thay cho お〜になる / お〜する.
_HONORIFIC_SPECIAL = {
    "行く": "いらっしゃる", "いく": "いらっしゃる", "来る": "いらっしゃる", "くる": "いらっしゃる", "いる": "いらっしゃる",
    "居る": "いらっしゃる", "食べる": "召し上がる", "たべる": "めしあがる", "飲む": "召し上がる", "のむ": "めしあがる",
    "言う": "おっしゃる", "いう": "おっしゃる", "見る": "ご覧になる", "みる": "ごらんになる", "する": "なさる",
    "くれる": "くださる", "呉れる": "くださる", "寝る": "お休みになる", "ねる": "おやすみになる",
    "死ぬ": "お亡くなりになる", "しぬ": "おなくなりになる", "着る": "お召しになる", "きる": "おめしになる",
}
_HUMBLE_SPECIAL = {
    "行く": "参る", "いく": "まいる", "来る": "参る", "くる": "まいる", "いる": "おる", "居る": "おる",
    "食べる": "いただく", "たべる": "いただく", "飲む": "いただく", "のむ": "いただく", "もらう": "いただく", "貰う": "いただく",
    "言う": "申す", "いう": "もうす", "見る": "拝見する", "みる": "はいけんする", "する": "いたす",
    "あげる": "差し上げる", "上げる": "差し上げる", "聞く": "伺う", "きく": "うかがう", "訪ねる": "伺う", "たずねる": "うかがう",
    "会う": "お目にかかる", "あう": "おめにかかる", "知る": "存じる", "しる": "ぞんじる", "思う": "存じる", "おもう": "ぞんじる",
    "借りる": "拝借する", "かりる": "はいしゃくする",
}
# Động từ thường mà お〜になる / お〜する theo quy tắc không tự nhiên và không có dạng đặc biệt thay thế
_KEIGO_SKIP = {"くれる": ("humble_o_suru",), "呉れる": ("humble_o_suru",), "あげる": ("honorific_o_ni_naru",),
               "上げる": ("honorific_o_ni_naru",), "もらう": ("honorific_o_ni_naru",), "貰う": ("honorific_o_ni_naru",),
               "死ぬ": ("humble_o_suru",), "しぬ": ("humble_o_suru",), "着る": ("humble_o_suru",),
               "きる": ("humble_o_suru",), "寝る": ("humble_o_suru",), "ねる": ("humble_o_suru",)}
# Khoá kana của ba bảng trên là của MỘT động từ cụ thể, nhưng cùng kana có thể là động từ khác nhóm (きる: 着る 一段 /
# 切る 五段; いる: 居る 一段 / 要る 五段; ねる: 寝る 一段 / 練る 五段) → chỉ áp bảng khi nhóm phát hiện được (Sudachi /
# heuristic) trùng nhóm của động từ trong bảng; きる 五段 là 切る nên kính ngữ theo quy tắc おきりになる, không phải おめしになる.
_KANA_KEIGO_GROUP = {"いく": "godan", "くる": "kuru", "いる": "ichidan", "たべる": "ichidan", "のむ": "godan", "いう": "godan",
                     "みる": "ichidan", "する": "suru", "くれる": "ichidan", "ねる": "ichidan", "しぬ": "godan",
                     "きる": "ichidan", "もらう": "godan", "あげる": "ichidan", "きく": "godan", "たずねる": "ichidan",
                     "あう": "godan", "しる": "godan", "おもう": "godan", "かりる": "ichidan"}


def available() -> bool:
    """Chia động từ đầy đủ cần Sudachi để biết nhóm; thiếu Sudachi vẫn chạy bằng heuristic đuôi kana."""
    return tokenizer.available()


def label_vi(form: str) -> str:
    return LABELS_VI.get(form, form)


# ----------------------------------------------------------------------------- nhận diện nhóm

@dataclass(frozen=True, slots=True)
class VerbInfo:
    lemma: str                  # dạng từ điển dùng để chia (勉強 → 勉強する, 食べた → 食べる)
    reading: Optional[str]      # hiragana của lemma; None khi không tra được
    group: str
    compound: bool = False      # động từ ghép qua て / có từ đứng trước (連れていく): không áp お〜になる theo quy tắc


# Trợ động từ thì / lịch sự bỏ được khi chuẩn hoá đầu vào đã chia (食べました, 書かない, 行きたい)
_TENSE_AUX = frozenset({"ます", "た", "だ", "です", "ない", "ぬ", "ん", "う", "たい", "まい"})
# Trợ động từ thái: giữ lại thành động từ phái sinh 一段
_VOICE_AUX = frozenset({"せる", "させる", "れる", "られる"})


def _group_from_conj_type(conj_type: str) -> Optional[str]:
    if conj_type.startswith("五段"):
        return "godan"
    if conj_type.startswith(("上一段", "下一段")):
        return "ichidan"
    if conj_type.startswith("サ行変格"):
        return "suru"
    if conj_type.startswith("カ行変格"):
        return "kuru"
    return None


def heuristic_group(lemma: str, reading: Optional[str] = None) -> Optional[str]:
    """Suy đoán nhóm từ đuôi kana khi không có Sudachi / từ OOV. Đuôi る với âm trước là kanji và không có cách đọc
    → None (không đoán bừa giữa 切る / 着る)."""
    if lemma.endswith(("する", "ずる")):
        return "suru"
    if lemma.endswith(("来る", "くる")):
        return "kuru"
    end = lemma[-1] if lemma else ""
    if end not in _A:
        return None
    if end != "る":
        return "godan"
    key = kata_to_hira(reading) if reading else lemma
    if key in _GODAN_IRU_ERU:
        return "godan"
    prev = key[-2] if len(key) >= 2 else ""
    if prev in _I_ROW or prev in _E_ROW:
        return "ichidan"
    if is_kana(prev):
        return "godan"
    return None


def analyze(term: str, reading: Optional[str] = None) -> Optional[VerbInfo]:
    """Chuẩn hoá một mục từ thành (lemma, cách đọc, nhóm). Nhận cả dạng đã chia (食べました → 食べる) và danh từ サ変
    (勉強 → 勉強する). Không phải động từ → None."""
    term = (term or "").strip()
    reading = kata_to_hira(reading.strip()) if reading and reading.strip() else None
    if not term:
        return None
    if term in _SPECIAL:
        group, canon_reading, _ = _SPECIAL[term]
        return VerbInfo(term, reading or canon_reading, group)
    if not tokenizer.available():
        group = heuristic_group(term, reading)
        return VerbInfo(term, reading, group) if group else None
    toks = tokenizer.tokenize(term, "C")
    # 食べました → bỏ まし+た; 書いて → bỏ て: giữ lại token động từ để lấy dictionary_form. Trợ động từ thái
    # (せる / させる / れる / られる) KHÔNG bỏ: 知らせる là một động từ riêng chứ không phải 知る.
    while len(toks) > 1 and ((toks[-1].pos1 == "助動詞" and toks[-1].lemma in _TENSE_AUX)
                             or (toks[-1].pos1 == "助詞" and toks[-1].surface in ("て", "で"))):
        toks = toks[:-1]
    if not toks:
        return None
    last = toks[-1]
    if last.pos1 == "助動詞" and last.lemma in _VOICE_AUX and len(toks) > 1 and toks[-2].pos1 == "動詞":
        # 知ら + せる / 思わ + れる: động từ phái sinh, luôn 一段 (知らせる, 思われる, 食べさせる)
        lemma = "".join(t.surface for t in toks[:-1]) + last.lemma
        if last.surface == last.lemma:
            lemma_reading = reading or "".join(t.reading for t in toks)
        else:
            lemma_reading = tokenizer.reading_of(lemma)   # 知らせた: cách đọc caller gửi là của dạng đã chia
        return VerbInfo(lemma, lemma_reading or None, "ichidan")
    if last.pos1 != "動詞" and len(toks) == 1 and term[-1:] in _A and "サ変可能" not in last.pos:
        # Từ toàn kana Sudachi gán nhầm POS khi đứng một mình (かける → 名詞, はく → 名詞): thêm こと ép ngữ cảnh
        # danh hoá; danh từ thật (いす, にく) vẫn là danh từ nên không sinh dương tính giả.
        retry = tokenizer.tokenize(term + "こと", "C")
        if len(retry) == 2 and retry[-1].surface == "こと" and retry[0].pos1 == "動詞" and retry[0].surface == term:
            toks, last = retry[:1], retry[0]
    if last.pos1 == "動詞":
        group = _group_from_conj_type(last.conj_type) or heuristic_group(last.lemma, last.reading)
        if group is None:
            return None
        lemma = "".join(t.surface for t in toks[:-1]) + last.lemma
        if last.surface == last.lemma:
            lemma_reading = reading or "".join(t.reading for t in toks)
        else:
            lemma_reading = tokenizer.reading_of(lemma)   # cách đọc caller gửi là của dạng đã chia, không dùng
        # サ変 ghép (勉強 + する) không coi là ghép; chuỗi て (持って + くる) với kuru vẫn có 参る / いらっしゃる tự nhiên
        compound = len(toks) > 1 and group not in ("suru", "kuru")
        return VerbInfo(lemma, lemma_reading or None, group, compound)
    if len(toks) == 1 and last.pos1 == "名詞" and "サ変可能" in last.pos:
        return VerbInfo(term + "する", (reading or last.reading) + "する", "suru")
    if last.oov:   # Sudachi không biết từ (ググる, バズる) → đoán theo đuôi kana
        group = heuristic_group(term, reading)
        return VerbInfo(term, reading, group) if group else None
    return None


def group_of(lemma: str, reading: Optional[str] = None) -> Optional[str]:
    """'godan' | 'ichidan' | 'suru' | 'kuru' | None (không phải động từ / không đoán được)."""
    info = analyze(lemma, reading)
    return info.group if info else None


# ----------------------------------------------------------------------------- bảng chia theo nhóm

def _none_forms() -> dict[str, Optional[str]]:
    return {f: None for f in FORMS}


def _godan_base(lemma: str) -> dict[str, Optional[str]]:
    """Quy tắc 五段 áp cơ học lên lemma (kể cả khi lemma thật ra là 一段 — dùng để sinh đáp án sai)."""
    stem, end = lemma[:-1], lemma[-1:]
    if end not in _A:
        return _none_forms()
    te = stem + _TE[end]
    if lemma.endswith(("行く", "いく")):          # 行く: 促音便 thay vì い音便
        te = stem + "って"
    elif lemma.endswith(("問う", "請う", "乞う")):  # ウ音便 hiếm
        te = stem + "うて"
    ta = te[:-1] + ("だ" if te.endswith("で") else "た")
    nai = stem + _A[end] + "ない"
    if lemma.endswith(("ある", "有る")):
        nai = lemma[:-2] + "ない"
    masu_stem = stem + _I[end]
    return {
        "te": te, "ta": ta, "nai": nai, "masu": masu_stem + "ます",
        "potential": stem + _E[end] + "る", "passive": stem + _A[end] + "れる",
        "causative": stem + _A[end] + "せる", "causative_passive": stem + _A[end] + "せられる",
        "volitional": stem + _O[end] + "う", "imperative": stem + _E[end],
        "honorific_o_ni_naru": "お" + masu_stem + "になる", "humble_o_suru": "お" + masu_stem + "する",
    }


def _ichidan_base(lemma: str) -> dict[str, Optional[str]]:
    stem = lemma[:-1]
    if not stem:
        return _none_forms()
    return {
        "te": stem + "て", "ta": stem + "た", "nai": stem + "ない", "masu": stem + "ます",
        "potential": stem + "られる", "passive": stem + "られる",
        "causative": stem + "させる", "causative_passive": stem + "させられる",
        "volitional": stem + "よう", "imperative": stem + "ろ",
        "honorific_o_ni_naru": "お" + stem + "になる", "humble_o_suru": "お" + stem + "する",
    }


def _is_kango(prefix: str) -> bool:
    return len(prefix) >= 2 and all(is_kanji(c) for c in prefix)


def _suru_prefix(lemma: str) -> str:
    return lemma[:-2] if lemma.endswith(("する", "ずる")) else lemma


def _suru_base(lemma: str) -> dict[str, Optional[str]]:
    if lemma.endswith("ずる"):   # 論ずる ≈ 論じる (上一段); kính ngữ theo quy tắc không tự nhiên
        out = _ichidan_base(lemma[:-2] + "じる")
        out["honorific_o_ni_naru"] = out["humble_o_suru"] = None
        return out
    p = _suru_prefix(lemma)
    if p and len(p) == 1 and is_kanji(p):   # 愛する / 達する: khả năng 愛せる, kính ngữ không có dạng tự nhiên
        potential, honorific, humble = p + "せる", None, None
    elif not p:
        potential, honorific, humble = "できる", "なさる", "いたす"
    elif _is_kango(p):
        pre = "お" if p in _O_KANGO else "ご"
        potential, honorific, humble = p + "できる", pre + p + "になる", pre + p + "する"
    else:
        potential, honorific, humble = p + "できる", p + "なさる", p + "いたす"
    return {
        "te": p + "して", "ta": p + "した", "nai": p + "しない", "masu": p + "します",
        "potential": potential, "passive": p + "される",
        "causative": p + "させる", "causative_passive": p + "させられる",
        "volitional": p + "しよう", "imperative": p + "しろ",
        "honorific_o_ni_naru": honorific, "humble_o_suru": humble,
    }


def _kuru_base(lemma: str) -> dict[str, Optional[str]]:
    p = lemma[:-2]
    kanji = lemma.endswith("来る")

    def k(hira: str, kan: str) -> str:   # 来る viết kanji giữ 来 (来て / 来ない), viết kana đổi gốc (きて / こない)
        return p + (kan if kanji else hira)

    return {
        "te": k("きて", "来て"), "ta": k("きた", "来た"), "nai": k("こない", "来ない"), "masu": k("きます", "来ます"),
        "potential": k("こられる", "来られる"), "passive": k("こられる", "来られる"),
        "causative": k("こさせる", "来させる"), "causative_passive": k("こさせられる", "来させられる"),
        "volitional": k("こよう", "来よう"), "imperative": k("こい", "来い"),
        "honorific_o_ni_naru": p + "いらっしゃる", "humble_o_suru": k("まいる", "参る"),
    }


_BASE = {"godan": _godan_base, "ichidan": _ichidan_base, "suru": _suru_base, "kuru": _kuru_base}


def _masu_stem(lemma: str, group: str) -> str:
    if group == "godan" and lemma[-1:] in _I:
        return lemma[:-1] + _I[lemma[-1]]
    if group == "ichidan":
        return lemma[:-1]
    if group == "suru":
        return _suru_prefix(lemma) + "し"
    if group == "kuru":
        return lemma[:-2] + ("来" if lemma.endswith("来る") else "き")
    return lemma


def _keigo_natural(lemma: str, group: str, reading: Optional[str], compound: bool) -> bool:
    """お〜になる / お〜する theo quy tắc cần gốc ます ≥ 2 mora (お書きになる ✓, お見になる ✗) và không phải động từ ghép."""
    if compound or group not in ("godan", "ichidan"):
        return group in ("suru", "kuru")
    if reading:
        mora = len(reading) if group == "godan" else len(reading) - 1
    else:
        mora = len(_masu_stem(lemma, group))
    return mora >= 2


def forms(lemma: str, group: str, reading: Optional[str] = None, compound: bool = False) -> dict[str, Optional[str]]:
    """Mọi dạng trong FORMS của ``lemma`` theo ``group``; giá trị None = dạng không dùng cho động từ này
    (kính ngữ của động từ đã là kính ngữ, thể khả năng của ある, お〜になる với gốc 1 mora…)."""
    lemma = (lemma or "").strip()
    reading = kata_to_hira(reading) if reading else None
    base = _BASE.get(group)
    if not lemma or base is None:
        return _none_forms()
    out = base(lemma)
    if group == "ichidan" and lemma.endswith("ある"):   # không xảy ra với Sudachi, phòng heuristic
        out["nai"] = lemma[:-2] + "ない"
    if lemma in _NO_POTENTIAL:
        out["potential"] = None
    if not _keigo_natural(lemma, group, reading, compound):
        out["honorific_o_ni_naru"] = out["humble_o_suru"] = None
    keigo_table_applies = _KANA_KEIGO_GROUP.get(lemma, group) == group   # khoá kana: đúng động từ đồng âm mới áp
    if keigo_table_applies and lemma in _HONORIFIC_SPECIAL:
        out["honorific_o_ni_naru"] = _HONORIFIC_SPECIAL[lemma]
    if keigo_table_applies and lemma in _HUMBLE_SPECIAL:
        out["humble_o_suru"] = _HUMBLE_SPECIAL[lemma]
    for f in (_KEIGO_SKIP.get(lemma, ()) if keigo_table_applies else ()):
        out[f] = None
    if lemma in _SPECIAL:
        out.update(_SPECIAL[lemma][2])
    return {f: out.get(f) for f in FORMS}


def alternatives(lemma: str, group: str, form: str) -> set[str]:
    """Các cách viết khác CŨNG đúng của ``form`` — không bao giờ được dùng làm đáp án sai
    (読まされる = 読ませられる, 食べよ = 食べろ, 勉強なさる = ご勉強になる, 書かす = 書かせる)."""
    lemma = (lemma or "").strip()
    alts: set[str] = set()
    if group == "godan" and lemma[-1:] in _A:
        stem, end = lemma[:-1], lemma[-1]
        a = stem + _A[end]
        ms = stem + _I[end]
        if form == "causative_passive" and end != "す":
            alts.add(a + "される")
        if form == "causative":
            alts.add(a + "す")
        if form == "honorific_o_ni_naru":
            alts |= {"お" + ms + "なさる", a + "れる"}
        if form == "humble_o_suru":
            alts.add("お" + ms + "いたす")
    elif group == "ichidan" and len(lemma) >= 2:
        stem = lemma[:-1]
        if form == "imperative":
            alts.add(stem + "よ")
        if form == "causative":
            alts.add(stem + "さす")
        if form == "honorific_o_ni_naru":
            alts |= {"お" + stem + "なさる", stem + "られる"}
        if form == "humble_o_suru":
            alts.add("お" + stem + "いたす")
    elif group == "suru":
        p = _suru_prefix(lemma)
        if form == "imperative":
            alts.add(p + "せよ")
        if form == "potential" and len(p) == 1:
            alts.add(p + "せる")
        if form == "honorific_o_ni_naru":
            alts |= {p + "なさる", "ご" + p + "になる", "お" + p + "になる", "ご" + p + "なさる", p + "される"}
        if form == "humble_o_suru":
            alts |= {p + "いたす", "ご" + p + "する", "お" + p + "する", "ご" + p + "いたす", "お" + p + "いたす"}
    elif group == "kuru":
        p = lemma[:-2]
        if form == "honorific_o_ni_naru":
            alts |= {p + "お越しになる", p + "おいでになる", p + "来られる", p + "こられる"}
        if form == "humble_o_suru":
            alts |= {p + "参る", p + "まいる"}
    alts.discard("")
    return alts


# ----------------------------------------------------------------------------- đáp án sai

def _learner_errors(lemma: str, group: str, form: str) -> list[str]:
    """Lỗi người học hay mắc cho từng (nhóm, dạng), xếp theo độ "hợp lý" giảm dần. Có thể trùng đáp án đúng
    (vd: 来て của 来る) — wrong_forms lọc sau."""
    if group == "godan" and lemma[-1:] in _A:
        stem, end = lemma[:-1], lemma[-1]
        a, i, e, o = stem + _A[end], stem + _I[end], stem + _E[end], stem + _O[end]
        # sai âm tiện hay gặp nhất (く/ぐ → って, còn lại → いて), rồi coi như 一段 (書て), rồi các âm tiện còn lại
        primary = "って" if end in ("く", "ぐ") else "いて"
        te_wrong = [stem + primary, stem + "て"] + [stem + x for x in _TE_ENDINGS if x not in (primary, _TE[end])]
        if lemma.endswith(("行く", "いく")):
            te_wrong.insert(0, stem + "いて")   # áp quy tắc く thường lên 行く
        return {
            "te": te_wrong + [stem + "て"],
            "ta": [w[:-1] + ("だ" if w.endswith("で") else "た") for w in te_wrong] + [stem + "た"],
            # a + ない là dạng quy tắc: với động từ thường nó là đáp án đúng (wrong_forms lọc), còn với ある (ない bất
            # quy tắc) nó là あらない — lỗi mà mọi người học N5 đều mắc nên phải đứng đầu danh sách
            "nai": [a + "ない", stem + "ない", stem + "あない" if end == "う" else i + "ない", e + "ない", a + "らない"],
            "masu": [stem + "ます", e + "ます", a + "ます", stem + "ります"],
            "potential": [a + "れる", stem + "られる", e + "られる", i + "れる"],
            "passive": [e + "る", a + "せる", stem + "られる", stem + "れる"],
            "causative": [a + "れる", stem + "させる", i + "させる", e + "せる"],
            "causative_passive": [a + "れさせる", a + "せれる", stem + "させられる", a + "される", a + "れられる"],
            "volitional": [stem + "よう", i + "よう", o + "よう", a + "う", e + "う"],
            "imperative": [stem + "ろ", i + "ろ", e + "ろ", o + "う", a + "れ"],
        }.get(form, [])
    if group == "ichidan" and len(lemma) >= 2:
        s = lemma[:-1]
        return {
            "te": [s + "って", s + "いて", s + "んで", s + "して"],
            "ta": [s + "った", s + "いた", s + "んだ", s + "した"],
            "nai": [s + "らない", s + "りない", s + "れない", s + "あない"],
            "masu": [s + "ります", s + "れます", s + "らます", s + "いします"],
            "potential": [s + "れる", s + "れられる", s + "らる", s + "らえる", s + "えられる"],
            "passive": [s + "れる", s + "させる", s + "らせる", s + "れられる"],
            "causative": [s + "られる", s + "らせる", s + "さられる", s + "せる"],
            "causative_passive": [s + "られさせる", s + "させれる", s + "らせられる", s + "される", s + "らされる"],
            "volitional": [s + "ろう", s + "よ", s + "う", s + "りよう", s + "ようう"],
            "imperative": [s + "れ", s + "りろ", s + "よう", s + "い", s + "ろう"],
        }.get(form, [])
    if group == "suru":
        p = _suru_prefix(lemma)
        return {
            "te": [p + "すって", p + "さて", p + "すて", p + "しって"],
            "ta": [p + "すった", p + "さた", p + "すた", p + "しった"],
            "nai": [p + "さない", p + "すらない", p + "すない", p + "しらない"],
            "masu": [p + "すります", p + "さます", p + "すます", p + "しります"],
            "potential": [p + "される", p + "しられる", p + "すれる", p + "しれる", p + "せられる"],
            "passive": [p + "できる", p + "させる", p + "しられる", p + "すられる"],
            "causative": [p + "される", p + "しさせる", p + "すらせる", p + "せさせる"],
            "causative_passive": [p + "されさせる", p + "させれる", p + "しられさせる", p + "すらせられる", p + "さられる"],
            "volitional": [p + "すろう", p + "しろう", p + "しよ", p + "そう", p + "するよう"],
            "imperative": [p + "すれ", p + "しれ", p + "すろ", p + "せ", p + "しよう"],
        }.get(form, [])
    if group == "kuru" and len(lemma) >= 2:
        p = lemma[:-2]
        kan = lemma.endswith("来る")
        k, ko, ki = (("来", "来", "来") if kan else ("く", "こ", "き"))
        return {
            "te": [p + k + "って", p + k + "いて", p + k + "るて", p + k + "んで", p + ki + "て"],
            "ta": [p + k + "った", p + k + "いた", p + k + "るた", p + k + "んだ", p + ki + "た"],
            "nai": [p + k + "らない", p + k + "るない", p + ki + "ない", p + k + "ない", p + ko + "れない"],
            "masu": [p + k + "ります", p + k + "るます", p + ko + "ます", p + ko + "れます", p + ki + "ます"],
            "potential": [p + ko + "れる", p + k + "れる", p + ko + "られれる", p + k + "るれる", p + ko + "せる"],
            "passive": [p + ko + "れる", p + ko + "させる", p + k + "らせる", p + k + "れる", p + k + "るれる"],
            "causative": [p + ko + "られる", p + k + "らせる", p + k + "させる", p + ko + "せる", p + k + "るせる"],
            "causative_passive": [p + ko + "られさせる", p + ko + "させれる", p + k + "らせられる", p + ko + "される",
                                  p + k + "される"],
            "volitional": [p + k + "ろう", p + ki + "よう", p + ko + "よ", p + k + "るよう", p + ko + "う"],
            "imperative": [p + k + "れ", p + ki + "ろ", p + ko + "ろ", p + k + "るろ", p + ko + "いよ"],
        }.get(form, [])
    return []


def _keigo_errors(lemma: str, group: str, form: str, all_forms: dict[str, Optional[str]]) -> list[str]:
    """Đáp án sai cho kính ngữ / khiêm nhường ngữ: đổi chỗ kính ↔ khiêm, áp quy tắc お〜 lên động từ có dạng đặc biệt
    (お食べになる), sai tiền tố お / ご, thiếu に."""
    ms = _masu_stem(lemma, group)
    if group == "suru":
        p = _suru_prefix(lemma)
        if not p:
            base_h, base_k, p = "おしになる", "おしする", "し"
        else:
            pre = "ご" if _is_kango(p) else "お"
            swap = "お" if pre == "ご" else "ご"
            base_h, base_k = pre + p + "になる", pre + p + "する"
            if form == "honorific_o_ni_naru":
                return [all_forms.get("humble_o_suru") or base_k, swap + p + "になる", pre + p + "なる", p + "になる",
                        pre + p + "にする"]
            return [all_forms.get("honorific_o_ni_naru") or base_h, swap + p + "する", pre + p + "をする", p + "をする",
                    pre + p + "にする"]
    else:
        base_h, base_k = "お" + ms + "になる", "お" + ms + "する"
    if form == "honorific_o_ni_naru":
        return [all_forms.get("humble_o_suru") or base_k, base_h, "お" + ms + "なる", "ご" + ms + "になる",
                "お" + ms + "にする", "お" + lemma + "になる"]
    return [all_forms.get("honorific_o_ni_naru") or base_h, base_k, "ご" + ms + "する", "お" + ms + "なる",
            "お" + ms + "をする", "お" + lemma + "する"]


def _other_group_forms(lemma: str, group: str, form: str) -> list[str]:
    """Áp quy tắc của nhóm KHÁC lên lemma (五段 coi như 一段: 書て; 一段 coi như 五段: 食べって; する / 来る coi như
    cả hai)."""
    others = {"godan": (_ichidan_base,), "ichidan": (_godan_base,),
              "suru": (_godan_base, _ichidan_base), "kuru": (_godan_base, _ichidan_base)}.get(group, ())
    out: list[str] = []
    for base in others:
        v = base(lemma).get(form)
        if v:
            out.append(v)
    return out


def wrong_forms(lemma: str, group: str, form: str, k: int = 3, reading: Optional[str] = None,
                compound: bool = False) -> list[str]:
    """``k`` đáp án sai hợp lý cho (lemma, group, form), thứ tự xác định (không ngẫu nhiên), đã loại trùng,
    ≠ đáp án đúng và ≠ mọi biến thể cũng đúng, ≠ chính lemma. Dạng đúng là None → []. Luôn ≥ 2 phần tử khi
    k ≥ 2 nhờ dự phòng lấy các dạng khác của chính động từ."""
    lemma = (lemma or "").strip()
    if k <= 0 or form not in FORMS:
        return []
    all_forms = forms(lemma, group, reading, compound)
    correct = all_forms.get(form)
    if not correct:
        return []
    banned = {correct, lemma} | alternatives(lemma, group, form)
    cands: list[str] = []
    if form in ("honorific_o_ni_naru", "humble_o_suru"):
        cands += _keigo_errors(lemma, group, form, all_forms)
    else:
        cands += _learner_errors(lemma, group, form)
    cands += _other_group_forms(lemma, group, form)
    # dự phòng: các dạng khác của chính động từ (sai dạng nhưng đúng chính tả) để luôn đủ phương án
    cands += [v for f, v in all_forms.items() if f != form and v]
    out: list[str] = []
    seen: set[str] = set()
    for c in cands:
        if not c or c in banned or c in seen:
            continue
        seen.add(c)
        out.append(c)
        if len(out) >= k:
            break
    return out
