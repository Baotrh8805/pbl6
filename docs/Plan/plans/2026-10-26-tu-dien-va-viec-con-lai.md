# Kế hoạch triển khai: Từ điển Nhật–Việt cộng đồng (phần A) + việc cũ còn lại (phần B)

Ngày 26/10/2026 · nhánh `a` · trạng thái: **đã chốt với người dùng, chưa code**. Spec:
[specs/2026-10-26-tu-dien-design.md](../specs/2026-10-26-tu-dien-design.md) (quyết định D14–D29, K1–K10, schema, API, giao diện).
Theo D28: kế hoạch **chỉ liệt kê việc, thứ tự và phụ thuộc, không chia theo ngày**; mục tiêu phần A xong trong khoảng 2 tuần.
Mỗi task ghi: mục tiêu · tệp · bước · test · xong khi. Mọi commit theo [chính sách](../../TEAM_GUIDELINES.md): commit local sau khi test
của gói xanh, không push nếu không được yêu cầu, không dòng Co-Authored-By.

## Ràng buộc chung

- Không đổi hành vi code đang chạy ngoài các điểm móc nêu ở spec §9; mọi migration chỉ thêm (`IF NOT EXISTS`), D7.
- Số migration dự kiến (hỏi nhóm trước khi tạo mỗi số): **V32** từ điển · V33 `decks.share_token` (B1) · V34 nhắc email lộ trình (B4)
  · V35 `extraction_items.doc_level` (B5) · V36 `extraction_jobs.instance_id` (B8). V31 đã dùng (`ac7dc9c`, 25/10).
- Mỗi task kết thúc bằng: test tự động của tầng đó xanh (backend `mvn -B test`, ai-service `pytest`, frontend `lint + build +
  selfcheck`), rồi một commit theo tầng (`ai-service:`, `backend:`, `frontend:`, `docs:`).
- Kiểm trực tiếp trên trình duyệt: Claude kiểm bằng `read_page` / ảnh chụp sau mỗi gói frontend (lượt ngắn), phần cần dịch vụ thật
  (Gemini, SMTP) bàn giao cho người dùng theo bảng ở task A16 (như §8a.1 tài liệu tổng kết 19/10).
- Văn bản giao diện tiếng Việt, lỗi qua `apiErrorText`, thao tác ghi qua `runOnce`, xác nhận qua `DialogProvider`, responsive
  320 / 375 / 768 / 1024 / 1280 px.

## Thứ tự và phụ thuộc

```
Phần 0 ──► A1 (dữ liệu) ──► A2 (ai-service dict + overrides) ──► A3 (Gemini + script dịch sẵn)
                 │                                                       │
                 └──► A4 (V32 + entity) ──► A5 (tra + dịch lúc tra) ──► A6 (bình luận) ──► A7 (báo cáo) ──► A8 (sổ tay)
                                                   │                                                           │
                                                   └──► A9 (admin API) ──► A10 (đẩy ghi đè + bóc tách dùng nghĩa) ◄─┘
A11 (frontend nền, chuyển tab) cần A5 · A12 (tab Từ vựng) cần A5 · A13 (bình luận / báo cáo / sổ tay / popup) cần A6–A8
A14 (admin UI) cần A9 · A15 (trang ghi nguồn) độc lập · A16 (test tổng, tài liệu, bàn giao) cuối cùng
Phần B: B1, B2 độc lập với A (chỉ cần Phần 0); B3, B4 độc lập; B5 gồm việc nhỏ xen kẽ; B6–B9 sau khi A xong (CI chạy pytest cần
A1 không làm test cũ hỏng).
```

Làm song song được: (A1 → A2 → A3) ở ai-service và (A4 → A5) ở backend cùng lúc (A5 mock ai-service); frontend A11 bắt đầu khi
A5 có hợp đồng API (viết `api.types.ts` từ spec §6.5 trước).

## Trọng tâm review (tình huống spec ngụ ý, gắn test vào task sở hữu)

1. Người học không bao giờ thấy giá trị gốc khi admin đã ghi đè (A5, A10): test gộp lớp + test ai-service nhận ghi đè.
2. Lượt hạn mức AI chỉ tính khi thật sự gọi Gemini; mục đã có nghĩa không tốn lượt; hai người mở cùng mục cùng lúc chỉ một lời gọi (A5).
3. Hàng chờ admin xếp đúng ba nhóm và điểm trong nhóm (A9) — yêu cầu riêng của người dùng (D16).
4. "Áp dụng đề xuất" ghi vào đúng lớp theo trường (meaning_vi → lớp 3; reading / han_viet / meaning_en / example_* → lớp 2) và với
   `han_viet` thì ghi vào khoá `k:<chữ>` chứ không phải khoá từ (A7, A9).
5. Hoàn tác tạo dòng lịch sử mới, không xoá lịch sử; audit đủ mọi thao tác admin (A9).
6. Seed JLPT không bao giờ ghi đè dòng đã có; chạy nhiều lần không nhân đôi (A4).
7. Bóc tách: item có nghĩa trong từ điển không gửi Gemini; kết quả Gemini ghi lại không đè bản admin (A10).
8. Redirect `/kanji`, `/han-viet` giữ đủ tham số; `KanjiLookupTab` / `RadicalsTab` / bản đồ Hán-Việt chạy y như cũ (A11).
9. Staff gọi `/api/dictionary/**` → 403; USER gọi `/api/admin/dictionary/**` → 403 (A9, `AdminAuthorizationIT`).
10. Thiếu `jmdict.sqlite` mới (máy chưa dựng lại) → app cũ vẫn chạy, từ điển báo "chưa có dữ liệu", health báo cờ (A2, A5, A12).

