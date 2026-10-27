// Self-check các lỗi phát hiện khi kiểm tay trên trình duyệt (LC-*, LP-*, STAFF-*). scripts/selfCheck.ts gọi
// runManualChecks(assert). Chỉ hàm thuần; import tương đối + đuôi .ts để node chạy trực tiếp (--experimental-strip-types).
import { extractErrorMessage, stripFieldPrefixes } from "../../src/services/apiClient.ts";
import { findCardByTerm } from "../../src/lib/deckUtils.ts";
import {
  categoryLabel,
  categoryShortLabel,
  isSearchShortcut,
  searchShortcutLabel,
} from "../../src/features/library/components/libraryOptions.ts";
import { assumeKnownScope } from "../../src/features/extraction/iPlusOneUtils.ts";
import { recheckResultText } from "../../src/features/extraction/conflictUtils.ts";
import {
  MORE_NODE_PREFIX,
  capGraphWords,
  kanjiOfGraph,
  parseHanVietGraph,
  radialLayout,
  wordCapPerKanji,
  wordNodesOf,
} from "../../src/lib/hanVietUtils.ts";
import { QUIZ_SIZE_OPTIONS, quizSizeNote, quizSizeOptionLabel } from "../../src/features/quiz/quizUtils.ts";
import {
  activateBlockReason,
  behindMessage,
  canMergeIntoPrevious,
  capFieldError,
  chapterLayoutKey,
  daysFieldError,
  enrichNoticeReason,
  isAutoDayChapterTitle,
  pathStatusLabel,
  todayNewTasksLine,
} from "../../src/features/roadmap/roadmapUtils.ts";
import { PASSWORD_POLICY_MESSAGE, passwordChangeError } from "../../src/lib/passwordRules.ts";
import { STAFF_ACCOUNT_PATH, staffRedirectFor } from "../../src/lib/roles.ts";
import {
  AUDIT_RANGE_ERROR,
  INCOMPLETE_DATE_ERROR,
  PREMIUM_UNTIL_MAX,
  STAFF_ROLE_FILTER,
  auditDateBlur,
  auditDateError,
  auditDateErrors,
  auditFilterError,
  chartWidthFor,
  extractionBreakdown,
  incompleteDateError,
  lastDaysRange,
  mergeStaffPage,
  premiumUntilDateError,
  xLabelStep,
} from "../../src/features/admin/adminUtils.ts";
import { userExtractionLimitError } from "../../src/features/admin/settingsUtils.ts";
import {
  APPEAL_LEGACY_REASON_NOTE,
  appealActionState,
  appealReasonView,
  appealWithAccount,
  reportActionLabel,
  reportDoneMessage,
} from "../../src/features/admin/moderationUtils.ts";
import { ratingFormKey } from "../../src/lib/ratingUtils.ts";
import {
  endSessionMark,
  loginRedirectState,
  parseSessionMark,
  postLoginPath,
  startupSessionMark,
} from "../../src/features/auth/authUtils.ts";

