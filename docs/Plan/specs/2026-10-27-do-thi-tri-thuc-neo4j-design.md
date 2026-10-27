# Thiết kế: Đồ thị tri thức trên Neo4j + GraphRAG (UC-34, UC-35)

Ngày 27/10/2026 · nhánh `a` · thay quyết định 19/10 ("GraphRAG / Neo4j thật ngoài phạm vi") bằng **D30** (xem §13 và
[2026-10-19-quyet-dinh-da-chot.md](2026-10-19-quyet-dinh-da-chot.md)). Kế hoạch việc: [plans/2026-10-27-do-thi-tri-thuc-neo4j.md](../plans/2026-10-27-do-thi-tri-thuc-neo4j.md).

## 1. Mục tiêu và phạm vi

Làm **đúng đề cương**: dùng Neo4j thật, đồng bộ dữ liệu từ Postgres sang, truy vấn bằng Cypher, và hỏi đáp GraphRAG (đồ thị +
văn bản + Gemini). Người học có trang **Đồ thị tri thức** để khám phá quan hệ từ vựng – chữ Hán – bộ thủ – âm Hán-Việt – mẫu
ngữ pháp – câu ví dụ, thấy ngay mình đã học gì trong đó, nhận gợi ý học tiếp tính từ đồ thị, và hỏi bằng tiếng Việt.

Trong phạm vi: lớp tham chiếu dựng từ dữ liệu ai-service đang có (JMdict, JLPT, Unihan / KRADFILE / 214 bộ, `patterns.yaml`,
câu ví dụ + bản dịch Việt); lớp người học đồng bộ từ Postgres (bộ thẻ, thẻ, lịch ôn, nhật ký ôn, lộ trình, nghĩa Việt từ điển);
truy vấn: lân cận, đường nối ngắn nhất, gợi ý, phát hiện xung đột giữa các bộ thẻ; GraphRAG hỏi đáp có trích nguồn.

Ngoài phạm vi: nhúng vector (pgvector) — nhánh "văn bản" của hợp nhất song song dùng FTS5 / instr có sẵn trong `jmdict.sqlite`
và `example_vi`, không nhúng; Neo4j nhiều máy / cluster; đồng bộ theo sự kiện (dùng đồng bộ định kỳ + theo người dùng khi mở trang).

## 2. Kiến trúc

```
Postgres (Supabase) ──JDBC──► backend-core GraphSyncService ──POST /api/graph/sync (lô JSON)──► ai-service app/graph/* ──Bolt──► Neo4j 5
                                      ▲                                                               │
frontend /graph ──► backend /api/graph/* (JWT, hạn mức) ──► ai-service /api/graph/* (X-Internal-Key) ──┘
                                                                        └──► Gemini (GraphRAG; thiếu khoá → trả lời mẫu từ đồ thị)
```

- **Neo4j** chạy bằng `docker compose up -d neo4j` (dịch vụ đã có trong `docker-compose.yml`: `neo4j:5-community`, APOC, cổng
  7474 / 7687). ai-service là **tầng duy nhất** nối Neo4j (driver `neo4j` Python, `NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD` trong
  `app/core/config.py`); backend không nối thẳng. Thiếu Neo4j → mọi API đồ thị trả 503 `graphUnavailable`, phần còn lại của app
  không ảnh hưởng.
- **Lớp tham chiếu** (từ điển, chữ Hán, ngữ pháp, câu) do ai-service dựng từ dữ liệu của chính nó; **lớp người học** do backend
  đẩy sang từ Postgres (backend là chủ dữ liệu, ai-service không có chuỗi kết nối Postgres).

## 3. Mô hình đồ thị