---

# Phần 0: Chuẩn bị (làm trước mọi thứ)

### 0.1 Gỡ secret khỏi git và đổi khoá
- **Vấn đề**: `backend-core/src/main/resources/application-local.properties` (mật khẩu Supabase, JWT secret, URL migration) được commit
  và push trong loạt commit 21/10 (`346f9bd..e74f235`, dòng ignore bị xoá ở `e74f235`).
- **Bước**: (1) người dùng đổi mật khẩu DB trên Supabase và tạo JWT secret mới (≥ 64 byte), cập nhật file local của từng máy và biến
  môi trường nơi triển khai (mọi phiên đăng nhập cũ sẽ mất hiệu lực — báo nhóm); (2) `git rm --cached backend-core/src/main/resources/
  application-local.properties`; (3) thêm lại dòng `backend-core/src/main/resources/application-local.properties` vào `.gitignore`
  ngay dưới `backups/`; (4) commit `chore: gỡ application-local.properties khỏi git, trả lại .gitignore`; (5) ghi vào `SUPABASE_SETUP.md`
  mục "secret đã lộ lần 2 (21/10), đã đổi ngày …". Lịch sử git vẫn chứa secret cũ → đổi khoá là bắt buộc, không cần viết lại lịch sử.
- **Xong khi**: `git ls-files | grep application-local` rỗng; backend khởi động được với secret mới; nhóm đã nhận thông báo.

### 0.2 Pull `origin/a`
- `git fetch && git merge origin/a` (có `ac7dc9c`, 60 tệp: hoàn tác lượt ôn V31, `AiRateLimiter`, tab Báo cáo của tôi, phím tắt /
  vuốt màn học). Giải quyết xung đột nếu có (dự kiến không: HEAD local chỉ hơn origin ở merge `f762076`), chạy đủ 3 bộ test để chốt mốc
  xanh trước khi code từ điển. Ghi kết quả test vào CHANGELOG (mục 21–25/10, xem B9).
- **Xong khi**: `git status` sạch, 3 bộ test xanh, HEAD = merge của `origin/a`.

### 0.3 Chốt số migration và dữ liệu máy dev
- Hỏi nhóm số migration cuối trên nhánh của họ → giữ V32 cho từ điển (K9); ghi vào `TEAM_GUIDELINES.md` quy ước "nhắn nhóm trước khi
  tạo V mới".
- Máy dev có Python + `GEMINI_API_KEY` (của người dùng) để chạy script dịch sẵn (A3); Tesseract không cần cho đợt này.

---

# Phần A: Từ điển

## A1. Dữ liệu: dựng lại `jmdict.sqlite` (ai-service)

- **Mục tiêu**: spec §4.1 — bảng `words`, `word_forms`, `word_gloss_fts` (hoặc fallback), `examples`, `tags`; `entries` cũ thêm `id`.
- **Tệp**: `ai-service/scripts/build_dicts.py` (`_latest_jmdict_asset` chọn `jmdict-examples-eng*.json.zip`, dự phòng
  `jmdict-eng-*.json.zip`; `build_jmdict` dựng cả bảng cũ và mới; cờ `--dict-scope full|compact`), `ai-service/app/extract/data/
  README.md`, `.gitignore` (đã có `jmdict.sqlite`), `ai-service/tests/fixtures/jmdict_mini.json` (6 mục chép từ file thật, có
  `examples`), `ai-service/tests/test_build_dicts_dict.py`.
- **Bước**: (1) tải asset, mở 1 mục có ví dụ, in cấu trúc `examples` (xác nhận `source`, `text`, `sentences[].land/text`) — ghi vào
  docstring; (2) tách `build_jmdict` thành `_load_words(zip)`, `_write_entries(con, words)` (cũ + cột `id`), `_write_words(con, words,
  jlpt_index)`, `_write_examples`, `_write_fts` (try/except FTS5 → bảng `word_gloss`); (3) `jlpt` của `words` tra `(text, kana)` trong
  CSV JLPT qua `classifier._read_rows` (chạy với `-I` nên chép hàm đọc tối thiểu vào script như `_CJK_RE`); (4) `gloss_short`;
  (5) VACUUM, in số dòng và kích thước; (6) README: nguồn Tatoeba, ước lượng, `--dict-scope`, bảng "thiếu file thì giảm gì".
- **Test**: builder nhận đường dẫn JSON + sqlite tạm (tách phần tải mạng); kiểm số dòng, `entries` giữ nguyên nội dung cho mục common,
  `word_forms` có cả kanji lẫn kana, `examples` gắn đúng `word_id`/`sense_idx`, FTS trả mục theo gloss, fallback khi FTS5 thiếu
  (monkeypatch `sqlite3.connect` ném `OperationalError` ở `CREATE VIRTUAL TABLE`).
- **Xong khi**: `python -I scripts/build_dicts.py --only jmdict` trên máy dev tạo file mới; `pytest` xanh; `jmdict.lookup`,
  `homophones`, `readings_of`, `han_viet_graph` test cũ không đổi kết quả.

