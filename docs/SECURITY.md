# Bảo mật ứng dụng (rà soát 27/10/2026)

Tài liệu này gom các lớp bảo vệ đang có trong mã để nhóm biết đâu là mặc định của hệ thống, đâu là việc phải làm khi triển khai.
Tệp cấu hình: `backend-core/src/main/resources/application.properties` (biến môi trường ghi trong ngoặc).

## 1. Tài khoản và mật khẩu

| Lớp | Mã | Hành vi |
|---|---|---|
| Chính sách mật khẩu | `security/PasswordPolicy`, `@StrongPassword` | 8–72 ký tự, ít nhất một chữ cái, một chữ số, một ký tự đặc biệt; không khoảng trắng đầu / cuối. Áp cho đăng ký, đổi mật khẩu, đặt lại mật khẩu, `/setup` của staff. Frontend lặp quy tắc ở `lib/passwordRules.ts` để báo sớm. Mật khẩu cũ không bị ép đổi. |
| Băm mật khẩu | `SecurityConfig.passwordEncoder` | BCrypt (72 byte đầu). |
| Xác thực email | `EmailVerificationService`, `app_settings.email_verification_required` | Tài khoản mới không đăng nhập được tới khi bấm link (token 24 giờ, SHA-256 trong DB). Email chưa xác thực **đăng ký lại được**: nhận mật khẩu / họ tên mới và link mới (ai giữ hộp thư mới xác thực được). `HousekeepingJob` **xoá tài khoản chưa xác thực quá 48 giờ** (03:30 mỗi đêm); admin lọc "Chưa xác thực" ở Người dùng. |
| Chặn dò mật khẩu | `LoginAttemptLimiter` | Hai lớp: 5 lần sai / phút theo (IP, email) và **20 lần sai / 15 phút theo email từ mọi IP** (khoá kể cả khi lần sau đúng). Đăng nhập đúng xoá bộ đếm. Bộ đếm trong RAM. |
| Hạn mức đăng ký | `RegisterRateLimiter` (`app.rate-limit.register.*`) | Mặc định 30 tài khoản / giờ / IP. IP thật sau proxy: `server.forward-headers-strategy`. |
| Phiên | `JwtTokenProvider`, `RefreshTokenService` | Access token JWT 15 phút (`jwt.expiration`), refresh token ngẫu nhiên 3 ngày hạn trượt (`jwt.refresh-expiration`), DB chỉ lưu SHA-256; đổi / đặt lại mật khẩu, khoá tài khoản, xoá tài khoản thu hồi mọi refresh token. |
| Khoá tài khoản | `AdminUserService` | Admin khoá kèm lý do; người bị khoá gửi khiếu nại không cần đăng nhập. Tài khoản tự xoá được ẩn danh hoá (`@deleted.local`), khoá vĩnh viễn. |
| Staff | `Role`, `RoleHierarchy` | Một tài khoản một vai trò; staff không dùng API học; mật khẩu seed phải đổi ở `/setup`. |

## 2. HTTP

- **Header bảo mật** (`SecurityConfig.headers`, mọi phản hồi API): `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`,
  `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'` (trừ Swagger UI), `Cache-Control: no-store`,
  HSTS 1 năm khi chạy HTTPS. Frontend là SPA ở origin khác nên CSP của API không ảnh hưởng giao diện.
- **CORS**: chỉ các origin trong `app.cors.allowed-origins` (không dùng `*`); origin lạ nhận 403 JSON.
- **Stateless**: không session, không cookie → không cần CSRF token; mọi API trừ đăng nhập / đăng ký / quên mật khẩu / xác thực
  email / khiếu nại đều cần Bearer token; thiếu → 401, sai quyền → 403.
- **Validation**: mọi body qua `@Valid` (độ dài, định dạng); lỗi trả `{status, error, message, code?}` tiếng Việt, không lộ stack.
- **Hạn mức theo tính năng**: bình luận từ điển 20 / giờ, báo cáo 10 / giờ, dịch AI theo giờ (cấu hình), tách câu 60 / phút, vẽ chữ
  120 / phút, mật khẩu link chia sẻ sai 10 lần / 15 phút, gửi lại link xác thực 5 lần / 15 phút.

## 3. Dữ liệu người dùng

- Bộ thẻ riêng tư chỉ chủ và người được mời (email) xem; link riêng (`/d/<token>`, token 32 byte ngẫu nhiên) **có thể đặt mật
  khẩu** (BCrypt, không bao giờ trả lại); đổi link = link cũ hết hiệu lực.
- Xuất CSV chặn công thức (ô bắt đầu bằng `= + - @` được thêm `'`), tên tệp ASCII + `filename*` UTF-8.
- ai-service chỉ nhận request có `X-Internal-Key` (`AI_SERVICE_KEY`); thiếu khoá chỉ chấp nhận localhost.
- Nhật ký admin (`audit_logs`) cho mọi thao tác quản trị.

