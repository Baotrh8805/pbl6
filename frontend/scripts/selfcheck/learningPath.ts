// Self-check lộ trình 2.0 đợt cuối: chống gửi trùng (LP-13), bộ thẻ thuộc lộ trình (LP-15), thẻ "Lộ trình học tập" của Tổng quan
// admin (learningPathBreakdown). scripts/selfCheck.ts gọi: await runLearningPathChecks(assert). Hàm thuần; import tương đối + đuôi
// .ts để node chạy trực tiếp (--experimental-strip-types). Async vì khoá chống gửi trùng phải kiểm qua Promise thật.
import { runOnce } from "../../src/lib/inFlight.ts";
import {
  DECK_PATH_NOTICE,
  deckPathLink,
  deleteCardMessage,
  deleteDeckMessage,
  folderLearningPathId,
  mergeLockKey,
} from "../../src/features/roadmap/roadmapUtils.ts";
import { learningPathBreakdown } from "../../src/features/admin/adminUtils.ts";
import type { LearningPath } from "../../src/types/api.types.ts";

export async function runLearningPathChecks(assert: (cond: boolean, msg: string) => void): Promise<void> {
  // ---------- LP-13: bấm đúp không gửi request thứ hai ----------
  const inFlight = new Set<string>();
  let calls = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = runOnce(inFlight, "activate", async () => {
    calls++;
    await gate;
    return "ok";
  });
  const second = runOnce(inFlight, "activate", async () => {
    calls++;
    return "dup";
  });
  assert(calls === 1 && inFlight.has("activate"), "LP-13: lần gọi thứ hai cùng khoá bị bỏ ngay (đồng bộ, trước khi lần đầu xong)");
  const other = runOnce(inFlight, "merge", async () => "merged");
  release();
  assert((await first) === "ok" && (await second) === undefined, "LP-13: lần đầu trả kết quả, lần trùng trả undefined");
  assert((await other) === "merged", "LP-13: khoá khác (gộp chương) không bị chặn bởi kích hoạt");
  assert(!inFlight.has("activate") && !inFlight.has("merge"), "LP-13: xong thì nhả khoá");
  assert((await runOnce(inFlight, "activate", async () => "again")) === "again", "LP-13: nhả khoá rồi bấm lại chạy bình thường");
  let thrown = "";
  try {
    await runOnce(inFlight, "rebalance", async () => {
      throw new Error("409");
    });
  } catch (e) {
    thrown = (e as Error).message;
  }
  assert(thrown === "409" && !inFlight.has("rebalance"), "LP-13: lỗi vẫn ném cho nơi gọi và khoá được nhả (bấm lại được)");
  // Gộp chương: khoá theo từng chương — bấm đúp cùng chương bị chặn, chương khác đang gộp không nuốt cú bấm này.
  let releaseMerge: () => void = () => {};
  const mergeGate = new Promise<void>((resolve) => {
    releaseMerge = resolve;
  });
  const merged: string[] = [];
  const merge3 = runOnce(inFlight, mergeLockKey("c3"), async () => {
    await mergeGate;
    merged.push("c3");
    return "c3";
  });
  const merge3Again = runOnce(inFlight, mergeLockKey("c3"), async () => {
    merged.push("c3-dup");
    return "c3-dup";
  });
  const merge6 = runOnce(inFlight, mergeLockKey("c6"), async () => {
    merged.push("c6");
    return "c6";
  });
  assert((await merge6) === "c6" && (await merge3Again) === undefined, "LP-13: gộp chương khác vẫn gửi khi một chương đang gộp; bấm đúp cùng chương bị bỏ");
  releaseMerge();
  assert((await merge3) === "c3" && merged.join() === "c6,c3" && inFlight.size === 0, "LP-13: mỗi chương gộp đúng một lần, xong nhả hết khoá");

  // ---------- LP-15: bộ thẻ thuộc lộ trình ----------
  const PATH_ID = "7f1c2a9e-0000-4000-8000-000000000001";
  assert(folderLearningPathId(`{"learningPathId":"${PATH_ID}"}`) === PATH_ID, "LP-15: metadata thư mục lộ trình (đúng chuỗi backend ghi) -> id");
  assert(folderLearningPathId(`{ "learningPathId": " ${PATH_ID} ", "color": "red" }`) === PATH_ID, "LP-15: cắt khoảng trắng, bỏ qua khoá khác");
  assert(
    [null, undefined, "", "không phải JSON", "[1]", '"chuỗi"', "null", '{"color":"red"}', '{"learningPathId":5}', '{"learningPathId":"  "}']
      .map(folderLearningPathId)
      .every((v) => v === null),
    "LP-15: metadata trống / hỏng / thiếu khoá / sai kiểu -> không thuộc lộ trình"
  );
  const activePath = {
    id: PATH_ID,
    title: "Minna bài 1–5",
    status: "ACTIVE",
    chapters: [
      { id: "c1", deckId: "d1" },
      { id: "c2", deckId: null },
      { id: "c3", deckId: "d3" },
    ],
  } as unknown as LearningPath;
  const link = deckPathLink(activePath, "d3");
  assert(link?.pathId === PATH_ID && link.pathTitle === "Minna bài 1–5", "LP-15: bộ của một chương -> liên kết tới lộ trình");
  assert(deckPathLink(activePath, "d9") === null, "LP-15: bộ tự tạo thêm trong thư mục lộ trình (không là chương) -> không nhắc");
  assert(
    deckPathLink({ ...activePath, status: "DRAFT" } as LearningPath, "d1") === null &&
      deckPathLink({ ...activePath, chapters: undefined } as LearningPath, "d1") === null &&
      deckPathLink(null, "d1") === null &&
      deckPathLink(activePath, "") === null,
    "LP-15: lộ trình chưa ACTIVE / thiếu chương / không tải được / thiếu id bộ -> không nhắc"
  );
  assert(
    deckPathLink({ ...activePath, title: "  " } as LearningPath, "d1")?.pathTitle === "không tên",
    "LP-15: tên lộ trình trống vẫn ra câu đọc được"
  );
  assert(
    DECK_PATH_NOTICE.includes("không có trong lịch") && DECK_PATH_NOTICE.includes("rời lịch"),
    "LP-15: lời nhắc nói cả thêm thẻ (ngoài lịch) lẫn xoá thẻ (rời lịch)"
  );
  assert(
    deleteCardMessage("学校", null) === 'Thẻ "学校" sẽ bị xoá khỏi bộ thẻ, kèm lịch sử ôn tập của thẻ này.' &&
      deleteCardMessage("学校", link) ===
        'Thẻ "学校" sẽ bị xoá khỏi bộ thẻ, kèm lịch sử ôn tập của thẻ này và rời lịch của lộ trình «Minna bài 1–5».',
    "LP-15: xác nhận xoá thẻ nói rõ thẻ rời lịch lộ trình; bộ thường giữ câu cũ"
  );
  assert(
    deleteDeckMessage("Bài 1", null) === 'Bộ thẻ "Bài 1" và toàn bộ thẻ từ vựng bên trong sẽ bị xoá vĩnh viễn.' &&
      deleteDeckMessage("Bài 1", link) ===
        'Bộ thẻ "Bài 1" và toàn bộ thẻ từ vựng bên trong sẽ bị xoá vĩnh viễn; mọi thẻ của chương này rời lịch của lộ trình «Minna bài 1–5».',
    "LP-15: xác nhận xoá cả bộ của một chương cũng nhắc lộ trình (nặng hơn xoá một thẻ); bộ thường giữ câu cũ"
  );

  // ---------- Admin: thẻ "Lộ trình học tập" (stats.learningPathBreakdown) ----------
  assert(learningPathBreakdown(10, null) === null && learningPathBreakdown(10, undefined) === null, "Admin LP: backend cũ thiếu breakdown -> ẩn thẻ");
  const view = learningPathBreakdown(10, { active: 5, completed: 2, failed: 1, remedial: 3, draft: 1 })!;
  assert(
    view.segments.map((s) => `${s.key}:${s.label}:${s.value}:${s.pct}`).join("|") ===
      "active:Đang học:5:50|completed:Hoàn thành:2:20|draft:Bản nháp:1:10|failed:Thất bại:1:10|processing:Đang xử lý:1:10",
    "Admin LP: đủ 5 mục theo thứ tự, nhãn tiếng Việt; Đang xử lý = tổng − bốn nhóm (PROCESSING không đếm riêng)"
  );
  assert(view.total === 10 && view.remedial === 3 && view.remedialPct === 30, "Admin LP: bổ khuyết đếm chéo, % theo tổng");
  assert(view.segments.reduce((a, s) => a + s.pct, 0) === 100, "Admin LP: có lộ trình đang xử lý -> các % cộng đủ 100");
  const race = learningPathBreakdown(3, { active: 2, completed: 1, failed: 1, remedial: 9, draft: 0 })!;
  assert(
    race.total === 4 && race.segments[4].value === 0 && race.segments[4].pct === 0 && race.remedial === 4,
    "Admin LP: đếm lệch nhau (tổng < tổng nhóm) -> tổng = tổng nhóm, không có Đang xử lý âm, bổ khuyết không vượt tổng"
  );
  const empty = learningPathBreakdown(0, { active: 0, completed: 0, failed: 0, remedial: 0, draft: 0 })!;
  assert(empty.total === 0 && empty.segments.every((s) => s.value === 0 && s.pct === 0) && empty.remedialPct === 0, "Admin LP: chưa có lộ trình -> mọi mục 0 %");
  const thirds = learningPathBreakdown(3, { active: 1, completed: 1, failed: 0, remedial: 0, draft: 1 })!;
  assert(thirds.segments[4].pct === 0, "Admin LP: không có lộ trình đang xử lý -> 0 % dù làm tròn lệch (như Cơ cấu Bóc tách)");
  const junk = learningPathBreakdown(Number.NaN, { active: -2, completed: Number.NaN, failed: 1.7, remedial: -1, draft: 2 })!;
  assert(
    junk.total === 3 && junk.segments.map((s) => s.value).join() === "0,0,2,1,0" && junk.remedial === 0,
    "Admin LP: số âm / NaN / lẻ từ server -> 0 hoặc làm tròn xuống, không vỡ thanh"
  );
}