## A2. ai-service: module `dictionary.py`, `overrides.py`, router `/api/dict`

- **Mục tiêu**: spec §4.2, §4.4 (trừ `/dict/translate`), §4.6.
- **Tệp**: `app/extract/dictionary.py`, `app/extract/overrides.py`, `app/api/dict_router.py`, `app/main.py` (include_router),
  `app/api/extract_router.py` (`/extract/health` thêm `dictWords`, `dictExamples`, `dictFts`, `dictOverridesVersion`), móc nhỏ ở
  `jmdict.py` (`lookup` trả `id`; gloss override), `han_viet.py`, `kanji_meanings.py`, `pipeline.py` (reading override + `dictKey` cho
  item), `conflicts.py` (tham chiếu `admin:dict`), `kanji_cards.py` (không đổi; `/dict/kanji/{ch}` gọi `card` + từ chứa chữ).
- **Bước**: (1) `overrides.py` store + file + hàm tra + `version`; (2) `dictionary.search` (ja: chính xác → tiền tố, kata ↔ hira; en:
  FTS/LIKE), `entry`, `entries`, `kanji`, `tokenize`; (3) router với kiểm tham số, 503 `dictUnavailable` khi thiếu bảng; (4) móc
  override vào 5 điểm (mỗi điểm một hàm nhỏ `overrides.get(...)` trả `None` khi không có); (5) `dictKey` vào item của `/extract/
  analyze` (chỉ khi `jmdict.lookup` khớp; cả hai bố cục list / prose); (6) health.
- **Test**: `tests/test_dictionary.py`, `tests/test_overrides.py`, `tests/test_dict_router.py` (fixture sqlite dựng từ
  `jmdict_mini.json` bằng builder của A1 trong `conftest`), mở rộng `test_pipeline.py` (dictKey, reading override) và
  `test_conflicts.py` (tham chiếu admin:dict thắng).
- **Xong khi**: `pytest` xanh; `GET /api/dict/search?q=たべる` trên máy dev trả 食べる đầu danh sách; `GET /api/extract/health` có 4 cờ mới.

## A3. ai-service: `translate_dictionary` + map khoá cho nghĩa JLPT đã dịch + script dịch mở rộng

- **Đã làm 26/10 (trước khi code)**: Claude tự dịch 7 972 dòng JLPT N5–N1 → `backend-core/src/main/resources/dict/jlpt_meaning_vi.csv`
  (chưa có `entry_key`, xem spec §4.3). Phần còn lại của task:
- **Tệp**: `app/extract/gemini.py` (`_DICT_TRANSLATE_PROMPT`, `_DICT_TRANSLATE_SCHEMA`, `translate_dictionary(items, model)`),
  `app/api/dict_router.py` (`POST /dict/translate`, mã lỗi như `/extract/enrich`: `no_api_key` / `quota` / `aiOverloaded` → 503 với
  `reason`), `scripts/map_jlpt_vi_keys.py` (thêm cột `entry_key` vào CSV bằng `jmdict.sqlite` của A1; in số dòng khớp JMdict / dùng
  khoá `w:jlpt:`), `scripts/translate_jlpt_vi.py` (dịch lại / mở rộng bằng Gemini khi có khoá: đầu vào CSV JLPT hoặc danh sách
  `entries` common của `jmdict.sqlite`, resume, lô 40, nghỉ 1 giây), `README.md` + `data/README.md` mục dữ liệu nghĩa Việt.
- **Bước**: (1) prompt + schema + test parse; (2) endpoint; (3) script map khoá, chạy trên máy dev sau A1, commit CSV đã có khoá;
  (4) script Gemini (không chạy trong đợt này nếu người dùng không đưa khoá); (5) README.
- **Test**: `test_gemini.py` (parse đủ / thiếu trường / id ví dụ giữ nguyên), `test_dict_router.py` (translate với Gemini giả, 503 khi
  không khoá), `tests/test_map_jlpt_vi_keys.py` (map khớp / không khớp / kana ↔ katakana / biến thể `高校; 高等学校`), `tests/
  test_translate_jlpt_script.py` (hàm thuần: resume bỏ dòng đã có).
- **Xong khi**: CSV có `entry_key` cho mọi dòng (≥ 95 % khớp JMdict thật, phần còn lại `w:jlpt:`); `pytest` xanh.

## A4. Backend: V32, entity, repository, hàm thuần, seed

- **Tệp**: `db/migration/V32__dictionary.sql` (spec §6.1), `model/Dict*.java` (9 entity), `repository/Dict*Repository.java`,
  `service/DictionaryKeys.java`, `service/DictionaryMerge.java`, `service/DictionarySeedLoader.java`, `dto/dictionary/*`,
  `SettingsService` (2 khoá + validate), `src/test/resources/dict/jlpt_meaning_vi.csv` (fixture 20 dòng).
- **Bước**: (1) migration + chạy trên DB nhúng; (2) entity với `@Table`, khoá gộp (`DictCommentVoteId`, `DictFavoriteId`); (3) repo:
  `DictMeaningRepository.findByEntryKeyIn`, `searchVi(q, limit)` (`ILIKE`), `findByTermAndReading`; `DictLookupHistoryRepository.
  recent`, `countByUser`, `trimTo(user, keep)` (native); `DictReportRepository.countOpenByEntry`, `existsOpen(reporter, key, field)`;
  (4) `DictionaryKeys.parse` + `DictionaryMerge.apply(baseJson, overrides, meaning, exampleVi)`; (5) seed loader; (6) settings.
