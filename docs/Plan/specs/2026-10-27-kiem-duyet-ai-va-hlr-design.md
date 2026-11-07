# Thiết kế: Kiểm duyệt bình luận bằng AI (ViHSD + ViHOS) và mô hình trí nhớ HLR trong ôn tập

27/10/2026 (đêm), nhánh `tudien`. **Trạng thái: đã làm** (code + test ai-service / backend / frontend / smoke đêm 27/10; chưa kiểm tay trên trình duyệt với ai-service thật; grill-me 5 vòng, 16 câu, xem §13; từ câu 16 người dùng giao quyền tự quyết).
Kế hoạch: [../plans/2026-10-27-kiem-duyet-ai-va-hlr.md](../plans/2026-10-27-kiem-duyet-ai-va-hlr.md).

## 1. Mục tiêu và phạm vi

Nhóm tự huấn luyện ba model (notebook `halflife-regression-4.ipynb`, `vihos.ipynb`, `vihsd.ipynb`) và muốn đưa vào sản phẩm:

1. **Kiểm duyệt văn bản người dùng viết** bằng hai model tiếng Việt: phân lớp cả câu (ViHSD, 3 nhãn 0 sạch / 1 xúc phạm / 2 thù ghét) và
   đánh dấu **từ nào vi phạm** (ViHOS, PhoBERT gán nhãn token). Áp dụng cho bình luận từ điển (từ vựng `w:` và chữ Hán `k:`), bình luận
   đánh giá bộ thẻ, mẹo nhớ kanji do người dùng viết (chỉ gắn nhãn cho admin) và tên hiển thị hồ sơ (từ chối lưu).
2. **Mô hình trí nhớ nửa đời (HLR)** trong lịch ôn tập: dự đoán xác suất còn nhớ của từng thẻ từ số lần học / đúng và khoảng cách thời
   gian; dùng để "phanh" SM-2, xếp thẻ sắp quên lên trước, hiện độ nhớ và tín hiệu "sắp quên".

Không làm: kiểm duyệt khiếu nại / cờ câu hỏi (chỉ admin đọc), tự động khoá tài khoản, dịch vụ kiểm duyệt bên ngoài, GPU.

## 2. Model và số liệu đã kiểm (27/10, Python 3.12 + torch 2.5 / TF 2.21 trên laptop RTX 3060, suy luận CPU)

| File (đưa vào `ai-service/models/`, không commit) | Thực chất | Số liệu |
|---|---|---|
| `phobert_hatespeech_best.pt` (540 MB) | ViHOS **đánh dấu từ**: `phobert-base` + Linear(768→3), nhãn O / B-T / I-T, giải mã `t_score = P(B)+P(I) ≥ 0,5` (notebook thử 0,35–0,55, kết quả giống nhau trên câu mẫu) | dev F1 thực thể 0,57, độ chính xác token 0,88; CPU 4 luồng ≈ 80 ms/câu, +400 MB RAM; int8 động nhanh hơn 30 % nhưng lệch 1/11 câu → mặc định fp32 |
| `hatespeech_model.pt` (28 MB) | ViHSD **3 lớp**, 43 mảng trọng số Keras (CNN 4 tầng + BiLSTM 2 tầng) — nhưng là **epoch cuối (30)**: val 0,836, val-loss 1,63 (quá khớp). Mô tả ban đầu của hai file bị **đảo ngược** | Dùng checkpoint tốt nhất `best_model_12-0.85.keras` (val 0,847): test **0,8437** (notebook 0,8443); recall nhãn 1 chỉ 0,26, nhãn 2 chỉ 0,37; **1/4 câu bị đoán "thù ghét" thật ra sạch** → không được chặn cứng theo nhãn |
| `best-halflife-portable.pt` (2 MB) | HLR "portable logistic": MLP 4→256→128→2 trên (√(1+đúng), √(1+sai), log1p(đã học), (đúng+1)/(đã học+2)) chuẩn hoá; đường cong `p = σ(o0 − a·log1p(Δ))`, hiệu chỉnh isotonic 221 điểm, ngưỡng Quên/Nhớ 0,8235 | test LogLoss 0,3262 (baseline 0,3342), ROC-AUC trong bundle. **Đường cong gần phẳng theo thời gian** (a ≈ 0,12: p giảm ~0,08 sau 9 tháng) nên "khoảng ôn để p về 0,9" suy biến (10 đúng 8 → 0 ngày; 3/3 → 6; 30/29 → 30; mục tiêu 0,85 → 4, 0,8 → 95 ngày) |

