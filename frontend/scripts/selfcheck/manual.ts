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
  capFieldError,
  daysFieldError,
  enrichNoticeReason,
  pathStatusLabel,
  todayNewTasksLine,
} from "../../src/features/roadmap/roadmapUtils.ts";
import { passwordChangeError } from "../../src/lib/passwordRules.ts";
import { STAFF_ACCOUNT_PATH, staffRedirectFor } from "../../src/lib/roles.ts";
import {
  INCOMPLETE_DATE_ERROR,
  PREMIUM_UNTIL_MAX,
  STAFF_ROLE_FILTER,
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
  appealLockReason,
  appealLockReasonPlaceholder,
  reportActionLabel,
  reportDoneMessage,
} from "../../src/features/admin/moderationUtils.ts";
import { ratingFormKey } from "../../src/lib/ratingUtils.ts";

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
  assert(recheckResultText({ conflicts: 0 }) === "Đã kiểm tra lại: không còn mâu thuẫn.", "LP-11: kiểm tra lại xong có câu xác nhận");
  assert(recheckResultText({ conflicts: 3 }).includes("còn 3") && recheckResultText(null) === "Đã kiểm tra lại.", "LP-11: câu theo số cảnh báo");
  assert(behindMessage(6, 30, 17).includes("20 %") && !behindMessage(6, 30, 17).includes("sức học một ngày"), "LP-07: nợ 6 / trần 30 -> lý do theo tỉ lệ");
  assert(behindMessage(31, 30, 1000).includes("lớn hơn sức học một ngày (trần 30 thẻ)"), "LP-07: nợ vượt trần -> nói vượt sức học một ngày");
  assert(behindMessage(3, 30, 100).startsWith("Học bù trong phiên hôm nay"), "LP-07: mức warn giữ câu nhẹ");
  assert(todayNewTasksLine(["Bài 1 (2 thẻ)"], 0) === "Thẻ mới hôm nay (đã học xong): Bài 1 (2 thẻ)", "LP-09: học hết thẻ mới -> nói đã học xong");
  assert(todayNewTasksLine(["A (2 thẻ)", "B (3 thẻ)"], 5) === "Thẻ mới hôm nay: A (2 thẻ) · B (3 thẻ)" && todayNewTasksLine([], 3) === null, "LP-09: còn thẻ mới / không có chương");

  // ---------- STAFF-02/13: mật khẩu staff ----------
  assert(staffRedirectFor("/profile") === STAFF_ACCOUNT_PATH && staffRedirectFor("/decks") === "/admin", "STAFF-02: staff mở /profile -> Hồ sơ trong Admin Panel");
  assert(passwordChangeError("old", "abc", "abc") === "Mật khẩu mới phải từ 6 đến 72 ký tự.", "STAFF-13: mật khẩu 3 ký tự bị chặn ở máy khách");
  assert(
    passwordChangeError("", "abcdef", "abcdef") === "Vui lòng nhập mật khẩu hiện tại." &&
      passwordChangeError("old", "abcdef", "abcdeg") === "Mật khẩu xác nhận không khớp." &&
      passwordChangeError("abcdef", "abcdef", "abcdef", "khác mặc định") === "khác mặc định" &&
      passwordChangeError("old", "abcdef", "abcdef") === null &&
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
  assert(appealLockReason({ userId: 5, userLocked: false, lockedReason: null }) === null, "STAFF-07: đã mở khoá -> không có lý do hiện tại");
  assert(appealLockReasonPlaceholder({ userId: 5, userLocked: false }) === "— (không còn khoá)", "STAFF-07: không ghi 'Không ghi lý do' cho tài khoản đã mở");
  assert(
    appealLockReason({ userId: 5, userLocked: true, lockedReason: " spam " }) === "spam" &&
      appealLockReasonPlaceholder({ userId: 5, userLocked: true }) === "Không ghi lý do" &&
      appealLockReasonPlaceholder({ userId: null, userLocked: null }) === "—",
    "STAFF-07: đang khoá -> lý do / 'Không ghi lý do'; mất tài khoản -> —"
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
}