- **Test**: `DictionaryKeysTest`, `DictionaryMergeTest`, `DictionarySeedLoaderTest` (chạy 2 lần → không nhân đôi; dòng đã sửa không bị
  đè), `SettingsServiceTest` (giới hạn 0..1000 / 0..10), mọi IT hiện có vẫn xanh với V32.
- **Xong khi**: `mvn -B test` xanh; `flyway_schema_history` DB nhúng có V32.

## A5. Backend: tra cứu, mở mục, dịch lúc tra, hạn mức

- **Tệp**: `service/DictionaryAiClient.java`, `service/DictionaryService.java`, `service/DictionaryTranslationService.java`,
  `security/DictionaryRateLimiter.java` (+ `AttemptLimiter.countIn(key)` hoặc lớp con nhận `IntSupplier`), `controller/
  DictionaryController.java` (`/search`, `/entries/{key}`, `/entries/{key}/translate-examples`, `/tokenize`, `/stats`), `config/
  SecurityConfig.java` (không cần đổi: `anyRequest` USER), `dto/dictionary/DictEntryResponse` (spec §6.5), `TtlCache` dùng lại.
- **Bước**: (1) client mỏng (`getJson/postJson/postJsonLong`, timeout 12 giây cho translate); (2) search: `mode=auto` → ja nếu có
  kana/kanji, không thì vi + en song song (`CompletableFuture`), ghép nghĩa Việt theo lô, áp override; (3) entry: gốc (cache) + lớp
  2–4 + `userExamples` (gọi `IPlusOne`/`sentence_mining` hiện có theo `term`, ≤ 3, bỏ qua lỗi) + `relatedSameReading`; (4) dịch lúc
  tra (spec §6.6) với gộp trùng; (5) ghi lịch sử dedupe 1 giờ + cắt 300; (6) `/stats` trả `aiLeft`.
- **Test**: `DictionaryIT` (MockRestServiceServer cho ai-service như `AiServiceClientGeminiModelTest`): search 3 chế độ, entry đủ
  trường, viState 4 ca, gộp trùng (2 thread, 1 lời gọi), limiter theo settings đổi lúc chạy, lịch sử dedupe + cắt, staff 403,
  khoá sai 400, ai-service 503 → 503 message Việt; `DictionaryRateLimiterTest`.
- **Xong khi**: `mvn -B test` xanh; `curl /api/dictionary/search?q=食べる` trên máy dev (ai-service thật, không Gemini) trả mục có
  `meaningVi` từ seed.

## A6. Backend: bình luận + Hữu ích

- **Tệp**: `service/DictionaryCommentService.java`, `DictionaryController` (5 endpoint bình luận), `DictionaryRateLimiter.comment`,
  `dto/dictionary/DictCommentResponse` (`displayName` dùng hàm che email chung với Thư viện — tìm trong `LibraryService`/`DeckRating`
  mapping, tách ra `UserDisplay.name(user)` nếu chưa có).
- **Test**: `DictionaryCommentIT` (spec §13).
- **Xong khi**: IT xanh.

## A7. Backend: báo cáo mục / bình luận (phía người học)

- **Tệp**: `service/DictionaryReportService.java` (validate theo trường, chụp `current_value` từ `DictionaryService.entry` không ghi
  lịch sử, trùng OPEN → 409, `ReportRateLimiter` khoá `dict:<uid>`), `DictionaryController` (`/entries/{key}/reports`, `/comments/{id}/
  reports`, `/reports/mine`), `Notification` hằng mới (dùng ở A9).
- **Test**: `DictionaryReportIT` phần người học (mỗi trường, bắt buộc `subKey`, 409, 429, `/reports/mine`).
- **Xong khi**: IT xanh.

## A8. Backend: sổ tay, lịch sử

- **Tệp**: `service/DictionaryNotebookService.java`, `DictionaryController` (`/favorites*`, `/history*`).
- **Bước**: favorites PUT idempotent, GET có `q` (tìm trong `headKanji`/`meaningVi` qua lô `entries`), history 100 mục dedupe.
- **Test**: trong `DictionaryIT` (sổ tay + lịch sử) — tách lớp `DictionaryNotebookIT` nếu dài.
- **Xong khi**: IT xanh.

## A9. Backend: admin (hàng chờ, sửa, xác nhận, hoàn tác, báo cáo, bình luận, lịch sử, thống kê, quyền)

- **Tệp**: `service/AdminDictionaryService.java`, `controller/AdminDictionaryController.java` (spec §8.3), `repository/DictQueueRepository`
  (native `UNION ALL` + `ORDER BY group_rank, score DESC`), `service/AdminStatsService` + `dto/admin/AdminStatsResponse` (`openDictReports`,
  `dict{…}`), `service/AuditService` (không đổi; action mới), `model/Notification` (`DICT_REPORT_RESOLVED`, `DICT_COMMENT_HIDDEN`),
  `AdminAuthorizationIT`.
