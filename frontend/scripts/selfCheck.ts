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
import {
  calcLearningStats,
  calcQuizAccuracy,
  calcStreaks,
  dayKey,
  lastReviewedAt,
} from "../src/lib/learningStats.ts";
import { flattenFolders } from "../src/features/folders/components/folderTree.ts";
import { getInitials, isValidDailyGoal, parseProfileTab, scoreTone } from "../src/features/profile/lib/profileUtils.ts";

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

  console.log(" All self-check assertions passed successfully!");
}

runSelfCheck();