## 3a. Đồ thị tri thức (Neo4j, 27/10)

- Neo4j chỉ ai-service nối tới (`NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD`); backend đi qua `/api/graph/*` với khoá nội bộ. **Không
  mở cổng 7474 / 7687 ra ngoài**; đổi `NEO4J_AUTH` trong `docker-compose.yml` khi triển khai (mật khẩu mặc định `password123` chỉ
  cho dev — ai-service cảnh báo khi URI không phải localhost mà vẫn dùng mặc định).
- Trong Neo4j **không có PII**: node `User` chỉ có id + cấp JLPT; thẻ cắt `meaning` 200 ký tự; staff và tài khoản đã xoá không đồng bộ.
- `userId` của mọi truy vấn lấy từ JWT ở backend; Cypher chỉ trả thẻ / bộ thẻ / lộ trình có `ownerId` trùng người hỏi; đường nối
  ngắn nhất chỉ đi qua quan hệ lớp tham chiếu. Hạn mức: hỏi đáp 20 / giờ, khám phá 120 / phút, tự đồng bộ 1 / phút / người;
  build / sync toàn bộ chỉ ADMIN và ghi `audit_logs`.
- Mọi Cypher tham số hoá (không ghép chuỗi người dùng), có `LIMIT`; câu hỏi GraphRAG ≤ 300 ký tự, Gemini chỉ nhận ngữ cảnh đã cắt
  (≤ 24 mẩu / 6 000 ký tự).

## 3b. Kiểm duyệt bình luận bằng AI (27/10 đêm, V38)

- Văn bản người dùng (bình luận từ điển, bình luận đánh giá, mẹo nhớ, tên hiển thị) chỉ đi backend → ai-service nội bộ (`X-Internal-Key`),
  không gửi dịch vụ ngoài; model nằm ở `ai-service/models/` (không commit, `MANIFEST.json` có sha256).
- Bình luận AI chặn **không mất**: chỉ chủ thấy, admin khôi phục được, tự xoá sau 30 ngày; bình luận gắn cờ che từ cho người khác tới khi
  admin xử lý. Mọi thao tác admin ghi `admin_audit_logs` (`MOD_IGNORE / MOD_RESTORE / MOD_HIDE / MOD_DELETE / MOD_RESCAN`, `DICT_SENSITIVE`,
  `USER_COMMENT_LOCK / UNLOCK`).
- Khoá bình luận mềm (3 lần bị chặn / 24 giờ → 24 giờ) không khoá tài khoản, không thu hồi phiên; admin mở sớm ở chi tiết người dùng.
- ai-service lỗi không chặn người dùng: bình luận ở `PENDING`, job quét lại; tên hiển thị cho qua. Ngưỡng cố định trong `ModerationPolicy`
  (không nhận từ client).

## 4. Việc phải làm khi triển khai (không nằm trong mã)

1. **Đổi ngay** mật khẩu Supabase và `JWT_SECRET` đã từng bị commit (21/10) — lịch sử git vẫn còn bản cũ.
2. Cấu hình SMTP (`SPRING_MAIL_*`, `MAIL_FROM`, `FRONTEND_URL`): thiếu thì email xác thực / quên mật khẩu / nhắc học không đi
   (dashboard admin hiện chấm đỏ "Email (chưa cấu hình SMTP)", `GET /api/admin/health` có `mail: missing`).
3. Chạy sau reverse proxy HTTPS; đặt `FORWARD_HEADERS_STRATEGY` đúng để IP thật tới các bộ giới hạn. Đặt `AI_SERVICE_KEY` ở cả
   backend lẫn ai-service — thiếu thì backend ghi WARN lúc khởi động (B5.7) và ai-service chỉ nhận request từ localhost.
4. Sao lưu DB (`scripts/backup.*`, `app.backup.marker`) và xoay vòng `AI_SERVICE_KEY`.
5. Khi có nhiều instance: các bộ đếm trong RAM (đăng nhập sai, hạn mức) không chia sẻ — cần Redis nếu mở rộng.
6. Neo4j: đổi mật khẩu mặc định, không mở cổng ra Internet, sao lưu volume `neo4jdata` (dựng lại được từ dữ liệu: Admin › Dựng lại
   đồ thị + Đồng bộ dữ liệu học).
7. Model kiểm duyệt: chép `vihsd_cnn_lstm.npz` (+ `phobert_hatespeech_best.pt`, `phobert-base/` nếu máy ≥ 1 GB RAM trống) vào
   `ai-service/models/` bằng `scripts/fetch_models.py`; thiếu → bình luận ở PENDING cho tới khi có model (xem cờ `moderation` ở health).