Tokenizer Keras của ViHSD **không được notebook lưu**; hai file `tokenizer*.pickle` trong `D:\University\Train\vihsd\tokenizer` thuộc pipeline
khác (không có `<OOV>`, fit trên dữ liệu thô) và cho kết quả sai. Đã **dựng lại đúng** bằng cách chạy lại tiền xử lý của notebook trên
`train.csv` (pyvi → demojize → bỏ URL → thường → bỏ dấu câu trừ `_` → bỏ stopword `vietnamese-stopwords-dash.txt` trừ 5 từ phủ định →
bỏ chữ số) và `Tokenizer(num_words=500000, oov_token='<OOV>')`: 9 425 từ; độ chính xác trên `test.csv` 0,8437 chứng minh khớp. Lưu ý bộ
lọc mặc định của Keras Tokenizer **có `_`** nên từ ghép của pyvi bị tách lại thành âm tiết lúc tra chỉ số — bản numpy làm y hệt.

Trọng số epoch 12 xuất sang `models/vihsd_cnn_lstm.npz` (26 MB) và chạy lại bằng **numpy** (`app/moderation/vihsd.py`, đối chiếu xác
suất với Keras trên 6 584 câu test, xem test) → model 3 lớp không cần TensorFlow lẫn torch. HLR xuất sang JSON (`app/hlr/data/hlr_portable.json`,
0,7 MB, commit) và chạy numpy (`app/hlr/model.py`, đối chiếu với torch qua `tests/fixtures/hlr_reference.json`). Chỉ PhoBERT cần torch +
transformers (`requirements-ml.txt`, tuỳ chọn): thiếu thì hệ thống chạy với model 3 lớp, không có từ đánh dấu.

## 3. Kiến trúc

```
người học ──POST bình luận──▶ backend ModerationService ──POST /api/moderation/check──▶ ai-service
                              │  (đồng bộ, timeout 3 s)      {items:[{ref,text}]}        preprocess → vihsd (numpy) → nhãn + p
                              │                                                           pyvi → vihos (PhoBERT) → từ vi phạm
                              │◀─ {label, probs, spans} ────────────────────────────────┘
                              ├─ ModerationPolicy (Java thuần): CLEAN | FLAGGED | BLOCKED (có xét "mục nhạy cảm")
                              ├─ ghi mod_* vào dòng bình luận; BLOCKED → chỉ chủ thấy; FLAGGED → người khác thấy bản che từ
                              ├─ ai-service lỗi → mod_status PENDING, ModerationRescanJob quét lại mỗi 5 phút
                              └─ admin: /admin/moderation (hàng chờ FLAGGED / BLOCKED / PENDING, bỏ qua / ẩn / khôi phục / xoá)

chấm thẻ ──POST /api/reviews──▶ ReviewService.apply: SM-2 như cũ ──▶ HlrClient (POST /api/hlr/predict, timeout 1,5 s)
                                 p < 0,8235 ("Quên") → khoảng ôn không tăng (phanh); ghi recall_p, seen, correct, last_reviewed_at
```

ai-service là nơi duy nhất nạp model; backend không có numpy / torch. Mọi lời gọi mang `X-Internal-Key` như các router khác.

## 4. Quy tắc quyết định (backend `ModerationPolicy`, hàm thuần có unit test)

