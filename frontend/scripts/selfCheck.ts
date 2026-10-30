// Chạy: node scripts/selfCheck.ts (Node 22.6+ tự bỏ type). Không nằm trong src/ để không vào bundle.
import { extractErrorMessage } from "../src/services/apiClient.ts";
import { isDue, parseReviews } from "../src/lib/srs.ts";
import {
  calcDeckProgress,
  canEditDeck,
  deckShareUrl,
  deckSourceLabel,
  moveTargets,
  secondsLeft,
  sortDecksByLevel,
} from "../src/lib/deckUtils.ts";
import { categoryLabel, formatCompactCount, ratingSummary } from "../src/features/library/components/libraryOptions.ts";
import { parseAttemptState, parseQuestions } from "../src/services/studyService.ts";
import { parseImportText, unescapeDelimiter } from "../src/features/decks/editor/importParser.ts";
import { swapCardColumns } from "../src/features/decks/editor/editorCards.ts";
import { splitContent } from "../src/lib/cardContent.ts";
import { RATING_COMMENT_MAX, commentCharsLeft, formatRatingAverage, normalizeComment } from "../src/lib/ratingUtils.ts";
import {
  calcLearningStats,
  calcQuizAccuracy,
  calcStreaks,
  dayKey,
  lastReviewedAt,
} from "../src/lib/learningStats.ts";
import { flattenFolders } from "../src/features/folders/components/folderTree.ts";
import { getInitials, isValidDailyGoal, myReportOutcome, parseProfileTab, scoreTone } from "../src/features/profile/lib/profileUtils.ts";
import {
  behindCount,
  chapterPerDay,
  chapterProgress,
  dateForDay,
  dayIndexFor,
  endDate,
  formatDayRange,
  isPathEnded,
  isValidDays,
  parseDateOnly,
  parseRange,
  rangeCram,
  scheduledUpTo,
  sliceRange,
  tasksForDay,
  todayCardCount,
} from "../src/features/roadmap/roadmapUtils.ts";
import { atLeast, homeFor, isStaff, setupPending } from "../src/lib/roles.ts";
import { kataToHira, levenshtein, levenshteinRatio, moraSplit, normalizeKana, pronunciationScore } from "../src/lib/kana.ts";
import {
  contourToSvgPoints,
  estimateF0,
  hlToSvgPoints,
  medianOf,
  pitchScore,
  quantizeHL,
  referenceHL,
  smoothContour,
  toSemitones,
} from "../src/lib/pitch.ts";
import { ASR_MESSAGES, canRecognize, toAsrError } from "../src/lib/asr.ts";
import { flushPending, hasKana, kanaToKatakana, romajiToKanaFull, toKana } from "../src/lib/romaji.ts";
import {
  boundingBox,
  normalizeGlyph,
  referenceToSvgPaths,
  resampleStroke,
  strokeLength,
  strokesToSvgPath,
  summarizeStrokeScore,
} from "../src/lib/strokes.ts";
import { extractKanji, hasCjkIdeograph, isCjkIdeograph } from "../src/lib/textUtils.ts";
import {
  niceTicks,
  buildLinePath,
  periodDelta,
  indexAtX,
  summarizeJson,
  stringToHslColor,
  stringToTextColor,
} from "../src/features/admin/adminUtils.ts";
import {
  defaultDeckLevel,
  levelDistribution,
  levelDistributionSummary,
  ocrDegradedNotice,
  overallLevelLabel,
  roundToHundred,
} from "../src/features/extraction/extractionUtils.ts";
// Lộ trình 2.0 (ngày học / nợ / phiên học) — import riêng để không chạm khối import 1.0 ở trên.
import {
  ALL_WEEK,
  behindSeverity,
  clampReactionMs,
  completionPhrase,
  dayIndexForMask,
  deckCardMode,
  isStudyDay,
  isValidStudyDays,
  loadLabel,
  parseSessionKind,
  parseWeekdayMask,
  sessionCardToCard,
  sessionCountsLabel,
  sessionEmptyMessage,
  sessionUrl,
  studyDaysLabel,
  studyDaysPerWeek,
  suggestDaysLabel,
  weekdayMaskToggle,
} from "../src/features/roadmap/roadmapUtils.ts";
// Lộ trình 2.0 — phần B (trang lộ trình đang học / bản nháp / Tổng quan) — import riêng, không chạm khối trên.
import {
  CHAPTER_STATE_LABELS,
  DEFAULT_DAILY_CAP,
  barPct,
  canReEnrichPath,
  chapterStateOf,
  completionFallback,
  enrichCooldownLeft,
  forecastDayLabel,
  forecastScaleMax,
  forecastTick,
  formatCountdown,
  isPathBusy,
  isValidDailyCap,
  pathDayLabel,
  quizBestLabel,
  quizRetryLabel,
  DEFAULT_QUIZ_PASS_PCT,
  settingsPatch,
  todayCountsLabel,
  todayHeading,
  todaySessionSize,
  todaySummaryTotal,
} from "../src/features/roadmap/roadmapUtils.ts";

// Lộ trình 2.0 — sửa sau review (mục 24) — import riêng, không chạm các khối trên.
import { MAX_REACTION_MS, replanFromDay, sessionDoneHeading } from "../src/features/roadmap/roadmapUtils.ts";
// D4 nhắc làm lại bài kiểm tra chương (thông báo LEARNING_PATH_CHAPTER_RETRY) — import riêng, không chạm các khối trên.
import { describeNotification } from "../src/services/notificationService.ts";
// E5 chế độ chỉ nghe + F1 bản đồ Hán–Việt — import riêng, không chạm các khối trên.
import { cardSpeechItems, meaningSpeechItems, parseAudioMode, readingDiffers, shouldHideTerm } from "../src/lib/audioOnly.ts";
import {
  edgePath,
  firstHanVietReading,
  graphSummary,
  groupWordsByLevel,
  hanVietMapUrl,
  kanjiOfGraph,
  normalizeHanVietQuery,
  parseHanVietGraph,
  parseHanVietSuggestions,
  pillWidth,
  radialLayout,
  wordToCardDto,
} from "../src/lib/hanVietUtils.ts";

// Insights / bổ khuyết (F3, F4), chữ Hán & bộ thủ (C4, C5), cấu hình G5 — import riêng, không chạm các khối trên.
import {
  defaultRemedialDays,
  formatRatio,
  formatSeconds,
  groupLabel,
  isValidRemedialDays,
  nextStepCountLabel,
  parseFriction,
  parseNextSteps,
  parseWeaknesses,
  reasonCounts,
  safeInternalPath,
} from "../src/lib/insightUtils.ts";
import {
  easiestLevel,
  exampleLine,
  kanjiHeadline,
  kunLabel,
  mnemonicReasonLabel,
  mnemonicSourceLabel,
  onKunDeckCards,
  onKunDeckTitle,
  parseKanjiCards,
  parseRadicalCards,
  parseRadicalKanji,
  parseRadicalNo,
  parseRadicals,
  radicalCardTargets,
  radicalDeckCards,
  radicalDeckDescription,
  radicalLabel,
  radicalMatches,
  radicalStrokeOptions,
} from "../src/lib/kanjiUtils.ts";
import {
  SETTINGS_NUMBER_FIELDS,
  aiModelHint,
  buildSettingsPayload,
  hasAllExtras,
  isValidExtractionLimit,
  normalizeAdminSettings,
  parseSettingNumber,
  settingNumberError,
} from "../src/features/admin/settingsUtils.ts";
// Hợp đồng API đợt 2: mỗi lane có file kiểm tra riêng trong scripts/selfcheck/ để chạy song song không đụng file này.
import { runAdminChecks } from "./selfcheck/admin.ts";
import { runLearnerChecks } from "./selfcheck/learner.ts";
import { runPracticeChecks } from "./selfcheck/practice.ts";
import { runQuizChecks } from "./selfcheck/quiz.ts";
// Lỗi phát hiện khi kiểm tay trên trình duyệt (LC-*, LP-*, STAFF-*): file riêng, không chạm các khối trên.
import { runManualChecks } from "./selfcheck/manual.ts";
// Lộ trình 2.0 đợt cuối (LP-13 chống gửi trùng, LP-15 bộ thẻ thuộc lộ trình, thẻ lộ trình ở Tổng quan admin): async, file riêng.
import { runLearningPathChecks } from "./selfcheck/learningPath.ts";
// Thao tác trang học (spec 25/10): file riêng.
import { runStudyChecks } from "./selfcheck/study.ts";
import { runDictionaryChecks } from "./selfcheck/dictionary.ts";
import { runDeckShareChecks } from "./selfcheck/deckShare.ts";
import { runQa2710Checks } from "./selfcheck/qa2710.ts";
import { runDiagramChecks } from "./selfcheck/diagram.ts";
import { runDateFileChecks } from "./selfcheck/dateFile.ts";
import { runModerationChecks } from "./selfcheck/moderation.ts";
import { runLibraryChecks } from "./selfcheck/library.ts";

function assertStrictEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}. Expected "${expected}", but got "${actual}"`);
  }
}

async function runSelfCheck() {
  console.log("Running self-check on API response & error parser...");

  // 1. Plain-text error response from Spring Boot (e.g. AuthController.registerUser)
  const plainTextAxiosError = {
    isAxiosError: true,
    response: {
      status: 400,
      data: "Email đã được sử dụng!",
    },
  };
  const extracted1 = extractErrorMessage(plainTextAxiosError);
  assertStrictEqual(
    extracted1,
    "Email đã được sử dụng!",
    "Must extract plain string error message"
  );

  // 2. JSON error response
  const jsonAxiosError = {
    isAxiosError: true,
    response: {
      status: 401,
      data: {
        message: "Email hoặc mật khẩu không chính xác",
      },
    },
  };
  const extracted2 = extractErrorMessage(jsonAxiosError);
  assertStrictEqual(
    extracted2,
    "Email hoặc mật khẩu không chính xác",
    "Must extract nested message from JSON error response"
  );

  // 2b. JSON error body đọc dưới dạng text (responseType "text")
  const jsonTextAxiosError = {
    isAxiosError: true,
    response: {
      status: 400,
      data: '{"status":400,"error":"Bad Request","message":"Email đã được sử dụng!"}',
    },
  };
  assertStrictEqual(
    extractErrorMessage(jsonTextAxiosError),
    "Email đã được sử dụng!",
    "Must parse JSON error body received as text"
  );

  // 3. Fallback generic error
  const genericError = new Error("Lỗi kết nối mạng");
  const extracted3 = extractErrorMessage(genericError);
  assertStrictEqual(extracted3, "Lỗi kết nối mạng", "Must extract Error message");

  // 4. Đến hạn ôn (lịch do SrsService.java tính, xem SrsServiceTest)
  const now = new Date("2025-01-01T00:00:00.000Z");
  const due = { cardId: "a", reps: 1, intervalDays: 1, ease: 2.5, dueAt: "2024-12-31T00:00:00.000Z" };
  const later = { ...due, cardId: "b", dueAt: "2025-01-02T00:00:00.000Z" };
  assertStrictEqual(isDue(undefined, now), true, "Thẻ chưa ôn lần nào coi như đến hạn");
  assertStrictEqual(isDue(due, now), true, "dueAt quá khứ = đến hạn");
  assertStrictEqual(isDue(later, now), false, "dueAt tương lai = chưa đến hạn");

  // 5. Response API là dữ liệu không đáng tin -> lọc bản ghi hỏng
  const parsed = parseReviews([
    due,
    { cardId: "hong", reps: "x", intervalDays: 1, ease: 2.5, dueAt: "không-phải-ngày" },
  ]);
  assertStrictEqual(Object.keys(parsed).join(","), "a", "Chỉ giữ bản ghi review hợp lệ");
  assertStrictEqual(Object.keys(parseReviews({ oops: 1 })).length, 0, "Body sai kiểu -> map rỗng");

  // 6. Đồng hồ quiz: tính theo mốc hết giờ nên tab bị treo không làm lệch
  const deadline = 1_000_000;
  assertStrictEqual(secondsLeft(deadline, deadline - 30_000), 30, "Còn đúng 30 giây");
  assertStrictEqual(secondsLeft(deadline, deadline - 1), 1, "Làm tròn lên, chưa về 0 là còn giờ");
  assertStrictEqual(secondsLeft(deadline, deadline + 60_000), 0, "Quá hạn không âm");

  // 7. Đề quiz từ server cũng là dữ liệu không đáng tin
  const questions = parseQuestions([
    { cardId: "c1", term: "水", reading: "みず", options: ["nước", "lửa"] },
    { cardId: "c2", term: "火", options: ["chỉ một lựa chọn"] },
    { cardId: "c3", term: "木", options: "không phải mảng" },
  ]);
  assertStrictEqual(questions.length, 1, "Chỉ giữ câu hỏi đủ lựa chọn");
  assertStrictEqual(questions[0].cardId, "c1", "Giữ đúng câu hợp lệ");
  const attemptState = parseAttemptState({
    attemptId: "a-1",
    deckId: "d",
    mode: "practice",
    timeLimitSeconds: 0,
    serverNow: "2026-10-02T00:00:00Z",
    questions: [
      { cardId: "c1", term: "水", reading: null, options: ["nước", "lửa"], chosen: "lửa", feedback: { correct: false, correctAnswer: "nước", explanation: "ví dụ" } },
      { cardId: "c2", term: "火", options: ["chỉ một lựa chọn"] },
    ],
  });
  assertStrictEqual(attemptState?.attemptId, "a-1", "Giữ attemptId của lượt làm");
  assertStrictEqual(attemptState?.questions.length, 1, "Chỉ giữ câu hỏi đủ lựa chọn");
  assertStrictEqual(attemptState?.questions[0].feedback?.correctAnswer, "nước", "Giữ phản hồi từng câu");
  assertStrictEqual(attemptState?.questions[0].chosen, "lửa", "Giữ đáp án đã chọn để khôi phục");
  assertStrictEqual(parseAttemptState(null), null, "Response hỏng -> không dựng được lượt làm");
  assertStrictEqual(parseAttemptState([]), null, "Response kiểu cũ (mảng) -> không dựng được lượt làm");
  assertStrictEqual(parseAttemptState({ questions: [] })?.mode, "exam", "Thiếu mode -> exam (chế độ chặt hơn)");

  // 7b. Nhập thẻ từ văn bản dán vào
  const blankLineSep = unescapeDelimiter("\\n\\n");
  assertStrictEqual(blankLineSep, "\n\n", "\\n gõ trong ô tuỳ chỉnh = xuống dòng thật");
  const imported = parseImportText("犬\tいぬ\tcon chó\r\n\r\n猫\tmèo\r\n\r\n鳥", "\t", blankLineSep);
  assertStrictEqual(imported.length, 3, "Tách thẻ theo dòng trống, kể cả xuống dòng kiểu Windows");
  assertStrictEqual(imported[0].reading, "いぬ", "3 cột = thuật ngữ, cách đọc, nghĩa");
  assertStrictEqual(imported[1].meaning, "mèo", "2 cột = thuật ngữ, nghĩa");
  assertStrictEqual(imported[2].meaning, "", "1 cột: giữ lại, nghĩa trống để bổ sung");
  const multi = parseImportText("犬\tいぬ\tcon chó\tChó nhà\t犬が好きです。", "\t", "\n\n");
  assertStrictEqual(multi[0].meaning, "con chó\nChó nhà\n犬が好きです。", "Cột 3+ gộp thành nội dung nhiều dòng");
  const parts = splitContent("\n  định nghĩa 1  \r\n\nví dụ A\nghi chú\n");
  assertStrictEqual(parts.head, "định nghĩa 1", "Dòng không rỗng đầu tiên là định nghĩa chính");
  assertStrictEqual(parts.rest, "ví dụ A\nghi chú", "Phần còn lại giữ xuống dòng, bỏ dòng trống đầu/cuối");
  assertStrictEqual(splitContent("   ").head, "", "Nội dung rỗng không lỗi");
  const swapped = swapCardColumns({ _key: "k", term: "水", reading: "みず", meaning: "nước\nVí dụ: 水を飲む" });
  assertStrictEqual(swapped.term, "nước", "Đảo cột: dòng đầu của nội dung thành thuật ngữ");
  assertStrictEqual(swapped.meaning, "水\nみず\nVí dụ: 水を飲む", "Đảo cột: không mất chữ nào");
  assertStrictEqual(parseImportText("a\tb", "\t", "").length, 0, "Dấu phân cách rỗng không làm treo/lỗi");

  // 8. Sắp xếp lộ trình học tập theo thứ bậc JLPT N5 -> N1
  const unsortedDecks = [
    { id: "d2", title: "N2 Grammar", level: "N2", description: null, cards: [] },
    { id: "d5", title: "N5 Core", level: "N5", description: null, cards: [] },
    { id: "d4", title: "N4 Society", level: "N4", description: null, cards: [] },
  ];
  const sorted = sortDecksByLevel(unsortedDecks);
  assertStrictEqual(sorted.map((d) => d.level).join(","), "N5,N4,N2", "Phải xếp N5 -> N4 -> N2");

  // 9. Tính tiến độ bộ thẻ và thẻ đến hạn ôn
  const mockCards = [
    { id: "c1", term: "水", reading: "みず", meaning: "nước" },
    { id: "c2", term: "火", reading: "ひ", meaning: "lửa" },
  ];
  const mockReviews = {
    c1: { cardId: "c1", reps: 5, intervalDays: 30, ease: 2.5, dueAt: "2024-12-01T00:00:00.000Z" }, // mastered, due
    c2: { cardId: "c2", reps: 1, intervalDays: 1, ease: 2.5, dueAt: "2025-02-01T00:00:00.000Z" }, // not mastered, not due
  };
  const progress = calcDeckProgress(mockCards, mockReviews, now);
  assertStrictEqual(progress.total, 2, "Tổng 2 thẻ");
  assertStrictEqual(progress.mastered, 1, "1 thẻ thành thạo (interval >= 21)");
  assertStrictEqual(progress.due, 1, "1 thẻ đến hạn");
  assertStrictEqual(progress.pct, 50, "50% thành thạo");

  // 10. Đích di chuyển thư mục: không được chứa chính nó lẫn con cháu (backend chặn ở checkMove,
  //     đây là lớp chặn ở UI để select không hiện lựa chọn chắc chắn lỗi).
  const tree = [
    { id: "a", title: "A", children: [{ id: "b", title: "B", children: [{ id: "c", title: "C" }] }] },
    { id: "x", title: "X" },
  ];
  assertStrictEqual(
    moveTargets(tree, null).map((t) => `${t.id}@${t.depth}`).join(","),
    "a@0,b@1,c@2,x@0",
    "Không loại trừ ai thì làm phẳng cả cây kèm độ sâu"
  );
  assertStrictEqual(
    moveTargets(tree, "a").map((t) => t.id).join(","),
    "x",
    "Loại A phải loại luôn con cháu B, C"
  );
  assertStrictEqual(
    moveTargets(tree, "b").map((t) => t.id).join(","),
    "a,x",
    "Loại B thì C biến mất, A vẫn là đích hợp lệ"
  );

  // 11. Thư viện: dữ liệu nằm ở DB (backend LibraryDeckIT so với dữ liệu cũ); ở đây kiểm helper hiển thị.
  assertStrictEqual(formatCompactCount(18500), "18.5k", "18500 -> 18.5k như dữ liệu cũ");
  assertStrictEqual(formatCompactCount(35000), "35k", "Bỏ .0 thừa");
  assertStrictEqual(formatCompactCount(950), "950", "Dưới 1000 giữ nguyên");
  assertStrictEqual(formatCompactCount(1_250_000), "1.3M", "Triệu");
  assertStrictEqual(formatCompactCount(999_960), "1M", "Làm tròn lên triệu, không ra 1000k");
  assertStrictEqual(`${ratingSummary(4, 1)}|${ratingSummary(4.5, 1200)}|${ratingSummary(null, 0)}|${ratingSummary(4, 0)}`, "4 · 1 đánh giá|4.5 · 1.2k đánh giá|Chưa có đánh giá|Chưa có đánh giá", "NEW-02: nhãn đánh giá ghi rõ số lượt đánh giá (không lẫn với lượt tải); chưa có thì nói chưa có");
  assertStrictEqual(categoryLabel("kanji"), "🈯 Kanji Hán tự", "Mã chủ đề -> nhãn");
  assertStrictEqual(categoryLabel(null), null, "Không có chủ đề -> null");
  assertStrictEqual(deckSourceLabel({ access: "owner", visibility: "public" }), "Cá nhân", "Chủ bộ thẻ");
  assertStrictEqual(deckSourceLabel({ access: "viewer", visibility: "public" }), "Thư viện", "Bộ public của người khác");
  assertStrictEqual(deckSourceLabel({ access: "editor", visibility: "private" }), "Được chia sẻ", "Được chia sẻ quyền sửa");
  assertStrictEqual(canEditDeck({ access: "viewer" }), false, "Người xem không sửa được");
  assertStrictEqual(canEditDeck({ access: "editor" }), true, "Người được chia sẻ quyền sửa");

  // D2: liên kết chia sẻ bộ thẻ trỏ thẳng trang chi tiết
  assertStrictEqual(
    deckShareUrl("https://nihongen.app", "a1b2"),
    "https://nihongen.app/decks/a1b2",
    "Liên kết chia sẻ = origin + /decks/:id"
  );
  assertStrictEqual(
    deckShareUrl("http://localhost:5173/", "x y/z"),
    "http://localhost:5173/decks/x%20y%2Fz",
    "Bỏ '/' thừa cuối origin, mã hoá id trong URL"
  );

  // 12. Chỉ số học tập tính từ dữ liệu thật (lib/learningStats.ts)
  const d = (y: number, m: number, day: number, h = 12) => new Date(y, m - 1, day, h);
  const todayDate = d(2025, 3, 10);
  const days = (...list: Date[]) => new Set(list.map(dayKey));

  let st = calcStreaks(days(d(2025, 3, 8), d(2025, 3, 9), d(2025, 3, 10)), todayDate);
  assertStrictEqual(st.current, 3, "Học 3 ngày liền tới hôm nay -> streak 3");
  st = calcStreaks(days(d(2025, 3, 8), d(2025, 3, 9)), todayDate);
  assertStrictEqual(st.current, 2, "Hôm nay chưa học nhưng hôm qua có -> chuỗi chưa đứt");
  st = calcStreaks(days(d(2025, 3, 7), d(2025, 3, 8)), todayDate);
  assertStrictEqual(st.current, 0, "Nghỉ hôm qua -> streak về 0");
  st = calcStreaks(days(d(2025, 2, 27), d(2025, 2, 28), d(2025, 3, 1), d(2025, 3, 2), d(2025, 3, 10)), todayDate);
  assertStrictEqual(st.max, 4, "Kỷ lục nối qua ranh giới tháng 28/2 -> 1/3");
  assertStrictEqual(st.current, 1, "Chỉ hôm nay -> streak 1");
  assertStrictEqual(calcStreaks(new Set(), todayDate).max, 0, "Chưa học gì -> kỷ lục 0");

  assertStrictEqual(calcQuizAccuracy([]), null, "Chưa thi -> null, không phải 0%");
  const qr = (score: number, total: number) => ({ deckId: "x", score, total, createdAt: todayDate.toISOString() });
  // (5 + 10) / (5 + 20) = 60% -> gộp theo tổng câu, không lấy trung bình 100% và 50%.
  assertStrictEqual(calcQuizAccuracy([qr(5, 5), { ...qr(0, 10), mode: "practice" }]), 100, "Luyện tập không tính vào độ chính xác bài thi");
  assertStrictEqual(calcQuizAccuracy([qr(5, 5), qr(10, 20)]), 60, "Độ chính xác gộp theo tổng số câu");
  assertStrictEqual(calcQuizAccuracy([qr(2, 3)]), 66.7, "Làm tròn 1 chữ số thập phân");

  const reviewedAt = d(2025, 3, 9, 9);
  const good = { cardId: "c1", reps: 2, intervalDays: 3, ease: 2.5, dueAt: new Date(reviewedAt.getTime() + 3 * 86400000).toISOString() };
  assertStrictEqual(lastReviewedAt(good).getTime(), reviewedAt.getTime(), "Suy ngược lúc chấm = dueAt - intervalDays");
  const again = { cardId: "c2", reps: 0, intervalDays: 0, ease: 2.3, dueAt: new Date(todayDate.getTime() + 10 * 60000).toISOString() };
  assertStrictEqual(lastReviewedAt(again).getTime(), todayDate.getTime(), "\"again\" hẹn lại sau 10 phút");

  const statsDeck = {
    id: "d1",
    title: "T",
    level: "N5",
    description: null,
    cards: ["c1", "c2", "c3"].map((id) => ({ id, term: id, reading: null, meaning: id })),
  };
  const stats = calcLearningStats([statsDeck], { c1: good, c2: again }, [qr(3, 4)], todayDate);
  assertStrictEqual(stats.wordsLearned, 2, "2 thẻ đã chấm");
  assertStrictEqual(stats.srsDueCount, 1, "c3 chưa học nên đến hạn; c1, c2 chưa tới hạn");
  assertStrictEqual(stats.reviewedToday, 1, "Chỉ c2 chấm hôm nay");
  assertStrictEqual(stats.currentStreak, 2, "Ôn hôm qua + hôm nay -> streak 2");
  assertStrictEqual(stats.quizAccuracy, 75, "3/4 = 75%");
  assertStrictEqual(stats.lastQuizPct, 75, "Bài gần nhất 75%");

  // 13. Trang cá nhân (features/profile/lib/profileUtils.ts)
  assertStrictEqual(getInitials("Lê Văn Chính"), "LC", "Chữ đầu của từ đầu + từ cuối, giữ dấu");
  assertStrictEqual(getInitials("  chinh  "), "CH", "Một từ -> 2 ký tự đầu");
  assertStrictEqual(getInitials("   "), "?", "Tên rỗng -> ?");
  assertStrictEqual(scoreTone(4, 5), "good", "80% đúng ngưỡng -> tốt");
  assertStrictEqual(scoreTone(79, 100), "fair", "79% -> trung bình");
  assertStrictEqual(scoreTone(1, 2), "fair", "50% đúng ngưỡng -> trung bình");
  assertStrictEqual(scoreTone(49, 100), "poor", "49% -> yếu");
  assertStrictEqual(scoreTone(0, 0), "none", "Bài 0 câu -> trung tính");
  assertStrictEqual(parseProfileTab("history"), "history", "Tab hợp lệ từ URL");
  assertStrictEqual(parseProfileTab("hack"), "info", "Tab lạ -> mặc định info");
  assertStrictEqual(isValidDailyGoal(500), true, "500 là giới hạn trên");
  assertStrictEqual(isValidDailyGoal(0) || isValidDailyGoal(2.5) || isValidDailyGoal(501), false, "Ngoài 1–500 hoặc lẻ -> sai");

  // Cây thư mục -> danh sách phẳng: độ sâu để thụt lề, đường dẫn "Cha / Con" cho ô chọn
  const flat = flattenFolders([
    { id: "a", title: "Cha", children: [{ id: "b", title: "Con", children: [] }] },
    { id: "c", title: "Khác", children: [] },
  ] as never);
  assertStrictEqual(flat.map((f) => f.id).join(","), "a,b,c", "Duyệt sâu, giữ thứ tự");
  assertStrictEqual(flat[1].depth, 1, "Thư mục con có depth 1");
  assertStrictEqual(flat[1].path, "Cha / Con", "path nối tên cha và con");
  assertStrictEqual(flat[2].path, "Khác", "Thư mục gốc: path = tên");

  // Đánh giá bộ thẻ: trung bình 1 chữ số, bình luận tối đa 500, trống = null
  assertStrictEqual(formatRatingAverage(4.5), "4.5", "Trung bình hiển thị 1 chữ số");
  assertStrictEqual(formatRatingAverage(4), "4.0", "Số nguyên vẫn có .0");
  assertStrictEqual(formatRatingAverage(null), "—", "Chưa có lượt nào");
  assertStrictEqual(normalizeComment("  hay  "), "hay", "Cắt khoảng trắng");
  assertStrictEqual(normalizeComment("   "), null, "Toàn khoảng trắng = không có bình luận");
  assertStrictEqual(commentCharsLeft("a".repeat(RATING_COMMENT_MAX)), 0, "Đủ 500 ký tự còn 0");
  assertStrictEqual(commentCharsLeft("a".repeat(RATING_COMMENT_MAX + 1)), -1, "Vượt 500 ký tự là âm");

  // 14. Lộ trình học tập (features/roadmap/roadmapUtils.ts)
  assertStrictEqual(dayIndexFor("2026-10-14", d(2026, 10, 14), 30), 1, "Ngày bắt đầu = ngày 1");
  assertStrictEqual(dayIndexFor("2026-10-14", d(2026, 10, 16, 23), 30), 3, "Bỏ giờ, ngày thứ 3");
  assertStrictEqual(dayIndexFor("2026-10-14", d(2026, 10, 13), 30), 1, "Trước ngày bắt đầu kẹp về 1");
  assertStrictEqual(dayIndexFor("2026-10-14", d(2026, 12, 25), 30), 30, "Sau khi kết thúc kẹp về totalDays");
  assertStrictEqual(dayIndexFor(null, d(2026, 10, 14), 30), 1, "Chưa có ngày bắt đầu -> 1");
  assertStrictEqual(endDate("2026-10-14", 30), "2026-11-12", "Kết thúc sau 30 ngày");
  assertStrictEqual(endDate("2026-10-14", 1), "2026-10-14", "1 ngày: kết thúc cùng ngày");
  assertStrictEqual(endDate("2026-12-31", 2), "2027-01-01", "Qua năm");
  assertStrictEqual(dateForDay("2026-10-14", 3), "2026-10-16", "Ngày thứ 3");
  assertStrictEqual(isPathEnded("2026-10-14", 30, d(2026, 11, 12)), false, "Ngày cuối vẫn chưa kết thúc");
  assertStrictEqual(isPathEnded("2026-10-14", 30, d(2026, 11, 13)), true, "Sau ngày cuối là kết thúc");
  assertStrictEqual(parseDateOnly("2026-10-14").getHours(), 0, "Parse theo giờ địa phương, không lệch UTC");
  assertStrictEqual(formatDayRange(1, 3), "Ngày 1–3", "Dải ngày");
  assertStrictEqual(formatDayRange(4, 4), "Ngày 4", "Một ngày");

  const rmA = { id: "c1", deckId: "d1", cardCount: 10, dayFrom: 1, dayTo: 3, perDay: 4 };
  const rmB = { id: "c2", deckId: "d2", cardCount: 5, dayFrom: 4, dayTo: 5, perDay: 3 };
  const rmC = { id: "c3", deckId: null, cardCount: 9, dayFrom: 1, dayTo: 9, perDay: 1 };
  const rmTasks = (day: number, chs = [rmA, rmB, rmC]) =>
    tasksForDay(chs, day).map((t) => `${t.chapterId}:${t.fromPos}-${t.toPos}`).join(",");
  assertStrictEqual(rmTasks(1), "c1:1-4", "Ngày 1");
  assertStrictEqual(rmTasks(3), "c1:9-10", "Ngày cuối lấy hết phần dư");
  assertStrictEqual(rmTasks(4), "c2:1-3", "Chương kế tiếp, bỏ chương không có bộ thẻ");
  assertStrictEqual(rmTasks(5), "c2:4-5", "Ngày cuối chương B");
  assertStrictEqual(rmTasks(6), "", "Ngoài mọi chương");
  assertStrictEqual(rmTasks(3, [{ ...rmA, cardCount: 4, perDay: 2 }]), "", "from > cardCount thì bỏ");
  assertStrictEqual(chapterPerDay({ ...rmA, perDay: 0 }), 4, "perDay 0 -> ceil(10/3)");
  assertStrictEqual(scheduledUpTo(rmA, 0), 0, "Trước chương");
  assertStrictEqual(scheduledUpTo(rmA, 2), 8, "Hết ngày 2");
  assertStrictEqual(scheduledUpTo(rmA, 3), 10, "Hết chương");
  assertStrictEqual(scheduledUpTo(rmA, 9), 10, "Sau chương");
  assertStrictEqual(todayCardCount([{ fromPos: 1, toPos: 4 }, { fromPos: 1, toPos: 3 }]), 7, "Cộng số thẻ");
  assertStrictEqual(todayCardCount([]), 0, "Không có việc");
  const rmRange = (raw: string | null) => {
    const r = parseRange(raw);
    return r ? `${r.from}-${r.to}` : null;
  };
  assertStrictEqual(rmRange("3-10"), "3-10", "Dải hợp lệ");
  assertStrictEqual(rmRange("5-5"), "5-5", "Một thẻ");
  assertStrictEqual(rmRange(" 2-4 "), "2-4", "Cắt khoảng trắng");
  assertStrictEqual(rmRange("0-5") ?? rmRange("7-3") ?? rmRange("abc") ?? rmRange(null) ?? rmRange("3-"), null, "Dải sai -> null");
  const rmCards = ["c1", "c2", "c3", "c4", "c5"];
  assertStrictEqual(sliceRange(rmCards, { from: 2, to: 4 }).join(","), "c2,c3,c4", "Cắt giữa");
  assertStrictEqual(sliceRange(rmCards, { from: 4, to: 9 }).join(","), "c4,c5", "to vượt quá");
  assertStrictEqual(sliceRange(rmCards, { from: 7, to: 9 }).join(","), "", "from vượt quá");
  const rcNow = d(2026, 10, 14, 12);
  const rcReview = (dueAt: string) => ({ cardId: "c", reps: 2, intervalDays: 3, ease: 2.5, dueAt });
  assertStrictEqual(rangeCram(undefined, rcNow), false, "Học dải: thẻ mới -> xếp lịch bình thường");
  assertStrictEqual(rangeCram(rcReview("2026-10-13T00:00:00Z"), rcNow), false, "Học dải: thẻ đến hạn -> xếp lịch");
  assertStrictEqual(rangeCram(rcReview("2026-10-20T00:00:00Z"), rcNow), true, "Học dải: thẻ chưa đến hạn -> chỉ ghi log");

  const rmCard = (id: string) => ({ id }) as never;
  const rmDecks = [{ id: "d1", cards: [rmCard("c1"), rmCard("c2"), rmCard("c3"), rmCard("c4")] }] as never;
  const rmReviews = { c1: { cardId: "c1", reps: 5, intervalDays: 30, ease: 2.5, dueAt: "2026-12-01T00:00:00Z" } };
  const rmNow = d(2026, 10, 14);
  assertStrictEqual(chapterProgress({ deckId: "gone" }, rmDecks, rmReviews, rmNow), null, "Bộ thẻ không còn");
  assertStrictEqual(chapterProgress({ deckId: null }, rmDecks, rmReviews, rmNow), null, "Chương không có bộ thẻ");
  const rmBehind = [{ ...rmA, deckId: "d1", cardCount: 4, dayFrom: 1, dayTo: 2, perDay: 2 }];
  assertStrictEqual(behindCount(rmBehind, 2, rmDecks, { c1: rmReviews.c1 }), 1, "Hết ngày 1 có c1,c2; c2 chưa ôn");
  assertStrictEqual(behindCount(rmBehind, 1, rmDecks, { c1: rmReviews.c1 }), 0, "Ngày 1 chưa có gì trễ");
  assertStrictEqual(behindCount(rmBehind, 5, rmDecks, { c1: rmReviews.c1 }), 3, "Sau chương: 3 thẻ chưa ôn");
  assertStrictEqual(isValidDays(1) && isValidDays(365), true, "1 và 365 hợp lệ");
  assertStrictEqual(isValidDays(0) || isValidDays(366) || isValidDays(2.5) || isValidDays(NaN), false, "Ngoài 1–365 hoặc lẻ");

  // Admin Panel: vai trò (FE-01) và chiều cột biểu đồ CSS (FE-02)
  assertStrictEqual(atLeast("SUPER_ADMIN", "ADMIN"), true, "SUPER_ADMIN >= ADMIN");
  assertStrictEqual(atLeast("ADMIN", "SUPER_ADMIN"), false, "ADMIN < SUPER_ADMIN");
  assertStrictEqual(atLeast("SUPER_ADMIN", "SUPER_ADMIN"), true, "SUPER_ADMIN >= SUPER_ADMIN");
  assertStrictEqual(isStaff("USER") || isStaff(undefined) || isStaff("VIEWER"), false, "USER / chưa tải / vai trò đã bỏ không là staff");
  assertStrictEqual(atLeast(undefined, "ADMIN"), false, "role chưa tải -> không có quyền");
  assertStrictEqual(setupPending({ role: "ADMIN", mustChangePassword: true }), true, "staff còn phải đổi mật khẩu");
  assertStrictEqual(setupPending({ role: "SUPER_ADMIN", mustChangePassword: false }), false, "staff đã đổi");
  assertStrictEqual(setupPending({ role: "USER", mustChangePassword: true }) || setupPending(null) || setupPending({ email: "x" } as never), false, "người học / chưa tải không bị đưa về /setup");
  assertStrictEqual(homeFor("ADMIN") + homeFor("USER") + homeFor(null), "/admin//", "Trang chủ theo vai trò");

  // Admin Panel: các hàm thuần biểu đồ SVG mới (FE-03)
  assertStrictEqual(niceTicks(0).join(","), "0", "niceTicks max=0");
  assertStrictEqual(niceTicks(7).join(","), "0,4,8", "niceTicks max=7 -> [0, 4, 8]");
  assertStrictEqual(niceTicks(950).join(","), "0,500,1000", "niceTicks max=950 -> [0, 500, 1000]");

  assertStrictEqual(buildLinePath([5], 100, 50, 10), "M 0.0 25.0", "buildLinePath 1 điểm không NaN");
  assertStrictEqual(buildLinePath([0, 0, 0], 100, 50, 0), "M 0.0 50.0 L 50.0 50.0 L 100.0 50.0", "buildLinePath toàn 0");
  assertStrictEqual(buildLinePath([0, 10], 100, 50, 10), "M 0.0 50.0 L 100.0 0.0", "buildLinePath 2 điểm");

  const s13 = Array.from({ length: 13 }, (_, i) => ({ users: i + 1 }));
  assertStrictEqual(periodDelta(s13, "users"), null, "periodDelta < 14 điểm trả về null");

  const s14Zero = Array.from({ length: 14 }, (_, i) => ({ users: i < 7 ? 0 : 5 }));
  const dZero = periodDelta(s14Zero, "users");
  assertStrictEqual(dZero?.last7, 35, "last7 tổng 35");
  assertStrictEqual(dZero?.prev7, 0, "prev7 tổng 0");
  assertStrictEqual(dZero?.pct, null, "prev7=0 thì pct=null không chia 0");

  const s14Delta = Array.from({ length: 14 }, (_, i) => ({ users: i < 7 ? 10 : 15 }));
  const dNormal = periodDelta(s14Delta, "users");
  assertStrictEqual(dNormal?.last7, 105, "last7 105");
  assertStrictEqual(dNormal?.prev7, 70, "prev7 70");
  assertStrictEqual(dNormal?.pct, 50, "tăng 50%");

  assertStrictEqual(indexAtX(0, 100, 5), 0, "indexAtX tại 0");
  assertStrictEqual(indexAtX(100, 100, 5), 4, "indexAtX tại w");
  assertStrictEqual(indexAtX(50, 100, 5), 2, "indexAtX ở giữa");
  assertStrictEqual(indexAtX(-10, 100, 5), 0, "indexAtX kẹp cận dưới");
  assertStrictEqual(indexAtX(200, 100, 5), 4, "indexAtX kẹp cận trên");
  assertStrictEqual(indexAtX(50, 100, 1), 0, "indexAtX n=1");

  // Admin Panel: hàm summarizeJson (FE-04)
  assertStrictEqual(summarizeJson(null), "—", "summarizeJson null trả về gạch ngang");
  assertStrictEqual(summarizeJson(undefined), "—", "summarizeJson undefined trả về gạch ngang");
  assertStrictEqual(summarizeJson({ reason: "Spam" }), 'reason: "Spam"', "summarizeJson 1 key");
  assertStrictEqual(summarizeJson([1, 2, 3]), "[3 mục]", "summarizeJson array");
  // Admin Panel: hàm sinh màu avatar (FE-05)
  assertStrictEqual(stringToHslColor("").startsWith("hsl("), true, "stringToHslColor rỗng");
  assertStrictEqual(stringToHslColor("test@example.com") === stringToHslColor("test@example.com"), true, "stringToHslColor deterministic");
  assertStrictEqual(stringToTextColor("test@example.com").startsWith("hsl("), true, "stringToTextColor");

  // 15. Luyện phát âm (lib/kana.ts): chuẩn hoá kana, so khớp, tách mora
  assertStrictEqual(kataToHira("ガッコウ"), "がっこう", "Katakana -> hiragana");
  assertStrictEqual(normalizeKana("コーヒー"), "こおひい", "ー thành nguyên âm trước đó");
  assertStrictEqual(normalizeKana("きょう、 がっこう。"), "きょおがっこお", "Bỏ dấu câu, khoảng trắng; おう / ょう gập thành trường âm お");
  assertStrictEqual(normalizeKana("ｶﾞｯｺｳ"), "がっこお", "Half-width katakana (NFKC) -> hiragana (こう gập thành こお)");
  assertStrictEqual(normalizeKana("ABC　１２"), "abc12", "Full-width latin / số -> ASCII thường");
  assertStrictEqual(levenshtein("がっこう", "がこう"), 1, "Thiếu っ = 1 phép sửa");
  assertStrictEqual(levenshtein("", "abc"), 3, "Chuỗi rỗng");
  assertStrictEqual(levenshteinRatio("abc", "abc"), 1, "Trùng = 1");
  assertStrictEqual(levenshteinRatio("", ""), 1, "Hai chuỗi rỗng coi như trùng");
  assertStrictEqual(levenshteinRatio("がっこう", "がこう"), 0.75, "1 lỗi / 4 ký tự");
  assertStrictEqual(moraSplit("がっこう").length, 4, "がっこう = 4 mora (っ là mora riêng)");
  assertStrictEqual(moraSplit("きょう").join("|"), "きょ|う", "Kana nhỏ gắn vào mora trước");
  assertStrictEqual(moraSplit("コーヒー").join("|"), "こ|ー|ひ|ー", "ー là mora riêng; katakana về hiragana");
  assertStrictEqual(moraSplit("しんぶん").length, 4, "ん là mora riêng");
  assertStrictEqual(moraSplit("").length, 0, "Rỗng -> 0 mora");
  const ps = pronunciationScore("がっこう", ["学校", "がこう"]);
  assertStrictEqual(ps.pct >= 75, true, `Điểm phát âm >= 75 (được ${ps.pct})`);
  assertStrictEqual(ps.best, "がこう", "Chọn phương án giống nhất");
  assertStrictEqual(pronunciationScore("がっこう", ["ガッコウ"]).pct, 100, "Katakana vẫn 100%");
  assertStrictEqual(pronunciationScore("がっこう", []).pct, 0, "Không có phương án -> 0");
  // Hai cách viết của cùng một trường âm (chính tả おう/えい và ー) phải chuẩn hoá giống nhau
  assertStrictEqual(normalizeKana("せんせい"), normalizeKana("せんせー"), "えい và えー về cùng một dạng");
  assertStrictEqual(normalizeKana("きょう"), normalizeKana("きょー"), "ょう và ょー về cùng một dạng");
  assertStrictEqual(pronunciationScore("せんせい", ["せんせー"]).pct, 100, "せんせい vs せんせー: phát âm y hệt -> 100");
  assertStrictEqual(pronunciationScore("がっこう", ["がっこー"]).pct, 100, "がっこう vs がっこー: phát âm y hệt -> 100");
  assertStrictEqual(canRecognize, false, "Ngoài trình duyệt: không có SpeechRecognition, import không lỗi");
  assertStrictEqual(toAsrError("not-allowed").message, ASR_MESSAGES["not-allowed"], "Mã lỗi trình duyệt -> thông báo tiếng Việt");
  assertStrictEqual(toAsrError("service-not-allowed").code, "not-allowed", "service-not-allowed gộp vào not-allowed");
  assertStrictEqual(toAsrError("gì-đó-lạ").code, "unknown", "Mã lạ -> unknown");

  // 16. Luyện trọng âm (lib/pitch.ts): F0, lượng tử H/L, mẫu chuẩn, chấm điểm
  const sr = 48000;
  const sine = (hz: number, n = 2048, amp = 0.5) =>
    Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / sr));
  const f220 = estimateF0(sine(220), sr);
  assertStrictEqual(f220 !== null && Math.abs(f220 - 220) <= 3, true, `Sine 220 Hz -> F0 trong ±3 Hz (được ${f220})`);
  const f150 = estimateF0(sine(150), sr, { minHz: 70, maxHz: 500 });
  assertStrictEqual(f150 !== null && Math.abs(f150 - 150) <= 3, true, `Sine 150 Hz -> F0 trong ±3 Hz (được ${f150})`);
  assertStrictEqual(estimateF0(new Float32Array(2048), sr), null, "Im lặng -> null");
  assertStrictEqual(estimateF0(sine(220, 2048, 0.001), sr), null, "Quá nhỏ (dưới cổng RMS) -> null");
  // Ù điện 50/60 Hz nằm dưới minHz nhưng tương quan vẫn cao ở lag nhỏ nhất: không được báo thành 500 Hz
  const hum50 = estimateF0(sine(50, 2048, 0.03), sr);
  assertStrictEqual(hum50, null, `Ù 50 Hz (ngoài dải, trên cổng RMS) -> null (được ${hum50})`);
  assertStrictEqual(estimateF0(sine(60, 2048, 0.03), sr), null, "Ù 60 Hz -> null");
  const f500 = estimateF0(sine(500), sr);
  assertStrictEqual(f500 !== null && Math.abs(f500 - 500) <= 3, true, `Sine 500 Hz đúng biên dải vẫn nhận (được ${f500})`);
  assertStrictEqual(Math.round(toSemitones(440, 220)), 12, "Gấp đôi tần số = 12 nửa cung");
  assertStrictEqual(medianOf([3, 1, 2]), 2, "Trung vị lẻ");
  assertStrictEqual(medianOf([4, 1, 3, 2]), 2.5, "Trung vị chẵn");
  assertStrictEqual(medianOf([]), null, "Trung vị rỗng -> null");
  const spiky = [100, 100, 400, 100, 100].map((f0, i) => ({ t: i * 0.02, f0 }));
  assertStrictEqual(smoothContour(spiky, 3).map((p) => p.f0).join(","), "100,100,100,100,100", "Lọc trung vị bỏ nhảy quãng tám");
  const lonely = [{ t: 0, f0: null }, { t: 0.02, f0: 120 }, { t: 0.04, f0: null }];
  assertStrictEqual(smoothContour(lonely, 3)[1].f0, null, "Điểm có thanh đứng một mình coi là nhiễu");
  // Nửa đầu 100 Hz, nửa sau 150 Hz, 2 mora -> L H
  const lowHigh = Array.from({ length: 40 }, (_, i) => ({ t: i * 0.02, f0: i < 20 ? 100 : 150 }));
  assertStrictEqual(quantizeHL(lowHigh, 2).join(""), "LH", "Thấp rồi cao -> LH");
  assertStrictEqual(quantizeHL([...lowHigh].reverse().map((p, i) => ({ t: i * 0.02, f0: p.f0 })), 2).join(""), "HL", "Cao rồi thấp -> HL");
  assertStrictEqual(quantizeHL([{ t: 0, f0: null }], 3).length, 0, "Không có thanh -> []");
  // Bậc thang 20 mẫu / mora (L = 100 Hz, H = 130 Hz ≈ 4.5 nửa cung); "_" = mora câm (っ, nguyên âm vô thanh hoá)
  const stepContour = (pattern: string) =>
    [...pattern].flatMap((ch, m) =>
      Array.from({ length: 20 }, (_, k) => ({ t: (m * 20 + k) * 0.02, f0: ch === "H" ? 130 : ch === "L" ? 100 : null }))
    );
  const hl = (pattern: string) => quantizeHL(stepContour(pattern), pattern.length).map((l) => l ?? "_").join("");
  for (const p of ["LHH", "LHHH", "HLL", "HLLL", "LHL", "LHLL", "LHHL"]) {
    assertStrictEqual(hl(p), p, `Hai mặt bằng dài ngắn khác nhau không sụp về một mức (${p})`);
  }
  assertStrictEqual(hl("L_HH"), "L_HH", "Mora câm (っ) -> null, không bịa mức");
  assertStrictEqual(hl("LLLL"), "LLLL", "Giọng đều -> toàn L");
  // Nakadaka thực tế: hạ sau hạt nhân sâu hơn bước lên đầu từ (たまご ≈ 0 / +2.5 / -3 nửa cung)
  const tamago = [100, 115.5, 84].flatMap((f0, m) => Array.from({ length: 20 }, (_, k) => ({ t: (m * 20 + k) * 0.02, f0 })));
  assertStrictEqual(quantizeHL(tamago, 3).join(""), "LHL", "Bước xuống lớn hơn bước lên vẫn ra LHL");
  // 1 mora: không có mora khác để so nên dựa vào dốc trong mora
  assertStrictEqual(quantizeHL(Array.from({ length: 40 }, (_, i) => ({ t: i * 0.02, f0: 150 })), 1).join(""), "L", "1 mora giọng đều -> L (kiểu 0)");
  assertStrictEqual(quantizeHL(Array.from({ length: 40 }, (_, i) => ({ t: i * 0.02, f0: i < 20 ? 176 : 100 })), 1).join(""), "H", "1 mora hạ giọng -> H (kiểu 1)");
  assertStrictEqual(quantizeHL(Array.from({ length: 40 }, (_, i) => ({ t: i * 0.02, f0: i < 20 ? 100 : 176 })), 1).join(""), "L", "1 mora lên giọng -> L");
  assertStrictEqual(referenceHL(4, 0).join(""), "LHHH", "Heiban (kiểu 0)");
  assertStrictEqual(referenceHL(4, 1).join(""), "HLLL", "Atamadaka (kiểu 1)");
  assertStrictEqual(referenceHL(4, 2).join(""), "LHLL", "Nakadaka (kiểu 2)");
  assertStrictEqual(referenceHL(4, 3).join(""), "LHHL", "Nakadaka (kiểu 3)");
  assertStrictEqual(referenceHL(4, 4).join(""), "LHHH", "Odaka (kiểu 4): hạ ở trợ từ, ngoài từ");
  assertStrictEqual(referenceHL(0, 1).length, 0, "0 mora -> []");
  assertStrictEqual(pitchScore(["L", "H", "H", "H"], referenceHL(4, 0)).pct, 100, "Trùng hoàn toàn = 100");
  const pscore = pitchScore(["L", "L", "H", "H"], ["L", "H", "L", "L"]);
  assertStrictEqual(`${pscore.pct}:${pscore.wrongMora.join(",")}`, "25:1,2,3", "1/4 đúng, báo đúng chỉ số mora sai");
  assertStrictEqual(pitchScore(["L"], ["L", "H"]).wrongMora.join(","), "1", "Người học nói thiếu mora -> tính sai");
  const silentOk = pitchScore(["L", null, "H", "H"], referenceHL(4, 0));
  assertStrictEqual(`${silentOk.pct}:${silentOk.wrongMora.join(",")}`, "100:", "Mora không có thanh bị loại khỏi tử lẫn mẫu số");
  const silentOne = pitchScore(["L", null, "L", "H"], referenceHL(4, 0));
  assertStrictEqual(`${silentOne.pct}:${silentOne.wrongMora.join(",")}`, "67:2", "3 mora có thanh, 1 sai -> 67, không báo mora câm");
  const svgUser = contourToSvgPoints(lowHigh, 320, 120, 8);
  assertStrictEqual(svgUser.length, 40, "Mỗi điểm có thanh một toạ độ");
  assertStrictEqual(svgUser[0].y > svgUser[39].y, true, "Cao độ cao hơn -> y nhỏ hơn (SVG)");
  assertStrictEqual(`${svgUser[0].x},${svgUser[39].x}`, "8,312", "Trải đều theo bề ngang trừ lề");
  const svgRef = hlToSvgPoints(["L", "H"], 320, 120, 8);
  assertStrictEqual(svgRef.length, 4, "Bậc thang: 2 điểm mỗi mora");
  assertStrictEqual(svgRef[0].y > svgRef[2].y, true, "L nằm dưới H");

  // 17. Bộ gõ romaji -> kana (lib/romaji.ts)
  const kana = (s: string, mode?: "hiragana" | "katakana") => {
    const r = toKana(s, mode);
    return `${r.text}|${r.pending}`;
  };
  assertStrictEqual(kana("gakkou"), "がっこう|", "gakkou: phụ âm đôi -> っ");
  assertStrictEqual(kana("nihongo"), "にほんご|", "nihongo: n + nguyên âm = な行, n + phụ âm = ん");
  assertStrictEqual(kana("shinbun"), "しんぶ|n", "shinbun: n cuối chuỗi còn chờ (có thể thành な行)");
  assertStrictEqual(romajiToKanaFull("shinbun"), "しんぶん", "shinbun chốt -> しんぶん");
  assertStrictEqual(kana("kon'nichiha"), "こんにちは|", "n' tách ん khỏi に");
  assertStrictEqual(kana("konnichiha"), "こんにちは|", "nn + nguyên âm = ん + な行");
  assertStrictEqual(kana("konna"), "こんな|", "konna -> こんな (cùng quy tắc)");
  assertStrictEqual(kana("kannji"), "かんじ|", "nn + phụ âm = ん, phụ âm giữ lại");
  assertStrictEqual(kana("kinnyoubi"), "きんようび|", "nn + y = ん, y giữ lại (không thành にょ)");
  assertStrictEqual(kana("kya"), "きゃ|", "âm ghép きゃ");
  assertStrictEqual(kana("tte"), "って|", "tt -> って");
  assertStrictEqual(kana("sshi"), "っし|", "ssh -> っし");
  assertStrictEqual(kana("matcha"), "まっちゃ|", "tch -> っち");
  assertStrictEqual(kana("n"), "|n", "n đơn: chờ");
  assertStrictEqual(kana("ny"), "|ny", "ny: chờ nguyên âm");
  assertStrictEqual(kana("konn"), "こ|nn", "nn cuối chuỗi: chờ (こん hay こんに?)");
  assertStrictEqual(romajiToKanaFull("konn"), "こん", "nn chốt -> ん");
  assertStrictEqual(romajiToKanaFull("kekkon"), "けっこん", "n cuối chốt -> ん");
  assertStrictEqual(flushPending("ny"), "んy", "ny chốt: ん chắc chắn, y giữ lại cho người dùng sửa");
  assertStrictEqual(kana("tokyo", "katakana"), "トキョ|", "katakana: tokyo -> トキョ");
  assertStrictEqual(kana("ka-", "katakana"), "カー|", "gạch ngang -> ー");
  assertStrictEqual(kana("ke-ki"), "けーき|", "ー cũng dùng được ở hiragana");
  assertStrictEqual(kana("hello"), "へっぉ|", "Chuỗi không phải romaji: ll -> っ, lo -> ぉ (như IME), không nuốt chữ");
  assertStrictEqual(kana("x1"), "x1|", "Chữ cái không mở đầu âm tiết được giữ nguyên");
  assertStrictEqual(kana("こni"), "こに|", "Kana có sẵn đi qua nguyên vẹn (gọi lại trên chuỗi đã chuyển)");
  assertStrictEqual(kana("KA"), "か|", "Không phân biệt hoa thường");
  assertStrictEqual(kana("İ"), "İ|", "Chữ hoa ngoài ASCII (İ Thổ Nhĩ Kỳ, toLowerCase ra 2 ký tự) đi qua nguyên vẹn, không thành 'undefined'");
  assertStrictEqual(romajiToKanaFull("aİb"), "あİb", "Ký tự đứng sau chữ hoa ngoài ASCII vẫn đúng chỉ số");
  assertStrictEqual(
    ["shi", "si"].map((s) => kana(s)).join() + ["chi", "ti"].map((s) => kana(s)).join() + ["tsu", "tu"].map((s) => kana(s)).join(),
    "し|,し|ち|,ち|つ|,つ|",
    "Hepburn và Kunrei: shi/si, chi/ti, tsu/tu"
  );
  assertStrictEqual([kana("fu"), kana("hu"), kana("ji"), kana("zi"), kana("di")].join(), "ふ|,ふ|,じ|,じ|,ぢ|", "fu/hu, ji/zi, di -> ぢ");
  assertStrictEqual([kana("sha"), kana("sya"), kana("cha"), kana("tya"), kana("ja"), kana("zya"), kana("dya")].join(), "しゃ|,しゃ|,ちゃ|,ちゃ|,じゃ|,じゃ|,ぢゃ|", "Âm ghép hai kiểu viết");
  assertStrictEqual([kana("wi"), kana("we"), kana("wo"), kana("vu"), kana("fa")].join(), "うぃ|,うぇ|,を|,ゔ|,ふぁ|", "wi/we/wo, vu, fa");
  assertStrictEqual([kana("xa"), kana("la"), kana("xtsu"), kana("ltu"), kana("xyo")].join(), "ぁ|,ぁ|,っ|,っ|,ょ|", "Kana nhỏ x-/l-");
  assertStrictEqual(kanaToKatakana("がっこう"), "ガッコウ", "hiragana -> katakana");
  assertStrictEqual(`${hasKana("abc")},${hasKana("aか")},${hasKana("ｶ")}`, "false,true,true", "hasKana nhận cả katakana nửa chiều rộng");

  // 18. Luyện viết kanji (lib/strokes.ts): lấy mẫu lại, chuẩn hoá, SVG, tóm tắt kết quả
  const lShape = [
    { x: 0, y: 0 },
    { x: 0, y: 15 },
    { x: 16, y: 15 },
  ];
  const rs = resampleStroke(lShape);
  assertStrictEqual(rs.length, 32, "Lấy mẫu lại ra 32 điểm");
  assertStrictEqual(`${rs[0].x},${rs[0].y},${rs[31].x},${rs[31].y}`, "0,0,16,15", "Giữ nguyên điểm đầu / cuối");
  const gaps = rs.slice(1).map((p, i) => Math.hypot(p.x - rs[i].x, p.y - rs[i].y));
  assertStrictEqual(gaps.every((g) => Math.abs(g - 1) < 1e-6), true, `Chữ L dài 31: các điểm cách đều 1 (±1e-6), được ${gaps.map((g) => g.toFixed(4)).join(",")}`);
  assertStrictEqual(strokeLength(lShape), 31, "Chiều dài chữ L = 15 + 16");
  const dot = resampleStroke([{ x: 3, y: 4, t: 7 }]);
  assertStrictEqual(dot.length === 32 && dot.every((p) => p.x === 3 && p.y === 4 && p.t === 7), true, "Nét 1 điểm -> lặp lại 32 lần, giữ t");
  assertStrictEqual(resampleStroke([]).length, 0, "Nét rỗng -> []");
  const square = normalizeGlyph([
    [{ x: 10, y: 10 }, { x: 110, y: 10 }, { x: 110, y: 110 }],
    [{ x: 110, y: 110 }, { x: 10, y: 110 }, { x: 10, y: 10 }],
  ]);
  const sqBox = boundingBox(square)!;
  assertStrictEqual(`${sqBox.minX},${sqBox.minY},${sqBox.maxX},${sqBox.maxY}`, "0,0,1,1", "Hình vuông 2 nét -> hộp 0..1 đủ hai chiều");
  const wide = normalizeGlyph([[{ x: 0, y: 0 }, { x: 200, y: 0 }], [{ x: 0, y: 0 }, { x: 0, y: 100 }]]);
  const wideBox = boundingBox(wide)!;
  assertStrictEqual(`${wideBox.minX},${wideBox.maxX},${wideBox.minY},${wideBox.maxY}`, "0,1,0.25,0.75", "Chữ ngang 2:1: cạnh dài = 1, cạnh ngắn căn giữa");
  const flatStroke = normalizeGlyph([[{ x: 3, y: 7 }, { x: 13, y: 7 }]]);
  assertStrictEqual(flatStroke[0].map((p) => `${p.x},${p.y}`).join(";"), "0,0.5;1,0.5", "Một nét ngang: y căn giữa 0.5");
  assertStrictEqual(JSON.stringify(normalizeGlyph([[{ x: 3, y: 7 }]])), '[[{"x":0.5,"y":0.5}]]', "Một chấm -> tâm ô");
  assertStrictEqual(normalizeGlyph([]).length, 0, "Không có nét -> []");
  assertStrictEqual(boundingBox([]), null, "Hộp bao rỗng -> null");
  assertStrictEqual(strokesToSvgPath([[{ x: 0, y: 0 }, { x: 1, y: 1 }], [{ x: 0.5, y: 0.5 }]], 100), "M0 0 L100 100 M50 50 L50 50", "SVG path: nét 1 điểm lặp L để vẽ chấm");
  assertStrictEqual(referenceToSvgPaths([[[0, 0], [1, 0]], [[0, 1], [1, 1]]], 10).join("|"), "M0 0 L10 0|M0 10 L10 10", "Nét mẫu -> mỗi nét một path");
  const chips = summarizeStrokeScore(
    {
      totalScore: 70,
      isCorrectOrder: false,
      feedback: "",
      perStroke: [
        { index: 0, score: 90 },
        { index: 1, score: 80, wrongDirection: true },
        { index: 2, score: 70, expectedIndex: 3 },
        { index: 3, score: 10, expectedIndex: null },
        { index: 4, score: 20, expectedIndex: 4 },
      ],
    },
    6
  );
  assertStrictEqual(
    chips.map((c) => `${c.strokeNo}:${c.label}`).join(","),
    "1:đúng,2:sai hướng,3:sai thứ tự,4:thừa,5:lệch hình,3:thiếu,6:thiếu",
    "Chip từng nét: đúng / sai hướng / sai thứ tự / thừa / lệch hình, rồi nét mẫu không được ghép = thiếu"
  );
  assertStrictEqual(summarizeStrokeScore({ totalScore: 0, isCorrectOrder: true, feedback: "", perStroke: [] }, null).length, 0, "Không biết số nét chuẩn -> không suy ra nét thiếu");

  // 19. Nhận diện chữ Hán (lib/textUtils.ts) cho nút "Viết"
  assertStrictEqual(extractKanji("日本語を学ぶ日").join(""), "日本語学", "Tách chữ Hán, bỏ trùng, giữ thứ tự");
  assertStrictEqual(`${hasCjkIdeograph("がっこう")},${hasCjkIdeograph("学校")},${hasCjkIdeograph("ｶﾀｶﾅ abc")}`, "false,true,false", "Kana / latin không phải chữ Hán");
  assertStrictEqual(`${isCjkIdeograph("学")},${isCjkIdeograph("々")},${isCjkIdeograph("学校")},${isCjkIdeograph("")}`, "true,false,false,false", "isCjkIdeograph: đúng một chữ, không tính dấu lặp 々");

  // 20. Phân bố cấp JLPT toàn tài liệu + cấp tổng thể (features/extraction/extractionUtils.ts, B6)
  const distAll = levelDistribution({
    byLevel: { N5: 1, N4: 1 }, // sau lọc: phải bị bỏ qua khi có byLevelAll
    byLevelAll: { N5: 50, N4: 30, N3: 15, N2: 4, N1: 1, unknown: 7 },
    levelPct: { N5: 50, N4: 30, N3: 15, N2: 4, N1: 1 },
    overallLevel: "N4",
  })!;
  assertStrictEqual(distAll.source, "all", "Có byLevelAll -> số liệu toàn tài liệu (trước lọc)");
  assertStrictEqual(distAll.segments.map((s) => s.level).join(","), "N5,N4,N3,N2,N1,unknown", "Thứ tự N5 -> N1 rồi chưa rõ");
  assertStrictEqual(distAll.segments.map((s) => s.count).join(","), "50,30,15,4,1,7", "Số đếm lấy từ byLevelAll, không phải byLevel");
  assertStrictEqual(distAll.segments.filter((s) => s.level !== "unknown").reduce((a, s) => a + s.pct, 0), 100, "pct các cấp rõ cộng đúng 100");
  assertStrictEqual(`${distAll.total},${distAll.known},${distAll.overallLevel}`, "107,100,N4", "Tổng kể cả chưa rõ, số rõ cấp, cấp tổng thể từ ai-service");
  assertStrictEqual(
    levelDistributionSummary(distAll),
    "Phân bố cấp JLPT (toàn tài liệu): N5 50 (50%), N4 30 (30%), N3 15 (15%), N2 4 (4%), N1 1 (1%) · chưa rõ 7",
    "Tóm tắt bằng chữ cho aria-label / tooltip"
  );
  // Kiểm thử 28/10 (L-05): trang bóc tách báo OCR hạ cấp (Gemini quá tải → giữ bản Tesseract)
  assertStrictEqual(ocrDegradedNotice(null), null, "Không có meta -> không cảnh báo");
  assertStrictEqual(ocrDegradedNotice({ pages: 1 }), null, "Đọc file / OCR bình thường -> không cảnh báo");
  assertStrictEqual(
    ocrDegradedNotice({ ocrDegraded: true, ocrDegradedPages: 1, pages: 1 }),
    "Ảnh chưa được AI soát lại (dịch vụ AI quá tải); văn bản dưới đây là bản OCR thô, có thể sai chữ — hãy đối chiếu và sửa rồi phân tích lại.",
    "Một trang -> nói 'Ảnh'"
  );
  assertStrictEqual(
    ocrDegradedNotice({ ocrDegraded: true, ocrDegradedPages: 3, pages: 10 }),
    "3/10 trang chưa được AI soát lại (dịch vụ AI quá tải); văn bản dưới đây là bản OCR thô, có thể sai chữ — hãy đối chiếu và sửa rồi phân tích lại.",
    "Nhiều trang -> nêu số trang hạ cấp / tổng"
  );
  const distPct = levelDistribution({ byLevel: {}, byLevelAll: { N5: 1, N4: 1 }, levelPct: { N5: 70.4, N4: 29.6 } })!;
  assertStrictEqual(distPct.segments.slice(0, 2).map((s) => s.pct).join(","), "70,30", "Có levelPct thì tỉ lệ theo ai-service, làm tròn về số nguyên");
  const distOld = levelDistribution({ byLevel: { N5: 1, N4: 1, N3: 1, unknown: 2 } })!;
  assertStrictEqual(distOld.source, "filtered", "Job cũ chỉ có byLevel -> số liệu sau lọc");
  assertStrictEqual(distOld.segments.map((s) => s.pct).join(","), "34,33,33,0,0,40", "Largest remainder: 1/3 mỗi cấp -> 34,33,33 (hoà ưu tiên cấp dễ); chưa rõ tính trên tổng");
  assertStrictEqual(distOld.overallLevel, null, "Job cũ không có overallLevel -> null, không tự suy từ số liệu sau lọc");
  assertStrictEqual(levelDistribution({ byLevel: {} }), null, "Không có mục nào -> null (không vẽ)");
  assertStrictEqual(levelDistribution(null), null, "Không có stats -> null");
  assertStrictEqual(levelDistribution({ byLevel: { N5: -3, N4: Number.NaN } }), null, "Số đếm hỏng coi như 0 -> null");
  assertStrictEqual(roundToHundred([1, 1, 1, 1, 1, 1]).join(","), "17,17,17,17,16,16", "Phần dư làm tròn chia cho mục đứng trước khi hoà");
  assertStrictEqual(roundToHundred([0, 0]).join(","), "0,0", "Tổng 0 -> toàn 0, không chia cho 0");
  assertStrictEqual(`${overallLevelLabel("N3")} | ${overallLevelLabel(null)}`, "Cấp tổng thể: N3 | Cấp tổng thể: chưa xác định", "Nhãn badge cấp tổng thể");
  const vocabAll = { kind: "vocab", levelFilter: "all" } as const;
  assertStrictEqual(defaultDeckLevel({ overallLevel: "N2" }, [{ level: "N5" }, { level: "N5" }], vocabAll), "N2", "Bộ từ vựng của job không lọc cấp -> ưu tiên cấp tổng thể của tài liệu");
  assertStrictEqual(defaultDeckLevel({}, [{ level: "N5" }, { level: "N4" }, { level: "N4" }], vocabAll), "N4", "Job cũ không có cấp tổng thể -> cấp phổ biến nhất trong item đã chọn");
  assertStrictEqual(defaultDeckLevel(null, [{ level: null }], vocabAll), null, "Không suy ra được -> null (nơi gọi dùng trình độ người dùng)");
  // Đã lọc cấp (vd. người học N3 chọn "chỉ từ chưa biết"): item giữ lại toàn N2/N1 nhưng overallLevel toàn tài liệu là N4.
  const onlyHard = [{ level: "N2" }, { level: "N2" }, { level: "N1" }];
  assertStrictEqual(defaultDeckLevel({ overallLevel: "N4" }, onlyHard, { kind: "vocab", levelFilter: "only_unknown_to_me" }), "N2", "Job có lọc cấp -> theo item thực sự vào bộ, không dùng cấp tổng thể trước lọc");
  assertStrictEqual(defaultDeckLevel({ overallLevel: "N4" }, onlyHard, { kind: "vocab", levelFilter: "at_or_above" }), "N2", "at_or_above cũng là đã lọc");
  assertStrictEqual(defaultDeckLevel({ overallLevel: "N4" }, onlyHard, { kind: "grammar", levelFilter: "all" }), "N2", "Bộ ngữ pháp không dùng cấp tổng thể (ai-service chỉ tính trên từ vựng)");

  // 21. Lộ trình 2.0 — ngày học / ngày nghỉ theo mặt nạ T2..CN (features/roadmap/roadmapUtils.ts, spec §3.5)
  // 2026-10-19 là Thứ 2; 10-16 Thứ 6, 10-17 Thứ 7, 10-18 CN.
  const MON_FRI = "1111100";
  assertStrictEqual(`${isValidStudyDays(ALL_WEEK)},${isValidStudyDays("0000000")},${isValidStudyDays("111")},${isValidStudyDays("1x11111")}`, "true,false,false,false", "Mặt nạ hợp lệ: đúng 7 ký tự 0/1, không toàn 0");
  assertStrictEqual(`${isStudyDay(d(2026, 10, 17), MON_FRI)},${isStudyDay(d(2026, 10, 19), MON_FRI)},${isStudyDay(d(2026, 10, 18))}`, "false,true,true", "Thứ 7 nghỉ với T2–T6; CN là ngày học khi mặc định cả tuần");
  assertStrictEqual(dateForDay("2026-10-14", 3), "2026-10-16", "1.0 không đổi: không mặt nạ = cộng ngày lịch");
  assertStrictEqual(dateForDay("2026-10-14", 0, "bad"), "2026-10-13", "Mặt nạ hỏng coi như cả tuần, dayIndex 0 lùi 1 ngày như 1.0");
  assertStrictEqual(`${dateForDay("2026-10-16", 1, MON_FRI)},${dateForDay("2026-10-16", 2, MON_FRI)},${dateForDay("2026-10-16", 6, MON_FRI)}`, "2026-10-16,2026-10-19,2026-10-23", "Bắt đầu Thứ 6, nghỉ cuối tuần: ngày 2 là Thứ 2, ngày 6 là Thứ 6 tuần sau");
  assertStrictEqual(dateForDay("2026-10-17", 1, MON_FRI), "2026-10-19", "Bắt đầu vào ngày nghỉ (Thứ 7) -> ngày 1 là ngày học kế (Thứ 2)");
  assertStrictEqual(dateForDay("2026-10-19", 0, MON_FRI), "2026-10-16", "dayIndex 0 với mặt nạ lùi về ngày học trước (bỏ qua cuối tuần)");
  assertStrictEqual(`${dateForDay("2026-10-19", 1, "0000001")},${dateForDay("2026-10-19", 2, "0000001")}`, "2026-10-25,2026-11-01", "Chỉ học CN: ngày 1 là CN đầu tiên, ngày 2 là CN kế");
  const idx = (start: string, date: string, mask?: string) => {
    const r = dayIndexForMask(start, date, mask);
    return `${r.index}${r.rest ? "R" : ""}`;
  };
  // S-05: mask 1111100, bắt đầu Thứ 6 -> Thứ 7/CN trả rest (index ngày học cuối = 1), Thứ 2 là ngày 2
  assertStrictEqual(`${idx("2026-10-16", "2026-10-16", MON_FRI)},${idx("2026-10-16", "2026-10-17", MON_FRI)},${idx("2026-10-16", "2026-10-18", MON_FRI)},${idx("2026-10-16", "2026-10-19", MON_FRI)}`, "1,1R,1R,2", "S-05: Thứ 7/CN là ngày nghỉ giữ index của Thứ 6, Thứ 2 là ngày 2");
  assertStrictEqual(`${idx("2026-10-17", "2026-10-17", MON_FRI)},${idx("2026-10-17", "2026-10-18", MON_FRI)},${idx("2026-10-17", "2026-10-19", MON_FRI)},${idx("2026-10-17", "2026-10-24", MON_FRI)},${idx("2026-10-17", "2026-10-26", MON_FRI)}`, "0R,0R,1,5R,6", "Bắt đầu Thứ 7 (nghỉ): trước ngày 1 là 0 + rest, Thứ 2 = ngày 1, Thứ 7 sau = 5 rest, Thứ 2 sau = 6");
  assertStrictEqual(`${idx("2026-10-19", "2026-10-28", "0000001")},${idx("2026-10-19", "2026-10-25", "0000001")},${idx("2026-10-19", "2026-11-01", "0000001")}`, "1R,1,2", "Chỉ học CN: giữa tuần là nghỉ của ngày 1");
  assertStrictEqual(`${idx("2026-10-19", "2026-10-18")},${idx("2026-10-19", "2026-10-17")},${idx("2026-10-19", "2026-10-19")},${idx("2026-10-19", "2026-10-21")}`, "0,-1,1,3", "Cả tuần: trước ngày bắt đầu 0, -1 (trùng dayIndexFor 1.0 chưa kẹp)");
  assertStrictEqual(`${idx("2026-10-19", "2026-10-16", MON_FRI)},${idx("2026-10-19", "2026-10-17", MON_FRI)},${idx("2026-10-19", "2026-10-15", MON_FRI)}`, "0,0R,-1", "Trước ngày 1 với mặt nạ: đếm lùi chỉ theo ngày học");
  assertStrictEqual(idx("2026-10-19", "2026-10-20", MON_FRI), "2", "Nhận chuỗi YYYY-MM-DD");
  assertStrictEqual(dayIndexForMask("2026-10-19", d(2026, 10, 24, 23), MON_FRI).rest, true, "Nhận Date (bỏ giờ): Thứ 7 là nghỉ");
  assertStrictEqual(parseWeekdayMask("1010100").map((b) => (b ? 1 : 0)).join(""), "1010100", "Tách mặt nạ thành 7 cờ");
  assertStrictEqual(parseWeekdayMask("abc").every(Boolean), true, "Mặt nạ hỏng -> cả tuần");
  assertStrictEqual(`${weekdayMaskToggle(ALL_WEEK, 5)},${weekdayMaskToggle("1111101", 5)},${weekdayMaskToggle("0000001", 6)},${weekdayMaskToggle(ALL_WEEK, 9)}`, "1111101,1111111,0000001,1111111", "Tắt Thứ 7, bật lại, không tắt được ngày học cuối, thứ ngoài 0..6 giữ nguyên");
  assertStrictEqual(`${studyDaysLabel(ALL_WEEK)}|${studyDaysLabel(MON_FRI)}|${studyDaysLabel("1010100")}|${studyDaysLabel("1100011")}|${studyDaysLabel("0000001")}`, "Cả tuần|T2–T6|T2, T4, T6|T2–T3, T7–CN|CN", "Nhãn ngày học: gộp dải liền nhau");
  assertStrictEqual(`${studyDaysPerWeek(MON_FRI)},${studyDaysPerWeek("x")}`, "5,7", "Số ngày học mỗi tuần");

  // 22. Lộ trình 2.0 — nợ / tải / tiến độ / phiên học
  assertStrictEqual(`${behindSeverity(0, 30, 100)},${behindSeverity(3, 30, 100)},${behindSeverity(20, 30, 100)}`, "none,warn,warn", "Không nợ -> none; nợ ≤ 20 % còn lại và ≤ trần -> warn (20 = 20 % chưa vượt)");
  assertStrictEqual(`${behindSeverity(31, 30, 1000)},${behindSeverity(21, 30, 100)},${behindSeverity(1, 30, 0)}`, "severe,severe,severe", "Nợ > trần, nợ > 20 % còn lại, không còn thẻ mà vẫn nợ -> severe");
  assertStrictEqual(`${behindSeverity(50, 0, 1000)},${behindSeverity(250, 0, 1000)}`, "warn,severe", "Không trần (cap ≤ 0): chỉ xét tỉ lệ");
  assertStrictEqual(`${loadLabel(27.4, 30)}|${loadLabel(35, 30)}|${loadLabel(12, 0)}|${loadLabel(-2, 30)}`, "27/30 thẻ|35/30 thẻ · vượt trần|12 thẻ|0/30 thẻ", "Nhãn tải: làm tròn, cảnh báo vượt trần, không trần, không âm");
  assertStrictEqual(suggestDaysLabel(13, 100), "Gợi ý 13 ngày (~8 thẻ mới/ngày)", "Gợi ý số ngày: ceil(thẻ/ngày)");
  assertStrictEqual(suggestDaysLabel(0, 10), "Gợi ý 0 ngày (~10 thẻ mới/ngày)", "Không chia cho 0");
  const comp = { total: 60, learned: 45, mastered: 12, learnedPct: 75, masteredPct: 20, chaptersPassed: 2, chaptersTotal: 5, done: false };
  assertStrictEqual(completionPhrase(comp), "Đã học 45/60 thẻ (75%) · 12 đã thuộc (20%) · 2/5 chương đã qua kiểm tra", "Hai thước đo + chương");
  assertStrictEqual(completionPhrase({ ...comp, learned: 60, learnedPct: 100, done: true, chaptersTotal: 0 }), "Đã học hết 60 thẻ · 12 đã thuộc (20%)", "Hoàn thành, không có chương thì bỏ phần chương");
  assertStrictEqual(completionPhrase({ ...comp, total: 0 }), "Lộ trình chưa có thẻ nào.", "Không có thẻ");
  assertStrictEqual(`${clampReactionMs(-5)},${clampReactionMs(700000)},${clampReactionMs(1234.6)},${clampReactionMs(Number.NaN)},${clampReactionMs(Infinity)}`, "0,600000,1235,undefined,undefined", "Phản xạ: kẹp 0..600000, làm tròn, số hỏng không gửi");
  assertStrictEqual(`${parseSessionKind("today")},${parseSessionKind("chapter")},${parseSessionKind("x")},${parseSessionKind(null)}`, "today,chapter,null,null", "Đọc ?session=");
  assertStrictEqual(sessionUrl("p 1", "chapter", "c/2"), "/session?session=chapter&path=p%201&chapter=c%2F2", "URL phiên: mã hoá id");
  assertStrictEqual(sessionUrl("p1", "today", null), "/session?session=today&path=p1", "URL phiên không chương");
  assertStrictEqual(sessionCountsLabel({ new: 10, due: 5, catchup: 3, total: 18 }), "Ôn 5 · Nợ 3 · Mới 10", "Thứ tự Ôn · Nợ · Mới như hàng đợi");
  assertStrictEqual(`${sessionCountsLabel({ new: 4, due: 0, catchup: 0, total: 4 })}|${sessionCountsLabel({ new: 0, due: 0, catchup: 0, total: 0 })}`, "Mới 4|0 thẻ", "Bỏ nhóm 0; rỗng -> 0 thẻ");
  assertStrictEqual(sessionEmptyMessage("today", "rest").includes("nghỉ theo lịch"), true, "Phiên rỗng ngày nghỉ");
  assertStrictEqual(sessionEmptyMessage("today", "before").includes("chưa bắt đầu"), true, "Phiên rỗng trước ngày bắt đầu");
  assertStrictEqual(`${sessionEmptyMessage("catchup", "during")}|${sessionEmptyMessage("due", "during")}|${sessionEmptyMessage("chapter", "rest")}`, "Bạn không nợ thẻ nào. Tuyệt!|Không có thẻ nào đến hạn ôn.|Chương này không còn thẻ nào để học.", "Theo loại phiên; chương không xét ngày nghỉ");
  assertStrictEqual(`${deckCardMode(undefined, rcNow)},${deckCardMode(rcReview("2026-10-13T00:00:00Z"), rcNow)},${deckCardMode(rcReview("2026-10-20T00:00:00Z"), rcNow)}`, "new,due,cram", "Chế độ thẻ khi học bộ thẻ: mới / đến hạn / chưa đến hạn = luyện (cùng quy tắc rangeCram)");
  const sc = sessionCardToCard({ cardId: "k1", deckId: "d1", chapterId: "c1", chapterTitle: "Bài 1", term: "学校", reading: "がっこう", readingSegments: [{ kanji: "学校", kana: "がっこう" }], meaning: "trường học", hanViet: "HỌC HIỆU", level: "N5", kind: "vocab", mode: "new" });
  assertStrictEqual(`${sc.id},${sc.term},${sc.reading},${sc.meaning},${sc.hanViet},${sc.level},${sc.kind},${sc.readingSegments?.length}`, "k1,学校,がっこう,trường học,HỌC HIỆU,N5,vocab,1", "Thẻ phiên -> Card (id = cardId)");

  // 23. Lộ trình 2.0 — phần B: trần thẻ/ngày, phiên hôm nay, dự báo, chương, tiến độ dự phòng, dịch lại nghĩa, cài đặt
  assertStrictEqual(`${isValidDailyCap(5)},${isValidDailyCap(200)},${isValidDailyCap(4)},${isValidDailyCap(201)},${isValidDailyCap(7.5)}`, "true,true,false,false,false", "Trần thẻ/ngày: số nguyên 5..200");
  assertStrictEqual(DEFAULT_DAILY_CAP, 50, "Mặc định trần = 50 như server (V20)");
  const lpBusy = (status: "PROCESSING" | "DRAFT" | "ACTIVE" | "FAILED", job: "QUEUED" | "RUNNING" | "DONE" | "FAILED" | null) =>
    isPathBusy({ status, job: job ? { status: job, stage: "ENRICH", errorMessage: null } : null });
  assertStrictEqual(`${lpBusy("PROCESSING", null)},${lpBusy("DRAFT", "RUNNING")},${lpBusy("ACTIVE", "QUEUED")},${lpBusy("DRAFT", "DONE")},${lpBusy("FAILED", "FAILED")}`, "true,true,true,false,false", "Đang bận (poll tiếp): PROCESSING hoặc job đang chạy lại bước dịch nghĩa");
  const tc = { newCount: 10, dueCount: 5, behindCount: 12 };
  assertStrictEqual(`${todaySessionSize(tc, 30, "during")},${todaySessionSize(tc, 20, "during")},${todaySessionSize(tc, 12, "during")},${todaySessionSize(tc, 0, "during")}`, "27,20,15,27", "Phiên hôm nay: nợ cắt cho vừa trần (đến hạn + nợ + mới ≤ trần), mới không bao giờ bị bỏ; không trần thì lấy hết");
  assertStrictEqual(`${todaySessionSize(tc, 30, "rest")},${todaySessionSize(tc, 30, "before")},${todaySessionSize(tc, 30, "after")},${todaySessionSize(tc, 10, "after")}`, "5,5,17,10", "Ngày nghỉ / chưa bắt đầu: chỉ đến hạn; đã kết thúc: đến hạn + nợ (cắt theo trần), không có mới");
  assertStrictEqual(todayCountsLabel(tc), "ôn 5 · nợ 12 · mới 10", "Nhãn ba nhóm luôn đủ, thứ tự ôn · nợ · mới");
  assertStrictEqual(todayCountsLabel({ newCount: -1, dueCount: 0, behindCount: 0 }), "ôn 0 · nợ 0 · mới 0", "Số âm hỏng coi như 0");
  assertStrictEqual(`${todaySummaryTotal([tc, { newCount: 1, dueCount: 2, behindCount: 3 }])},${todaySummaryTotal([])}`, "33,0", "Badge sidebar = Σ(mới + đến hạn + nợ); không có lộ trình -> 0 (ẩn)");
  assertStrictEqual(`${todaySummaryTotal([tc, { newCount: 0, dueCount: 4, behindCount: 0, done: true }])},${todaySummaryTotal([{ ...tc, done: true }])},${todaySummaryTotal([{ ...tc, done: false }])}`, "27,0,27", "LP-10: badge bỏ lộ trình đã xong (done), kể cả khi nó còn thẻ đến hạn");
  assertStrictEqual(`${pathDayLabel("during", 3, 30)}|${pathDayLabel("rest", 3, 30)}|${pathDayLabel("before", 0, 30)}|${pathDayLabel("after", 31, 30)}`, "Ngày 3/30|Nghỉ theo lịch|Chưa bắt đầu|Đã kết thúc", "Nhãn vị trí hôm nay (thẻ danh sách, widget)");
  assertStrictEqual(todayHeading("during", 3, 30, "2026-10-21", "2026-10-19"), "Hôm nay · Ngày 3/30 (21/10)", "Tiêu đề khối Hôm nay khi đang học");
  assertStrictEqual(`${todayHeading("rest", 3, 30, "2026-10-24", "2026-10-19")}|${todayHeading("before", 0, 30, "2026-10-18", "2026-10-19")}|${todayHeading("after", 31, 30, "2026-11-20", "2026-10-19")}`, "Hôm nay nghỉ theo lịch (24/10)|Chưa bắt đầu — lộ trình bắt đầu ngày 19/10|Đã kết thúc — ôn nốt thẻ đến hạn và thẻ nợ", "Tiêu đề theo trạng thái ngày");
  const fc = [
    { dayIndex: 1, date: "2026-10-19", newCount: 10, predictedReviews: 0, load: 10, overCap: false },
    { dayIndex: 2, date: "2026-10-20", newCount: 10, predictedReviews: 9, load: 19, overCap: false },
    { dayIndex: 3, date: "2026-10-21", newCount: 12, predictedReviews: 21.6, load: 33.6, overCap: true },
  ];
  assertStrictEqual(`${forecastScaleMax(fc, 30)},${forecastScaleMax(fc, 0)},${forecastScaleMax([], 0)},${forecastScaleMax(fc, 100)}`, "33.6,33.6,1,100", "Thang biểu đồ = max(tải, trần); rỗng -> 1 (không chia 0)");
  assertStrictEqual(`${barPct(15, 30)},${barPct(45, 30)},${barPct(-3, 30)},${barPct(5, 0)}`, "50,100,0,100", "Chiều cao cột kẹp 0..100");
  assertStrictEqual(forecastDayLabel(fc[2], 30), "Ngày 3 (21/10): 12 mới + 22 ôn · 34/30 thẻ · vượt trần", "Nhãn cột: làm tròn ôn dự báo và tải, báo vượt trần");
  assertStrictEqual(forecastDayLabel(fc[0], 0), "Ngày 1 (19/10): 10 mới + 0 ôn · 10 thẻ", "Không trần -> không có /trần");
  assertStrictEqual(`${forecastTick(1, null)},${forecastTick(2, null)},${forecastTick(5, null)},${forecastTick(7, 7)},${forecastTick(10, 7)}`, "1,,5,7,10", "Trục ngày: chỉ 1, bội số 5 và hôm nay");
  const chBase = { state: undefined, quizPassedAt: null, dayFrom: 3, dayTo: 5, cardCount: 10 };
  assertStrictEqual(`${chapterStateOf(chBase, 2)},${chapterStateOf(chBase, 3)},${chapterStateOf(chBase, 5)},${chapterStateOf(chBase, 6)}`, "locked,current,current,open", "Thiếu state (1.0): suy từ dải ngày");
  assertStrictEqual(`${chapterStateOf({ ...chBase, quizPassedAt: "2026-10-20T00:00:00Z" }, 2)},${chapterStateOf({ ...chBase, cardCount: 0 }, 2)},${chapterStateOf({ ...chBase, state: "review" as const }, 2)}`, "passed,empty,review", "Qua kiểm tra -> passed; hết thẻ -> empty (spec §7 \"trống\"); có state server thì dùng nguyên");
  assertStrictEqual(`${chapterStateOf({ ...chBase, cardCount: 0, quizPassedAt: "2026-10-20T00:00:00Z" }, 9)},${chapterStateOf({ ...chBase, cardCount: 0 }, 9)},${chapterStateOf({ ...chBase, state: "empty" as const }, 4)}`, "passed,empty,empty", "Hết thẻ mà đã qua -> passed; sau dải ngày vẫn empty (không thành open/nợ); state server empty giữ nguyên");
  assertStrictEqual(Object.keys(CHAPTER_STATE_LABELS).join(","), "locked,current,open,review,passed,empty", "Đủ nhãn 6 trạng thái chương");
  assertStrictEqual(CHAPTER_STATE_LABELS.empty, "Trống", "Nhãn chương rỗng");
  assertStrictEqual(`${quizBestLabel(85.4)}|${quizBestLabel(null)}|${quizBestLabel(undefined)}`, "Điểm cao nhất 85%|null|null", "Điểm quiz cao nhất; chưa làm -> null");
  // D4: "Chưa đạt N% — Làm lại" chỉ khi đã làm mà chưa qua; ngưỡng từ server (quizPassPct), thiếu -> 80 như mặc định V20
  assertStrictEqual(DEFAULT_QUIZ_PASS_PCT, 80, "Ngưỡng dự phòng trùng mặc định server");
  assertStrictEqual(`${quizRetryLabel({ quizBestPct: 50, quizPassedAt: null }, 80)}|${quizRetryLabel({ quizBestPct: 90, quizPassedAt: null }, 95)}|${quizRetryLabel({ quizBestPct: 50, quizPassedAt: null }, undefined)}`, "Chưa đạt 80%|Chưa đạt 95%|Chưa đạt 80%", "Dưới ngưỡng -> Chưa đạt N% (N = ngưỡng server, thiếu -> 80)");
  assertStrictEqual(`${quizRetryLabel({ quizBestPct: null, quizPassedAt: null }, 80)}|${quizRetryLabel({ quizBestPct: undefined }, 80)}|${quizRetryLabel({ quizBestPct: 60, quizPassedAt: "2026-10-20T00:00:00Z" }, 80)}`, "null|null|null", "Chưa làm hoặc đã qua (kể cả qua rồi làm lại điểm thấp) -> không nhắc");
  assertStrictEqual(`${quizRetryLabel({ quizBestPct: 75, quizPassedAt: null }, 70)}|${quizRetryLabel({ quizBestPct: 79.6, quizPassedAt: null }, 80)}|${quizRetryLabel({ quizBestPct: Number.NaN, quizPassedAt: null }, 80)}`, "Chưa qua kiểm tra|Chưa đạt 80%|null", "Admin hạ ngưỡng sau lần làm -> không nói \"chưa đạt\" sai; điểm hỏng -> null");
  const retryNote = (payload: Record<string, unknown>) =>
    describeNotification({ id: 1, type: "LEARNING_PATH_CHAPTER_RETRY", payload, readAt: null, createdAt: "2026-10-20T00:00:00Z" });
  const rn = retryNote({ pathId: "p 1", pathTitle: "N5", chapterId: "c1", chapterTitle: "Bài 1", pct: 50, passPct: 80 });
  assertStrictEqual(`${rn.text}|${rn.to}`, 'Chương "Bài 1" của lộ trình "N5" chưa đạt 80% (lần này 50%). Bạn vẫn học tiếp được, làm lại bài kiểm tra khi sẵn sàng.|/roadmap/p%201', "Thông báo nhắc làm lại: ngưỡng + điểm lượt này, link về đúng lộ trình");
  assertStrictEqual(retryNote({ pct: 40 }).text, "Chương của lộ trình học tập chưa đạt (lần này 40%). Bạn vẫn học tiếp được, làm lại bài kiểm tra khi sẵn sàng.", "Payload thiếu tên / ngưỡng vẫn ra câu đọc được");
  const cfDecks = [
    { id: "d1", cards: [{ id: "a" }, { id: "b" }, { id: "c" }] },
    { id: "d2", cards: [{ id: "e" }] },
  ] as unknown as Parameters<typeof completionFallback>[1];
  const cfReviews = { a: rcReview("2026-10-13T00:00:00Z"), b: { ...rcReview("2026-12-01T00:00:00Z"), intervalDays: 30 } };
  const cf = completionFallback(
    [{ deckId: "d1", quizPassedAt: "2026-10-18T00:00:00Z" }, { deckId: "d2", quizPassedAt: null }, { deckId: null, quizPassedAt: null }],
    cfDecks,
    cfReviews,
    rcNow
  );
  assertStrictEqual(`${cf.total},${cf.learned},${cf.mastered},${cf.learnedPct},${cf.masteredPct},${cf.chaptersPassed},${cf.chaptersTotal},${cf.done}`, "4,2,1,50,25,1,1,false", "Tiến độ dự phòng: học = có review, thuộc = khoảng ôn ≥ 21, floor %, chương qua = quizPassedAt; bộ thẻ đã xoá bỏ qua (cả trong số chương); bộ 1 thẻ chưa qua không ra được bài kiểm tra -> không vào số chương");
  // Như server: chương "trống" chưa qua (bộ đã xoá / bộ không còn thẻ) không có bài kiểm tra -> không vào chaptersTotal, để N/M tới được M/M;
  // chương qua rồi mới mất bộ thẻ vẫn đếm (passed ≤ total)
  const cfEmpty = completionFallback(
    [{ deckId: "d1", quizPassedAt: "2026-10-18T00:00:00Z" }, { deckId: "d0", quizPassedAt: null }, { deckId: null, quizPassedAt: "2026-10-19T00:00:00Z" }],
    [...cfDecks, { id: "d0", cards: [] }] as unknown as Parameters<typeof completionFallback>[1],
    cfReviews,
    rcNow
  );
  assertStrictEqual(`${cfEmpty.chaptersPassed}/${cfEmpty.chaptersTotal}`, "2/2", "Chương trống chưa qua không đếm; chương đã qua mà mất bộ thẻ vẫn đếm -> 2/2 đạt được");
  assertStrictEqual(`${completionFallback([], [], {}, rcNow).done},${completionFallback([{ deckId: "d2", quizPassedAt: null }], cfDecks, { e: rcReview("2026-10-13T00:00:00Z") }, rcNow).done}`, "false,true", "Không có thẻ -> chưa xong; học hết -> done (UI mời Hoàn thành)");
  const jobOf = (status: "DONE" | "RUNNING" | "FAILED", enriched: boolean, enrichReason: string) => ({
    status,
    stage: "DONE" as const,
    errorMessage: null,
    stats: { vocab: 0, grammar: 0, byLevel: {}, enriched, enrichReason },
  });
  assertStrictEqual(`${canReEnrichPath(jobOf("DONE", false, "quota"))},${canReEnrichPath(jobOf("DONE", false, "error"))},${canReEnrichPath(jobOf("DONE", false, "no_api_key"))},${canReEnrichPath(jobOf("RUNNING", false, "quota"))},${canReEnrichPath(jobOf("DONE", true, "quota"))},${canReEnrichPath(null)}`, "true,true,false,false,false,false", "Dịch lại nghĩa: chỉ khi job xong, chưa dịch được vì quota/lỗi (không phải thiếu khoá)");
  assertStrictEqual(`${enrichCooldownLeft("2026-10-19T10:00:00Z", Date.UTC(2026, 9, 19, 10, 2))},${enrichCooldownLeft("2026-10-19T10:00:00Z", Date.UTC(2026, 9, 19, 10, 6))},${enrichCooldownLeft(null, 0)},${enrichCooldownLeft("x", 0)}`, "180000,0,0,0", "Cooldown 5 phút kể từ enrichedAt; thiếu / hỏng -> 0 (cho gọi)");
  assertStrictEqual(`${formatCountdown(180000)},${formatCountdown(59_400)},${formatCountdown(0)},${formatCountdown(-5)}`, "3:00,1:00,0:00,0:00", "Đếm ngược m:ss, làm tròn lên giây");
  const spPath = { totalDays: 30, startDate: "2026-10-19", dailyCap: 50, studyDays: "1111111", reminder: false };
  assertStrictEqual(JSON.stringify(settingsPatch(spPath, { totalDays: 30, startDate: "2026-10-19", dailyCap: 50, studyDays: "1111111", reminder: false })), "{}", "Không đổi gì -> patch rỗng (không PATCH)");
  assertStrictEqual(JSON.stringify(settingsPatch(spPath, { totalDays: 40, startDate: "2026-10-19", dailyCap: 30, studyDays: "1111100", reminder: true })), '{"totalDays":40,"dailyCap":30,"studyDays":"1111100","reminder":true}', "Chỉ gửi trường đổi");
  assertStrictEqual(JSON.stringify(settingsPatch({ totalDays: 30, startDate: "2026-10-19" }, { totalDays: 30, startDate: "2026-10-20", dailyCap: 50, studyDays: "1111111", reminder: false })), '{"startDate":"2026-10-20"}', "Response 1.0 thiếu cap/mask/reminder: so với mặc định");
  // B4: nhắc qua email — chỉ gửi khi đổi; không truyền = không đụng tới; response cũ thiếu remindEmail = tắt
  assertStrictEqual(JSON.stringify(settingsPatch({ ...spPath, remindEmail: false }, { totalDays: 30, startDate: "2026-10-19", dailyCap: 50, studyDays: "1111111", reminder: false, remindEmail: true })), '{"remindEmail":true}', "Bật nhắc email -> chỉ gửi remindEmail");
  assertStrictEqual(JSON.stringify(settingsPatch({ ...spPath, remindEmail: true }, { totalDays: 30, startDate: "2026-10-19", dailyCap: 50, studyDays: "1111111", reminder: false, remindEmail: true })), "{}", "Nhắc email không đổi -> không gửi");
  assertStrictEqual(JSON.stringify(settingsPatch(spPath, { totalDays: 30, startDate: "2026-10-19", dailyCap: 50, studyDays: "1111111", reminder: false, remindEmail: false })), "{}", "Response thiếu remindEmail coi như tắt");
  // 24. Lộ trình 2.0 — sửa sau review: mốc xếp lại như server, dayIndexFor theo mặt nạ, dịch lại khi job FAILED, nhãn phiên, trần phản xạ
  // placeFrom: ngày nghỉ -> ngày học kế (chỉ số + 1); trước ngày 1 -> 1; đặt lại ngày bắt đầu = hôm nay -> 1 (được rút ngắn lộ trình)
  assertStrictEqual(`${replanFromDay("2026-10-19", "2026-10-23", MON_FRI)},${replanFromDay("2026-10-19", "2026-10-24", MON_FRI)},${replanFromDay("2026-10-19", "2026-10-26", MON_FRI)}`, "5,6,6", "Thứ 6 = ngày 5; Thứ 7 nghỉ -> xếp từ ngày 6 (server báo 400 nếu totalDays < 6); Thứ 2 = 6");
  assertStrictEqual(`${replanFromDay("2026-10-19", "2026-10-18")},${replanFromDay("2026-10-19", "2026-10-19")},${replanFromDay("2026-10-17", "2026-10-17", MON_FRI)}`, "1,1,1", "Trước ngày 1 hoặc đúng ngày bắt đầu -> 1 (kể cả bắt đầu vào ngày nghỉ)");
  assertStrictEqual(`${replanFromDay("", "2026-10-19", MON_FRI)},${replanFromDay("2026-10-19", "", MON_FRI)}`, "1,1", "Ngày hỏng (ô nhập đang gõ dở) -> 1, không treo");
  assertStrictEqual(`${Number.isNaN(dayIndexForMask("", "2026-10-19", MON_FRI).index)},${typeof dateForDay("", 2, MON_FRI)}`, "true,string", "Ngày bắt đầu hỏng: dayIndexForMask trả NaN, dateForDay không treo");
  assertStrictEqual(`${dayIndexFor("2026-10-16", d(2026, 10, 19), 30, MON_FRI)},${dayIndexFor("2026-10-16", d(2026, 10, 17), 30, MON_FRI)},${dayIndexFor("2026-10-19", d(2026, 10, 18), 30, MON_FRI)},${dayIndexFor("2026-10-19", d(2026, 12, 25), 10, MON_FRI)}`, "2,1,1,10", "dayIndexFor có mặt nạ: Thứ 2 sau Thứ 6 = ngày 2, Thứ 7 giữ ngày học cuối, kẹp 1..totalDays");
  assertStrictEqual(`${canReEnrichPath(jobOf("FAILED", false, "quota"))},${canReEnrichPath(jobOf("FAILED", false, "error"))},${canReEnrichPath(jobOf("FAILED", false, "no_api_key"))},${canReEnrichPath(jobOf("FAILED", true, "quota"))}`, "true,true,false,false", "Job lộ trình FAILED (dịch lại bị ngắt) vẫn cho Dịch lại nghĩa; vẫn đòi lý do quota/lỗi và chưa dịch được");
  assertStrictEqual(sessionCountsLabel({ new: 3, due: 2, catchup: 0, total: 10 }, 5), "Ôn 2 · Mới 3 · Luyện 5", "Phiên chương: thêm Luyện = thẻ đã học chưa đến hạn để cộng đủ số thẻ");
  assertStrictEqual(sessionCountsLabel({ new: 10, due: 5, catchup: 3, total: 18 }, 0), "Ôn 5 · Nợ 3 · Mới 10", "Không có thẻ luyện -> nhãn như cũ");
  assertStrictEqual(`${sessionDoneHeading(null)}|${sessionDoneHeading("today")}|${sessionDoneHeading("chapter")}|${sessionDoneHeading("catchup")}|${sessionDoneHeading("due")}`, "Xong phiên hôm nay 🎉|Xong phiên hôm nay 🎉|Xong phiên học chương 🎉|Xong phiên học bù 🎉|Xong phiên ôn thẻ đến hạn 🎉", "Tiêu đề kết thúc theo loại phiên; học bộ thẻ giữ câu cũ");
  assertStrictEqual(`${MAX_REACTION_MS},${clampReactionMs(MAX_REACTION_MS + 1)}`, "600000,600000", "Trần phản xạ một nguồn (lib/srs) = CHECK review_logs; kẹp đúng tại trần");

  // 25. E5 — chế độ chỉ nghe (audio-only)
  assertStrictEqual(`${shouldHideTerm(true, false)},${shouldHideTerm(true, true)},${shouldHideTerm(false, false)}`, "true,false,false", "Ẩn chữ chỉ khi chỉ nghe và chưa lật");
  assertStrictEqual(`${parseAudioMode("audio")},${parseAudioMode("read")},${parseAudioMode(null)},${parseAudioMode("x")}`, "true,false,null,null", "?mode=audio|read ghi đè; thiếu / lạ -> theo cài đặt");
  assertStrictEqual(`${readingDiffers("日本", "にほん")},${readingDiffers("ねこ", "ねこ")},${readingDiffers("日本", null)},${readingDiffers("ねこ", " ね こ ")}`, "true,false,false,false", "Chỉ đọc lại cách đọc khi khác thuật ngữ (bỏ khoảng trắng)");
  const sp = cardSpeechItems("日本", "にほん", "Nhật Bản\nにほんに いきます");
  assertStrictEqual(sp.map((i) => `${i.lang}:${i.text}`).join("|"), "ja-JP:日本|ja-JP:にほん|vi-VN:Nhật Bản", "Đọc: từ -> cách đọc -> dòng đầu nghĩa (tiếng Việt)");
  assertStrictEqual(`${sp[1].rate},${sp[0].rate}`, "0.85,undefined", "Cách đọc đọc chậm hơn; thuật ngữ tốc độ mặc định");
  assertStrictEqual(cardSpeechItems("ねこ", "ねこ", null).length, 1, "Kana thuần, chưa lật: chỉ đọc thuật ngữ");
  assertStrictEqual(`${meaningSpeechItems("").length},${meaningSpeechItems("\n\n  con mèo \nvd").map((i) => i.text).join()}`, "0,con mèo", "Nghĩa rỗng không đọc; lấy dòng không rỗng đầu tiên");

  // 26. F1 — bản đồ Hán–Việt: chuẩn hoá âm, đọc response, gom nhóm, bố cục toả tròn
  assertStrictEqual(normalizeHanVietQuery("  nhật   bản "), "NHẬT BẢN", "Chuẩn hoá âm: cắt / gộp khoảng trắng, viết hoa giữ dấu");
  assertStrictEqual(normalizeHanVietQuery("nhật"), "NHẬT", "NFC: dấu tổ hợp -> dựng sẵn");
  assertStrictEqual(`${firstHanVietReading("nhật bản")},${firstHanVietReading(null)},${hanVietMapUrl("")},${hanVietMapUrl("NHẬT BẢN")}`, "NHẬT,,null,/han-viet?reading=NH%E1%BA%ACT", "Âm đầu của từ -> link bản đồ; không có âm -> null");
  const rawGraph = {
    query: "NHẬT",
    nodes: [
      { id: "r:NHẬT", type: "reading", label: "NHẬT" },
      { id: "k:日", type: "kanji", label: "日", hanViet: "NHẬT", on: ["ニチ", "ジツ"], kun: ["ひ"], level: "N5", strokes: 4, radical: "日" },
      { id: "k:實", type: "kanji", label: "實", hanViet: "THẬT", on: [], kun: [], level: "N0", strokes: null, radical: null },
      { id: "w:日本", type: "word", label: "日本", reading: "にほん", meaning: "Nhật Bản", level: "N5", hanViet: "NHẬT BẢN" },
      { id: "w:毎日", type: "word", label: "毎日", reading: "まいにち", meaning: "mỗi ngày", level: "N5", hanViet: "MỖI NHẬT" },
      { id: "w:事實", type: "word", label: "事實", reading: "じじつ", meaning: "sự thật", level: null, hanViet: "SỰ THẬT" },
      { id: "w:日曜", type: "word", label: "日曜", reading: "にちよう", meaning: "chủ nhật", level: "N1", hanViet: "NHẬT DIỆU" },
      { id: "bad", type: "word" },
      { id: "w:日本", type: "word", label: "trùng id", reading: "", meaning: "", level: null, hanViet: "" },
    ],
    edges: [
      { from: "r:NHẬT", to: "k:日", type: "has_kanji" },
      { from: "k:日", to: "w:日本", type: "in_word" },
      { from: "w:毎日", to: "k:日", type: "has_kanji" },
      { from: "k:日", to: "w:日本", type: "in_word" },
      { from: "k:實", to: "w:事實", type: "in_word" },
      { from: "k:日", to: "w:日曜", type: "in_word" },
      { from: "k:日", to: "w:không-có" },
      { from: 1, to: "k:日" },
    ],
  };
  const hv = parseHanVietGraph(rawGraph);
  assertStrictEqual(`${hv.nodes.length},${hv.edges.length},${hv.query}`, "7,6,NHẬT", "Bỏ nút thiếu label, nút trùng id, cạnh trỏ tới nút không tồn tại / sai kiểu");
  const kHv = hv.nodes[2];
  assertStrictEqual(kHv.type === "kanji" ? `${kHv.level},${kHv.strokes},${kHv.radical},${kHv.on.length}` : "x", "null,null,null,0", "Cấp lạ -> null; thiếu số nét / bộ thủ -> null");
  assertStrictEqual(parseHanVietGraph(null).nodes.length + parseHanVietGraph("x").edges.length, 0, "Body hỏng -> đồ thị rỗng");
  assertStrictEqual(groupWordsByLevel(hv).map((b) => `${b.level}:${b.words.map((w) => w.label).join("+")}`).join("|"), "N5:日本+毎日|N1:日曜|unknown:事實", "Gom theo cấp N5 -> N1 -> chưa rõ, bỏ nhóm rỗng, giữ thứ tự response");
  assertStrictEqual(kanjiOfGraph(hv).map((k) => `${k.node.label}=${k.wordCount}:${k.words.map((w) => w.label).join("+")}`).join("|"), "日=3:日本+毎日+日曜|實=1:事實", "Đếm từ theo chữ bất kể chiều cạnh; cạnh trùng đếm một lần; từ theo thứ tự nút");
  const lay = radialLayout(hv, 720);
  assertStrictEqual(JSON.stringify(lay), JSON.stringify(radialLayout(parseHanVietGraph(rawGraph), 720)), "Bố cục xác định: cùng đồ thị -> cùng toạ độ");
  assertStrictEqual(`${lay["r:NHẬT"].x},${lay["r:NHẬT"].y}`, "360,360", "Âm ở tâm");
  assertStrictEqual(`${lay["k:日"].x},${lay["k:日"].y}|${lay["k:實"].x},${lay["k:實"].y}`, "360,201.6|360,518.4", "Chữ Hán trên vòng 1 (0.22 cạnh), chữ đầu ở đỉnh, rải đều");
  const dist = (p: { x: number; y: number }) => Math.round(Math.hypot(p.x - 360, p.y - 360));
  assertStrictEqual(`${dist(lay["w:日本"])},${dist(lay["w:毎日"])},${dist(lay["w:日曜"])},${dist(lay["w:事實"])}`, "288,288,288,288", "Từ ghép trên vòng 2 (0.4 cạnh)");
  assertStrictEqual(lay["w:日本"].y < 360 && lay["w:日曜"].y < 360 && lay["w:事實"].y > 360, true, "Từ xếp quạt quanh góc của chữ (chữ trên -> từ nửa trên; chữ dưới -> từ nửa dưới)");
  assertStrictEqual(Object.keys(lay).length, 7, "Mọi nút đều có toạ độ");
  assertStrictEqual(`${edgePath({ x: 0, y: 0 }, { x: 10, y: 0 })}|${edgePath({ x: 3, y: 4 }, { x: 3, y: 4 })}`, "M0 0 Q5 1.2 10 0|M3 4", "Đường nối cong nhẹ; hai điểm trùng chỉ có M");
  assertStrictEqual(`${pillWidth("日本")},${pillWidth("")},${pillWidth("図書館", 20, 10)}`, "44,28,70", "Bề rộng viên nhãn theo số ký tự, tối thiểu 28");
  assertStrictEqual(graphSummary(hv), "Mạng lưới âm NHẬT: 2 chữ Hán, 4 từ ghép", "Tóm tắt cho aria-label SVG");
  assertStrictEqual(parseHanVietSuggestions({ items: [{ reading: "NHẬT", count: 3, kanji: ["日", 1] }, { reading: "" }, "x"] }).map((s) => `${s.reading}:${s.count}:${s.kanji.join("")}`).join(), "NHẬT:3:日", "Gợi ý: bỏ mục hỏng, chỉ giữ chữ dạng chuỗi");
  const wNode = { id: "w:日本", type: "word" as const, label: "日本", reading: "にほん", meaning: "Nhật Bản", level: "N5", hanViet: "NHẬT BẢN" };
  assertStrictEqual(JSON.stringify(wordToCardDto(wNode)), '{"term":"日本","reading":"にほん","meaning":"Nhật Bản","hanViet":"NHẬT BẢN","level":"N5","kind":"vocab"}', "Từ ghép -> CardDto đủ metadata (addCard)");
  assertStrictEqual(`${wordToCardDto({ ...wNode, meaning: " " })?.meaning},${wordToCardDto({ ...wNode, meaning: "", hanViet: "", reading: "" })}`, "NHẬT BẢN,null", "Thiếu nghĩa -> dùng âm Hán-Việt; không còn gì -> null");

  // Insights — điểm yếu, bổ khuyết, "Học gì tiếp", phản xạ chậm (lib/insightUtils.ts)
  const wk = parseWeaknesses({
    total: 9,
    cards: [
      { cardId: "c1", deckId: "d1", deckTitle: "Bài 1", term: "学生", reading: "がくせい", meaning: "học sinh\nví dụ", level: "N5", kind: "vocab", reasons: ["lapses", "slow", "bogus"], againCount: 4, intervalDays: 1, quizWrong: 0 },
      { cardId: "c2", deckId: "d1", term: "〜ながら", meaning: "vừa… vừa…", kind: "grammar", reasons: ["quiz_wrong"], againCount: 0, quizWrong: 3, ease: 1.5 },
      { cardId: 3, term: "x" },
      "bad",
    ],
    groups: { level: [{ key: "N5", count: 1 }, { key: "Khác", count: 1 }], kind: [{ key: "vocab", count: 1 }, { key: "grammar", count: 1 }], deck: [{ key: "d1", title: "Bài 1", count: 2 }], kanji: "x" },
    canRemedial: true,
    suggestedDays: 45,
  });
  assertStrictEqual(`${wk.total},${wk.cards.length},${wk.canRemedial},${wk.suggestedDays}`, "9,2,true,30", "Điểm yếu: bỏ thẻ hỏng, suggestedDays kẹp 3..30");
  const [wk1, wk2] = wk.cards;
  assertStrictEqual(`${wk1.reasons.join("+")}|${wk1.ease}|${wk1.medianReactionMs}|${wk2.reading}|${wk2.level}|${wk2.deckTitle}|${wk2.ease}`, "lapses+slow|null|null|null|null|null|1.5", "NON_NULL: trường thiếu -> null; lý do lạ bị bỏ");
  assertStrictEqual(`${wk.groups.kanji.length},${wk.groups.level.map((g) => g.key).join()}`, "0,N5,Khác", "Nhóm hỏng -> rỗng; giữ thứ tự server");
  assertStrictEqual(parseWeaknesses(null).suggestedDays + parseWeaknesses({ suggestedDays: 1 }).suggestedDays, 10, "Thiếu gợi ý -> 7 ngày; dưới 3 -> 3");
  assertStrictEqual(reasonCounts(wk.cards).map((r) => `${r.reason}:${r.count}`).join(), "lapses:1,slow:1,quiz_wrong:1", "Đếm lý do theo thứ tự cố định, bỏ lý do 0 thẻ");
  assertStrictEqual(
    [groupLabel("kind", { key: "grammar", title: null }), groupLabel("kind", { key: "vocab", title: null }), groupLabel("deck", { key: "d1", title: " " }), groupLabel("deck", { key: "d1", title: "Bài 1" }), groupLabel("kanji", { key: "学", title: null })].join(),
    "Ngữ pháp,Từ vựng,Bộ thẻ,Bài 1,学",
    "Nhãn nhóm: loại dịch tiếng Việt, bộ thẻ lấy tên"
  );
  assertStrictEqual([3, 30, 2, 31, 5.5, NaN].map(isValidRemedialDays).join(), "true,true,false,false,false,false", "Số ngày bổ khuyết: số nguyên 3..30");
  assertStrictEqual(`${defaultRemedialDays(6.4)},${defaultRemedialDays(undefined)},${defaultRemedialDays(99)}`, "6,7,30", "Số ngày mặc định của modal bổ khuyết");
  const ns = parseNextSteps([
    { kind: "path_today", title: "N5", count: 12, to: "/session?session=today&path=p1" },
    { kind: "remedial", title: "", count: 9, to: "/roadmap?remedial=1" },
    { kind: "library", title: "Bộ X", count: 30, to: "https://evil.example" },
    { kind: "due", title: "Ôn", count: 3, to: "//evil.example" },
    { kind: "weird", title: "?", count: 1, to: "/" },
    null,
  ]);
  assertStrictEqual(ns.map((s) => `${s.kind}:${s.title}:${s.to}`).join("|"), "path_today:N5:/session?session=today&path=p1|remedial:Bổ khuyết điểm yếu:/roadmap?remedial=1|library:Bộ X:/|due:Ôn:/", "Học gì tiếp: bỏ loại lạ, tiêu đề trống -> nhãn loại, link ra ngoài -> /");
  assertStrictEqual(`${nextStepCountLabel({ kind: "catchup", count: 3 })},${nextStepCountLabel({ kind: "remedial", count: 9 })},${nextStepCountLabel({ kind: "due", count: -2 })}`, "3 thẻ nợ,9 thẻ yếu,0 thẻ", "Nhãn số thẻ theo loại gợi ý");
  assertStrictEqual(`${safeInternalPath("/decks")},${safeInternalPath("/\\evil")},${safeInternalPath("javascript:alert(1)")},${safeInternalPath(5)}`, "/decks,/,/,/", "Chỉ nhận đường dẫn nội bộ");
  const fr = parseFriction({ personalMedianMs: 2100, cards: [{ cardId: "a", term: "猫", deckId: "d", meaning: "mèo", medianReactionMs: 6300, samples: 6, ratio: 3 }, { cardId: "b" }] });
  assertStrictEqual(`${fr.personalMedianMs},${fr.cards.length},${fr.cards[0].reading},${fr.cards[0].ratio}`, "2100,1,null,3", "Phản xạ chậm: bỏ thẻ thiếu term, reading thiếu -> null");
  assertStrictEqual(`${parseFriction({ personalMedianMs: 0 }).personalMedianMs},${parseFriction(undefined).cards.length}`, "null,0", "Trung vị cá nhân 0 / thiếu -> null (chưa đo)");
  assertStrictEqual([formatSeconds(4200), formatSeconds(12345), formatSeconds(null), formatSeconds(-1), formatRatio(2.5), formatRatio(3), formatRatio(null)].join("|"), "4,2 s|12,3 s|—|—|×2,5|×3,0|—", "Định dạng giây / tỉ lệ kiểu Việt");
  assertStrictEqual(parseProfileTab("friction"), "friction", "Tab Phản xạ chậm hợp lệ từ URL");

  // Chữ Hán & bộ thủ (lib/kanjiUtils.ts)
  const kc = parseKanjiCards({
    items: [
      {
        kanji: "学", hanViet: "HỌC", radical: { no: 39, strokes: 3 }, meaningEn: "study", strokeCount: 8,
        on: [{ reading: "ガク", examples: [{ term: "学生", reading: "がくせい", meaning: "student", level: "N5" }, { term: "大学", reading: "だいがく", meaning: "university", level: "N5" }, { term: "bad", level: "N9" }, { reading: "x" }] }, { reading: "", examples: [] }],
        kun: [{ reading: "まな", okurigana: "ぶ", examples: [{ term: "学ぶ", reading: "まなぶ", meaning: "to learn", level: "N4" }] }],
      },
      { kanji: "学" },
      { kanji: "々", on: [], kun: [] },
      { hanViet: "X" },
    ],
  });
  assertStrictEqual(`${kc.length},${kc[0].on.length},${kc[0].on[0].examples.length},${kc[0].on[0].examples[2].level},${kc[0].radical?.no},${kc[1].hanViet}`, "2,1,3,null,39,null", "Thẻ chữ Hán: bỏ chữ trùng / thiếu, cách đọc rỗng, ví dụ thiếu term; cấp lạ -> null");
  const oc = onKunDeckCards(kc);
  assertStrictEqual(oc.map((c) => `${c.term}|${c.reading}|${c.level}|${c.hanViet}`).join(" / "), "学|ガク|N5|HỌC / 学|まなぶ|N4|HỌC", "Bộ On/Kun: hai thẻ mỗi chữ, reading là kana thật của âm chính (Kun: gốc + okurigana, không dấu chấm); cấp = cấp dễ nhất trong ví dụ của thẻ");
  assertStrictEqual(oc[0].meaning, "HỌC – study\nÂm On: ガク\n学生 (がくせい): student [N5]\n大学 (だいがく): university [N5]\nbad", "Mặt sau: dòng đầu Hán-Việt + nghĩa (đáp án quiz), dòng hai nhãn Âm On, sau đó từ ví dụ");
  assertStrictEqual(oc[1].meaning, "HỌC – study\nÂm Kun: まな.ぶ\n学ぶ (まなぶ): to learn [N4]", "Thẻ Kun: nhãn Âm Kun ở mặt sau, chỉ mang ví dụ âm Kun");
  // Chữ chỉ có âm On / chỉ có âm Kun -> đúng một thẻ; chữ không có dữ liệu gì -> không thẻ, không lọt vào tiêu đề bộ.
  const onKunOnly = onKunDeckCards(
    parseKanjiCards({
      items: [
        { kanji: "茶", hanViet: "TRÀ", meaningEn: "tea", on: [{ reading: "チャ", examples: [] }, { reading: "サ", examples: [] }], kun: [] },
        { kanji: "畑", meaningEn: "field", on: [], kun: [{ reading: "はたけ", okurigana: "", examples: [] }, { reading: "はた" }] },
        { kanji: "丼", on: [], kun: [] },
      ],
    })
  );
  assertStrictEqual(onKunOnly.map((c) => `${c.term}|${c.reading}|${c.meaning.replace(/\n/g, "¶")}`).join(" / "), "茶|チャ|TRÀ – tea¶Âm On: チャ、サ / 畑|はたけ|field¶Âm Kun: はたけ、はた", "Chỉ On / chỉ Kun -> một thẻ mỗi chữ, các âm khác ở dòng hai mặt sau");
  assertStrictEqual(onKunDeckTitle([...new Set(onKunOnly.map((c) => c.term))]), "Chữ Hán On/Kun: 茶・畑", "Tiêu đề bộ On/Kun chỉ nêu chữ có thẻ (KanjiLookupTab)");
  assertStrictEqual(`${extractKanji("").length},${extractKanji("がっこう abc 々〆〇").length}`, "0,0", "Không có chữ Hán (rỗng / kana / Latin / 々〆〇) -> []");
  // Giới hạn cột DeckRequest (@Size đếm đơn vị UTF-16): meaning 2000, reading 200, hanViet 100, title 200.
  const longCard = onKunDeckCards(
    parseKanjiCards({ items: [{ kanji: "学", hanViet: "H".repeat(150), meaningEn: "m".repeat(5000), on: [{ reading: "ア".repeat(300) }], kun: [] }] })
  )[0];
  assertStrictEqual(
    [longCard.meaning.length, longCard.meaning.endsWith("…"), longCard.reading?.length, longCard.reading?.endsWith("…"), longCard.hanViet?.length, longCard.hanViet?.endsWith("…")].join(),
    "2000,true,200,true,100,true",
    "Cắt meaning / reading / hanViet đúng giới hạn, kết thúc bằng …"
  );
  const wideMeaning = onKunDeckCards(parseKanjiCards({ items: [{ kanji: "叱", meaningEn: "𠮟".repeat(2000), on: [{ reading: "シツ" }], kun: [] }] }))[0].meaning;
  assertStrictEqual(
    `${wideMeaning.length <= 2000},${wideMeaning.endsWith("…")},${Array.from(wideMeaning).every((cp) => cp.length === 2 || !/[\uD800-\uDFFF]/.test(cp))}`,
    "true,true,true",
    "Chữ ngoài BMP (2 đơn vị UTF-16) vẫn ≤ 2000 theo @Size và không tách đôi cặp surrogate"
  );
  assertStrictEqual(JSON.stringify(onKunDeckCards(parseKanjiCards({ items: [{ kanji: "丶", hanViet: "CHỦ", on: [], kun: [] }] }))), '[{"term":"丶","hanViet":"CHỦ","kind":"vocab","reading":null,"meaning":"CHỦ","level":null}]', "Không có âm On/Kun nhưng có Hán-Việt -> một thẻ không cách đọc");
  assertStrictEqual(`${easiestLevel(["N3", null, "N4", "x"])},${easiestLevel([])}`, "N4,null", "Cấp dễ nhất (N5 dễ nhất), bỏ giá trị lạ");
  assertStrictEqual(`${kanjiHeadline("学", null, null)}|${exampleLine({ term: "ねこ", reading: "ねこ", meaning: null, level: null })}|${kunLabel({ reading: "まな", okurigana: "" })}`, "Chữ 学|ねこ|まな", "Nhãn: thiếu nghĩa -> 'Chữ X'; cách đọc trùng chữ không lặp; kun không okurigana");
  assertStrictEqual(`${onKunDeckTitle(["学", "生"])}|${onKunDeckTitle(Array.from("一二三四五六七八九十百千"))}`, "Chữ Hán On/Kun: 学・生|Chữ Hán On/Kun: 一・二・三・四・五・六・七・八・九・十…", "Tiêu đề bộ On/Kun: tối đa 10 chữ");
  const rads = parseRadicals({ items: [{ no: 85, char: "⽔", unified: "水", strokes: 4, nameVi: "thủy", meaningVi: "nước", hanViet: "THỦY" }, { no: 1, char: "⼀", unified: "一", strokes: 1, nameVi: "nhất", meaningVi: "một", hanViet: "NHẤT" }, { no: "x" }] });
  assertStrictEqual(`${rads.map((r) => r.no).join()}|${radicalStrokeOptions(rads).join()}`, "1,85|1,4", "Bảng bộ thủ: bỏ dòng hỏng, sắp theo số bộ; chip số nét tăng dần");
  const water = rads[1];
  assertStrictEqual(["thuy", "NƯỚC", "85", "8", "水", "⽔", "", "lửa"].map((q) => radicalMatches(water, q)).join(), "true,true,true,false,true,true,true,false", "Tìm bộ thủ: bỏ dấu, số bộ khớp đúng, chữ bộ hoặc dạng thường");
  assertStrictEqual(["85", " 7 ", "0", "215", "abc", null].map(parseRadicalNo).join(), "85,7,,,,", "?r=: chỉ nhận 1..214");
  const rk = parseRadicalKanji({ radical: { no: 85, char: "水", nameVi: "thủy", meaningVi: "nước", hanViet: "THỦY" }, levels: ["N5", "N9"], items: [{ kanji: "海", level: "N5", strokeCount: 9 }, { kanji: "海" }, { kanji: "池", level: "N9" }, {}] });
  assertStrictEqual(`${rk.radical?.no}|${rk.levels?.join()}|${rk.items.map((i) => `${i.kanji}:${i.level}`).join()}`, "85|N5|海:N5,池:null", "Chữ theo bộ: bỏ trùng / thiếu chữ; cấp lạ -> null");
  const many = Array.from({ length: 35 }, (_, i) => ({ kanji: String.fromCodePoint(0x4e00 + i) }));
  assertStrictEqual(`${radicalCardTargets(many, new Set()).length},${radicalCardTargets(many, new Set(["一", "x"])).join()}`, "30,一", "Thẻ bộ thủ: chưa chọn -> 30 chữ đầu; đã chọn -> chỉ chữ chọn còn trong danh sách");
  assertStrictEqual(radicalCardTargets([{ kanji: "濃" }, { kanji: "渦" }], new Set(["海"])).join(), "濃,渦", "Chữ đã chọn bị bộ lọc cấp ẩn hết -> dùng danh sách đang hiện, không rơi về 0 chữ");
  const rcRad = { no: 85, char: "水", nameVi: "thủy", meaningVi: "nước", hanViet: "THỦY" };
  const rc = parseRadicalCards({
    items: [
      { kanji: "海", hanViet: "HẢI", meaningEn: "sea", strokeCount: 9, radical: rcRad, mnemonicVi: "Nước mênh mông là biển.", mnemonicSource: "template", examples: [{ term: "海", reading: "うみ", meaning: "sea", level: "N5" }] },
      { kanji: "池", hanViet: "TRÌ", meaningEn: "pond", radical: rcRad, mnemonicVi: null, mnemonicSource: null, examples: [] },
      { kanji: "一", hanViet: "NHẤT", meaningEn: "one", radical: null, mnemonicSource: "gemini", examples: [] },
    ],
    groups: [{ radical: rcRad, kanji: ["海", "池", "湖"] }, { radical: null, kanji: ["一"] }],
    reason: "quota",
  });
  assertStrictEqual(`${rc.items.length},${rc.items[2].mnemonicSource},${rc.groups.map((g) => g.kanji.join("")).join("|")},${rc.reason}`, "3,null,海池|一,quota", "Thẻ bộ thủ: nguồn mẹo chỉ giữ khi có mẹo; nhóm chỉ giữ chữ có thẻ");
  const rd = radicalDeckCards(rc);
  assertStrictEqual(rd.map((d) => `${d.title}#${d.level}#${d.cards.length}`).join(" / "), "Bộ thủ 水 THỦY (nước): 海・池#N5#2 / Chữ Hán chưa rõ bộ thủ: 一#null#1", "Một bộ thẻ mỗi nhóm bộ thủ, cấp = cấp dễ nhất");
  assertStrictEqual(rd[0].cards[0].meaning, "HẢI – sea\nBộ thủ: 水 (THỦY – nước)\nMẹo nhớ: Nước mênh mông là biển.\n海 (うみ): sea [N5]", "Mặt sau thẻ bộ thủ: Hán-Việt + nghĩa, bộ thủ, mẹo nhớ, ví dụ");
  assertStrictEqual(`${rd[0].cards[1].meaning}|${rd[1].cards[0].meaning}`, "TRÌ – pond\nBộ thủ: 水 (THỦY – nước)|NHẤT – one", "Không mẹo / không bộ thì bỏ dòng đó");
  assertStrictEqual(parseRadicalCards({ items: [{ kanji: "海", radical: { no: 85, char: "水" } }, { kanji: "一" }] }).groups.map((g) => `${g.radical?.no ?? "-"}:${g.kanji.join("")}`).join(), "85:海,-:一", "Thiếu groups -> tự gom theo bộ của thẻ");
  assertStrictEqual(
    `${rd.map((d) => d.hasMnemonic).join()}|${radicalDeckDescription(rd[0])}|${radicalDeckDescription({ radical: rcRad, hasMnemonic: false })}|${radicalDeckDescription(rd[1])}`,
    "true,false|Thẻ bộ thủ 水 (THỦY – nước): Hán-Việt, nghĩa, mẹo nhớ và từ ví dụ JLPT.|Thẻ bộ thủ 水 (THỦY – nước): Hán-Việt, nghĩa và từ ví dụ JLPT.|Thẻ chữ Hán chưa tra được bộ thủ: Hán-Việt, nghĩa và từ ví dụ JLPT.",
    "Mô tả bộ thẻ bộ thủ chỉ nhắc mẹo nhớ khi có thẻ mang mẹo"
  );
  const dupGroup = radicalDeckCards(parseRadicalCards({ items: [{ kanji: "海", meaningEn: "sea" }], groups: [{ radical: rcRad, kanji: ["海", "海"] }] }));
  assertStrictEqual(`${dupGroup.length},${dupGroup[0].cards.length}`, "1,1", "Nhóm lặp chữ -> một thẻ, không nhân đôi");
  const longRad = radicalDeckCards(parseRadicalCards({ items: [{ kanji: "海", meaningEn: "sea" }], groups: [{ radical: { ...rcRad, meaningVi: "n".repeat(300) }, kanji: ["海"] }] }))[0];
  assertStrictEqual(`${longRad.title.length <= 200},${longRad.title.endsWith("…")}`, "true,true", "Tiêu đề bộ thẻ bộ thủ ≤ 200");
  assertStrictEqual(`${mnemonicSourceLabel("template")}|${mnemonicSourceLabel(null)}|${mnemonicReasonLabel(null)}|${!!mnemonicReasonLabel("quota")}|${radicalLabel({ char: "水", hanViet: "THỦY", meaningVi: "" })}`, "Mẹo gợi ý tự động|null|null|true|水 (THỦY)", "Nhãn nguồn mẹo / lý do / bộ thủ");

  // Cấu hình hệ thống G5 (features/admin/settingsUtils.ts)
  const oldKeys = { extraction_daily_limit_free: 3, extraction_daily_limit_premium: 50, announcement: "", registration_open: true, updatedAt: "2026-10-19T00:00:00Z" };
  const legacy = normalizeAdminSettings(oldKeys);
  assertStrictEqual(`${hasAllExtras(legacy.settings)}|${Object.keys(buildSettingsPayload(legacy.settings)).join()}`, "false|extraction_daily_limit_free,extraction_daily_limit_premium,announcement,registration_open", "Backend cũ: PUT chỉ gửi 4 khoá, không gửi updatedAt");
  const newKeys = { learning_path_daily_cap_default: 50, learning_path_quiz_pass_pct: 80, learning_path_reminder_hour: 7, ocr_fallback_confidence: 0.85, ocr_low_line_confidence: 0.75, distractor_min_confidence: 0.6, contradiction_alert_threshold: 0.7, ai_model_primary: "", email_verification_required: false };
  const full = normalizeAdminSettings({ ...oldKeys, ...newKeys });
  assertStrictEqual(`${hasAllExtras(full.settings)},${full.camelExtras},${Object.keys(buildSettingsPayload(full.settings)).length}`, "true,false,13", "Đủ khoá mới -> PUT gửi đủ 13 khoá (snake_case như khoá cũ)");
  assertStrictEqual(Object.keys(buildSettingsPayload(normalizeAdminSettings({ ...oldKeys, learning_path_daily_cap_default: 50 }).settings)).length, 4, "Thiếu một khoá mới -> vẫn chỉ 4 khoá cũ");
  const camelRaw = Object.fromEntries(Object.entries(newKeys).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]));
  const camel = normalizeAdminSettings({ ...oldKeys, ...camelRaw, aiModelPrimary: " gemini-2.5-flash " });
  const camelBody = buildSettingsPayload(camel.settings, camel.camelExtras) as unknown as Record<string, unknown>;
  assertStrictEqual(`${camel.camelExtras},${camelBody.learningPathDailyCapDefault},${"learning_path_daily_cap_default" in camelBody},${camelBody.aiModelPrimary},${camelBody.extraction_daily_limit_free}`, "true,50,false,gemini-2.5-flash,3", "Server trả camelCase -> PUT gửi lại đúng tên đó; model cắt khoảng trắng");
  const fieldOf = (key: string) => SETTINGS_NUMBER_FIELDS.find((f) => f.key === key)!;
  const ocrF = fieldOf("ocr_fallback_confidence");
  const passF = fieldOf("learning_path_quiz_pass_pct");
  assertStrictEqual([parseSettingNumber(ocrF, "0,85"), parseSettingNumber(ocrF, "1.2"), parseSettingNumber(ocrF, ""), parseSettingNumber(passF, "79.5"), parseSettingNumber(passF, "50"), parseSettingNumber(passF, "49")].join(), "0.85,,,,50,", "Ô số: nhận dấu phẩy; ngoài khoảng / số lẻ ở khoá nguyên -> null");
  assertStrictEqual(`${settingNumberError(fieldOf("learning_path_daily_cap_default"), "4")}|${settingNumberError(ocrF, "0.5")}`, "Nhập số nguyên từ 5 đến 200.|null", "Câu lỗi theo khoảng của khoá");
  assertStrictEqual([1000, 1001, 1.5, 0].map(isValidExtractionLimit).join(), "true,false,false,true", "Hạn mức bóc tách: số nguyên 0..1000");
  // Model AI chính: ai-service lặng lẽ bỏ tên ngoài danh sách -> trang phải cảnh báo, không để Admin tưởng model đã gõ đang chạy
  const models = { default: "gemini-3.8-flash", allowed: ["gemini-3.8-flash", "gemini-3.7-flash"] };
  const hintOf = (v: string, m: Parameters<typeof aiModelHint>[1]) => {
    const h = aiModelHint(v, m);
    return h ? `${h.tone}:${h.text}` : "null";
  };
  assertStrictEqual(hintOf("Gemini 2.5 Pro", models), 'warn:ai-service không nhận "Gemini 2.5 Pro" — mọi lượt gọi vẫn dùng gemini-3.8-flash. Chọn một tên trong danh sách gợi ý.', "Model AI chính: tên ngoài danh sách -> cảnh báo nói rõ model thật đang chạy");
  assertStrictEqual(aiModelHint(" Gemini-3.7-Flash ", models)?.tone, "muted", "Model AI chính: cùng tên khác hoa thường / khoảng trắng -> ai-service nhận (như resolve_model)");
  assertStrictEqual(hintOf("", models), "muted:Đang dùng model mặc định của ai-service: gemini-3.8-flash.", "Model AI chính: để trống -> nói model mặc định");
  assertStrictEqual(`${hintOf("gemini-2.5-pro", undefined)}|${hintOf("", null)}`, "null|null", "Model AI chính: đang tải danh sách / ô trống mà không kiểm tra được -> không nhắc");
  assertStrictEqual(aiModelHint("gemini-2.5-pro", null)?.text.startsWith("Chưa kiểm tra được với ai-service"), true, "Model AI chính: ai-service tắt -> nói chưa kiểm tra được, không khẳng định model chạy");
  assertStrictEqual(aiModelHint("x", { default: null, allowed: [] })?.tone, "muted", "Model AI chính: danh sách rỗng = chưa kiểm tra được");

  // Hợp đồng API đợt 2 (scripts/selfcheck/*.ts): mỗi hàm nhận assert(cond, msg) và tự chạy phần của lane mình.
  const assertTrue = (cond: boolean, msg: string) => assertStrictEqual(cond, true, msg);
  runAdminChecks(assertTrue);
  runQuizChecks(assertTrue);
  runPracticeChecks(assertTrue);
  runLearnerChecks(assertTrue);
  runManualChecks(assertTrue);
  await runLearningPathChecks(assertTrue);
  runStudyChecks(assertTrue);
  runDictionaryChecks(assertTrue);
  runDeckShareChecks(assertTrue);
  runQa2710Checks(assertTrue);
  runDiagramChecks(assertTrue);
  runDateFileChecks(assertTrue);
  runModerationChecks(assertTrue);
  runLibraryChecks(assertTrue);
  assertStrictEqual(parseProfileTab("practice"), "practice", "Tab Luyện tập hợp lệ từ URL");

  // Báo cáo của tôi (UC-41): tab trên URL + câu kết quả nói với người gửi + thông báo dẫn về tab
  assertStrictEqual(parseProfileTab("reports"), "reports", "Tab Báo cáo của tôi hợp lệ từ URL");
  assertStrictEqual(myReportOutcome("OPEN", null), null, "Báo cáo đang mở chưa có kết quả");
  assertStrictEqual(myReportOutcome("DISMISSED", null), "Đã xem xét, không phát hiện vi phạm.", "Bỏ qua = không vi phạm");
  assertStrictEqual(myReportOutcome("RESOLVED", "UNPUBLISH_DECK"), "Bộ thẻ đã bị gỡ khỏi Thư viện.", "Gỡ bộ thẻ");
  assertStrictEqual(myReportOutcome("RESOLVED", "NONE"), "Đã xem xét và xử lý.", "NONE không hiện 'Không làm gì'");
  assertStrictEqual(
    describeNotification({ id: 2, type: "REPORT_RESOLVED", payload: { deckId: "d1", deckTitle: "A", status: "RESOLVED", action: "UNPUBLISH_DECK" }, readAt: null, createdAt: "2026-10-25T00:00:00Z" }).to,
    "/profile?tab=reports",
    "Thông báo kết quả báo cáo mở tab Báo cáo của tôi (bộ thẻ có thể đã bị gỡ)"
  );

  console.log(" All self-check assertions passed successfully!");
}

runSelfCheck();
