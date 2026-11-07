# Kế hoạch: Kiểm duyệt AI + HLR (spec [../specs/2026-10-27-kiem-duyet-ai-va-hlr-design.md](../specs/2026-10-27-kiem-duyet-ai-va-hlr-design.md))

27/10/2026 (đêm), nhánh `tudien`. Chỉ liệt kê việc (D28); mỗi gói một commit sau khi test xanh; không push.

## A. ai-service (commit 1)
- [x] A1 Xác minh model: vai trò hai file hate-speech, dựng lại tokenizer (acc 0,8437), chọn checkpoint epoch 12, đo PhoBERT, đo đường cong HLR.
- [x] A2 HLR numpy `app/hlr/model.py` + `hlr_router.py` + `tests/test_hlr.py` (khớp torch qua `fixtures/hlr_reference.json`).
- [x] A3 `app/moderation/preprocess.py` (tiền xử lý notebook + Keras Tokenizer), `vihsd.py` (CNN+BiLSTM numpy), `vihos.py` (PhoBERT tuỳ chọn, căn vị trí từ),
      `moderation_router.py` (`/check`, `/info`), cờ health `moderation` / `moderationSpans` / `hlr`, đăng ký router.
- [x] A4 `models/` + `MANIFEST.json` + `README.md`, `scripts/fetch_models.py`, `.gitignore`, `requirements.txt` (+pyvi, emoji-vietnamese), `requirements-ml.txt`;
      cài vào venv (pyvi, emoji, torch CPU, transformers); README ai-service.
- [x] A5 Test: preprocess, vihsd (mạng tí hon + parity Keras khi có file), vihos (model giả), router; `pytest` xanh.

## B. backend (commit 2: migration + kiểm duyệt; commit 3: HLR)
- [x] B1 V38: cột `mod_*` (dict_comments, deck_ratings), `kanji_mnemonics.mod_*`, `users.comment_locked_until`, bảng `dict_sensitive`, `reviews.seen/correct/last_reviewed_at/recall_p/hlr_brake` + lấp từ `review_logs`, index.
- [x] B2 `ModerationAiClient` (timeout riêng 3 s qua `AiServiceClient`), `ModerationPolicy` (thuần), `ModerationResult`, `ModerationService` (check + áp cho bình luận từ điển / đánh giá / mẹo / tên; khoá 24 h; che từ; PENDING khi lỗi).
- [x] B3 Sửa `DictionaryCommunityService` / `DictionaryStore` (hiển thị theo mod_status, DTO mới, commentCount), `LibraryService.rate` + `DeckRatingRepository`, `MnemonicService.create`, `AuthService.updateProfile`.
- [x] B4 Admin: `AdminModerationController` + `AdminModerationService` (hàng chờ, ignore / restore / hide / delete, rescan), `dict_sensitive` (toggle + đọc nhãn JMdict qua `DictionaryService.layered`), `AdminStatsResponse.openModeration`, `AdminUserService` (khoá bình luận), `ModerationRescanJob`, `HousekeepingJob` xoá BLOCKED > 30 ngày, thông báo `MOD_COMMENT_RESTORED`, audit.
- [x] B5 HLR: `HlrClient` (1,5 s), `SrsService.schedule(…, brake)`, `ReviewService.apply` (seen/correct/last, recallBefore, phanh, undo tính lại), `ReviewResponse`, `GET /api/decks/{id}/recall`, thứ tự phiên lộ trình theo recall, `InsightService` `low_recall`.
- [x] B6 Test: `ModerationPolicyTest`, `ModerationIT`, `AdminModerationIT`, `SrsServiceTest`, `ReviewHlrIT`, `DeckRecallIT`, bổ sung `LearningPathIT` / `InsightIT` / `HousekeepingIT`; `mvn test` xanh.

## C. frontend (commit 4)
- [x] C1 Kiểu + service: `dictionary.types` (modStatus, masked, modSpans, modMessage), `adminModeration` service/types, `studyService` (recallBefore…), `deckService.fetchRecall`, `insight` low_recall.
- [x] C2 `DictComments` dải trạng thái + che từ + sửa gửi lại + 429; đánh giá bộ thẻ; lỗi tên hồ sơ.
- [x] C3 Trang `/admin/moderation` + mục menu + badge `openModeration`; công tắc nhạy cảm ở `DictEntryEditor`; badge nhãn ở Admin mẹo nhớ; khoá bình luận ở chi tiết người dùng.
- [x] C4 `StudyPage` dòng độ nhớ / phanh, `StudySummary`; chip độ nhớ ở `DeckDetailPage`; thẻ "Sắp quên" ở Insights.
- [x] C5 selfcheck `moderation.ts` (che từ, nhãn), `admin.ts`; `npm run check`.

## D. Hoàn tất (commit 5)
- [x] D1 smoke-admin: hàng chờ kiểm duyệt + công tắc nhạy cảm; `npm run e2e`.
- [x] D2 Docs: spec trạng thái "đã làm", `Plan/README`, `CHANGELOG`, `CODEBASE_MAP`, `USE_CASES_CHECKLIST`, `SECURITY` (khoá mềm), `LEARNING_PATH.md` (phanh HLR), README gốc (models, requirements-ml), quyết định D31–D32.