Đầu vào: `label` (0/1/2), `probs[3]`, `spans` (từ + điểm `t_score`), `sensitive` (mục từ nhạy cảm, chỉ có với bình luận từ điển).

| Điều kiện | Kết quả | Ghi chú |
|---|---|---|
| `label = 2` và `p2 ≥ 0,8` và có ≥ 1 từ đánh dấu (`t_score ≥ 0,5`) và **không** nhạy cảm | **BLOCKED** | hai model cùng đồng ý mới chặn (giảm chặn oan) |
| như trên nhưng mục từ **nhạy cảm** | **FLAGGED** | từ tục / miệt thị là chủ đề của mục từ → đăng nhưng admin xem lại |
| `label = 2` (p2 < 0,8 hoặc không có từ đánh dấu) hoặc `label = 1` | **FLAGGED** | nhãn 1 yếu (recall 0,26) nên không chặn |
| `label = 0` nhưng có từ đánh dấu `t_score ≥ 0,9` | **FLAGGED** | PhoBERT bắt từ tục tốt hơn model câu |
| còn lại | **CLEAN** | |
| ai-service lỗi / quá 3 s / thiếu model | **PENDING** | đăng tạm, job quét lại; áp quy tắc muộn (BLOCKED muộn → ẩn + báo tác giả) |

Áp dụng theo bề mặt:
- **Bình luận từ điển** (`dict_comments`): đủ bảng trên; "nhạy cảm" = mục có nhãn JMdict `vulg` / `X` / `derog` / `sens` / `sl` ở bất kỳ nghĩa nào
  (ai-service trả `misc` trong `senses`) **hoặc** admin bật công tắc (`dict_sensitive`); admin tắt được cả mục JMdict đánh dấu. Chữ Hán (`k:`)
  và mục JLPT không có nghĩa JMdict mặc định không nhạy cảm.
- **Bình luận đánh giá bộ thẻ** (`deck_ratings.comment`): không có khái niệm nhạy cảm; sao vẫn lưu, bình luận BLOCKED chỉ chủ thấy.
- **Mẹo nhớ kanji** (`kanji_mnemonics`, vốn đã PENDING → admin duyệt): chỉ ghi `mod_label / mod_score / mod_spans` để hàng chờ admin hiện
  nhãn và từ bị đánh dấu; không tự từ chối.
- **Tên hiển thị** (`users.full_name`): BLOCKED hoặc FLAGGED → **400** "Tên hiển thị có từ không phù hợp: …", không lưu; ai-service lỗi → lưu
  bình thường (ghi WARN).
- **Sửa bình luận** (PATCH) chấm lại từ đầu; BLOCKED sửa được (để gửi lại), còn bị admin ẩn thì vẫn 409 như cũ.
- **Tái phạm**: người dùng có ≥ 3 bình luận BLOCKED (từ điển + đánh giá) trong 24 giờ → `users.comment_locked_until = now + 24 h`; trong
  thời gian đó POST / PATCH bình luận và đánh giá trả **429** `COMMENT_LOCKED` kèm giờ mở; admin thấy ở chi tiết người dùng và mở khoá sớm
  (`PATCH /api/admin/users/{id}` `{commentLocked: false}`), audit `USER_COMMENT_UNLOCK`.

Ngưỡng là hằng số trong `ModerationPolicy` (`BLOCK_MIN_P2 = 0.8`, `SPAN_MIN = 0.5`, `SPAN_STRONG = 0.9`, `LOCK_AFTER = 3`, `LOCK_HOURS = 24`,
`BLOCKED_TTL_DAYS = 30`), ghi rõ trong tài liệu; chưa đưa vào `app_settings` (tránh thêm migration CHECK) — nâng cấp sau nếu cần.

## 5. Dữ liệu (V38, chỉ thêm cột / bảng, an toàn trên Supabase dùng chung)

