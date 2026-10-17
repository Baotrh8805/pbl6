# Spec: Admin Panel (quản trị hệ thống) — UC-38, UC-39, UC-41, UC-42

Ngày 17/10/2026 · nhánh `backend-feature-learnmode` · trạng thái: **đã duyệt 17/10/2026, chưa có code**; kế hoạch triển khai ở
[plans/2026-10-17-admin-panel.md](../plans/2026-10-17-admin-panel.md).
Phân hệ 7 hiện 0% ([USE_CASES_CHECKLIST.md](../../USE_CASES_CHECKLIST.md)). UC-40 (thanh toán) **không** nằm trong spec này.

Quy ước viết trong spec: mỗi quyết định tinh gọn ghi dạng `[mục] → bỏ qua: [X], thêm khi [Y]`, tối đa 3 dòng giải thích.

### Quyết định đã chốt với người dùng (17/10)

| # | Quyết định |
|---|---|
| D1 | **Bỏ MODERATOR.** 4 vai trò: `USER` (người học), `VIEWER` (staff chỉ đọc), `ADMIN` (vận hành + kiểm duyệt), `SUPER_ADMIN` (thêm đổi vai trò, sửa cấu hình). |
| D2 | **Một tài khoản một vai trò.** Staff **không** dùng tính năng học: mọi API học tập yêu cầu `ROLE_USER` (403 cho staff), giao diện admin có layout riêng. |
| D3 | Thăng USER → staff **không xoá** dữ liệu học của họ, chỉ bị ẩn (403); giáng về USER thì thấy lại. Khuyến nghị tạo tài khoản staff mới thay vì thăng cấp tài khoản đang học. |
| D4 | Tài khoản chủ Thư viện (`dongocle2404@gmail.com`, chủ 2 bộ official) **giữ là USER**; admin dùng tài khoản riêng. Trình soạn bộ thẻ trong admin panel → bỏ qua, thêm khi admin cần tự tạo nội dung official. |

---

## 0. Hiện trạng đã đọc từ code (quyết định thiết kế dựa vào đây)

| Dữ kiện | Nơi | Hệ quả |
|---|---|---|
| `Role { USER, ADMIN }`, CHECK `users_role_check IN ('USER','ADMIN')` | `model/Role.java`, `V1__baseline.sql` | Thêm vai trò = 1 migration đổi CHECK + 1 enum |
| Authority nạp từ DB **mỗi request** (`CustomUserDetailsService` theo email trong JWT) | `security/JwtAuthenticationFilter.java` | Đổi role / khoá tài khoản có hiệu lực ngay, không cần đổi JWT |
| Chưa có `@EnableMethodSecurity`, mọi `/api/**` chỉ `authenticated()` | `config/SecurityConfig.java` | Phân quyền theo vai trò chưa tồn tại |
| 401 = thiếu/sai token, 403 = thiếu quyền; lỗi JSON `{status,error,message}` | `SecurityConfig`, `ApiExceptionHandler` | Giữ nguyên, frontend đã dịch 403 |
| `AttemptLimiter` (cửa sổ trượt trong RAM) dùng cho login/register/quiz | `security/AttemptLimiter.java` | Dùng lại cho chống spam báo cáo |
| Hạn mức bóc tách `app.extraction.daily-limit.free/premium` là property, đếm trong DB | `ExtractionService.enforceDailyLimit` | UC-39 cần đổi được lúc chạy → chuyển sang bảng cấu hình |
| `RefreshTokenService.revokeAll(userId)`; `password_changed_at` thu hồi JWT cũ | `service/RefreshTokenService.java` | Dùng lại khi khoá tài khoản / thu hồi phiên |
| `decks.visibility/is_official/is_featured`, `deck_ratings.comment`, `extraction_jobs.status` | `model/Deck.java`, `V3`, `V12` | Mọi thao tác kiểm duyệt là đổi cột sẵn có |
| `review_logs(user_id, reviewed_at)`, `extraction_jobs(created_at)`, `users(created_at)` có index | `V11`, `V12`, `V1` | Thống kê theo ngày chạy bằng `GROUP BY` thuần SQL |
| `AppLayout` gọi 4 API học tập lúc mount để tính số liệu header | `components/layout/AppLayout.tsx` | Staff không học → không dùng `AppLayout`, cần layout admin riêng (D2) |
| Frontend: `useAsync`, `Modal` (native `<dialog>`), `DialogProvider.confirm`, `Button`, `ProtectedRoute` | `frontend/src/components`, `routes/` | Không cần component/thư viện mới |
| Test: `IntegrationTest` (Postgres nhúng, `newUser()`), `scripts/selfCheck.ts` cho hàm thuần FE | `backend-core/src/test`, `frontend/scripts` | Test mới nằm cùng khuôn |
| Supabase cloud, không tự host Postgres | `SUPABASE_SETUP.md` | UC-42 = quy trình `pg_dump`, không làm UI |

---

## 1. Mục tiêu & phạm vi

**Mục tiêu:** nhân sự vận hành (3 vai trò staff) xem số liệu, hỗ trợ người dùng, kiểm duyệt nội dung cộng đồng, xử lý báo cáo và đổi hạn mức AI mà **không** đụng DB tay; mọi thao tác ghi đều có dấu vết (audit).

**Tiêu chí nghiệm thu:**
1. Ma trận quyền (mục 3) được một test tham số hoá chứng minh: mỗi endpoint × mỗi vai trò → 403 hoặc không-403 đúng bảng, **kể cả chiều ngược**: staff gọi API học tập → 403.
2. Người dùng bị khoá: đăng nhập bị từ chối, access token đang có bị 401 ngay, refresh token bị từ chối.
3. Mọi API ghi dưới `/api/admin/**` sinh đúng 1 dòng `admin_audit_logs` trong cùng transaction.
4. Đổi hạn mức bóc tách trong Settings → request bóc tách kế tiếp áp dụng ngay (không restart).
5. `mvn test`, `npm run lint && npm run build && npm run selfcheck` xanh; **0 dependency mới** ở cả backend lẫn frontend.

**Ngoài phạm vi (cố ý):** thanh toán (UC-40), Google OAuth, 2FA/step-up auth cho admin, xoá cứng tài khoản, xem văn bản gốc người dùng đã tải, dashboard realtime, xuất CSV, trình soạn bộ thẻ cho admin.

---

## 2. Danh sách chức năng quản trị (đầy đủ, kèm quyết định tinh gọn)

### 2.1 Dashboard thống kê (UC-38)
| Làm | Chi tiết |
|---|---|
| Thẻ số | Người dùng (tổng / mới 7 ngày / mới 30 ngày / đang bị khoá / premium), bộ thẻ (tổng / public / official), thẻ, job bóc tách (tổng / DONE / FAILED / đang chạy), lượt quiz, lộ trình, **người dùng hoạt động 7 ngày** (distinct `review_logs.user_id`) |
| Chuỗi theo ngày | 30 ngày gần nhất: đăng ký mới, job bóc tách, lượt quiz. Múi giờ `app.learning-path.zone` (sẵn có) |
| Sức khoẻ | DB (1 query), ai-service (`GET /api/extract/health` qua `AiServiceClient` sẵn có), version build |
| Báo cáo mở | Số báo cáo `OPEN` → link sang trang Báo cáo |

- Biểu đồ → bỏ qua thư viện chart, thêm khi cần tương tác (zoom/tooltip). Cột là `<div>` cao theo `%` bằng CSS grid, số liệu có trong `<table>` ẩn thị giác cho screen reader.
- Realtime/WebSocket → bỏ qua, thêm khi có > 1 admin cùng trực. Nút "Tải lại" là đủ.
- Actuator → bỏ qua, thêm khi có hệ thống giám sát ngoài (Prometheus). Endpoint health tự viết 10 dòng.

### 2.2 Quản lý người dùng
| Làm | Chi tiết |
|---|---|
| Danh sách | Tìm theo email / tên (ILIKE, escape `%` `_`), lọc role / premium / khoá, phân trang 20/trang (max 100) |
| Chi tiết | Hồ sơ, ngày tạo, số bộ thẻ / thẻ / job bóc tách / lượt quiz, lượt bóc tách hôm nay, ôn tập gần nhất, số phiên (refresh token) đang sống |
| Khoá / mở khoá | `users.locked_at`; khoá = thu hồi mọi refresh token + token cũ bị từ chối ngay |
| Premium thủ công | `is_premium` (UC-40 chưa có cổng thanh toán → đây là cách cấp Pro) |
| Hạn mức AI riêng (UC-39) | `users.extraction_daily_limit` (null = theo cấu hình chung) |
| Thu hồi phiên | `revokeAll` + `password_changed_at = now()` (JWT cũ bị từ chối, không đổi mật khẩu) |
| Đổi vai trò | Chỉ SUPER_ADMIN; không tự đổi của mình (nên luôn còn ≥ 1 SUPER_ADMIN); hộp xác nhận nhắc D3 (dữ liệu học bị ẩn, không xoá) |