| Nhãn | Khoá (ràng buộc duy nhất) | Thuộc tính | Nguồn |
|---|---|---|---|
| `Word` | `key` = `w:<id JMdict>` (JLPT không khớp JMdict: `w:jlpt:<từ>\|<cách đọc>`) | `term, reading, gloss` (Anh, ngắn), `vi` (Việt, từ Postgres `dict_meanings`), `jlpt` (N5…N1 / null), `common`, `kanaOnly` | JMdict `common=1` + 5 danh sách JLPT |
| `Kanji` | `char` | `hanViet` (âm đầu), `strokes`, `radicalNo`, `jlpt` (cấp dễ nhất của từ chứa nó), `meaning` (Anh) | mọi chữ Hán xuất hiện trong `Word` |
| `Radical` | `no` (1–214) | `char, nameVi, meaningVi, strokes` | `radicals_214.csv` |
| `Component` | `char` | — | KRADFILE (thành phần không phải chữ Hán trong đồ thị) |
| `HanViet` | `reading` (viết hoa có dấu: `NHẬT`) | `fold` (không dấu, để tìm) | Unihan + `han_viet_overrides.csv` |
| `Grammar` | `id` (`nakereba_naranai`) | `name, level, meaningVi` | `grammar/patterns.yaml` |
| `Sentence` | `id` (id JMdict examples) | `jpn, eng, vi` (từ `example_vi.csv`) | `jmdict.sqlite` `examples` |
| `User` | `id` (bigint Postgres) | `level` (JLPT tự khai) — **không** email / họ tên | Postgres `users` |
| `Deck` | `id` | `title, level, ownerId` | `decks` |
| `Card` | `id` | `term, reading, meaning` (cắt 200 ký tự), `deckId` | `flashcards` |
| `Path` | `id` | `title, status` | `learning_paths` |
| `Chapter` | `id` | `title, position, pathId` | `learning_path_chapters` |

Quan hệ (hướng ghi rõ; Cypher đọc theo nhãn hai đầu):

| Quan hệ | Thuộc tính | Ý nghĩa |
|---|---|---|
| `(Word)-[:CONTAINS {pos}]->(Kanji)` | vị trí chữ trong từ | từ chứa chữ |
| `(Kanji)-[:HAS_RADICAL]->(Radical)` | | bộ thủ chính (Unihan RS) |
| `(Kanji)-[:HAS_COMPONENT]->(Kanji \| Component)` | | thành phần KRADFILE (chữ Hán là Kanji, còn lại là Component) |
| `(Kanji)-[:READ_AS]->(HanViet)` | | âm Hán-Việt |
| `(Word)-[:HOMOPHONE_OF]->(Word)` | | cùng cách đọc, khác chữ (nhóm ≤ 8 từ, chỉ từ JLPT) — dễ nhầm |
| `(Kanji)-[:LOOKS_LIKE {score}]->(Kanji)` | | chữ giống hình (`kanji_similar`, k = 3, chỉ chữ JLPT) |
| `(Sentence)-[:EXAMPLE_OF]->(Word)` | | câu ví dụ của từ |
| `(Sentence)-[:USES_GRAMMAR]->(Grammar)` | | matcher bắt được mẫu trong câu |
| `(User)-[:OWNS]->(Deck)` | | |
| `(Deck)-[:HAS_CARD {pos}]->(Card)` | | |
| `(Card)-[:MEANS]->(Word)` | | thẻ khớp mục từ (tra `jmdict.lookup(term, reading)` lúc đồng bộ) |
| `(Card)-[:CONTAINS]->(Kanji)` | | chữ Hán trong thuật ngữ thẻ |
| `(User)-[:REVIEWS {ease, intervalDays, reps, dueAt, again30d, lastAt}]->(Card)` | | lịch ôn hiện tại (`reviews`) + số lần "again" 30 ngày và lần ôn cuối (`review_logs`) |
| `(User)-[:FOLLOWS]->(Path)`, `(Path)-[:HAS_CHAPTER]->(Chapter)`, `(Chapter)-[:FROM_DECK]->(Deck)`, `(Chapter)-[:SCHEDULES {seq, day}]->(Card)` | | lộ trình 2.0 |

