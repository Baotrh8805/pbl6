# Kế hoạch: Đồ thị tri thức Neo4j + GraphRAG (UC-34, UC-35)

Ngày 27/10/2026 · nhánh `a` · spec: [specs/2026-10-27-do-thi-tri-thuc-neo4j-design.md](../specs/2026-10-27-do-thi-tri-thuc-neo4j-design.md)
(D30). Chỉ liệt kê việc, thứ tự, phụ thuộc (D28). Mỗi task: mục tiêu · tệp · xong khi. Commit theo tầng, không push.

## Ràng buộc

- Không migration Postgres (đồng bộ chỉ đọc). Backend không nối Neo4j; ai-service là tầng duy nhất dùng driver `neo4j`.
- Neo4j tắt / chưa dựng → 503 `graphUnavailable`, không ảnh hưởng phần khác; test tự động không cần Neo4j (FakeGraph), test
  Neo4j thật chạy khi `NEO4J_TEST=1`.
- Không PII trong Neo4j; `userId` chỉ từ JWT.

## Thứ tự

```
G1 ai-service nền (client, schema, status) ──► G2 dựng lớp tham chiếu ──► G3 đồng bộ lớp học ──► G4 truy vấn Cypher ──► G5 GraphRAG
                                                                                                     │
G6 backend (client, sync, API, job, admin) ◄──────────────────────────────────────────────────────────┘
G7 frontend (/graph, admin) ◄── G6
G8 kiểm trên Neo4j thật + tài liệu + commit
```

## Việc

### G1. ai-service: nền Neo4j — trạng thái: Xong
- `requirements.txt` thêm `neo4j>=5.20`; `app/graph/client.py` (driver lười, `available()`, `run(cypher, params)`, `run_many`,
  503 khi không nối được), `app/graph/schema.py` (ràng buộc / chỉ mục), `app/api/graph_router.py` `GET /graph/status`;
  `main.py` đăng ký; `extract_router` health thêm cờ `graph`.
- Xong khi: `GET /api/graph/status` trả `available: false` khi Neo4j tắt, `true` + `counts` khi bật; test router với FakeGraph.

### G2. Dựng lớp tham chiếu — Xong
- `app/graph/builder.py`: `reference_rows()` (Word / Kanji / Radical / Component / HanViet / Grammar / Sentence + quan hệ) từ
  `classifier`, `jmdict`, `han_viet`, `kanjidata`, `radicals`, `kanji_meanings`, `kanji_similar`, `grammar.matcher`,
  `example_vi`; `build(graph, with_grammar=True)` ghi theo lô UNWIND; `POST /graph/build` chạy nền; `Meta`.
- Xong khi: test dựng trên dữ liệu tí hon ra đúng node / quan hệ; dựng thật trên máy dev xong, ghi số liệu vào CHANGELOG.

### G3. Đồng bộ lớp người học — Xong
- `app/graph/sync.py`: `apply(graph, payload)` (UNWIND MERGE theo loại, `run`), `finish(graph, run, scope, user_id)`;
  khớp thẻ → `Word` bằng `jmdict.lookup`; router `POST /graph/sync`, `/graph/sync/finish`.
- Xong khi: test lô → Cypher + tham số; test live: đồng bộ rồi finish xoá node cũ.

### G4. Truy vấn Cypher — Xong
- `app/graph/queries.py`: `resolve(q)`, `explore`, `path`, `recommend` (3 nhóm), `conflicts`, `status`; router GET tương ứng.
- Xong khi: test FakeGraph kiểm Cypher chứa nhãn / tham số đúng; test live trên dữ liệu tí hon ra kết quả mong đợi.

### G5. GraphRAG — Xong
- `app/graph/rag.py`: `extract_entities`, `graph_context`, `text_context`, `fuse`, `prompt`, `template_answer`, `ask`;
  router `POST /graph/ask`.
- Xong khi: test không cần Gemini (template) + test prompt / fuse; khi có khoá, Gemini được gọi với ngữ cảnh.

### G6. backend-core — Xong
- `service/graph/GraphAiClient.java`, `GraphSyncService.java` (JDBC → lô), `GraphService.java` (hạn mức, syncUser lười,
  403 cho staff), `GraphSyncJob.java` (`app.graph.sync-cron`), `controller/GraphController.java`, `AdminGraphController.java`;
  `AdminStatsService.health` thêm `graph`; `GraphIT`.
- Xong khi: `mvn test` xanh, `GraphIT` kiểm payload và quyền.

### G7. frontend — Xong
- `types/graph.types.ts`, `services/graphService.ts`, `lib/graphLayout.ts`, `features/graph/components/*` (GraphSvg, NodePanel,
  Recommendations, Conflicts, PathFinder, AskPanel), `pages/KnowledgeGraphPage.tsx` (`/graph`), thanh bên, admin dashboard,
  selfcheck `graph.ts`.
- Xong khi: lint + tsc + selfcheck + build xanh; kiểm trên trình duyệt với Neo4j thật.

### G8. Kiểm trên Neo4j thật, tài liệu, commit — Xong
- Dựng đầy đủ, đồng bộ user seed, chạy từng API; cập nhật `USE_CASES_CHECKLIST.md` (UC-34, UC-35, UC-36), `CHANGELOG.md`,
  `CODEBASE_MAP.md`, `ARCHITECTURE.md`, `SECURITY.md`, `README.md` (cách chạy Neo4j), quyết định D30; commit theo tầng.
