// Self-check thao tác trang học (spec docs/Plan/specs/2026-10-25-thao-tac-hoc-the-design.md). scripts/selfCheck.ts gọi
// runStudyChecks(assert). Chỉ hàm thuần; import tương đối + đuôi .ts để node chạy trực tiếp.
import {
  HARDEST_LIMIT,
  SAVED_SESSION_MAX_AGE_MS,
  emptyStats,
  formatDuration,
  parseSavedSession,
  pushUndo,
  queueCounts,
  recordGrade,
  requeueAgain,
  serializeSession,
  studyKeyAction,
  summarize,
  swipeDecision,
  type KeyInput,
  type KeyState,
} from "../../src/features/study/studyUtils.ts";

type Assert = (cond: boolean, msg: string) => void;

const key = (k: string, extra: Partial<KeyInput> = {}): KeyInput => ({
  key: k,
  code: k === " " ? "Space" : k.length === 1 ? `Key${k.toUpperCase()}` : k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  ...extra,
});

export function runStudyChecks(assert: Assert) {
  // §3.3 thẻ "Lại" gặp lại sau 3 thẻ; ít hơn thì về cuối
  assert(requeueAgain(["a", "b", "c", "d", "e", "f"]).join("") === "bcdaef", "Lại: chèn sau 3 thẻ");
  assert(requeueAgain(["a", "b", "c", "d"]).join("") === "bcda", "Lại: còn đúng 3 thẻ -> về cuối");
  assert(requeueAgain(["a", "b"]).join("") === "ba", "Lại: còn 1 thẻ -> về cuối");
  assert(requeueAgain(["a"]).join("") === "a", "Lại: hàng 1 thẻ giữ nguyên");
  assert(requeueAgain([]).length === 0, "Lại: hàng rỗng");

  // §3.6 vuốt: ngưỡng max(80px, 25% bề rộng)
  assert(swipeDecision(-80, 300) === "again", "Vuốt trái đủ 80px = Lại");
  assert(swipeDecision(79, 300) === null, "Chưa tới 80px: bật về");
  assert(swipeDecision(150, 600) === "good", "Thẻ rộng 600: 150px = 25% -> Tốt");
  assert(swipeDecision(149, 600) === null, "Thẻ rộng 600: 149px chưa tới ngưỡng");

  // §3.2 phím tắt
  const hidden: KeyState = { revealed: false, audioGate: false };
  const shown: KeyState = { revealed: true, audioGate: false };
  assert(studyKeyAction(key(" "), hidden)?.kind === "reveal", "Space chưa lật = lật");
  assert(studyKeyAction(key("Enter"), hidden)?.kind === "reveal", "Enter chưa lật = lật");
  assert(studyKeyAction(key(" "), shown)?.kind === "hide", "Space khi đã lật = lật về mặt trước, không chấm");
  assert(studyKeyAction(key("Enter"), shown)?.kind === "hide", "Enter khi đã lật = lật về mặt trước");
  assert(studyKeyAction(key(" ", { repeat: true }), shown)?.kind === "none", "Giữ Space không lật qua lại liên tục");
  const three = studyKeyAction(key("3"), shown);
  assert(three?.kind === "grade" && three.grade === "good", "Đã lật: 3 = Tốt");
  assert(studyKeyAction(key(" "), { ...hidden, audioGate: true })?.kind === "openAudio", "Space ở cổng Nghe = mở cổng");
  const oneHidden = studyKeyAction(key("1"), hidden);
  assert(oneHidden?.kind === "grade" && oneHidden.grade === "again", "Chưa lật: phím số 1-4 vẫn chấm được");
  const four = studyKeyAction(key("4"), shown);
  assert(four?.kind === "grade" && four.grade === "easy", "Đã lật: 4 = Dễ");
  assert(studyKeyAction(key("z"), hidden)?.kind === "undo", "Z = hoàn tác");
  assert(studyKeyAction(key("z", { ctrlKey: true }), shown)?.kind === "undo", "Ctrl+Z = hoàn tác");
  assert(studyKeyAction(key("z", { metaKey: true }), shown)?.kind === "undo", "Cmd+Z = hoàn tác");
  assert(studyKeyAction(key("Z", { ctrlKey: true, shiftKey: true }), shown) === null, "Ctrl+Shift+Z không phải hoàn tác");
  assert(studyKeyAction(key("r", { ctrlKey: true }), shown) === null, "Ctrl+R để trình duyệt tải lại");
  assert(studyKeyAction(key("R"), shown)?.kind === "replay", "R = nghe lại");
  assert(studyKeyAction(key("?", { shiftKey: true }), shown)?.kind === "help", "? = bảng phím tắt");

  // Bộ đếm + tổng kết
  assert(summarize(emptyStats()).durationMs === 0, "Chưa chấm gì: thời gian 0");
  let stats = emptyStats();
  stats = recordGrade(stats, "b", "again", 5_000, 10_000);
  stats = recordGrade(stats, "c", "again", 10_000, 20_000);
  stats = recordGrade(stats, "c", "again", 20_000, 30_000);
  stats = recordGrade(stats, "a", "good", 30_000, 70_000);
  const modes: Record<string, "new" | "due" | "cram"> = { a: "new", b: "new", c: "due", d: "cram", e: "new" };
  const counts = queueCounts(["b", "c", "d", "e"], (id) => modes[id], stats);
  assert(counts.relearn === 2 && counts.new === 1 && counts.review === 1, "Mới · Ôn · Học lại: thẻ đã bấm Lại tính Học lại, Luyện tính Ôn");
  const sum = summarize(stats);
  assert(sum.total === 4 && sum.grades.again === 3, "Tổng kết: số lượt");
  assert(sum.durationMs === 65_000, "Tổng kết: từ lúc hiện thẻ đầu tới lượt chấm cuối");
  assert(sum.hardest.map((h) => `${h.cardId}${h.count}`).join(",") === "c2,b1", "Tổng kết: thẻ quên nhiều nhất trước");
  let many = emptyStats();
  for (let i = 0; i < HARDEST_LIMIT + 5; i++) many = recordGrade(many, `k${i}`, "again", i, i);
  assert(summarize(many).hardest.length === HARDEST_LIMIT, "Tổng kết: tối đa 10 thẻ");
  assert(formatDuration(45_000) === "45 giây", "Thời gian < 1 phút");
  assert(formatDuration(252_000) === "4 phút 12 giây", "Thời gian phút + giây");
  assert(formatDuration(3_900_000) === "1 giờ 5 phút", "Thời gian giờ + phút");

  // Hoàn tác giữ tối đa 20 bước
  let undo: number[] = [];
  for (let i = 0; i < 25; i++) undo = pushUndo(undo, i);
  assert(undo.length === 20 && undo[0] === 5 && undo[19] === 24, "Ngăn hoàn tác bỏ bước cũ nhất");

  // §3.7 học tiếp sau F5
  const now = 10_000_000;
  const valid = new Set(["a", "b", "c"]);
  const raw = serializeSession({ ids: ["b", "x", "c", "b"], size: 5, stats, savedAt: now - 1000 });
  const back = parseSavedSession(raw, valid, now);
  assert(back?.ids.join("") === "bc" && back.size === 5, "Phiên dở: bỏ thẻ đã xoá + trùng, giữ size");
  assert(back?.stats.again.c === 2, "Phiên dở: giữ số lần Lại");
  assert(parseSavedSession(raw, valid, now - 1000 + SAVED_SESSION_MAX_AGE_MS + 1) === null, "Phiên dở quá 12 giờ bị bỏ");
  assert(parseSavedSession("{hỏng", valid, now) === null, "JSON hỏng -> null");
  assert(parseSavedSession(null, valid, now) === null, "Không có bản lưu -> null");
  assert(parseSavedSession(serializeSession({ ids: ["x"], size: 1, stats, savedAt: now }), valid, now) === null,
    "Không còn thẻ hợp lệ -> null");
  assert(parseSavedSession(JSON.stringify({ ids: ["a"], size: 1, stats: { startedAt: 0, lastAt: 0, grades: {}, again: {} }, savedAt: now }), valid, now) === null,
    "Thiếu mức chấm trong stats -> null");
  assert(parseSavedSession(serializeSession({ ids: ["a", "b"], size: 1, stats, savedAt: now }), valid, now)?.size === 2,
    "size không nhỏ hơn số thẻ còn lại");
}
