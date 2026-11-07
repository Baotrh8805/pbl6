import pytest

from app.extract.jlpt import classifier


def test_word_in_two_lists_gets_easiest_level_and_half_confidence():
    # こと nằm trong cả N4 và N3 của elzup/jlpt-word-list
    level, conf, sources = classifier.classify("こと", "こと", True)
    assert level == "N4"
    assert conf == 0.5
    assert sources == ["jlpt_list:N4", "jlpt_list:N3"]


def test_known_word_full_confidence():
    level, conf, sources = classifier.classify("勉強", "べんきょう", False)
    assert level == "N5"
    assert conf == 1.0
    assert sources == ["jlpt_list:N5"]


def test_kana_only_lookup_by_reading():
    level, conf, sources = classifier.classify("とても", "とても", True)
    assert level == "N5"
    assert sources[0].startswith("jlpt_list:")


def test_unknown_word_returns_none():
    level, conf, sources = classifier.classify("ｘｙｚ", None, False)
    assert level is None
    assert conf == 0.0
    assert sources == []


def test_wordfreq_fallback(monkeypatch):
    monkeypatch.setattr(classifier, "_zipf", lambda lemma: 4.7)
    level, conf, sources = classifier.classify("量子力学", "りょうしりきがく", False)
    assert level == "N3"
    assert conf == 0.4
    assert sources == ["wordfreq:N3"]


def test_meaning_hint():
    assert "study" in classifier.meaning_hint("勉強")


def test_phrase_level_picks_hardest_word():
    from app.extract.jlpt import phrase_level
    level, conf, sources = phrase_level([("銀行", "ぎんこう"), ("お金", "おかね"), ("下ろす", "おろす")])
    assert level == "N1"
    assert 0 < conf <= 0.8
    assert sources[0] == "phrase:下ろす" and sources[1].startswith(("jlpt_list:", "wordfreq:"))