- Xoá tài khoản → bỏ qua, thêm khi có yêu cầu pháp lý (GDPR) kèm quy trình ẩn danh hoá. Khoá đã chặn hoàn toàn.
- Đặt lại mật khẩu hộ → bỏ qua, thêm khi SMTP không dùng được. Người dùng đã có "Quên mật khẩu".
- Giả danh (impersonate) → bỏ qua, thêm khi support cần tái hiện lỗi; rủi ro audit lớn.
- Chỉnh tên / email hộ → bỏ qua, thêm khi có ticket thực tế.
- Tạo tài khoản staff từ panel → bỏ qua, thêm khi nhiều staff. Hiện: người đó tự đăng ký, SUPER_ADMIN đổi vai trò.

### 2.3 Quản lý nội dung
| Làm | Chi tiết |
|---|---|
| Bộ thẻ | Danh sách mọi bộ thẻ (metadata: tiêu đề, chủ, visibility, official, featured, số thẻ, sao TB, lượt tải, ngày tạo); lọc visibility / official / featured / chủ; tìm tiêu đề |
| Xem thẻ | **Chỉ** khi bộ thẻ public **hoặc** đang có báo cáo OPEN (quyền riêng tư: bộ thẻ private là tài liệu cá nhân) |
| Gỡ khỏi Thư viện | `visibility = private` (ADMIN+). Không có "ẩn" riêng: private đã đủ |
| Official / Featured | Đổi 2 cờ sẵn có (ADMIN+). DB chỉ cho **một** bộ featured (`uq_decks_single_featured`): gắn featured mới tự bỏ cờ bộ cũ |
| Xoá bộ thẻ | ADMIN+, dùng lại hàm xoá của `DeckService` (tách phần kiểm tra chủ ra khỏi phần xoá). FK cascade sẵn có lo shares / ratings |
| Đánh giá & bình luận | Danh sách bình luận mới nhất (lọc theo bộ thẻ, tìm chữ); xoá bình luận (ADMIN+) = `comment = null`, giữ sao |
| Job bóc tách | Danh sách mọi job (người dùng, loại nguồn, trạng thái, stage, lỗi, thời gian); xoá job (ADMIN+). **Không** hiện `extracted_text` |

- Sửa nội dung thẻ hộ người dùng → bỏ qua, thêm khi có luồng "đề xuất sửa" từ cộng đồng. Admin chỉ gỡ / xoá.
- Kiểm duyệt trước khi public → bỏ qua, thêm khi tỉ lệ báo cáo cao; hiện tại hậu kiểm qua báo cáo.
- Lộ trình học tập / thư mục → bỏ qua UI riêng, thêm khi có ticket. Chỉ đếm trên dashboard.

### 2.4 Báo cáo vi phạm (UC-41)
| Làm | Chi tiết |
|---|---|
| Người dùng gửi | Nút "Báo cáo" trên bộ thẻ public: lý do (enum) + mô tả ≤ 500 ký tự. 1 báo cáo OPEN / người / bộ thẻ (partial unique index). Chống spam 10 báo cáo / giờ / người (`AttemptLimiter`, đếm theo `userId`) |
| Hàng đợi | Lọc OPEN / RESOLVED / DISMISSED, mới nhất trước; đếm số báo cáo OPEN cùng bộ thẻ |
| Xử lý | ADMIN+: `resolve` kèm hành động `NONE` / `UNPUBLISH_DECK` / `CLEAR_COMMENT` + ghi chú; `dismiss` kèm ghi chú. Hành động chạy trong cùng transaction, atomic bằng `UPDATE … WHERE status='OPEN'` |
| Thông báo người báo cáo | → bỏ qua, thêm khi có hệ thống thông báo trong app |

- Báo cáo bình luận riêng → bỏ qua, thêm khi bình luận là nội dung chính. Báo cáo bộ thẻ với lý do "Xúc phạm" + hành động `CLEAR_COMMENT` đủ dùng.
- Cấm người dùng từ màn báo cáo → bỏ qua, thêm khi hay dùng; đi qua trang Người dùng.

### 2.5 Cấu hình hệ thống (UC-39)
Bảng `app_settings(key, value)` với **4 khoá cố định** (CHECK ở DB), SUPER_ADMIN sửa, mọi staff xem:

| Khoá | Kiểu / ràng buộc | Dùng ở |
|---|---|---|
| `extraction_daily_limit_free` | int 0–1000 | `ExtractionService.enforceDailyLimit` (thay property) |
| `extraction_daily_limit_premium` | int 0–1000 | như trên |
| `announcement` | text ≤ 300, rỗng = tắt | Banner đầu `AppLayout` cho người học |
| `registration_open` | `true`/`false` | `AuthService.register` → 403 "Tạm ngừng đăng ký" |

- Cấu hình JWT / CORS / SMTP / rate limit login qua UI → bỏ qua, thêm khi chạy nhiều môi trường không thể sửa env. Đó là cấu hình hạ tầng, đổi = restart.
- Cache settings trong RAM → bỏ qua, thêm khi đo thấy query `SELECT value FROM app_settings WHERE key=?` là nút thắt (1 PK lookup / request bóc tách).
- Property `app.extraction.daily-limit.*` → **xoá** (giá trị khởi tạo nằm trong migration seed).

### 2.6 Nhật ký quản trị (audit)
Bảng `admin_audit_logs` ghi mọi thao tác ghi: ai, hành động, đối tượng, chi tiết nhỏ (jsonb: trước/sau), lúc nào. Chỉ đọc (không có endpoint sửa/xoá). Lọc theo người thao tác / loại đối tượng / khoảng ngày.

### 2.7 Sao lưu & khôi phục (UC-42)
- UI sao lưu trong app → bỏ qua, thêm khi tự host Postgres và cần restore 1-click. Supabase/Postgres đã có `pg_dump`.
- Giao: `scripts/backup.ps1` + `scripts/backup.sh` (gọi `pg_dump --format=custom` tới `backups/pbl6-YYYYMMDD-HHmm.dump`, giữ 14 bản mới nhất), quy trình restore `pg_restore --clean --if-exists` thử trên Postgres nhúng, ghi vào `SUPABASE_SETUP.md`. Dashboard **không** hiển thị "lần sao lưu cuối" (thêm khi script chạy theo cron trên server có app).

### 2.8 Thanh toán (UC-40)
→ bỏ qua toàn bộ, thêm khi chọn xong cổng (PayOS/VNPay). Admin cấp Premium tay (2.2) là cầu nối tạm.

---

## 3. Vai trò & ma trận phân quyền

### 3.1 Vai trò
`Role { USER, VIEWER, ADMIN, SUPER_ADMIN }`. Ba vai trò staff lồng nhau tuyến tính, khai báo **một lần** bằng `RoleHierarchy` của Spring Security
(`ROLE_SUPER_ADMIN > ROLE_ADMIN > ROLE_VIEWER`); Spring Security 6.5 tự áp dụng cho cả `authorizeHttpRequests` lẫn `@PreAuthorize`.
`USER` đứng ngoài hierarchy: staff **không** có `ROLE_USER` → mọi API học tập trả 403 (D2).

Quy tắc trong `SecurityConfig` (khai báo, không code tay):
```
/api/auth/**, /api/announcement        → authenticated()   (mọi vai trò; login/register/... vẫn permitAll như cũ)
/api/admin/**                          → hasRole("VIEWER") (USER bị 403 tại filter)
anyRequest()                           → hasRole("USER")   (staff bị 403 tại filter)
```

- Bảng `permissions` / role tuỳ biến → bỏ qua, thêm khi có > 4 vai trò hoặc quyền theo từng người. 3 bậc staff = 1 dòng hierarchy.
- Đưa role vào claim JWT → bỏ qua, thêm khi bỏ tra DB mỗi request. Hiện tra DB → đổi role có hiệu lực tức thì (ưu điểm cho khoá/giáng chức).
- Tài khoản 2 vai trò / chuyển chế độ → bỏ qua (D2), thêm khi staff thật sự cần vừa học vừa quản trị.

