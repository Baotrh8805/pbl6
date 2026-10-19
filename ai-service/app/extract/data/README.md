# Dữ liệu từ điển cho `app/extract`

Tạo lại toàn bộ bằng:

```powershell
cd ai-service
venv\Scripts\python.exe -I scripts\build_dicts.py            # tất cả
venv\Scripts\python.exe -I scripts\build_dicts.py --only jmdict
venv\Scripts\python.exe -I scripts\build_dicts.py --only kanjivg    # jlpt | unihan | unihan_rs | unihan_def | jmdict | kanjivg | kradfile | pitch
```

Script tải về thư mục cache `scripts/.download_cache/` (đã gitignore), chỉ parse bằng
`json` / `zipfile` / `csv` / `re` của stdlib, không giải nén ra đĩa. File đã có trong cache (cùng tên) không tải lại.
`kanjivg` và `pitch` lọc theo từ vựng JLPT nên cần `jlpt/n*.csv` (đã commit; mất thì chạy `--only jlpt` trước).
Máy mới clone chỉ cần dựng 4 file không commit: `--only jmdict`, `--only kanjivg`, `--only kradfile`, `--only pitch`
(hoặc chạy không tham số, dựng lại cả file đã commit — kiểm `git diff` trước khi commit vì nguồn Unihan / JLPT có thể đã đổi).