Chỉ mục: ràng buộc duy nhất cho mọi khoá ở bảng trên; chỉ mục thêm `Word(term)`, `Word(reading)`, `Word(jlpt)`, `HanViet(fold)`,
`Grammar(name)`, `Card(term)`, `REVIEWS` không cần chỉ mục (đi từ User). Mỗi node lớp người học có `run` (mã lần đồng bộ) để dọn
dữ liệu cũ (§5). Lớp tham chiếu có node `(:Meta {id: "reference"}) {builtAt, counts}`.

## 4. Dựng lớp tham chiếu (`app/graph/builder.py`)

`POST /api/graph/build` (admin) hoặc tự dựng lần đầu khi `Meta` chưa có và có lệnh `GET /graph/status?autobuild=1` từ backend lúc
khởi động. Chạy trong luồng nền của ai-service, trạng thái `building` trong `/graph/status`. Các bước, mỗi bước ghi theo lô
`UNWIND $rows AS r MERGE ...` 2 000 dòng:

1. Ràng buộc + chỉ mục (idempotent, `IF NOT EXISTS`).
2. `Word`: mọi mục JLPT (qua `jmdict.lookup` → id; không khớp → khoá `w:jlpt:`) + mọi mục JMdict `common = 1` có chữ Hán hoặc kana
   (~30 000). Thuộc tính `gloss` = `gloss_short`.
3. `Kanji` + `CONTAINS`: quét `term` của mọi `Word`; `hanViet` từ `han_viet`, `strokes / radicalNo` từ `kanjidata.radical_strokes`,
   `meaning` từ `kanji_meanings`, `jlpt` từ `classifier.entries_containing`.
4. `Radical`, `HAS_RADICAL`; `Component`, `HAS_COMPONENT` (KRADFILE); `HanViet`, `READ_AS`.
5. `HOMOPHONE_OF` (từ JLPT cùng `reading`, nhóm ≤ 8); `LOOKS_LIKE` (chữ JLPT, `kanji_similar.similar(ch, 3)`).
6. `Grammar`; `Sentence` + `EXAMPLE_OF` (bảng `examples`, `vi` từ `example_vi`); `USES_GRAMMAR` bằng `tokenizer.tokenize` +
   `matcher.match_sentence` cho từng câu (bước chậm nhất, ~1 phút; `with_grammar=false` để bỏ qua khi test nhanh).
7. `Meta` ghi `builtAt`, số node / quan hệ từng nhãn.

Dựng lại = xoá lớp tham chiếu (`DETACH DELETE` theo nhãn, giữ lớp người học) rồi dựng; quan hệ `MEANS / CONTAINS` của thẻ được
tạo lại ở lần đồng bộ kế tiếp (status báo `learnerStale: true` để backend đồng bộ ngay).

## 5. Đồng bộ lớp người học (`app/graph/sync.py` ⇐ backend `GraphSyncService`)

- Giao thức: backend tạo `run` (UUID), gửi nhiều lô `POST /api/graph/sync {run, scope: "all" | "user", userId?, users, decks,
  cards, reviews, paths, chapters, pathCards, meanings}` (mỗi lô ≤ 2 000 dòng mỗi loại), rồi `POST /api/graph/sync/finish {run,
  scope, userId?}`: ai-service `DETACH DELETE` node lớp người học có `run <> $run` (cả đồ thị khi `scope = all`, chỉ node của
  `userId` khi `scope = user`). Nhờ đó xoá bộ thẻ / thẻ / lộ trình ở Postgres cũng mất ở Neo4j mà không cần theo dõi sự kiện.
- `meanings` (`dict_meanings.entry_key, meaning_vi`) đặt `Word.vi` — Postgres là nguồn nghĩa Việt (seed + Gemini + admin sửa).
- Lịch: `GraphSyncJob` chạy `app.graph.sync-cron` (mặc định `0 50 3 * * *`, giờ VN) đồng bộ **toàn bộ**; admin bấm "Đồng bộ ngay";
  người học mở trang đồ thị → backend `syncUser(uid)` nếu lần đồng bộ của người đó cũ hơn 10 phút (bộ nhớ RAM, mất khi khởi động
  lại = đồng bộ lại, vô hại). Người dùng chỉ được tự đồng bộ dữ liệu của mình.