### 3.2 Ma trận (✔ = được, — = 403)
| Chức năng | USER | VIEWER | ADMIN | SUPER_ADMIN |
|---|:-:|:-:|:-:|:-:|
| Toàn bộ API học tập (`/api/decks`, `/folders`, `/library`, `/quizzes`, `/reviews`, `/extractions`, `/learning-paths`…) | ✔ | — | — | — |
| Gửi báo cáo bộ thẻ | ✔ | — | — | — |
| `/api/auth/me`, hồ sơ, đổi mật khẩu, `/api/announcement` | ✔ | ✔ | ✔ | ✔ |
| Xem dashboard, health | — | ✔ | ✔ | ✔ |
| Xem danh sách / chi tiết người dùng | — | ✔ | ✔ | ✔ |
| Khoá / mở khoá, premium, hạn mức riêng, thu hồi phiên | — | — | ✔ | ✔ |
| Đổi vai trò | — | — | — | ✔ |
| Xem bộ thẻ (metadata) / bình luận / job | — | ✔ | ✔ | ✔ |
| Xem thẻ của bộ thẻ public hoặc đang bị báo cáo | — | ✔ | ✔ | ✔ |
| Gỡ bộ thẻ khỏi Thư viện, xoá bình luận, official / featured, xoá bộ thẻ, xoá job | — | — | ✔ | ✔ |
| Xem hàng đợi báo cáo | — | ✔ | ✔ | ✔ |
| Resolve / dismiss báo cáo | — | — | ✔ | ✔ |
| Xem audit log | — | ✔ | ✔ | ✔ |
| Xem settings | — | ✔ | ✔ | ✔ |
| Sửa settings | — | — | — | ✔ |

### 3.3 Ràng buộc bảo vệ lẫn nhau (kiểm tra trong service, cùng transaction)
1. Không thao tác lên **chính mình** (khoá, đổi role, thu hồi phiên) → 400.
2. Chỉ thao tác lên người có **bậc thấp hơn** mình (`rank`: USER 0 < VIEWER 1 < ADMIN 2 < SUPER_ADMIN 3). ADMIN khoá được USER và VIEWER; SUPER_ADMIN khoá được mọi người trừ mình → 403.
3. "SUPER_ADMIN cuối cùng" không cần kiểm tra riêng: vì không tự đổi role của mình (quy tắc 1), người giáng luôn là một SUPER_ADMIN khác nên hệ thống còn ≥ 1. (Phát hiện khi viết test, 17/10.)
4. `registration_open=false` chỉ chặn `POST /auth/register`; đăng nhập không bị ảnh hưởng.
5. Đổi vai trò USER ↔ staff **không** đụng dữ liệu học (D3); thu hồi mọi refresh token của người đó để frontend nạp lại layout đúng vai trò sau đăng nhập lại.

### 3.4 Bootstrap super admin đầu tiên
→ bỏ qua code, thêm khi có pipeline deploy tự động. Chạy tay 1 lần trên tài khoản **mới đăng ký riêng cho admin** (D4), ghi vào `SUPABASE_SETUP.md`:
```sql
UPDATE users SET role = 'SUPER_ADMIN' WHERE lower(email) = '<email-admin>';
```
Test tích hợp tạo staff qua `UserRepository` trực tiếp (helper `newStaff(role)` trong `IntegrationTest`).

---

## 4. Thay đổi dữ liệu — `V14__admin_panel.sql`

```sql
-- Vai trò
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('USER','VIEWER','ADMIN','SUPER_ADMIN'));
ALTER TABLE users ADD COLUMN locked_at timestamptz(6);
ALTER TABLE users ADD COLUMN extraction_daily_limit int
  CONSTRAINT users_extraction_limit_check CHECK (extraction_daily_limit BETWEEN 0 AND 1000);
CREATE INDEX idx_users_created_at ON users (created_at);

-- Cấu hình chạy được lúc runtime: khoá cố định, giá trị chuỗi, kiểm tra kiểu ở service theo khoá
CREATE TABLE app_settings (
  key        varchar(40)  PRIMARY KEY
             CHECK (key IN ('extraction_daily_limit_free','extraction_daily_limit_premium','announcement','registration_open')),
  value      varchar(300) NOT NULL,
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_by bigint REFERENCES users (id) ON DELETE SET NULL
);
INSERT INTO app_settings (key, value) VALUES
  ('extraction_daily_limit_free', '5'), ('extraction_daily_limit_premium', '50'),
  ('announcement', ''), ('registration_open', 'true');

-- Báo cáo nội dung
CREATE TABLE content_reports (
  id              bigserial PRIMARY KEY,
  deck_id         varchar(255) NOT NULL REFERENCES decks (id) ON DELETE CASCADE,
  reporter_id     bigint       NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reason          varchar(20)  NOT NULL
                  CHECK (reason IN ('WRONG_CONTENT','COPYRIGHT','OFFENSIVE','SPAM','OTHER')),
  detail          varchar(500),
  status          varchar(10)  NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED','DISMISSED')),
  action          varchar(20)  CHECK (action IN ('NONE','UNPUBLISH_DECK','CLEAR_COMMENT')),
  resolution_note varchar(500),
  resolved_by     bigint REFERENCES users (id) ON DELETE SET NULL,
  resolved_at     timestamptz(6),
  created_at      timestamptz(6) NOT NULL DEFAULT now(),
  CHECK ((status = 'OPEN') = (resolved_at IS NULL))
);
CREATE UNIQUE INDEX uq_content_reports_open ON content_reports (deck_id, reporter_id) WHERE status = 'OPEN';
CREATE INDEX idx_content_reports_status ON content_reports (status, created_at DESC);

-- Nhật ký quản trị: chỉ ghi thêm
CREATE TABLE admin_audit_logs (
  id          bigserial PRIMARY KEY,
  actor_id    bigint       NOT NULL REFERENCES users (id),
  action      varchar(40)  NOT NULL,
  target_type varchar(20)  NOT NULL,
  target_id   varchar(255) NOT NULL,
  detail      jsonb,
  created_at  timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_audit_actor_time ON admin_audit_logs (actor_id, created_at DESC);
CREATE INDEX idx_admin_audit_target ON admin_audit_logs (target_type, target_id);
```

- Soft-delete / cột `deleted_at` cho bộ thẻ → bỏ qua, thêm khi cần "khôi phục". Gỡ khỏi Thư viện = private đã là bước nhẹ.
- Bảng `report_targets` đa hình (bộ thẻ / bình luận / người dùng) → bỏ qua, thêm khi báo cáo loại thứ 2 xuất hiện.
- Trigger DB chặn UPDATE/DELETE audit → bỏ qua, thêm khi có người có quyền SQL trực tiếp ngoài nhóm. App không có endpoint sửa/xoá.

---

## 5. API (`/api/admin/**`, JWT; vai trò tối thiểu ghi ở cột cuối)

Quy ước chung: phân trang `page` (≥ 0) `size` (1–100, mặc định 20); `q` ≤ 100 ký tự; trả `{items, total, page, size}` (cùng dạng `LibraryDeckResponse.Page`).
Lỗi: 400 tham số, 401 chưa đăng nhập, 403 thiếu bậc, 404 không có, 409 trạng thái không cho phép, 429 vượt hạn mức.

### 5.1 Dashboard & health
| Method | Path | Query / Body | Trả về | Vai trò |
|---|---|---|---|---|
| GET | `/api/admin/stats` | `days` (7–90, mặc định 30) | `{users:{total,new7d,new30d,locked,premium,active7d}, decks:{total,public,official}, cards, extractions:{total,done,failed,running}, quizAttempts, learningPaths, openReports, series:[{date, newUsers, extractions, quizzes}]}` | VIEWER |
| GET | `/api/admin/health` | — | `{db:"ok", aiService:"ok"\|"down", version}` | VIEWER |

### 5.2 Người dùng
| Method | Path | Query / Body | Trả về | Vai trò |
|---|---|---|---|---|
| GET | `/api/admin/users` | `q, role, premium, locked, page, size` | Page của `{id,email,fullName,role,isPremium,lockedAt,createdAt,deckCount}` | VIEWER |
| GET | `/api/admin/users/{id}` | — | chi tiết + `{deckCount,cardCount,extractionCount,extractionsToday,quizCount,lastReviewAt,activeSessions,extractionDailyLimit}` | VIEWER |
| PATCH | `/api/admin/users/{id}` | `{locked?, premium?, extractionDailyLimit?, clearLimit?}` (`clearLimit: true` = bỏ hạn mức riêng, về cấu hình chung; trường không gửi = giữ nguyên) | chi tiết | ADMIN |
| PUT | `/api/admin/users/{id}/role` | `{role}` (USER / VIEWER / ADMIN / SUPER_ADMIN) | chi tiết; thu hồi mọi refresh token của người đó | SUPER_ADMIN |
| POST | `/api/admin/users/{id}/revoke-sessions` | — | 204 | ADMIN |