```sql
-- kết quả kiểm duyệt trên từng dòng (cả ba bảng cùng bộ cột)
ALTER TABLE dict_comments   ADD mod_status varchar(8) NOT NULL DEFAULT 'PENDING'  -- PENDING | CLEAN | FLAGGED | BLOCKED | REVIEWED
                            ADD mod_label smallint, ADD mod_score real, ADD mod_spans text /* JSON [{word,start,end,score}] */,
                            ADD mod_at timestamptz(6), ADD mod_reviewed_by bigint REFERENCES users ON DELETE SET NULL,
                            ADD mod_reviewed_at timestamptz(6), ADD mod_review_action varchar(8) /* IGNORE | HIDE | RESTORE */,
                            ADD mod_verdict varchar(8) /* kết luận AI gốc: CLEAN | FLAGGED | BLOCKED, giữ sau khi admin xử lý */;
ALTER TABLE deck_ratings    ADD mod_status …, mod_label, mod_score, mod_spans, mod_at, mod_reviewed_by, mod_reviewed_at, mod_review_action, mod_verdict;
ALTER TABLE kanji_mnemonics ADD mod_label smallint, mod_score real, mod_spans text, mod_at timestamptz(6);
ALTER TABLE users           ADD comment_locked_until timestamptz(6);
CREATE TABLE dict_sensitive (entry_key varchar(64) PRIMARY KEY, sensitive boolean NOT NULL, actor_id bigint, note varchar(300), updated_at timestamptz(6));
-- HLR
ALTER TABLE reviews ADD seen int NOT NULL DEFAULT 0, ADD correct int NOT NULL DEFAULT 0, ADD last_reviewed_at timestamptz(6),
                    ADD recall_p real /* p hiệu chỉnh tại lượt chấm gần nhất (trước khi chấm) */, ADD hlr_brake boolean NOT NULL DEFAULT false;
UPDATE reviews r SET seen = …, correct = …, last_reviewed_at = … FROM (SELECT user_id, card_id, count(*) FILTER (WHERE source <> 'cram') … FROM review_logs GROUP BY 1,2) l WHERE …;
CREATE INDEX ix_dict_comments_mod ON dict_comments (mod_status, created_at DESC); CREATE INDEX ix_deck_ratings_mod ON deck_ratings (mod_status, updated_at DESC);
```

Dòng cũ: `mod_status = 'PENDING'` nên job quét lại sẽ chấm dần toàn bộ bình luận đã có (50 dòng / lượt, 5 phút / lượt; cũ nhất trước). BLOCKED
quá **30 ngày** không ai xử lý → `HousekeepingJob` xoá (audit `MOD_PURGE`, không thông báo).

Hiển thị theo trạng thái (bình luận từ điển; đánh giá tương tự):

| mod_status | Người khác | Chủ | Admin |
|---|---|---|---|
| PENDING / CLEAN / REVIEWED(IGNORE, RESTORE) | nguyên văn | nguyên văn | nguyên văn |
| FLAGGED | **che từ đánh dấu** (`đ∗∗`, giữ ký tự đầu), `masked: true` | nguyên văn + dải "AI gắn cờ, admin sẽ xem" | nguyên văn + nhãn + từ tô đỏ |
| BLOCKED | **không thấy** (không đếm vào commentCount, không Hữu ích / báo cáo) | nguyên văn + dải "AI từ chối: … — sửa để gửi lại" | hàng chờ, có thể Khôi phục |
| admin ẩn (`hidden_at`) | không thấy | dải "quản trị viên ẩn" (như cũ) | như cũ |

## 6. API

### 6.1 ai-service (mới, `X-Internal-Key`)
- `POST /api/moderation/check` `{items: [{ref, text}], spans?: true}` (≤ 20 mục, mỗi mục ≤ 2 000 ký tự) →
  `{items: [{ref, label, labelName, probs: [p0, p1, p2], score, spans: [{word, start, end, score}], spanModel}], models: {vihsd, vihos}}`.
  `start/end` là vị trí ký tự trong `text` gốc (tìm lại sau pyvi; không tìm được → `-1`). Thiếu model 3 lớp → 503 `moderationUnavailable`;
  thiếu PhoBERT → `spans: []`, `spanModel: false`.
