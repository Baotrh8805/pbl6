// Self-check đồ thị tri thức (spec 2026-10-27 §9, §11): bố cục lực tất định trong hộp, BFS, tách [n] trong câu trả lời, link mở
// node, viền tình trạng học, chuyển node từ → hộp Thêm vào bộ thẻ. scripts/selfCheck.ts gọi: runGraphChecks(assert).
import {
  bfsDepth,
  edgesOf,
  forceLayout,
  groupByType,
  learnerStroke,
  learnerText,
  nodeHref,
  nodeText,
  splitAnswer,
  wordNodeForDeck,
} from "../../src/lib/graphLayout.ts";
import type { GraphEdge, GraphNode } from "../../src/types/graph.types.ts";

export function runGraphChecks(assert: (cond: boolean, msg: string) => void): void {
  const nodes: GraphNode[] = [
    { id: "w:1", type: "word", label: "食べる", key: "w:1", term: "食べる", reading: "たべる", vi: "ăn", gloss: "to eat", jlpt: "N5", learner: { cards: 1, reviewed: 1, due: 1, again30d: 2 } },
    { id: "k:食", type: "kanji", label: "食", char: "食", hanViet: "THỰC", strokes: 9, radicalNo: 184, learner: { cards: 2, reviewed: 1, due: 0, again30d: 0 } },
    { id: "rad:184", type: "radical", label: "食", no: 184, nameVi: "thực" },
    { id: "h:THỰC", type: "hanviet", label: "THỰC", reading: "THỰC" },
    { id: "s:1", type: "sentence", label: "もっと果物を食べるべきです。", jpn: "もっと果物を食べるべきです。", vi: "Nên ăn nhiều hoa quả." },
    { id: "g:beki", type: "grammar", label: "〜べき", name: "〜べき", level: "N3" },
    { id: "card:c1", type: "card", label: "食べる", deckId: "d1", learner: { cards: 1, reviewed: 0, due: 0, again30d: 0 } },
    { id: "d:d1", type: "deck", label: "Bài 1" },
    { id: "k:飲", type: "kanji", label: "飲", char: "飲" },
  ];
  const edges: GraphEdge[] = [
    { from: "w:1", to: "k:食", type: "contains" },
    { from: "k:食", to: "rad:184", type: "has_radical" },
    { from: "k:食", to: "h:THỰC", type: "read_as" },
    { from: "s:1", to: "w:1", type: "example_of" },
    { from: "s:1", to: "g:beki", type: "uses_grammar" },
    { from: "card:c1", to: "w:1", type: "means" },
    { from: "d:d1", to: "card:c1", type: "has_card" },
  ];

  // ---- BFS + bố cục lực --------------------------------------------------------------------------------------------
  const depth = bfsDepth(nodes, edges, "w:1");
  assert(depth["w:1"] === 0 && depth["k:食"] === 1 && depth["rad:184"] === 2 && depth["g:beki"] === 2, "BFS: bậc theo cạnh vô hướng");
  assert(depth["d:d1"] === 2 && depth["k:飲"] === 3, "BFS: node không nối = bậc lớn nhất + 1");
  const size = 600;
  const a = forceLayout(nodes, edges, size, "w:1");
  const b = forceLayout(nodes, edges, size, "w:1");
  assert(JSON.stringify(a) === JSON.stringify(b), "Bố cục: tất định (cùng dữ liệu → cùng toạ độ)");
  assert(a["w:1"].x === size / 2 && a["w:1"].y === size / 2, "Bố cục: node tâm ghim giữa");
  const margin = Math.max(24, size * 0.06);
  assert(
    Object.values(a).every((p) => p.x >= margin && p.x <= size - margin && p.y >= margin && p.y <= size - margin),
    "Bố cục: mọi node trong hộp có lề"
  );
  const minGap = Math.min(
    ...nodes.flatMap((n, i) => nodes.slice(i + 1).map((m) => Math.hypot(a[n.id].x - a[m.id].x, a[n.id].y - a[m.id].y)))
  );
  assert(minGap > 40, `Bố cục: không có hai node chồng lên nhau (khoảng cách nhỏ nhất ${minGap.toFixed(0)})`);
  assert(Object.keys(forceLayout([], [], size, null)).length === 0, "Bố cục: đồ thị rỗng → không toạ độ");
  const solo = forceLayout([{ id: "x" }], [], size, null);
  assert(solo.x.x >= margin && solo.x.x <= size - margin, "Bố cục: một node không tâm vẫn trong hộp");

  // ---- câu trả lời GraphRAG ------------------------------------------------------------------------------------------
  const segs = splitAnswer("食べる nghĩa là ăn [1], chứa chữ 食 [2]. Xem [x] và [123].");
  assert(segs.filter((s) => s.ref !== undefined).map((s) => s.ref).join(",") === "1,2", "Trả lời: chỉ [n] 1–2 chữ số thành mốc nguồn");
  assert(segs[0].text === "食べる nghĩa là ăn " && segs[segs.length - 1].text === ". Xem [x] và [123].", "Trả lời: giữ nguyên chữ quanh mốc");
  assert(splitAnswer("").length === 0 && splitAnswer("không nguồn").length === 1, "Trả lời: rỗng / không mốc");

  // ---- link, nhãn, viền ----------------------------------------------------------------------------------------------
  assert(nodeHref(nodes[0]) === "/dictionary?e=w%3A1", "Link: từ mở mục từ điển theo khoá");
  assert(nodeHref(nodes[1]) === "/dictionary?tab=kanji&k=%E9%A3%9F", "Link: chữ Hán mở tab Hán tự");
  assert(nodeHref(nodes[2]) === "/dictionary?tab=kanji&sub=radicals&r=184", "Link: bộ thủ mở bảng bộ thủ");
  assert(nodeHref(nodes[3]) === "/dictionary?tab=hanviet&reading=TH%E1%BB%B0C", "Link: âm Hán-Việt mở bản đồ");
  assert(nodeHref(nodes[6]) === "/decks/d1" && nodeHref(nodes[7]) === "/decks/d1", "Link: thẻ / bộ thẻ mở trang bộ thẻ");
  assert(nodeHref(nodes[5]) === null, "Link: mẫu ngữ pháp không có trang riêng");
  assert(nodeText({ id: "s", type: "sentence", label: "一二三四五六七八九十十一" }) === "一二三四五六七八九…", "Nhãn: câu dài cắt 9 ký tự + …");
  assert(nodeText(nodes[0]) === "食べる", "Nhãn: từ ngắn giữ nguyên");
  assert(learnerStroke(nodes[0]) === "stroke-error" && learnerStroke(nodes[1]) === "stroke-secondary" && learnerStroke(nodes[6]) === "stroke-primary", "Viền: đến hạn > đã ôn > có thẻ");
  assert(learnerStroke(nodes[8]) === null && learnerStroke({ ...nodes[0], learner: { cards: 0, reviewed: 0, due: 0, again30d: 0 } }) === null, "Viền: không thẻ → không viền");
  assert(learnerText(nodes[0]) === "1 thẻ của bạn · 1 đến hạn ôn · sai 2 lần / 30 ngày", "Chữ tình trạng học: đủ ba phần");
  assert(learnerText(nodes[6]) === "1 thẻ của bạn · chưa ôn lần nào", "Chữ tình trạng học: chưa ôn");

  // ---- gom loại, cạnh của node, từ → hộp thêm thẻ -----------------------------------------------------------------------
  const groups = groupByType(nodes);
  assert(groups[0].type === "kanji" && groups[0].nodes.length === 2 && groups.length === 8, "Gom theo loại: nhiều node trước");
  const rel = edgesOf("w:1", edges);
  assert(rel.length === 3 && rel.find((r) => r.other === "k:食")?.outward === true && rel.find((r) => r.other === "s:1")?.outward === false, "Cạnh của node: đúng chiều");
  const w = wordNodeForDeck(nodes[0]);
  assert(w !== null && w.label === "食べる" && w.reading === "たべる" && w.meaning === "ăn" && w.level === "N5", "Thêm vào bộ thẻ: từ → nghĩa Việt trước");
  assert(wordNodeForDeck({ ...nodes[0], vi: undefined })?.meaning === "to eat", "Thêm vào bộ thẻ: không có nghĩa Việt → gloss Anh");
  assert(wordNodeForDeck(nodes[1]) === null, "Thêm vào bộ thẻ: chữ Hán không thêm được");
}