export function runManualChecks(assert: (cond: boolean, msg: string) => void): void {
  // ---------- LC-04: thêm từ Hán–Việt vào bộ đã có từ đó ----------
  const deckCards = [
    { term: "学校", reading: "がっこう", meaning: "trường học" },
    { term: "学生 ", reading: "がくせい", meaning: "học sinh" },
  ];
  assert(findCardByTerm(deckCards, "学校")?.meaning === "trường học", "LC-04: bộ đã có 学校 -> báo trùng");
  assert(findCardByTerm(deckCards, " 学生")?.reading === "がくせい", "LC-04: so khớp bỏ khoảng trắng hai đầu");
  assert(findCardByTerm(deckCards, "学") === null && findCardByTerm(deckCards, "  ") === null, "LC-04: từ khác / rỗng -> không trùng");
  assert(findCardByTerm([{ term: "ＡＢＣ", reading: null, meaning: "x" }], "ABC") !== null, "LC-04: NFKC — chữ toàn khổ trùng chữ thường");

  // ---------- LC-08: chip chủ đề trên thẻ Thư viện ----------
  assert(
    ["kaiwa", "bunpou", "dokkai", "business", "kanji", "it", "goi"].map(categoryShortLabel).join("|") ===
      "Hội thoại|Ngữ pháp|Đọc hiểu|Thương Mại|Kanji|Tiếng Nhật CNTT|Từ vựng",
    "LC-08: chip hiện tên chủ đề đầy đủ, không phải một âm tiết"
  );
  assert(categoryShortLabel("all") === null && categoryShortLabel(null) === null && categoryShortLabel("xyz") === null, "LC-08: all / null / lạ -> không có chip");
  assert(categoryLabel("kaiwa") === "🗣️ Hội thoại Kaiwa", "LC-08: nhãn đầy đủ giữ nguyên (bộ lọc, tooltip)");

  // ---------- LC-09: phím tắt ô tìm Thư viện ----------
  const key = (k: string, o: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({
    key: k,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...o,
  });
  assert(
    isSearchShortcut(key("k", { ctrlKey: true })) && isSearchShortcut(key("K", { metaKey: true })),
    "LC-09: Ctrl+K và ⌘K focus ô tìm"
  );
  assert(
    !isSearchShortcut(key("k")) && !isSearchShortcut(key("k", { ctrlKey: true, shiftKey: true })) && !isSearchShortcut(key("j", { ctrlKey: true })),
    "LC-09: k trơn / Ctrl+Shift+K / Ctrl+J không phải phím tắt"
  );
  assert(searchShortcutLabel(true) === "⌘K" && searchShortcutLabel(false) === "Ctrl K", "LC-09: nhãn phím theo nền tảng");

  // ---------- LC-10: nhãn tuỳ chọn i+1 khớp ai-service (cấp ≤ cấp người học) ----------
  assert(assumeKnownScope("N5") === "các từ cấp N5", "LC-10: N5 gồm chính cấp N5");
  assert(assumeKnownScope("N3") === "các từ cấp N3 và các cấp dễ hơn", "LC-10: N3 gồm N3 và các cấp dễ hơn");

  // ---------- LC-11: quạt từ quá đông trên bản đồ Hán–Việt ----------
  const manyWords = Array.from({ length: 78 }, (_, i) => ({
    id: `w:${i}`,
    type: "word",
    label: `学${i}`,
    reading: "",
    meaning: "",
    level: i % 10 === 9 ? "N5" : i % 3 === 0 ? "N1" : null,
    hanViet: "",
  }));
  const bigGraph = parseHanVietGraph({
    query: "HỌC",
    nodes: [
      { id: "r", type: "reading", label: "HỌC" },
      { id: "k:学", type: "kanji", label: "学" },
      { id: "k:斈", type: "kanji", label: "斈" },
      { id: "k:澩", type: "kanji", label: "澩" },
      ...manyWords,
      { id: "w:a", type: "word", label: "斈a", reading: "", meaning: "", level: "N3", hanViet: "" },
    ],
    edges: [
      { from: "r", to: "k:学" },
      { from: "r", to: "k:斈" },
      { from: "r", to: "k:澩" },
      ...manyWords.map((w) => ({ from: "k:学", to: w.id, type: "in_word" })),
      { from: "k:斈", to: "w:a", type: "in_word" },
    ],
  });
  const cap = wordCapPerKanji(3, 720);
  assert(cap >= 6 && cap <= 16, `LC-11: 3 chữ trên khung 720 -> mỗi chữ vài viên (cap ${cap})`);
  assert(wordCapPerKanji(1, 720) === 24 && wordCapPerKanji(40, 720) === 3, "LC-11: cap kẹp 3..24");
  const capped = capGraphWords(bigGraph, cap);
  const moreIds = Object.keys(capped.more);
  assert(moreIds.length === 1 && moreIds[0] === `${MORE_NODE_PREFIX}k:学`, "LC-11: chỉ chữ đông từ (学) có viên +N");
  assert(capped.more[moreIds[0]].hidden === 78 - (cap - 1), "LC-11: +N = số từ bị ẩn");
  const shownUnder学 = kanjiOfGraph(capped.graph).find((k) => k.node.id === "k:学")!.words;
  assert(shownUnder学.length === cap, "LC-11: quạt của 学 đúng cap viên (kể cả viên +N)");
  const kept = shownUnder学.filter((w) => !w.id.startsWith(MORE_NODE_PREFIX));
  assert(
    kept.filter((w) => w.level === "N5").length === 7 && kept.every((w) => w.level === "N5" || w.level === "N1"),
    "LC-11: giữ từ dễ nhất (đủ 7 từ N5, rồi N1; từ chưa rõ cấp ẩn trước)"
  );
  assert(shownUnder学[shownUnder学.length - 1].id.startsWith(MORE_NODE_PREFIX), "LC-11: viên +N ở cuối quạt");
  assert(wordNodesOf(capped.graph).some((w) => w.id === "w:a"), "LC-11: chữ ít từ giữ nguyên từ của nó");
  assert(capGraphWords(parseHanVietGraph({ nodes: [], edges: [] }), cap).graph.nodes.length === 0, "LC-11: đồ thị rỗng không lỗi");
  const lay = radialLayout(capped.graph, 720);
  const pts = shownUnder学.map((w) => lay[w.id]);
  let minGap = Infinity;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) minGap = Math.min(minGap, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
  }
  assert(minGap >= 38, `LC-11: các viên trong quạt cách nhau ≥ 38 đơn vị (min ${minGap.toFixed(1)})`);
  const unchanged = parseHanVietGraph({
    nodes: [{ id: "k", type: "kanji", label: "日" }, { id: "w", type: "word", label: "日本" }],
    edges: [{ from: "k", to: "w" }],
  });
  assert(capGraphWords(unchanged, cap).graph === unchanged, "LC-11: không vượt cap -> trả nguyên đồ thị");

  // ---------- LC-12: số câu vượt số thẻ ----------
  assert(QUIZ_SIZE_OPTIONS.join() === "10,20,50", "LC-12: lựa chọn số câu giữ nguyên");
  assert(quizSizeNote(10, 8) === "Bộ thẻ chỉ có 8 thẻ nên bài sẽ có tối đa 8 câu.", "LC-12: 10 câu trên bộ 8 thẻ -> báo trước");
  assert(quizSizeNote(10, 12) === null && quizSizeNote(10, null) === null, "LC-12: đủ thẻ / chưa biết số thẻ -> không báo");
  assert(quizSizeNote(10, 0) === "Bộ thẻ chưa có thẻ nào để làm bài.", "LC-12: bộ rỗng");
  assert(
    quizSizeOptionLabel(20, 8) === "20 câu (bộ chỉ đủ 8 câu)" && quizSizeOptionLabel(10, 30) === "10 câu" && quizSizeOptionLabel(50, null) === "50 câu",
    "LC-12: nhãn lựa chọn ghi rõ số câu thực tế"
  );

  // ---------- LP-06/07/09/10/11: lộ trình ----------
  assert(
    pathStatusLabel("ACTIVE", true) === "Đã hoàn thành" && pathStatusLabel("ACTIVE", false) === "Đang học" && pathStatusLabel("DRAFT", true) === "Bản nháp",
    "LP-10: lộ trình đã chốt hoàn thành chỉ có một nhãn"
  );
  const job = (status: string, stats: Record<string, unknown>) =>
    ({ status, stage: "DONE", errorMessage: null, stats }) as unknown as Parameters<typeof enrichNoticeReason>[0];
  assert(enrichNoticeReason(job("DONE", { enriched: false, enrichReason: "no_api_key" })) === "no_api_key", "LP-06: chưa có khoá Gemini -> có thông báo");
  assert(
    enrichNoticeReason(job("DONE", { enriched: false, enrichReason: "quota" })) === null &&
      enrichNoticeReason(job("DONE", { enriched: true })) === null &&
      enrichNoticeReason(job("RUNNING", { enrichReason: "no_api_key" })) === null &&
      enrichNoticeReason(null) === null,
    "LP-06: quota (đã có nút Dịch lại) / đã dịch / đang chạy -> không lặp thông báo"
  );
  assert(daysFieldError("30") === null && daysFieldError("0") !== null && daysFieldError("400") !== null && daysFieldError("") !== null && daysFieldError("2.5") !== null, "LP-11: kiểm ô số ngày 1..365");
  assert(capFieldError("50") === null && capFieldError("3") === "Nhập số nguyên từ 5 đến 200 thẻ." && capFieldError("201") !== null, "LP-11: kiểm ô trần 5..200");
  assert(
    activateBlockReason({ totalCards: 0, daysError: null, capError: null })?.startsWith("Chưa chọn thẻ nào") === true &&
      activateBlockReason({ totalCards: 5, daysError: "x", capError: null })?.includes("Số ngày học") === true &&
      activateBlockReason({ totalCards: 5, daysError: null, capError: "x" })?.includes("Trần thẻ") === true &&
      activateBlockReason({ totalCards: 5, daysError: null, capError: null }) === null,
    "LP-11: nói rõ vì sao 'Tạo lộ trình' bị khoá"
  );
  assert(
    activateBlockReason({ totalCards: 5, daysError: null, capError: null, jobRunning: true })?.startsWith("Đang dịch lại nghĩa") === true &&
      activateBlockReason({ totalCards: 0, daysError: "x", capError: null, jobRunning: true })?.startsWith("Đang dịch lại nghĩa") === true,
    "LP-08 (7): đang dịch lại nghĩa -> kích hoạt bị khoá như server (409)"
  );
  assert(recheckResultText({ conflicts: 0 }) === "Đã kiểm tra lại: không còn mâu thuẫn.", "LP-11: kiểm tra lại xong có câu xác nhận");
  assert(recheckResultText({ conflicts: 3 }).includes("còn 3") && recheckResultText(null) === "Đã kiểm tra lại.", "LP-11: câu theo số cảnh báo");
  assert(behindMessage(6, 30, 17).includes("20 %") && !behindMessage(6, 30, 17).includes("sức học một ngày"), "LP-07: nợ 6 / trần 30 -> lý do theo tỉ lệ");
  assert(behindMessage(31, 30, 1000).includes("lớn hơn sức học một ngày (trần 30 thẻ)"), "LP-07: nợ vượt trần -> nói vượt sức học một ngày");
  assert(behindMessage(3, 30, 100).startsWith("Học bù trong phiên hôm nay"), "LP-07: mức warn giữ câu nhẹ");
  assert(todayNewTasksLine(["Bài 1 (2 thẻ)"], 0) === "Thẻ mới hôm nay (đã học xong): Bài 1 (2 thẻ)", "LP-09: học hết thẻ mới -> nói đã học xong");
  assert(todayNewTasksLine(["A (2 thẻ)", "B (3 thẻ)"], 5) === "Thẻ mới hôm nay: A (2 thẻ) · B (3 thẻ)" && todayNewTasksLine([], 3) === null, "LP-09: còn thẻ mới / không có chương");

  // ---------- LP-08 (6): chương "Ngày N" tự chia lại, chỉ gộp được vào chương đặt tên riêng ----------
  assert(
    ["Ngày 3", "Ngày 3–4", "Tuần 2 (ngày 8–14)", "Tuần 1 (ngày 1)"].every(isAutoDayChapterTitle) &&
      !["Ngày 3-4", "Ngày 3 ", "ngày 3", "Chào hỏi", "Ngày 1 + 2", "Tuần 2", "第1課"].some(isAutoDayChapterTitle),
    "LP-08: nhận đúng tên chương tự sinh như server (gạch nối '–', khớp trọn chuỗi)"
  );
  assert(
    !canMergeIntoPrevious(false, "Ngày 1") && canMergeIntoPrevious(false, "Chào hỏi") && canMergeIntoPrevious(null, "Bài 1") &&
      canMergeIntoPrevious(true, "Ngày 5") && !canMergeIntoPrevious(true, undefined),
    "LP-08: bản nháp chia theo ngày chỉ gộp vào chương đặt tên riêng; bản nhận ra chương gộp tự do; chương đầu không gộp"
  );
  const chap = (cardCount: number, dayFrom = 1, dayTo = 1, id = "a") => ({ id, cardCount, dayFrom, dayTo });
  assert(
    chapterLayoutKey([chap(2), chap(1, 2, 2, "b")]) !== chapterLayoutKey([chap(2), chap(2, 2, 2, "b")]) &&
      chapterLayoutKey([chap(2), chap(1, 2, 2, "b")]) !== chapterLayoutKey([chap(2), chap(1, 2, 3, "b")]) &&
      chapterLayoutKey([chap(2), chap(1, 2, 2, "b")]) === chapterLayoutKey([chap(2), chap(1, 2, 2, "b")]),
    "LP-08: số thẻ / dải ngày của chương KHÁC đổi -> chương đang mở tải lại; không đổi gì -> không tải"
  );

  // ---------- STAFF-02/13: mật khẩu staff ----------
  assert(staffRedirectFor("/profile") === STAFF_ACCOUNT_PATH && staffRedirectFor("/decks") === "/admin", "STAFF-02: staff mở /profile -> Hồ sơ trong Admin Panel");
  assert(passwordChangeError("old", "abc", "abc") === PASSWORD_POLICY_MESSAGE, "STAFF-13: mật khẩu 3 ký tự bị chặn ở máy khách (chính sách 27/10)");
  assert(
    passwordChangeError("", "Abcdef-1", "Abcdef-1") === "Vui lòng nhập mật khẩu hiện tại." &&
      passwordChangeError("old", "Abcdef-1", "Abcdef-2") === "Mật khẩu xác nhận không khớp." &&
      passwordChangeError("Abcdef-1", "Abcdef-1", "Abcdef-1", "khác mặc định") === "khác mặc định" &&
      passwordChangeError("old", "Abcdef-1", "Abcdef-1") === null &&
      passwordChangeError("old", "abcdefgh", "abcdefgh") === PASSWORD_POLICY_MESSAGE &&
      passwordChangeError("old", "x".repeat(73), "x".repeat(73)) !== null,
    "STAFF-13: thứ tự kiểm tra như Hồ sơ > Bảo mật"
  );
  assert(
    stripFieldPrefixes("newPassword: Mật khẩu mới phải từ 6 đến 72 ký tự") === "Mật khẩu mới phải từ 6 đến 72 ký tự" &&
      stripFieldPrefixes("email: Sai định dạng; cards[0].term: Thiếu thuật ngữ") === "Sai định dạng; Thiếu thuật ngữ" &&
      stripFieldPrefixes("OCR: lỗi") === "OCR: lỗi" &&
      stripFieldPrefixes("Email đã được sử dụng!") === "Email đã được sử dụng!",
    "STAFF-13: bỏ tên trường kỹ thuật trước câu lỗi kiểm tra dữ liệu"
  );
  const err400 = { isAxiosError: true, response: { status: 400, data: { status: 400, message: "newPassword: Mật khẩu mới phải từ 6 đến 72 ký tự" } } };
  const err409 = { isAxiosError: true, response: { status: 409, data: { status: 409, message: "abc: giữ nguyên" } } };
  assert(
    extractErrorMessage(err400) === "Mật khẩu mới phải từ 6 đến 72 ký tự" && extractErrorMessage(err409) === "abc: giữ nguyên",
    "STAFF-13: chỉ lỗi 400 mới bỏ tiền tố tên trường"
  );

  // ---------- STAFF-04: tab Đội ngũ Staff ----------
  const staff = [
    { id: 2, createdAt: "2026-10-01T00:00:00Z", role: "ADMIN" },
    { id: 1, createdAt: "2026-09-01T00:00:00Z", role: "SUPER_ADMIN" },
    { id: 7, createdAt: "2026-10-01T00:00:00Z", role: "ADMIN" },
    { id: 7, createdAt: "2026-10-01T00:00:00Z", role: "ADMIN" },
  ];
  const merged = mergeStaffPage(staff, 0, 2);
  assert(STAFF_ROLE_FILTER === "STAFF", "STAFF-04: giá trị lọc staff");
  assert(merged.total === 3 && merged.items.map((r) => r.id).join() === "7,2", "STAFF-04: gộp ADMIN + SUPER_ADMIN, bỏ trùng, mới trước rồi id giảm");
  assert(mergeStaffPage(staff, 1, 2).items.map((r) => r.id).join() === "1", "STAFF-04: phân trang ở máy khách");

  // ---------- STAFF-06: Cơ cấu bóc tách khi tổng = 0 ----------
  const empty = extractionBreakdown(0, 0, 0, 0);
  assert(empty.otherPct === 0 && empty.other === 0 && empty.donePct === 0, "STAFF-06: tổng 0 -> Khác 0 %");
  const some = extractionBreakdown(10, 5, 2, 1);
  assert(some.other === 2 && some.donePct + some.runningPct + some.failedPct + some.otherPct === 100, "STAFF-06: có lượt khác -> tổng 100 %");
  assert(extractionBreakdown(3, 1, 1, 1).otherPct === 0, "STAFF-06: không có lượt khác -> 0 % dù làm tròn lệch");

  // ---------- STAFF-07/08: khiếu nại, báo cáo ----------
  // Lý do lúc gửi (lockedReasonAtSubmit) thắng lý do hiện tại: mở khoá / khoá lại không làm mất. "[x]" = chữ mờ, sau "|" là ghi chú.
  const reasonView = (a: Parameters<typeof appealReasonView>[0]): string => {
    const v = appealReasonView(a);
    return `${v.text ?? `[${v.placeholder}]`}|${v.note ?? ""}`;
  };
  assert(
    reasonView({ userId: 5, userLocked: false, lockedReason: null, lockedReasonAtSubmit: " spam " }) === "spam|" &&
      reasonView({ userId: 5, userLocked: true, lockedReason: "spam", lockedReasonAtSubmit: "spam" }) === "spam|" &&
      reasonView({ userId: null, userLocked: null, lockedReason: null, lockedReasonAtSubmit: "spam" }) === "spam|",
    "STAFF-07: đã mở khoá / còn khoá cùng lý do / mất tài khoản -> lý do lúc gửi, không ghi chú"
  );
  assert(
    reasonView({ userId: 5, userLocked: true, lockedReason: "Lý do mới", lockedReasonAtSubmit: "spam" }) === "spam|Hiện tại: “Lý do mới”" &&
      reasonView({ userId: 5, userLocked: true, lockedReason: null, lockedReasonAtSubmit: "spam" }) === "spam|Hiện tại: không ghi lý do",
    "STAFF-07: bị khoá lại với lý do khác -> ghi chú lý do hiện tại"
  );
  assert(
    reasonView({ userId: 5, userLocked: false, lockedReason: null, lockedReasonAtSubmit: "" }) === "[Không ghi lý do]|" &&
      reasonView({ userId: 5, userLocked: true, lockedReason: null, lockedReasonAtSubmit: "" }) === "[Không ghi lý do]|",
    "STAFF-07: \"\" = lúc gửi bị khoá không ghi lý do (khác khiếu nại cũ)"
  );
  // Khiếu nại cũ (null / vắng trường): lý do hiện tại kèm nhãn; đã mở khoá thì không ghi "Không ghi lý do"
  assert(
    reasonView({ userId: 5, userLocked: true, lockedReason: " spam ", lockedReasonAtSubmit: null }) === `spam|${APPEAL_LEGACY_REASON_NOTE}` &&
      reasonView({ userId: 5, userLocked: true, lockedReason: null }) === `[Không ghi lý do]|${APPEAL_LEGACY_REASON_NOTE}`,
    "STAFF-07: khiếu nại cũ còn khoá -> lý do hiện tại có nhãn"
  );
  assert(
    reasonView({ userId: 5, userLocked: false, lockedReason: null, lockedReasonAtSubmit: null }) ===
      `[— (không còn khoá)]|${APPEAL_LEGACY_REASON_NOTE}` &&
      reasonView({ userId: null, userLocked: null, lockedReason: null, lockedReasonAtSubmit: null }) === "[—]|",
    "STAFF-07: khiếu nại cũ đã mở khoá -> '— (không còn khoá)'; mất tài khoản -> —"
  );
  // Modal xử lý: dòng danh sách cũ (snapshot "Spam", lúc tải còn khoá "Gian lận"); admin khác vừa mở khoá / khoá lại không lý do.
  const staleRow = { id: 9, status: "OPEN", userId: 5, userLocked: true, lockedReason: "Gian lận", lockedReasonAtSubmit: "Spam" };
  const unlockedNow = appealWithAccount(staleRow, { lockedAt: null, lockedReason: null });
  assert(
    unlockedNow.userLocked === false && reasonView(unlockedNow) === "Spam|" &&
      appealActionState(unlockedNow, "USER", "ADMIN").unlockHint === "Tài khoản đã được mở khoá.",
    "STAFF-07: chi tiết vừa tra = đã mở khoá -> không hiện lại 'Hiện tại: Gian lận', Mở khoá tắt"
  );
  assert(
    reasonView(appealWithAccount(staleRow, { lockedAt: "2026-10-20T01:00:00Z", lockedReason: null })) === "Spam|Hiện tại: không ghi lý do",
    "STAFF-07: chi tiết vừa tra = khoá lại không ghi lý do -> ghi chú đúng, không lấy lý do cũ của dòng danh sách"
  );
  assert(
    appealWithAccount(staleRow, null) === staleRow && appealWithAccount(staleRow, undefined) === staleRow,
    "STAFF-07: chưa tra / tra lỗi -> giữ dòng danh sách"
  );
  assert(
    reportActionLabel("NONE") === "Không làm gì" && reportActionLabel("UNPUBLISH_DECK") === "Gỡ bộ thẻ" && reportActionLabel("CLEAR_COMMENT") === "Xoá bình luận",
    "STAFF-08: NONE là 'Không làm gì', không phải 'Bỏ qua'"
  );

  // ---------- STAFF-09: form đánh giá dựng lại khi đánh giá của mình đổi ----------
  assert(ratingFormKey(null) === "none" && ratingFormKey({ stars: 4, comment: "hay" }) === "4|hay", "STAFF-09: key theo dữ liệu đánh giá");
  assert(ratingFormKey({ stars: 4, comment: null }) !== ratingFormKey(null), "STAFF-09: gửi xong (null -> có) -> form dựng lại với dữ liệu mới");

  // ---------- STAFF-10: biểu đồ đọc được trên điện thoại ----------
  assert(chartWidthFor(276, 800) === 276 && chartWidthFor(1200, 800) === 800 && chartWidthFor(100, 800) === 240, "STAFF-10: vẽ theo đúng bề rộng khung (240..800)");
  assert(xLabelStep(30, 800) === 5 && xLabelStep(30, 276) === 10 && xLabelStep(1, 276) === 1, "STAFF-10: khung hẹp ít nhãn trục X hơn");

  // ---------- STAFF-12: bộ lọc nhật ký ----------
  assert(auditFilterError({ actorId: "abc", from: "", to: "" })?.includes("số nguyên dương") === true, "STAFF-12: ID chữ bị chặn ở máy khách");
  assert(auditFilterError({ actorId: "0", from: "", to: "" }) !== null && auditFilterError({ actorId: " 12 ", from: "", to: "" }) === null, "STAFF-12: ID 0 sai, ' 12 ' đúng");
  assert(auditFilterError({ actorId: "", from: "2026-10-20", to: "2026-10-01" })?.includes("Ngày bắt đầu") === true, "STAFF-12: từ ngày > đến ngày bị báo");
  assert(auditFilterError({ actorId: "", from: "2026-10-01", to: "2026-10-01" }) === null, "STAFF-12: cùng ngày hợp lệ");

  // ---------- NEW-08: form admin noValidate -> tự kiểm, báo tiếng Việt ----------
  assert(incompleteDateError({ validity: { badInput: true } }) === INCOMPLETE_DATE_ERROR, "NEW-08: ô ngày gõ dở (value \"\") bị chặn");
  assert(
    incompleteDateError({ validity: { badInput: false } }) === null && incompleteDateError(null) === null && incompleteDateError(undefined) === null,
    "NEW-08: ô ngày trống / đủ / chưa hiện (ref null) -> không báo"
  );
  assert(INCOMPLETE_DATE_ERROR.includes("dd/mm/yyyy"), "NEW-08: lời báo nêu định dạng cần nhập");
  assert(
    ["0", "1000", " 12 ", "1e3"].every((t) => userExtractionLimitError(t) === null),
    "NEW-08: hạn mức riêng 0..1000 (kể cả cách hai đầu) hợp lệ"
  );
  assert(
    ["5000", "1001", "-1", "1.5", "abc", "1,5"].every((t) => userExtractionLimitError(t)?.includes("số nguyên từ 0 đến 1000") === true),
    "NEW-08: hạn mức riêng ngoài khoảng / số lẻ / chữ -> lời báo tiếng Việt"
  );
  assert(
    userExtractionLimitError("")?.includes("Theo cấu hình chung") === true && userExtractionLimitError("  ") !== null,
    "NEW-08: ô trống không thành Number(\"\") = 0 (khoá bóc tách) mà nhắc nhập hoặc chọn cấu hình chung"
  );
  // Hạn Pro đủ ngày nhưng năm 5 chữ số / ngày đã qua: trước đây toISOString ném "Invalid time value" tiếng Anh, hoặc lưu gói Pro
  // hết hạn sẵn
  assert(premiumUntilDateError("", "2026-10-20") === null, "NEW-08: hạn Pro trống = vĩnh viễn");
  assert(
    ["2026-10-20", "2027-01-01", PREMIUM_UNTIL_MAX].every((v) => premiumUntilDateError(v, "2026-10-20") === null),
    "NEW-08: hạn Pro từ hôm nay (trọn ngày) tới 9999-12-31 hợp lệ"
  );
  assert(
    ["20266-12-31", "275760-01-01"].every((v) => premiumUntilDateError(v, "2026-10-20")?.includes("4 chữ số") === true),
    "NEW-08: năm quá 4 chữ số -> lời báo tiếng Việt, không để new Date(...).toISOString() ném lỗi tiếng Anh"
  );
  assert(
    ["2026-10-19", "0002-01-01"].every((v) => premiumUntilDateError(v, "2026-10-20")?.includes("từ hôm nay") === true),
    "NEW-08: hạn Pro đã qua bị chặn"
  );
  // "7 ngày gần nhất" theo ngày lịch máy admin: 03:00 sáng 20/10 (giờ máy) -> to = 20/10, không phải ngày UTC 19/10
  const early = lastDaysRange(7, new Date(2026, 9, 20, 3, 0));
  assert(early.to === "2026-10-20" && early.from === "2026-10-13", `NEW-08: 7 ngày gần nhất theo ngày lịch (${JSON.stringify(early)})`);
  const lateNight = lastDaysRange(7, new Date(2026, 0, 3, 23, 30));
  assert(lateNight.to === "2026-01-03" && lateNight.from === "2025-12-27", "NEW-08: 7 ngày gần nhất qua năm, 23:30 vẫn là ngày đó");

  // ---------- NEW-12: lời báo sau khi xử lý báo cáo ----------
  const rep = { id: 7, deckId: "d-1", deckTitle: "N5 cơ bản" };
  assert(reportDoneMessage(rep, "UNPUBLISH_DECK") === "Đã gỡ “N5 cơ bản” khỏi Thư viện và đóng báo cáo #7.", "NEW-12: gỡ bộ thẻ nêu hệ quả");
  assert(reportDoneMessage(rep, "CLEAR_COMMENT").startsWith("Đã xoá bình luận trên “N5 cơ bản”"), "NEW-12: xoá bình luận nêu bộ thẻ");
  assert(reportDoneMessage(rep, "DISMISS") === "Đã bỏ qua báo cáo #7 về “N5 cơ bản”.", "NEW-12: bỏ qua ≠ xử lý");
  assert(/không thao tác thêm/.test(reportDoneMessage(rep, "NONE")), "NEW-12: NONE = đã xử lý, không làm gì thêm");
  assert(
    reportDoneMessage({ id: 8, deckId: "d-2", deckTitle: null }, "DISMISS").includes("“d-2”") &&
      reportDoneMessage({ id: 8, deckId: "d-2", deckTitle: "  " }, "NONE").includes("“d-2”"),
    "NEW-12: bộ thẻ mất tiêu đề -> dùng id"
  );

  // ---------- Đăng xuất rồi đăng nhập tài khoản khác: không bị đưa vào trang riêng của người trước (404) ----------
  const deckPage = { pathname: "/decks/abc", search: "?tab=cards" };
  const fresh = loginRedirectState(deckPage, null);
  assert(
    postLoginPath(fresh, "ai-cung-duoc@example.test") === "/decks/abc?tab=cards",
    "Tab chưa ai đăng nhập (link chia sẻ / gõ URL): ai đăng nhập cũng quay về đúng trang, giữ cả ?query"
  );
  const loggedOut = endSessionMark({ reason: "active", owner: "a@example.test" }, "logout");
  assert(loginRedirectState(deckPage, loggedOut) === undefined, "Chủ động đăng xuất: /login không nhớ trang của người cũ");
  const expired = loginRedirectState(deckPage, endSessionMark({ reason: "active", owner: "a@example.test" }, "expired"));
  assert(postLoginPath(expired, " A@Example.test ") === "/decks/abc?tab=cards", "Hết phiên: đúng người đó (khác hoa thường) quay lại trang cũ");
  assert(postLoginPath(expired, "b@example.test") === null, "Hết phiên: tài khoản khác đăng nhập về trang chủ, không vào trang của A");
  assert(
    postLoginPath(loginRedirectState(deckPage, endSessionMark(null, "expired")), "") === null,
    "Hết phiên mà không rõ chủ: không ai được quay lại (email rỗng không khớp chủ rỗng)"
  );
  assert(
    endSessionMark(loggedOut, "expired").reason === "logout",
    "Request bay về 401 ngay sau khi bấm Đăng xuất không biến lần đăng xuất thành hết phiên"
  );
  assert(
    postLoginPath({ from: { pathname: "/decks/abc" }, fromOwner: 42 }, "a@example.test") === null &&
      postLoginPath({ from: { pathname: "//evil.example" } }, "a") === null &&
      postLoginPath({ from: { pathname: "/\\evil.example" } }, "a") === null &&
      postLoginPath({ from: { pathname: "/login" } }, "a") === null &&
      postLoginPath({ from: "/decks" }, "a") === null &&
      postLoginPath(null, "a") === null &&
      postLoginPath({ from: { pathname: "/decks", search: "javascript:1" } }, "a") === "/decks",
    "state lịch sử là dữ liệu không tin: chủ sai kiểu, //host, /\\host, /login, from không phải object đều bị bỏ"
  );
  assert(
    postLoginPath({ from: { pathname: "/folders", search: "?folderId=1", hash: "", state: null, key: "k" } }, "a") === "/folders?folderId=1",
    "Mục lịch sử kiểu cũ (cả object location, không có chủ) vẫn quay lại được"
  );
  assert(
    parseSessionMark(JSON.stringify({ reason: "expired", owner: "a@example.test" }))?.owner === "a@example.test" &&
      parseSessionMark("{hỏng") === null &&
      parseSessionMark(JSON.stringify({ reason: "khác", owner: "a" })) === null &&
      parseSessionMark(null) === null,
    "Dấu phiên trong sessionStorage hỏng / sai dạng -> coi như tab chưa ai đăng nhập"
  );
  // Review: dấu "đã đăng xuất" sống suốt đời tab -> dán link chia sẻ vào tab ấy (tải trang mới) mất luôn trang quay lại
  const noSession = { token: null, email: null };
  const storedLogout = endSessionMark({ reason: "active", owner: "a@example.test" }, "logout");
  assert(
    postLoginPath(loginRedirectState(deckPage, startupSessionMark(noSession, storedLogout, "navigate")), "b@example.test") ===
      "/decks/abc?tab=cards",
    "Sau khi A đăng xuất, B dán link chia sẻ vào cùng tab (tải trang mới): B đăng nhập xong về đúng trang đó"
  );
  const storedExpired = endSessionMark({ reason: "active", owner: "a@example.test" }, "expired");
  assert(
    postLoginPath(loginRedirectState(deckPage, startupSessionMark(noSession, storedExpired, "navigate")), "b@example.test") ===
      "/decks/abc?tab=cards",
    "Hết phiên của A rồi mở link mới trong tab: trang không còn gắn chủ A"
  );
  assert(
    loginRedirectState(deckPage, startupSessionMark(noSession, storedLogout, "reload")) === undefined &&
      loginRedirectState(deckPage, startupSessionMark(noSession, storedLogout, "back_forward")) === undefined &&
      postLoginPath(
        loginRedirectState(deckPage, startupSessionMark(noSession, storedExpired, "reload")),
        "b@example.test"
      ) === null,
    "Tải lại / Back-Forward sau khi đăng xuất / hết phiên: vẫn giữ dấu (trang là của người trước)"
  );
  assert(
    loginRedirectState(deckPage, startupSessionMark(noSession, storedLogout, null)) === undefined,
    "Không đọc được loại điều hướng: giữ dấu như trước"
  );
  assert(
    startupSessionMark({ token: "t", email: " A@Example.test " }, storedLogout, "navigate")?.reason === "active" &&
      startupSessionMark({ token: "t", email: " A@Example.test " }, storedLogout, "navigate")?.owner === "a@example.test",
    "Còn phiên: dấu là 'active' của email đã lưu, bất kể loại điều hướng"
  );

  // ---------- Nhật ký: ô ngày không ghi URL theo từng phím khi đang gõ năm ----------
  assert(
    ["0002-10-01", "0020-10-01", "0202-10-01", "1205-12-05", "1999-12-31"].every((v) => auditDateError(v)?.includes("từ 2000") === true),
    "Năm đang gõ dở (0002 → 0020 → 0202) / năm vô lý bị chặn"
  );
  assert(
    auditDateError("") === null && auditDateError("2026-10-01") === null && auditDateError("2000-01-01") === null,
    "Ô trống / ngày đã gõ xong hợp lệ"
  );
  assert(
    auditDateError("2026-02-30")?.includes("dd/mm/yyyy") === true && auditDateError("2026-1-5")?.includes("dd/mm/yyyy") === true,
    "Link gõ tay: ngày không có thật / sai dạng"
  );
  assert(auditFilterError({ actorId: "", from: "", to: "0002-10-01" })?.startsWith("Đến ngày") === true, "URL ?to=0002-10-01 báo rõ ô nào");
  const dateEl = (value: string, badInput = false) => ({ value, validity: { badInput } });
  const noErrors = { from: null, to: null };
  assert(
    auditDateErrors(dateEl(""), dateEl("", true)).to === INCOMPLETE_DATE_ERROR,
    "Bấm Lọc khi ô gõ dở: vẫn báo 'Ngày chưa nhập đủ' như faf028b"
  );
  assert(
    auditDateErrors(dateEl("2026-10-20"), dateEl("2026-10-01")).to === AUDIT_RANGE_ERROR &&
      auditDateErrors(dateEl("2026-10-20"), dateEl("2026-10-01")).from === null,
    "Khoảng ngược báo ở ô Đến ngày"
  );
  const url = (from = "", to = "") => ({ from, to });
  const typingYear = auditDateBlur("to", { from: dateEl(""), to: dateEl("0202-10-01") }, noErrors, url());
  assert(typingYear.apply === null && typingYear.errors.to?.includes("từ 2000") === true, "Rời ô khi năm chưa xong: không ghi URL, báo cạnh ô");
  const done = auditDateBlur("from", { from: dateEl("2026-10-01"), to: dateEl("", true) }, noErrors, url());
  assert(done.apply?.from === "2026-10-01" && done.apply.to === undefined && done.errors.to === null,
    "Rời ô với ngày đã xong: lọc ngay; ô kia gõ dở chưa bị nhắc, mốc của nó trên URL giữ nguyên");
  assert(
    auditDateBlur("from", { from: dateEl("2026-10-01"), to: dateEl("") }, noErrors, url("2026-10-01")).apply === null,
    "Rời ô mà ngày không đổi: không ghi lại URL (khỏi về trang đầu)"
  );
  const reversedBlur = auditDateBlur("from", { from: dateEl("2026-10-20"), to: dateEl("2026-10-01") }, noErrors, url());
  assert(reversedBlur.apply === null && reversedBlur.errors.to === AUDIT_RANGE_ERROR, "Rời ô tạo khoảng ngược: không ghi, báo ở Đến ngày");
  assert(
    auditDateBlur("to", { from: dateEl(""), to: dateEl("") }, noErrors, url("", "2026-10-01")).apply?.to === "",
    "Xoá hẳn ô rồi rời ô: bỏ lọc theo ngày đó"
  );
  assert(
    auditDateBlur("to", { from: dateEl(""), to: dateEl("", true) }, noErrors, url()).errors.to === null &&
      auditDateBlur("to", { from: dateEl(""), to: dateEl("", true) }, { from: null, to: INCOMPLETE_DATE_ERROR }, url()).errors.to ===
        INCOMPLETE_DATE_ERROR,
    "Ô gõ dở: chỉ chuyển ô thì không nhắc; đã bấm Lọc thì lời báo còn tới khi sửa"
  );
  // Review: ngày bị giữ lại vì khoảng ngược rồi sửa khoảng ở ô KIA -> phải ghi cả hai mốc, không chỉ ô vừa rời
  const applied = url("2026-10-01", "2026-10-10");
  const step1 = auditDateBlur("from", { from: dateEl("2026-10-15"), to: dateEl("2026-10-10") }, noErrors, applied);
  assert(step1.apply === null && step1.errors.to === AUDIT_RANGE_ERROR, "Bước 1: Từ ngày 15/10 > Đến ngày 10/10 -> giữ lại, báo");
  const step2 = auditDateBlur("to", { from: dateEl("2026-10-15"), to: dateEl("2026-10-20") }, noErrors, applied);
  assert(
    step2.apply?.from === "2026-10-15" && step2.apply.to === "2026-10-20" && !step2.errors.from && !step2.errors.to,
    "Bước 2: sửa Đến ngày 20/10 -> ghi cả from=15/10 lẫn to=20/10 (ô hiện ngày nào, bảng lọc đúng ngày đó)"
  );
  // Review: ô kia đang gõ dở (badInput, value "") / năm chưa xong -> URL giữ mốc cũ của nó: so khoảng với mốc ấy
  for (const half of [dateEl("", true), dateEl("0202-10-10")]) {
    const blocked = auditDateBlur("from", { from: dateEl("2026-10-15"), to: half }, noErrors, applied);
    assert(
      blocked.apply === null && blocked.errors.to !== null && blocked.errors.to !== AUDIT_RANGE_ERROR && blocked.errors.from === null,
      "Từ ngày 15/10 khi Đến ngày gõ dở mà URL còn to=10/10: không ghi (banner khoảng ngược), báo Đến ngày chưa xong"
    );
  }
  const okWithHalf = auditDateBlur("from", { from: dateEl("2026-10-05"), to: dateEl("", true) }, noErrors, applied);
  assert(okWithHalf.apply?.from === "2026-10-05" && okWithHalf.apply.to === undefined && okWithHalf.errors.to === null,
    "Đến ngày gõ dở nhưng khoảng với mốc cũ vẫn đúng: ghi Từ ngày, giữ to=10/10 trên URL, không nhắc ô đang gõ");
}
