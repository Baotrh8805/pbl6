# Spec: Từ điển Nhật–Việt cộng đồng (tra từ, bình luận, báo cáo, admin sửa từ điển gốc)

Ngày 26/10/2026 · nhánh `a` · trạng thái: **đã chốt với người dùng (grill me 4 vòng, 16 câu), chưa có code**; kế hoạch triển khai ở
[plans/2026-10-26-tu-dien-va-viec-con-lai.md](../plans/2026-10-26-tu-dien-va-viec-con-lai.md) (phần A), kèm việc cũ còn lại (phần B).
Tính năng mới, **ngoài** mục 1.2.1 của "Yêu cầu chức năng.docx" (docx chỉ có "Tra cứu chữ Hán" F1 / C5); đề xuất đặt UC-43..45 trong
[USE_CASES_CHECKLIST.md](../../USE_CASES_CHECKLIST.md). Mẫu tham chiếu: ứng dụng Mazii (tra từ, Hán-Việt, ví dụ, bình luận cộng đồng, báo lỗi).

Quy ước: mỗi quyết định tinh gọn ghi dạng `[mục] → bỏ qua: [X], thêm khi [Y]`, tối đa 3 dòng giải thích. Mọi migration chỉ thêm
(quyết định D7). Không đụng code đang chạy tốt ngoài các điểm móc nêu ở §9.

### Quyết định đã chốt với người dùng (26/10)

| # | Câu hỏi | Quyết định | Hệ quả thiết kế |
|---|---|---|---|
| D14 | Phạm vi trang Từ điển | **Từ vựng (mới) + gộp Hán tự (`/kanji`) + Hán-Việt (`/han-viet`) + Sổ tay** thành một trang `/dictionary` dạng tab | Không viết lại hai trang cũ, chỉ chuyển thành tab; route cũ redirect. Tab Ngữ pháp / Câu ví dụ riêng → bỏ qua, thêm khi có giải thích ngữ pháp tiếng Việt |
| D15 | Nguồn nghĩa tiếng Việt (không có bộ Nhật–Việt mở nào; JMdict chỉ nghĩa Anh) | **Dịch sẵn ~8 000 từ JLPT N5–N1 bằng script chạy 1 lần (commit CSV) + Gemini dịch khi có người tra lần đầu, lưu vĩnh viễn** | Lớp nghĩa Việt nằm trong Postgres (`dict_meanings`), admin sửa được; không có khoá Gemini → hiện nghĩa Anh |
| D16 | Hàng chờ kiểm tra của admin | **Mục bị báo cáo lên đầu, kế đến mục chỉ có nghĩa Anh / nghĩa máy chưa kiểm** | Trang `/admin/dictionary` tab "Hàng chờ" xếp theo nhóm (§8.1) |
| D17 | Câu ví dụ + bản dịch | **Tatoeba qua bản "JMdict with examples" của jmdict-simplified (~30 000 cặp Nhật–Anh gắn đúng nghĩa) + Gemini dịch Việt khi tra; thêm câu từ tài liệu của chính người học** | Dựng lại `jmdict.sqlite` (§4); bản dịch ví dụ lưu `dict_example_vi`; câu từ tài liệu lấy qua `sentence_mining` đã có |
| D18 | Hướng tra | **Nhật (kanji / kana / romaji) ↔ Việt + Anh** | Romaji → kana ở frontend (`lib/romaji.ts`); tiếng Anh tìm trong gloss JMdict (FTS5, ai-service); tiếng Việt tìm trong `dict_meanings` (backend) |
| D19 | Bình luận | **Phẳng + nút "Hữu ích"; sửa / xoá của mình; báo cáo bình luận xấu; admin ẩn / xoá** | Không trả lời lồng → bỏ qua, thêm khi cộng đồng đủ đông |
| D20 | Báo cáo từ điển | **Chọn trường sai + đề xuất sửa + ghi chú; admin "Áp dụng đề xuất" một nút, hoặc sửa tay, hoặc từ chối có ghi chú; người báo nhận thông báo** | Bảng `dict_reports`, modal xử lý có bản hiện tại cạnh đề xuất |
| D21 | Ai sửa từ điển gốc | **ADMIN và SUPER_ADMIN sửa trực tiếp**; mỗi lần sửa ghi audit + lịch sử, có hoàn tác | Không có bước duyệt hai cấp |
| D22 | Tầm ảnh hưởng của bản sửa | **Toàn hệ thống**: bóc tách tạo thẻ, dịch nghĩa, cảnh báo mâu thuẫn, thẻ chữ Hán đều dùng bản sửa | Lớp ghi đè đẩy từ backend sang ai-service (§9); nghĩa Việt dùng lại khi bóc tách |
| D23 | Nghĩa máy dịch chưa kiểm | **Hiện ngay cho người học, KHÔNG gắn nhãn "bản dịch máy"**, chỉ có nút báo lỗi như mọi mục | Trạng thái MACHINE / VERIFIED chỉ dùng nội bộ cho hàng chờ admin |
| D24 | Đăng nhập | **Phải đăng nhập** (giữ quy tắc hiện tại) | Hạn mức đếm theo tài khoản; staff dùng từ điển qua `/admin/dictionary` (staff vẫn 403 API học, D8) |
| D25 | Nối với phần học | **Thêm vào bộ thẻ + lịch sử tra + sổ tay (yêu thích) + tra nhanh (popup) từ màn học / câu ví dụ** | Dùng lại `AddWordToDeckModal` (hanviet), `DeckService.addCards` |
| D26 | Hạn mức Gemini lúc tra | **Mọi người dùng, trần theo giờ mỗi tài khoản** (khoá cấu hình `dictionary_ai_hourly_limit`, mặc định 30); từ đã có bản dịch không tính; hết trần vẫn tra được, hiện nghĩa Anh | `DictionaryRateLimiter` đọc trần từ `app_settings` mỗi lần kiểm |
| D27 | Việc cũ đưa vào plan | **Cả 4 nhóm** (D9 + UC-29; phân tích hiệu quả lộ trình + nhắc email; nợ kỹ thuật nhỏ + trang ghi nguồn; CI / test / smoke 2.0 / failOrphans / tài liệu) | Phần B của kế hoạch |
| D28 | Hạn và cách viết plan | **Từ điển xong trong khoảng 2 tuần; plan chỉ liệt kê việc, không chia theo ngày** | Kế hoạch có thứ tự + phụ thuộc, không có lịch |
| D29 | Bình luận / báo cáo cho chữ Hán | **Cả từ vựng và từng chữ Hán** (Hán-Việt và nghĩa chữ là theo chữ) | Khoá mục có hai loại `w:` và `k:` (§3) |

### Quyết định kỹ thuật Claude tự chọn (nêu để người dùng phản đối nếu muốn)

| # | Quyết định | Vì sao |
|---|---|---|
| K1 | Dựng lại `jmdict.sqlite` từ bản **JMdict đầy đủ có ví dụ** (`jmdict-examples-eng`, ~218 000 mục, id ổn định `ent_seq`); giữ nguyên bảng `entries` cũ (chỉ từ phổ biến, thêm cột `id`) để code bóc tách không đổi hành vi | Bản `common` hiện tại (~20 000 từ, không id) không đủ cho từ điển; id ổn định là khoá cho bình luận / báo cáo / ghi đè |
| K2 | Ba lớp dữ liệu: **gốc** (file dựng, ai-service) → **ghi đè** (`dict_overrides`, backend, admin) → **nghĩa Việt** (`dict_meanings`, backend); lớp ghi đè đẩy sang ai-service, lớp nghĩa Việt không đẩy | ai-service vẫn là nguồn tra cứu tĩnh không trạng thái; backend là chủ dữ liệu người dùng và nghĩa Việt; bóc tách lấy nghĩa Việt từ backend trước khi gọi Gemini |
| K3 | Hướng gọi vẫn **backend → ai-service** (đẩy ghi đè lúc khởi động, sau mỗi lần sửa, và mỗi 10 phút); ai-service lưu bản sao `data/dict_overrides.json` | Không thêm phụ thuộc ngược ai-service → backend, không thêm biến môi trường mới cho ai-service |
| K4 | Dịch lúc tra chạy **đồng bộ trong request** mở mục (timeout 12 giây), gộp lời gọi trùng theo khoá; thất bại thì trả nghĩa Anh | Đơn giản hơn hàng đợi; người dùng thấy ngay; quota bảo vệ bằng trần theo giờ |
| K5 | Báo cáo bộ thẻ và báo cáo từ điển là **hai bảng khác nhau** nhưng cùng một trang `/admin/reports` (hai tab) | `content_reports` gắn chặt `deck_id`; tách bảng tránh cột null chéo; người dùng muốn báo cáo "vào phần Báo cáo" |
| K6 | Trang quản lý từ điển riêng `/admin/dictionary` (hàng chờ, tìm & sửa, bình luận, lịch sử) | Hàng chờ xếp theo D16 cần màn riêng; sửa từ điển không phải là "xử lý báo cáo" |
| K7 | Ví dụ không có trường riêng trên thẻ (`Flashcard` chỉ có `meaning` nhiều dòng) → khi "Thêm vào bộ thẻ", ví dụ đi vào dòng 2+ của `meaning` như bóc tách đang làm | Không đổi schema thẻ |
| K8 | Lịch sử tra lưu ở server (tối đa 300 mục / người, cắt bớt khi thêm) | Dùng được nhiều thiết bị; dữ liệu nhỏ |
| K9 | Số migration: **V32** cho từ điển (V31 đã dùng bởi `ac7dc9c` ngày 25/10 trên `origin/a`); báo nhóm trước khi tạo | Tránh trùng số với đồng đội |
| K10 | Trang ghi nguồn giấy phép (`/about/data`) làm **cùng đợt** với từ điển | JMdict (CC BY-SA 4.0) và Tatoeba (CC BY 2.0 FR) hiện nguyên văn cho người dùng nên bắt buộc ghi nguồn |

---

## 0. Hiện trạng đã đọc từ code (thiết kế dựa vào đây)

