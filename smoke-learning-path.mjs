// Lộ trình học tập end-to-end: cần backend + ai-service THẬT (SudachiPy, JLPT, JMdict) đang chạy ở AI_SERVICE_URL.
// Chạy trên DB cô lập: npm run e2e   |   Thủ công: node smoke-learning-path.mjs (backend 8080 qua frontend 5173 + ai-service 8000)
// Không có ai-service: lộ trình FAILED -> script báo lỗi rõ thay vì treo.
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://localhost:5173/api";
const pw = "Secret123!";
const TEXT = "第1課\n私は毎日日本語を勉強します。学校へ行きます。\n第2課\n友達と図書館で本を読みます。";
const DAYS = 3;

let token = null;
async function api(method, path, body, raw = false) {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
            ...(raw ? {} : { "Content-Type": "application/json" }),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: raw ? body : JSON.stringify(body) }),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data, text };
}

async function signUp() {
    const email = `path-${Date.now()}@test.com`;
    let r = await api("POST", "/auth/register", { email, password: pw, fullName: "Path" });
    assert.equal(r.status, 200, `register: ${r.status} ${r.text}`);
    r = await api("POST", "/auth/login", { email, password: pw });
    assert.equal(r.status, 200, `login: ${r.status} ${r.text}`);
    return r.data.accessToken;
}

async function waitDraft(id) {
    for (let i = 0; i < 120; i++) {
        const r = await api("GET", `/learning-paths/${id}`);
        assert.equal(r.status, 200, r.text);
        if (r.data.status === "DRAFT") return r.data;
        if (r.data.status === "FAILED") throw new Error(`lộ trình FAILED: ${r.data.errorMessage ?? r.data.job?.errorMessage}`);
        await new Promise((res) => setTimeout(res, 1000));
    }
    throw new Error("lộ trình không xong sau 120s");
}

function localToday() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const sumCards = (p) => p.chapters.reduce((s, c) => s + (c.cardCount ?? 0), 0);

const failures = [];
async function section(name, fn) {
    try {
        await fn();
        console.log(`  ok   ${name}`);
    } catch (e) {
        failures.push(name);
        console.log(`  FAIL ${name}: ${e.message}`);
    }
}

console.log("smoke-learning-path @", BASE);
token = await signUp();
let pathId = null;
let draft = null;
let before = 0;
let deckId = null;

await section("tạo lộ trình từ văn bản -> DRAFT, chương phủ đủ 3 ngày", async () => {
    const form = new FormData();
    form.append("text", TEXT);
    form.append("days", String(DAYS));
    form.append("options", JSON.stringify({ userLevel: "N5", levelFilter: "all", meaningLang: "en" }));
    const r = await api("POST", "/learning-paths", form, true);
    assert.equal(r.status, 202, r.text);
    assert.equal(r.data.status, "PROCESSING");
    pathId = r.data.id;
    draft = await waitDraft(pathId);
    console.log(`       chaptersDetected=${draft.chaptersDetected}, chapters=${draft.chapters.length}`);
    assert.ok(draft.chapters.length >= 1, JSON.stringify(draft.chapters));
    assert.equal(draft.chapters[0].dayFrom, 1);
    assert.equal(draft.chapters[draft.chapters.length - 1].dayTo, DAYS);
    before = sumCards(draft);
    assert.ok(before >= 1, `không có thẻ nào: ${JSON.stringify(draft.chapters)}`);
});

await section("danh sách chương có item; bỏ chọn một item -> cardCount giảm", async () => {
    const cid = draft.chapters[0].id;
    const items = await api("GET", `/learning-paths/${pathId}/chapters/${cid}/items`);
    assert.equal(items.status, 200, items.text);
    assert.ok(items.data.length > 0, "chương đầu không có item");
    const r = await api("PATCH", `/learning-paths/${pathId}/items`, [{ id: items.data[0].id, selected: false }]);
    assert.equal(r.status, 200, r.text);
    const p = await api("GET", `/learning-paths/${pathId}`);
    assert.equal(p.status, 200, p.text);
    const after = sumCards(p.data);
    assert.ok(after < before, `cardCount không giảm: ${before} -> ${after}`);
    draft = p.data;
});

await section("đổi tên lộ trình", async () => {
    const r = await api("PATCH", `/learning-paths/${pathId}`, { title: "Smoke path" });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.data.title, "Smoke path");
});

await section("kích hoạt có trần thẻ / ngày và ngày học -> ACTIVE, mỗi chương có bộ thẻ, hôm nay có mảng tasks", async () => {
    const r = await api("POST", `/learning-paths/${pathId}/activate`, { startDate: localToday(), dailyCap: 20, studyDays: "1111111" });
    assert.equal(r.status, 201, r.text);
    assert.equal(r.data.status, "ACTIVE");
    assert.equal(r.data.dailyCap, 20, "trần thẻ / ngày được lưu");
    assert.equal(r.data.studyDays, "1111111", "ngày học trong tuần được lưu");
    assert.ok(r.data.completion && typeof r.data.completion.learnedPct === "number", "ACTIVE 2.0 có completion");
    assert.ok(r.data.chapters.length >= 1);
    assert.ok(r.data.chapters.every((c) => c.deckId != null), JSON.stringify(r.data.chapters));
    assert.ok(r.data.folderId != null, "thiếu folderId");
    assert.ok(r.data.today, "thiếu today");
    assert.ok(Array.isArray(r.data.today.tasks), JSON.stringify(r.data.today));
    deckId = r.data.chapters[0].deckId;
});

