# Dữ liệu từ điển cho `app/extract`

Tạo lại toàn bộ bằng:

```powershell
cd ai-service
venv\Scripts\python.exe -I scripts\build_dicts.py            # tất cả
venv\Scripts\python.exe -I scripts\build_dicts.py --only jmdict
```

Script tải về thư mục cache `scripts/.download_cache/` (đã gitignore), chỉ parse bằng
`json` / `zipfile` / `csv` của stdlib.

| File | Commit? | Nguồn | Giấy phép |
|---|---|---|---|
| `jlpt/n5.csv … n1.csv` | Có (~500 KB) | [elzup/jlpt-word-list](https://github.com/elzup/jlpt-word-list) `src/n*.csv`, gốc từ danh sách của Jonathan Waller (tanos.co.uk) | CC BY 4.0 theo tanos.co.uk (repo elzup ghi "dữ liệu theo giấy phép của tanos") |
| `unihan_vietnamese.csv` | Có (~95 KB) | Unicode [Unihan](https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip) trường `kVietnamese` (giữ âm đầu nếu có nhiều) | [Unicode License](https://www.unicode.org/license.txt) |
| `unihan_japanese.csv` | Có (~480 KB) | Unihan trường `kJapanese` (on katakana + kun hiragana), chỉ khối CJK U+4E00–U+9FFF | Unicode License |
| `jmdict.sqlite` | **Không** (~4 MB, gitignore) | [scriptin/jmdict-simplified](https://github.com/scriptin/jmdict-simplified) bản `jmdict-eng-common` (chỉ từ phổ biến), dựng từ JMdict của EDRDG | [EDRDG licence](https://www.edrdg.org/edrdg/licence.html) (CC BY-SA 4.0) — phải ghi nhận nguồn khi phân phối |
| (SudachiDict `core`) | pip | [WorksApplications/SudachiDict](https://github.com/WorksApplications/SudachiDict) | Apache-2.0 |
| (wordfreq) | pip | [rspeer/wordfreq](https://github.com/rspeer/wordfreq) | MIT (dữ liệu CC BY-SA 4.0) |

Bảng `entries` trong `jmdict.sqlite`: `kanji TEXT, kana TEXT, gloss TEXT, common INTEGER, jlpt TEXT`
(index trên `(kanji, kana)` và `kana`). `gloss` = 2 nghĩa đầu × 2 gloss đầu, nối bằng `; `.
Thiếu file này thì service vẫn chạy: `meaningEn` lấy từ cột `meaning` của CSV JLPT, health báo `jmdict=false`.