- **Bước**: (1) hàng chờ 3 nhóm + lọc + phân trang (`AdminPage`); (2) sửa nghĩa Việt / verify / retranslate (qua `AiRateLimiter.
  checkDeckAi`); (3) override + lịch sử + sự kiện `DictOverrideChangedEvent`; (4) revert; (5) báo cáo: apply (định tuyến lớp theo
  trường, `han_viet` → khoá `k:`), resolve, dismiss, COMMENT → ẩn / xoá; (6) bình luận; (7) lịch sử; (8) stats + badge; (9) `sync-ai`
  (gọi publisher của A10 — khi A10 chưa có, trả 501 tạm, test đánh dấu).
- **Test**: `AdminDictionaryIT` (spec §13, trọng tâm review 3–5), `DictionaryReportIT` phần admin, `AdminStatsIT` mở rộng,
  `AdminAuthorizationIT` ma trận mọi endpoint mới.
- **Xong khi**: `mvn -B test` xanh.

## A10. Đẩy ghi đè sang ai-service + bóc tách dùng nghĩa Việt

- **Tệp**: `service/DictionaryOverridePublisher.java` (ApplicationReady + AFTER_COMMIT + `@Scheduled` 10 phút + `sync-ai`),
  `AiServiceClient.healthBody` dùng lại cho `dictOverridesVersion`, `AdminStatsController /health` thêm `dictOverridesVersion` hai phía,
  `ExtractionWorker.enrich` (tra `dict_meanings` theo `dictKey`, ghi lại sau Gemini), `AiDtos` (item có `dictKey`), `ExtractionItem`
  (không cần cột mới: `dictKey` chỉ dùng trong worker; nếu cần "Dịch lại nghĩa" sau này thì thêm cột ở migration sau),
  `AdminStatsResponse.Ai.Enrich.fromDictionary` + native `enrichStats`.
- **Test**: `DictionaryOverridePublisherTest` (mock client: đẩy sau commit, bỏ qua khi lỗi, log một lần), `ExtractionIT` mở rộng
  (trọng tâm review 7), `AdminStatsIT` (`fromDictionary`).
- **Xong khi**: trên máy dev: sửa Hán-Việt của 食 ở admin → `GET /api/dict/overrides/version` ai-service đổi, bóc tách một đoạn có 食べる
  ra `hanViet` mới và `meaningVi` từ từ điển mà không gọi Gemini (log worker).

## A11. Frontend nền: types, services, route, redirect, sidebar, khung trang, chuyển tab Hán tự / Hán-Việt

- **Tệp**: `types/api.types.ts` (khối `Dict*` cuối file), `services/dictionaryService.ts`, `services/adminDictionaryService.ts`,
  `routes/AppRoutes.tsx` (`/dictionary`, redirect `/kanji`, `/han-viet` giữ tham số, `/about/data`), `features/dashboard/components/
  DashboardSidebar.tsx` (mục "Từ Điển"), `features/profile/components/PracticeStatsTab.tsx` (link), `pages/DictionaryPage.tsx` (tab +
  query), `features/dictionary/components/KanjiTabPanel.tsx` (bọc `KanjiLookupTab` + `RadicalsTab` + sub-tab), `HanVietTabPanel.tsx`
  (bọc nội dung `HanVietMapPage`), `features/dictionary/posLabels.ts`, `features/dictionary/dictUtils.ts` (phát hiện chế độ tìm,
  romaji → kana, đổi URL).
- **Bước**: (1) types theo spec §6.4–6.5; (2) services; (3) trang khung + tab + a11y (role tablist như `KanjiPage`); (4) chuyển
  nội dung hai trang cũ sang panel (giữ file cũ chỉ còn `Navigate`); (5) sidebar; (6) `DictEmptyState` khi 503 `dictUnavailable`.
- **Test**: selfcheck `dictionary.ts` phần redirect + tab; lint + build; kiểm tay `/kanji?tab=radicals&r=5` và `/han-viet?r=thực`.
- **Xong khi**: hai tab cũ chạy y như trước trong trang mới ở 375 / 1280 px.

## A12. Frontend tab Từ vựng: tìm, kết quả, chi tiết, ví dụ, thêm thẻ, TTS

- **Tệp**: `features/dictionary/components/DictSearchBar.tsx`, `DictResultList.tsx`, `DictEntryDetail.tsx`, `DictSenseList.tsx`,
  `DictExampleList.tsx`, `DictPitch.tsx`, `DictKanjiChips.tsx`, `DictActions.tsx`, `AddEntryToDeckModal.tsx` (tổng quát hoá
  `features/hanviet/components/AddWordToDeckModal.tsx` + `lib/hanVietUtils.wordToCardDto` → `lib/dictCard.ts: entryToCardDto`),
  `hooks/useDictSearch.ts` (debounce, AbortController, phân trang), `hooks/useDictEntry.ts`.
- **Bước**: theo spec §7.1; TTS dùng cùng cách màn học (`speechSynthesis`, ja-JP, tốc độ `READING_RATE`); nghĩa fallback theo
  `viState` không nhãn (D23); nút "Dịch ví dụ" / "Dịch thêm" hiện `aiLeft`.
- **Test**: selfcheck (tìm ja / romaji / vi, mở mục, thêm thẻ, kiểm thẻ trùng), lint + build; kiểm tay 320–1280 px, bàn phím
  (↑↓ Enter Esc), đọc màn hình (nhãn nút).