### 5.3 Nội dung
| Method | Path | Query / Body | Trả về | Vai trò |
|---|---|---|---|---|
| GET | `/api/admin/decks` | `q, visibility, official, featured, ownerId, page, size` | Page của `{id,title,level,category,ownerId,ownerEmail,visibility,official,featured,cardCount,avgStars,downloads,openReports}` (bảng `decks` không có `created_at`; sắp theo tiêu đề) | VIEWER |
| GET | `/api/admin/decks/{id}` | — | metadata + `cards` **chỉ khi** public hoặc `openReports > 0`, ngược lại `cards: null` | VIEWER |
| POST | `/api/admin/decks/{id}/unpublish` | — | metadata | ADMIN |
| PATCH | `/api/admin/decks/{id}/flags` | `{official?, featured?}` | metadata | ADMIN |
| DELETE | `/api/admin/decks/{id}` | — | 204 | ADMIN |
| GET | `/api/admin/ratings` | `deckId?, q?, page, size` (chỉ dòng có `comment`) | Page của `{id,deckId,deckTitle,userId,userEmail,stars,comment,updatedAt}` | VIEWER |
| DELETE | `/api/admin/ratings/{id}/comment` | — | 204 (giữ sao) | ADMIN |
| GET | `/api/admin/extractions` | `status?, userId?, page, size` | Page của `ExtractionJobResponse` **không** có `extractedText` + `userEmail` | VIEWER |
| DELETE | `/api/admin/extractions/{id}` | — | 204; 409 nếu job đang chạy hoặc thuộc lộ trình | ADMIN |

### 5.4 Báo cáo
| Method | Path | Query / Body | Trả về | Vai trò |
|---|---|---|---|---|
| POST | `/api/library/decks/{id}/reports` | `{reason, detail?}` | 201 `{id,status}`; 404 bộ thẻ không public; 400 tự báo cáo bộ của mình; 409 đã có báo cáo OPEN; 429 > 10/giờ | USER |
| GET | `/api/admin/reports` | `status` (mặc định OPEN), `deckId?, page, size` | Page của `{id,deckId,deckTitle,deckVisibility,reporterEmail,reason,detail,status,action,resolutionNote,resolvedByEmail,resolvedAt,createdAt,sameDeckOpen}` | VIEWER |
| POST | `/api/admin/reports/{id}/resolve` | `{action, note?, ratingId?}` (`ratingId` bắt buộc khi `action=CLEAR_COMMENT`, phải thuộc bộ thẻ bị báo cáo) | báo cáo; 409 nếu không còn OPEN | ADMIN |
| POST | `/api/admin/reports/{id}/dismiss` | `{note?}` | báo cáo; 409 nếu không còn OPEN | ADMIN |

### 5.5 Audit, settings, announcement
| Method | Path | Query / Body | Trả về | Vai trò |
|---|---|---|---|---|
| GET | `/api/admin/audit-logs` | `actorId?, targetType?, from?, to?, page, size` | Page của `{id,actorEmail,action,targetType,targetId,detail,createdAt}` | VIEWER |
| GET | `/api/admin/settings` | — | `{extraction_daily_limit_free, extraction_daily_limit_premium, announcement, registration_open, updatedAt}` | VIEWER |
| PUT | `/api/admin/settings` | cùng 4 khoá (bắt buộc đủ) | như GET | SUPER_ADMIN |
| GET | `/api/announcement` | — | `{text}` (rỗng = không có) | mọi người đã đăng nhập |

### 5.6 Hành động audit (giá trị cột `action`)
`USER_LOCK, USER_UNLOCK, USER_PREMIUM, USER_LIMIT, USER_ROLE, USER_REVOKE_SESSIONS, DECK_UNPUBLISH, DECK_FLAGS, DECK_DELETE, RATING_CLEAR_COMMENT, EXTRACTION_DELETE, REPORT_RESOLVE, REPORT_DISMISS, SETTINGS_UPDATE`.
`detail` ghi `{before, after}` của đúng trường đổi; **không bao giờ** chứa mật khẩu, token, email người khác ngoài target.

---

## 6. Thiết kế backend (tệp chạm tới)

| Tệp | Việc |
|---|---|
| `model/Role.java` | `USER, VIEWER, ADMIN, SUPER_ADMIN`; `boolean isStaff()`; `int rank()` |
| `model/User.java` | `lockedAt`, `extractionDailyLimit` |
| `model/ContentReport.java`, `AdminAuditLog.java`, `AppSetting.java` + 3 repository | entity thuần, không tầng trung gian |
| `security/CustomUserDetails.java` | `isAccountNonLocked() = lockedAt == null` → `DaoAuthenticationProvider` tự ném `LockedException` khi đăng nhập |
| `security/JwtAuthenticationFilter.java` | thêm 1 điều kiện: `!userDetails.isAccountNonLocked()` → không set Authentication (401) |
| `service/RefreshTokenService.refresh` | người bị khoá → 401 "Tài khoản đã bị khoá" |
| `service/AuthService.login` | bắt `LockedException` → 403 "Tài khoản đã bị khoá, liên hệ hỗ trợ"; `register` đọc `registration_open` |
| `config/SecurityConfig.java` | `@EnableMethodSecurity`; bean `RoleHierarchy`; 3 dòng `requestMatchers` ở mục 3.1 |
| `config/ApiExceptionHandler.java` | thêm handler `AccessDeniedException` → 403 (hiện `onOther` sẽ biến từ chối của `@PreAuthorize` thành 500) |
| `dto/AuthResponse.java` | thêm `role` để frontend điều hướng `/admin` hay `/` ngay sau đăng nhập, không chờ `/auth/me` |
| `controller/AdminStatsController`, `AdminUserController`, `AdminContentController`, `AdminReportController`, `AdminSettingsController` | mỗi nhóm tài nguyên 1 controller (quy tắc nhóm); `@PreAuthorize("hasRole('ADMIN')")` / `hasRole('SUPER_ADMIN')` trên **từng method ghi** |
| `service/AdminUserService`, `AdminContentService`, `ReportService`, `SettingsService`, `AdminStatsService`, `AuditService` | mỗi service < 400 dòng; `AuditService.log(actor, action, type, id, before, after)` gọi trong cùng `@Transactional` |
| `service/ExtractionService` | `enforceDailyLimit`: `limit = user.extractionDailyLimit ?? settings.getInt(premium ? …_premium : …_free)` |
| `service/DeckService` | tách `deleteDeck(Deck)` khỏi `deleteForOwner(uid, id)` để admin dùng lại |
| `controller/LibraryController` | thêm `POST /decks/{id}/reports`; `security/ReportRateLimiter` (bọc `AttemptLimiter`, 10/PT1H, giống `QuizRateLimiter`) |
| `application.properties` | **xoá** 2 property hạn mức; test `ExtractionIT` đang set property → đổi sang ghi `app_settings` |
| `db/migration/V14__admin_panel.sql` | mục 4 |

Truy vấn thống kê: 3 native query `GROUP BY date_trunc('day', created_at AT TIME ZONE :zone)`, 1 `COUNT(DISTINCT user_id)` trên `review_logs`; không bảng tổng hợp.

- Interface `AdminService` + impl → bỏ qua (1 implementation).
- Phân trang: **một** record `AdminPage<T>(items, total, page, size)` dùng chung cho 7 danh sách admin (≥ 3 nơi dùng → tách); không interface / lớp trừu tượng nào khác.
- Event/listener cho audit → bỏ qua, gọi `auditService.log(...)` trực tiếp cuối mỗi method ghi (đọc code thấy ngay).
- Cache `RoleHierarchy`/settings → bỏ qua (mục 2.5).

---

## 7. Thiết kế frontend (0 dependency mới)