- `GET /api/moderation/info` → `{vihsd: {ready, testAccuracy}, vihos: {ready, device, threshold}, preprocess: {pyvi, emoji}}`.
- `POST /api/hlr/predict` `{items: [{ref, seen, correct, deltaDays}], targetP?}` (≤ 500) → `{items: [{ref, recall, recallRaw, halfLifeDays,
  intervalDays, forget}], model: {name, key, threshold, …}}`; `GET /api/hlr/info`. Thiếu JSON → 503 `hlrUnavailable`.
- `GET /api/extract/health` thêm cờ `moderation` (model 3 lớp + pyvi), `moderationSpans` (PhoBERT), `hlr`.

### 6.2 backend — người học
- `POST /api/dictionary/entries/{key}/comments`, `PATCH /comments/{id}`: như cũ, nhưng DTO `Comment` thêm `modStatus`, `masked`,
  `modSpans` (chỉ chủ / admin; mảng từ), `modMessage` (câu giải thích cho chủ khi BLOCKED / FLAGGED). BLOCKED vẫn trả **201** với
  `modStatus: "BLOCKED"` (giao diện tự hiện dải); 429 `COMMENT_LOCKED` khi đang bị khoá.
- `GET …/comments`: người khác không thấy BLOCKED; FLAGGED trả bản che. `commentCount` của mục từ chỉ đếm bình luận người khác thấy.
- `PUT /api/library/decks/{deckId}/rating`: `Rating` thêm `moderation: {status, spans, message}`; bình luận BLOCKED không hiện trong danh sách đánh giá
  của người khác (sao vẫn tính).
- `POST /api/kanji/mnemonics`: không đổi hợp đồng; `Mine` thêm `modLabel`.
- `PUT /api/auth/profile`: 400 `NAME_REJECTED` khi tên bị đánh dấu.
- `POST /api/reviews` → `ReviewResponse` thêm `recallBefore` (p nhớ ngay trước lượt chấm, null khi thẻ mới / HLR lỗi), `hlrBrake` (lượt này
  bị phanh), `scheduler` (`sm2` | `sm2+hlr`).
- `GET /api/decks/{id}/recall` → `{cards, studied, avgRecall, forgettingSoon, items: [{cardId, recall, forget}]}` (≤ 500 thẻ, một lời gọi batch;
  ai-service lỗi → 503 `HLR_UNAVAILABLE`, giao diện ẩn chip).
- `GET /api/learning-paths/{id}/session`: thẻ đến hạn xếp theo `recall` tăng dần khi HLR có (fallback `dueAt`); mỗi thẻ thêm `recall`.
- `GET /api/insights/weaknesses`: thêm tín hiệu `low_recall` (p < 0,7 trong các thẻ đã học, ≤ 300 thẻ gần nhất).

### 6.3 backend — admin (`ROLE_ADMIN`)
- `GET /api/admin/moderation?status=FLAGGED|BLOCKED|PENDING|ALL&kind=comment|rating|ALL&q&page&size` → `AdminPage<ModerationItem{kind, id,
  content, spans, label, score, status, verdict, author{id, email, displayName, blockedCount24h}, target{entryKey|deckId, term|title, sensitive},
  createdAt}>`, mặc định `FLAGGED,BLOCKED` mới nhất trước.
- `POST /api/admin/moderation/{kind}/{id}/ignore` (FLAGGED/BLOCKED → REVIEWED/IGNORE, bình luận hiện nguyên văn), `/restore` (BLOCKED → REVIEWED/RESTORE,
  công khai + thông báo tác giả `MOD_COMMENT_RESTORED`), `/hide` (ẩn như `hideComment` cũ, bắt buộc ghi chú, thông báo `DICT_COMMENT_HIDDEN` /
  `COMMENT_CLEARED`), `DELETE /api/admin/moderation/{kind}/{id}`; audit `MOD_IGNORE`, `MOD_RESTORE`, `DICT_COMMENT_HIDE`, `RATING_CLEAR_COMMENT`, `MOD_DELETE`.
