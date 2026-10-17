# Kế hoạch triển khai: Admin Panel

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Giao diện và API quản trị cho 3 vai trò staff (VIEWER / ADMIN / SUPER_ADMIN): thống kê, người dùng, kiểm duyệt nội dung, báo cáo vi phạm, cấu hình runtime, audit; staff không dùng tính năng học.

**Kiến trúc:** Spring Security `RoleHierarchy` + 3 dòng `requestMatchers` + `@PreAuthorize` trên method ghi; 5 controller `/api/admin/**` gọi 6 service, mọi ghi đi qua `AuditService.log` trong cùng transaction; ràng buộc đẩy xuống DB (CHECK, partial unique index, `UPDATE … WHERE status='OPEN'`). Frontend React: `AdminLayout` riêng, 8 trang `<table>` + `useSearchParams`, 0 dependency mới.

**Tech stack:** Spring Boot 3.5 / Java 17 / Flyway / Postgres nhúng cho test; React 19 + react-router 7 + Tailwind 3; `scripts/selfCheck.ts` cho hàm thuần.

**Spec:** [../specs/2026-10-17-admin-panel-design.md](../specs/2026-10-17-admin-panel-design.md) (nguồn sự thật khi plan mâu thuẫn; mã test AZ-/US-/CT-/RP-/ST-/SS-/AU-/FE- tham chiếu mục 9 của spec).

## Ràng buộc chung