def test_load_is_idempotent_under_concurrent_first_call(monkeypatch):
    """Endpoint sync chạy trên threadpool → nhiều request đầu tiên gọi _load() cùng lúc; chỉ mục _entries / _idx_*
    là list append nên hai lần nạp chồng nhau sẽ nhân đôi mục (31 780 thay vì 7 945). Khoá + gán sau khi dựng xong."""
    import threading
    classifier._load()
    n_entries, n_expr = len(classifier._entries), len(classifier._by_expr)
    assert n_entries > 0
    for name, empty in (("_by_pair", None), ("_by_expr", {}), ("_by_reading", {}), ("_meaning", {}),
                        ("_entries", []), ("_idx_expr", {}), ("_idx_reading", {}), ("_idx_char", {})):
        monkeypatch.setattr(classifier, name, empty)   # module như lúc mới import; monkeypatch trả lại bảng cũ sau test
    threads = [threading.Thread(target=classifier._load) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(classifier._entries) == n_entries and len(classifier._by_expr) == n_expr
    assert classifier.entries_of("待つ") == [("まつ", "to wait", "N5")]
    assert all(len(ix) == len(set(ix)) for ix in classifier._idx_expr.values())


def test_phrase_level_none_when_no_word_has_level():
    from app.extract.jlpt import phrase_level
    assert phrase_level([("逝得", None), ("償友", None)]) == (None, 0.0, [])
    assert phrase_level([]) == (None, 0.0, [])


def test_nihon_family_is_n5():
    """LC-03: danh sách Tanos chỉ có 日本 ở n3.csv (cả にほん lẫn にっぽん), 日本語 / 日本人 không có (wordfreq → N3);
    _LEVEL_FIXES xếp lại N5 và thay hẳn dòng N3 (nguồn chỉ còn jlpt_list:N5, confidence 1.0)."""
    for term, reading in (("日本", "にほん"), ("日本", "にっぽん"), ("日本語", "にほんご"), ("日本人", "にほんじん")):
        assert classifier.classify(term, reading, False) == ("N5", 1.0, ["jlpt_list:N5"])
    assert classifier.classify("日本", None, False) == ("N5", 1.0, ["jlpt_list:N5"])
    # cách đọc chuẩn đứng trước; nghĩa CSV gốc vẫn giữ
    assert classifier.entries_of("日本") == [("にほん", "Japan", "N5"), ("にっぽん", "Japan", "N5")]
    assert ("日本", "にほん", "Japan", "N5") in classifier.entries_containing("本")


def test_level_fixes_replace_csv_rows_and_keep_level_order(tmp_path, monkeypatch):
    (tmp_path / "n5.csv").write_text("expression,reading,meaning,tags\n猫,ねこ,cat,\n", encoding="utf-8")
    (tmp_path / "n3.csv").write_text("expression,reading,meaning,tags\n日本,にほん,Japan (CSV),\n政治,せいじ,politics,\n",
                                     encoding="utf-8")
    monkeypatch.setattr(classifier, "DATA_DIR", tmp_path)
    monkeypatch.setattr(classifier, "_LEVEL_FIXES", {("日本", "にほん"): ("N5", "Japan"), ("国語", "こくご"): ("N5", "")})
    for name, empty in (("_by_pair", None), ("_by_expr", {}), ("_by_reading", {}), ("_meaning", {}),
                        ("_entries", []), ("_idx_expr", {}), ("_idx_reading", {}), ("_idx_char", {})):
        monkeypatch.setattr(classifier, name, empty)
    classifier._load()
    # mục sửa đứng đầu cấp N5 (trước 猫), dòng N3 của cùng cặp bị bỏ, nghĩa CSV thắng nghĩa ghi trong bảng sửa
    assert classifier._entries == [("日本", "にほん", "Japan (CSV)", "N5"), ("国語", "こくご", "", "N5"),
                                   ("猫", "ねこ", "cat", "N5"), ("政治", "せいじ", "politics", "N3")]
    assert classifier.classify("日本", "にほん", False) == ("N5", 1.0, ["jlpt_list:N5"])
    assert classifier.classify("政治", "せいじ", False) == ("N3", 1.0, ["jlpt_list:N3"])


def test_level_fixes_not_applied_without_csv(tmp_path, monkeypatch):
    monkeypatch.setattr(classifier, "DATA_DIR", tmp_path)   # thư mục rỗng: thiếu dữ liệu thì vẫn báo thiếu
    for name, empty in (("_by_pair", None), ("_by_expr", {}), ("_by_reading", {}), ("_meaning", {}),
                        ("_entries", []), ("_idx_expr", {}), ("_idx_reading", {}), ("_idx_char", {})):
        monkeypatch.setattr(classifier, name, empty)
    assert not classifier.available()


# ----------------------------------------------------------------------------- LC-11: dòng nhiều biến thể, nghĩa sửa tay

def _fresh_tables(monkeypatch, data_dir, override_file):
    """Trỏ classifier sang CSV tạm và đưa bảng về trạng thái chưa nạp (monkeypatch trả lại bảng thật sau test)."""
    monkeypatch.setattr(classifier, "DATA_DIR", data_dir)
    monkeypatch.setattr(classifier, "OVERRIDE_FILE", override_file)
    for name, empty in (("_by_pair", None), ("_by_expr", {}), ("_by_reading", {}), ("_meaning", {}),
                        ("_entries", []), ("_idx_expr", {}), ("_idx_reading", {}), ("_idx_char", {})):
        monkeypatch.setattr(classifier, name, empty)


def test_split_variants_pairs_by_index_or_shares_readings():
    sv = classifier._split_variants
    # cùng số biến thể → ghép theo vị trí; katakana → hiragana; ～ bỏ như dòng thường
    assert sv("高校; 高等学校", "こうこう; こうとうがっこう") == [("高校", "こうこう"), ("高等学校", "こうとうがっこう")]
    assert sv("キロ; キログラム", "キロ; キログラム") == [("キロ", "きろ"), ("キログラム", "きろぐらむ")]
    assert sv("～くらい; ぐらい", "～くらい; ぐらい") == [("くらい", "くらい"), ("ぐらい", "ぐらい")]
    assert sv("回る、回す", "まわる、まわす") == [("回る", "まわる"), ("回す", "まわす")]
    # lệch số → mỗi cách viết nhận mọi cách đọc
    assert sv("足; 脚", "あし") == [("足", "あし"), ("脚", "あし")]
    assert sv("行く", "いく; ゆく") == [("行く", "いく"), ("行く", "ゆく")]
    # … trừ cách đọc không khớp phần kana của cách viết (かねもち là của 金持ち)
    assert sv("お金持ち", "かねもち; おかねもち") == [("お金持ち", "おかねもち")]
    # viết tắt dùng chung okurigana / さん với biến thể cuối
    assert sv("堅; 硬; 固い", "かたい") == [("堅い", "かたい"), ("硬い", "かたい"), ("固い", "かたい")]
    assert sv("伯父; 叔父さん", "おじさん") == [("伯父さん", "おじさん"), ("叔父さん", "おじさん")]
    # dòng thường / thiếu cách đọc / dấu phẩy trong ô (ghi chú, không phải biến thể) → một mục như trước
    assert sv("勉強", "べんきょう") == [("勉強", "べんきょう")]
    assert sv("猫", "") == [("猫", "")]
    assert sv("(花を〜) 生ける, 活ける", "(はなを～) いける") == [("(花を) 生ける, 活ける", "(はなを) いける")]
    assert sv(" ; ", "あ") == []


def test_multi_variant_rows_load_as_separate_entries(tmp_path, monkeypatch):
    (tmp_path / "n4.csv").write_text(
        "expression,reading,meaning,tags\n"
        "高校; 高等学校,こうこう; こうとうがっこう,high school; senior high school,JLPT\n"
        "堅; 硬; 固い,かたい,\"solid, hard, firm\",JLPT\n", encoding="utf-8")
    _fresh_tables(monkeypatch, tmp_path, tmp_path / "missing.csv")
    monkeypatch.setattr(classifier, "_LEVEL_FIXES", {})   # mục sửa 日本… sẽ đứng đầu N5, không liên quan test này
    classifier._load()
    assert classifier._entries == [
        ("高校", "こうこう", "high school; senior high school", "N4"),
        ("高等学校", "こうとうがっこう", "high school; senior high school", "N4"),
        ("堅い", "かたい", "solid, hard, firm", "N4"), ("硬い", "かたい", "solid, hard, firm", "N4"),
        ("固い", "かたい", "solid, hard, firm", "N4")]
    assert classifier.classify("高校", "こうこう", False) == ("N4", 1.0, ["jlpt_list:N4"])
    assert classifier.classify("高等学校", None, False) == ("N4", 1.0, ["jlpt_list:N4"])
    assert classifier.meaning_hint("高等学校") == "high school; senior high school"
    # chỉ mục chữ / cách đọc thấy từng biến thể: 学 chỉ có trong 高等学校, đồng âm かたい gom cả ba cách viết
    assert [e[0] for e in classifier.entries_containing("学")] == ["高等学校"]
    assert [e[0] for e in classifier.entries_containing("校")] == ["高校", "高等学校"]
    assert [e[0] for e in classifier.homophones_jlpt("かたい")] == ["堅い", "硬い", "固い"]
    assert classifier.entries_of("高校; 高等学校") == []


def test_meaning_overrides_replace_csv_gloss(tmp_path, monkeypatch):
    (tmp_path / "n5.csv").write_text("expression,reading,meaning,tags\n～人,～じん,counter for people,\n"
                                     "日本,にほん,Japan (CSV),\n", encoding="utf-8")
    (tmp_path / "n4.csv").write_text("expression,reading,meaning,tags\n中学校,ちゅうがっこう,junior high school pupil,\n"
                                     "高校; 高等学校,こうこう; こうとうがっこう,high school,\n", encoding="utf-8")
    (tmp_path / "over.csv").write_text(
        "expression,reading,meaning\n"
        "中学校,ちゅうがっこう,junior high school\n"
        "人,ジン,~ person (nationality)\n"          # khoá chuẩn hoá: không ～, katakana → hiragana vẫn khớp ～人 / じん
        "高等学校,こうとうがっこう,senior high school\n"   # áp sau khi tách: chỉ biến thể này đổi
        "日本,にほん,Japan (override)\n"            # thắng cả nghĩa CSV của mục _LEVEL_FIXES
        "存在しない,そんざいしない,nothing\n"       # không có trong CSV → không thêm mục
        "猫,ねこ,\n", encoding="utf-8")             # thiếu nghĩa → bỏ qua
    _fresh_tables(monkeypatch, tmp_path, tmp_path / "over.csv")
    monkeypatch.setattr(classifier, "_LEVEL_FIXES", {("日本", "にほん"): ("N5", "Japan")})
    assert classifier.entries_of("中学校") == [("ちゅうがっこう", "junior high school", "N4")]
    assert classifier.meaning_hint("中学校") == "junior high school"
    assert classifier.entries_of("人") == [("じん", "~ person (nationality)", "N5")]
    assert classifier.entries_of("高校") == [("こうこう", "high school", "N4")]
    assert classifier.entries_of("高等学校") == [("こうとうがっこう", "senior high school", "N4")]
    assert classifier.entries_of("日本") == [("にほん", "Japan (override)", "N5")]
    assert classifier.entries_of("存在しない") == [] and classifier.entries_of("猫") == []


def test_meaning_overrides_file_is_optional(tmp_path, monkeypatch):
    (tmp_path / "n4.csv").write_text("expression,reading,meaning,tags\n中学校,ちゅうがっこう,junior high school pupil,\n",
                                     encoding="utf-8")
    _fresh_tables(monkeypatch, tmp_path, tmp_path / "missing.csv")
    assert classifier.entries_of("中学校") == [("ちゅうがっこう", "junior high school pupil", "N4")]


@pytest.mark.skipif(not (classifier.DATA_DIR / "n4.csv").exists() or not classifier.OVERRIDE_FILE.exists(),
                    reason="chưa có jlpt/n4.csv / jlpt_meaning_overrides.csv")
def test_real_overrides_file_rows_hit_real_csv_entries():
    """Mỗi dòng sửa tay phải trúng đúng một mục thật (sai chính tả khoá → dòng chết, nghĩa sai vẫn hiện)."""
    import csv
    overrides = classifier._read_overrides()
    assert 0 < len(overrides) <= 30
    classifier._load()
    for (expr, reading), meaning in overrides.items():
        assert (reading, meaning) in [(r, m) for r, m, _ in classifier.entries_of(expr)], (expr, reading)
    assert classifier.entries_of("中学校") == [("ちゅうがっこう", "junior high school", "N4")]
    with open(classifier.OVERRIDE_FILE, encoding="utf-8", newline="") as fh:
        assert next(csv.reader(fh)) == ["expression", "reading", "meaning"]


# ----------------------------------------------------------------------------- B5.3: làm sạch CSV JLPT lúc nạp

@pytest.mark.parametrize("expr, reading, expected", [
    ("結婚", "けっこん (する)", ("結婚", "けっこん")),        # "(する)" thừa ở n5
    ("散歩", "さんぽ(する)", ("散歩", "さんぽ")),
    ("あいさつする", "挨拶", ("挨拶", "あいさつ")),          # hai cột đảo (n4.csv dòng 255) + đuôi する
    ("運動", "うんどうする", ("運動", "うんどう")),           # đuôi する lẫn vào cách đọc danh từ
    ("擦る", "する", ("擦る", "する")),                      # động từ đọc する: giữ nguyên
    ("刷る", "する", ("刷る", "する")),
    ("勉強する", "べんきょうする", ("勉強する", "べんきょうする")),   # cách viết có する → không cắt
    ("下る", "さがる", ("下がる", "さがる")),                # cặp sai hẳn
    ("下る", "くだる", ("下る", "くだる")),
    (" 学校 ", " がっこう ", ("学校", "がっこう")),           # dòng sạch chỉ strip
])
def test_clean_row_rules(expr, reading, expected):
    assert classifier.clean_row(expr, reading) == expected


def _readings(expr):
    return [r for r, _, _ in classifier.entries_of(expr)]


def test_clean_row_applied_to_real_lists():
    """Trên dữ liệu thật đã commit: không còn cách đọc nào mang "(する)" hay đuôi する của danh từ, cột đảo và cặp sai đã sửa."""
    assert _readings("結婚") == ["けっこん"] and _readings("勉強") == ["べんきょう"]
    assert _readings("運動") == ["うんどう"] and _readings("出席") == ["しゅっせき"]
    assert "あいさつ" in _readings("挨拶") and classifier.entries_of("あいさつする") == []
    assert "さがる" in _readings("下がる") and "さがる" not in _readings("下る") and "くだる" in _readings("下る")
    assert "する" in _readings("擦る") and "する" in _readings("刷る")
    classifier._load()
    # ngoặc khác ("(を) とお", "パート (タイム)") là biến thể hợp lệ, chỉ "(する)" và đuôi する của danh từ mới là lỗi
    bad = [(e, r) for e, r, _, _ in classifier._entries if classifier._SURU_PAREN.search(r)
           or (r.endswith("する") and len(r) > 2 and "する" not in e and not e.endswith("る"))]
    assert bad == [], bad[:10]
