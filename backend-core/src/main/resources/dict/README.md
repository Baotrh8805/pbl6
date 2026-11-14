# Nghĩa tiếng Việt dịch sẵn cho từ vựng JLPT (`jlpt_meaning_vi.csv`)

- **Nguồn từ**: `ai-service/app/extract/data/jlpt/n5..n1.csv` (danh sách JLPT của tanos.co.uk qua elzup/jlpt-word-list, CC BY 4.0), giữ
  nguyên `expression`, `reading`, `meaning` (cột `meaning_en`) kể cả các dòng bẩn (cách đọc dính する, cột đảo) — làm sạch là việc của
  `jlpt/classifier._read_rows` (kế hoạch 26/10, B5.3), không sửa ở đây.
- **Nghĩa Việt** (`meaning_vi`): do Claude (`claude-fable-5-1`) viết ngày 26/10/2026 theo quyết định D15 (spec
  `docs/Plan/specs/2026-10-26-tu-dien-design.md` §4.3): 7 972 dòng, N5 718 · N4 668 · N3 2 139 · N2 1 748 · N1 2 699; mỗi lô đã qua
  script kiểm tra (đủ dòng, đúng expression, ≤ 150 ký tự, không sót tiếng Anh / chữ Nhật). Chuẩn viết: ngắn gọn, nhiều nghĩa cách `; `,
  đồng nghĩa cách `, `, động từ / tính từ dạng trần, nhãn trong ngoặc cho trợ từ / liên từ / thán từ / lượng từ / tiền tố / hậu tố /
  kính ngữ / khiêm nhường ngữ / địa danh. Chưa có người rà tay: khi nạp vào `dict_meanings` để `status = MACHINE, source = SEED`
  (hàng chờ admin).
- **Cột**: `expression,reading,level,meaning_vi,meaning_en,source,generated_at`. Cột `entry_key` (`w:<id JMdict>` hoặc
  `w:jlpt:<expression>|<reading>`) sẽ được script `ai-service/scripts/map_jlpt_vi_keys.py` thêm sau khi dựng lại `jmdict.sqlite`
  (task A1 / A3); `DictionarySeedLoader` chỉ nạp dòng có khoá.
- Sửa nghĩa: qua Admin Panel (lịch sử + audit) khi tính năng từ điển có; trước đó sửa thẳng CSV và ghi vào CHANGELOG.

# Nghĩa tiếng Việt cho từ phổ biến của JMdict (`jmdict_common_meaning_vi.csv`)

- **Nguồn từ**: bảng `entries` của `ai-service/app/extract/data/jmdict.sqlite` (bản `jmdict-eng-common` của jmdict-simplified, dựng ngày
  19/10/2026; JMdict © EDRDG, CC BY-SA 4.0): 36 671 dòng (kanji, kana, gloss). Bỏ 7 016 dòng đã có trong `jlpt_meaning_vi.csv`
  (so `(expression, reading)` sau khi chuẩn hoá kana), gom các biến thể cùng `(kana, gloss)` thành **21 806 nhóm** để dịch một lần, rồi
  trải lại cho mọi biến thể (kanji / kana) → **29 655 dòng**, cột như file JLPT (`level` để trống).
- **Nghĩa Việt**: Claude (`claude-fable-5-1`) viết ngày 26/10/2026, 22 lô × ~1 000 nhóm, mỗi lô qua script kiểm tra như file JLPT.
  `meaning_en` là gloss của 1–2 nghĩa đầu trong JMdict (có thể cắt ngắn) — chỉ để đối chiếu. Chưa có người rà tay (`MACHINE / SEED`).
- 50 cặp `(expression, reading)` xuất hiện 2 lần vì JMdict có hai mục từ khác nhau cùng dạng viết (ví dụ レーザー laser / leather,
  ルックス lux / looks): giữ cả hai, nghĩa khác nhau; khi map `entry_key` (A3) mỗi dòng sẽ về đúng mục từ của nó theo `gloss`.
- Toàn bộ JMdict (~218 000 mục) **không** dịch sẵn: phần ngoài tập phổ biến dịch khi tra (quyết định D15).

# Nghĩa tiếng Việt cho từ có câu ví dụ (`jmdict_example_words_meaning_vi.csv`)

- **Nguồn từ**: mọi mục JMdict có ít nhất một câu ví dụ Tatoeba trong `jmdict.sqlite` (bảng `examples`, 28 930 mục) mà **chưa** có nghĩa
  Việt trong hai file trên → **14 068 mục**, mỗi mục một dòng, `entry_key = w:<id JMdict>` có sẵn (không cần map), `expression` / `reading`
  là dạng viết / cách đọc chính, `meaning_en` là nghĩa tiếng Anh đầu tiên (đối chiếu).
- **Nghĩa Việt**: Claude (`claude-fable-5-1`) viết ngày 26/10/2026 theo cùng chuẩn với hai file trên (5 lô, mỗi lô qua script kiểm tra).
  Nạp sau hai file kia (`DictionarySeedLoader.DEFAULT_FILES`), `MACHINE / SEED`, không đè bản admin.
- Cùng ngày: 27 trong 43 dòng `w:jlpt:` của `jlpt_meaning_vi.csv` được gán tay về mục JMdict đúng (dạng có đuôi する / と / に / な,
  dạng viết khác: おおまかな → 大まか, ラジオカセ → ラジカセ, ～(に) よると → によると…). 16 dòng còn lại là hậu tố / tiền tố một chữ
  Hán đọc âm On (～光 こう, ～国 こく, 初～ しょ…) hoặc câu cố định (お元気で, お待ちください…) mà JMdict không có mục riêng: giữ khoá
  `w:jlpt:` (vẫn tra được như mục riêng).