| Dữ kiện | Nơi | Hệ quả |
|---|---|---|
| `jmdict.sqlite` dựng từ `jmdict-eng-common` (chỉ từ phổ biến), bảng `entries(kanji, kana, gloss, common, jlpt)`, **không có id**, `gloss` = 2 nghĩa đầu × 2 gloss | `ai-service/scripts/build_dicts.py::build_jmdict`, `app/extract/jmdict.py` (`lookup`, `homophones`, `readings_of`) | Phải dựng thêm bảng mới (§4); `entries` giữ nguyên nội dung, thêm `id` |
| JLPT N5–N1: `data/jlpt/n*.csv` cột `expression,reading,meaning,tags` (~8 000 dòng, nghĩa EN), nạp bởi `jlpt/classifier._read_rows`; sửa nghĩa qua `jlpt_meaning_overrides.csv` | `app/extract/jlpt/classifier.py`, `data/README.md` | Nguồn cho script dịch sẵn (D15); CSV bẩn (§7.1 #8 tài liệu tổng kết) làm sạch ở phần B |
| Âm Hán-Việt theo **chữ**: Unihan `kVietnamese` + `han_viet_overrides.csv`, hàm `han_viet.han_viet(term)` ghép cho từ | `app/extract/han_viet.py` | Báo "Hán-Việt sai" sửa ở chữ (`k:`), D29 |
| Nghĩa **chữ** Hán: `unihan_definitions.csv` + `kanji_meaning_overrides.csv` | `app/extract/kanji_meanings.py` | Ghi đè `kanji_meaning` ở lớp 2 thắng hai file này |
| Thẻ chữ Hán: `kanji_cards.card(ch)` → `{kanji, hanViet, radical, on[], kun[], meaningEn, strokeCount}`; trọng âm `pitch.accent_type(word, reading)` (chỉ từ JLPT, kanjium) | `kanji_cards.py`, `pitch.py` | Tab Hán tự dùng lại nguyên; mục từ có `pitch` khi có dữ liệu |
| Dịch Gemini: `gemini.translate_items(items, "vi", model)` batch 40, JSON schema `{ref, meaningVi, exampleVi}`, model theo `ai_model_primary` (`resolve_model`) | `app/extract/gemini.py` | Thêm `translate_dictionary` cùng kiểu (prompt riêng cho từ điển) |
| Tách từ Sudachi: `tokenizer.tokenize(text, mode)` → `Token(surface, lemma, reading…)` | `app/extract/tokenizer.py` | `/dict/tokenize` cho popup tra nhanh trong câu |
| Proxy tra chữ Hán: `NlpController` (`/api/nlp/*`, USER) → `NlpService` (`TtlCache` 10 phút / 500 mục, đổi lỗi → 400 / 404 / 503) → `AiServiceClient.hanVietGraph / hanVietSuggest / kanjiCards / radicals…`; client mỏng theo nhóm (`QuizAiClient`, `PracticeAiClient`, `ContentAiClient`) dùng `getJson / postJson / postJsonLong` | `service/NlpService.java`, `service/AiServiceClient.java` | `DictionaryAiClient` theo đúng mẫu |
| Frontend tra chữ Hán: `KanjiPage` (`?tab=lookup\|radicals&k=&r=`), `HanVietMapPage` (`?r=`), `features/kanji/components/*`, `features/hanviet/components/*` (có `AddWordToDeckModal` + `lib/hanVietUtils.wordToCardDto`), menu "Cộng Đồng & Khám Phá" của `DashboardSidebar` | `pages/KanjiPage.tsx`, `pages/HanVietMapPage.tsx`, `features/dashboard/components/DashboardSidebar.tsx` | Chuyển thành tab, giữ nguyên thành phần bên trong |
| Romaji → kana: `lib/romaji.ts` (`toKana`, `romajiToKanaFull`, `hasKana`), `KanaInput.tsx` | `frontend/src/lib/romaji.ts` | Ô tìm dùng lại, không viết bộ chuyển mới |
| Bình luận bộ thẻ: `DeckRating(deckId, userId, stars, comment)` một dòng / người / bộ; admin `GET /api/admin/ratings`, `DELETE /api/admin/ratings/{id}/comment` (`AdminContentService.listRatings / clearComment`), thông báo `COMMENT_CLEARED` | `model/DeckRating.java`, `AdminContentController` | Bình luận từ điển là bảng riêng (nhiều bình luận / người / mục), admin xử lý tương tự |
| Báo cáo bộ thẻ: `ContentReport(deckId, reporterId, reason, detail, status OPEN, action, resolutionNote, resolvedBy, resolvedAt)`, `ReportRateLimiter` 10 / giờ, `AdminReportController` `GET / {id}/resolve / {id}/dismiss`, `Notification.REPORT_RESOLVED`; frontend `AdminReportsPage` + `ResolveReportModal`, badge `openReports` | `model/ContentReport.java`, `service/ReportService.java`, `pages/admin/AdminReportsPage.tsx` | `dict_reports` theo cùng vòng đời OPEN → RESOLVED / DISMISSED; tab mới trong trang Báo cáo (K5) |
| Báo lỗi câu hỏi `QuestionFlag` cùng mẫu; giới hạn theo người: `AttemptLimiter` (cửa sổ trượt trong RAM) qua `MnemonicRateLimiter`, `ReportRateLimiter`, `AiRateLimiter` (25/10, `origin/a`) | `security/*RateLimiter.java` | `DictionaryRateLimiter` (AI, bình luận) cùng mẫu; trần AI đọc từ settings |
| Audit: `AuditService.log(actorId, action, targetType, targetId, detail)`; nhãn target ở `AdminAuditPage`; thông báo: `NotificationService.notify(userId, type, payload)`, hằng ở `model/Notification.java`, link ở `services/notificationService.ts` | `service/AuditService.java`, `model/Notification.java` | Target mới `DICTIONARY`, loại thông báo mới (§13) |
| Cấu hình chạy: `SettingsService.KEY_*` + `DEFAULTS`, seed bằng migration (V14, V20, V21); đọc DB mỗi lần gọi | `service/SettingsService.java` | Khoá mới seed ở V32 |
| Nguồn tri thức chuẩn: `KnowledgeSourceService.referencesFor(terms)` → `ReferenceEntry(term, reading, meaning, level, sourceId)` gửi kèm `/extract/analyze`, `/extract/conflicts`; chỉ dùng cho cảnh báo mâu thuẫn | `service/KnowledgeSourceService.java`, `extract_router.ReferenceEntry` | Lớp ghi đè admin được gửi kèm như tham chiếu ưu tiên cao nhất (`sourceId = "dict"`), ngoài ra còn áp vào Hán-Việt / nghĩa chữ / gloss (§9) |
| Thẻ: `Flashcard(term, reading, meaning nhiều dòng, level, kind, readingSegments, hanViet, pos)`; `DeckRequest.Card` cùng trường; `DeckService.addCards(uid, deckId, reqs)` | `model/Flashcard.java`, `dto/deck/DeckRequest.java` | K7 |
| Bóc tách dịch nghĩa: `ExtractionWorker.enrich` → `ai.enrich(EnrichRequest("vi", inputs))` → Gemini **mỗi job**, không cache theo từ | `service/ExtractionWorker.java` | Lấy nghĩa Việt từ `dict_meanings` trước, chỉ gửi phần còn thiếu, ghi lại kết quả (§9.3) |
| Phân quyền: `/api/admin/**` cần ADMIN (SUPER_ADMIN qua `RoleHierarchy`), `anyRequest` cần USER (staff 403 API học); lỗi JSON `{status, error, message}` | `config/SecurityConfig.java`, `config/ApiExceptionHandler.java` | `/api/dictionary/**` USER; `/api/admin/dictionary/**` ADMIN; ma trận `AdminAuthorizationIT` mở rộng |
| Migration mới nhất trên `origin/a`: **V31** (`ac7dc9c`, 25/10, hoàn tác lượt ôn) | `db/migration/` | K9: từ điển dùng V32 |
| Commit `ac7dc9c` (đồng đội, 25/10, chưa pull) sửa `features/study/*`, `StudyPage`, `studyService.ts`, `api.types.ts`, `AdminLayout` không đổi | `git show --stat origin/a` | Popup tra nhanh gắn vào màn học bằng một nút nhỏ, tránh sửa sâu `StudyPage` |
| Test: backend IT trên Postgres nhúng (`support/E2eDatabaseConfig`), 30 lớp `controller/*IT`, `AdminAuthorizationIT` (ma trận quyền), `MigrationUpgradePathTest`; ai-service pytest có `tests/fixtures`; frontend `scripts/selfcheck/*.ts` + lint + build | — | Ma trận test §16 |
| `application-local.properties` (mật khẩu Supabase, JWT secret) **đang được git theo dõi** từ loạt commit 21/10 | `.gitignore` (dòng ignore bị xoá ở `e74f235`) | Bước 0 của kế hoạch: đổi secret, gỡ khỏi index |

---

## 1. Mục tiêu và phạm vi

**Mục tiêu.** Người học tra được từ tiếng Nhật như Mazii ngay trong app: từ, cách đọc, âm Hán-Việt, nghĩa tiếng Việt, từ loại, cấp JLPT,
trọng âm, câu ví dụ kèm bản dịch, chữ Hán trong từ; thêm từ vào bộ thẻ; ghi sổ tay; xem lịch sử; bình luận chia sẻ kiến thức dưới mỗi
mục; báo lỗi cách đọc / nghĩa / ví dụ kèm đề xuất sửa. Admin và super admin xem hàng chờ (mục bị báo cáo, mục chưa có nghĩa Việt),
sửa thẳng từ điển gốc, bản sửa có hiệu lực toàn hệ thống.

**Trong phạm vi (đợt này).** Tab Từ vựng (mới) · tab Hán tự và Hán-Việt (chuyển từ `/kanji`, `/han-viet`) · tab Sổ tay (yêu thích +
lịch sử) · bình luận + Hữu ích + báo cáo bình luận · báo cáo mục từ / chữ Hán · trang admin `/admin/dictionary` · tab Từ điển trong
`/admin/reports` · đẩy ghi đè sang ai-service + dùng nghĩa Việt khi bóc tách · dịch sẵn JLPT · trang ghi nguồn `/about/data` ·
popup tra nhanh ở màn học và trong câu ví dụ · thẻ thống kê Từ điển ở Tổng quan admin.

**Ngoài phạm vi.** `[Tab Ngữ pháp] → bỏ qua: patterns.yaml chỉ có mẫu + ví dụ, không có giải thích; thêm khi có nội dung tiếng Việt.`
`[Tìm câu ví dụ theo cụm (tab Câu)] → bỏ qua; thêm khi cần, dữ liệu đã có trong examples.` `[Trả lời lồng, nhắc tên, ảnh trong bình
luận] → bỏ qua.` `[Người dùng đóng góp nghĩa thành nghĩa chính không qua admin] → bỏ qua (D20: qua báo cáo).` `[Tra công khai không
đăng nhập] → bỏ qua (D24).` `[Audio giọng người, NHK] → bỏ qua; TTS trình duyệt như màn học.` `[Dịch ngược Việt → Nhật bằng AI]
→ bỏ qua; tìm Việt chỉ tra trong nghĩa Việt đã lưu.`

---

## 2. Kiến trúc dữ liệu: bốn lớp

```
người học / admin
      │  /api/dictionary/*  (USER)          /api/admin/dictionary/* (ADMIN)
      ▼
backend-core ─────────────────────────────────────────────────────────────────
  DictionaryService: gộp [gốc] + [ghi đè] + [nghĩa Việt] + [cộng đồng]
  Lớp 2 ghi đè   dict_overrides, dict_edit_history           ──┐ đẩy (POST /dict/overrides)
  Lớp 3 nghĩa VN dict_meanings, dict_example_vi                │ lúc khởi động, sau mỗi sửa, 10 phút/lần
  Lớp 4 cộng đồng dict_comments, dict_comment_votes,           │
                 dict_reports, dict_favorites, dict_lookup_history
      │ GET /dict/search, /dict/entries/{id}, POST /dict/translate, /dict/tokenize
      ▼                                                        ▼
ai-service ────────────────────────────────────────────────────────────────────
  Lớp 1 gốc  jmdict.sqlite (words, word_forms, word_gloss_fts, examples, entries)
             jlpt/n*.csv, unihan_*.csv, han_viet_overrides.csv, kanji_meaning_overrides.csv,
             pitch_accent.csv, kanji_strokes.json, kradfile.csv
  overrides.py: bản sao lớp 2 trong RAM + data/dict_overrides.json
               → han_viet(), kanji_meanings(), jmdict.lookup(), pipeline (reading), conflicts (tham chiếu)
  gemini.translate_dictionary()  (chỉ khi backend gọi /dict/translate)
```

Thứ tự ưu tiên khi hiển thị và khi bóc tách: **ghi đè admin > nghĩa Việt (ADMIN > GEMINI > SEED) > gốc**. Không có trường hợp nào
người học thấy giá trị gốc khi admin đã ghi đè (backend áp ghi đè ngay từ DB, không chờ ai-service đồng bộ).

---

## 3. Khoá mục (`entry_key`)

| Loại | Dạng | Ví dụ | Nguồn id |
|---|---|---|---|
| Từ JMdict | `w:<ent_seq>` | `w:1358280` (食べる) | `id` của jmdict-simplified (ổn định giữa các bản JMdict) |
| Từ chỉ có trong JLPT, không khớp JMdict | `w:jlpt:<expression>\|<reading>` | `w:jlpt:お先に\|おさきに` | dựng lúc build (§4.3) |
| Chữ Hán | `k:<chữ>` | `k:食` | một ký tự CJK |

Ràng buộc: `varchar(64)`, regex `^(w:(\d{1,10}|jlpt:[^|]{1,24}\|[^|]{1,24})|k:[一-鿿㐀-䶿])$` kiểm ở backend
(`DictionaryKeys.parse`), ai-service trả `404` cho id không có. Mọi bảng lớp 2–4 khoá theo `entry_key`; bình luận / báo cáo / sổ tay
của chữ Hán và của từ dùng chung bảng (D29).

---

## 4. Dữ liệu ai-service

### 4.1 Dựng lại `jmdict.sqlite` (`build_dicts.py --only jmdict`)

- Nguồn: asset `jmdict-examples-eng-*.json.zip` của release mới nhất `scriptin/jmdict-simplified` (~70 MB zip; bản 3.6.2 ngày
  24/08/2026 ghi 218 577 mục). Dự phòng khi release không có asset này: `jmdict-eng-*.json.zip` (đầy đủ, không ví dụ) → `examples`
  rỗng, health báo `dictExamples=false`. Bản `jmdict-eng-common` không tải nữa (suy ra từ cờ `common`).
- Cấu trúc JSON (theo `@scriptin/jmdict-simplified-types`): `words[] { id, kanji[] {common, text, tags}, kana[] {common, text, tags,
  appliesToKanji}, sense[] {partOfSpeech[], appliesToKanji[], appliesToKana[], related[], antonym[], field[], dialect[], misc[],
  info[], languageSource[], gloss[] {lang, gender, type, text}} }`, `tags {mã: mô tả}` ở gốc file. Bản có ví dụ **không có type định
  nghĩa chính thức**: trong file thực tế mỗi `sense` có thêm `examples[] { source {type: "tatoeba", value: "<id câu>"}, text: "<dạng
  từ dùng trong câu>", sentences[] { land: "jpn"\|"eng", text } }` (`land` là lỗi chính tả có chủ ý của upstream, giữ nguyên) →
  **bước đầu của task build: mở một mục mẫu, in cấu trúc, chỉnh tên trường trước khi parse**.
- Bảng mới (cùng file, cùng kết nối `mode=ro`):

| Bảng | Cột | Ghi chú |
|---|---|---|
| `words` | `id TEXT PK, forms TEXT, senses TEXT, common INT, jlpt TEXT, head_kanji TEXT, head_kana TEXT, gloss_short TEXT, n_examples INT` | `forms` = JSON `[{text, kana, common, tags[]}]` (kanji trước, kana sau); `senses` = JSON `[{pos[], misc[], field[], info[], gloss[], appliesToKanji[], appliesToKana[]}]`; `jlpt` = N5..N1 nếu (text, kana) khớp CSV JLPT (lấy cấp dễ nhất, như `classifier`); `gloss_short` = 2 gloss đầu của 2 nghĩa đầu (để danh sách kết quả không parse JSON) |
| `word_forms` | `form TEXT, word_id TEXT, is_kana INT, common INT` | index `(form)`; tra chính xác và tiền tố bằng khoảng `form >= ? AND form < ? \|\| char(0xFFFF)` (dùng được index, không cần LIKE) |
| `word_gloss_fts` | FTS5 `(gloss, word_id UNINDEXED)`, tokenizer `porter unicode61` | tìm tiếng Anh; kiểm `sqlite3.sqlite_version` + thử `CREATE VIRTUAL TABLE` lúc build, thiếu FTS5 → bảng `word_gloss(word_id, gloss)` + LIKE, health `dictFts=false` |
| `examples` | `id INTEGER PK, word_id TEXT, sense_idx INT, tatoeba_id TEXT, form TEXT, jpn TEXT, eng TEXT` | index `(word_id)`; `tatoeba_id` là khoá bản dịch Việt phía backend |
| `tags` | `code TEXT PK, label TEXT` | mô tả từ loại / misc tiếng Anh; nhãn tiếng Việt cho ~40 tag hay gặp để ở frontend (`features/dictionary/posLabels.ts`), tag lạ hiện mã |
| `entries` (cũ) | thêm `id TEXT` | nội dung = mọi `words` có `common=1` (đúng tập `jmdict-eng-common`); `jmdict.lookup` trả thêm `id`; `homophones`, `readings_of`, `han_viet_graph._jmdict_index` không đổi |

- Ước lượng: 218 000 mục → `words` ~45 MB, `word_forms` ~20 MB, FTS ~25 MB, `examples` ~30 000 dòng ~6 MB → file ~90–110 MB (không
  commit, gitignore sẵn), dựng ~2–4 phút. Nếu quá nặng cho máy nhóm: cờ `--dict-scope common+jlpt+examples` chỉ giữ mục có cờ common,
  thuộc JLPT hoặc có ví dụ (~45 000 mục) → ghi rõ trong `data/README.md`; mặc định đầy đủ.
- `data/README.md`: thêm dòng nguồn Tatoeba (CC BY 2.0 FR, qua JMdict_e_examp) và ghi JMdict là bản đầy đủ; bảng "thiếu file thì tính
  năng nào giảm": thiếu `words` → `/dict/*` trả 503 `dictUnavailable`, từ điển hiện màn "chưa có dữ liệu" (admin thấy cờ ở health).

### 4.2 Module `app/extract/dictionary.py`

- `available()`, `search(q, mode, limit, offset)` với `mode = "ja" | "en"`: `ja` = chính xác (`form = q`, kana ↔ katakana) rồi tiền
  tố, xếp `common DESC, jlpt (N5 trước), độ dài form, id`; `en` = FTS `MATCH` trên gloss (`"q*"` cho tiền tố từ cuối), xếp theo
  `bm25` rồi `common`. Trả `[{id, forms, headKanji, headKana, glossShort, common, jlpt, nExamples}]` + `total` (đếm riêng, trần 500).
- `entry(id)` → `{id, forms, senses, examples (≤ 20, common form trước), common, jlpt, hanViet (han_viet.han_viet(head_kanji)),
  hanVietChars [{char, reading}], pitch {accentType, moras[], hl[]} | null (pitch.accent_type + reference_hl), kanjiChars[] (chữ Hán
  trong head_kanji)}`; `entries(ids)` cho lô ≤ 50 (tìm tiếng Việt, sổ tay, lịch sử).
- `tokenize(text)` → `[{surface, lemma, reading, dictId|null}]` qua `tokenizer.tokenize(mode="C")` + `jmdict.lookup(lemma, reading)`;
  giới hạn 300 ký tự.
- Cache LRU 2 048 mục cho `entry`; `search` không cache (ai-service nhanh, backend đã có `TtlCache`).

### 4.3 Script dịch sẵn JLPT: `ai-service/scripts/translate_jlpt_vi.py`

- Đầu vào: `data/jlpt/n*.csv` (+ `jlpt_meaning_overrides.csv`), `jmdict.sqlite` (để lấy `id`); cần `GEMINI_API_KEY` (chỉ máy của
  người dùng). Khoá: `w:<id>` khi `(expression, reading)` khớp `word_forms`, không thì `w:jlpt:<expression>|<reading>`.
- Gọi `gemini.translate_dictionary` theo lô 40 (~200 lần gọi cho ~8 000 dòng), chạy lại được (bỏ qua khoá đã có trong file đầu ra),
  nghỉ 1 giây giữa lô, dừng sạch khi hết quota (ghi phần đã dịch).
- Đầu ra **commit**: `backend-core/src/main/resources/dict/jlpt_meaning_vi.csv` cột `entry_key,term,reading,level,meaning_vi,model,
  generated_at` (~1 MB). Nạp vào `dict_meanings` bởi `DictionarySeedLoader` (§6.3) với `status=MACHINE, source=SEED` → nằm trong hàng
  chờ admin sau nhóm bị báo cáo (D16).
- Prompt: nghĩa ngắn gọn ≤ 120 ký tự, nhiều nghĩa cách nhau bằng `; `, giữ từ loại ngầm (động từ "…"), không romaji, không giải thích;
  sau lô đầu người dùng xem 50 dòng mẫu rồi mới chạy hết.

### 4.4 API ai-service mới: `app/api/dict_router.py`, prefix `/api/dict` (đăng ký trong `main.py`)

| Method | Path | Vào | Ra | Lỗi |
|---|---|---|---|---|
| GET | `/dict/search` | `q` (≤ 64), `mode=ja\|en`, `limit` ≤ 50, `offset` ≤ 500 | `{items[], total}` (§4.2) | 400 `q` rỗng; 503 `dictUnavailable` |
| GET | `/dict/entries/{id}` | id `\d+` hoặc `jlpt:…` | mục đầy đủ (§4.2) | 404 |
| GET | `/dict/entries` | `ids` (≤ 50, phẩy) | `{items[]}` thiếu id nào bỏ qua | — |
| GET | `/dict/kanji/{ch}` | 1 chữ | `kanji_cards.card(ch)` + `meaningVi: null` (backend ghép) + `examplesWords` ≤ 10 từ chứa chữ (từ `word_forms`, common trước) | 404 |
| POST | `/dict/translate` | `{items: [{ref, kind: word\|kanji, forms: "食べる【たべる】", glossEn, pos[], examples: [{id, jpn, eng}] ≤ 5}], geminiModel?}` | `{items: [{ref, meaningVi, examples: [{id, vi}]}], model}` | 503 `no_api_key` / `quota` / `aiOverloaded` (mã như `/extract/enrich`) |
| POST | `/dict/tokenize` | `{text}` ≤ 300 ký tự | `{tokens[]}` | 400 |
| POST | `/dict/overrides` | `{version, items: [{key, field, subKey, value, hidden}]}` (toàn bộ, thay thế) | `{version, count}` | 400 trường lạ |
| GET | `/dict/overrides/version` | — | `{version}` | — |

Xác thực như mọi endpoint: header khoá `AI_SERVICE_KEY` (khi đặt). `/extract/health` thêm `dictWords`, `dictExamples`, `dictFts`,
`dictOverridesVersion`; backend `GET /api/admin/health` đưa vào `engines`.

### 4.5 `gemini.translate_dictionary(items, model)`

Cùng khung `translate_items` (JSON schema, lô 40, `resolve_model`, lỗi `GeminiError`): schema ra `[{ref, meaningVi, examples:
[{id, vi}]}]`; prompt nêu rõ: nghĩa từ điển ngắn gọn nhiều nghĩa cách `; `, dịch câu ví dụ tự nhiên, giữ nguyên `id`, không thêm chú
thích, không romaji. Test: `tests/test_gemini.py` thêm ca parse + ca thiếu trường.

### 4.6 `app/extract/overrides.py` (bản sao lớp 2)

- Store trong RAM `{(key, field, subKey): {value, hidden}}` + `version`; `load()` từ `data/dict_overrides.json` lúc khởi động;
  `replace(payload)` ghi file (atomic: ghi `.tmp` rồi `os.replace`).
- Hàm tra: `reading(term)`, `han_viet(char)`, `kanji_meaning(char)`, `gloss(wordId)`, `example(wordId, tatoebaId)` → `(jpn, eng,
  hidden)`.
- Điểm móc (mỗi điểm một test): `han_viet.han_viet` (ưu tiên override theo chữ trước `han_viet_overrides.csv`), `kanji_meanings.
  meaning`, `jmdict.lookup` (gloss), `dictionary.entry / search` (gloss, reading, ví dụ ẩn), `pipeline` (cách đọc của item khi có
  override cho `term`: ghi `reading` + dựng lại `readingSegments` bằng `furigana`), `conflicts` (override là tham chiếu `source=
  "admin:dict"` độ tin cậy 1.0, đứng trước nguồn tri thức chuẩn).

---

## 5. Luồng tra cứu

1. Người dùng gõ. Frontend quyết định `mode`: có kana / kanji → `ja`; chỉ Latin và công tắc "Romaji" bật (mặc định bật, nhớ ở
   `localStorage`) → chuyển `romajiToKanaFull` rồi `ja`; Latin có dấu tiếng Việt, hoặc công tắc tắt → gửi `q` thô, backend tìm **Việt**
   (DB) và **Anh** (ai-service) song song, kết quả Việt xếp trước.
2. `GET /api/dictionary/search?q=&mode=&page=` (backend): `TtlCache` 10 phút theo `(q, mode, page)` cho phần ai-service; ghép
   `meaningVi` ngắn từ `dict_meanings` (một truy vấn `IN`), áp override `reading` / `gloss`; trả `{items[], total, modeUsed}`.
3. Mở mục: `GET /api/dictionary/entries/{key}` → §6.4; ghi lịch sử (dedupe 1 giờ).
4. Tab Hán tự: giữ `/api/nlp/kanji-cards` cho thẻ, thêm `GET /api/dictionary/entries/k:<ch>` để lấy nghĩa Việt + bình luận + báo cáo.

---

## 6. Backend: schema V32, service, API người học

### 6.1 Migration `V32__dictionary.sql` (chỉ thêm, `IF NOT EXISTS`)

```sql
CREATE TABLE IF NOT EXISTS dict_meanings (
  entry_key    varchar(64) PRIMARY KEY,
  term         varchar(100), reading varchar(100),               -- để bóc tách tra theo (term, reading)
  meaning_vi   text NOT NULL,
  status       varchar(16) NOT NULL CHECK (status IN ('MACHINE','VERIFIED')),
  source       varchar(16) NOT NULL CHECK (source IN ('SEED','GEMINI','ADMIN')),
  model        varchar(40),
  created_at   timestamptz(6) NOT NULL DEFAULT now(), updated_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_by   bigint REFERENCES users(id), verified_at timestamptz(6), verified_by bigint REFERENCES users(id));
CREATE INDEX IF NOT EXISTS ix_dict_meanings_term ON dict_meanings(term, reading);
CREATE INDEX IF NOT EXISTS ix_dict_meanings_status ON dict_meanings(status);
-- tìm tiếng Việt: thử pg_trgm, thiếu thì bỏ qua (ILIKE vẫn chạy)
DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX IF NOT EXISTS ix_dict_meanings_vi_trgm ON dict_meanings USING gin (meaning_vi gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pg_trgm không có: %', SQLERRM; END $$;

CREATE TABLE IF NOT EXISTS dict_example_vi (
  entry_key varchar(64) NOT NULL, example_id varchar(32) NOT NULL,   -- tatoeba_id hoặc 'u:<sha1 12>' câu từ tài liệu
  text_vi text NOT NULL, status varchar(16) NOT NULL, source varchar(16) NOT NULL, model varchar(40),
  created_at timestamptz(6) NOT NULL DEFAULT now(), updated_at timestamptz(6) NOT NULL DEFAULT now(), updated_by bigint,
  PRIMARY KEY (entry_key, example_id));

CREATE TABLE IF NOT EXISTS dict_overrides (
  id bigserial PRIMARY KEY, entry_key varchar(64) NOT NULL,
  field varchar(24) NOT NULL CHECK (field IN ('reading','han_viet','meaning_en','kanji_meaning','example_jpn','example_eng','example_hidden')),
  sub_key varchar(32) NOT NULL DEFAULT '',                           -- example_*: tatoeba_id; han_viet: '' (khoá là k:<chữ>)
  value text, created_at timestamptz(6) NOT NULL DEFAULT now(), created_by bigint NOT NULL REFERENCES users(id),
  UNIQUE (entry_key, field, sub_key));

CREATE TABLE IF NOT EXISTS dict_edit_history (
  id bigserial PRIMARY KEY, entry_key varchar(64) NOT NULL, field varchar(24) NOT NULL, sub_key varchar(32) NOT NULL DEFAULT '',
  old_value text, new_value text, actor_id bigint NOT NULL REFERENCES users(id), report_id bigint, reason varchar(300),
  created_at timestamptz(6) NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS ix_dict_hist_entry ON dict_edit_history(entry_key, id DESC);

CREATE TABLE IF NOT EXISTS dict_comments (
  id bigserial PRIMARY KEY, entry_key varchar(64) NOT NULL, user_id bigint NOT NULL REFERENCES users(id),
  content varchar(1000) NOT NULL, helpful_count int NOT NULL DEFAULT 0,
  hidden_at timestamptz(6), hidden_by bigint, hidden_note varchar(300),
  created_at timestamptz(6) NOT NULL DEFAULT now(), updated_at timestamptz(6) NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS ix_dict_comments_entry ON dict_comments(entry_key, hidden_at, created_at DESC);
CREATE TABLE IF NOT EXISTS dict_comment_votes (
  comment_id bigint NOT NULL REFERENCES dict_comments(id) ON DELETE CASCADE, user_id bigint NOT NULL REFERENCES users(id),
  created_at timestamptz(6) NOT NULL DEFAULT now(), PRIMARY KEY (comment_id, user_id));

CREATE TABLE IF NOT EXISTS dict_reports (
  id bigserial PRIMARY KEY, kind varchar(8) NOT NULL CHECK (kind IN ('ENTRY','COMMENT')),
  entry_key varchar(64) NOT NULL, comment_id bigint REFERENCES dict_comments(id) ON DELETE SET NULL,
  field varchar(24), sub_key varchar(32), current_value text, proposed_value text,   -- ENTRY
  reason varchar(32), note varchar(1000),                                            -- COMMENT: reason; ENTRY: note
  reporter_id bigint NOT NULL REFERENCES users(id),
  status varchar(12) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED','DISMISSED')),
  action varchar(16), resolution_note varchar(500), resolved_by bigint, resolved_at timestamptz(6),
  created_at timestamptz(6) NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS ix_dict_reports_status ON dict_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_dict_reports_entry ON dict_reports(entry_key, status);

CREATE TABLE IF NOT EXISTS dict_favorites (
  user_id bigint NOT NULL REFERENCES users(id), entry_key varchar(64) NOT NULL, note varchar(300),
  created_at timestamptz(6) NOT NULL DEFAULT now(), PRIMARY KEY (user_id, entry_key));
CREATE TABLE IF NOT EXISTS dict_lookup_history (
  id bigserial PRIMARY KEY, user_id bigint NOT NULL REFERENCES users(id), entry_key varchar(64) NOT NULL,
  query varchar(64), created_at timestamptz(6) NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS ix_dict_history_user ON dict_lookup_history(user_id, created_at DESC);

INSERT INTO app_settings(key, value) VALUES ('dictionary_ai_hourly_limit', '30'), ('dictionary_examples_translate', '3')
  ON CONFLICT (key) DO NOTHING;   -- cột/định dạng theo V14
```

Trước khi chạy trên Supabase: `SELECT version FROM flyway_schema_history WHERE version >= '30'` không có V32 của nhánh khác (K9).

### 6.2 Entity / repository / service (Java)

- Entity: `DictMeaning`, `DictExampleVi`, `DictOverride`, `DictEditHistory`, `DictComment`, `DictCommentVote` (khoá gộp), `DictReport`,
  `DictFavorite` (khoá gộp), `DictLookupHistory` trong `model/`; repository tương ứng; DTO ở `dto/dictionary/`.
- `DictionaryKeys` (hàm thuần): parse / validate khoá; `DictionaryMerge` (hàm thuần): áp ghi đè + nghĩa Việt lên JSON gốc → `DictEntryResponse`.
- `DictionaryAiClient` (mẫu `QuizAiClient`): `search`, `entry`, `entries`, `kanji`, `translate` (`postJsonLong`, timeout 12 giây),
  `tokenize`, `pushOverrides`, `overridesVersion`; mã lỗi ai-service → `503` với message tiếng Việt (`apiErrorText` đã ưu tiên message).
- `DictionaryService`: `search`, `entry`, `kanji`, `tokenize`; `DictionaryTranslationService`: dịch lúc tra (§6.4), gộp lời gọi trùng
  (`ConcurrentHashMap<String, CompletableFuture>`), ghi `dict_meanings` / `dict_example_vi` (`ON CONFLICT DO NOTHING` qua native
  query); `DictionaryCommentService`; `DictionaryReportService`; `DictionaryNotebookService` (sổ tay + lịch sử, cắt 300);
  `AdminDictionaryService` (§8); `DictionaryOverridePublisher` (§9.1); `DictionarySeedLoader` (§6.3).
- `DictionaryRateLimiter` (`security/`): hai `AttemptLimiter`: **AI** (trần đọc từ `SettingsService.dictionaryAiHourlyLimit()` lúc
  kiểm → thêm cho `AttemptLimiter` phương thức `countIn(key)` hoặc lớp con nhận `IntSupplier`), **bình luận** 20 / giờ
  (`app.rate-limit.dict-comment.*`); báo cáo dùng `ReportRateLimiter` sẵn có (10 / giờ, đếm chung với báo cáo bộ thẻ, khoá `dict:<uid>`).
- `SettingsService`: `KEY_DICT_AI_LIMIT = "dictionary_ai_hourly_limit"` (0..1000, 0 = tắt dịch lúc tra), `KEY_DICT_EXAMPLES_TRANSLATE
  = "dictionary_examples_translate"` (0..10); `DEFAULTS` + validate như `KEY_LP_DAILY_CAP`.

### 6.3 `DictionarySeedLoader`

`@EventListener(ApplicationReadyEvent)` + `@Async`: đếm `dict_meanings WHERE source='SEED'`; nếu < số dòng CSV thì đọc
`classpath:dict/jlpt_meaning_vi.csv`, chèn lô 500 `ON CONFLICT (entry_key) DO NOTHING`; log số dòng thêm; profile `test` chạy với CSV
fixture 20 dòng. Không bao giờ ghi đè dòng đã có (admin sửa không bị mất).

### 6.4 API người học (`DictionaryController`, `/api/dictionary`, ROLE_USER)

| Method | Path | Vào | Ra / hành vi | Lỗi |
|---|---|---|---|---|
| GET | `/search` | `q` (1..64), `mode=ja\|en\|auto` (mặc định auto), `page` (0..25), `size` (≤ 50) | `{items: [{key, headKanji, headKana, reading, hanViet, glossShort, meaningVi, common, jlpt, nExamples}], total, modeUsed: ja\|en\|vi+en}`; `vi` tìm `dict_meanings.meaning_vi ILIKE %q%` (≤ 30) rồi lấy gốc theo lô `ids` | 400; 503 ai-service |
| GET | `/entries/{key}` | khoá §3 | `DictEntryResponse` (§6.5). Nếu thiếu `meaningVi` → dịch lúc tra (§6.6). Ghi lịch sử | 400 khoá sai; 404; 503 |
| POST | `/entries/{key}/translate-examples` | `{exampleIds[]}` ≤ 10 | dịch thêm ví dụ (mỗi lần gọi = 1 lượt hạn mức) → `{examples: [{id, vi}]}` | 429 hết trần; 503 |
| POST | `/tokenize` | `{text}` ≤ 300 | `{tokens: [{surface, lemma, reading, key\|null}]}` | 400 |
| GET | `/entries/{key}/comments` | `sort=helpful\|newest`, `page`, `size` ≤ 50 | `{items: [{id, userId, displayName, content, helpfulCount, votedByMe, mine, createdAt, updatedAt}], total}`; bình luận ẩn không trả (trừ của chính mình: trả kèm `hidden: true`) | — |
| POST | `/entries/{key}/comments` | `{content}` 1..1000 | 201 bình luận; giới hạn 20 / giờ; trần 200 bình luận chưa ẩn / người / ngày → 429 | 429 |
| PATCH | `/comments/{id}` | `{content}` | chỉ chủ; `updatedAt` đổi; bình luận đã ẩn → 409 | 403 / 404 / 409 |
| DELETE | `/comments/{id}` | — | chỉ chủ (xoá hẳn, votes cascade) | 403 / 404 |
| POST | `/comments/{id}/helpful` | — | bật / tắt (toggle), không tự vote mình (409); trả `{helpfulCount, votedByMe}` | 404 / 409 |
| POST | `/entries/{key}/reports` | `{field: reading\|han_viet\|meaning_vi\|meaning_en\|example\|example_vi\|other, subKey?, proposedValue? (≤ 1000), note (≤ 1000)}` — `han_viet` bắt buộc `subKey` = chữ; `example*` bắt buộc `subKey` = tatoeba_id; `other` bắt buộc `note` | 201; `current_value` server tự chụp lúc gửi; cùng người + cùng mục + cùng trường đang OPEN → 409 "Bạn đã báo lỗi này" | 409 / 429 |
| POST | `/comments/{id}/reports` | `{reason: SPAM\|OFFENSIVE\|WRONG\|OTHER, note?}` | 201; trùng OPEN → 409 | 409 / 429 |
| GET | `/reports/mine` | `page` | báo cáo từ điển của tôi (ghép vào tab "Báo cáo của tôi" mà `ac7dc9c` vừa thêm, nếu tab đó nhận nhiều nguồn; không thì mục riêng) | — |
| GET / PUT / DELETE | `/favorites/{key}` | PUT `{note?}` | sổ tay; PUT idempotent | 404 khoá |
| GET | `/favorites` | `q?`, `page`, `size` ≤ 50 | `{items: [{key, headKanji, headKana, meaningVi, glossShort, jlpt, note, createdAt}], total}` | — |
| GET | `/history` | `size` ≤ 100 | 100 mục gần nhất (dedupe theo khoá, mới nhất) | — |
| DELETE | `/history` | — | xoá hết của tôi | — |
| GET | `/stats` | — | `{aiLeft: n, aiLimit: n}` cho ô "còn n lượt dịch" | — |

Staff gọi `/api/dictionary/**` → 403 như mọi API học (D8); admin dùng `/api/admin/dictionary/**`.

### 6.5 `DictEntryResponse`

```json
{ "key": "w:1358280", "kind": "word",
  "forms": [{"text":"食べる","kana":false,"common":true}, {"text":"たべる","kana":true,"common":true}],
  "headKanji": "食べる", "headKana": "たべる", "reading": "たべる", "readingOverridden": false,
  "hanViet": "THỰC", "hanVietChars": [{"char":"食","reading":"THỰC"}], "jlpt": "N5", "common": true,
  "pitch": {"accentType": 2, "moras": ["た","べ","る"], "hl": ["L","H","L"]},
  "senses": [{"pos":["v1","vt"], "posLabels":["Động từ nhóm 2","Tha động từ"], "misc":[], "glossEn":["to eat"], "info":[]}],
  "meaningVi": "ăn; dùng bữa", "viState": "OK",            // OK | EN_ONLY | LIMIT | AI_DOWN  (frontend không hiện nhãn, chỉ chọn fallback)
  "examples": [{"id":"tatoeba:147000","jpn":"ご飯を食べる。","eng":"I eat rice.","vi":"Tôi ăn cơm.","hidden":false}],
  "userExamples": [{"id":"u:3f9c2a1b7d0e","jpn":"…","source":"Tài liệu: Minna 1", "vi": null}],   // từ sentence_mining, ≤ 3
  "kanjiChars": [{"char":"食","hanViet":"THỰC","meaningEn":"eat, food","meaningVi":"ăn, thức ăn"}],
  "relatedSameReading": [{"key":"w:…","headKanji":"…","glossShort":"…"}],   // jmdict.homophones ≤ 5
  "counts": {"comments": 12, "openReportsMine": 0}, "favorite": {"saved": true, "note": null},
  "aiLeft": 27 }
```

Với `k:<chữ>`: `kind: "kanji"`, thêm toàn bộ trường của `kanji_cards.card` (`on`, `kun`, `radical`, `strokeCount`) và
`exampleWords` (≤ 10 từ chứa chữ, mỗi từ có `meaningVi` nếu đã có), `meaningVi` dịch từ `meaningEn` cùng cơ chế.

### 6.6 Dịch lúc tra (`DictionaryTranslationService.ensure(entry, user)`)

1. Có dòng `dict_meanings` → dùng; ví dụ: lấy `dict_example_vi` theo `(key, tatoeba_id)`.
2. Thiếu nghĩa Việt (hoặc thiếu bản dịch của `n = dictionary_examples_translate` ví dụ đầu **và** nghĩa cũng thiếu — ví dụ không
   tự dịch khi nghĩa đã có, để tiết kiệm; người dùng bấm "Dịch ví dụ") → kiểm `DictionaryRateLimiter.ai` cho `uid`: quá trần →
   `viState=LIMIT`, không gọi; health cache (`AiServiceClient.healthBody`, 30 giây) báo `gemini=false` → `AI_DOWN`.
3. Gọi `/dict/translate` với `geminiModel = settings.aiModelPrimary()`; gộp lời gọi trùng theo khoá (người thứ hai chờ future, không
   tốn lượt); timeout 12 giây → `AI_DOWN` (không ghi), hết quota (`503 quota`) → `AI_DOWN` + log; thành công → ghi `source=GEMINI,
   status=MACHINE` (`ON CONFLICT DO NOTHING`) rồi đọc lại (nếu admin vừa ghi trước thì bản admin thắng).
4. Lượt hạn mức chỉ ghi nhận khi thực sự gọi Gemini (D26). `aiLeft` trả về trong response.
5. Nghĩa chữ Hán (`k:`) dịch cùng cách từ `meaningEn` của `kanji_meanings`.

---

## 7. Giao diện người học

### 7.1 Trang `/dictionary` (`pages/DictionaryPage.tsx`)

- Query: `tab=words|kanji|hanviet|notebook` (mặc định `words`), `q`, `k` (khoá mục đang mở), `sub=lookup|radicals` + `r` (tab Hán tự,
  giữ tham số cũ của `KanjiPage`), `r` (tab Hán-Việt). Đổi URL bằng `replace` khi gõ (như Nhật ký admin: chỉ lên URL khi gõ xong).
- Redirect giữ tham số: `/kanji?tab=radicals&r=5&k=食` → `/dictionary?tab=kanji&sub=radicals&r=5&k=食`; `/han-viet?r=thực` →
  `/dictionary?tab=hanviet&r=thực`; link trong `PracticeStatsTab` và sidebar đổi theo; `DashboardSidebar` gộp hai mục thành **"Từ
  Điển"** (icon `menu_book`) trong nhóm "Cộng Đồng & Khám Phá".
- Bố cục tab Từ vựng: ≥ 1024 px hai cột (trái: ô tìm + danh sách kết quả cuộn; phải: chi tiết mục); < 1024 px một cột, mở mục thì
  danh sách thu lại thành nút "← Kết quả"; 320–375 px không tràn ngang (kiểm như các trang khác).
- Thành phần (`features/dictionary/components/`): `DictSearchBar` (debounce 250 ms, công tắc Romaji, gợi ý 8 mục khi gõ ≥ 1 ký tự,
  Enter / ↑↓ chọn, xoá nhanh, dán kana), `DictResultList` (từ, cách đọc, nhãn JLPT, chấm "phổ biến", nghĩa Việt hoặc gloss Anh, phân
  trang "Tải thêm"), `DictEntryDetail` (đầu mục: từ + furigana, nút TTS `speechSynthesis` ja-JP, nút chép, Hán-Việt theo chữ (bấm →
  tab Hán tự), JLPT, trọng âm `DictPitch` (vẽ H/L theo mora, số kiểu); thân: nghĩa Việt (to), nghĩa Anh (nhỏ, có thể thu), từ loại
  (nhãn Việt từ `posLabels.ts`), `DictExampleList` (câu Nhật có từ in đậm, bản dịch Việt hoặc nút "Dịch ví dụ" nếu chưa có, "Dịch
  thêm" cho 5 câu kế), `userExamples` ("Từ tài liệu của bạn"), `DictKanjiChips`, `relatedSameReading`; hành động: "Thêm vào bộ thẻ",
  "Sổ tay" (bật / tắt + ghi chú), "Báo lỗi"), `DictComments` + `DictCommentForm` (sắp xếp Hữu ích / Mới nhất, sửa / xoá của mình, nút
  Hữu ích, "Báo cáo" bình luận, phân trang), `ReportEntryModal` (chọn trường → ô "Bản hiện tại" (chỉ đọc, server chụp lại) + "Đề xuất
  sửa" + "Ghi chú"; với Hán-Việt chọn chữ, với ví dụ chọn câu), `ReportCommentModal`, `AddEntryToDeckModal` (tổng quát hoá
  `AddWordToDeckModal` + `wordToCardDto`: term = headKanji hoặc headKana, reading, meaning = nghĩa Việt + dòng "VD: câu — dịch" cho ≤ 2
  ví dụ đã dịch, hanViet, level = jlpt, pos từ sense đầu (`v1`→`動詞`…); kiểm thẻ trùng như cũ), `NotebookTab` (hai phần: Sổ tay (tìm,
  sửa ghi chú, bỏ, "Tạo bộ thẻ từ N từ đã chọn" → tạo bộ mới qua `POST /api/decks` rồi `addCards`), Lịch sử (xoá hết)), `DictEmptyState`
  (chưa có dữ liệu từ điển / ai-service tắt: thông điệp + link cho admin).
- Trạng thái nghĩa Việt (D23): `viState=OK` hiện nghĩa Việt; `EN_ONLY | LIMIT | AI_DOWN` hiện gloss Anh ở vị trí nghĩa chính, **không
  nhãn**, riêng `LIMIT` hiện dòng nhỏ "Hết lượt dịch trong giờ này (còn 0/30)" ở khu ví dụ, không ở nghĩa.
- Mọi thao tác ghi qua `runOnce` (chống bấm đúp) và `apiErrorText`; xác nhận xoá bình luận qua `DialogProvider`.

### 7.2 Tab Hán tự và Hán-Việt

- `KanjiPage` → `features/dictionary/components/KanjiTabPanel.tsx` (chứa `KanjiLookupTab`, `RadicalsTab` nguyên vẹn, sub-tab
  `lookup|radicals`), thêm dưới thẻ chữ: nghĩa Việt của chữ (từ `/entries/k:<ch>`), `exampleWords`, `DictComments` và nút "Báo lỗi"
  (field `han_viet`, `kanji_meaning`, `other`).
- `HanVietMapPage` → `HanVietTabPanel.tsx` nguyên vẹn; `HanVietWordList` thêm nút "Mở trong từ điển" (khoá `w:` từ `/search?mode=ja`).

### 7.3 Tra nhanh (popup) — `DictPopover` + `useQuickLookup`

- Nội dung: từ, cách đọc, Hán-Việt, nghĩa Việt (hoặc Anh), JLPT, nút "Mở trang", "Sổ tay"; tải bằng `/search?mode=ja&q=<lemma>` lấy
  mục đầu rồi `/entries/{key}` (dịch lúc tra áp dụng, có trần).
- Gắn ở: (1) `StudyPage`: một nút icon "Tra từ điển" cạnh thuật ngữ mặt trước / sau (một thành phần `StudyDictButton` nhỏ, không
  đổi logic lật / chấm — tránh đụng `ac7dc9c`); (2) câu ví dụ trong `DictEntryDetail`: câu được `tokenize`, mỗi token có `key` là nút
  bấm mở popover; (3) `ExtractionPage` item: nút nhỏ cạnh term (tuỳ chọn, làm cuối).
- Đóng bằng Esc / bấm ngoài; `role="dialog"`, focus vào popover; ở màn hẹp hiện dạng bottom sheet.

### 7.4 Trang ghi nguồn `/about/data` (`pages/DataSourcesPage.tsx`)

Bảng: JMdict / EDRDG (CC BY-SA 4.0), Tatoeba (CC BY 2.0 FR), KanjiVG / Ulrich Apel (CC BY-SA 3.0), KRADFILE / EDRDG, kanjium (CC
BY-SA 4.0), Unihan (Unicode License), danh sách JLPT tanos.co.uk (CC BY 4.0), SudachiDict (Apache-2.0), wordfreq; nội dung lấy từ
`data/README.md`. Link ở chân `DictionaryPage`, `KanjiTabPanel`, trang luyện viết; tuyến công khai không cần đăng nhập (chỉ trang tĩnh,
thêm vào `AuthLayout` hoặc layout trống).

### 7.5 Thông báo trong app

`notificationService.ts`: `DICT_REPORT_RESOLVED` → "Báo lỗi từ điển «食べる» đã được xử lý: áp dụng đề xuất của bạn" (link
`/dictionary?tab=words&k=w:…`); `DICT_COMMENT_HIDDEN` → link mục.

---

## 8. Admin

### 8.1 `/admin/dictionary` (`pages/admin/AdminDictionaryPage.tsx`, menu "Từ điển", badge `openDictReports`)

Tab **Hàng chờ** (mặc định, D16): một danh sách phân trang, mỗi dòng: từ / chữ, cách đọc, nghĩa hiện tại (Việt hoặc Anh), nhóm, số báo
cáo mở, lượt tra 30 ngày, cập nhật cuối. Thứ tự nhóm:
1. **Bị báo cáo** (có `dict_reports` OPEN kind ENTRY) — nhiều báo cáo hơn trước, mới hơn trước;
2. **Chỉ có nghĩa Anh** — khoá có trong `dict_lookup_history` 30 ngày (hoặc trong sổ tay) mà không có `dict_meanings` (dịch thất bại /
   hết trần / không khoá) — lượt tra nhiều trước;
3. **Nghĩa máy chưa kiểm** — `dict_meanings.status=MACHINE` (SEED và GEMINI) — lượt tra nhiều trước, rồi JLPT dễ trước;
4. (tab "Tất cả" mới hiện) đã kiểm.
Bộ lọc: nhóm, cấp JLPT, loại (từ / chữ), ô tìm; mỗi dòng mở **ngăn sửa** (`DictEntryEditor`).

Tab **Tìm & sửa**: ô tìm như người học (gọi `/api/admin/dictionary/search`), mở ngăn sửa.

**Ngăn sửa `DictEntryEditor`** (drawer phải, 1280 px; trang riêng `/admin/dictionary/e/:key` ở màn hẹp):
- Đầu: từ, cách đọc gốc, Hán-Việt theo chữ (mỗi chữ sửa được → ghi `k:<chữ>/han_viet`), JLPT, số lượt tra, link mở trang người học
  (admin không có quyền USER nên là link chỉ đọc qua endpoint admin — hiển thị trong chính ngăn).
- Khối **Nghĩa tiếng Việt**: ô text, trạng thái (chưa kiểm / đã kiểm, nguồn, model, ai sửa khi nào), nút "Lưu" (→ `source=ADMIN,
  status=VERIFIED`), nút "Xác nhận đúng" (chỉ đổi status, không đổi chữ), nút "Dịch lại bằng AI" (gọi Gemini, không tính trần người
  học, ghi MACHINE).
- Khối **Gốc có thể ghi đè**: cách đọc, nghĩa Anh (gloss), nghĩa chữ (với `k:`); mỗi ô hiện "gốc: …" và ô ghi đè, nút "Bỏ ghi đè".
- Khối **Ví dụ**: bảng câu Nhật / Anh / Việt; sửa Việt (lưu `dict_example_vi` ADMIN), sửa Nhật / Anh (override), ẩn / hiện, "Dịch
  bằng AI" từng câu.
- Khối **Báo cáo đang mở** của mục: mỗi báo cáo hiện trường, bản lúc gửi, đề xuất, ghi chú, người gửi; nút **Áp dụng đề xuất** (ghi
  giá trị đề xuất vào đúng trường + RESOLVED `APPLIED` + thông báo), **Đã sửa tay** (RESOLVED `EDITED`), **Từ chối** (DISMISSED + ghi
  chú bắt buộc).
- Khối **Lịch sử**: dòng thời gian `dict_edit_history` (trường, cũ → mới, ai, lúc nào, lý do, báo cáo liên quan), nút **Hoàn tác** từng
  dòng (ghi dòng lịch sử mới, không xoá lịch sử).
- Khối **Bình luận** của mục (ẩn / hiện / xoá).

Tab **Bình luận**: toàn bộ bình luận từ điển (tìm theo nội dung / người, lọc ẩn), ẩn có ghi chú (thông báo tác giả), hiện lại, xoá.
Tab **Lịch sử**: toàn bộ `dict_edit_history` (lọc người sửa, trường, khoảng ngày), link mở ngăn sửa.

### 8.2 Tab "Từ điển" trong `/admin/reports`

`AdminStatusTabs` cấp 1: **Bộ thẻ | Từ điển** (giữ nguyên tab Bộ thẻ); cấp 2 theo trạng thái OPEN / RESOLVED / DISMISSED. Danh sách
báo cáo từ điển: loại (mục / bình luận), từ, trường, đề xuất rút gọn, người gửi, lúc gửi; hành động: **Áp dụng đề xuất** (chỉ ENTRY có
`proposed_value`), **Mở ngăn sửa**, **Từ chối**; với COMMENT: **Ẩn bình luận** (RESOLVED `COMMENT_HIDDEN`), **Xoá bình luận**
(`COMMENT_DELETED`), **Bỏ qua**. Modal `ResolveDictReportModal` hiện bản hiện tại (server đọc lại lúc mở, có thể khác bản lúc gửi →
cảnh báo "mục đã đổi sau khi báo cáo") cạnh đề xuất.

### 8.3 API admin (`AdminDictionaryController`, `/api/admin/dictionary`, ROLE_ADMIN; `@PreAuthorize` không cần SUPER_ADMIN, D21)

| Method | Path | Ghi chú |
|---|---|---|
| GET | `/queue` | `group=reported\|en_only\|machine\|all`, `level`, `kind=word\|kanji`, `q`, `page`, `size` ≤ 50 → `AdminPage<DictQueueRow>` (§8.1); đếm `lookups30d` bằng `dict_lookup_history`; xếp nhóm bằng một native query `UNION ALL` + `ORDER BY group_rank, score DESC` |
| GET | `/search` | như `/api/dictionary/search` nhưng cho staff (không ghi lịch sử, không dịch lúc tra) |
| GET | `/entries/{key}` | gốc + lớp 2 + lớp 3 + lịch sử (50 dòng) + báo cáo OPEN + 20 bình luận mới |
| PUT | `/entries/{key}/meaning-vi` | `{value, reason?}` → `dict_meanings` ADMIN / VERIFIED; audit `DICT_EDIT`; lịch sử |
| POST | `/entries/{key}/verify` | status → VERIFIED (audit `DICT_VERIFY`) |
| POST | `/entries/{key}/retranslate` | gọi Gemini (không trần người học, `AiRateLimiter.checkDeckAi` để chống spam 20 / giờ), ghi MACHINE nếu chưa VERIFIED, trả bản mới |
| PUT | `/entries/{key}/overrides` | `{field, subKey, value\|null, reason?}` (null = bỏ ghi đè) → `dict_overrides` + lịch sử + audit + đẩy ai-service |
| PUT | `/entries/{key}/examples/{exampleId}/vi` | `{value}` → `dict_example_vi` ADMIN |
| POST | `/entries/{key}/revert/{historyId}` | ghi lại giá trị `old_value` của dòng đó bằng cùng cơ chế (sinh dòng lịch sử mới, audit `DICT_REVERT`) |
| GET | `/reports` | `kind`, `status`, `q`, `page` → `AdminPage<DictReportRow>` |
| POST | `/reports/{id}/apply` | chỉ ENTRY + `proposed_value` + `field ≠ other`; ghi vào đúng lớp (meaning_vi → lớp 3; reading / han_viet / meaning_en / example_* → lớp 2) với `report_id`; RESOLVED `APPLIED`; thông báo `DICT_REPORT_RESOLVED {action: APPLIED}`; audit `DICT_REPORT_APPLY`; báo cáo không OPEN → 409 |
| POST | `/reports/{id}/resolve` | `{note?}` → RESOLVED `EDITED` (ENTRY) / `COMMENT_HIDDEN` / `COMMENT_DELETED` (COMMENT, server làm luôn việc ẩn / xoá) |
| POST | `/reports/{id}/dismiss` | `{note}` bắt buộc → DISMISSED; thông báo người gửi |
| GET | `/comments` | `q`, `hidden`, `page` |
| POST | `/comments/{id}/hide` `{note}` · `/unhide` · DELETE `/comments/{id}` | thông báo `DICT_COMMENT_HIDDEN` khi ẩn |
| GET | `/history` | lọc `actor`, `field`, `from`, `to`, `page` |
| POST | `/sync-ai` | đẩy ghi đè ngay + trả `{backendVersion, aiVersion}` (nút "Đồng bộ ai-service" ở trang Cấu hình / Tổng quan) |

`AdminStatsResponse` thêm `openDictReports`, `dict {entriesVi, verified, machine, lookups7d, comments7d, openReports}`; `AdminLayout`
badge `openDictReports` (`QueueKey` thêm), thẻ `StatCard` "Từ điển" ở Tổng quan; `AdminAuditPage` nhãn target `DICTIONARY`;
`AdminAuthorizationIT` ma trận thêm mọi endpoint trên (USER → 403, ADMIN → 2xx/4xx nghiệp vụ, SUPER_ADMIN như ADMIN).

---

## 9. Áp dụng toàn hệ thống (D22)

### 9.1 Đẩy ghi đè sang ai-service — `DictionaryOverridePublisher`
- Khi nào: `ApplicationReadyEvent` (sau `failOrphans`), `@TransactionalEventListener(AFTER_COMMIT)` của `DictOverrideChangedEvent`,
  `@Scheduled(fixedDelay = 10 phút)`; `POST /admin/dictionary/sync-ai`.
- Gửi gì: toàn bộ `dict_overrides` (chỉ lớp 2, nhỏ) + `version = max(dict_edit_history.id)`; ai-service bỏ qua nếu cùng version.
  Không gửi lớp 3 (nghĩa Việt) — bóc tách lấy lớp 3 ở backend (§9.3).
- Lỗi ai-service: log cảnh báo một lần / 10 phút, không ném lên admin (lần đẩy kế tiếp sẽ bù); `GET /api/admin/health` hiện
  `dictOverridesVersion` của ai-service cạnh version backend, lệch → cảnh báo vàng + nút đồng bộ.

### 9.2 ai-service dùng ghi đè ở đâu (mỗi điểm một test, §4.6)
Hán-Việt của chữ (thẻ chữ Hán C5, thẻ bộ thủ C4, mẹo nhớ, bản đồ Hán-Việt, item bóc tách `hanViet`), nghĩa chữ (C4 / C5), gloss EN
của từ (`jmdict.lookup` → `meaningEn` của item bóc tách, câu i+1), cách đọc của từ (item bóc tách: `reading` + `readingSegments`),
ví dụ ẩn / sửa (từ điển), tham chiếu mâu thuẫn (`conflicts`: `source="admin:dict"`, độ tin cậy 1.0).

### 9.3 Bóc tách dùng nghĩa Việt của từ điển
- `/extract/analyze` trả thêm `dictKey` cho item khớp JMdict (`w:<id>`), `null` nếu không.
- `ExtractionWorker.enrich`: trước khi gọi `ai.enrich`, tra `dict_meanings` theo `dictKey` (lô `IN`): có → gán `meaningVi` ngay, loại
  khỏi `inputs`; sau khi Gemini trả, ghi lại `dict_meanings (source=GEMINI, status=MACHINE)` cho item có `dictKey` (`ON CONFLICT DO
  NOTHING`). Thống kê `enrich` thêm `fromDictionary` (số item lấy từ từ điển) → `AdminStatsResponse.Ai.Enrich.fromDictionary`.
- "Dịch lại nghĩa" (lộ trình / bóc tách) giữ hành vi cũ nhưng cũng qua bước tra từ điển trước.
- Mẹo nhớ, câu i+1: không đổi.

---

## 10. Thông báo, audit, cấu hình, giới hạn

| Loại | Giá trị |
|---|---|
| Thông báo mới (`model/Notification.java`) | `DICT_REPORT_RESOLVED {reportId, entryKey, term, action, note}`, `DICT_COMMENT_HIDDEN {commentId, entryKey, term, note}` |
| Audit target `DICTIONARY` | `DICT_EDIT`, `DICT_VERIFY`, `DICT_RETRANSLATE`, `DICT_REVERT`, `DICT_REPORT_APPLY`, `DICT_REPORT_RESOLVE`, `DICT_REPORT_DISMISS`, `DICT_COMMENT_HIDE`, `DICT_COMMENT_UNHIDE`, `DICT_COMMENT_DELETE`, `DICT_SYNC_AI`; `targetId = entry_key` (hoặc `comment:<id>`, `report:<id>`), `detail` có `field`, `old`, `new` (cắt 500 ký tự) |
| `app_settings` | `dictionary_ai_hourly_limit` (30; 0 = tắt dịch lúc tra), `dictionary_examples_translate` (3; 0..10); trang Cấu hình nhóm "Từ điển" |
| Giới hạn | AI: trần theo giờ / người (settings); bình luận 20 / giờ; báo cáo dùng `ReportRateLimiter` 10 / giờ; `retranslate` admin qua `AiRateLimiter.deckAi`; tokenize 60 / phút / người (`AttemptLimiter`) |
| Kích thước | bình luận ≤ 1 000 ký tự; đề xuất sửa ≤ 1 000; ghi chú sổ tay ≤ 300; lịch sử ≤ 300 mục / người; `q` ≤ 64 |

---

## 11. Bảo mật, riêng tư

- Mọi `/api/dictionary/**` cần `ROLE_USER` (staff 403); `/api/admin/dictionary/**` cần `ROLE_ADMIN`.
- Bình luận là văn bản thuần: React escape mặc định, không render HTML / markdown; link không tự bấm được (hiện chữ).
- Không lộ email: bình luận trả `displayName` (tên hiển thị hoặc phần trước `@` đã che như Thư viện đang làm — dùng chung hàm).
- Khoá mục validate bằng regex trước khi tới ai-service; `q` cắt 64 ký tự; ai-service kiểm độ dài lần nữa.
- Khoá Gemini chỉ ở ai-service; backend không bao giờ nhận prompt từ client (trường dịch do server dựng từ dữ liệu gốc).
- Tài khoản đã xoá / khoá: bình luận giữ nguyên nhưng `displayName` = "Người dùng đã xoá"; không thể vote / bình luận (filter JWT đã chặn).
- Audit mọi thao tác ghi của admin; người học không có audit (giữ như bộ thẻ).

---

## 12. Hiệu năng, cache

- Backend `TtlCache` 10 phút / 2 000 mục cho `search` (phần ai-service) và `entry` gốc; lớp 2–4 đọc DB mỗi lần (rẻ, theo khoá).
- Ước lượng tải Supabase: mỗi lần mở mục ≈ 5 truy vấn theo khoá + 1 insert lịch sử; cắt lịch sử bằng `DELETE … WHERE id NOT IN (SELECT
  id … ORDER BY id DESC LIMIT 300)` chỉ khi `count > 330` (đếm cache trong RAM theo user 5 phút).
- ai-service: `search` dùng index `word_forms(form)` và FTS; `entry` LRU 2 048; `words.senses` parse JSON mỗi lần (nhỏ).
- Frontend: debounce tìm 250 ms; huỷ request cũ (`AbortController`); danh sách kết quả 20 mục / trang.
- Gemini: tối đa 1 lời gọi / mục / lần đầu + gộp trùng; trần theo giờ; `retranslate` admin có trần riêng.

---

## 13. Kiểm thử (ma trận)

| Tầng | Test | Phủ gì |
|---|---|---|
| ai-service | `tests/test_build_dicts_dict.py` (fixture JSON 6 mục, có ví dụ, có `appliesToKanji`, một mục JLPT không có JMdict) | dựng `words / word_forms / fts / examples / entries(id)`; thiếu FTS5 → bảng thường |
| ai-service | `tests/test_dictionary.py` | `search` ja chính xác / tiền tố / kana-katakana / xếp common; `en` FTS; `entry` có pitch / hanVietChars / examples; `entries` lô; `tokenize` |
| ai-service | `tests/test_overrides.py` | `replace` + file; từng điểm móc §4.6 (han_viet, kanji_meanings, jmdict.lookup, pipeline reading, conflicts) |
| ai-service | `tests/test_dict_router.py` | mã lỗi 400 / 404 / 503; `/dict/translate` với Gemini giả (monkeypatch) + schema; `health` cờ mới |
| ai-service | `tests/test_gemini.py` | `translate_dictionary` parse, lô, lỗi |
| backend | `DictionaryIT` | search gộp (nghĩa Việt + override), `modeUsed`, entry đầy đủ, dịch lúc tra với ai-service giả (MockRestServiceServer như `AiServiceClient*Test`): OK / LIMIT (429 không, chỉ `viState`) / AI_DOWN / gộp trùng; lịch sử ghi + dedupe + cắt 300; sổ tay; staff 403 |
| backend | `DictionaryCommentIT` | đăng / sửa / xoá / vote toggle / không tự vote / 20 giờ / ẩn thì không thấy (trừ chủ) / `displayName` không lộ email |
| backend | `DictionaryReportIT` | tạo báo cáo mỗi loại trường, bắt buộc subKey, chụp `current_value`, trùng 409, limiter; admin apply → đúng lớp + lịch sử + thông báo + audit; resolve / dismiss; COMMENT → ẩn / xoá |
| backend | `AdminDictionaryIT` | **thứ tự hàng chờ** (reported → en_only → machine → verified, điểm trong nhóm), lọc; sửa nghĩa Việt / verify / override / bỏ override / revert; retranslate; publisher gọi ai-service sau commit (mock) + version; `sync-ai`; stats |
| backend | `AdminAuthorizationIT` | ma trận quyền mọi endpoint mới |
| backend | `ExtractionIT` (mở rộng) | enrich lấy nghĩa từ `dict_meanings` trước, ghi lại sau; thống kê `fromDictionary` |
| backend | `DictionaryKeysTest`, `DictionaryMergeTest`, `DictionaryRateLimiterTest`, `DictionarySeedLoaderTest` | hàm thuần, seed idempotent, trần đổi lúc chạy |
| backend | `MigrationUpgradePathTest` | không đổi (V32 chỉ thêm); `V32` chạy trên DB rỗng ở mọi IT |
| frontend | `scripts/selfcheck/dictionary.ts` | tìm (ja / romaji / vi) → mở mục → thêm bộ thẻ (kiểm thẻ trùng) → sổ tay → bình luận + vote + sửa + xoá → báo lỗi (trùng 409) → lịch sử; admin: hàng chờ thứ tự, apply, revert, tab Từ điển ở Báo cáo; redirect `/kanji` `/han-viet` giữ tham số; `posLabels` phủ tag hay gặp |
| frontend | lint + build | như CI |
| Kiểm tay (người dùng, §8a.1 kiểu cũ) | Gemini thật: dịch lúc tra, trần; script dịch sẵn 50 dòng mẫu; TTS; 320 / 375 / 768 / 1024 / 1280 px; Edge | — |

---

## 14. Rủi ro và cách giảm

| Rủi ro | Giảm |
|---|---|
| File JMdict đầy đủ ~100 MB, dựng 2–4 phút, mỗi máy nhóm phải tải 70 MB | Cờ `--dict-scope`; README ghi rõ; thiếu file thì từ điển hiện trạng thái "chưa có dữ liệu", phần còn lại của app không ảnh hưởng (bảng `entries` cũ vẫn dựng cùng lệnh) |
| Tên trường `examples` của bản jmdict-examples khác giả định | Bước đầu task build: in cấu trúc một mục rồi mới viết parser; test fixture chép từ file thật |
| Gemini hết quota vì người học tra nhiều | Trần theo giờ (D26), gộp trùng, dịch sẵn JLPT, bóc tách tái dùng nghĩa (giảm gọi), cờ `dictionary_ai_hourly_limit=0` tắt được ngay |
| Nghĩa máy sai mà không có nhãn (D23) | Nút báo lỗi ngay cạnh nghĩa; hàng chờ admin xếp nghĩa máy; thống kê lượt tra giúp ưu tiên kiểm từ hay dùng |
| Đụng code đồng đội (`ac7dc9c`: study, api.types, notificationService) | Pull trước khi code; màn học chỉ thêm một nút; `api.types.ts` thêm khối riêng cuối file; thông báo thêm 2 case |
| Supabase dùng chung: bảng lịch sử / bình luận tăng | Cắt 300 / người; index theo user; không có job quét toàn bảng |
| FTS5 không có trong sqlite của Python máy nào đó | Fallback bảng thường + LIKE, health `dictFts=false` |
| ai-service khởi động lại mất ghi đè | `data/dict_overrides.json` + đẩy định kỳ 10 phút + nút đồng bộ |
| Giấy phép CC BY-SA khi hiện nguyên văn JMdict / Tatoeba | Trang `/about/data` cùng đợt (K10), link từ chân trang từ điển |
| Hai admin sửa cùng mục | Ghi sau thắng, lịch sử có cả hai, hoàn tác được; ngăn sửa cảnh báo khi `updated_at` đổi so với lúc mở (so sánh ETag đơn giản) |

---

## 15. Thay đổi tài liệu kèm theo

- `USE_CASES_CHECKLIST.md`: phân hệ 8 "Từ điển cộng đồng": UC-43 Tra từ điển Nhật–Việt (từ, Hán tự, Hán-Việt, ví dụ, sổ tay, tra
  nhanh), UC-44 Bình luận chia sẻ kiến thức dưới mục từ, UC-45 Báo lỗi từ điển và admin sửa từ điển gốc — `[ ]` tới khi xong.
- `CODEBASE_MAP.md`: dòng "Từ điển" (backend / ai-service / frontend / test); dòng "Tra cứu chữ Hán" đổi route.
- `ARCHITECTURE.md`: sơ đồ bốn lớp §2; `EXTRACTION.md`: bước enrich lấy nghĩa từ từ điển; `data/README.md`: JMdict đầy đủ + Tatoeba.
- `CHANGELOG.md` mục mới khi xong; `Plan/README.md` dòng spec / plan này; `quyet-dinh-da-chot.md` đã thêm D14–D29 (26/10).
- `README.md` mục chạy: `--only jmdict` tải bản đầy đủ; script dịch sẵn (chỉ người có khoá); trang `/about/data`.