- `POST /api/admin/moderation/rescan` → chạy ngay một lượt quét PENDING (tối đa 200), trả số đã chấm.
- `PUT /api/admin/dictionary/entries/{key}/sensitive` `{sensitive, note?}` (audit `DICT_SENSITIVE`); `GET /api/admin/dictionary/entries/{key}` trả
  `sensitive: {value, source: jmdict|admin, note}`.
- `GET /api/admin/stats`: thêm `openModeration` (FLAGGED + BLOCKED) → badge mục "Kiểm duyệt AI"; `GET /api/admin/health` hiện cờ mới của ai-service.
- `GET /api/admin/users/{id}`: thêm `commentLockedUntil`, `moderationBlocked30d`; `PATCH` nhận `commentLocked: false`.

## 7. Giao diện

- **Bình luận từ điển** (`DictComments.tsx`): dải theo trạng thái (§5); bản che hiện tooltip "từ bị che chờ admin xem"; gửi xong BLOCKED → dải đỏ với
  danh sách từ bị đánh dấu và nút "Sửa"; 429 khoá → câu của server. Cùng thành phần cho chữ Hán (`KanjiCommunity`).
- **Đánh giá bộ thẻ**: sau khi gửi hiện cảnh báo tương ứng; danh sách đánh giá dùng cùng quy tắc che.
- **Hồ sơ**: lỗi 400 hiện ngay dưới ô tên.
- **Admin › Kiểm duyệt AI** (`/admin/moderation`, icon `shield`, badge `openModeration`): bảng hàng chờ, lọc trạng thái / loại / tìm; từng dòng:
  nội dung với từ bị đánh dấu tô đỏ, nhãn + p, tác giả (số lần bị chặn 24 h), đích (mục từ + cờ nhạy cảm / bộ thẻ); nút Bỏ qua · Ẩn (ghi chú)
  · Khôi phục (BLOCKED) · Xoá; nút "Quét lại bình luận chưa kiểm" + số PENDING. Dùng lại `AdminPage`, `ResolveReportModal` kiểu ghi chú.
- **Admin › Từ điển › Mục từ**: công tắc "Mục nhạy cảm" (nguồn JMdict / admin) trong `DictEntryEditor`.
- **Admin › Mẹo nhớ**: badge nhãn AI + từ tô đỏ ở hàng chờ.
- **Admin › Người dùng › chi tiết**: "Khoá bình luận đến …" + nút mở khoá; số bình luận bị AI chặn 30 ngày.
- **Trang học** (`StudyPage`): sau khi chấm, dòng "Trước khi ôn bạn được dự đoán nhớ 42 % · ôn lại sau 3 ngày" (+ "HLR giữ khoảng ôn" khi phanh);
  tổng kết phiên: độ nhớ trung bình trước phiên.
- **Chi tiết bộ thẻ**: chip "Độ nhớ ≈ 78 % · 5 thẻ sắp quên" (gọi `/recall`, ẩn khi 503).
- **Insights**: thẻ điểm yếu "Sắp quên" (`low_recall`) với nút tạo bộ bổ khuyết như các tín hiệu khác.
- **Phiên lộ trình**: không đổi giao diện, thứ tự thẻ đến hạn theo độ nhớ.

## 8. HLR trong lịch ôn (D32, bản đã sửa)

8.1 Số liệu thẻ: `reviews.seen` = số lượt chấm nguồn `flip` / `quiz` (không `cram`), `correct` = số lượt không phải `again`, `last_reviewed_at`;
V38 lấp từ `review_logs`; hoàn tác (`/reviews/undo`) tính lại ba cột từ log sau khi xoá log (không thêm cột `prev_*`).