- Không gửi email / họ tên / mật khẩu; tài khoản đã xoá (`@deleted.local`) và staff không đồng bộ. Thẻ chỉ cắt `meaning` 200 ký tự.
- Khớp thẻ → `Word`: ai-service tra `jmdict.lookup(term, reading)`; không khớp → không có `MEANS` (vẫn có `CONTAINS` chữ Hán).

## 6. Truy vấn Cypher (`app/graph/queries.py`)

Mọi truy vấn tham số hoá, giới hạn `LIMIT`, không ghép chuỗi người dùng vào Cypher.

- **Lân cận** `GET /graph/explore?q&userId&limit`: `q` → node tâm theo thứ tự: `Word.key` / `Kanji.char` (một chữ Hán) /
  `HanViet.fold` (chữ Latin viết hoa không dấu) / `Grammar.name` hay `Grammar.id` / `Word.term` = q / `Word.reading` = q. Trả
  `{center, nodes, edges}`: tâm + láng giềng cấp 1 (mọi loại) + cấp 2 chọn lọc (chữ → từ chứa chữ tối đa `limit`; từ → chữ → bộ thủ
  / âm; mẫu ngữ pháp → câu → từ). Có `userId` thì mỗi `Word` / `Kanji` thêm `learner: {cards, due, again30d}` qua
  `(u)-[:REVIEWS]->(c)-[:MEANS|CONTAINS]->(n)`.
- **Đường nối** `GET /graph/path?from&to`: `shortestPath((a)-[*..6]-(b))` giữa hai khái niệm (từ / chữ / âm / mẫu), trả chuỗi
  node + quan hệ để giải thích "食 nối với 飯 qua bộ 食 và từ ご飯".
- **Gợi ý** `GET /graph/recommend?userId&limit` (ba nhóm, mỗi nhóm một Cypher):
  1. *Từ mới từ chữ đã học*: `(u)-[:REVIEWS]->(c)-[:CONTAINS]->(k)<-[:CONTAINS]-(w:Word)` với `w.jlpt` ≤ cấp người dùng, `w`
     không có thẻ nào của `u`, xếp theo số chữ đã biết / số chữ của từ giảm dần.
  2. *Chữ Hán hay sai*: `(u)-[:REVIEWS {again30d >= 2}]->(c)-[:CONTAINS]->(k)` nhóm theo `k`, kèm bộ thủ và chữ giống hình
     (`LOOKS_LIKE`) để giải thích.
  3. *Từ đồng âm dễ nhầm*: `(u)-[:REVIEWS]->(c)-[:MEANS]->(w)-[:HOMOPHONE_OF]-(h)` mà `h` chưa có thẻ.
- **Xung đột giữa bộ thẻ** `GET /graph/conflicts?userId`: `(u)-[:OWNS]->(d1)-[:HAS_CARD]->(c1)`, `(u)-[:OWNS]->(d2)-[:HAS_CARD]->(c2)`
  với `c1.term = c2.term`, `d1 <> d2` và (`reading` khác hoặc `MEANS` khác từ) — "phát hiện mâu thuẫn" của kiến trúc gốc.
- **Trạng thái** `GET /graph/status`: `{available, building, builtAt, counts, learner: {users, cards, lastRun}}`.

## 7. GraphRAG hỏi đáp (`app/graph/rag.py`, `POST /graph/ask {question, userId?, level?, geminiModel?}`)

1. **Nhận diện thực thể** (`extract_entities`): Sudachi tách câu hỏi, lấy lemma từ nội dung (danh / động / tính từ, ≤ 8) + từng chữ
   Hán + chuỗi Latin viết hoa khớp `HanViet.fold` + cụm `〜…` khớp `Grammar.name`; mỗi ứng viên tra Neo4j (`Word.term`/`reading`,
   `Kanji.char`, …). Không thấy thực thể nào → vẫn chạy nhánh văn bản.