await section("bộ thẻ của chương tồn tại", async () => {
    const r = await api("GET", `/decks/${deckId}`);
    assert.equal(r.status, 200, r.text);
});

// ---- Lộ trình 2.0 (B7): phiên học, chấm có reactionMs, cân lại lịch, kiểm tra chương, hoàn thành, tổng quan, học gì tiếp, bổ khuyết
let sessionCard = null;
let chapterId = null;

await section("phiên hôm nay có thẻ; chấm một thẻ với reactionMs + pathId -> ghi nhật ký", async () => {
    const r = await api("GET", `/learning-paths/${pathId}/session?kind=today&date=${localToday()}`);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.data.kind, "today");
    assert.ok(Array.isArray(r.data.cards) && r.data.cards.length >= 1, `phiên rỗng: ${JSON.stringify(r.data.counts)}`);
    assert.ok(r.data.counts && typeof r.data.counts.new === "number", "counts {new, due, catchup, total}");
    sessionCard = r.data.cards[0];
    const g = await api("POST", "/reviews", { cardId: sessionCard.cardId, grade: "good", reactionMs: 1500, pathId });
    assert.ok([200, 201].includes(g.status), `chấm: ${g.status} ${g.text}`);
    // HLR (V38, D32): response luôn có scheduler (sm2 khi ai-service tắt / thẻ mới); recallBefore / hlrBrake chỉ khi HLR chạy
    assert.ok(["sm2", "sm2+hlr"].includes(g.data.scheduler), `scheduler = ${g.data.scheduler}`);
    const recall = await api("GET", `/decks/${encodeURIComponent(sessionCard.deckId)}/recall`);
    assert.ok([200, 503].includes(recall.status), `recall: ${recall.status} ${recall.text}`);
    const bad = await api("POST", "/reviews", { cardId: sessionCard.cardId, grade: "good", reactionMs: 999999, pathId });
    assert.equal(bad.status, 400, "reactionMs ngoài 0..600000 -> 400");
});

await section("cân lại lịch (extend=false) -> 200, lastRebalancedAt", async () => {
    const r = await api("POST", `/learning-paths/${pathId}/rebalance?date=${localToday()}`, { extend: false });
    assert.equal(r.status, 200, r.text);
    assert.ok(r.data.lastRebalancedAt, "thiếu lastRebalancedAt");
    assert.equal(r.data.status, "ACTIVE");
});

await section("kiểm tra chương -> lượt quiz exam (AttemptState)", async () => {
    const p = await api("GET", `/learning-paths/${pathId}?date=${localToday()}`);
    assert.equal(p.status, 200, p.text);
    chapterId = p.data.chapters.find((c) => c.deckId && c.cardCount > 0)?.id;
    assert.ok(chapterId, "không có chương nào còn thẻ");
    const r = await api("POST", `/learning-paths/${pathId}/chapters/${chapterId}/quiz?date=${localToday()}`);
    assert.ok([200, 201].includes(r.status), `quiz chương: ${r.status} ${r.text}`);
    assert.ok(r.data && typeof r.data === "object", "AttemptState rỗng");
});

await section("hoàn thành khi còn thẻ chưa học -> 409", async () => {
    const r = await api("POST", `/learning-paths/${pathId}/complete?date=${localToday()}`);
    assert.equal(r.status, 409, `${r.status} ${r.text}`);
});

await section("today-summary và /insights/next liệt kê lộ trình đang học", async () => {
    let r = await api("GET", `/learning-paths/today-summary?date=${localToday()}`);
    assert.equal(r.status, 200, r.text);
    assert.ok(Array.isArray(r.data) && r.data.some((p) => p.pathId === pathId), JSON.stringify(r.data));
    r = await api("GET", `/insights/next?date=${localToday()}`);
    assert.equal(r.status, 200, r.text);
    assert.ok(Array.isArray(r.data), "insights/next phải là mảng");
    assert.ok(r.data.some((n) => n.kind === "path_today" || n.kind === "path_catchup" || String(n.to ?? "").includes(pathId)), `không thấy lộ trình trong "học gì tiếp": ${JSON.stringify(r.data)}`);
});

await section("lộ trình bổ khuyết: chưa đủ thẻ yếu -> 409 (đủ thì 201 và xoá được)", async () => {
    const r = await api("POST", `/learning-paths/remedial?date=${localToday()}`, { days: 3, groupBy: "level" });
    assert.ok([201, 409].includes(r.status), `${r.status} ${r.text}`);
    if (r.status === 409) assert.ok(/thẻ yếu/.test(r.data?.message ?? ""), `409 phải nói rõ thiếu thẻ yếu: ${r.text}`);
    if (r.status === 201) {
        assert.equal(r.data.status, "ACTIVE");
        assert.equal((await api("DELETE", `/learning-paths/${r.data.id}`)).status, 204);
    }
});

await section("dọn: xoá lộ trình, bộ thẻ còn nguyên", async () => {
    assert.equal((await api("DELETE", `/learning-paths/${pathId}`)).status, 204);
    assert.equal((await api("GET", `/decks/${deckId}`)).status, 200);
});

if (failures.length) {
    console.log(`\n${failures.length} section lỗi: ${failures.join(", ")}`);
    process.exit(1);
}
console.log("smoke-learning-path: tất cả section ok");