| File | Commit? | Nguồn | Giấy phép |
|---|---|---|---|
| `jlpt/n5.csv … n1.csv` | Có (~500 KB) | [elzup/jlpt-word-list](https://github.com/elzup/jlpt-word-list) `src/n*.csv`, gốc từ danh sách của Jonathan Waller (tanos.co.uk) | CC BY 4.0 theo tanos.co.uk (repo elzup ghi "dữ liệu theo giấy phép của tanos") |
| `unihan_vietnamese.csv` | Có (~120 KB) | Unicode [Unihan](https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip) trường `kVietnamese` (giữ âm đầu nếu có nhiều) | [Unicode License](https://www.unicode.org/license.txt) |
| `unihan_japanese.csv` | Có (~480 KB) | Unihan trường `kJapanese` (on katakana + kun hiragana), chỉ khối CJK U+4E00–U+9FFF | Unicode License |
| `unihan_rs.csv` | Có (~280 KB) | Unihan `Unihan_IRGSources.txt`: `kRSUnicode` (bộ thủ Khang Hi `.` nét ngoài bộ; lấy giá trị đầu, bỏ dấu `'` của bộ dạng giản thể) và `kTotalStrokes` (giá trị đầu), chỉ khối CJK U+4E00–U+9FFF | Unicode License |
| `radicals_214.csv` | Có (~10 KB) | 214 bộ thủ Khang Hi: khối Unicode [Kangxi Radicals](https://www.unicode.org/charts/PDF/U2F00.pdf) U+2F00–U+2FD5 theo thứ tự (`no` = vị trí + 1), `unified` = NFKC (chữ CJK thống nhất) **trừ 5 bộ ghi dạng JIS** mà người học gặp trong chữ JLPT (Unihan `kRSUnicode` xếp chính dạng JIS là bộ đó, nét ngoài bộ = 0): 63 戶 → 戸, 174 靑 → 青, 199 麥 → 麦, 201 黃 → 黄, 203 黑 → 黒 (dạng NFKC vẫn tra được qua `radical_of`); `strokes` = `kanjidata.radical_strokes` (Unihan `kTotalStrokes`) **trừ 114 禸 = 5** (Khang Hi và mọi bảng bộ thủ in đếm 5, Unihan ghi 4); `han_viet` = `han_viet.han_viet` (Unihan `kVietnamese` + overrides) **sửa tay** ở 26 bộ Unihan ghi âm Nôm / âm chữ giản thể (角 GÓC → GIÁC, 貝 BUỔI → BỐI, 厂 XƯỞNG → HÁN, 广 QUẢNG → NGHIỄM, 示 KÌ → THỊ…), `name_vi` / `meaning_vi` biên soạn tay theo tên bộ thủ quen dùng trong sách Hán-Việt (bộ Nhân, bộ Thủy, bộ Sước…). Dạng viết trong chữ của bộ (氵 艹 辶 扌 忄 礻 衤 阝 灬 犭 飠…) không nằm trong CSV mà ở `radicals.RADICAL_VARIANTS` (chỉ dùng để bộ lọc mẹo nhớ chấp nhận chúng). Không có script tải về: file là nguồn gốc, sửa trực tiếp | Unicode License (mã / nét) + nội dung tự biên soạn |
| `han_viet_overrides.csv` | Có (~10 KB) | `char,reading` — âm Hán-Việt rà tay cho **mọi chữ Hán trong từ vựng JLPT N5–N1** mà Unihan `kVietnamese` thiếu (酒, 薬, 郵…), ghi âm Nôm thay / trước âm Hán-Việt (予 nhừ → DỰ, 猫 mèo → MIÊU, 角 góc → GIÁC, 冷 lạnh → LÃNH…) hoặc viết khác chính tả của bảng (KÌ → KỲ, QUI → QUY); `han_viet.py` ưu tiên bảng này hơn `unihan_vietnamese.csv`. Dòng `reading` rỗng = chữ quốc tự không có âm Hán-Việt (畑) → xoá giá trị Unihan. Chữ quốc tự khác (込, 匂, 峠…) không có dòng nào. Không có script tải về, sửa trực tiếp | Nội dung tự biên soạn |
| `unihan_definitions.csv` | Có (~280 KB) | Unihan `kDefinition` (`char,definition`, giữ nguyên văn), chỉ chữ khối CJK U+4E00–U+9FFF có `kJapanese` và có mã JIS X 0208 / 0213 (`kJis0` / `kJIS0213`, ~8 600 chữ). Nghĩa **của chữ** cho thẻ chữ Hán / thẻ bộ thủ / mẹo nhớ (`kanji_meanings.py`); ghi chú Trung văn (bộ Khang Hi, nhị thập bát tú, họ, quẻ, tiếng Quảng Đông…) lọc lúc nạp. Dựng bằng `--only unihan_def` | Unicode License |
| `kanji_meaning_overrides.csv` | Có (~10 KB) | `char,meaning` — nghĩa EN theo tiếng Nhật cho ~270 chữ JLPT mà `kDefinition` (viết cho tiếng Trung) gây hiểu nhầm (町 raised path between fields → town, 駅 relay station → station, 私 private → I, me; private, 予 I, me; to give → beforehand…); thắng `unihan_definitions.csv`. Không có script tải về, sửa trực tiếp | Nội dung tự biên soạn |
| `heteronyms.yaml` | Có (~14 KB) | Từ đồng tự dị âm biên soạn tay (mục cuối tệp này). Không có script tải về | Nội dung tự biên soạn |
| `jmdict.sqlite` | **Không** (~4 MB, gitignore) | [scriptin/jmdict-simplified](https://github.com/scriptin/jmdict-simplified) bản `jmdict-eng-common` (chỉ từ phổ biến), dựng từ JMdict của EDRDG | [EDRDG licence](https://www.edrdg.org/edrdg/licence.html) (CC BY-SA 4.0) — phải ghi nhận nguồn khi phân phối |
| `kanji_strokes.json` | **Không** (~9 MB, gitignore) | [KanjiVG](https://kanjivg.tagaini.net/) — [GitHub KanjiVG/kanjivg](https://github.com/KanjiVG/kanjivg), release `kanjivg-YYYYMMDD-all.zip` (API lỗi thì zip nhánh `master`); © Ulrich Apel. Chỉ giữ kanji xuất hiện trong từ vựng JLPT, bỏ biến thể (`-Kaisho`, …) | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) — phải ghi nhận KanjiVG / Ulrich Apel và chia sẻ cùng giấy phép khi phân phối |
| `kradfile.csv` | **Không** (~300 KB, gitignore) | [KRADFILE / kradfile-u](https://www.edrdg.org/krad/kradinf.html) của EDRDG, tải từ thư mục [`pub/Nihongo/`](https://www.edrdg.org/pub/Nihongo/) (`kradfile-u.gz` UTF-8, dự phòng `kradfile.gz` EUC-JP); KRADFILE2 © Jim Rose | [EDRDG licence](https://www.edrdg.org/edrdg/licence.html) (CC BY-SA 4.0) |
| `pitch_accent.csv` | **Không** (~200 KB, gitignore) | [mifunetoshiro/kanjium](https://github.com/mifunetoshiro/kanjium) `data/source_files/raw/accents.txt`, lọc theo từ vựng JLPT | [CC BY-SA 4.0](https://github.com/mifunetoshiro/kanjium/blob/master/LICENSE.txt) |
| (SudachiDict `core`) | pip | [WorksApplications/SudachiDict](https://github.com/WorksApplications/SudachiDict) | Apache-2.0 |
| (wordfreq) | pip | [rspeer/wordfreq](https://github.com/rspeer/wordfreq) | MIT (dữ liệu CC BY-SA 4.0) |

Bảng `entries` trong `jmdict.sqlite`: `kanji TEXT, kana TEXT, gloss TEXT, common INTEGER, jlpt TEXT`
(index trên `(kanji, kana)` và `kana`). `gloss` = 2 nghĩa đầu × 2 gloss đầu, nối bằng `; `.
Thiếu file này thì service vẫn chạy: `meaningEn` lấy từ cột `meaning` của CSV JLPT, health báo `jmdict=false`.

## Thiếu dữ liệu thì tính năng nào giảm

Không file nào bắt buộc để service khởi động; thiếu file thì tính năng tương ứng giảm chất lượng hoặc trả 404, và
`GET /api/extract/health` báo cờ đó `false` (Admin Panel đọc lại qua `GET /api/admin/health` của backend):

| Thiếu | Cờ health | Ảnh hưởng |
|---|---|---|
| `jmdict.sqlite` | `jmdict` | Nghĩa EN chỉ còn cột `meaning` của CSV JLPT (từ ngoài JLPT không có nghĩa); đồ thị Hán-Việt (`han_viet_graph`) chỉ còn từ JLPT; từ đồng âm / từ dễ nhầm (`distractors`, `kanji_similar`) và cảnh báo mâu thuẫn (`conflicts`) chỉ còn đối chiếu danh sách JLPT; câu i+1 (`sentence_mining`) thiếu nghĩa |
| `kanji_strokes.json` | `kanjivg`, `kanjiStrokes` | `/api/kanji/{ch}/strokes` và `/api/kanji/score` trả 404 → luyện viết không có nét mẫu, không chấm (frontend vẫn cho vẽ / hoàn tác / đếm nét) |
| `kradfile.csv` | `kradfile` | Chữ Hán giống hình chỉ còn tín hiệu yếu (cùng bộ thủ, lệch ≤ 2 nét, điểm tối đa 0.3) → ít phương án nhiễu "giống hình", độ tin cậy thấp và bị ngưỡng `distractor_min_confidence` lọc bớt |
| `pitch_accent.csv` | `pitch` | `/api/audio/pitch-reference` trả 404; `/api/audio/pitch-score` chỉ chấm được khi client gửi `accentType` → luyện trọng âm không có mẫu chuẩn (luyện phát âm bằng Web Speech API không ảnh hưởng) |
| `unihan_rs.csv` (đã commit) | `radicals` | Không tra được bộ thủ / số nét: thẻ chữ Hán và thẻ bộ thủ thiếu bộ; kanji giống hình mất tín hiệu bộ thủ / số nét (thiếu cả KRADFILE thì không còn ứng viên) |
| `radicals_214.csv` (đã commit) | `radicalCards` | `/api/radicals/cards` vẫn trả thẻ nhưng không có bộ thủ; mẹo nhớ mẫu thiếu phần bộ |
| `unihan_definitions.csv` (đã commit) | — | `meaningEn` của thẻ chữ Hán / thẻ bộ thủ chỉ còn ~270 chữ sửa tay (`kanji_meaning_overrides.csv`), chữ khác rơi về entry JMdict một chữ (nghĩa của *từ*, vd 日 にち "Sunday") rồi cột meaning JLPT |
| CSV JLPT / Unihan khác (đã commit) | `jlpt`, `unihan` | Phân cấp JLPT rơi về wordfreq, không có âm Hán-Việt — chỉ xảy ra khi file bị xoá nhầm |

Bảng nạp lười **một lần** (cache cả kết quả rỗng) → dựng file xong phải **khởi động lại service**.

## Ghi nguồn khi phân phối

KanjiVG (CC BY-SA 3.0, © Ulrich Apel), JMdict / KRADFILE (giấy phép EDRDG, CC BY-SA 4.0) và kanjium (CC BY-SA 4.0) yêu cầu
ghi nguồn và chia sẻ dữ liệu phái sinh cùng giấy phép khi phân phối. Bốn file phái sinh từ các nguồn này không commit; khi
triển khai công khai cần thêm trang / chân trang ghi nguồn trên giao diện (hiện frontend chưa có).

## Dữ liệu chữ Hán (`app/extract/kanjidata.py`, lộ trình học 2 §0.1 LP-17)

| File | Định dạng | Hàm |
|---|---|---|
| `unihan_rs.csv` | `char,radical_no,residual_strokes,total_strokes` | `radical_strokes(ch) → (số bộ, tổng nét) \| None` |
| `kradfile.csv` | `kanji,components` — thành phần cách nhau bằng khoảng trắng (`明,日 月`) | `components(ch) → ('日', '月')` hoặc `()` |
| `kanji_strokes.json` | `{"日": [[[x, y] × 32] mỗi nét, theo thứ tự viết]}`; toạ độ 0..1 theo hộp bao của **cả chữ**, tỉ lệ đồng nhất (cạnh dài = 1, cạnh ngắn căn giữa), làm tròn 3 chữ số; điểm cách đều theo chiều dài nét | `strokes(ch) → [[(x, y), …], …] \| None` |
| `pitch_accent.csv` | `word,reading,accent_type` — 0 = 平板, n = hạ giọng sau mora thứ n; kanjium ghi nhiều kiểu (`(副)0,(名)3`) thì lấy kiểu đầu | `pitch_accent(word, reading) → int \| None` |

Thiếu file nào thì hàm tương ứng trả `None` / rỗng và `GET /api/extract/health` báo cờ đó
(`radicals` / `kradfile` / `kanjivg` / `pitch`) là `false`; service vẫn chạy. Tính năng dùng các file này:
`kanji_strokes.json` → `/api/kanji/{ch}/strokes` + `/api/kanji/score` (`stroke_score.py`, cờ health `kanjiStrokes`);
`pitch_accent.csv` → `/api/audio/pitch-reference` + `/api/audio/pitch-score` (`pitch.py`); `unihan_rs.csv` +
`unihan_japanese.csv` + `unihan_vietnamese.csv` (đã commit) → `/api/kanji-info/*` (`han_viet_graph.py`, `kanji_cards.py`,
cờ `hanVietGraph` / `kanjiCards`); `kradfile.csv` chỉ nâng chất lượng kanji giống hình trong `distractors`. Bảng nạp lười **một lần** và cache cả
kết quả rỗng khi file thiếu (xếp hạng kanji giống hình trong `kanji_similar.py` cũng cache) → dựng file mới bằng
`build_dicts.py` xong phải **khởi động lại service**; health chỉ stat file nên báo `true` ngay dù dữ liệu chưa nạp.

## Bộ thủ (`app/extract/radicals.py`, C4 thẻ bộ thủ + mẹo nhớ)

`radicals_214.csv`: `no,char,unified,strokes,name_vi,meaning_vi,han_viet` — `char` là ký tự khối Kangxi (⽔ U+2F54,
nhiều font không có), `unified` là chữ CJK thống nhất (水; dạng JIS 戸 青 麦 黄 黒 ở 5 bộ, xem bảng trên) dùng để hiển
thị và tra Unihan; `name_vi` viết thường ("thủy", "nhân đi"), `han_viet` viết hoa như `han_viet.py` ("THỦY"). Cùng một
tên có thể gặp ở hai bộ (人 / 儿 nhân, 冖 / 糸 mịch, 父 / 阜 phụ, 黍 / 鼠 thử…) nên khoá là `no`. `radical_of(ch)` đi qua
`kanjidata.radical_strokes` (Unihan `kRSUnicode`) nên cần `unihan_rs.csv`; thiếu `radicals_214.csv` thì bảng rỗng,
`radical_of` trả None, cờ health `radicalCards` ở `GET /api/extract/health` (= `radicals.available()`; cờ `radicals`
có sẵn là của `unihan_rs.csv`) báo `false` và `/api/radicals/cards` vẫn trả thẻ không có bộ. Mẹo nhớ mẫu
(`template_mnemonic`) không cần dữ liệu ngoài bảng này; `clean_meaning` bỏ gloss phụ tố / lượng từ trước khi ghép
nghĩa vào câu. Bảng cũng không phải nguồn của `/api/kanji-info/kanji-cards` (C5 chỉ dùng số bộ Unihan).

KRADFILE: nếu `--only kradfile` không tải được (EDRDG đổi đường dẫn), tải tay `kradfile-u.gz` hoặc `kradzip.zip` từ
thư mục `pub/Nihongo/` ở trên, đặt vào `scripts/.download_cache/` với đúng tên file rồi chạy lại — script ưu tiên file
có sẵn trong cache.

## Từ đồng tự dị âm (`heteronyms.yaml`, B5 furigana theo ngữ cảnh)

Biên soạn tay, commit, không có script tải về. ~30 từ một cách viết nhiều cách đọc (辛い からい / つらい, 一日 いちにち /
ついたち, 開く あく / ひらく…), mỗi cách đọc kèm `cues` = chuỗi con tìm trong ngữ cảnh quanh từ (cả nghĩa VI / EN in sẵn ở
bố cục danh sách). `heteronyms.resolve` chỉ đổi cách đọc Sudachi khi một cách đọc có nhiều cue khớp nhất (duy nhất);
pipeline khi đó ghi `readingNote`, hạ `levelConfidence` 0.1, thêm `heteronym:<cue>` vào `levelSources`. Cách đọc tài
liệu khai báo (ruby / cột kana) không bao giờ bị đổi. Thiếu file / YAML hỏng → bảng rỗng, giữ cách đọc Sudachi.
Bảng nạp một lần → sửa file xong phải khởi động lại service.