8.2 Lượt chấm: `ReviewService.apply` tính SM-2 như cũ rồi gọi `HlrClient.predict(seen, correct, Δ = now − last_reviewed_at)` **với số liệu
TRƯỚC lượt chấm** → `recallBefore`; sau đó cập nhật seen/correct và gọi lần hai với số liệu SAU lượt chấm, Δ = 1 phút → `p_after`. Phanh:
nếu `p_after < threshold (0,8235)` và grade ≠ `again` thì `interval = max(1, min(interval_SM2, interval_trước))` (không tăng), `hlr_brake = true`.
`again` giữ nguyên SM-2 (đã giảm). Thẻ mới (`seen_after < 2`) không gọi HLR. Timeout 1,5 s hoặc lỗi → SM-2 thuần, `scheduler = sm2`
(không ghi lỗi mỗi lượt: WARN gộp 1 phút / lần).

8.3 Vì sao không lập lịch bằng `intervalDays` của model: đường cong portable gần phẳng theo thời gian (§2) nên thời điểm p chạm mục tiêu cực kỳ
nhạy với mục tiêu và với một lần sai (0 ngày ↔ 95 ngày). Model có giá trị ở xếp hạng nhớ / quên theo lịch sử (LogLoss thắng baseline) → dùng
cho phanh, thứ tự, hiển thị. `targetP` / `intervalDays` vẫn trả về qua API để báo cáo, không dùng trong lịch. "Thành thạo" giữ `interval ≥ 21 ngày`.

8.4 Hiển thị p "bây giờ" (chi tiết bộ, phiên, insight): một lời gọi batch với Δ = now − last_reviewed_at của từng thẻ; không lưu p theo thời gian.

## 9. Vận hành

- `ai-service/models/` (gitignore trừ `MANIFEST.json`, `README.md`): `vihsd_cnn_lstm.npz`, `phobert_hatespeech_best.pt`, `phobert-base/`
  (vocab.txt, bpe.codes, config.json), nguồn `.pt` gốc. `scripts/fetch_models.py` đọc `MANIFEST.json` (tên, URL, sha256, kích thước), tải khi
  thiếu / sai sha, `--from <thư mục>` để chép từ máy (dùng cho máy dev); `--phobert-tokenizer` chép từ cache Hugging Face hoặc tải từ Hub.
- `requirements.txt` thêm `pyvi`, `emoji-vietnamese` (nhẹ, model 3 lớp cần); `requirements-ml.txt` = `torch` (CPU index) + `transformers` cho
  PhoBERT. Biến môi trường: `MODERATION_SPANS=0` tắt PhoBERT (máy ít RAM), `MODERATION_THREADS=4`, `MODELS_DIR`.
- Nạp lười, khoá kép, một suy luận PhoBERT tại một thời điểm (tránh tranh luồng); lần gọi đầu ≈ 2–3 s (nạp 540 MB) — backend timeout 3 s
  nên lượt đầu có thể thành PENDING rồi được job quét; chấp nhận.
- Backend: `app.moderation.enabled=true`, `app.moderation.timeout=PT3S`, `app.moderation.rescan-cron=0 */5 * * * *`, `app.hlr.enabled=true`,
  `app.hlr.timeout=PT1.5S`; profile `test` tắt cả hai cron; IT dùng `@MockitoBean` cho `ModerationAiClient` / `HlrClient`.
- `AdminStatsService.health().engines` tự có cờ mới (mọi cờ boolean của `/extract/health`).

## 10. Bảo mật, riêng tư

Nội dung chỉ đi backend → ai-service nội bộ (khoá `X-Internal-Key`), không gửi dịch vụ ngoài. Từ bị đánh dấu không lộ cho người khác (bản che).
Mọi thao tác admin ghi audit. Rate limit bình luận / báo cáo giữ nguyên; khoá bình luận 24 h là mềm (không khoá tài khoản). Model file không vào git.

## 11. Test