| Tệp | Việc |
|---|---|
| `lib/roles.ts` | `RANK`, `atLeast(role, min)`, `isStaff(role)` (hàm thuần, test trong `selfCheck.ts`) |
| `routes/ProtectedRoute.tsx` | thêm prop `minRole?: Role`; USER vào `/admin` → `/`; staff vào route học → `/admin` (UI thôi, backend mới là nơi chặn) |
| `routes/AppRoutes.tsx` | nhánh `/admin` (dashboard), `/admin/users`, `/admin/users/:id`, `/admin/decks`, `/admin/decks/:id`, `/admin/reports`, `/admin/audit`, `/admin/settings` trong `AdminLayout`; fallback `*` theo vai trò |
| `features/auth` (sau login) | điều hướng theo vai trò: staff → `/admin`, USER → `/` (hoặc `state.from`) |
| `components/layout/AdminLayout.tsx` | header (tên app, email, vai trò, đăng xuất) + sidebar 6 mục + `<Outlet>`; **không** gọi API học tập; mobile: sidebar gập như `DashboardSidebar` |
| `services/adminService.ts` | mọi hàm gọi `/api/admin/*` + `reportDeck()` + `fetchAnnouncement()` |
| `types/api.types.ts` | thêm type khớp DTO mục 5 |
| `pages/admin/*.tsx` (7 trang) | mỗi trang `useAsync` + `<table>` + `Pager` |
| `features/admin/components/Pager.tsx`, `StatCard.tsx`, `BarSeries.tsx` (CSS grid), `RoleBadge.tsx` | dùng ở ≥ 3 trang nên tách |
| `features/library/components/ReportDeckModal.tsx` | form báo cáo (dùng `Modal` sẵn có) gắn vào `DeckDetailPage` / `LibraryPreviewModal` |
| `components/layout/AppLayout.tsx` | banner `announcement` (role="status") khi có text (cho người học) |

- `DashboardSidebar` / `AppLayout` **không đổi** (ngoài banner): staff không bao giờ vào đó.
- `DataTable` generic (sort, cột cấu hình) → bỏ qua, thêm khi ≥ 3 bảng cần sort nhiều cột. Bảng hiện chỉ lọc + phân trang server-side.
- TanStack Query / Zustand → bỏ qua (ghi chú sẵn ở `useAsync`), thêm khi cần cache chéo trang.
- Thư viện chart / icon mới → bỏ qua; `lucide-react` + Material Symbols đang có.

Accessibility (bắt buộc, không bỏ): `<table>` có `<caption>` ẩn thị giác, `<th scope="col">`; mỗi nút icon có `aria-label`; trạng thái (khoá / public / OPEN) luôn kèm **chữ**, không chỉ màu; kết quả lọc đổi → vùng `role="status"` đọc "N kết quả"; mọi hành động phá huỷ qua `dialog.confirm` (native `<dialog>`, focus trap sẵn); form có `<label for>`; focus ring của `Button` sẵn có; bảng rộng cuộn ngang bằng CSS `overflow-x-auto` (không JS).

---

## 8. Wireframe từng màn hình

Ký hiệu: `[ ]` nút, `( )` radio, `[v]` select, `___` ô nhập, `*` hành động cần bậc cao hơn (ẩn khi không đủ bậc).

### 8.1 `AdminLayout` (staff; không có mục học tập)
```
┌ NihonGen AI · Quản trị ──────────────────── b@x.vn · ADMIN · [Đăng xuất] ┐
│ ▣ Tổng quan hệ thống   /admin                                            │
│ ▣ Người dùng           /admin/users                                      │
│ ▣ Nội dung             /admin/decks                                      │
│ ▣ Báo cáo (3)          /admin/reports      ← badge số OPEN từ /stats      │
│ ▣ Nhật ký              /admin/audit                                      │
│ ▣ Cấu hình             /admin/settings     ← mọi staff thấy, SUPER_ADMIN sửa│
│                                                                          │
│  <Outlet/>                                                               │
└──────────────────────────────────────────────────────────────────────────┘
Mobile: nút ☰ mở sidebar dạng drawer (cùng cơ chế `DashboardSidebar`).
```

### 8.2 `/admin` — Tổng quan hệ thống
```
┌──────────────────────────────────────────────────────────────────────────┐
│ Tổng quan hệ thống                    DB ●ok  AI ●ok  v0.0.1  [Tải lại]  │
├──────────────┬──────────────┬──────────────┬──────────────┬──────────────┤
│ Người dùng   │ Hoạt động 7d │ Bộ thẻ       │ Bóc tách     │ Báo cáo mở   │
│ 1 240        │ 318          │ 3 905        │ 2 110        │ 3  → xem     │
│ +42 / 7 ngày │              │ 412 public   │ 97 FAILED    │              │
│ 12 khoá·80 Pro│             │ 2 official   │ 4 đang chạy  │              │
├──────────────┴──────────────┴──────────────┴──────────────┴──────────────┤
│ 30 ngày gần nhất        [v Đăng ký] [v Bóc tách] [v Quiz]   (days [v30]) │
│ ▁▂▃▂▅▆▃▂▁▂▃▅▇▆▅▃▂▁▂▃▄▅▆▇▆▅▄▃▂▁   ← cột CSS, hover hiện tooltip = title   │
│ (bảng số liệu ẩn thị giác cho screen reader)                              │
└──────────────────────────────────────────────────────────────────────────┘
```

### 8.3 `/admin/users` — Người dùng
```
┌ Người dùng ──────────────────────────────────────────────────────────────┐
│ Tìm: [email / tên ______] Vai trò [v Tất cả] Premium [v] Khoá [v]  [Lọc] │
│ role="status": 1 240 tài khoản                                           │
├────┬──────────────────────┬────────────┬──────────┬───────┬──────┬────────┤
│ ID │ Email · Tên          │ Vai trò    │ Premium  │ Bộ thẻ│ Tạo  │        │
├────┼──────────────────────┼────────────┼──────────┼───────┼──────┼────────┤
│ 17 │ a@x.vn · Nguyễn A    │ USER       │ Có       │ 12    │ 1/10 │ [Xem]  │
│ 18 │ b@x.vn · Trần B      │ ADMIN      │ —        │ —     │ 3/10 │ [Xem]  │
│ 19 │ c@x.vn · (chưa đặt)  │ USER 🔒Khoá│ Không    │ 0     │ 9/10 │ [Xem]  │
├────┴──────────────────────┴────────────┴──────────┴───────┴──────┴────────┤
│                                   ‹ Trước   Trang 1/62   Sau ›            │
└──────────────────────────────────────────────────────────────────────────┘
```

### 8.4 `/admin/users/:id` — Chi tiết người dùng
```
┌ ← Người dùng  ·  a@x.vn ─────────────────────────────────────────────────┐
│ Nguyễn A · USER · Premium · N3 · tạo 01/10/2026 · ôn gần nhất 16/10      │
│ Bộ thẻ 12 · Thẻ 480 · Bóc tách 23 (hôm nay 2/5) · Quiz 31 · Phiên 2      │
├──────────────────────────────────────────────────────────────────────────┤
│ Trạng thái*     [Khoá tài khoản]            (ADMIN+; ẩn nếu bậc ≥ mình)  │
│ Premium*        [x] Premium                                  [Lưu]       │
│ Hạn mức AI/ngày* ( ) Theo cấu hình chung (5)  ( ) Riêng: [___]  [Lưu]    │
│ Phiên đăng nhập* [Thu hồi mọi phiên]                                     │
│ Vai trò**       [v USER ▾ VIEWER / ADMIN / SUPER_ADMIN] [Đổi]            │
│                 (SUPER_ADMIN; disabled nếu là chính mình)                 │
├──────────────────────────────────────────────────────────────────────────┤
│ Nhật ký liên quan (5 gần nhất)  → xem tất cả                             │
│ 16/10 14:02  b@x.vn  USER_PREMIUM  {before:false, after:true}            │
└──────────────────────────────────────────────────────────────────────────┘
Confirm khoá (tone danger): "Khoá a@x.vn? Người này bị đăng xuất khỏi mọi thiết bị ngay." [Huỷ] [Khoá]
Confirm đổi role USER → staff: "a@x.vn sẽ không còn vào được phần học; bộ thẻ và tiến độ được giữ nguyên trong DB, hiện lại khi đổi về USER. Mọi phiên đăng nhập bị thu hồi." [Huỷ] [Đổi]
Khối Premium / Hạn mức AI ẩn khi người đang xem là staff (không áp dụng).
```

### 8.5 `/admin/decks` — Nội dung (tab Bộ thẻ · Bình luận · Bóc tách)
```
┌ Nội dung ───────────────────────────────────────────────────────────────┐
│ [Bộ thẻ] [Bình luận] [Bóc tách AI]      ← tab = link có aria-current     │
│ Tìm: [tiêu đề ______] Hiển thị [v public] Official [v] Featured [v] [Lọc]│
├──────────────────────┬─────────┬────────┬─────┬─────┬──────┬────────────┤
│ Tiêu đề · chủ        │ Hiển thị│ Cờ     │ Thẻ │ ★   │ Báo  │            │
├──────────────────────┼─────────┼────────┼─────┼─────┼──────┼────────────┤
│ N5 cơ bản · dongoc…  │ public  │ Official│ 20 │ 4.6 │ 0    │ [Xem]      │
│ Kanji lạ · a@x.vn    │ public  │ —      │ 55  │ 2.1 │ 2 ⚠  │ [Xem]      │
└──────────────────────┴─────────┴────────┴─────┴─────┴──────┴────────────┘
Tab Bình luận: | Bộ thẻ | Người | ★ | Bình luận (cắt 120) | Ngày | [Xoá bình luận]* (ADMIN+)
Tab Bóc tách:  | Người | Nguồn | Trạng thái·stage | Lỗi | Tạo | Xong | [Xoá]* (ADMIN+, ẩn khi đang chạy)
```