- **Xong khi**: luồng tra → mở → thêm thẻ chạy trên máy dev với ai-service thật (không Gemini: nghĩa từ seed / gloss Anh).

## A13. Frontend: bình luận, báo cáo, sổ tay + lịch sử, popup tra nhanh, nút ở màn học

- **Tệp**: `DictComments.tsx`, `DictCommentForm.tsx`, `ReportEntryModal.tsx`, `ReportCommentModal.tsx`, `NotebookTab.tsx`,
  `DictPopover.tsx`, `hooks/useQuickLookup.ts`, `features/study/components/StudyDictButton.tsx` (+ 1 dòng trong `StudyPage`),
  `services/notificationService.ts` (2 loại mới), `features/profile/components/MyReportsTab.tsx` (nếu tab của `ac7dc9c` nhận
  nhiều nguồn thì thêm nguồn "Từ điển", không thì mục riêng trong NotebookTab).
- **Bước**: theo spec §7.1, §7.3, §7.5; tokenize câu ví dụ → token có `key` thành nút; popover bottom sheet ở màn hẹp.
- **Test**: selfcheck (bình luận + vote + sửa + xoá, báo lỗi + 409, sổ tay + ghi chú + xoá lịch sử, popover từ màn học), lint + build.
- **Xong khi**: luồng chạy trên máy dev; `StudyPage` diff ≤ 5 dòng.

## A14. Frontend admin: trang Từ điển, ngăn sửa, tab Từ điển ở Báo cáo, badge, Tổng quan, Cấu hình, Nhật ký

- **Tệp**: `pages/admin/AdminDictionaryPage.tsx`, `features/admin/components/DictEntryEditor.tsx`, `DictQueueRow.tsx`,
  `ResolveDictReportModal.tsx`, `pages/admin/AdminReportsPage.tsx` (tab cấp 1 Bộ thẻ | Từ điển), `components/layout/AdminLayout.tsx`
  (menu + badge), `features/admin/useAdminQueues.ts` (`openDictReports`), `pages/admin/AdminDashboardPage.tsx` (StatCard Từ điển +
  cảnh báo lệch version ai-service + nút Đồng bộ), `pages/admin/AdminSettingsPage.tsx` (nhóm Từ điển, 2 khoá), `features/admin/
  moderationUtils.ts` / `AdminAuditPage` (nhãn `DICTIONARY`, action mới), `services/adminDictionaryService.ts`.
- **Bước**: theo spec §8.1–8.2; ngăn sửa có cảnh báo "mục đã đổi" khi `updatedAt` khác lúc mở; form lỗi tiếng Việt (không bong bóng
  trình duyệt, như NEW-08).
- **Test**: selfcheck admin (hàng chờ 3 nhóm đúng thứ tự với dữ liệu seed của selfcheck, apply, revert, tab Từ điển, badge), lint +
  build; kiểm tay 1024 / 1280 px và trang riêng ở 375 px.
- **Xong khi**: admin sửa Hán-Việt của một chữ trên giao diện → người học thấy ngay ở từ chứa chữ.

## A15. Trang ghi nguồn `/about/data`

- **Tệp**: `pages/DataSourcesPage.tsx`, `AppRoutes.tsx` (tuyến công khai), link ở chân `DictionaryPage`, `KanjiTabPanel`, trang luyện
  viết; nội dung lấy từ `ai-service/app/extract/data/README.md` (bảng nguồn / giấy phép) + câu "Bản dịch tiếng Việt do hệ thống tạo và
  cộng đồng hiệu đính".
- **Test**: selfcheck mở được không đăng nhập; lint + build.
- **Xong khi**: trang hiện 9 nguồn với link giấy phép; `README.md` dẫn tới trang.

## A16. Tổng kiểm, tài liệu, bàn giao

- Chạy đủ: `mvn -B test`, `pytest`, `npm run lint && npm run build && npm run selfcheck` (Node 22.14 cần cờ như ghi ở
  `dev-environment`), `npm run e2e` (có ai-service thật); lượt kiểm trực tiếp ngắn 375 / 1280 px cho 6 luồng chính.
- Tài liệu: `CHANGELOG.md` mục "Từ điển"; `USE_CASES_CHECKLIST.md` UC-43..45 `[x]`/`[~]` trung thực; `CODEBASE_MAP.md`, `ARCHITECTURE.md`,
  `EXTRACTION.md`, `data/README.md`, `README.md`; `Plan/README.md` đổi trạng thái spec / plan; cập nhật `quyet-dinh-da-chot.md` nếu
  có quyết định mới phát sinh khi code.
- Bàn giao kiểm tay cho người dùng (bảng như §8a.1): Gemini thật (dịch lúc tra, trần, `retranslate`), script dịch sẵn, TTS, Edge /
  điện thoại thật, Supabase thật (V32 trước khi chạy: kiểm `flyway_schema_history` không có V32 lạ; seed JLPT chạy lần đầu ~8 000
  insert).
- **Xong khi**: mọi bộ test xanh, CHANGELOG + checklist cập nhật, bảng bàn giao có đủ cách kiểm và kết quả mong đợi.

---

# Phần B: Việc cũ còn lại (D27: cả 4 nhóm)

## B1. Link chia sẻ bộ thẻ (D9) — đóng dòng "Một phần" D2 của bảng phủ 1.2.1

