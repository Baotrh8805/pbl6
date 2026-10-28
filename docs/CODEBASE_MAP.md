# Bản Đồ Mã Nguồn (Codebase Map)

Trả lời câu hỏi: **"Muốn sửa hay thêm một tính năng thì vào tệp nào?"**
Đường dẫn backend viết tắt từ `backend-core/src/main/java/com/pbl6/flashcard/`, frontend từ `frontend/src/`.
Cập nhật 19/10/2026 (nhánh `backend-feature-learnmode`, sau khi tích hợp backend đợt 2 và khớp frontend — hợp đồng [Plan/specs/2026-10-19-hop-dong-api-dot-2.md](Plan/specs/2026-10-19-hop-dong-api-dot-2.md)). Tiến độ: [TEAM_GUIDELINES.md](TEAM_GUIDELINES.md#-1-bảng-theo-dõi-tiến-độ-dự-án-progress-tracker), trạng thái use case: [USE_CASES_CHECKLIST.md](USE_CASES_CHECKLIST.md).
Hệ thống **không dùng Redis / Praat** (quyết định 19/10): cao độ F0 tách trong trình duyệt, bộ đếm hạn mức trong RAM. **Neo4j dùng thật từ 27/10 (D30)** cho đồ thị tri thức + GraphRAG (UC-34 / UC-35); mâu thuẫn tài liệu ↔ tham chiếu (UC-36) vẫn so trực tiếp với từ điển + nguồn tri thức chuẩn, thêm phần so giữa các bộ thẻ của người học trên đồ thị.

---

## 1. Bảng tra cứu nhanh

| Mục tiêu | Tệp cần mở |
| :--- | :--- |
| Cấu hình DB, JWT, CORS, proxy, giới hạn đăng ký | `backend-core/src/main/resources/application.properties` (bí mật để trong `application-local.properties` / biến môi trường, xem [SUPABASE_SETUP.md](SUPABASE_SETUP.md)) |
| Bảo mật tài khoản (27/10) | `security/PasswordPolicy.java` + `@StrongPassword` (8–72, chữ + số + ký tự đặc biệt; FE `lib/passwordRules.ts`), `security/LoginAttemptLimiter.java` (theo IP + email và theo email mọi IP), `AuthService.register` (đăng ký lại email chưa xác thực), `HousekeepingJob.deleteStaleUnverified` (48 giờ), header bảo mật trong `config/SecurityConfig.java`; tổng hợp ở [SECURITY.md](SECURITY.md). Test: `AccountHardeningIT`, `PasswordPolicyTest` |
| Gửi email (xác thực email + quên mật khẩu + nhắc học theo lộ trình B4; SMTP / Gmail) | Cách gửi chung: `service/MailService.java` (chưa có `spring.mail.host` → link ghi vào log; `sendNotice` cho thư không chứa token, dùng ở `LearningPathReminderJob`). Cấu hình: biến môi trường `SPRING_MAIL_HOST/PORT/USERNAME/PASSWORD`, `MAIL_FROM`, `FRONTEND_URL`, `MAIL_CONNECT_TIMEOUT_MS`, `MAIL_TIMEOUT_MS` (mẫu ở `.env.example` gốc, bảng ở README Bước 3) hoặc `spring.mail.*` trong `application-local.properties`, xem [SUPABASE_SETUP.md](SUPABASE_SETUP.md#5-gửi-email-quên-mật-khẩu-smtp). Bật / tắt xác thực email: khoá `email_verification_required` (Admin > Cấu hình); `app.auth.email-verification-forced-off` chỉ profile e2e |
| Dữ liệu từ điển ai-service (JLPT, Unihan, JMdict, KanjiVG, KRADFILE, kanjium) | `ai-service/scripts/build_dicts.py [--only jlpt\|unihan\|unihan_rs\|jmdict\|kanjivg\|kradfile\|pitch]`; nguồn, giấy phép, file nào commit, thiếu file thì tính năng nào giảm: `ai-service/app/extract/data/README.md`. Cờ có / thiếu: `GET /api/extract/health` (ai-service) → `GET /api/admin/health` (`engines`) |
| Đổi schema DB | Thêm `V<n>__mo_ta.sql` mới trong `backend-core/src/main/resources/db/migration/` (Flyway). **Không** sửa file đã chạy, **không** tạo bảng tay |
| Bộ thẻ mẫu của Thư viện | `db/migration/R__seed_system_decks.sql` |
| API công khai (không cần đăng nhập) | `config/SecurityConfig.java` |
| Định dạng lỗi JSON `{status, error, message}` | `config/ApiExceptionHandler.java` |
| Đăng ký / đăng nhập / hồ sơ / đổi & quên mật khẩu | `controller/AuthController.java`, `service/AuthService.java`, `service/RefreshTokenService.java` (refresh token hạn trượt), `service/PasswordResetService.java`. Frontend: `services/apiClient.ts` (tự làm mới token khi 401), `services/tokenStorage.ts` |
| Chống dò mật khẩu, chặn tạo tài khoản hàng loạt | `security/AttemptLimiter.java` (+ `LoginAttemptLimiter`, `RegisterRateLimiter`) |
| Thư mục lồng nhau + chia sẻ thư mục | `controller/FolderController.java`, `service/FolderService.java`, `repository/FolderRepository.java` (`isSharedWith`) |
| Bộ thẻ, thẻ, chia sẻ bộ thẻ, quyền truy cập | `controller/DeckController.java`, `service/DeckService.java` (`access(...)`, `resetProgress`), mốc `created_at / updated_at` (V35, `Deck.touch()`). FE: `pages/DecksPage.tsx` + `features/decks/deckListUtils.ts` (sắp xếp / lọc / cần ôn) + `components/DeckCard.tsx`, `lib/timeLabel.ts`, `features/decks/editor/importParser.ts` (dấu cách đọc) |
| Link riêng bộ thẻ (D9) + xuất CSV / Anki / in (UC-29) | Backend: `service/DeckShareLinkService.java` (`decks.share_token`, V33), `service/DeckExportService.java`, endpoint `/api/decks/{id}/share-link`, `/api/decks/share-link/{token}/accept`, `/api/decks/{id}/export` trong `DeckController`. Frontend: `services/deckShareService.ts`, `ShareDeckModal.tsx` (`PrivateLinkSection`), `features/decks/components/DeckExportMenu.tsx`, `pages/SharedDeckLinkPage.tsx` (`/d/:token`), `pages/DeckPrintPage.tsx` (`/decks/:id/print`). Test: `DeckShareLinkIT`, `DeckExportServiceTest`, `frontend/scripts/selfcheck/deckShare.ts` |
| Thư viện cộng đồng (tìm, lọc, chấm sao) | `controller/LibraryController.java`, `service/LibraryService.java`, `repository/DeckRepository.java` |
| Ôn tập SRS | thuật toán: `service/SrsService.java` (hàm thuần); lưu / đọc tiến độ: `service/ReviewService.java`, `controller/StudyController.java` — `frontend/src/lib/srs.ts` chỉ đọc lịch |
| Quiz: sinh đề, chấm điểm, lượt làm có hạn giờ | sinh đề / chấm từng câu: `service/QuizService.java` (hàm thuần); lượt làm, hạn giờ, ghi điểm: `service/QuizAttemptService.java`, `controller/StudyController.java`, `model/QuizAttempt.java` |
| Gọi API từ frontend | `frontend/src/services/*.ts`, `features/auth/services/authService.ts` |
| Kiểu dữ liệu khớp DTO backend | `frontend/src/types/api.types.ts` |
| Route trang | `frontend/src/routes/AppRoutes.tsx` |
| Số liệu dashboard dùng chung (tự tải lại sau mỗi thao tác ghi) | `frontend/src/components/layout/AppLayout.tsx` |
| Bóc tách tài liệu → từ vựng / ngữ pháp → bộ thẻ | `controller/ExtractionController.java`, `service/ExtractionService.java` (job, duyệt, tạo bộ thẻ), `service/ExtractionWorker.java` (@Async, 3 giai đoạn), `service/AiServiceClient.java` (RestClient → ai-service). Frontend: `services/extractionService.ts`, `pages/ExtractionPage.tsx`, `features/extraction/`. Python: `ai-service/app/extract/`. Xem [EXTRACTION.md](EXTRACTION.md) |
| Lộ trình học tập (tài liệu → chương → bộ thẻ → lịch theo ngày) | `controller/LearningPathController.java` (`/api/learning-paths`), `service/LearningPathService.java` (tạo, bản nháp, kích hoạt), `service/LearningPathScheduler.java` (chia ngày, hàm thuần), `service/ExtractionJobFinishedEvent.java`, `model/LearningPath*.java`, `V13__learning_paths.sql`. Frontend: `services/learningPathService.ts`, `pages/RoadmapPage.tsx` + `RoadmapDetailPage.tsx`, `features/roadmap/`. Python: `ai-service/app/extract/chapters.py`. Xem [LEARNING_PATH.md](LEARNING_PATH.md) |
| Điểm yếu, ma sát trí nhớ, "học gì tiếp", lộ trình bổ khuyết, nhắc học (Lộ trình 2.0) | `controller/InsightController.java` (`/api/insights/{weaknesses, friction, next}`, USER), `service/InsightService.java` (4 tín hiệu điểm yếu, gom nhóm, ma sát, gợi ý theo ưu tiên), `dto/insights/` (`WeaknessResponse`, `FrictionResponse`, `NextItem`), `repository/ReviewRepository.java` (truy vấn gộp: `countAgainByCard`, `medianReactionByCard`, `personalMedianReactionMs`, `countDueByDeckOutsidePaths`, `findStudiedDeckIds`), `QuizAttemptService.wrongAnswerCounts` (sai quiz). Bổ khuyết: `POST /api/learning-paths/remedial` → `InsightService.remedial` → `LearningPathService.remedial` / `remedialGroups`. Nhắc học: `service/LearningPathReminderJob.java` (cron `app.learning-path.reminder-cron`, mỗi người dùng một giao dịch), `LearningPathRepository.findReminderCandidates` / `claimReminder`, cột `last_reminded_on` ở `V21__ai_settings_and_reminder.sql`. Test: `InsightIT`, `InsightGroupingTest`, `LearningPathReminderJobIT`, `LearningPathReminderJobTest`. Hiệu quả lộ trình (B3): `service/PathEffectService.java` (`/api/insights/path-effect/{pathId}`, khối `pathEffect` của `/api/admin/stats`), `dto/insights/PathEffectResponse.java`; FE `lib/pathEffect.ts`, `features/roadmap/components/PathEffectPanel.tsx`, dòng trong `AdminPathBreakdown.tsx`; test `PathEffectIT`. Xem [LEARNING_PATH.md](LEARNING_PATH.md) mục 11 |
| Admin Panel (staff: ADMIN / SUPER_ADMIN; thống kê, người dùng, kiểm duyệt, báo cáo, cấu hình, audit) | Phân quyền: `config/SecurityConfig.java` (`RoleHierarchy`, `/api/admin/**` cần ADMIN, API học cần USER), `@PreAuthorize` trên method ghi. Backend: `controller/Admin*Controller.java`, `service/AdminUserService`, `AdminContentService`, `ReportService`, `SettingsService` (bảng `app_settings`: 13 khoá — V14 hạn mức / thông báo / đăng ký, V20 3 khoá lộ trình, V21 6 khoá AI), `AdminStatsService`, `AuditService` (bảng `admin_audit_logs`), `V14__admin_panel.sql`. Người học báo cáo: `POST /api/library/decks/{id}/reports`. Frontend: `components/layout/AdminLayout.tsx`, `pages/admin/*`, `features/admin/`, `lib/roles.ts`, `services/adminService.ts`. Spec: [Plan/specs/2026-10-17-admin-panel-design.md](Plan/specs/2026-10-17-admin-panel-design.md) |
| Từ điển Nhật–Việt cộng đồng (UC-43..45, spec 2026-10-26) | Backend: `controller/DictionaryController.java` (`/api/dictionary/*`, USER), `controller/AdminDictionaryController.java` (`/api/admin/dictionary/*`), `service/dictionary/` (`DictionaryService` gộp lớp + dịch lúc tra, `DictionaryCommunityService` bình luận / báo cáo, `AdminDictionaryService`, `DictionaryStore` JDBC cho bảng `dict_*`, `DictionaryOverridePublisher`, `DictionarySeedLoader`, `DictionaryKeys`, `DictionaryAiClient`), `security/DictionaryRateLimiter.java`, `V32__dictionary.sql`, `resources/dict/*.csv` (nghĩa dịch sẵn). Python: `ai-service/app/extract/dictionary.py`, `overrides.py`, `app/api/dict_router.py`, `scripts/build_dicts.py` (`write_jmdict`), `scripts/map_dict_vi_keys.py`. Frontend: `pages/DictionaryPage.tsx`, `features/dictionary/`, `services/dictionaryService.ts`, `pages/admin/AdminDictionaryPage.tsx`, `features/admin/components/DictEntryEditor.tsx`, `DictReportsPanel.tsx`, `types/dictionary.types.ts`, `pages/DataSourcesPage.tsx`. Cải tiến 26/10: `ai-service/app/extract/example_vi.py` + `data/example_vi.csv` (câu ví dụ dịch sẵn), `handwriting.py` (vẽ chữ để tra), `dictionary.sentences` / `_search_deinflected`; FE `features/dictionary/components/SentencesTab.tsx`, `HandwritingPad.tsx`; nghĩa mở rộng `resources/dict/jmdict_example_words_meaning_vi.csv`. Test: `DictionaryIT`, `ExtractionIT`, `ai-service/tests/test_dictionary.py`, `test_handwriting.py`, `frontend/scripts/selfcheck/dictionary.ts`. **Dịch câu (28/10, D33, UC-48, V39)**: Python `ai-service/app/extract/translate_text.py` (phân tích cụm, lọc đầu ra) + `gemini.translate_text`, `POST /api/dict/translate-text`; backend `DictionaryService.translateText` (`POST /api/dictionary/translate`), `DictionaryStore` bộ nhớ dịch `dict_text_translations`, `DictionaryRateLimiter` trần giờ / chống dồn, khoá `dictionary_translate_hourly_limit`, `HousekeepingJob` dọn 30 ngày; FE `features/dictionary/components/TranslateTab.tsx`, gợi ý ở `WordsTab` / `SentencesTab`, hàm thuần `dictUtils.ts`. Test `test_translate_text.py`, +3 ca `DictionaryIT`, selfcheck `dictionary.ts`, smoke-admin |
| Kiểm duyệt bình luận bằng AI + mô hình trí nhớ HLR (spec 2026-10-27 đêm, D31 / D32, V38) | Python: `ai-service/app/moderation/` (`preprocess.py` tiền xử lý + Keras Tokenizer dựng lại, `vihsd.py` CNN+BiLSTM numpy 3 lớp, `vihos.py` PhoBERT đánh dấu từ — cần `requirements-ml.txt`), `app/hlr/model.py` (+ `data/hlr_portable.json`), router `app/api/moderation_router.py` (`/api/moderation/check`, `/info`), `hlr_router.py` (`/api/hlr/predict`, `/info`); model lớn ở `ai-service/models/` (`MANIFEST.json`, `scripts/fetch_models.py`, `export_vihsd.py`, `export_hlr.py`). Backend: `service/moderation/` (`ModerationPolicy` quy tắc thuần, `ModerationService` chấm + khoá mềm + nhạy cảm, `ModerationStore` JDBC cột `mod_*` / `dict_sensitive`, `ModerationAiClient`, `ModerationRescanJob`, `AdminModerationService`), `controller/AdminModerationController.java` (`/api/admin/moderation/*`, `/api/admin/dictionary/entries/{key}/sensitive`), hook ở `DictionaryCommunityService`, `LibraryService.rate`, `MnemonicService.create`, `AuthService.updateProfile`, `HousekeepingJob` (xoá BLOCKED > 30 ngày); HLR: `service/hlr/HlrClient.java`, `RecallService.java`, `SrsService.brake`, `ReviewService.apply / deckRecall` (`GET /api/decks/{id}/recall`), `LearningPathService.session` (xếp theo p), `InsightService` (`low_recall`), `AiServiceClient.postJsonQuick`. Frontend: `pages/admin/AdminModerationPage.tsx`, `features/admin/components/ModerationText.tsx`, `services/moderationService.ts`, `types/moderation.types.ts`, `lib/moderation.ts`, dải trạng thái ở `DictComments.tsx` / `DeckRatingForm.tsx` / `DeckRatings.tsx`, công tắc nhạy cảm `DictEntryEditor.tsx`, `DeckRecallChip.tsx`, dòng HLR ở `StudyPage.tsx`. Test: `test_moderation_*.py`, `test_hlr.py`, `ModerationPolicyTest`, `ModerationIT`, `ReviewHlrIT`, `SrsBrakeTest`, selfcheck `moderation.ts`, smoke-admin / smoke-learning-path |
| Đồ thị tri thức Neo4j + GraphRAG (UC-34 / UC-35, spec 2026-10-27, D30) | Python (tầng duy nhất nối Neo4j): `ai-service/app/graph/` — `client.py` (driver, `GraphUnavailable` → 503), `schema.py` (nhãn, ràng buộc), `builder.py` (dựng lớp tham chiếu từ JMdict / JLPT / Unihan / KRADFILE / bộ thủ / `patterns.yaml` / `example_vi`), `sync.py` (lớp người học theo `run`, `finish` dọn cũ), `queries.py` (resolve / explore / path / recommend / conflicts / status), `rag.py` (thực thể → đồ thị ⊕ văn bản → Gemini / trả lời mẫu); router `app/api/graph_router.py`. Backend: `service/graph/GraphAiClient.java`, `GraphSyncService.java` (JDBC → lô), `GraphService.java` (hạn mức, đồng bộ lười, `GRAPH_UNAVAILABLE`), `GraphSyncJob.java` (`app.graph.sync-cron`), `controller/GraphController.java` (`/api/graph/*`), `AdminGraphController.java` (`/api/admin/graph/*`). Frontend: `pages/KnowledgeGraphPage.tsx` (`/graph`), `features/graph/` (SVG bố cục lực, bảng node, gợi ý, hỏi đáp, đường nối), `lib/graphLayout.ts`, `services/graphService.ts`, `types/graph.types.ts`, `features/admin/components/AdminGraphCard.tsx`. Test: `ai-service/tests/test_graph_*.py` (FakeGraph) + `test_graph_live.py` (Neo4j thật, `NEO4J_TEST_URI`), `GraphIT`, `frontend/scripts/selfcheck/graph.ts`. Chạy: `docker compose up -d neo4j`, Admin › Tổng quan › Dựng lại đồ thị |
| Nợ kỹ thuật 27/10 (B5–B8 của kế hoạch 26/10) | B5.1 thuật ngữ trùng / NFKC: `DeckService.normalizeTerm / rejectDuplicates` (409 `DUPLICATE_TERM`, `DeckRequest.allowDuplicate`, `?allowDuplicate=` ở `/cards/batch`); B5.2 `extraction_items.doc_level` (V36) → `ConflictService.evaluatedFields` đánh giá lại level / grammar; B5.3 `ai-service/app/extract/jlpt/classifier.clean_row`; B5.5 `features/admin/adminUtils.lockReasonPatch`; B5.6 `frontend/src/lib/dateFile.ts`; B5.7 `config/AiServiceKeyWarning.java`; B5.8 `features/roadmap/useDeckLearningPath.ts` + `roadmapUtils.activePathIds`; B8 `config/InstanceId.java` (`app.instance-id`), V37 `instance_id`, `ExtractionJobRepository.failUnfinished(…, instance, cutoff)`, `LearningPathService.failOrphans`. Test: `DeckCardsIT`, `ConflictIT`, `OrphanJobsIT`, `test_classifier.py`, selfcheck `dateFile.ts` / `admin.ts` / `learningPath.ts` |
| Tra cứu chữ Hán (bản đồ Hán-Việt F1, thẻ chữ Hán C5, bộ thủ C4) | `controller/NlpController.java` (`/api/nlp/*`, USER), `service/NlpService.java` (kiểm tham số, cache GET 10 phút / 500 mục, đổi lỗi ai-service → 400 / 404 / 503), `service/TtlCache.java`, `service/AiServiceClient.java` (`hanVietGraph`, `hanVietSuggest`, `kanjiCards`, `radicals`, `radicalKanji`, `radicalCards`; timeout đọc 30 s). Python: `ai-service/app/api/kanji_info_router.py`, `radical_router.py`. Frontend: `services/nlpService.ts`, `services/kanjiService.ts` |
| Quiz đa loại + ngân hàng câu hỏi (đợt 2 §1: meaning, kanji_lookalike, homophone, reading tự gõ, conjugation) | sinh đề / chấm: `service/QuizService.java` (`contentKey`, câu admin đã sửa qua `extra.supersedes`), `service/QuizAttemptService.java` (`questionTypes`, `verbCandidates`), `service/QuizCapabilities.java` (`count`, `isVerbCandidate`), `service/KanaUtil.java` (chuẩn hoá kana câu gõ), `service/QuizAiClient.java` (ai-service `/extract/distractors`, chia động từ; ngưỡng `distractor_min_confidence`). Ngân hàng + báo lỗi + admin G3: `service/QuestionBankService.java`, `controller/QuizQuestionController.java` (`POST /api/quiz-questions/{id}/flags`), `controller/AdminQuestionController.java` (`/api/admin/questions`, `/question-flags/{id}/resolve`), `model/QuizQuestion.java`, `model/QuestionFlag.java`, `V22__quiz_types_and_bank.sql`. Bộ thẻ: `GET /api/decks/{id}/quiz-capabilities`, `POST /api/decks/{id}/distractors` (`DeckController`). Test: `QuizAttemptIT`, `QuizQuestionIT`, `QuizRegressionProbeIT`, `DeckCapabilitiesIT`, `QuizServiceTest`, `QuizCapabilitiesTest`, `KanaUtilTest`, `QuizAiClientTest` |
| Luyện viết chữ Hán (DTW + KanjiVG), phát âm, trọng âm (đợt 2 §2) | `controller/PracticeController.java` (`/api/practice/*`, USER), `service/PracticeService.java` (ghi `practice_logs`, thống kê), `service/PracticeAiClient.java` (ai-service `/kanji/*`, `/audio/pitch/*`). Âm thanh không gửi lên server: nhận dạng giọng bằng Web Speech API, F0 bằng WebAudio ở `frontend/src/lib/asr.ts`, `lib/pitch.ts`. Python: `ai-service/app/extract/stroke_score.py` (DTW), `app/extract/pitch.py`, `app/api/audio_praat_router.py`. `V23__practice_logs.sql`. Test: `PracticeIT`, `PracticeAiClientTest` |
| Dashboard hoạt động cá nhân (đợt 2 §7) | `GET /api/reviews/activity` trong `controller/StudyController.java` → `service/ReviewActivityService.java` (ngày học, `dueToday`, `newCards`, chuỗi ngày theo tz; hàm thuần `ActivityStreaks`). Test: `ReviewActivityIT`, `ActivityStreaksTest` |
| Xác thực email (đợt 2 §3) + khiếu nại tài khoản bị khoá (§6) | `service/EmailVerificationService.java` (token SHA-256 24 giờ, gửi mail SAU khi commit), `controller/AuthController.java` (`/verify-email`, `/resend-verification`, `/appeals`), `security/JwtAuthenticationFilter.java` + đăng nhập (403 `EMAIL_NOT_VERIFIED`), khoá `email_verification_required`; `POST /api/admin/users/{id}/verify-email` (`AdminUserController`). Khiếu nại: `service/AppealService.java` (`countOpen`), `controller/AdminAppealController.java` (`/api/admin/appeals`), `service/AccountDeletionService.java` (`isDeleted`). `V24__email_verification.sql`, `V27__account_appeals.sql`. Test: `EmailVerificationIT`, `AppealIT`, `PasswordResetIT` |
| Mẹo nhớ bộ thủ + kiểm duyệt (đợt 2 §4) | `controller/KanjiMnemonicController.java` (`/api/kanji/{ch}/mnemonics`, `/mnemonics/generate`, `/mnemonics`), `controller/AdminMnemonicController.java` (`/api/admin/mnemonics`), `service/MnemonicService.java` (`countPending`, giới hạn 10 lần sinh / giờ qua `security/MnemonicRateLimiter.java`, ≤ 50 mẹo PENDING / người, thông báo `Notification.MNEMONIC_REVIEWED`), `service/ContentAiClient.java`, `V25__kanji_mnemonics.sql`. Test: `MnemonicIT`, `MnemonicTemplateTest`, `ContentAiClientTest` |
| Cảnh báo mâu thuẫn tài liệu ↔ tham chiếu + nguồn tri thức chuẩn (đợt 2 §5) | `service/ConflictService.java` + `ConflictSupport.java` (gộp cảnh báo, kiểm tra lại chỉ trường tài liệu khai báo), `controller/ConflictController.java` (`/api/extractions/{id}/recheck-conflicts`, `/api/learning-paths/{id}/recheck-conflicts`), `ExtractionWorker.analyzeOptions` (gửi tham chiếu + `contradiction_alert_threshold`). Nguồn chuẩn: `controller/AdminKnowledgeSourceController.java` (`/api/admin/knowledge-sources`, xoá cần SUPER_ADMIN), `service/KnowledgeSourceService.java` (`activeReferences`, `referencesFor`). `V26__extraction_conflicts.sql`, `V28__knowledge_sources.sql`. Test: `ConflictIT`, `KnowledgeSourceIT`, `ConflictSupportTest` |
| Câu ví dụ i+1 (đợt 2 §9) | `controller/IPlusOneController.java` (`/api/extractions/{id}/i-plus-one`, `/apply`), `service/IPlusOneService.java` (áp cho job lộ trình chỉ khi lộ trình DRAFT). Test: `IPlusOneIT` |
| Thống kê admin đợt 2: hàng đợi kiểm duyệt + hiệu suất AI (G6) | `service/AdminStatsService.java` (`openQuestionFlags` / `pendingMnemonics` / `openAppeals` từ `QuestionBankService.countOpenFlags`, `MnemonicService.countPending`, `AppealService.countOpen`; `ai.engines` / `ai.enrich` / `ocrSeries` trong cửa sổ `days`), native query `ExtractionJobRepository.engineStats` / `ocrByDay` / `enrichStats` (projection `AiEngineStatRow`, `OcrDayRow`, `EnrichStatRow`), `dto/admin/AdminStatsResponse.java`. Cờ thành phần ai-service: `GET /api/admin/health` → `engines` từ `AiServiceClient.healthBody()` (client 2 giây). Test: `AdminStatsIT`, `AdminStatsServiceTest`, `AiServiceClientHealthTest`; ma trận quyền mọi endpoint admin: `AdminAuthorizationIT` |
| Sao lưu / khôi phục DB | `scripts/backup.ps1`, `scripts/backup.sh` (pg_dump), xem [SUPABASE_SETUP.md](SUPABASE_SETUP.md#7-sao-lưu--khôi-phục-uc-42) |
| AI khác | `ai-service/app/api/*.py` (`kanji_dtw_router`, `audio_praat_router`, `radical_router`, `mining_router`, `grammar_router`, `kanji_info_router`); backend gọi qua client mỏng của từng nhóm (`QuizAiClient`, `PracticeAiClient`, `ContentAiClient`) dùng chung `AiServiceClient.getJson` / `postJson` / `postJsonLong` |

---

## 2. Backend (`backend-core`, Spring Boot 3.5, Java 17)

### Quyền truy cập bộ thẻ (`DeckService.access`)
Chủ > được chia sẻ riêng bộ thẻ (`deck_shares`: VIEWER/EDITOR) > bộ thẻ public (Thư viện) hoặc nằm trong thư mục
được chia sẻ (`folder_shares`, hoặc thư mục `accessType = public`) = chỉ xem & học. Không có quyền = 404.

- `GET /api/decks`: "Bộ thẻ của tôi" = bộ thẻ sở hữu (gồm bản đã lưu từ Thư viện) + bộ được chia sẻ qua email.
  Bộ thẻ public của người khác chỉ có ở `GET /api/library/decks`.
- `GET /api/decks?folderId=`: bộ thẻ trong thư mục của mình hoặc thư mục được chia sẻ cho mình.

### Đánh giá bộ thẻ (Thư viện, bộ thẻ public)
- `PUT /api/library/decks/{id}/rating` `{stars 1-5, comment?<=500}`: một đánh giá mỗi người mỗi bộ thẻ (unique
  `deck_id,user_id`), gửi lại = sửa cả sao lẫn bình luận. Không tự chấm bộ của mình (400), bộ không public = 404.
- `DELETE /api/library/decks/{id}/rating`: xoá đánh giá của mình.
- `GET /api/library/decks/{id}/ratings?page&size`: trung bình, số lượt, `mine`, danh sách mới nhất trước.
  FE: `DeckRatings` (hiển thị) + `DeckRatingForm` (form), dùng ở `DeckDetailPage` và `LibraryPreviewModal`.

### Thư mục
- `GET /api/folders` (cây của mình), `GET /api/folders/shared` (người khác chia sẻ), `GET /api/folders/{id}`.
- Chia sẻ: `GET|PUT /api/folders/{id}/shares`, `DELETE /api/folders/{id}/shares/{userId}`,
  `PUT /api/folders/{id}/link-access` (`{"public": true}` = ai có link đều xem được).
- Xoá thư mục cha không xoá con: con và bộ thẻ được đưa về gốc.

### Quiz (`controller/StudyController.java`)
- `POST /api/quiz-attempts` `{deckId, size, mode, questionTypes?}` mở lượt làm (`AttemptState`, có hạn giờ; loại câu
  `meaning|kanji_lookalike|homophone|reading|conjugation`, mặc định `meaning`); `GET /api/quiz-attempts/open` lượt đang dở,
  `GET /api/quiz-attempts/{id}` làm tiếp.
- `PUT /api/quiz-attempts/{id}/answers/{cardId}` `{option}` trả lời từng câu (câu `reading` là chuỗi tự gõ, chuẩn hoá kana);
  `POST /api/quiz-attempts/{id}/submit` nộp 1 lần, chấm trên mọi câu đã phát (bỏ trống = sai). Lượt bỏ dở quá hạn được ghi 0 điểm.
- `GET /api/quizzes/{deckId}/preview`: câu mẫu, không mở lượt làm. `GET /api/quiz-results`, `/quiz-results/count`: lịch sử.
- Báo lỗi câu: `POST /api/quiz-questions/{questionId}/flags` (`QuizQuestionController`).

### Auth (`controller/AuthController.java`)
- Công khai: `POST /api/auth/register|login|refresh|logout|forgot-password|reset-password|verify-email|resend-verification|appeals`.
- Cần đăng nhập: `GET /api/auth/me`, `DELETE /api/auth/me` (tự xoá tài khoản), `PUT /api/auth/profile|password|jlpt-level`.
- JWT HS512, secret bắt buộc từ cấu hình (>= 64 byte). Đổi / đặt lại mật khẩu thu hồi mọi token cũ. Đăng ký trả JSON
  `{message, needsVerification}`; USER chưa xác thực email đăng nhập → 403 `code: EMAIL_NOT_VERIFIED` (staff không bị chặn).

### Migration (Flyway)
`V1` baseline · `V2` ràng buộc & độ dài cột · `V3` thư viện, chia sẻ bộ thẻ, chấm sao · `V4` chia sẻ thư mục ·
`V5` lượt làm quiz · `V6` token đặt lại mật khẩu · `V7` refresh token · `V8` gộp ví dụ vào nghĩa · `V9` chế độ quiz & làm tiếp · `V10` bình luận đánh giá ·
`V11` log ôn tập & reset tiến độ · `V12` job bóc tách AI (`extraction_jobs`, `extraction_items`, thêm cột vào `flashcards`) ·
`V13` lộ trình học tập (`learning_paths`, `learning_path_chapters`, `extraction_jobs.purpose`, `extraction_items.chapter_*`) ·
`V14` Admin Panel (vai trò `ADMIN/SUPER_ADMIN`, `users.locked_at`, `users.extraction_daily_limit`, `app_settings`, `content_reports`, `admin_audit_logs`) · `V15` 2 tài khoản quản trị khởi tạo ·
`V16` bảo mật staff · `V17` thông báo · `V18` `premium_until` · `V19` bỏ `totp_secret` · `V20` lộ trình 2.0 · `V21` tham số AI + `last_reminded_on` ·
đợt 2: `V22` quiz đa loại + ngân hàng câu hỏi · `V23` `practice_logs` · `V24` xác thực email · `V25` `kanji_mnemonics` · `V26` `extraction_items.conflicts` ·
`V27` `account_appeals` · `V28` `knowledge_sources` · `R__seed_system_decks` bộ thẻ mẫu.

### Test
`mvn test` chạy khoảng 455 test (unit + tích hợp `*IT.java`; đếm theo `@Test` ngày 19/10, con số thật xem output Maven) trên Postgres nhúng (không cần Docker / Supabase).
Test mới cho từng tính năng nằm cạnh test cũ cùng miền: `FolderShareIT`, `QuizAttemptIT`, `PasswordResetIT`, `RefreshTokenIT`,
`AuthValidationIT`, `RegisterRateLimitIT`, `ExtractionIT` (ai-service giả lập bằng `@MockitoBean`), `LearningPathIT`, `LearningPathSchedulerTest`,
Admin Panel: `AdminAuthorizationIT` (ma trận vai trò), `AccountLockIT`, `AdminUserIT`, `AdminContentIT`, `ContentReportIT`, `AdminSettingsIT`, `AdminStatsIT`, `AdminAuditIT`, `AdminStatsServiceTest`.
Tra cứu NLP: `NlpIT` (proxy, kiểm tham số, cache, mã lỗi), `AiServiceClientNlpTest` (HTTP thật tới HttpServer giả), `TtlCacheTest`.
Đợt 2: xem cột "Test" của từng dòng đợt 2 ở bảng mục 1 (`QuizQuestionIT`, `PracticeIT`, `EmailVerificationIT`, `AppealIT`, `MnemonicIT`, `ConflictIT`, `KnowledgeSourceIT`, `IPlusOneIT`, `ReviewActivityIT`…).
`ai-service`: `cd ai-service && python -m pytest -q` (khoảng 1 240 test kể cả tham số hoá, 19/10; test cần Tesseract / Gemini tự bỏ qua khi thiếu, test cần dữ liệu không commit — JMdict, KanjiVG, KRADFILE, kanjium — thay bằng dữ liệu giả qua monkeypatch hoặc tự bỏ qua, nên CI không cần chạy `build_dicts.py`).
`npm run e2e` (thư mục gốc) chạy smoke test HTTP trên backend thật + Postgres nhúng.

---

## 3. Frontend (`frontend`, React 19 + Vite + Tailwind 3)

| Thư mục | Nội dung |
| :--- | :--- |
| `pages/` | Mỗi route một trang (bảng route: `routes/AppRoutes.tsx`). Người học: Dashboard (`/`), Decks, Folders, Library, DeckDetail / DeckEditor, Study (`/decks/:id/study` và phiên lộ trình `/session`), Quiz (`/decks/:id/quiz`), QuizRoom (`/quiz`), Roadmap (`/roadmap`) / RoadmapDetail (`/roadmap/:id`), Extractions (`/extractions`) / Extraction (`/extractions/:id`), HanVietMap (`/han-viet`), Kanji (`/kanji`: tra chữ, bộ thủ, mẹo nhớ, luyện viết), Profile. Công khai: Login / Register / ForgotPassword / ResetPassword / VerifyEmail (`/verify-email?token=`). Staff: StaffSetup (`/setup`, đổi mật khẩu seed), `pages/admin/*` dưới `/admin` (Dashboard, Users, Decks, Reports, Mnemonics, Questions, Knowledge, Appeals, Audit, Settings) |
| `features/<miền>/` | Component + helper theo miền: `admin`, `auth` (gồm gửi lại link xác thực, khiếu nại), `dashboard` (gồm `QuickAiUploadModal`: tải tài liệu, `TodayPathWidget`), `decks`, `extraction` (gồm cảnh báo mâu thuẫn, câu i+1), `folders`, `hanviet`, `insights`, `kanji`, `library`, `practice` (`KanjiWritePanel`, `PronunciationPanel`), `profile` (gồm thống kê luyện tập), `quiz` (loại câu, câu tự gõ, báo lỗi câu), `roadmap` (modal tạo, bản nháp, lịch, "Hôm nay" / `TodaySessionPanel`, cân lại lịch, `useTodaySummary`) |
| `components/` | Layout (`AppLayout`, `AdminLayout`, `AuthLayout`) và UI dùng chung (`Button`, `Input`, `KanaInput`, `Modal`, `DialogProvider`) |
| `lib/` | Hàm thuần: `deckUtils` (gồm `JLPT_LEVELS`), `learningStats`, `srs`, `useAsync` (tham số `reload` để tải lại ngầm), `textUtils` (`getInitials`), `speech` (đọc mẫu), `asr` (nhận dạng giọng nói), `pitch` (F0 WebAudio + H/L), `kana` (chuẩn hoá, điểm phát âm), `strokes` (nét Kanji), `roles` |
| `services/` | `apiClient` (gắn JWT, 401 -> đăng xuất, phát `data:changed` sau request ghi), các service gọi API (`practiceService`, `activityService`, `insightService`, `mnemonicService`, `adminQuestionService`…) |

Kiểm tra: `npm run lint`, `npm run build`, `npm run selfcheck` (`scripts/selfCheck.ts` + mỗi làn một file `scripts/selfcheck/*.ts`: admin, learner, practice,
quiz, manual (kiểm tay / văn bản giao diện), learningPath, study, dictionary, deckShare, qa2710, graph, dateFile; cần Node >= 22.18).
Trang staff tự quản tài khoản: `/admin/account` (`pages/admin/AdminAccountPage.tsx` — đổi mật khẩu seed, hồ sơ).

---

## 4. AI Service (`ai-service`, FastAPI)

| Endpoint | Tệp | Trạng thái |
| :--- | :--- | :--- |
| `POST /api/extract/text`, `/analyze`, `/enrich`, `/distractors`, `/conflicts`, `GET /api/extract/health` | `app/api/extract_router.py` → `app/extract/` (readers, tokenizer SudachiPy, entries — bố cục list/prose + tách cụm/nghĩa, chapters — tách chương cho Lộ trình, furigana, heteronyms, han_viet, jmdict, jlpt, grammar, pipeline, gemini, distractors + kanji_similar, conflicts) | Thật, backend gọi qua `AiServiceClient` / `QuizAiClient` / `ContentAiClient`. Xem [EXTRACTION.md](EXTRACTION.md). Health trả cờ từng thành phần + dữ liệu (`jmdict`, `kanjivg`, `kradfile`, `pitch`…) |
| `POST /api/nlp/analyze` | `app/api/nlp_router.py` | Dùng lại tokenizer / furigana / Hán-Việt / JLPT của `app/extract` |
| `GET /api/kanji/{ch}/strokes`, `POST /api/kanji/score` (`/score-stroke` chỉ còn alias deprecated) | `app/api/kanji_dtw_router.py` → `app/extract/stroke_score.py` (DTW từng nét), `kanjidata.py` (nét mẫu KanjiVG) | Thật; thiếu `kanji_strokes.json` → 404. Backend: `PracticeAiClient` |
| `GET /api/audio/pitch-reference`, `POST /api/audio/pitch-score` | `app/api/audio_praat_router.py` → `app/extract/pitch.py` (kiểu trọng âm kanjium → H/L theo mora, chấm đường F0 trình duyệt gửi) | Thật, không dùng Praat (tên tệp giữ từ khung cũ); thiếu `pitch_accent.csv` → 404 trừ khi gửi `accentType`. Route mock `/evaluate-pitch` đã bỏ |
| `POST /api/ocr/process-image` | `app/api/ocr_router.py` | Gọi `app/extract/readers/image_reader.py` (Tesseract + Gemini fallback) |
| `GET /api/kanji-info/han-viet-graph`, `/han-viet-suggest`, `POST /kanji-info/kanji-cards` | `app/api/kanji_info_router.py` → `han_viet_graph.py` (âm → chữ → từ từ Unihan + JLPT + JMdict), `kanji_cards.py` | Thật; backend `NlpService` proxy ở `/api/nlp/*` |
| `POST /api/grammar/conjugation-quiz`, `GET /api/grammar/health` | `app/api/grammar_router.py` → `app/extract/conjugate.py` (theo quy tắc) | Thật; quiz loại `conjugation` |
| `GET /api/radicals`, `/radicals/{no}/kanji`, `POST /api/radicals/cards` | `app/api/radical_router.py` → `radicals.py` (214 bộ thủ, mẹo nhớ Gemini → mẫu dự phòng) | Thật; mẹo sinh ra lưu PENDING chờ admin duyệt (backend `MnemonicService`) |
| `POST /api/mining/i-plus-one`, `/for-terms`, `GET /api/mining/health` | `app/api/mining_router.py` → `sentence_mining.py` | Thật; câu i+1 (backend `IPlusOneService`) |
| `POST /api/moderation/check`, `GET /api/moderation/info` | `app/api/moderation_router.py` → `app/moderation/` (ViHSD numpy + PhoBERT tuỳ chọn) | Thật (27/10 đêm); thiếu `models/vihsd_cnn_lstm.npz` → 503 `moderationUnavailable`, thiếu torch / PhoBERT → không có từ đánh dấu |
| `POST /api/hlr/predict`, `GET /api/hlr/info` | `app/api/hlr_router.py` → `app/hlr/model.py` (numpy, JSON trọng số đã commit) | Thật (27/10 đêm); backend `HlrClient` |
| `POST /api/dict/translate-text` (cùng `/api/dict/*` của từ điển) | `app/api/dict_router.py` → `app/extract/translate_text.py` (phân tích cụm Sudachi + JMdict + JLPT, lọc đầu ra) + `gemini.translate_text` (Gemini dịch cả đoạn, hồ sơ 20 s / hạn chót 26 s) | Thật (28/10, D33); luôn 200, `reason` khi thiếu bản dịch (`no_api_key` / `quota` / `aiOverloaded` / `error` / `skipped`); backend `DictionaryAiClient.translateText` |

CORS đang mở `*`; **mọi** router có khoá nội bộ `AI_SERVICE_KEY` qua header `X-Internal-Key` (`app/core/security.py`, bỏ qua khi
rỗng). Dữ liệu từ điển ở `app/extract/data/`: 4 file không commit (`jmdict.sqlite`, `kanji_strokes.json`, `kradfile.csv`,
`pitch_accent.csv`) tạo bằng `scripts/build_dicts.py --only jmdict|kanjivg|kradfile|pitch`; nguồn, giấy phép và tính năng
giảm khi thiếu: `app/extract/data/README.md`. Biến `NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD` trong `app/core/config.py` cấu hình
kết nối Neo4j cho `app/graph/` (mật khẩu mặc định chỉ cho dev; `client.py` cảnh báo khi URI không phải localhost mà vẫn dùng mặc định).

---

## 5. Hạ tầng & tài liệu

- `docker-compose.yml`: Postgres 16, Redis, Neo4j cho chạy offline. Postgres (`docker compose up -d postgres`) và **Neo4j**
  (`docker compose up -d neo4j`, đồ thị tri thức — ai-service nối qua `NEO4J_*`) được dùng; Redis còn từ thiết kế ban đầu, không code
  nào kết nối (bộ đếm rate limit nằm trong RAM — `security/AttemptLimiter.java`).
- `.env.example` (gốc): danh sách biến môi trường — DB, JWT, ai-service / Gemini / Tesseract, SMTP + `FRONTEND_URL`. Backend
  không tự đọc `.env`: đặt biến môi trường thật hoặc ghi vào `application-local.properties`.
- `.github/workflows/ci.yml`: CI chạy `mvn test` + lint/build/selfcheck frontend + `pytest` ai-service (Python 3.12) cho mọi push/PR.
- `dev.mjs` (`npm run dev`: bật cả ai-service nếu có `ai-service/venv`), `e2e.mjs` (`npm run e2e`), `smoke-*.mjs`
  (`npm run smoke:extraction`, `npm run smoke:learning-path` cần backend + ai-service thật): script chạy thử ở thư mục gốc.
- `ai-service/scripts/`: `build_dicts.py` (tải / dựng dữ liệu từ điển, `--only jlpt|unihan|unihan_rs|jmdict|kanjivg|kradfile|pitch`),
  `ocr_eval.py` (đo CER của OCR).
- `docs/`: [ARCHITECTURE.md](ARCHITECTURE.md), [SUPABASE_SETUP.md](SUPABASE_SETUP.md),
  [USE_CASES_CHECKLIST.md](USE_CASES_CHECKLIST.md), [TEAM_GUIDELINES.md](TEAM_GUIDELINES.md), [CHANGELOG.md](CHANGELOG.md),
  [EXTRACTION.md](EXTRACTION.md) (bóc tách AI), [Plan/](Plan/README.md) (spec & kế hoạch, kèm trạng thái),
  [Progress/](Progress/) (tổng kết từng đợt, mới nhất [2026-10-19-tien-trinh.md](Progress/2026-10-19-tien-trinh.md)).
  `docs/` nằm trong `.gitignore` từ 18/10/2026: sửa ở đây chỉ có trên máy mình, không đi theo commit.