### 8.6 `/admin/decks/:id` — Chi tiết bộ thẻ (kiểm duyệt)
```
┌ ← Nội dung · Kanji lạ ───────────────────────────────────────────────────┐
│ Chủ a@x.vn · public · N4 · kanji · 55 thẻ · ★2.1 (9) · 120 lượt tải      │
│ ⚠ 2 báo cáo đang mở → xem                                                │
│ [Gỡ khỏi Thư viện]*  Official [x] Featured [ ] [Lưu]*  [Xoá bộ thẻ]*  (ADMIN+)│
├──────────────────────────────────────────────────────────────────────────┤
│ Thẻ (hiện vì bộ thẻ public / đang bị báo cáo; bộ private → "Nội dung riêng tư, không hiển thị") │
│ # │ Từ  │ Cách đọc │ Nghĩa (dòng đầu)                                      │
│ 1 │ 猫  │ ねこ     │ con mèo                                               │
└──────────────────────────────────────────────────────────────────────────┘
```

### 8.7 `/admin/reports` — Báo cáo
```
┌ Báo cáo ─────────────────────────────────────────────────────────────────┐
│ [Đang mở (3)] [Đã xử lý] [Đã bỏ qua]                                    │
├──────┬──────────────────┬───────────────┬───────────────┬──────┬─────────┤
│ Ngày │ Bộ thẻ           │ Người báo cáo │ Lý do         │ Cùng │         │
├──────┼──────────────────┼───────────────┼───────────────┼──────┼─────────┤
│ 16/10│ Kanji lạ (public)│ c@x.vn        │ Sai nội dung  │ 2    │ [Xử lý]*│
│ 15/10│ Bài 3 (private)  │ d@x.vn        │ Bản quyền     │ 1    │ [Xử lý]*│
└──────┴──────────────────┴───────────────┴───────────────┴──────┴─────────┘
Modal "Xử lý báo cáo #41" (Modal size lg, ADMIN+; VIEWER chỉ có [Xem]):
│ Bộ thẻ: Kanji lạ · chủ a@x.vn · public   [Mở bộ thẻ ↗]                   │
│ Lý do: Sai nội dung — "Nghĩa thẻ 12 sai hoàn toàn"                        │
│ Hành động: ( ) Không làm gì  (•) Gỡ khỏi Thư viện  ( ) Xoá bình luận      │
│   └ khi chọn "Xoá bình luận": Bình luận [v c@x.vn ★1 "Lừa đảo…" ]  (ratingId)│
│ Ghi chú: [____________________________] (≤500)                            │
│                                   [Bỏ qua báo cáo]   [Huỷ]   [Xác nhận]   │
"Gỡ khỏi Thư viện" bị disabled kèm chú thích khi bộ thẻ đã private; "Xoá bình luận" disabled khi bộ thẻ không có bình luận.
```

### 8.8 `/admin/audit` — Nhật ký
```
┌ Nhật ký quản trị ────────────────────────────────────────────────────────┐
│ Người thao tác [v Tất cả] Đối tượng [v USER/DECK/REPORT/…] Từ [date] Đến [date] [Lọc]│
├────────────────┬───────────┬──────────────────┬────────────┬─────────────┤
│ Lúc            │ Ai        │ Hành động        │ Đối tượng  │ Chi tiết    │
├────────────────┼───────────┼──────────────────┼────────────┼─────────────┤
│ 16/10 14:02:11 │ b@x.vn    │ DECK_UNPUBLISH   │ DECK k9f…  │ {visibility: public→private} │
│ 16/10 13:50:03 │ root@x.vn │ SETTINGS_UPDATE  │ SETTINGS   │ {free: 5→10}│
└────────────────┴───────────┴──────────────────┴────────────┴─────────────┘
```

