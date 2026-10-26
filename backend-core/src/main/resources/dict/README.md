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