- Nhánh `backend-feature-learnmode`. Mỗi task 1 commit, thông điệp tiếng Việt ngắn, kết thúc bằng `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- **TDD**: test trước, chạy đỏ, code, chạy xanh. Không xoá test cũ; `mvn -q test` toàn bộ phải xanh cuối mỗi task backend.
- **0 dependency mới** (pom.xml, package.json không đổi).
- Máy dev 8 GB: không chạy `mvn test` song song với `pytest`/`npm run build`.
- Lệnh: backend `cd backend-core && mvn -q -Dtest=<Class> test` (một lớp) / `mvn -q test` (tất cả); frontend `cd frontend && npm run lint && npm run build && npm run selfcheck`.
- Backend: lỗi nghiệp vụ `throw new ResponseStatusException(HttpStatus.X, "tiếng Việt")`; controller không import repository, không trả entity; jsonb = `@JdbcTypeCode(SqlTypes.JSON)`; `ddl-auto=validate` → entity phải khớp V14 từng cột.
- Phân trang: query `page` (`@Min(0)`, mặc định 0), `size` (`@Min(1) @Max(100)`, mặc định 20), `q` (`@Size(max=100)`); controller gắn `@Validated`. Trả `AdminPage<T>` (Task 2).
- Tìm kiếm chuỗi: `lower(col) LIKE :q ESCAPE '!'` với `q = "%" + escapeLike(input.toLowerCase()) + "%"`; `escapeLike` thay `!`,`%`,`_` bằng `!x` (hàm tĩnh trong `AdminUserService`, dùng lại ở Task 5).
- Frontend: helper thuần chỉ import tương đối `.ts`; token Tailwind M3 như trang hiện có; chuỗi hiển thị tiếng Việt; mọi `<table>` có `<caption class="sr-only">`, `<th scope="col">`; nút icon có `aria-label`; hành động phá huỷ qua `useDialog().confirm`.
- Vai trò tối thiểu của từng endpoint: **spec mục 5 là bắt buộc**.

## Trọng tâm review (các tình huống spec ngụ ý, đã gắn test vào task sở hữu)

1. `@PreAuthorize` ném `AccessDeniedException` bên trong controller → `ApiExceptionHandler.onOther` hiện đang trả **500** thay vì 403 → Task 1 thêm handler + test AZ-09.
2. Thăng USER đang có bộ thẻ lên staff rồi giáng về: dữ liệu học còn nguyên (D3) → AZ-12 (Task 4).
3. Hai admin resolve cùng một báo cáo đồng thời → đúng 1 thành công (RP-12, Task 6).
4. Tài khoản bị khoá khi đang giữ refresh token hợp lệ → refresh phải 401 (US-04, Task 1).
5. ai-service tắt → `/health` trả `down` trong ≤ 2 giây, không 500 (SS-07, Task 7).

---

## Task 1: Nền phân quyền — V14, `Role`, khoá tài khoản, `RoleHierarchy`, 403 đúng mã

**Files:**
- Create: `backend-core/src/main/resources/db/migration/V14__admin_panel.sql` (nội dung **đúng** spec mục 4)
- Modify: `model/Role.java`, `model/User.java`, `security/CustomUserDetails.java`, `security/JwtAuthenticationFilter.java`, `service/RefreshTokenService.java:60-70`, `service/AuthService.java:50-72`, `config/SecurityConfig.java`, `config/ApiExceptionHandler.java`, `dto/AuthResponse.java`, `src/test/java/com/pbl6/flashcard/support/IntegrationTest.java`
- Create: `model/AppSetting.java`, `model/ContentReport.java`, `model/AdminAuditLog.java` (entity tối thiểu để `ddl-auto=validate` không kêu; repository tạo ở task dùng chúng)
- Test: `src/test/java/com/pbl6/flashcard/security/AdminAuthorizationIT.java` (mới), `security/AccountLockIT.java` (mới)

**Interfaces:**
- Produces: `Role { USER, VIEWER, ADMIN, SUPER_ADMIN }` với `boolean isStaff()` (`!= USER`), `int rank()` (`ordinal()`); `User.getLockedAt()/setLockedAt(Instant)`, `User.getExtractionDailyLimit()/setExtractionDailyLimit(Integer)`; `IntegrationTest.newStaff(Role role) → String token` (đăng ký như `newUser`, rồi `userRepository` set role, đăng nhập lại) và `IntegrationTest.userId(String email) → Long`; `AuthResponse(accessToken, refreshToken, tokenType, role)` (thêm trường `role`); bean `RoleHierarchy`.

- [ ] **Step 1: Viết test đỏ `AdminAuthorizationIT`**

```java
@Test void user_is_forbidden_on_admin_paths() // AZ-01 phần USER: newUser() GET /api/admin/stats → 403 (route chưa có vẫn phải 403 vì chặn ở filter)
@Test void anonymous_is_unauthorized() // AZ-02: không token GET /api/admin/stats → 401
@Test void staff_cannot_use_learning_apis() // AZ-10: với mỗi role VIEWER/ADMIN/SUPER_ADMIN: GET /api/decks, POST /api/decks {title,level}, GET /api/library/decks, GET /api/quizzes/n5-core → đều 403
@Test void staff_can_use_auth_apis() // AZ-11: VIEWER GET /api/auth/me → 200 và body.role == "VIEWER"
@Test void login_response_carries_role() // newStaff(ADMIN) rồi POST /auth/login → body.role == "ADMIN"; newUser → "USER"
```
`AccountLockIT`: tạo user, lấy token + refresh token (đọc từ login), set `lockedAt = Instant.now()` qua `UserRepository`, rồi:
```java
@Test void locked_user_cannot_login()             // US-02: 403, message chứa "khoá"
@Test void locked_user_access_token_is_rejected()  // US-03: GET /api/decks → 401
@Test void locked_user_refresh_is_rejected()       // US-04: POST /auth/refresh → 401
@Test void unlocked_user_can_login_again()         // US-05: lockedAt=null → login 200
```

- [ ] **Step 2: Chạy, xác nhận đỏ** — `mvn -q -Dtest=AdminAuthorizationIT,AccountLockIT test` → lỗi biên dịch (`newStaff`, `Role.VIEWER`).

- [ ] **Step 3: V14 + model**
- `V14__admin_panel.sql` chép nguyên khối SQL spec mục 4.
- `Role`: 4 hằng theo đúng thứ tự `USER, VIEWER, ADMIN, SUPER_ADMIN`; `isStaff()`, `rank()`.
- `User`: `@Column(name="locked_at") Instant lockedAt`; `@Column(name="extraction_daily_limit") Integer extractionDailyLimit`.
- `AppSetting` (`@Table app_settings`: `@Id String key`, `String value`, `Instant updatedAt`, `Long updatedBy`), `ContentReport` (`@Table content_reports`, mọi cột spec, `@GeneratedValue IDENTITY`), `AdminAuditLog` (`@Table admin_audit_logs`, `detail` là `Map<String,Object>` `@JdbcTypeCode(SqlTypes.JSON)`).

- [ ] **Step 4: Khoá tài khoản + role trong login**
- `CustomUserDetails.isAccountNonLocked()` → `user.getLockedAt() == null`.
- `JwtAuthenticationFilter`: sau `loadUserByUsername`, nếu `!userDetails.isAccountNonLocked()` → `filterChain.doFilter; return` (giống nhánh `issuedBeforePasswordChange`).
- `RefreshTokenService.refresh`: sau khi tìm `user`, `if (user.getLockedAt() != null) throw 401 "Tài khoản đã bị khoá."`. `issueTokens` điền `role` vào `AuthResponse`.
- `AuthService.login`: trong `catch`, thêm trước: `if (e instanceof LockedException) throw new ResponseStatusException(FORBIDDEN, "Tài khoản đã bị khoá, vui lòng liên hệ hỗ trợ.");` (không `record(key)`).

- [ ] **Step 5: SecurityConfig + 403**
- `@EnableMethodSecurity` trên `SecurityConfig`; bean `RoleHierarchy roleHierarchy()` = `RoleHierarchyImpl.fromHierarchy("ROLE_SUPER_ADMIN > ROLE_ADMIN > ROLE_VIEWER")`.
- `authorizeHttpRequests`: giữ các `permitAll` cũ; thêm theo thứ tự: `.requestMatchers("/api/auth/**", "/api/announcement").authenticated()`, `.requestMatchers("/api/admin/**").hasRole("VIEWER")`, `.anyRequest().hasRole("USER")`.
- `ApiExceptionHandler`: thêm `@ExceptionHandler(AccessDeniedException.class)` (`org.springframework.security.access`) → `error(FORBIDDEN, "Bạn không có quyền thực hiện thao tác này.")`, đặt **trước** `onOther`; `onOther` cũng `log.warn` thay vì `error` khi là `AccessDeniedException` (không cần: handler riêng đã bắt).
- `IntegrationTest`: `@Autowired UserRepository userRepository`; `newStaff(Role)`, `userId(email)`.

- [ ] **Step 6: Chạy xanh** — `mvn -q -Dtest=AdminAuthorizationIT,AccountLockIT test` PASS; rồi `mvn -q test` toàn bộ PASS (test cũ dùng `newUser()` = USER nên không bị `anyRequest().hasRole("USER")` chặn).

- [ ] **Step 7: Commit** — `git add backend-core && git commit -m "feat: 4 vai trò, khoá tài khoản, RoleHierarchy, staff không dùng API học (UC-38)"`.

---

## Task 2: Audit log + `AdminPage<T>`

**Files:**
- Create: `dto/admin/AdminPage.java`, `dto/admin/AuditLogResponse.java`, `repository/AdminAuditLogRepository.java`, `service/AuditService.java`, `controller/AdminAuditController.java`
- Test: `src/test/java/com/pbl6/flashcard/controller/AdminAuditIT.java`

**Interfaces:**
- Produces: `record AdminPage<T>(List<T> items, long total, int page, int size)` + `static <T> AdminPage<T> of(org.springframework.data.domain.Page<T> p)`; `AuditService.log(Long actorId, String action, String targetType, String targetId, Map<String,Object> detail)` (gọi trong tx của caller, `@Transactional(propagation = MANDATORY)`); helper `static Map<String,Object> diff(String field, Object before, Object after)` → `{field: {before, after}}`; `GET /api/admin/audit-logs` (`actorId?, targetType?, from?, to?` ISO date, `page, size`) → `AdminPage<AuditLogResponse(id, actorEmail, action, targetType, targetId, detail, createdAt)>`.

- [ ] **Step 1: Test đỏ `AdminAuditIT`**
```java
@Test void viewer_lists_logs_filtered_by_actor_and_target_type() // AU-01: chèn 2 dòng qua AuditService (bọc TransactionTemplate) với actor A/B, targetType USER/DECK; GET ?actorId=A&targetType=USER → total 1, items[0].actorEmail == emailA
@Test void audit_endpoints_are_read_only()  // AU-04: PUT/DELETE /api/admin/audit-logs/1 với SUPER_ADMIN → 405 hoặc 404
@Test void user_is_forbidden()              // AZ-01: USER GET → 403
```
- [ ] **Step 2: Đỏ** — `mvn -q -Dtest=AdminAuditIT test`.
- [ ] **Step 3: Code** — repository `Page<AdminAuditLog> search(Long actorId, String targetType, Instant from, Instant to, Pageable)` bằng JPQL `(:actorId IS NULL OR l.actorId = :actorId) AND …` sắp xếp `createdAt DESC`; `AuditLogResponse.of(log, email)` (email tra `UserRepository.findAllById` một lần cho cả trang, map theo id). Controller `@RequestMapping("/api/admin/audit-logs")`, `@Validated`.
- [ ] **Step 4: Xanh** — `mvn -q -Dtest=AdminAuditIT test` PASS.
- [ ] **Step 5: Commit** — `"feat: nhật ký quản trị admin_audit_logs + AdminPage"`.

---

## Task 3: Cấu hình runtime (`app_settings`), announcement, `registration_open`, hạn mức bóc tách

**Files:**
- Create: `repository/AppSettingRepository.java`, `service/SettingsService.java`, `dto/admin/SettingsResponse.java` (= request, 4 trường), `controller/AdminSettingsController.java`, `controller/AnnouncementController.java`
- Modify: `service/ExtractionService.java:65-80,159-166`, `service/AuthService.java:75-80`, `src/main/resources/application.properties` (xoá 2 dòng `app.extraction.daily-limit.*`), `src/test/resources/application-test.properties` (xoá `app.extraction.daily-limit.free=3`), `src/test/java/.../controller/ExtractionIT.java:~242`
- Test: `controller/AdminSettingsIT.java`

**Interfaces:**
- Produces: `SettingsService.getInt(String key)`, `getBool(String key)`, `getText(String key)` (đọc DB mỗi lần, khoá thiếu → `IllegalStateException`); `SettingsService.update(Long actorId, SettingsResponse req) → SettingsResponse` (validate: 2 int 0–1000, announcement ≤ 300, boolean; audit `SETTINGS_UPDATE` chỉ khoá đổi, không đổi → không audit); hằng `SettingsService.KEY_FREE/KEY_PREMIUM/KEY_ANNOUNCEMENT/KEY_REGISTRATION`.
- `GET /api/admin/settings` (VIEWER), `PUT /api/admin/settings` (`@PreAuthorize("hasRole('SUPER_ADMIN')")`), `GET /api/announcement` → `{text}`.

- [ ] **Step 1: Test đỏ `AdminSettingsIT`** — ST-01 (đặt free=2 qua PUT bằng SUPER_ADMIN; USER `POST /api/extractions` dạng text 3 lần → lần 3 là 429; dùng cách gọi như `ExtractionIT.postText`), ST-02, ST-03, ST-04, ST-05, ST-06, ST-07 (đếm dòng audit qua `GET /api/admin/audit-logs?targetType=SETTINGS`), ST-08 (`AppSettingRepository.count() == 4`), AZ-01 (ADMIN PUT → 403, VIEWER GET → 200).
- [ ] **Step 2: Đỏ.**
- [ ] **Step 3: Code**
- `ExtractionService`: bỏ 2 `@Value`, inject `SettingsService`; `enforceDailyLimit`: `Integer own = user.getExtractionDailyLimit(); int limit = own != null ? own : settings.getInt(premium ? KEY_PREMIUM : KEY_FREE);`.
- `AuthService.register`: đầu hàm `if (!settings.getBool(KEY_REGISTRATION)) throw 403 "Hệ thống tạm ngừng đăng ký tài khoản mới."`.
- `ExtractionIT` dòng ~242: thay comment/giả định `free=3` bằng cách ghi `appSettingRepository` key free = `"3"` trước test đó và trả về `"5"` sau (`@AfterEach` hoặc trong test).
- `SettingsResponse` dùng tên JSON đúng khoá spec (`extraction_daily_limit_free`…) qua `@JsonProperty`, thêm `updatedAt`.
- [ ] **Step 4: Xanh** — `mvn -q -Dtest=AdminSettingsIT,ExtractionIT,AuthValidationIT test`, rồi `mvn -q test`.
- [ ] **Step 5: Commit** — `"feat: app_settings, hạn mức bóc tách đổi lúc chạy, announcement, tạm ngừng đăng ký (UC-39)"`.

---

## Task 4: Quản lý người dùng

**Files:**
- Create: `dto/admin/AdminUserResponse.java` (record `Row(id,email,fullName,role,isPremium,lockedAt,createdAt,deckCount)` và `Detail(... + cardCount, extractionCount, extractionsToday, quizCount, lastReviewAt, activeSessions, extractionDailyLimit)`), `dto/admin/AdminUserPatch.java` (`Boolean locked, Boolean premium, Integer extractionDailyLimit` với `@Min(0) @Max(1000)`; cần phân biệt "không gửi" và `null` → dùng `Optional<Integer>`? **Không**: gửi `extractionDailyLimit: null` = bỏ hạn mức, muốn giữ nguyên thì không gửi trường → DTO là `Map`? → Quyết định: body có trường boolean `clearLimit` thay cho null: `{locked?, premium?, extractionDailyLimit?, clearLimit?}`; cập nhật spec 5.2 khi làm), `dto/admin/RoleRequest.java` (`@NotNull Role role`), `service/AdminUserService.java`, `controller/AdminUserController.java`
- Modify: `repository/UserRepository.java` (tìm + đếm), `repository/RefreshTokenRepository.java` (`countByUserId`), `repository/ExtractionJobRepository.java` (`countByUserId`), `repository/QuizResultRepository.java` (`countByUserId`), `repository/FlashcardRepository.java` (`countByDeck_OwnerId`), `repository/DeckRepository.java` (`countByOwnerId`)
- Test: `controller/AdminUserIT.java`, bổ sung `AdminAuthorizationIT` (AZ-03…AZ-08, AZ-12)

**Interfaces:**
- Produces: `AdminUserService.list(q, role, premium, locked, page, size)`, `detail(id)`, `patch(actor, id, AdminUserPatch)`, `changeRole(actor, id, Role)`, `revokeSessions(actor, id)`; `static String escapeLike(String)`; quy tắc bảo vệ `requireBelow(User actor, User target)` (self → 400 "Không thể thao tác trên tài khoản của chính bạn."; `target.rank() >= actor.rank()` → 403).
- Endpoints spec 5.2; `PATCH`/`POST revoke` `@PreAuthorize("hasRole('ADMIN')")`, `PUT role` `hasRole('SUPER_ADMIN')`.

- [ ] **Step 1: Test đỏ** `AdminUserIT`: US-01, US-06, US-07, US-08, US-09, US-10, US-11, US-12, US-13, US-14, US-15, US-16, US-17, US-18, US-19 (mỗi ID một `@Test`, assert mã + trường nêu trong spec; audit kiểm qua `GET /api/admin/audit-logs?targetType=USER&actorId=`). `AdminAuthorizationIT` thêm AZ-03, AZ-04, AZ-05, AZ-06, AZ-07, AZ-08, AZ-12 (AZ-12: user tạo 3 bộ thẻ → thăng VIEWER → `GET /api/decks` 403 → giáng USER, đăng nhập lại → 3 bộ).
- [ ] **Step 2: Đỏ.**
- [ ] **Step 3: Code** — `UserRepository`: `@Query` JPQL `search(String q, Role role, Boolean premium, Boolean locked, Pageable)` với điều kiện `(:q = '' OR lower(u.email) LIKE :q ESCAPE '!' OR lower(u.fullName) LIKE :q ESCAPE '!')`, `(:locked IS NULL OR (u.lockedAt IS NOT NULL) = :locked)`; `countByRole(Role)`. `deckCount` cho cả trang: `DeckRepository` `@Query "SELECT d.ownerId, count(d) FROM Deck d WHERE d.ownerId IN :ids GROUP BY d.ownerId"`. `extractionsToday` = `ExtractionJobRepository.countByUserIdAndCreatedAtAfter(id, now-24h)` (đã có). `lastReviewAt`: native `SELECT max(reviewed_at) FROM review_logs WHERE user_id = :id` trên `UserRepository`. Khoá → `refreshTokens.revokeAll(id)`; đổi role → kiểm tra SUPER_ADMIN cuối (`countByRole(SUPER_ADMIN) <= 1` và target là SUPER_ADMIN và role mới khác) → 409; `revokeAll`; revoke-sessions → `revokeAll` + `setPasswordChangedAt(now)`. Mỗi thay đổi thật → `audit.log(actor, "USER_…", "USER", id, diff(...))`.
- [ ] **Step 4: Xanh** — `mvn -q -Dtest=AdminUserIT,AdminAuthorizationIT test`, rồi `mvn -q test`.
- [ ] **Step 5: Commit** — `"feat: admin quản lý người dùng: khoá, premium, hạn mức riêng, thu hồi phiên, đổi vai trò"`.

---

## Task 5: Quản lý nội dung (bộ thẻ, bình luận, job bóc tách)

**Files:**
- Create: `dto/admin/AdminDeckResponse.java` (`Row` theo spec 5.3; `Detail` = Row + `List<DeckResponse.CardResponse> cards` nullable), `dto/admin/DeckFlagsRequest.java` (`Boolean official, Boolean featured`), `dto/admin/AdminRatingResponse.java`, `dto/admin/AdminExtractionResponse.java` (bọc `ExtractionJobResponse.of(job,false)` + `userEmail`), `service/AdminContentService.java`, `controller/AdminContentController.java`
- Modify: `service/DeckService.java:275-283` (tách `public void deleteDeck(Deck deck)` chứa phần xoá review + `deckRepository.delete`; `delete(uid, id)` gọi nó), `service/ExtractionService.java` (tách `void deleteJob(ExtractionJob job)` chứa kiểm tra đang chạy → 409 "Job đang chạy, không thể xoá." và `purpose = learning_path` → 409, rồi xoá; hàm xoá cũ của người dùng gọi nó), `repository/DeckRepository.java`, `repository/DeckRatingRepository.java`, `repository/ExtractionJobRepository.java`
- Test: `controller/AdminContentIT.java`, bổ sung `AdminAuthorizationIT` (9 endpoint mục 5.3 × 4 vai trò, dùng `@ParameterizedTest` + `@MethodSource` bảng `{method, path, minRole}`)

**Interfaces:**
- Produces: `AdminContentService.listDecks(q, visibility, official, featured, ownerId, page, size)`, `deck(id)`, `unpublish(actor, deckId)` (dùng lại ở Task 6; trả `boolean changed`), `setFlags(actor, deckId, DeckFlagsRequest)`, `deleteDeck(actor, deckId)`, `listRatings(deckId, q, page, size)`, `clearComment(actor, ratingId)` (trả `boolean changed`; Task 6 dùng lại), `listExtractions(status, userId, page, size)`, `deleteExtraction(actor, id)`.
- `openReports` của bộ thẻ: `ContentReportRepository.countByDeckIdAndStatus(deckId, "OPEN")` (repository tạo ở task này, Task 6 mở rộng).

- [ ] **Step 1: Test đỏ** `AdminContentIT`: CT-01 … CT-13 (CT-07 tạo báo cáo bằng cách chèn `ContentReport` qua repository vì endpoint người dùng ở Task 6). `AdminAuthorizationIT`: bảng endpoint 5.3.
- [ ] **Step 2: Đỏ.**
- [ ] **Step 3: Code** — `DeckRepository.searchAdmin(...)` native query trả projection `AdminDeckRow` (interface getter) gồm `card_count`, `avg_stars`, `downloads` (= `count(*) FROM decks c WHERE c.source_deck_id = d.id`), `open_reports`, `owner_email` (join users); lọc `visibility` (`@Pattern("private|public")` ở controller), `official/featured` Boolean nullable, `ownerId`. `deck(id)`: `cards` chỉ khi `visibility = public || openReports > 0`. `unpublish`: `findByIdForUpdate`; nếu đã private → `false`, không audit. `listRatings`: JPQL `r.comment IS NOT NULL AND (:deckId IS NULL OR r.deckId = :deckId) AND (:q = '' OR lower(r.comment) LIKE :q ESCAPE '!')` sắp `updatedAt DESC`, email + tiêu đề map theo id một lần. `listExtractions`: JPQL theo `status` (`@Pattern` các giá trị `ExtractionJob` hằng) + `userId`, `createdAt DESC`.
- [ ] **Step 4: Xanh** — `mvn -q -Dtest=AdminContentIT,AdminAuthorizationIT,DeckIntegrityIT,ExtractionIT test`, rồi `mvn -q test`.
- [ ] **Step 5: Commit** — `"feat: admin kiểm duyệt bộ thẻ, bình luận, job bóc tách"`.

---

## Task 6: Báo cáo vi phạm (người học gửi, admin xử lý)

**Files:**
- Create: `dto/library/ReportRequest.java` (`@NotNull Reason reason` enum `WRONG_CONTENT, COPYRIGHT, OFFENSIVE, SPAM, OTHER`; `@Size(max=500) String detail`), `dto/admin/ReportResponse.java` (spec 5.4), `dto/admin/ResolveRequest.java` (`@NotNull Action action` enum `NONE, UNPUBLISH_DECK, CLEAR_COMMENT`; `@Size(max=500) String note`; `Long ratingId`), `dto/admin/DismissRequest.java` (`@Size(max=500) String note`), `security/ReportRateLimiter.java` (như `QuizRateLimiter`, `app.rate-limit.report.max:10`, `window:PT1H`, khoá = `uid`), `service/ReportService.java`, `controller/AdminReportController.java`
- Modify: `repository/ContentReportRepository.java` (`@Modifying @Query("UPDATE ContentReport r SET r.status=:status, r.action=:action, r.resolutionNote=:note, r.resolvedBy=:by, r.resolvedAt=:at WHERE r.id=:id AND r.status='OPEN'") int close(...)`, `search(status, deckId, Pageable)`, `countByStatus`, `countOpenByDeckIds`), `controller/LibraryController.java` (thêm `POST /decks/{deckId}/reports` → 201)
- Test: `controller/ContentReportIT.java`, bổ sung `AdminAuthorizationIT` (3 endpoint admin + endpoint người dùng: staff → 403)

**Interfaces:**
- Produces: `ReportService.create(User reporter, String deckId, ReportRequest) → ContentReport` (không `@Transactional`; `reason == OTHER && detail blank` → 400; deck không tồn tại hoặc không public → 404; `deck.ownerId == uid` → 400; `rateLimiter.check(uid)`; `save` bắt `DataIntegrityViolationException` → 409 "Bạn đã báo cáo bộ thẻ này, đang chờ xử lý."); `list(status, deckId, page, size)`; `resolve(actor, id, ResolveRequest)`; `dismiss(actor, id, DismissRequest)`; `countOpen()` (Task 7 dùng).
- `resolve` (`@Transactional`): đọc report (404) → kiểm `action == CLEAR_COMMENT` cần `ratingId` thuộc `report.deckId` (400) → `close(...) == 0` → 409 "Báo cáo đã được xử lý." → thực hiện action qua `AdminContentService.unpublish/clearComment` (các hàm này tự audit khi có thay đổi) → `audit REPORT_RESOLVE {action, note}`.

- [ ] **Step 1: Test đỏ** `ContentReportIT`: RP-01 … RP-15 (RP-12 dùng `ExecutorService` 2 thread gọi `resolve` qua MockMvc, mỗi thread token ADMIN riêng; assert đúng 1 lần 200 + 1 lần 409).
- [ ] **Step 2: Đỏ.**
- [ ] **Step 3: Code** như Interfaces; `ReportResponse.of(report, deckTitle, deckVisibility, reporterEmail, resolvedByEmail, sameDeckOpen)`; email/tiêu đề tra theo lô cho cả trang.
- [ ] **Step 4: Xanh** — `mvn -q -Dtest=ContentReportIT,AdminAuthorizationIT test`, rồi `mvn -q test`.
- [ ] **Step 5: Commit** — `"feat: báo cáo bộ thẻ vi phạm và xử lý báo cáo (UC-41)"`.

---

## Task 7: Thống kê & health

**Files:**
- Create: `dto/admin/AdminStatsResponse.java` (cấu trúc lồng đúng spec 5.1), `service/AdminStatsService.java`, `controller/AdminStatsController.java` (`GET /api/admin/stats`, `GET /api/admin/health`)
- Modify: `repository/UserRepository.java`, `ExtractionJobRepository.java`, `QuizAttemptRepository.java`, `DeckRepository.java`, `LearningPathRepository.java` (native `countByDay(since, zone)` trả projection `DayCount { java.sql.Date getDay(); long getN(); }` bằng `SELECT (created_at AT TIME ZONE :zone)::date AS day, count(*) AS n … WHERE created_at >= :since GROUP BY day`), `service/AiServiceClient.java` (thêm `boolean health()`: RestClient thứ hai cùng baseUrl, read timeout 2 s, `GET /api/extract/health`, mọi exception → `false`), `src/main/resources/application.properties` (`app.version=@project.version@`)
- Test: `service/AdminStatsServiceTest.java` (thuần), `controller/AdminStatsIT.java`

**Interfaces:**
- Produces: `static long[] AdminStatsService.fill(Map<LocalDate, Long> counts, LocalDate from, int days)` (vị trí i = from+i, thiếu → 0); `stats(int days)`, `health()` → `Map.of("db","ok","aiService", ok?"ok":"down","version", version)`.

- [ ] **Step 1: Test đỏ** — `AdminStatsServiceTest.fill_pads_missing_days_with_zero()` (SS-04: counts {from+1: 3}, days 3 → `[0,3,0]`); `AdminStatsIT`: SS-01, SS-02, SS-03, SS-05 (chèn job `created_at = 23:30Z` của hôm qua UTC qua repository, assert ngày VN), SS-06, SS-07 (`app.ai-service.url` test đã trỏ `ai-service.invalid` → `down`; đo thời gian < 5 s), AZ-01 cho 2 endpoint.
- [ ] **Step 2: Đỏ.**
- [ ] **Step 3: Code** — `stats`: `days` `@Min(7) @Max(90)`; `active7d` native `count(DISTINCT user_id) FROM review_logs WHERE reviewed_at >= :since` trên `UserRepository`; zone từ `@Value("${app.learning-path.zone}")`; `openReports = reportService.countOpen()`.
- [ ] **Step 4: Xanh** — `mvn -q -Dtest=AdminStatsServiceTest,AdminStatsIT test`, rồi `mvn -q test` (lần cuối cho backend).
- [ ] **Step 5: Commit** — `"feat: dashboard thống kê và health cho admin (UC-38)"`.

---

## Task 8: Frontend nền — `roles.ts`, điều hướng theo vai trò, `AdminLayout`, `adminService`, types

**Files:**
- Create: `frontend/src/lib/roles.ts`, `frontend/src/components/layout/AdminLayout.tsx`, `frontend/src/services/adminService.ts`, `frontend/src/pages/admin/AdminDashboardPage.tsx` (tạm: tiêu đề + "Đang xây dựng", thay ở Task 9)
- Modify: `frontend/src/types/api.types.ts` (type cho mọi DTO spec mục 5 + `AuthResponse.role`), `frontend/src/features/auth/types/auth.types.ts` (`AuthResponse.role: Role`), `frontend/src/routes/ProtectedRoute.tsx`, `frontend/src/routes/AppRoutes.tsx`, `frontend/src/routes/PublicRoute.tsx`, `frontend/src/features/auth/hooks/useLoginForm.ts:48-52`, `frontend/scripts/selfCheck.ts`

**Interfaces:**
- Produces: `roles.ts`: `type Role = "USER" | "VIEWER" | "ADMIN" | "SUPER_ADMIN"`, `RANK: Record<Role, number>` (0..3), `atLeast(role: string | undefined, min: Role): boolean`, `isStaff(role: string | undefined): boolean`, `homeFor(role: string | undefined): "/" | "/admin"`.
- `ProtectedRoute` prop `minRole?: Role`: có `minRole` và `!atLeast(profile.role, minRole)` → `<Navigate to={homeFor(role)} replace/>`; không `minRole` và `isStaff(role)` → `/admin`. Khi `userProfile` chưa có (null) → render children (bootstrap đã chờ `isLoading`).
- `adminService.ts`: một hàm mỗi endpoint spec mục 5, tên `fetchAdminStats(days)`, `fetchAdminHealth()`, `fetchAdminUsers(params)`, `fetchAdminUser(id)`, `patchAdminUser(id, body)`, `setUserRole(id, role)`, `revokeUserSessions(id)`, `fetchAdminDecks(params)`, `fetchAdminDeck(id)`, `unpublishDeck(id)`, `setDeckFlags(id, body)`, `deleteAdminDeck(id)`, `fetchAdminRatings(params)`, `clearRatingComment(id)`, `fetchAdminExtractions(params)`, `deleteAdminExtraction(id)`, `fetchReports(params)`, `resolveReport(id, body)`, `dismissReport(id, body)`, `fetchAuditLogs(params)`, `fetchSettings()`, `updateSettings(body)`, `reportDeck(deckId, body)`, `fetchAnnouncement()`.
- `AdminLayout`: header (tên app, `userEmail`, `RoleBadge`, nút Đăng xuất) + `<aside>` 6 `NavLink` (`/admin` end, `/admin/users`, `/admin/decks`, `/admin/reports`, `/admin/audit`, `/admin/settings`) + badge số báo cáo OPEN (`fetchReports({status:"OPEN", size:1}).total`, tải lại khi `DATA_CHANGED_EVENT`) + `<Outlet/>`; mobile drawer như `DashboardSidebar` (nút ☰ `aria-expanded`).

- [ ] **Step 1: Test đỏ** — `selfCheck.ts` thêm FE-01 (4 assert) import `../src/lib/roles.ts`. Chạy `npm run selfcheck` → lỗi import.
- [ ] **Step 2: Code** `roles.ts`; `npm run selfcheck` PASS.
- [ ] **Step 3: Điều hướng** — `useLoginForm`: `navigate(isStaff(response.role) ? "/admin" : (from && from !== "/login" ? from : "/"))`; `PublicRoute`: khi đã đăng nhập, `homeFor(userProfile?.role)` thay `"/"`; `AppRoutes`: nhánh `<Route element={<ProtectedRoute minRole="VIEWER"><AdminLayout/></ProtectedRoute>}>` với `path="/admin"` (và 7 path con tạm trỏ `AdminDashboardPage`), fallback `*` → `<Navigate to="/"/>` giữ nguyên (ProtectedRoute đẩy staff sang `/admin`).
- [ ] **Step 4: Kiểm** — `npm run lint && npm run build && npm run selfcheck` PASS; chạy tay FE-03, FE-04 phần điều hướng (backend đã có Task 1–7; tạo SUPER_ADMIN bằng SQL spec 3.4 trên Postgres dev).
- [ ] **Step 5: Commit** — `"feat(frontend): vai trò, AdminLayout, điều hướng staff/người học, adminService"`.

---

## Task 9: Trang Tổng quan + Người dùng (danh sách, chi tiết)

**Files:**
- Create: `features/admin/components/StatCard.tsx`, `BarSeries.tsx`, `Pager.tsx`, `RoleBadge.tsx`, `features/admin/adminUtils.ts` (`toPercentHeights(values: number[]): number[]`, `formatDateTime` dùng lại từ `features/extraction/extractionUtils.ts`), `pages/admin/AdminUsersPage.tsx`, `pages/admin/AdminUserDetailPage.tsx`
- Modify: `pages/admin/AdminDashboardPage.tsx` (thay tạm), `routes/AppRoutes.tsx`, `scripts/selfCheck.ts` (FE-02)

**Interfaces:**
- `Pager({ page, size, total, onPage })` nút ‹ › + "Trang x/y" (`aria-label`), disabled ở biên. `BarSeries({ points: {date: string; value: number}[]; label: string })` CSS grid, mỗi cột `title="dd/MM: n"`, kèm `<table class="sr-only">`. `StatCard({ label, value, sub? })`. `RoleBadge({ role })` chữ + màu.
- Trang Users: filter trong `useSearchParams` (`q, role, premium, locked, page`); vùng `role="status"` "N tài khoản". Trang chi tiết: khối hành động hiện theo `atLeast(myRole, "ADMIN")` và `target.rank < my.rank`; đổi role chỉ `SUPER_ADMIN` và `target.id !== me.id`; confirm theo nguyên văn spec 8.4; khối Premium / Hạn mức ẩn khi `isStaff(target.role)`; `extractionDailyLimit` gửi `{clearLimit: true}` khi chọn "Theo cấu hình chung".

- [ ] **Step 1:** `selfCheck.ts` FE-02 (`toPercentHeights([0,5,10])` → `[0,50,100]`, `[0,0]` → `[0,0]`) đỏ → code `adminUtils.ts` → xanh.
- [ ] **Step 2:** Viết 3 trang + 4 component theo wireframe 8.2–8.4; lỗi API hiện `role="alert"` + nút "Thử lại" như `ExtractionsPage`.
- [ ] **Step 3:** `npm run lint && npm run build && npm run selfcheck` PASS; chạy tay FE-04 (VIEWER không thấy nút ghi), FE-06 bàn phím trên modal confirm.
- [ ] **Step 4: Commit** — `"feat(frontend): trang tổng quan và quản lý người dùng admin"`.

---

## Task 10: Trang Nội dung (3 tab) + Chi tiết bộ thẻ + Báo cáo

**Files:**
- Create: `pages/admin/AdminDecksPage.tsx` (tab qua `?tab=decks|ratings|extractions`, link có `aria-current="page"`), `pages/admin/AdminDeckDetailPage.tsx`, `pages/admin/AdminReportsPage.tsx`, `features/admin/components/ResolveReportModal.tsx`
- Modify: `routes/AppRoutes.tsx`

**Interfaces:**
- `ResolveReportModal({ report, ratings, onDone })`: radio 3 hành động; "Gỡ khỏi Thư viện" disabled khi `report.deckVisibility === "private"`; chọn "Xoá bình luận" hiện `<select>` bình luận của bộ thẻ (`fetchAdminRatings({deckId})`), disabled khi rỗng; nút "Bỏ qua báo cáo" gọi `dismissReport`; sau 200 → đóng + reload (sự kiện `data:changed` đã phát từ `apiClient`).
- Nút ghi (Gỡ / Lưu cờ / Xoá / Xoá bình luận / Xoá job / Xử lý) chỉ render khi `atLeast(myRole, "ADMIN")`; VIEWER thấy nút "Xem".

- [ ] **Step 1:** Viết 3 trang + modal theo wireframe 8.5–8.7; bảng thẻ ở chi tiết hiện "Nội dung riêng tư, không hiển thị" khi `cards === null`.
- [ ] **Step 2:** `npm run lint && npm run build && npm run selfcheck` PASS; chạy tay: ADMIN resolve với `UNPUBLISH_DECK` → bộ thẻ biến mất khỏi Thư viện (đăng nhập USER kiểm), FE-07 ở 360px.
- [ ] **Step 3: Commit** — `"feat(frontend): trang nội dung, chi tiết bộ thẻ và xử lý báo cáo admin"`.

---

## Task 11: Nhật ký, Cấu hình, nút Báo cáo phía người học, banner

**Files:**
- Create: `pages/admin/AdminAuditPage.tsx`, `pages/admin/AdminSettingsPage.tsx`, `features/library/components/ReportDeckModal.tsx`
- Modify: `routes/AppRoutes.tsx`, `pages/DeckDetailPage.tsx:~150-160` (nút "⚑ Báo cáo" khi `deck.visibility === "public" && deck.access !== "owner"`), `features/library/components/LibraryPreviewModal.tsx` (cùng nút), `components/layout/AppLayout.tsx` (banner `announcement`)

**Interfaces:**
- `ReportDeckModal({ deckId, isOpen, onClose })`: radio 5 lý do, textarea ≤ 500 (`required` khi `OTHER`), gửi `reportDeck`; 409 → hiện "Bạn đã báo cáo bộ thẻ này" và đổi nút thành "Đã báo cáo" (state trong trang, không lưu).
- Settings: form 4 ô, mọi ô `disabled={!atLeast(role,"SUPER_ADMIN")}` + dòng "Chỉ Super admin được sửa"; validation HTML (`type=number min=0 max=1000`, `maxLength=300`); `aria-live` kết quả lưu.
- Banner: `AppLayout` gọi `fetchAnnouncement()` một lần lúc mount; `text` khác rỗng → `<div role="status">` + nút × (`aria-label="Ẩn thông báo"`, chỉ `useState`).

- [ ] **Step 1:** Viết theo wireframe 8.8–8.11.
- [ ] **Step 2:** `npm run lint && npm run build && npm run selfcheck` PASS; chạy tay: USER báo cáo → ADMIN thấy ở hàng đợi; SUPER_ADMIN đặt `announcement` → USER thấy banner, staff không thấy (không có `AppLayout`); FE-05 (giáng ADMIN → VIEWER khi đang mở trang, bấm nút → thông báo 403).
- [ ] **Step 3: Commit** — `"feat(frontend): nhật ký, cấu hình, báo cáo bộ thẻ, banner thông báo"`.

---

## Task 12: Sao lưu (UC-42) + tài liệu

**Files:**
- Create: `scripts/backup.ps1`, `scripts/backup.sh` (đọc `DB_URL`/`DB_USERNAME`/`DB_PASSWORD` từ env; `pg_dump --format=custom --no-owner -f backups/pbl6-<yyyyMMdd-HHmm>.dump`; xoá bản cũ ngoài 14 bản mới nhất; thoát mã ≠ 0 khi `pg_dump` lỗi)
- Modify: `.gitignore` (thêm `backups/`), `docs/SUPABASE_SETUP.md` (mục "Sao lưu & khôi phục": lệnh backup, `pg_restore --clean --if-exists -d <url> <file>`, thử restore vào Postgres nhúng; mục "Tạo Super admin đầu tiên" với SQL spec 3.4; cảnh báo rủi ro 4 spec mục 11), `docs/CODEBASE_MAP.md` (hàng tra cứu Admin Panel + bảng migration thêm `V14`), `docs/USE_CASES_CHECKLIST.md` (UC-38, 39, 41, 42 `[x]`; UC-40 giữ), `docs/TEAM_GUIDELINES.md` (phân hệ 7 → 80%, còn UC-40), `docs/CHANGELOG.md`, `docs/Plan/README.md` (trạng thái "Đã làm"), spec dòng trạng thái.

- [ ] **Step 1:** Viết 2 script; chạy `scripts/backup.ps1` trên Postgres nhúng của `npm run e2e` (hoặc docker-compose Postgres) → file `.dump` tạo ra; `pg_restore --list <file>` liệt kê được bảng `admin_audit_logs`.
- [ ] **Step 2:** Cập nhật tài liệu như trên.
- [ ] **Step 3: Commit** — `"docs: sao lưu pg_dump, hướng dẫn super admin, cập nhật tài liệu Admin Panel (UC-42)"`.

---

## Tự rà soát

- **Phủ spec:** 2.1→T7, 2.2→T4, 2.3→T5, 2.4→T6, 2.5→T3, 2.6→T2, 2.7→T12, 3→T1/T4, 4→T1, 5→T2–T7, 7→T8–T11, 8→T8–T11, 9→từng task theo mã test, 10.1 (AccessDenied 403)→T1. UC-40 ngoài phạm vi.
- **Lệch so với spec, cập nhật spec khi làm:** (a) `PATCH /users/{id}` dùng `clearLimit: true` thay cho `extractionDailyLimit: null` (JSON không phân biệt thiếu/null trong record); (b) `AdminPage<T>` generic dùng chung 7 danh sách thay vì record lồng từng DTO; (c) `AuthResponse` thêm `role`.
- **Nhất quán tên:** `AuditService.log/diff`, `AdminContentService.unpublish/clearComment` (T5) được T6 gọi; `ReportService.countOpen` (T6) được T7 gọi; `escapeLike` (T4) được T5 dùng; `roles.ts` (T8) dùng ở T9–T11.