### 8.9 `/admin/settings` — Cấu hình (SUPER_ADMIN sửa, staff khác chỉ đọc)
```
┌ Cấu hình hệ thống ──────────────── cập nhật 16/10 13:50 bởi root@x.vn ──┐
│ Lượt bóc tách / ngày · Free     [ 5  ] (0–1000)                           │
│ Lượt bóc tách / ngày · Premium  [ 50 ] (0–1000)                           │
│ Thông báo toàn hệ thống         [________________________] (≤300, rỗng=tắt)│
│ Mở đăng ký tài khoản mới        [x]                                       │
│                                                     [Lưu thay đổi]*       │
│ (VIEWER/ADMIN: mọi ô disabled + dòng "Chỉ Super admin được sửa")          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 8.10 Phía người học — nút "Báo cáo" (DeckDetailPage / LibraryPreviewModal, chỉ bộ thẻ public không phải của mình)
```
[⚑ Báo cáo]  → Modal "Báo cáo bộ thẻ"
│ Lý do: (•) Sai nội dung ( ) Vi phạm bản quyền ( ) Xúc phạm ( ) Spam ( ) Khác │
│ Mô tả thêm: [__________________________] (≤500, bắt buộc khi "Khác")      │
│                                                  [Huỷ]  [Gửi báo cáo]     │
Sau gửi: toast role="status" "Đã gửi, cảm ơn bạn." · đã báo cáo rồi → nút đổi thành "Đã báo cáo" (disabled).
```

### 8.11 Banner thông báo (người học, đầu `AppLayout`)
```
┃ ℹ Hệ thống bảo trì 22:00–23:00 ngày 20/10. Dữ liệu được giữ nguyên.        [×] ┃
(role="status"; nút × chỉ ẩn trong phiên, không lưu server)
```

### 8.12 Trang đăng nhập (không đổi giao diện)
Sau đăng nhập, `role` trong `AuthResponse`: staff → `/admin`; USER → `/` hoặc `state.from`. Staff gõ tay `/decks` → về `/admin`; USER gõ `/admin` → về `/`.

---

## 9. Test case

Ký hiệu loại: **C** = luồng chính, **N** = ngoại lệ, **E** = edge case. Nơi test: `*IT` kế thừa `IntegrationTest` (Postgres nhúng); hàm thuần → `*Test`; FE thuần → `selfCheck.ts`.

### 9.1 Phân quyền & vai trò — `AdminAuthorizationIT`
| ID | Loại | Bước | Kỳ vọng |
|---|---|---|---|
| AZ-01 | C | `@ParameterizedTest` cho **mọi** endpoint mục 5 × 4 vai trò | Mã trả về ≠ 403 ⇔ bậc ≥ cột "Vai trò"; USER luôn 403 ở `/api/admin/**` |
| AZ-02 | N | Không token gọi `/api/admin/stats` | 401 (không phải 403) |
| AZ-03 | C | SUPER_ADMIN đổi role của USER → VIEWER; người đó đăng nhập lại rồi gọi `/api/admin/stats` | 200 |
| AZ-04 | C | Giáng VIEWER → USER; access token cũ (còn hạn) gọi `/api/admin/stats` | 403 ngay (authority nạp từ DB) |
| AZ-05 | N | SUPER_ADMIN đổi role của chính mình | 400 |
| AZ-06 | — | (bỏ) Giáng SUPER_ADMIN cuối cùng không thể xảy ra qua API, xem 3.3 mục 3 | — |
| AZ-07 | N | `PUT /role` với `{"role":"MODERATOR"}` / `"ROOT"` | 400 (enum) |
| AZ-08 | C | Mỗi hành động đổi role sinh 1 dòng audit `USER_ROLE` `{before,after}` và thu hồi refresh token của người đó | đúng 1 dòng; refresh cũ → 401 |
| AZ-09 | E | `RoleHierarchy` áp dụng cho `@PreAuthorize`: SUPER_ADMIN gọi endpoint `hasRole('ADMIN')` | 200 |
| AZ-10 | C | **Chiều ngược (D2):** VIEWER / ADMIN / SUPER_ADMIN gọi `GET /api/decks`, `POST /api/decks`, `GET /api/library/decks`, `POST /api/library/decks/n5-core/reports`, `GET /api/quizzes/n5-core` | 403 tất cả |
| AZ-11 | C | Staff gọi `GET /api/auth/me`, `PUT /api/auth/password`, `GET /api/announcement` | 200 |
| AZ-12 | E | USER có 3 bộ thẻ được thăng lên VIEWER rồi giáng về USER | `GET /api/decks` lại trả 3 bộ, review không mất (D3) |

### 9.2 Khoá tài khoản & phiên — `AdminUserIT`
| ID | Loại | Bước | Kỳ vọng |
|---|---|---|---|
| US-01 | C | ADMIN khoá USER | 200, `lockedAt` có giá trị, audit `USER_LOCK` |
| US-02 | C | Sau US-01, người bị khoá đăng nhập đúng mật khẩu | 403 "Tài khoản đã bị khoá…" (từ `LockedException`) |
| US-03 | C | Sau US-01, access token còn hạn gọi `GET /api/decks` | 401 |
| US-04 | C | Sau US-01, `POST /auth/refresh` bằng refresh token cũ | 401 (đã `revokeAll`) |
| US-05 | C | Mở khoá rồi đăng nhập lại | 200 |
| US-06 | N | ADMIN khoá ADMIN khác / SUPER_ADMIN | 403 |
| US-07 | N | ADMIN khoá chính mình | 400 |
| US-08 | E | Khoá người đã khoá (idempotent) | 200, **không** sinh audit mới (không có thay đổi) |
| US-09 | C | Đặt `extractionDailyLimit = 0` rồi người đó bóc tách | 429 ngay lượt đầu |
| US-10 | C | `clearLimit = true` → quay về cấu hình chung | lượt thứ 6 mới 429 (free=5) |
| US-11 | N | `extractionDailyLimit = 1001` / `-1` | 400 từ validation DTO (`@Min/@Max`), chưa chạm tới CHECK ở DB |
| US-12 | C | `revoke-sessions` | 204; refresh cũ 401; access cũ 401 (`password_changed_at`); đăng nhập lại OK, **mật khẩu không đổi** |
| US-13 | C | Bật premium | `GET /auth/me` của người đó `isPremium=true`; hạn mức dùng `…_premium` |
| US-14 | E | `PATCH` body rỗng `{}` | 200, không đổi gì, không audit |
| US-15 | E | Tìm `q="%"` / `q="_"` | Không khớp tất cả (đã escape); `q` 101 ký tự → 400 |
| US-16 | E | `page=-1`, `size=0`, `size=101` | 400 |
| US-17 | E | Chi tiết user có 0 bộ thẻ, chưa ôn bao giờ | các đếm = 0, `lastReviewAt = null`, 200 |
| US-18 | N | `GET /users/999999` | 404 |
| US-19 | E | ADMIN khoá VIEWER (bậc thấp hơn) | 200; VIEWER gọi `/api/admin/stats` → 401 |

### 9.3 Nội dung — `AdminContentIT`
| ID | Loại | Bước | Kỳ vọng |
|---|---|---|---|
| CT-01 | C | ADMIN `unpublish` bộ thẻ public | `visibility=private`; chủ vẫn mở được (`access=owner`); người khác `GET /api/decks/{id}` 404; biến mất khỏi `/api/library/decks` |
| CT-02 | E | `unpublish` bộ thẻ đã private | 200 không đổi, không audit |
| CT-03 | C | ADMIN đặt `official=true, featured=true` | Thư viện `featured` trả bộ này; audit `DECK_FLAGS` |
| CT-04 | C | ADMIN xoá bộ thẻ có share, rating, review, quiz_attempt | 204; các bảng con sạch (FK cascade); chủ `GET /api/decks` không còn |
| CT-05 | N | VIEWER xoá bộ thẻ | 403 (AZ-01 bao, nhắc lại vì phá huỷ) |
| CT-06 | C | `GET /admin/decks/{id}` bộ private không bị báo cáo | `cards: null` |
| CT-07 | C | Cùng bộ đó sau khi có 1 báo cáo OPEN | `cards` có dữ liệu; sau khi report resolved → lại `null` |
| CT-08 | C | Xoá bình luận | `comment=null`, `stars` giữ nguyên, `GET /library/decks/{id}/ratings` trung bình không đổi |
| CT-09 | E | Xoá bình luận của rating không có comment | 204, không audit |
| CT-10 | C | `GET /admin/extractions` | không có trường `extractedText` trong JSON (assert `isMissingNode`) |
| CT-11 | N | Xoá job `RUNNING` / job `purpose=learning_path` | 409 |
| CT-12 | E | Lọc `visibility=foo` | 400 |
| CT-13 | E | Danh sách bộ thẻ có bộ 0 rating | `avgStars=null`, không chia cho 0 |

### 9.4 Báo cáo — `ContentReportIT`
| ID | Loại | Bước | Kỳ vọng |
|---|---|---|---|
| RP-01 | C | USER báo cáo bộ public của người khác | 201, `status=OPEN`, `stats.openReports` +1 |
| RP-02 | N | Báo cáo bộ thẻ của mình | 400 |
| RP-03 | N | Báo cáo bộ private / không tồn tại | 404 (không lộ tồn tại) |
| RP-04 | N | Báo cáo lần 2 khi còn OPEN | 409 (partial unique index → `DataIntegrityViolation` → 409) |
| RP-05 | C | Sau khi báo cáo cũ RESOLVED, báo cáo lại | 201 |
| RP-06 | N | `reason=OTHER` không `detail` | 400 |
| RP-07 | N | `detail` 501 ký tự | 400 |
| RP-08 | N | 11 báo cáo / giờ (11 bộ khác nhau) | lần 11 → 429 |
| RP-09 | C | ADMIN resolve `UNPUBLISH_DECK` | deck private, report `RESOLVED` + `resolved_by/at`, audit `REPORT_RESOLVE` + `DECK_UNPUBLISH` (2 dòng, cùng tx) |
| RP-10 | C | ADMIN resolve `CLEAR_COMMENT` kèm `ratingId` | `comment` của rating đó = null, sao giữ; thiếu `ratingId` → 400; `ratingId` thuộc bộ thẻ khác → 400; audit `REPORT_RESOLVE` + `RATING_CLEAR_COMMENT` |
| RP-11 | N | Resolve lần 2 / dismiss sau resolve | 409 (`UPDATE … WHERE status='OPEN'` ảnh hưởng 0 dòng) |
| RP-12 | E | 2 admin resolve cùng lúc (2 thread) | đúng 1 thành công, 1 nhận 409, audit chỉ 1 dòng |
| RP-13 | E | Resolve `UNPUBLISH_DECK` khi bộ đã private | 200, deck không đổi, chỉ audit `REPORT_RESOLVE` |
| RP-14 | E | Bộ thẻ bị xoá khi còn report OPEN | report biến mất (FK cascade), `openReports` giảm |
| RP-15 | C | Lọc `status=OPEN` sắp xếp mới nhất trước; `sameDeckOpen` đếm đúng | đúng |

### 9.5 Cấu hình & thông báo — `AdminSettingsIT`
| ID | Loại | Bước | Kỳ vọng |
|---|---|---|---|
| ST-01 | C | SUPER_ADMIN đặt free=2; USER free bóc tách 3 lần | lần 3 → 429, **không restart** |
| ST-02 | N | free = `-1` / `1001` / `"abc"` | 400 |
| ST-03 | N | `announcement` 301 ký tự | 400 |
| ST-04 | C | `announcement="Bảo trì"` → USER `GET /api/announcement` | `{text:"Bảo trì"}`; đặt rỗng → `{text:""}` |
| ST-05 | C | `registration_open=false` → `POST /auth/register` | 403 "Tạm ngừng đăng ký"; đăng nhập vẫn OK |
| ST-06 | N | Body thiếu 1 trong 4 khoá | 400 |
| ST-07 | C | Mỗi lần PUT có đổi → audit `SETTINGS_UPDATE` `{before,after}` chỉ các khoá đổi | đúng; PUT không đổi gì → không audit |
| ST-08 | E | Migration seed: DB mới có đủ 4 dòng; chạy lại Flyway không nhân đôi | `SELECT count(*)=4` |

### 9.6 Thống kê — `AdminStatsIT` + `AdminStatsServiceTest` (hàm thuần)
| ID | Loại | Bước | Kỳ vọng |
|---|---|---|---|
| SS-01 | C | DB chỉ có staff + seed | mọi đếm ≥ 0, `series` đủ `days` phần tử kể cả ngày 0 |
| SS-02 | C | Tạo 2 user, 1 job, 1 quiz hôm nay | `new7d=2`, `series[last].extractions=1` |
| SS-03 | E | `days=6` / `days=91` | 400 |
| SS-04 | E | Ngày không có dữ liệu ở giữa chuỗi | điền 0 (hàm thuần `fillMissingDays(rows, from, to)` — **test đơn giản**) |
| SS-05 | E | Múi giờ: job tạo 23:30 UTC = 06:30 hôm sau VN | tính vào ngày VN |
| SS-06 | C | `active7d` đếm distinct | 1 user ôn 10 lần = 1 |
| SS-07 | C | `/health` khi ai-service tắt | 200 `{aiService:"down"}` (không 500, không treo quá timeout 2s) |

### 9.7 Audit — `AdminAuditIT`
| ID | Loại | Bước | Kỳ vọng |
|---|---|---|---|
| AU-01 | C | Lọc `actorId`, `targetType=DECK`, `from/to` | đúng tập |
| AU-02 | N | Service ném lỗi **sau** khi gọi `auditService.log` (giả lập bằng ID không tồn tại ở bước sau) | không có dòng audit (cùng transaction rollback) |
| AU-03 | E | `detail` không chứa `passwordHash`/`token` ở mọi action (duyệt JSON) | assert không có khoá nhạy cảm |
| AU-04 | C | Không tồn tại route `PUT/DELETE /api/admin/audit-logs/**` | 405/404 |

### 9.8 Frontend — `scripts/selfCheck.ts` (hàm thuần) + kiểm tay
| ID | Loại | Bước | Kỳ vọng |
|---|---|---|---|
| FE-01 | C | `atLeast('ADMIN','VIEWER')=true`, `atLeast('VIEWER','ADMIN')=false`, `isStaff('USER')=false`, `atLeast(undefined,'VIEWER')=false` | assert |
| FE-02 | C | `toPercentHeights([0,5,10])=[0,50,100]`; mảng toàn 0 → toàn 0 (không chia 0) | assert |
| FE-03 | C (tay) | Đăng nhập USER: vào `/`, gõ `/admin` → về `/` | |
| FE-04 | C (tay) | Đăng nhập VIEWER: vào thẳng `/admin`, gõ `/decks` → về `/admin`; thấy bảng, mọi nút ghi ẩn. ADMIN thấy nút ghi, không thấy "Lưu" ở Cấu hình | |
| FE-05 | N (tay) | Backend trả 403 (role vừa bị giáng) khi bấm nút | hiện "Bạn không có quyền…" (đã có trong `extractErrorMessage`) |
| FE-06 | E (tay) | Bàn phím: Tab tới mọi nút, Esc đóng modal, focus trả về nút mở; screen reader đọc `caption` và `role="status"` | |
| FE-07 | E (tay) | Màn 360px: bảng cuộn ngang, sidebar admin gập, không vỡ layout | |

---

## 10. Chiến lược bảo mật theo module

### 10.1 Chung
- **Ba dòng khai báo, không code tay:** `/api/admin/**` → `VIEWER`, `anyRequest` → `USER`, `@PreAuthorize` trên từng method ghi nâng bậc. Thiếu annotation = mặc định chỉ đọc (fail-safe). Staff không chạm được dữ liệu học (D2) nên không có đường "vừa kiểm duyệt vừa là chủ bộ thẻ".
- **Authority từ DB mỗi request** (giữ nguyên): thu hồi quyền tức thì, không phụ thuộc hạn JWT 15 phút.
- **Validation ở biên:** DTO `@Valid` (`@Min/@Max/@Size/@Pattern`), enum cho mọi giá trị rời rạc, `page/size/q` giới hạn; DB CHECK/unique/FK là lưới cuối (409 qua `ApiExceptionHandler`).
- **Không lộ dữ liệu riêng tư:** không trả `extracted_text`, không trả `passwordHash` (đã `@JsonIgnore`), thẻ của bộ private chỉ khi đang bị báo cáo.
- **Audit bắt buộc** trong cùng `@Transactional`; không endpoint sửa/xoá; `detail` chỉ `{before, after}` của trường đổi.
- **Rate limit:** không áp lên staff (ít người, có audit); áp lên người học ở endpoint báo cáo (10/giờ theo `userId`, `AttemptLimiter`).
- **CSRF:** không áp dụng (JWT trong header, stateless, không cookie). CORS giữ allowlist hiện tại.
- **Log server:** `WARN` cho 403 ở `/api/admin/**` kèm `userId` (không email), giúp phát hiện dò quyền.
- Step-up auth (nhập lại mật khẩu) cho đổi role / settings → bỏ qua, thêm khi có 2FA. Audit + chỉ SUPER_ADMIN đã giới hạn.
- IP allowlist cho admin → bỏ qua, thêm khi deploy có reverse proxy cố định (làm ở Nginx, không ở app).

### 10.2 Người dùng
- Khoá = 3 điểm chặn native: `isAccountNonLocked()` (login), filter (access token), `refresh` (refresh token) + `revokeAll`.
- Bậc thấp hơn mới được thao tác; không tự thao tác (hệ quả: luôn còn ≥ 1 SUPER_ADMIN); đổi role thu hồi phiên.
- Thông điệp khoá **không** tiết lộ lý do nội bộ; thông điệp đăng nhập sai mật khẩu vs khoá khác mã (401 vs 403): chấp nhận lộ "tài khoản tồn tại" vì người đó đã có mật khẩu đúng.

### 10.3 Nội dung
- Gỡ (private) là hành động mặc định, xoá qua confirm; xoá dùng chung hàm có sẵn (cascade đã test ở `FolderDeleteIT`/`DeckIntegrityIT`).
- Xem thẻ bộ private: chỉ khi có báo cáo OPEN (nhu cầu kiểm duyệt có căn cứ). Audit cho thao tác **đọc** → bỏ qua, thêm khi có yêu cầu tuân thủ; hiện chỉ audit thao tác ghi.
- Tìm kiếm: tham số bind JPA, escape `%`/`_`, `lower()` đã có index biểu thức ở Thư viện.

### 10.4 Báo cáo
- Chỉ bộ public (404 cho private: không lộ tồn tại), không tự báo cáo, 1 OPEN/người/bộ (partial unique index), 10/giờ.
- Resolve atomic bằng `UPDATE … WHERE status='OPEN'`; hành động kèm theo trong cùng tx; mọi thứ audit.
- `detail` của người báo cáo chỉ hiện cho staff; không echo HTML (React escape mặc định).

### 10.5 Cấu hình
- Khoá cố định bằng CHECK, giá trị kiểm theo khoá trong `SettingsService` (int range / độ dài / boolean); chỉ SUPER_ADMIN ghi; audit diff.
- `announcement` hiển thị dạng text thuần (không Markdown/HTML) → không XSS.
- Bí mật (JWT, DB, SMTP, Gemini) **không bao giờ** vào `app_settings` hay trả về API.

### 10.6 Sao lưu
- Script dùng `PGPASSWORD` từ env / `application-local.properties`, không ghi vào git; thư mục `backups/` vào `.gitignore`; restore thử trên Postgres nhúng (`npm run e2e` đã có hạ tầng) trước khi tin bản dump.

---

## 11. Rủi ro

1. `RoleHierarchy` + `@EnableMethodSecurity` + `anyRequest().hasRole("USER")` là thay đổi toàn cục: mọi test tích hợp cũ dùng `newUser()` (role USER) nên vẫn chạy; AZ-01/AZ-10 là lưới an toàn.
2. Đổi CHECK `users_role_check` trên Supabase cần `MIGRATION_DB_URL` cổng 5432 (đã ghi ở `application.properties`); sao lưu trước khi chạy V14.
3. `AttemptLimiter` trong RAM: chạy nhiều instance thì hạn mức báo cáo tính riêng từng instance (đã ghi chú sẵn trong class).
4. Tài khoản đang có `role='ADMIN'` trong DB (nếu có) tự động mất quyền học sau V14 (D2). Kiểm tra `SELECT email FROM users WHERE role <> 'USER'` trước khi deploy; đưa về USER nếu đó là người học.

---

## 12. Thứ tự triển khai (chi tiết ở [plans/2026-10-17-admin-panel.md](../plans/2026-10-17-admin-panel.md))
1. V14 + `Role` + khoá tài khoản + `RoleHierarchy` + 3 dòng `requestMatchers` + `AdminAuthorizationIT` (AZ-01/AZ-10 trước, mọi endpoint stub).
2. Settings + ExtractionService đọc DB + announcement + `registration_open`.
3. Người dùng (list/detail/lock/premium/limit/revoke/role) + audit.
4. Nội dung (decks/ratings/extractions).
5. Báo cáo (user-side + admin).
6. Stats + health.
7. Frontend: `roles.ts` → `ProtectedRoute`/điều hướng → `AdminLayout` → 7 trang → `ReportDeckModal` → banner.
8. Script backup + cập nhật `SUPABASE_SETUP.md`, `CODEBASE_MAP.md`, `USE_CASES_CHECKLIST.md`, `CHANGELOG.md`.
