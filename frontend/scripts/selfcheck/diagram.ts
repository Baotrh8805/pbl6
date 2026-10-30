// Self-check sơ đồ chữ Hán (spec 2026-10-30 §3.5): bố cục theo cung tất định, gộp đồ thị khi mở node, đặt node mới quanh
// node mẹ, khung nhìn vừa sơ đồ, nhãn cạnh. scripts/selfCheck.ts gọi: runDiagramChecks(assert).
import {
  DIAGRAM_SIZE,
  clientToDiagram,
  diagramKey,
  diagramStats,
  edgeLabel,
  fitViewBox,
  isGuessedPhonEdge,
  mergeDiagram,
  panViewBox,
  placeAround,
  sectorLayout,
  showWordTab,
  wordLayout,
  zoomViewBox,
} from "../../src/features/graph/diagramLayout.ts";
import { restoredSearch, searchToRemember } from "../../src/features/graph/diagramMemory.ts";
import type { KanjiDiagramEdge, KanjiDiagramNode } from "../../src/types/kanjiDiagram.types.ts";

export function runDiagramChecks(assert: (cond: boolean, msg: string) => void): void {
  const structureNodes: KanjiDiagramNode[] = [
    { id: "k:時", type: "center", label: "時", hanViet: "THỜI" },
    { id: "k:日", type: "component", label: "日", role: "radical", position: "left" },
    { id: "k:寺", type: "component", label: "寺", role: "phon", position: "right", expandable: true },
    { id: "k:持", type: "phonetic", label: "持", sameOn: true },
    { id: "k:待", type: "phonetic", label: "待", sameOn: false },
    { id: "k:特", type: "phonetic", label: "特", sameOn: false },
    { id: "k:等", type: "phonetic", label: "等", sameOn: false },
    { id: "k:詩", type: "phonetic", label: "詩", sameOn: false },
    { id: "k:侍", type: "phonetic", label: "侍", sameOn: true },
  ];
  const structureEdges: KanjiDiagramEdge[] = [
    { from: "k:日", to: "k:時", type: "radical" },
    { from: "k:寺", to: "k:時", type: "phon" },
    { from: "k:寺", to: "k:持", type: "phon" },
    { from: "k:寺", to: "k:待", type: "family" },
    { from: "k:寺", to: "k:特", type: "family" },
    { from: "k:寺", to: "k:等", type: "family" },
    { from: "k:寺", to: "k:詩", type: "family" },
    { from: "k:寺", to: "k:侍", type: "phon" },
  ];
  const size = DIAGRAM_SIZE;
  const c = size / 2;

  // ---- bố cục Cấu tạo --------------------------------------------------------------------------------------------------
  const a = sectorLayout(structureNodes, structureEdges, "k:時", size);
  const b = sectorLayout(structureNodes, structureEdges, "k:時", size);
  assert(JSON.stringify(a) === JSON.stringify(b), "Bố cục: tất định");
  assert(a["k:時"].x === c && a["k:時"].y === c, "Bố cục: chữ tâm ở giữa");
  assert(a["k:日"].x < c && a["k:寺"].x < c, "Bố cục: thành phần cấu tạo ở cung bên trái tâm");
  assert(a["k:日"].y < a["k:寺"].y, "Bố cục: thành phần theo thứ tự viết từ trên xuống");
  assert(["k:持", "k:待", "k:特", "k:等", "k:詩", "k:侍"].every((id) => a[id].x > c), "Bố cục: họ chỉ âm quạt bên phải tâm");
  assert(Object.keys(a).length === structureNodes.length, "Bố cục: mọi node có toạ độ");
  const margin = 40;
  assert(
    Object.values(a).every((p) => p.x >= margin && p.x <= size - margin && p.y >= margin && p.y <= size - margin),
    "Bố cục: mọi node trong hộp có lề"
  );
  const ids = Object.keys(a);
  const minGap = Math.min(...ids.flatMap((n, i) => ids.slice(i + 1).map((m) => Math.hypot(a[n].x - a[m].x, a[n].y - a[m].y))));
  assert(minGap > 56, `Bố cục: không có hai node chồng nhau (khoảng cách nhỏ nhất ${minGap.toFixed(0)})`);
  assert(Object.keys(sectorLayout([], [], null, size)).length === 0, "Bố cục: đồ thị rỗng → không toạ độ");
  const solo = sectorLayout([structureNodes[0]], [], "k:時", size);
  assert(solo["k:時"].x === c, "Bố cục: chỉ có tâm vẫn ở giữa");

  // ---- bố cục Từ ghép ---------------------------------------------------------------------------------------------------
  const compoundNodes: KanjiDiagramNode[] = [
    { id: "k:時", type: "center", label: "時" },
    { id: "w:時間", type: "word", label: "時間", reading: "じかん", jlpt: "N5" },
    { id: "k:間", type: "kanji", label: "間" },
    { id: "w:時代", type: "word", label: "時代", reading: "じだい", jlpt: "N4" },
    { id: "k:代", type: "kanji", label: "代" },
    { id: "w:時計", type: "word", label: "時計", reading: "とけい", jlpt: "N5" },
    { id: "k:計", type: "kanji", label: "計" },
    { id: "w:当時", type: "word", label: "当時", reading: "とうじ", jlpt: "N3" },
    { id: "k:当", type: "kanji", label: "当" },
  ];
  const compoundEdges: KanjiDiagramEdge[] = [
    { from: "k:時", to: "w:時間", type: "compound" },
    { from: "w:時間", to: "k:間", type: "contains" },
    { from: "k:時", to: "w:時代", type: "compound" },
    { from: "w:時代", to: "k:代", type: "contains" },
    { from: "k:時", to: "w:時計", type: "compound" },
    { from: "w:時計", to: "k:計", type: "contains" },
    { from: "k:時", to: "w:当時", type: "compound" },
    { from: "w:当時", to: "k:当", type: "contains" },
  ];
  const w = sectorLayout(compoundNodes, compoundEdges, "k:時", size);
  const dist = (id: string) => Math.hypot(w[id].x - c, w[id].y - c);
  assert(["w:時間", "w:時代", "w:時計", "w:当時"].every((id) => Math.abs(dist(id) - dist("w:時間")) < 1), "Từ ghép: xếp vòng đều quanh tâm");
  assert(dist("k:間") > dist("w:時間") && dist("k:代") > dist("w:時代"), "Từ ghép: chữ khác trong từ nằm ngoài vòng từ");
  const ang = (id: string) => Math.atan2(w[id].y - c, w[id].x - c);
  assert(Math.abs(ang("k:間") - ang("w:時間")) < 0.05, "Từ ghép: chữ khác nằm trên tia của từ chứa nó");
  const wIds = Object.keys(w);
  const wGap = Math.min(...wIds.flatMap((n, i) => wIds.slice(i + 1).map((m) => Math.hypot(w[n].x - w[m].x, w[n].y - w[m].y))));
  assert(wGap > 56, `Từ ghép: không chồng node (khoảng cách nhỏ nhất ${wGap.toFixed(0)})`);

  // ---- gộp khi mở node + đặt node mới quanh node mẹ -------------------------------------------------------------------------
  const extra = {
    nodes: [
      { id: "k:寺", type: "center", label: "寺", expandable: true },           // trùng → giữ node cũ của sơ đồ gốc
      { id: "k:土", type: "component", label: "土", role: "phon" },
      { id: "k:寸", type: "component", label: "寸", role: "radical" },
    ] as KanjiDiagramNode[],
    edges: [
      { from: "k:土", to: "k:寺", type: "phon" },
      { from: "k:寸", to: "k:寺", type: "radical" },
      { from: "k:寺", to: "k:時", type: "phon" },                                // trùng cạnh → bỏ
    ] as KanjiDiagramEdge[],
  };
  const merged = mergeDiagram({ nodes: structureNodes, edges: structureEdges }, extra);
  assert(merged.nodes.length === structureNodes.length + 2, "Gộp: node trùng id không thêm lại");
  assert(merged.nodes.find((n) => n.id === "k:寺")?.type === "component", "Gộp: node cũ thắng node mới cùng id");
  assert(merged.edges.length === structureEdges.length + 2, "Gộp: cạnh trùng (from, to, type) không thêm lại");
  assert(merged.nodes !== structureNodes && merged.edges !== structureEdges, "Gộp: không sửa mảng gốc");

  const placed = placeAround(a["k:寺"], ["k:土", "k:寸"], a, 96);
  assert(Object.keys(placed).length === 2 && !("k:寺" in placed), "Đặt quanh: chỉ trả toạ độ node mới");
  const far = (id: string) => Math.min(...ids.map((o) => Math.hypot(placed[id].x - a[o].x, placed[id].y - a[o].y)));
  assert(far("k:土") > 48 && far("k:寸") > 48, "Đặt quanh: node mới không đè lên node cũ");
  assert(Math.abs(Math.hypot(placed["k:土"].x - a["k:寺"].x, placed["k:土"].y - a["k:寺"].y) - 96) < 1, "Đặt quanh: cách node mẹ đúng bán kính");
  assert(Math.hypot(placed["k:土"].x - placed["k:寸"].x, placed["k:土"].y - placed["k:寸"].y) > 48, "Đặt quanh: hai node mới không chồng nhau");
  assert(JSON.stringify(placeAround(a["k:寺"], [], a, 96)) === "{}", "Đặt quanh: không id → rỗng");

  // ---- khung nhìn vừa sơ đồ ---------------------------------------------------------------------------------------------
  const vb = fitViewBox(a, 48);
  const xs = Object.values(a).map((p) => p.x);
  const ys = Object.values(a).map((p) => p.y);
  assert(vb.x <= Math.min(...xs) - 48 && vb.y <= Math.min(...ys) - 48, "Khung nhìn: bao hết node phía trên / trái với lề");
  assert(vb.x + vb.w >= Math.max(...xs) + 48 && vb.y + vb.h >= Math.max(...ys) + 48, "Khung nhìn: bao hết node phía dưới / phải với lề");
  const empty = fitViewBox({}, 48);
  assert(empty.w > 0 && empty.h > 0, "Khung nhìn: sơ đồ rỗng vẫn có kích thước dương");

  // ---- zoom / pan khung nhìn (đợt 2) -------------------------------------------------------------------------------------------
  const base = { x: 0, y: 0, w: 720, h: 720 };
  const focus = { x: 500, y: 200 };
  const zin = zoomViewBox(base, 2, focus, base);
  assert(Math.abs(zin.w - 360) < 0.01 && Math.abs(zin.h - 360) < 0.01, "Zoom: hệ số 2 → khung nhỏ một nửa");
  // điểm dưới con trỏ đứng yên: tỉ lệ vị trí của focus trong khung không đổi
  const rel = (vb: { x: number; y: number; w: number; h: number }) => [(focus.x - vb.x) / vb.w, (focus.y - vb.y) / vb.h];
  assert(rel(zin).every((v, i) => Math.abs(v - rel(base)[i]) < 1e-9), "Zoom: điểm dưới con trỏ đứng yên");
  const zmax = zoomViewBox(base, 100, focus, base);
  assert(Math.abs(zmax.w - base.w / 3) < 0.01, "Zoom: không phóng quá 3 lần");
  const zmin = zoomViewBox(base, 0.01, focus, base);
  assert(Math.abs(zmin.w - base.w / 0.4) < 0.01, "Zoom: không thu nhỏ dưới 0,4 lần");
  assert(JSON.stringify(zoomViewBox(base, 1, focus, base)) === JSON.stringify(base), "Zoom: hệ số 1 giữ nguyên");
  const pan = panViewBox(zin, 30, -20);
  assert(pan.x === zin.x - 30 && pan.y === zin.y + 20 && pan.w === zin.w, "Pan: kéo sang phải 30 px = khung dịch trái 30, kích thước giữ");

  // toạ độ chuột → toạ độ sơ đồ (preserveAspectRatio xMidYMid meet): SVG rộng hơn khung → lề hai bên
  const rect = { left: 100, top: 50, width: 1000, height: 500 };
  const centre = clientToDiagram(rect, base, 600, 300);
  assert(Math.abs(centre.x - 360) < 1e-9 && Math.abs(centre.y - 360) < 1e-9, "Chuột → sơ đồ: giữa SVG là giữa khung nhìn");
  const topLeft = clientToDiagram(rect, base, 100 + 250, 50);
  assert(Math.abs(topLeft.x) < 1e-9 && Math.abs(topLeft.y) < 1e-9, "Chuột → sơ đồ: mép trái của vùng vẽ (sau lề) là x = 0");
  const scaled = clientToDiagram(rect, { x: 100, y: 100, w: 360, h: 360 }, 600, 300);
  assert(Math.abs(scaled.x - 280) < 1e-9 && Math.abs(scaled.y - 280) < 1e-9, "Chuột → sơ đồ: khung đã zoom / pan");

  // ---- bố cục Phân tích từ (spec 30/10 từ nhiều chữ §4) ----------------------------------------------------------------
  const wordNodes = (chars: string[], parts: Record<string, string[]>): KanjiDiagramNode[] => [
    { id: "w:" + chars.join(""), type: "word", label: chars.join("") },
    ...chars.map((ch): KanjiDiagramNode => ({ id: "k:" + ch, type: "kanji", label: ch })),
    ...Object.values(parts).flat().map((p): KanjiDiagramNode => ({ id: "k:" + p, type: "component", label: p, role: "part" })),
  ];
  const wordEdges = (chars: string[], parts: Record<string, string[]>): KanjiDiagramEdge[] => [
    ...chars.map((ch): KanjiDiagramEdge => ({ from: "w:" + chars.join(""), to: "k:" + ch, type: "contains" })),
    ...Object.entries(parts).flatMap(([ch, ps]) => ps.map((p): KanjiDiagramEdge => ({ from: "k:" + p, to: "k:" + ch, type: "part" }))),
  ];
  const gParts = { 学: ["⺍", "冖", "子"] };
  const w2 = wordLayout(wordNodes(["学", "生"], gParts), wordEdges(["学", "生"], gParts), "w:学生", size);
  assert(w2["w:学生"].x === c && w2["w:学生"].y === c, "Phân tích từ: từ ở giữa");
  assert(w2["k:学"].x < c && w2["k:生"].x > c, "Phân tích từ: 2 chữ trái – phải theo thứ tự");
  // ảnh người dùng 30/10 (企業): vòng tròn + nhãn Hán-Việt bên dưới đè nhau → mọi cặp node cách nhau ≥ 84 (đường kính 44 + nhãn)
  const minPair = (pos: Record<string, { x: number; y: number }>) => {
    const ks = Object.keys(pos);
    return Math.min(...ks.flatMap((n, i) => ks.slice(i + 1).map((m) => Math.hypot(pos[n].x - pos[m].x, pos[n].y - pos[m].y))));
  };
  const kParts = { 企: ["人", "止"], 業: ["业", "羊", "木"] };
  const wk = wordLayout(wordNodes(["企", "業"], kParts), wordEdges(["企", "業"], kParts), "w:企業", size);
  assert(minPair(wk) >= 84, `Phân tích từ: 企業 không có hai node đè nhau (gần nhất ${minPair(wk).toFixed(0)})`);
  const fourParts = { 図: ["囗", "义"], 書: ["聿", "曰", "一"], 館: ["食", "官", "宀"], 員: ["口", "貝"] };
  const w4 = wordLayout(wordNodes(["図", "書", "館", "員"], fourParts), wordEdges(["図", "書", "館", "員"], fourParts), "w:図書館員", size);
  assert(minPair(w4) >= 84, `Phân tích từ: 4 chữ × 2–3 thành phần không đè nhau (gần nhất ${minPair(w4).toFixed(0)})`);
  const manyParts = { 鬱: ["林", "缶", "冖", "鬯", "彡"], 学: ["⺍", "冖", "子"] };
  const wm = wordLayout(wordNodes(["鬱", "学"], manyParts), wordEdges(["鬱", "学"], manyParts), "w:鬱学", size);
  assert(minPair(wm) >= 84, `Phân tích từ: chữ 5 thành phần không đè nhau (gần nhất ${minPair(wm).toFixed(0)})`);
  // người dùng 30/10: từ 2 chữ trải ngang (企業 rộng / cao 2,4) → quạt chéo, khung vừa sơ đồ rộng / cao ≤ 1,5
  const aspect = (pos: Record<string, { x: number; y: number }>) => {
    const vb = fitViewBox(pos, 64);
    return vb.w / vb.h;
  };
  const wg = wordLayout(wordNodes(["学", "生"], gParts), wordEdges(["学", "生"], gParts), "w:学生", size);
  for (const [name, pos] of [["企業", wk], ["学生", wg], ["鬱学", wm]] as const) {
    assert(aspect(pos) <= 1.5, `Phân tích từ: ${name} không trải ngang quá (rộng / cao ${aspect(pos).toFixed(2)})`);
  }
  assert(minPair(wg) >= 84, `Phân tích từ: 学生 không có hai node đè nhau (gần nhất ${minPair(wg).toFixed(0)})`);
  assert(["⺍", "冖", "子"].every((p) => Math.hypot(w2["k:" + p].x - c, w2["k:" + p].y - c) > Math.hypot(w2["k:学"].x - c, w2["k:学"].y - c)),
    "Phân tích từ: thành phần nằm xa tâm hơn chữ của nó");
  assert(JSON.stringify(w2) === JSON.stringify(wordLayout(wordNodes(["学", "生"], gParts), wordEdges(["学", "生"], gParts), "w:学生", size)),
    "Phân tích từ: tất định");
  for (const chars of [["日", "本", "語"], ["図", "書", "館", "員"]]) {
    const wl = wordLayout(wordNodes(chars, {}), wordEdges(chars, {}), "w:" + chars.join(""), size);
    assert(chars.every((ch) => Math.abs(Math.hypot(wl["k:" + ch].x - c, wl["k:" + ch].y - c) - 0.24 * size) <= 1),
      `Phân tích từ: ${chars.length} chữ trên vòng 0,24 cạnh`);
  }
  // review 30/10: từ có 々 / chữ lặp (人々 → chars [人]) vẫn có tab Phân tích từ; cụm > 4 chữ thì không
  assert(showWordTab("人々", ["人"]) && showWordTab("学生", ["学", "生"]), "Tab Phân tích từ: hiện cho từ, kể cả 人々");
  assert(!showWordTab(null, ["日", "本", "語", "能", "力"]) && !showWordTab(null, []), "Tab Phân tích từ: ẩn khi không có từ");
  // review 30/10: chỉ âm đoán ở chế độ từ trỏ vào k:X chứ không vào tâm w:… mà vẫn phải nét đứt + chỉ âm?
  const gEdge: KanjiDiagramEdge = { from: "k:肋", to: "k:筋", type: "phon" };
  assert(isGuessedPhonEdge(gEdge, { id: "k:肋", type: "component", label: "肋", guess: true }, "w:一筋", "word"), "Chỉ âm đoán: chế độ từ vẫn đánh dấu");
  assert(!isGuessedPhonEdge(gEdge, { id: "k:肋", type: "component", label: "肋" }, "w:一筋", "word"), "Chỉ âm chắc chắn: không đánh dấu");
  assert(!isGuessedPhonEdge({ from: "k:寺", to: "k:持", type: "phon" }, { id: "k:寺", type: "component", label: "寺", guess: true }, "k:時", "sector"), "Cấu tạo: chỉ cạnh vào tâm mới là chỉ âm đoán");
  assert(diagramKey("学生", null, null) !== diagramKey("学生", "structure", "生"), "Khoá overlay gồm mode và k");
  assert(diagramKey("学生", "structure", "学") !== diagramKey("学生", "structure", "生"), "Khoá overlay: chữ khác trong từ là khoá khác");

  // ---- nhãn cạnh, thống kê --------------------------------------------------------------------------------------------------
  assert(edgeLabel("phon") === "chỉ âm" && edgeLabel("family") === "cùng phần chỉ âm" && edgeLabel("radical") === "bộ", "Nhãn cạnh: chỉ âm / cùng phần chỉ âm / bộ");
  assert(edgeLabel("compound") === "ghép thành từ" && edgeLabel("contains") === "có chữ" && edgeLabel("part") === "thành phần", "Nhãn cạnh: từ ghép / có chữ / thành phần");
  // ---- nhớ câu tìm khi rời trang (sidebar dẫn về /graph không có ?q=) -----------------------------------------------------
  assert(searchToRemember(new URLSearchParams("q=学生&mode=structure&k=生&x=1")) === "q=%E5%AD%A6%E7%94%9F&mode=structure&k=%E7%94%9F", "Nhớ: chỉ q / mode / k");
  assert(searchToRemember(new URLSearchParams("mode=word")) === null, "Nhớ: không có q thì không ghi");
  assert(restoredSearch(new URLSearchParams(""), "q=%E5%AD%A6%E7%94%9F&k=%E7%94%9F")?.get("k") === "生", "Khôi phục: mở /graph trống thì lấy câu tìm đã nhớ");
  assert(restoredSearch(new URLSearchParams("q=時"), "q=学生") === null, "Khôi phục: URL đã có q thì không đè");
  assert(restoredSearch(new URLSearchParams(""), null) === null && restoredSearch(new URLSearchParams(""), "mode=word") === null, "Khôi phục: không có gì đã nhớ / dữ liệu hỏng");
  assert(restoredSearch(new URLSearchParams(""), "q=" + "x".repeat(40)) === null, "Khôi phục: q quá 32 ký tự thì bỏ");
  assert(diagramStats(structureNodes) === "9 chữ", "Thống kê: chỉ chữ");
  assert(diagramStats(compoundNodes) === "5 chữ · 4 từ ghép", "Thống kê: chữ + từ ghép");
}