- **Thiết kế**: V33 `ALTER TABLE decks ADD COLUMN IF NOT EXISTS share_token varchar(43) UNIQUE` (null = tắt; 32 byte ngẫu nhiên
  base64url). Chủ bộ: `POST /api/decks/{id}/share-link` (tạo hoặc xoay), `DELETE` (thu hồi). Người đã đăng nhập mở `/d/<token>` →
  frontend gọi `POST /api/decks/share-link/{token}/accept` → backend thêm dòng `deck_shares` vai trò xem (dùng lại cơ chế mời qua email
  hiện có: xem + học + sao chép dù bộ riêng tư) rồi trả `deckId` → chuyển tới `/decks/{id}`. Thu hồi token không gỡ người đã nhận (chủ
  gỡ từng người ở `ShareDeckModal` như hiện nay). Chưa đăng nhập → trang login giữ `redirect=/d/<token>`.
- **Tệp**: `DeckController`, `DeckService` (`access` không đổi), `DeckShare`, `ShareDeckModal.tsx` (ô link + nút chép / xoay / thu hồi),
  `AppRoutes` (`/d/:token`), `LoginPage` (redirect), `USE_CASES_CHECKLIST` UC-27, tài liệu tổng kết §4 D2 → Xong.
- **Test**: `DeckShareLinkIT` (tạo / xoay / thu hồi / accept / token sai 404 / bộ đã xoá 409 / chủ accept chính mình no-op), selfcheck
  `manual.ts` hoặc `learner.ts`.

## B2. Xuất bộ thẻ (UC-29)

- `GET /api/decks/{id}/export?format=csv|anki` (chủ hoặc người được xem): CSV UTF-8 có BOM `term,reading,meaning,level,han_viet,pos`;
  `anki` = TSV 2 cột `mặt trước<TAB>mặt sau` (mặt sau: cách đọc + nghĩa nhiều dòng, `<br>`), tên tệp theo giờ máy (cùng cách sửa c16).
  PDF: trang in `/decks/:id/print` (bảng thẻ, CSS `@media print`, nút "Lưu PDF" = `window.print()`), không sinh PDF ở server.
- **Tệp**: `DeckController`, `service/DeckExportService` (hàm thuần sinh nội dung), `DeckDetailPage` (menu Xuất), `pages/DeckPrintPage.tsx`.
- **Test**: `DeckExportServiceTest` (escape dấu phẩy / xuống dòng / BOM), `DeckExportIT` (quyền), selfcheck tải tệp.

## B3. Phân tích hiệu quả lộ trình (`review_logs.path_id`, `reaction_ms`)

- `GET /api/insights/path-effect/{pathId}`: theo chương: số lượt, tỷ lệ "again", trung vị phản xạ, tỷ lệ nhớ sau 7 ngày (có lượt ôn
  sau ≥ 7 ngày không again), so sánh trước / sau bổ khuyết (lộ trình remedial có `sourcePathId`? — nếu chưa có cột thì so theo thời
  điểm tạo lộ trình bổ khuyết của cùng người với cùng bộ thẻ); `ReviewRepository` thêm truy vấn gộp theo `path_id`.
- Widget "Hiệu quả" ở `RoadmapDetailPage` (bảng + 2 thanh), thẻ nhỏ ở Tổng quan admin (`learningPathBreakdown` cạnh).
- **Test**: `InsightIT` mở rộng với dữ liệu chèn; selfcheck `learningPath.ts`.

## B4. Nhắc học qua email (tuỳ chọn theo lộ trình)

- V34 `ALTER TABLE learning_paths ADD COLUMN IF NOT EXISTS remind_email boolean NOT NULL DEFAULT false`; cài đặt lộ trình thêm công tắc;
  `LearningPathReminderJob` khi tạo thông báo in-app và `remind_email=true` và `spring.mail.host` có → `MailService` gửi 1 mail / ngày
  (dùng `last_reminded_on` sẵn có), nội dung: số thẻ hôm nay + link lộ trình; thiếu SMTP thì chỉ log.
- **Test**: `LearningPathReminderJobIT` mở rộng (mock `MailService`), `MailServiceTest` (`ac7dc9c` đã có) thêm mẫu.

## B5. Nợ kỹ thuật nhỏ (mỗi mục một commit)

