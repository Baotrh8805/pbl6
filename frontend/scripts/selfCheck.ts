// Chạy: node scripts/selfCheck.ts (Node 22.6+ tự bỏ type). Không nằm trong src/ để không vào bundle.
import { extractErrorMessage } from "../src/services/apiClient.ts";
import { isDue, parseReviews } from "../src/lib/srs.ts";
import {
  calcDeckProgress,
  canEditDeck,
  deckSourceLabel,
  moveTargets,
  secondsLeft,
  sortDecksByLevel,
} from "../src/lib/deckUtils.ts";
import { categoryLabel, formatCompactCount } from "../src/features/library/components/libraryOptions.ts";
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
import { getInitials, isValidDailyGoal, parseProfileTab, scoreTone } from "../src/features/profile/lib/profileUtils.ts";
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
  pathProgress,
  rangeCram,
  scheduledUpTo,
  sliceRange,
  tasksForDay,
  todayCardCount,
  unreviewedInTasks,
} from "../src/features/roadmap/roadmapUtils.ts";
import { atLeast, homeFor, isStaff, setupPending } from "../src/lib/roles.ts";
import {
  niceTicks,
  buildLinePath,
  periodDelta,
  indexAtX,
  summarizeJson,
  stringToHslColor,
  stringToTextColor,
} from "../src/features/admin/adminUtils.ts";

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
  assertStrictEqual(categoryLabel("kanji"), "🈯 Kanji Hán tự", "Mã chủ đề -> nhãn");
  assertStrictEqual(categoryLabel(null), null, "Không có chủ đề -> null");
  assertStrictEqual(deckSourceLabel({ access: "owner", visibility: "public" }), "Cá nhân", "Chủ bộ thẻ");
  assertStrictEqual(deckSourceLabel({ access: "viewer", visibility: "public" }), "Thư viện", "Bộ public của người khác");
  assertStrictEqual(deckSourceLabel({ access: "editor", visibility: "private" }), "Được chia sẻ", "Được chia sẻ quyền sửa");
  assertStrictEqual(canEditDeck({ access: "viewer" }), false, "Người xem không sửa được");
  assertStrictEqual(canEditDeck({ access: "editor" }), true, "Người được chia sẻ quyền sửa");

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
  const rmProg = pathProgress([rmA, { ...rmB, deckId: "gone" }, rmC], rmDecks, rmReviews, rmNow);
  assertStrictEqual(
    `${rmProg.total},${rmProg.mastered},${rmProg.pct},${rmProg.missingDecks}`,
    "4,1,25,1",
    "Tiến độ lộ trình: chương mất bộ thẻ tính missingDecks, deckId null bỏ qua"
  );
  assertStrictEqual(chapterProgress({ deckId: "gone" }, rmDecks, rmReviews, rmNow), null, "Bộ thẻ không còn");
  assertStrictEqual(chapterProgress({ deckId: null }, rmDecks, rmReviews, rmNow), null, "Chương không có bộ thẻ");
  const rmBehind = [{ ...rmA, deckId: "d1", cardCount: 4, dayFrom: 1, dayTo: 2, perDay: 2 }];
  assertStrictEqual(behindCount(rmBehind, 2, rmDecks, { c1: rmReviews.c1 }), 1, "Hết ngày 1 có c1,c2; c2 chưa ôn");
  assertStrictEqual(behindCount(rmBehind, 1, rmDecks, { c1: rmReviews.c1 }), 0, "Ngày 1 chưa có gì trễ");
  assertStrictEqual(behindCount(rmBehind, 5, rmDecks, { c1: rmReviews.c1 }), 3, "Sau chương: 3 thẻ chưa ôn");
  assertStrictEqual(
    unreviewedInTasks([{ chapterId: "c1", deckId: "d1", fromPos: 1, toPos: 4 }], rmDecks, { c1: rmReviews.c1 }),
    3,
    "Thẻ chưa ôn trong việc hôm nay"
  );
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

  console.log(" All self-check assertions passed successfully!");
}

runSelfCheck();