2. **Nhánh đồ thị**: với mỗi thực thể, Cypher lấy lân cận bậc 1 (+ câu ví dụ ≤ 3, từ chứa chữ ≤ 6, bộ thủ, âm Hán-Việt, mẫu ngữ
   pháp) và **ngữ cảnh học** của `userId` (thẻ nào, bộ nào, đến hạn chưa, số lần sai).
3. **Nhánh văn bản** (hợp nhất song song, thay vector search): FTS5 `word_gloss_fts` theo từ khoá tiếng Anh / `example_vi.search`
   theo tiếng Việt / `instr` tiếng Nhật trên câu → ≤ 6 câu / mục từ.
4. **Hợp nhất** (`fuse`): mỗi mẩu ngữ cảnh có `{id, type, label, text, score}`; điểm = 1 nếu đến từ thực thể hỏi trực tiếp, 0,6
   nếu láng giềng, 0,5 nếu từ nhánh văn bản, +0,3 nếu xuất hiện ở cả hai nhánh; cắt 24 mẩu, ≤ 6 000 ký tự.
5. **Sinh câu trả lời**: có khoá Gemini → prompt tiếng Việt: "Chỉ dùng ngữ cảnh, trích nguồn `[n]`, nói rõ nếu ngữ cảnh không đủ",
   `temperature 0.2`, dùng `gemini._generate` (chuỗi model + dự phòng như dịch nghĩa); `geminiModel` của Admin truyền qua. Không có
   khoá / hết quota → `template_answer`: xếp ngữ cảnh thành đoạn tiếng Việt có cấu trúc (từ → nghĩa → chữ Hán → câu → tình trạng
   học), `model: "template"` để giao diện ghi "trả lời từ đồ thị, chưa qua Gemini".
6. Trả `{answer, model, entities, sources: [{n, id, type, label, text}], subgraph: {nodes, edges}}`; backend giữ hạn mức 20 câu
   hỏi / giờ / người (`AttemptLimiter`), câu hỏi ≤ 300 ký tự.

## 8. API

ai-service (`/api/graph/*`, `X-Internal-Key`): `GET status`, `POST build`, `POST sync`, `POST sync/finish`, `GET explore`,
`GET path`, `GET recommend`, `GET conflicts`, `POST ask`. Neo4j không nối được → 503 `{detail: "graphUnavailable"}`.

backend (`/api/graph/*`, cần đăng nhập, staff không dùng — như mọi API học): `GET explore?q&limit`, `GET path?from&to`,
`GET recommend`, `GET conflicts`, `POST ask {question}`, `POST sync/me` (đồng bộ dữ liệu của mình, tối đa 1 lần / phút) —
`userId` luôn lấy từ JWT. Admin: `GET /api/admin/graph/status`, `POST /api/admin/graph/build`, `POST /api/admin/graph/sync`
(ghi `audit_logs`); `GET /api/admin/health` thêm `graph: ok | down | empty`. Lỗi ai-service / Neo4j → 503 `graphUnavailable`
"Đồ thị tri thức chưa sẵn sàng (Neo4j chưa chạy hoặc chưa dựng dữ liệu)".

## 9. Giao diện (`/graph`, mục "Đồ thị tri thức" trong thanh bên, icon `hub`)

- Ô tìm (từ / chữ Hán / âm Hán-Việt / mẫu ngữ pháp) + gợi ý nhanh; đồ thị SVG bố cục lực (`lib/graphLayout.ts`, mô phỏng lực
  đơn giản, tất định theo seed) với màu theo loại node, viền theo tình trạng học (đã có thẻ / đến hạn / hay sai); bấm node → bảng
  chi tiết (thuộc tính, "Mở trong từ điển", "Khám phá từ đây", "Thêm vào bộ thẻ" với `AddWordToDeckModal`).
