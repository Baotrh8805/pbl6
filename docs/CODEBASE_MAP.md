# Bản Đồ Mã Nguồn (Codebase Map)

Trả lời câu hỏi: **"Muốn sửa hay thêm một tính năng thì vào tệp nào?"**
Đường dẫn backend viết tắt từ `backend-core/src/main/java/com/pbl6/flashcard/`, frontend từ `frontend/src/`.
Cập nhật 30/09/2026 theo commit `0d90c0f`. Tiến độ: [TEAM_GUIDELINES.md](TEAM_GUIDELINES.md#-1-bảng-theo-dõi-tiến-độ-dự-án-progress-tracker).

---

## 1. Bảng tra cứu nhanh

| Mục tiêu | Tệp cần mở |
| :--- | :--- |
| Cấu hình DB, JWT, CORS, proxy, giới hạn đăng ký | `backend-core/src/main/resources/application.properties` (bí mật để trong `application-local.properties` / biến môi trường, xem [SUPABASE_SETUP.md](SUPABASE_SETUP.md)) |
| Gửi email quên mật khẩu (SMTP / Gmail) | `application-local.properties` (`spring.mail.*`), xem [SUPABASE_SETUP.md](SUPABASE_SETUP.md#5-gửi-email-quên-mật-khẩu-smtp) |
| Đổi schema DB | Thêm `V<n>__mo_ta.sql` mới trong `backend-core/src/main/resources/db/migration/` (Flyway). **Không** sửa file đã chạy, **không** tạo bảng tay |
| Bộ thẻ mẫu của Thư viện | `db/migration/R__seed_system_decks.sql` |
| API công khai (không cần đăng nhập) | `config/SecurityConfig.java` |
| Định dạng lỗi JSON `{status, error, message}` | `config/ApiExceptionHandler.java` |
| Đăng ký / đăng nhập / hồ sơ / đổi & quên mật khẩu | `controller/AuthController.java`, `service/AuthService.java`, `service/RefreshTokenService.java` (refresh token hạn trượt), `service/PasswordResetService.java`. Frontend: `services/apiClient.ts` (tự làm mới token khi 401), `services/tokenStorage.ts` |
| Chống dò mật khẩu, chặn tạo tài khoản hàng loạt | `security/AttemptLimiter.java` (+ `LoginAttemptLimiter`, `RegisterRateLimiter`) |
| Thư mục lồng nhau + chia sẻ thư mục | `controller/FolderController.java`, `service/FolderService.java`, `repository/FolderRepository.java` (`isSharedWith`) |
| Bộ thẻ, thẻ, chia sẻ bộ thẻ, quyền truy cập | `controller/StudyController.java`, `service/DeckService.java` (`access(...)`) |
| Thư viện cộng đồng (tìm, lọc, chấm sao) | `controller/LibraryController.java`, `service/LibraryService.java`, `repository/DeckRepository.java` |
| Thuật toán ôn tập SRS | `service/SrsService.java` (server) — `frontend/src/lib/srs.ts` chỉ đọc lịch |
| Quiz: sinh đề, chấm điểm, lượt làm có hạn giờ | `service/QuizService.java`, `service/DeckService.java` (`quiz`, `submitQuiz`), `model/QuizAttempt.java` |
| Gọi API từ frontend | `frontend/src/services/*.ts`, `features/auth/services/authService.ts` |
| Kiểu dữ liệu khớp DTO backend | `frontend/src/types/api.types.ts` |
| Route trang | `frontend/src/routes/AppRoutes.tsx` |
| Số liệu dashboard dùng chung (tự tải lại sau mỗi thao tác ghi) | `frontend/src/components/layout/AppLayout.tsx` |
| AI (OCR, NLP, Kanji, phát âm) | `ai-service/app/api/*.py` — hiện là khung sườn / mock, backend chưa gọi tới |

---

## 2. Backend (`backend-core`, Spring Boot 3.5, Java 17)

### Quyền truy cập bộ thẻ (`DeckService.access`)
Chủ > được chia sẻ riêng bộ thẻ (`deck_shares`: VIEWER/EDITOR) > bộ thẻ public (Thư viện) hoặc nằm trong thư mục
được chia sẻ (`folder_shares`, hoặc thư mục `accessType = public`) = chỉ xem & học. Không có quyền = 404.

- `GET /api/decks`: "Bộ thẻ của tôi" = bộ thẻ sở hữu (gồm bản đã lưu từ Thư viện) + bộ được chia sẻ qua email.
  Bộ thẻ public của người khác chỉ có ở `GET /api/library/decks`.
- `GET /api/decks?folderId=`: bộ thẻ trong thư mục của mình hoặc thư mục được chia sẻ cho mình.

### Thư mục
- `GET /api/folders` (cây của mình), `GET /api/folders/shared` (người khác chia sẻ), `GET /api/folders/{id}`.
- Chia sẻ: `GET|PUT /api/folders/{id}/shares`, `DELETE /api/folders/{id}/shares/{userId}`,
  `PUT /api/folders/{id}/link-access` (`{"public": true}` = ai có link đều xem được).
- Xoá thư mục cha không xoá con: con và bộ thẻ được đưa về gốc.

### Quiz
- `GET /api/quizzes/{deckId}?size=` phát đề + mở lượt làm (`attemptId`, hạn giờ 30 giây/câu + 60 giây dự phòng).
- `POST /api/quizzes/{deckId}` `{attemptId, answers}`: chấm trên mọi câu đã phát (bỏ trống = sai), nộp 1 lần.
  Lượt bỏ dở quá hạn được ghi 0 điểm.
- `GET /api/quizzes/{deckId}/preview`: câu mẫu, không mở lượt làm.

### Auth
- `POST /api/auth/register|login|forgot-password|reset-password` (công khai), `GET /api/auth/me`,
  `PUT /api/auth/profile|password|jlpt-level`.
- JWT HS512, secret bắt buộc từ cấu hình (>= 64 byte). Đổi / đặt lại mật khẩu thu hồi mọi token cũ.

### Migration (Flyway)
`V1` baseline · `V2` ràng buộc & độ dài cột · `V3` thư viện, chia sẻ bộ thẻ, chấm sao · `V4` chia sẻ thư mục ·
`V5` lượt làm quiz · `V6` token đặt lại mật khẩu · `V7` refresh token · `R__seed_system_decks` bộ thẻ mẫu.

### Test
`mvn test` chạy 55 test (unit + tích hợp `*IT.java`) trên Postgres nhúng (không cần Docker / Supabase).
Test mới cho từng tính năng nằm cạnh test cũ cùng miền: `FolderShareIT`, `QuizAttemptIT`, `PasswordResetIT`, `RefreshTokenIT`,
`AuthValidationIT`, `RegisterRateLimitIT`.
`npm run e2e` (thư mục gốc) chạy smoke test HTTP trên backend thật + Postgres nhúng.

---

## 3. Frontend (`frontend`, React 19 + Vite + Tailwind 3)

| Thư mục | Nội dung |
| :--- | :--- |
| `pages/` | Mỗi route một trang (Dashboard, Decks, Folders, Library, DeckDetail/Editor, Study, Quiz, QuizRoom, Roadmap, Profile, Login/Register/Forgot/ResetPassword) |
| `features/<miền>/` | Component + helper theo miền: `auth`, `dashboard`, `decks`, `folders`, `library`, `profile` |
| `components/` | Layout (`AppLayout`, `AuthLayout`) và UI dùng chung (`Button`, `Input`, `Modal`, `DialogProvider`) |
| `lib/` | Hàm thuần: `deckUtils` (gồm `JLPT_LEVELS`), `learningStats`, `srs`, `useAsync`, `speech` |
| `services/` | `apiClient` (gắn JWT, 401 -> đăng xuất, phát `data:changed` sau request ghi), các service gọi API |

Kiểm tra: `npm run lint`, `npm run build`, `npm run selfcheck` (`scripts/selfCheck.ts`, cần Node >= 22.18).

---

## 4. AI Service (`ai-service`, FastAPI)

| Endpoint | Tệp | Trạng thái |
| :--- | :--- | :--- |
| `POST /api/nlp/analyze` | `app/api/nlp_router.py` | Nguyên mẫu: pykakasi + từ điển Hán-Việt 25 chữ |
| `POST /api/kanji/score-stroke` | `app/api/kanji_dtw_router.py` | Khung sườn: so với 1 nét mẫu cố định |
| `POST /api/ocr/process-image` | `app/api/ocr_router.py` | Mock |
| `POST /api/audio/evaluate-pitch` | `app/api/audio_praat_router.py` | Mock |

Chưa có xác thực, CORS đang mở `*`: phải siết lại trước khi nối vào backend / triển khai.

---

## 5. Hạ tầng & tài liệu

- `docker-compose.yml`: Postgres 16, Redis, Neo4j cho chạy offline (backend hiện chỉ dùng Postgres).
- `.github/workflows/ci.yml`: CI chạy `mvn test` + lint/build/selfcheck frontend cho mọi push/PR.
- `dev.mjs` (`npm run dev`), `e2e.mjs` (`npm run e2e`), `smoke-*.mjs`: script chạy thử ở thư mục gốc.
- `docs/`: [ARCHITECTURE.md](ARCHITECTURE.md), [SUPABASE_SETUP.md](SUPABASE_SETUP.md),
  [USE_CASES_CHECKLIST.md](USE_CASES_CHECKLIST.md), [TEAM_GUIDELINES.md](TEAM_GUIDELINES.md), [CHANGELOG.md](CHANGELOG.md),
  [Progress/](Progress/) (tổng kết từng đợt, mới nhất [30-9.md](Progress/30-9.md)).