- ai-service: `test_hlr.py` (khớp torch, cờ quên, router), `test_moderation_preprocess.py` (tách `_`, OOV, pad, stopword), `test_moderation_vihsd.py`
  (mạng tí hon tổng hợp: softmax, hình dạng; parity với Keras trên 300 câu test khi có npz + TF — bỏ qua trên CI), `test_moderation_router.py`
  (model giả: nhãn / spans / 503 / giới hạn), `test_moderation_vihos.py` (căn vị trí từ trong văn bản gốc, decode ngưỡng; model giả).
- backend: `ModerationPolicyTest` (bảng §4), `ModerationIT` (bình luận CLEAN / FLAGGED che / BLOCKED chỉ chủ thấy + 201, sửa gửi lại, khoá 24 h → 429,
  nhạy cảm → FLAGGED, ai-service lỗi → PENDING + rescan, admin ignore / restore / hide / delete + audit + thông báo, badge, công tắc nhạy cảm, tên hồ sơ
  400, đánh giá bộ thẻ), `SrsServiceTest` (phanh), `ReviewHlrIT` (seen/correct/last_reviewed_at, recallBefore, phanh, undo tính lại, HLR lỗi → sm2),
  `DeckRecallIT`, `LearningPathIT` (thứ tự theo recall), `InsightIT` (low_recall), `HousekeepingIT` (xoá BLOCKED > 30 ngày).
- frontend: selfcheck `moderation.ts` (hàm che từ, nhãn trạng thái), cập nhật `admin.ts`; `npm run check`.
- smoke: `smoke-admin.mjs` thêm hàng chờ kiểm duyệt + công tắc nhạy cảm (ai-service tắt → chấp nhận PENDING).

## 12. Hạn chế đã biết

- Model 3 lớp yếu ở nhãn 1 / 2 (recall 0,26 / 0,37); PhoBERT đánh dấu cả đại từ ("mày", "đồ") trong ngữ cảnh xấu → admin sẽ thấy một số cờ thừa.
- Bình luận chủ yếu tiếng Việt lẫn tiếng Nhật: model chưa thấy chữ Nhật; chữ Nhật thành OOV, không ảnh hưởng nhãn nhiều nhưng không đáng tin
  cho câu toàn tiếng Nhật.
- HLR portable không biết độ khó từng thẻ; "p bây giờ" gần như là hàm của lịch sử đúng / sai (ít phụ thuộc thời gian).

## 13. Quyết định (grill-me 27/10 đêm, 5 vòng)

| # | Câu hỏi | Quyết định |
|---|---|---|
| D31 | Kiểm duyệt bình luận bằng ViHSD + ViHOS | Mục tốt + thù ghét → **chặn nhưng giữ hàng chờ** (tác giả sửa gửi lại, admin khôi phục, tự xoá 30 ngày); nhãn 1 → đăng + cờ; nhạy cảm = **JMdict vulg/X/derog/sens/sl + công tắc admin**; chặn chỉ khi **hai model cùng đồng ý** (p2 ≥ 0,8 + ≥ 1 từ); chấm **đồng bộ 3 s, lỗi → PENDING + job 5 phút**; phạm vi **từ điển + đánh giá bộ thẻ + mẹo nhớ (chỉ nhãn) + tên hồ sơ (400)**; FLAGGED công khai **che từ**; **3 lần chặn / 24 h → khoá bình luận 24 h** |
| D32 | HLR trong ôn tập | Ban đầu chọn "HLR lập lịch chính"; sau khi đo đường cong phẳng (§2, §8.3) đổi thành **SM-2 lập lịch, HLR phanh + hiển thị** (p < 0,8235 → khoảng ôn không tăng; độ nhớ, sắp quên p < 0,7, xếp thẻ p thấp trước); bỏ cài đặt mục tiêu p; thành thạo giữ ≥ 21 ngày; chạy **numpy trong ai-service**; model ở `ai-service/models/` + script tải; máy dev, PhoBERT fp32 |