| # | Việc | Tệp | Test |
|---|---|---|---|
| B5.1 | LC-04 backend: `DeckService.addCards` / PUT deck so `term` chuẩn hoá NFKC + trim; trùng → 409 `DUPLICATE_TERM` trừ khi `allowDuplicate=true`; frontend hiện câu 409 | `DeckService`, `DeckRequest.Card` | `DeckIT` thẻ đơn + lô |
| B5.2 | Lưu `docLevel`: V35 `extraction_items.doc_level varchar(2)`; `AiDtos`, `ConflictService` đánh giá lại cấp + ngữ pháp khi "Kiểm tra lại" | `V35`, `ConflictService`, `ConflictSupport` | `ConflictIT` |
| B5.3 | Làm sạch CSV JLPT lúc nạp: bỏ đuôi する ở cách đọc khi cách viết không có, đảo cột `n4.csv:255`, 下る さがる, "(する)" ở n5 | `jlpt/classifier._read_rows` | `test_classifier.py` từng quy tắc trên dữ liệu thật |
| B5.4 | `handleSaveSettings` của lộ trình qua `runOnce` | `RoadmapDetailPage` | selfcheck |
| B5.5 | Ô đổi lý do khoá của tài khoản đang khoá ở `AdminUserDetailPage` (`PATCH {locked:true, lockedReason}`) | frontend | selfcheck admin |
| B5.6 | Tên tệp CSV xuất theo giờ máy (`AdminReportsPage`, `AdminUsersPage`) + dùng chung cho B2 | `lib/dateFile.ts` | selfcheck với `TZ=Asia/Saigon` |
| B5.7 | Bỏ `redis` / `neo4j` khỏi `docker-compose.yml`, bỏ mặc định `NEO4J_PASSWORD` trong `config.py`; cảnh báo log khi `AI_SERVICE_KEY` rỗng ở profile khác e2e | compose, `config.py`, `AiServiceClient` | khởi động thủ công |
| B5.8 | Chương `locked` có điểm trượt hiện dải "Làm lại"; dải LP-15 khi bộ thẻ rời thư mục lộ trình (so `chapters[].deckId`, bỏ phụ thuộc thư mục) | `ChapterTimeline`, `DeckPathNotice` | selfcheck `learningPath.ts` |
| B5.9 | Dọn `ComingSoonBadge`, lớp `SERVER_PENDING_MESSAGE` / `isEndpointMissing` ở 18 tệp (backend đã đủ endpoint) | frontend | lint + build + selfcheck |

## B6. CI, độ phủ

- `.github/workflows/ci.yml`: job ai-service chạy `pip install -r requirements.txt` + `pytest -q` (test cần file không commit đã tự skip
  qua `available()`; kiểm bằng cách chạy pytest trong thư mục không có 4 file đó trước khi sửa CI), cache pip; backend thêm JaCoCo
  (`jacoco-maven-plugin`, `report` ở `verify`, không ngưỡng) + upload artifact; frontend giữ nguyên. Ghi số độ phủ đầu tiên vào
  tài liệu tổng kết §4.1.

## B7. Smoke / e2e 2.0

- `smoke-learning-path.mjs`: kích hoạt có trần / ngày học → `/session` → chấm có `reactionMs` → rebalance → quiz chương → complete →
  `today-summary` → `/insights/next` → remedial. `smoke-admin.mjs`: mnemonics, questions, knowledge-sources, appeals, **dictionary**
  (A9). `e2e.mjs` gọi thêm `smoke-admin.mjs`.

## B8. `failOrphans` theo instance

- V36 `extraction_jobs ADD COLUMN IF NOT EXISTS instance_id varchar(64)` (+ `learning_paths`), worker ghi `app.instance-id`
  (mặc định hostname); khởi động chỉ đánh FAILED job `QUEUED/RUNNING` **của chính instance** hoặc `instance_id IS NULL` và quá 30 phút
  (job cũ trước V36). Đổi hành vi có từ trước → người dùng đã đồng ý khi chọn nhóm 4 (D27); ghi rõ trong CHANGELOG.
- **Test**: `ExtractionIT` (job instance khác không bị đụng; job mồ côi của mình FAILED; job NULL quá hạn FAILED).

## B9. Tài liệu đi sau code

- `CHANGELOG.md`: mục 21/10 (OCR hạ cấp, Gemini quá tải, sửa văn bản gốc lộ trình, V30, **secret bị commit → đã gỡ ở Phần 0**) và
  25/10 (`ac7dc9c`: hoàn tác lượt ôn V31, giới hạn AI, Báo cáo của tôi, phím tắt / vuốt) — viết từ `git show --stat` + test.
- `LEARNING_PATH.md` viết lại thành bản 2.0 thống nhất (d10 cũ); `CODEBASE_MAP.md` (`/admin/account`, `selfcheck/manual.ts`, mục mới);
  `README.md` mục 2.2 (`--only unihan_def`, 3 file overrides); `Plan/README.md` cột trạng thái mọi spec; tài liệu tổng kết 19/10 §7.3
  đóng từng dòng; `quyet-dinh-da-chot.md` thêm D13 (KRADFILE, kanjium) còn thiếu.

---

## Tự rà soát trước khi báo xong (từng phần)

- [ ] Không còn `TODO` mới; không có migration nào sửa file đã chạy; mọi migration mới có `IF NOT EXISTS`.
- [ ] Không secret nào trong git (`git ls-files | grep -iE 'local.properties|\.env$'` rỗng, `git grep -n 'jwt.secret=' -- ':!*.example'` rỗng).
- [ ] 3 bộ test xanh ở HEAD; số liệu ghi vào CHANGELOG; `npm run e2e` xanh.
- [ ] Ma trận quyền: mọi endpoint mới có dòng trong `AdminAuthorizationIT` hoặc test 403 cho staff.
- [ ] Kiểm trực tiếp ngắn: 375 / 1280 px cho từ điển (tra, mục, bình luận, báo lỗi, sổ tay), admin (hàng chờ, ngăn sửa, tab Từ điển).
- [ ] Tài liệu: CHANGELOG, checklist UC-43..45, CODEBASE_MAP, Plan/README, data/README, trang `/about/data` có đủ nguồn.
- [ ] Bàn giao: bảng việc người dùng tự kiểm (Gemini, SMTP, Supabase V32–V36, điện thoại thật) có cách làm và kết quả mong đợi.