- Khối **Gợi ý cho bạn** (3 nhóm §6) và **Xung đột giữa bộ thẻ**; **Đường nối** (hai ô, vẽ chuỗi); **Hỏi đáp** (câu hỏi → trả
  lời + nguồn `[n]` bấm được → đồ thị con). Trang đồ thị gọi `POST /api/graph/sync/me` khi mở.
- Admin > Tổng quan: chấm "Đồ thị (Neo4j)" + hộp "Đồ thị tri thức" (số node, lần dựng, lần đồng bộ, nút "Dựng lại" / "Đồng bộ").
- Chưa dựng / Neo4j tắt: trang hiện hướng dẫn `docker compose up -d neo4j` (cho dev) thay vì lỗi đỏ.

## 10. Bảo mật, hạn mức, riêng tư

`userId` chỉ từ JWT; ai-service chỉ nhận qua khoá nội bộ. Hỏi đáp 20 / giờ / người, khám phá 120 / phút / người, `sync/me`
1 / phút / người. Neo4j không lộ ra ngoài (cổng 7474 / 7687 chỉ trên máy chủ nội bộ; đổi `NEO4J_AUTH` khi triển khai — mật
khẩu mặc định `password123` chỉ cho dev, ai-service cảnh báo khi `NEO4J_URI` không phải localhost mà vẫn dùng mặc định). Không
PII trong Neo4j. Thêm mục vào `docs/SECURITY.md`.

## 11. Test

- ai-service: `tests/test_graph_builder.py` (dòng node / quan hệ dựng từ dữ liệu tí hon, như `test_han_viet_graph`),
  `tests/test_graph_sync.py` (lô → câu lệnh Cypher + tham số, khớp thẻ → từ), `tests/test_graph_rag.py` (nhận diện thực thể, hợp
  nhất, trả lời mẫu, prompt), `tests/test_graph_router.py` (TestClient với `FakeGraph` ghi lại Cypher và trả bản ghi dựng sẵn; 503
  khi Neo4j tắt), `tests/test_graph_live.py` chạy **trên Neo4j thật** khi đặt `NEO4J_TEST=1` (dựng từ dữ liệu tí hon vào database
  riêng, kiểm từng Cypher thật; bỏ qua khi không có).
- backend: `GraphIT` (`@MockitoBean GraphAiClient`): explore / ask truyền đúng `userId`, hạn mức hỏi, `sync/me` gửi đúng bộ thẻ /
  thẻ / lịch ôn / lộ trình / nghĩa Việt của chính người đó và không gửi email, admin build / sync cần ADMIN và ghi audit, health
  `graph`.
- frontend: selfcheck `graph.ts` (bố cục lực tất định, gom node theo loại, tô nguồn `[n]`).
- Kiểm tay trên Neo4j thật: dựng đầy đủ (ghi thời gian + số node vào CHANGELOG), đồng bộ người dùng seed, mở `/graph`.

## 12. Vận hành

`docker compose up -d neo4j` → ai-service tự dựng lớp tham chiếu lần đầu khi backend gọi status (hoặc admin bấm); dữ liệu ở volume
`neo4jdata`. Biến môi trường: `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` (ai-service), `app.graph.sync-cron` (backend). Neo4j
Browser `http://localhost:7474` để chạy Cypher tay. Thời gian dựng đo thực tế ghi trong CHANGELOG.

## 13. Quyết định D30

| # | Câu hỏi | Quyết định | Hệ quả |
|---|---|---|---|
| D30 | UC-34 / UC-35 (19/10 ghi "ngoài phạm vi") | **Làm đúng đề cương**: Neo4j thật, đồng bộ Postgres → Neo4j, Cypher, GraphRAG (Gemini; thiếu khoá → trả lời mẫu từ đồ thị) | Hạ tầng thêm một dịch vụ Docker; backend không nối Neo4j; không migration Postgres mới |
