# Kế hoạch triển khai: Sơ đồ chữ Hán & từ vựng (`/graph`)

Ngày 30/10/2026 · nhánh `Graph` · trạng thái: **Đợt 1–3 đã làm 30/10 (test tự động xanh), mục 3.4 báo cáo ở `../reports/2026-10-30-so-do-chu-han.md`; kiểm tay trình duyệt chờ người dùng**.
Spec (nhận xét kế hoạch gốc, quyết định D1–D10, hợp đồng API, thiết kế frontend): [../specs/2026-10-30-so-do-chu-han-design.md](../specs/2026-10-30-so-do-chu-han-design.md).

---

## Các đợt


### Đợt 1 — Dữ liệu + API + trang chạy được (canvas tĩnh)

| # | Việc | Tệp chính | Kiểm |
|---|---|---|---|
| 1.1 | `parse_kanjivg_parts`, `normalise_phon`, `build_kanji_parts()`; chạy sinh `kanji_parts.csv`, commit; cập nhật `data/README.md` (sửa luôn dòng kradfile đã lỗi thời) | `ai-service/scripts/build_dicts.py`, `app/extract/data/kanji_parts.csv`, `data/README.md` | `tests/test_build_kanji_parts.py` (fixture SVG) |
| 1.2 | `kanjidata.parts()`, `phon_family()`, `availability()['kanji_parts']`, cờ health | `app/extract/kanjidata.py`, `app/api/extract_router.py` | `tests/test_kanjidata_parts.py` |
| 1.3 | `kanji_diagram.py`: `resolve(q) → center | candidates`, `structure(ch)`, `compounds(ch, limit=12)`, `detail(ch)`, heuristic "có thể chỉ âm", `sameOn` | `app/extract/kanji_diagram.py` | `tests/test_kanji_diagram.py`: 時 → parts 日+寺, radical 日, phon 寺, họ đủ 7, `sameOn` đúng cho 持/待; 寺 → formula 土+寸·bộ, `phonOf` 7 chữ; `THỜI`/`thoi` → 時; `THANH` → candidates ≥ 2; chữ không phon → không có node phonetic; compounds 時 có 時間 時代 時計 (needs_real skip như `test_han_viet_graph.py:249`) |
| 1.4 | Route `GET /kanji-info/diagram` | `app/api/kanji_info_router.py` | `tests/test_kanji_info_router.py` +3 (200, 400 mode, 422 q dài) |
| 1.5 | `AiServiceClient.kanjiDiagram`, `NlpService.kanjiDiagram` (+ ghép `meaningVi`), `NlpController` | `backend-core/.../AiServiceClient.java`, `NlpService.java`, `NlpController.java` | `AiServiceClientNlpTest` +1 (path/encoding/header); `NlpIT` +3 (400 mode, cache cùng khoá gọi upstream 1 lần, ghép meaningVi từ `dict_meanings` seed trong test) |
| 1.6 | Service + types frontend; `diagramLayout.ts` + selfcheck | `services/kanjiDiagramService.ts`, `types/kanjiDiagram.types.ts`, `features/graph/diagramLayout.ts`, `scripts/selfcheck/diagram.ts` | `npm run selfcheck` |
| 1.7 | Canvas tĩnh (chọn node, không zoom/kéo), Panel, Trang mới (tab, tìm, chip, URL, candidates), sidebar | như §3.5 | `npm run lint && npm run build`; kiểm tay 時/寺/青/THANH |
| 1.8 | Dọn Neo4j frontend theo D8; sửa tài liệu (`CODEBASE_MAP`, `ARCHITECTURE`, `USE_CASES_CHECKLIST` UC-34/35, `docs/Plan/README`, `CHANGELOG`) | xem D8 | build xanh, `AdminGraphCard` vẫn chạy |

Kết quả đợt 1: mở `/graph?q=時` thấy sơ đồ đúng màu, panel đủ nội dung, chuyển `Từ ghép`, bấm `Bắt đầu lại` đổi tâm (URL đổi, Back trình duyệt hoạt động), `Tra chữ này` sang từ điển.

### Đợt 2 — Tương tác canvas

| # | Việc | Kiểm |
|---|---|---|
| 2.1 | `useViewBox`: wheel zoom quanh con trỏ, kéo nền pan, nút `+ − ⤢`, phím `+ - 0` | kiểm tay desktop + touch (pinch tối thiểu: 2 ngón → scale) |
| 2.2 | Kéo thả node (`positionsOverride`), ngưỡng 4 px phân biệt bấm/kéo, `Thu gọn` cũng reset vị trí | kiểm tay |
| 2.3 | Huy hiệu `+`, đúp chuột/Shift+Enter mở node: `fetchKanjiDiagram(X)` → `mergeDiagram` + `placeAround`; `Mở thêm 1 tầng` (≤ 8 node, tuần tự), `Thu gọn` | selfcheck `mergeDiagram` khử trùng id, `placeAround` không chồng; kiểm tay |
| 2.4 | Ngăn xếp lịch sử + nút `← Quay lại [chữ trước]`; thống kê đáy `X chữ · Y từ ghép` | kiểm tay |
| 2.5 | Khả năng truy cập: node focus được, `aria-label`, thông báo `aria-live` khi đổi tâm | lint |

### Đợt 3 — Hoàn thiện

| # | Việc |
|---|---|
| 3.1 | Autocomplete ô tìm (`/api/nlp/han-viet-suggest`, debounce 200 ms) + chip gợi ý theo cấp người học (`useShell` level nếu có) |
| 3.2 | Heuristic "có thể là chỉ âm" cho chữ thiếu `kvg:phon` (nhãn riêng, có thể tắt) — đánh giá trên 50 chữ mẫu trước khi bật |
| 3.3 | Thêm từ ghép vào bộ thẻ từ panel (tái dùng `AddWordToDeckModal`) |
| 3.4 | Báo cáo kiểm thử tay `docs/Plan/reports/…`, cập nhật trạng thái spec |

## Kiểm thử & xác minh toàn cục

- ai-service: `cd ai-service && venv/Scripts/python.exe -X utf8 -m pytest -q tests/test_build_kanji_parts.py tests/test_kanjidata_parts.py tests/test_kanji_diagram.py tests/test_kanji_info_router.py` rồi toàn bộ `-q`.
- backend: `cd backend-core && mvn test` (chạy **tuần tự** với pytest, máy 8 GB). Kỳ vọng: 598 + 4 xanh.
- frontend: `npm run lint && npm run build && npm run selfcheck`.
- Tay (theo đợt, ghi vào báo cáo): ví dụ bắt buộc `時`, `寺`, `青`, `THANH` (candidates), `明` (không phon), chữ ngoài JLPT (`鬱`), chuỗi rác (`abc` → "không tìm thấy"), tắt Neo4j container → trang vẫn chạy; xoá tạm `jmdict.sqlite` → Cấu tạo chạy, Từ ghép báo thiếu.
- Hiệu năng: đo `curl -w %{time_total}` cho 10 chữ, lạnh và nóng; ghi số vào báo cáo thay vì hứa trước.

